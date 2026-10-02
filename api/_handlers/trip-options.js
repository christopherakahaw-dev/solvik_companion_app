// Real journey options for the map sheet. Asks OneMap for itineraries with
// parameters suited to the chosen mode, enriches them with live LTA crowding
// and accessibility, ranks them by what the mode actually promises, and
// returns at most three cards in the shape the UI already renders.
import { serveRecorded } from "../_lib/demo.js";
import { recordedRoute } from "../_lib/recorded/index.js";
import { oneMapRoute } from "../_lib/onemap.js";
import { ltaFetch, crowdLevelFrom } from "../_lib/lta.js";
import { nextBuses } from "../_lib/arrivals.js";
import { resolveStopCode } from "../_lib/busStops.js";
import { normalizeItinerary, crowdLevelOf, crowdScoreOf, signature, clockFrom } from "../_lib/itinerary.js";
import { decodePolyline } from "../_lib/polyline.js";
import { withoutAny, parseAvoid } from "../_lib/avoid.js";

const RAIL_MODES = new Set(["RAIL", "SUBWAY", "TRAIN", "TRAM"]);
const hasTransit = (option) => !option?.walkOnly && (option?.transitLegs || []).length > 0;
const busOnly = (option) => hasTransit(option) && option.transitLegs.every((leg) => leg.mode === "BUS");
const trainOnly = (option) => hasTransit(option) && option.transitLegs.every((leg) => RAIL_MODES.has(leg.mode));

export const ROUTE_MODES = {
  bus: { query: [{ mode: "bus", maxWalkDistance: 1200 }], accept: busOnly, rank: (a, b) => a.mins - b.mins, tag: "Bus" },
  train: { query: [{ mode: "rail", maxWalkDistance: 1200 }], accept: trainOnly, rank: (a, b) => a.mins - b.mins, tag: "Train" },
  transit: { query: [{ mode: "transit", maxWalkDistance: 1200 }], accept: hasTransit, rank: (a, b) => a.transfers - b.transfers || a.mins - b.mins, tag: "Transit" },
  walk: { walk: true, tag: "Walk" },
  cycle: { cycle: true, tag: "Cycle" },
  express: { query: [{ mode: "transit", maxWalkDistance: 1400 }], accept: hasTransit, rank: (a, b) => a.mins - b.mins, tag: "Express" },
  // Legacy ids remain valid for stored commutes and disruption reroutes, but
  // the route sheet now exposes the clearer transport choices above.
  fast: { query: [{ mode: "transit", maxWalkDistance: 1000 }], accept: hasTransit, rank: (a, b) => a.mins - b.mins, tag: "Fastest" },
  budget: { query: [{ mode: "transit", maxWalkDistance: 1000 }, { mode: "bus", maxWalkDistance: 1200 }], accept: hasTransit, rank: (a, b) => (a.fareValue ?? 99) - (b.fareValue ?? 99) || a.mins - b.mins, tag: "Cheapest" },
  quiet: { query: [{ mode: "transit", maxWalkDistance: 1000 }], accept: hasTransit, rank: (a, b) => (crowdScoreOf(a) ?? 9) - (crowdScoreOf(b) ?? 9) || a.mins - b.mins, tag: "Quietest" },
  step: { query: [{ mode: "transit", maxWalkDistance: 800 }], accept: hasTransit, rank: (a, b) => (b.accessibleScore ?? 0) - (a.accessibleScore ?? 0) || a.mins - b.mins, tag: "Step-free" },
  few: { query: [{ mode: "transit", maxWalkDistance: 1200 }], accept: hasTransit, rank: (a, b) => a.transfers - b.transfers || a.mins - b.mins, tag: "Fewest changes" },
  leastWalk: { query: [{ mode: "transit", maxWalkDistance: 500 }], accept: hasTransit, rank: (a, b) => a.walkSecs - b.walkSecs || a.mins - b.mins, tag: "Least walking" },
  bike: { cycle: true, tag: "Bike" },
  // A disruption reroute. Bus-only is asked alongside transit because it is the
  // answer when rail is down, and more itineraries are requested because the
  // filter below throws some away — asking for three and dropping two leaves a
  // card with nothing on it.
  reroute: { query: [{ mode: "transit", maxWalkDistance: 1200 }, { mode: "bus", maxWalkDistance: 1200 }], accept: hasTransit, rank: (a, b) => a.mins - b.mins, tag: "Avoids the disruption", itineraries: 6 },
};

