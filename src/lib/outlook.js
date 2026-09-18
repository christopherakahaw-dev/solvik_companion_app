// What your saved commute looks like today: when to leave, and whether the
// stations you pass through are forecast to be busy at the time you'd be there.
//
// Everything here is a join, not a prediction. LTA publishes the forecast in
// 30-minute intervals per station (`PCDForecast`); this walks the journey's own
// legs to work out which interval you'd be in at each station, and reads it.
// Two rules follow from that:
//
//   * nothing is said at a resolution the feed doesn't have — "busier from
//     08:30", never "in 15 minutes";
//   * a station LTA publishes nothing for is reported as uncovered, not as
//     quiet, so the card can say what it actually knows.

const RANK = { light: 0, moderate: 1, busy: 2 };
const WORD = { light: "Light", moderate: "Moderate", busy: "Busy" };

export const DEFAULT_BUFFER_MINS = 5;

export function clockOf(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

const SLOT_MINS = 30;

// The interval a moment falls in, from the slot list the feed returned.
//
// LTA's forecast is same-day: outside the intervals it published there is no
// answer, and the nearest one is not a substitute. A trip tomorrow morning read
// against the tail of today's forecast would be fiction, so it returns null and
// lets the caller say the honest thing.
export function slotAt(slots, when) {
  if (!slots || !slots.length || !when) return null;
  const t = when.getTime();
  let best = null;
  for (const slot of slots) {
    const start = new Date(slot).getTime();
    if (!isFinite(start) || start > t) continue;
    if (!best || start > new Date(best).getTime()) best = slot;
  }
  if (!best) return null; // before anything was published
  // Past the end of the last interval it has stopped covering us too.
  if (t - new Date(best).getTime() >= SLOT_MINS * 60000) return null;
  return best;
}

export function isRailStep(step) {
  const mode = step && step.mode ? String(step.mode).toUpperCase() : "";
  return !!mode && mode !== "WALK" && mode !== "BUS";
}

// Each rail station on the route, with the minute of the journey you reach it.
// Bus stops are deliberately excluded: the crowd forecast is a rail feed, so
// counting bus stops as "uncovered" would report a gap that was never there.
export function stationsAlong(itinerary) {
  const steps = (itinerary && itinerary.steps) || [];
  const out = [];
  let offsetSecs = 0;
  steps.forEach((step) => {
    const secs = step.secs || 0;
    if (isRailStep(step)) {
      if (step.boardStopCode) {
        out.push({ code: String(step.boardStopCode).toUpperCase(), name: step.from || step.boardStopCode, atSecs: offsetSecs, role: "board", leg: step.label || step.mode });
      }
      if (step.alightStopCode) {
        out.push({ code: String(step.alightStopCode).toUpperCase(), name: step.alight || step.alightStopCode, atSecs: offsetSecs + secs, role: "alight", leg: step.label || step.mode });
      }
    }
    offsetSecs += secs;
  });
  return out;
}

function levelAt(series, slots, code, when) {
  const forStation = series && series[code];
  if (!forStation) return null;
  const slot = slotAt(slots, when);
  const level = slot ? forStation[slot] : null;
  return level ? { level, slot } : null;
}

// The busiest station you'd actually be standing in, at the time you'd be
// standing in it — not the day's peak somewhere you've already passed.
export function worstAlong({ itinerary, series, slots, departAt }) {
  const stations = stationsAlong(itinerary);
  let worst = null;
  const covered = [];
  const uncovered = [];
  stations.forEach((st) => {
    const when = new Date(departAt.getTime() + st.atSecs * 1000);
    const hit = levelAt(series, slots, st.code, when);
    if (!hit) {
      if (!uncovered.includes(st.code)) uncovered.push(st.code);
      return;
    }
    if (!covered.includes(st.code)) covered.push(st.code);
    const entry = { ...st, ...hit, when };
    if (!worst || RANK[entry.level] > RANK[worst.level] || (RANK[entry.level] === RANK[worst.level] && entry.atSecs < worst.atSecs)) {
      worst = entry;
    }
  });
  return { worst, covered, uncovered, stations };
}

function scoreOf({ itinerary, series, slots, departAt }) {
  const { worst, covered } = worstAlong({ itinerary, series, slots, departAt });
  if (!covered.length) return null;
  return { score: worst ? RANK[worst.level] : 0, worst };
}

// Would leaving a little earlier or later put you in a quieter interval?
// Only offered when it actually changes the answer.
// Thirty minutes is one whole interval, and on a long leg it is often the
// smallest shift that can land you in a different one at all.
export function betterDeparture({ itinerary, series, slots, departAt, shifts = [-30, -20, -10, 10, 20, 30] }) {
  const base = scoreOf({ itinerary, series, slots, departAt });
  if (!base || base.score === 0) return null;
  let best = null;
  shifts.forEach((mins) => {
    const when = new Date(departAt.getTime() + mins * 60000);
    const alt = scoreOf({ itinerary, series, slots, departAt: when });
    if (!alt || alt.score >= base.score) return;
    if (!best || alt.score < best.score || Math.abs(mins) < Math.abs(best.shiftMins)) {
      best = { shiftMins: mins, score: alt.score, level: alt.worst ? alt.worst.level : "light", at: when };
    }
  });
  return best;
}

// The whole picture for one commute.
//
//   itinerary  a normalized OneMap itinerary (steps carry station codes)
//   series     { CODE: { ISO: level } } from /api/forecast
//   slots      the interval starts the feed published
//   leaveAt    minutes into the day the commute is set to leave (existing field)
//   arriveBy   minutes into the day you want to be there (optional, newer field)
export function commuteOutlook({ itinerary, series, slots, leaveAt, arriveBy, now = new Date(), bufferMins = DEFAULT_BUFFER_MINS }) {
  const durationMins = itinerary && itinerary.mins ? itinerary.mins : null;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const atMinute = (mins) => new Date(midnight.getTime() + mins * 60000);

  let departMins;
  let basis;
  if (arriveBy != null && durationMins != null) {
    departMins = arriveBy - durationMins - bufferMins;
    basis = "arrive-by";
  } else if (leaveAt != null) {
    departMins = leaveAt;
    basis = "leave-at";
  } else {
    departMins = minutesOfDay(now);
    basis = "now";
  }
  // A commute whose time has passed refers to tomorrow's run of it.
  const nowMins = minutesOfDay(now);
  const tomorrow = departMins < nowMins - 1;
  const departAt = atMinute(departMins + (tomorrow ? 1440 : 0));

  const arriveMins = durationMins != null ? departMins + durationMins : null;
  const { worst, covered, uncovered, stations } = itinerary
    ? worstAlong({ itinerary, series, slots, departAt })
    : { worst: null, covered: [], uncovered: [], stations: [] };

  const shift = itinerary ? betterDeparture({ itinerary, series, slots, departAt }) : null;

  // Is the departure inside the stretch of day LTA actually published for? A
  // trip outside it has no forecast for a different reason than a station that
  // isn't in the feed, and the two deserve different sentences.
  const published = (slots || []).map((iso) => new Date(iso).getTime()).filter(isFinite).sort((a, b) => a - b);
  const insideWindow = published.length
    ? departAt.getTime() >= published[0] && departAt.getTime() < published[published.length - 1] + 30 * 60000
    : false;

  return {
    basis,
    tomorrow,
    departMins,
    departLabel: clockOf(departMins),
    departIn: Math.round((departAt.getTime() - now.getTime()) / 60000),
    arriveMins,
    arriveLabel: arriveMins != null ? clockOf(arriveMins) : null,
    durationMins,
    worst: worst
      ? {
          code: worst.code,
          name: worst.name,
          level: worst.level,
          word: WORD[worst.level],
          leg: worst.leg,
          slot: worst.slot,
          // The interval's own start time, which is the honest resolution.
          fromLabel: clockOf(minutesOfDay(new Date(worst.slot))),
        }
      : null,
    shift: shift
      ? {
          shiftMins: shift.shiftMins,
          label: `${Math.abs(shift.shiftMins)} min ${shift.shiftMins < 0 ? "earlier" : "later"}`,
          level: shift.level,
          word: WORD[shift.level],
          departLabel: clockOf(departMins + shift.shiftMins),
        }
      : null,
    coverage: {
      covered: covered.length,
      total: covered.length + uncovered.length,
      uncovered,
      complete: uncovered.length === 0 && covered.length > 0,
      none: covered.length === 0,
      insideWindow,
      // Nothing to read because of *when*, not because of *where*.
      outsideWindow: covered.length === 0 && !insideWindow,
      published: published.length > 0,
    },
    stationCodes: [...new Set(stations.map((s) => s.code))],
    // Buses carry their own live loading instead (see the route card), so the
    // card can say so rather than leaving them looking unaccounted for.
    busLegs: ((itinerary && itinerary.steps) || [])
      .filter((step) => String(step.mode || "").toUpperCase() === "BUS")
      .map((step) => ({ label: step.label || "Bus", service: step.service || null, stopCode: step.stopCode || step.boardStopCode || null })),
  };
}

// Every station code a set of itineraries touches, for one forecast request.
export function outlookCodes(itineraries) {
  const codes = new Set();
  (itineraries || []).forEach((itin) => stationsAlong(itin).forEach((s) => codes.add(s.code)));
  return [...codes];
}
