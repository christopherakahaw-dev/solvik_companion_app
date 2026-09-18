// A journey turned into the rows the route card shows: what you do, for how
// long, where you get on and off, how many stops you ride, and when the next
// bus actually leaves.
//
// It is the itinerary's own steps — the same ones turn-by-turn follows — read
// for someone deciding whether to take this route rather than someone already
// on it. Pure and side-effect free so it can be tested without a browser.

import { reasonText } from "./arrivalText.js";

const MAX_STOPS_SHOWN = 6;

export function minutesLabel(secs) {
  if (!secs) return "";
  if (secs < 60) return `${Math.round(secs)} s`;
  return `${Math.round(secs / 60)} min`;
}

export function distanceLabel(metres) {
  if (!metres) return "";
  // Round the tenth of a kilometre explicitly: toFixed(1) on 1.45 gives 1.4.
  return metres >= 1000 ? `${Math.round(metres / 100) / 10} km` : `${Math.round(metres)} m`;
}

// Long stop lists are the ones worth collapsing: the first two and the last
// tell you where you're going, the middle is just reassurance.
export function stopSummary(stops) {
  const list = (stops || []).filter(Boolean);
  if (list.length <= MAX_STOPS_SHOWN) return list;
  return [...list.slice(0, 2), `+${list.length - 3} more`, list[list.length - 1]];
}

export function arrivalLabel(arrivals, service) {
  if (!arrivals) return { text: null, tone: "muted", live: false };
  const buses = arrivals.buses || [];
  if (!buses.length) {
    return { text: reasonText(arrivals.reason, service) || "No arrival times", tone: "muted", live: false };
  }
  const mins = buses.map((b) => (b.etaMins <= 0 ? "now" : `${b.etaMins}`));
  const unit = mins.every((m) => m === "now") ? "" : " min";
  return {
    text: `Next: ${mins.join(", ")}${unit}`,
    tone: buses[0].etaMins <= 2 ? "accent" : "muted",
    live: buses.some((b) => b.monitored),
    load: buses[0].load || null,
    accessible: !!buses[0].accessible,
  };
}

// `arrivals` is the live poll's map, keyed "<stopCode>:<service>"; anything it
// doesn't cover falls back to what the planner already fetched.
export function detailRows(option, arrivals) {
  const steps = (option && option.steps) || [];
  return steps.reduce((rows, step, i) => {
    const mode = step.mode || (step.stops ? "TRANSIT" : "WALK");
    const dur = minutesLabel(step.secs);

    if (mode === "WALK") {
      const dist = distanceLabel(step.metres);
      rows.push({
        kind: "walk",
        icon: step.icon || "footprints",
        title: step.title || "Walk",
        meta: [dur && `${dur} on foot`, dist].filter(Boolean).join(" · "),
        stops: [],
        arrival: null,
      });
      return rows;
    }

    const key = step.stopCode && step.service ? `${step.stopCode}:${step.service}` : null;
    const live = (key && arrivals && arrivals[key]) || step.arrivals || null;
    const isBus = mode === "BUS";
    const count = step.stopCount != null ? step.stopCount : (step.stops || []).length;

    if (i > 0) {
      const previous = steps[i - 1];
      const previousMode = previous.mode || (previous.stops ? "TRANSIT" : "WALK");
      if (previousMode !== "WALK" && step.from) {
        rows.push({
          kind: "transfer",
          icon: "arrow-right-left",
          title: `Change at ${step.from}`,
          meta: "",
          stops: [],
          arrival: null,
        });
      }
    }

    rows.push({
      kind: isBus ? "bus" : "rail",
      icon: step.icon || (isBus ? "bus" : "train-front"),
      title: step.label ? `${step.label}${step.alight ? ` to ${step.alight}` : ""}` : step.title,
      meta: [count ? `${count} stop${count === 1 ? "" : "s"}` : "", dur].filter(Boolean).join(" · "),
      board: step.from ? `Board at ${step.from}` : null,
      alight: step.alight ? `Alight at ${step.alight}` : null,
      stops: stopSummary(step.stops),
      crowdLevel: step.crowdLevel || null,
      // DataMall publishes no train arrival times, so rail says what it knows.
      arrival: isBus
        ? arrivalLabel(live, step.service)
        : { text: "Trains every few minutes", tone: "muted", live: false },
    });
    return rows;
  }, []);
}

// Every "<stopCode>:<service>" pair on screen, for one batched arrivals poll.
export function arrivalKeys(options) {
  const keys = new Set();
  (options || []).forEach((opt) => {
    ((opt && opt.steps) || []).forEach((step) => {
      if (step.mode === "BUS" && step.stopCode && step.service) keys.add(`${step.stopCode}:${step.service}`);
    });
  });
  return [...keys];
}