// OneMap often answers a transit request with a single itinerary however many
// are asked for, which left Fastest, Quietest and Step-free re-ranking a list
// of one and showing the same card. Asking the same question a few different
// ways — bus-only, rail-only, a different walking allowance — is what turns up
// the real alternatives. The mode's own accept() and rank() still decide what
// is shown, so a wider net never changes what a mode promises.
const WIDEN_TRANSIT = [{ mode: "bus", maxWalkDistance: 1200 }, { mode: "rail", maxWalkDistance: 1200 }, { mode: "transit", maxWalkDistance: 1600 }];
const WIDEN_SINGLE = { bus: [{ mode: "bus", maxWalkDistance: 600 }], rail: [{ mode: "rail", maxWalkDistance: 1600 }] };

export function queriesFor(spec) {
  const base = spec.query || [];
  if (!base.length) return base;
  const only = base.every((q) => q.mode === base[0].mode) ? base[0].mode : null;
  const extra = only === "bus" || only === "rail" ? WIDEN_SINGLE[only] : WIDEN_TRANSIT;
  // A tight walking cap is the point of Least walking and Step-free; widening
  // it would only fetch routes the ranking then has to push down.
  const cap = Math.min(...base.map((q) => q.maxWalkDistance ?? 1000));
  const limit = cap < 1000 ? cap : Infinity;
  const seen = new Set();
  return [...base, ...extra.map((q) => ({ ...q, maxWalkDistance: Math.min(q.maxWalkDistance, limit) }))]
    .filter((q) => {
      const key = `${q.mode}|${q.maxWalkDistance}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Routes that ride the same trains between the same stations and board and
// leave each bus at the same stops are one choice for the commuter, even when
// OneMap lists them as three because three bus services serve that stretch.
export function familyKey(option) {
  return (option.transitLegs || [])
    .map((leg) => (leg.mode === "BUS" ? `BUS@${leg.fromStopCode || leg.fromName}>${leg.toStopCode || ""}` : `${leg.label}@${leg.fromStopCode || leg.fromName}>${leg.toStopCode || ""}`))
    .join("|");
}

// Keeps the best member of each family by the mode's own ranking, and records
// the other bus services so the card can still say "or bus 24, 858".
export function collapseFamilies(options, rank) {
  const families = new Map();
  options.forEach((option) => {
    const key = familyKey(option);
    if (!key) {
      families.set(Symbol(), [option]);
      return;
    }
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(option);
  });
  return [...families.values()].map((members) => {
    const [best, ...rest] = [...members].sort(rank);
    const bestBuses = new Set(best.transitLegs.filter((l) => l.mode === "BUS").map((l) => l.service));
    const alsoBy = [...new Set(rest.flatMap((o) => o.transitLegs.filter((l) => l.mode === "BUS").map((l) => l.service)))]
      .filter((service) => service && !bestBuses.has(service));
    return alsoBy.length ? { ...best, alsoBy } : best;
  });
}

// A mode that ranks on something other than time (walking, crowding, fare)
// would otherwise put a two-hour bus trip ahead of a one-hour train ride to
// save five minutes on foot. Routes within reach of the fastest are ranked
// first by the mode's own rule; slower ones still appear, after them.
const REACH_FACTOR = 1.5;
const REACH_SLACK_MINS = 15;

export function withinReachFirst(options, rank) {
  const fastest = Math.min(...options.map((o) => o.mins));
  const inReach = (o) => o.mins <= fastest * REACH_FACTOR + REACH_SLACK_MINS;
  return (a, b) => Number(inReach(b)) - Number(inReach(a)) || rank(a, b);
}

// Enrichment costs a bus-arrivals call per bus leg, so only the candidates
// that could plausibly make the top three are enriched.
const ENRICH_LIMIT = 6;

export function optionMatchesMode(option, mode) {
  const spec = ROUTE_MODES[mode];
  if (!spec) return false;
  if (spec.walk) return option?.walkOnly === true;
  if (spec.cycle) return !option?.walkOnly && !(option?.transitLegs || []).length;
  return spec.accept ? spec.accept(option) : true;
}

const REALTIME = ["PCDRealTime", "PlatformCrowdDensityRealTime"];

// Crowd level per rail station code, cached briefly across requests.
let railCrowd = null; // { at, byCode }
async function railCrowdByCode(lines = ["NSL", "EWL", "CCL", "DTL", "NEL", "TEL"]) {
  if (railCrowd && Date.now() - railCrowd.at < 60_000) return railCrowd.byCode;
  const byCode = new Map();
  const settled = await Promise.allSettled(lines.map((line) => ltaFetch(REALTIME, { TrainLine: line })));
  settled.forEach((r) => {
    if (r.status !== "fulfilled") return;
    (r.value.value || []).forEach((row) => {
      const level = crowdLevelFrom(row.CrowdLevel);
      if (row.Station && level) byCode.set(String(row.Station).toUpperCase(), level);
    });
  });
  if (!byCode.size) return null;
  railCrowd = { at: Date.now(), byCode };
  return byCode;
}

// Live arrivals for one bus leg. The stop code a routing reply gives is not
// always the five digits DataMall wants, and a wrong code answers with an empty
// list rather than an error — so it is resolved (by code, else by the leg's own
// coordinates) before asking.
async function busInfo(leg) {
  if (!leg || !leg.service) return null;
  const code = await resolveStopCode(leg.stopCode, leg.lat, leg.lng);
  if (!code) return { buses: [], reason: "unknown-stop", stopCode: null };
  const answer = await nextBuses(code, leg.service);
  const first = answer.buses[0];
  return {
    ...answer,
    crowdLevel: first ? first.load : null,
    accessible: first ? first.accessible : false,
    etaMins: first ? first.etaMins : null,
  };
}

async function enrich(options) {
  const byCode = await railCrowdByCode().catch(() => null);

  await Promise.all(
    options.map(async (opt) => {
      // Each leg's enrichment also lands on the step that renders it, so the
      // card's breakdown can show arrivals and crowding without a second fetch.
      const stepFor = (leg) => (opt.steps || []).find((st) => st.legIndex === leg.legIndex) || null;
      await Promise.all(
        opt.transitLegs.map(async (leg) => {
          const step = stepFor(leg);
          if (leg.mode === "BUS") {
            const info = await busInfo({
              service: leg.service,
              stopCode: leg.fromStopCode,
              lat: leg.fromLat,
              lng: leg.fromLng,
            });
            if (!info) return;
            leg.crowdLevel = info.crowdLevel;
            leg.accessible = info.accessible;
            leg.etaMins = info.etaMins;
            leg.stopCode = info.stopCode;
            if (step) {
              step.stopCode = info.stopCode;
              step.arrivals = { buses: info.buses, reason: info.reason, at: Date.now() };
              step.crowdLevel = info.crowdLevel;
              step.accessible = info.accessible;
            }
            return;
          }
          if (byCode && leg.fromStopCode) {
            const level = byCode.get(String(leg.fromStopCode).toUpperCase());
            if (level) {
              leg.crowdLevel = level;
              if (step) step.crowdLevel = level;
            }
          }
        })
      );
      opt.crowdLevel = crowdLevelOf(opt);
      // Rail is step-free by default in Singapore; buses only when flagged WAB.
      const busLegs = opt.transitLegs.filter((l) => l.mode === "BUS");
      const accessibleBuses = busLegs.filter((l) => l.accessible).length;
      opt.accessibleScore = busLegs.length ? accessibleBuses / busLegs.length : 1;
    })
  );
  return options;
}

function noteFor(opt) {
  if (opt.walkOnly) return "OneMap returned walking only for this departure. Try another departure time or check transit service hours.";
  const bits = [];
  bits.push(opt.transfers === 0 ? "No transfers" : `${opt.transfers} transfer${opt.transfers === 1 ? "" : "s"}`);
  if (opt.walkSecs) bits.push(`${Math.round(opt.walkSecs / 60)} min on foot`);
  const nextBus = opt.transitLegs.find((l) => l.mode === "BUS" && l.etaMins != null);
  if (nextBus) bits.push(`next ${nextBus.service} in ${nextBus.etaMins} min`);
  if (opt.alsoBy && opt.alsoBy.length) bits.push(`or bus ${opt.alsoBy.join(", ")}`);
  return bits.join(" · ");
}

function tagsFor(options, modeTag) {
  const cheapest = options.reduce((a, b) => ((a.fareValue ?? 99) <= (b.fareValue ?? 99) ? a : b), options[0]);
  const fastest = options.reduce((a, b) => (a.mins <= b.mins ? a : b), options[0]);
  return options.map((opt, i) => {
    let tag = i === 0 ? modeTag : opt === fastest ? "Fastest" : opt === cheapest ? "Cheapest" : opt.transfers === 0 ? "Direct" : "Alternative";
    if (opt.walkOnly) tag = "Walking only";
    return { ...opt, tag, tagTone: i === 0 ? "soft" : i === 1 ? "outline" : "neutral" };
  });
}

async function cycleOption(start, end) {
  const data = await oneMapRoute({ start, end, routeType: "cycle" });
  const summary = data.route_summary || {};
  const secs = summary.total_time || 0;
  const metres = summary.total_distance || 0;
  if (!secs) return [];
  const coords = data.route_geometry ? decodePolyline(data.route_geometry) : [];
  return [
    {
      mins: Math.max(1, Math.round(secs / 60)),
      eta: clockFrom(Date.now() + secs * 1000),
      fare: "$0.00",
      fareValue: 0,
      walk: "0 min",
      walkSecs: 0,
      transfers: 0,
      legs: [`CYCLE ${(metres / 1000).toFixed(1)} km`],
      transitLegs: [],
      crowdLevel: null,
      geometry: coords,
      legSpans: coords.length > 1 ? [{ from: 0, to: coords.length - 1 }] : [null],
      steps: [{ icon: "bike", title: "Cycle to your destination", detail: `${(metres / 1000).toFixed(1)} km on the cycling network`, secs }],
      note: `${(metres / 1000).toFixed(1)} km ride · no fare`,
      tag: "Bike",
      tagTone: "soft",
    },
  ];
}

async function walkOption(start, end, destName) {
  const data = await oneMapRoute({ start, end, routeType: "walk" });
  const summary = data.route_summary || {};
  const secs = summary.total_time || 0;
  const metres = summary.total_distance || 0;
  if (!secs) return [];
  const coords = data.route_geometry ? decodePolyline(data.route_geometry) : [];
  return [{
    mins: Math.max(1, Math.round(secs / 60)),
    eta: clockFrom(Date.now() + secs * 1000),
    fare: "$0.00",
    fareValue: 0,
    walk: `${Math.max(1, Math.round(secs / 60))} min`,
    walkSecs: secs,
    walkDistance: metres,
    transfers: 0,
    walkOnly: true,
    legs: [`WALK ${(metres / 1000).toFixed(1)} km`],
    transitLegs: [],
    crowdLevel: null,
    geometry: coords,
    legSpans: coords.length > 1 ? [{ from: 0, to: coords.length - 1 }] : [null],
    steps: [{ legIndex: 0, mode: "WALK", icon: "flag", title: `Walk to ${destName || "your destination"}`, detail: `${(metres / 1000).toFixed(1)} km on foot`, metres, secs }],
    note: `${(metres / 1000).toFixed(1)} km walk · no fare`,
    tag: "Walk",
    tagTone: "soft",
  }];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const q = req.body && typeof req.body === "object" ? req.body : req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const { from, to, mode = "fast", destName = "", date, time, avoid, avoidStations } = q;
  if (!from || !to) {
    res.status(400).json({ error: "Missing from or to (lat,lng)" });
    return;
  }
  const spec = ROUTE_MODES[mode] || ROUTE_MODES.fast;

  try {
    if (spec.cycle) {
      res.status(200).json({ mode, options: await cycleOption(from, to) });
      return;
    }
    if (spec.walk) {
      res.status(200).json({ mode, options: await walkOption(from, to, destName) });
      return;
    }

    const settled = await Promise.allSettled(
      queriesFor(spec).map((params) => oneMapRoute({ start: from, end: to, routeType: "pt", date, time, numItineraries: spec.itineraries ?? 3, ...params }))
    );
    const responses = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
    // Only surface a failure if nothing succeeded — one mode of a two-query
    // search (transit + bus) coming back empty is not itself an error.
    if (!responses.length) {
      const rejection = settled.find((r) => r.status === "rejected");
      if (rejection) throw rejection.reason;
    }
    const itineraries = responses.flatMap((data) => (data.plan && data.plan.itineraries) || []);
    if (!itineraries.length) {
      res.status(200).json({ mode, options: [] });
      return;
    }

    const seen = new Set();
    const normalized = itineraries
      .map((itin) => normalizeItinerary(itin, destName))
      .filter(Boolean)
      .filter((opt) => {
        const sig = signature(opt);
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
      });

    const eligible = spec.accept ? normalized.filter(spec.accept) : normalized;
    const suggestedMode = mode !== "walk" && normalized.length > 0 && eligible.length === 0 && normalized.every((option) => option.walkOnly)
      ? "walk"
      : null;
    if (!eligible.length) {
      res.status(200).json({ mode, options: [], ...(suggestedMode ? { suggestedMode } : {}) });
      return;
    }

    // Filtered before enrich(), so we don't fetch bus arrivals for options we
    // are about to throw away.
    const { kept, dropped, lines, stations, all } = withoutAny(eligible, { lines: avoid, stations: avoidStations });
    const avoided = all.length ? { lines, stations, all, dropped, none: kept.length === 0 } : null;
    if (!kept.length) {
      // An empty list after filtering means "every way still uses the broken
      // line", which is not the same as "there is no route" — and showing a
      // route through the fault would be worse than either.
      res.status(200).json({ mode, options: [], ...(avoided ? { avoided } : {}) });
      return;
    }

    // Before enrichment the crowd-based rankings fall back to journey time,
    // which is the right order in which to spend the arrivals calls.
    const rank = withinReachFirst(kept, spec.rank);
    const candidates = collapseFamilies(kept, spec.rank)
      .sort(rank)
      .slice(0, ENRICH_LIMIT);
    await enrich(candidates);
    const ranked = candidates.sort(rank).slice(0, 3).map((opt) => ({ ...opt, note: noteFor(opt) }));

    res.status(200).json({ mode, options: tagsFor(ranked, spec.tag), ...(avoided ? { avoided } : {}) });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    // OneMap says "no trip possible" with its own error id 404 and HTTP 200;
    // that genuinely means no route. Anything else is a fault worth showing.
    if (err && err.otpErrorId === 404) {
      const named = [...parseAvoid(avoid), ...parseAvoid(avoidStations)];
      res.status(200).json({ mode, options: [], ...(named.length ? { avoided: { lines: parseAvoid(avoid), stations: parseAvoid(avoidStations), all: named, dropped: 0, none: true } } : {}) });
      return;
    }
    // Recorded itineraries go through exactly the same mapping as live ones,
    // so a demo shows the real card, marked as recorded.
    // The recorded fixture is an NSL trip, so it has to face the same filter as
    // a live answer: serving it while claiming to avoid NSL would be the one
    // thing this feature must never do.
    const sample = withoutAny(
      (recordedRoute.plan.itineraries || [])
        .map((itin) => normalizeItinerary(itin, ""))
        .filter(Boolean)
        .filter((option) => !spec.accept || spec.accept(option)),
      { lines: avoid, stations: avoidStations }
    );
    const recorded = sample.kept
      .slice(0, 3)
      .map((opt) => ({ ...opt, recorded: true, tag: "Recorded example", note: "Sample itinerary from a different journey. Preview only; not directions to your destination." }));
    const sampleAvoided = sample.all.length ? { lines: sample.lines, stations: sample.stations, all: sample.all, dropped: sample.dropped, none: recorded.length === 0 } : null;
    if (!spec.cycle && !spec.walk && serveRecorded(res, { mode, options: recorded, ...(sampleAvoided ? { avoided: sampleAvoided } : {}) })) return;
    res.status(msg.includes("not configured") || msg.includes("credentials") ? 501 : 502).json({ error: msg });
  }
}
