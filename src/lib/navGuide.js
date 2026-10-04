// What the navigation screen says about where you are in a trip, beyond the
// current step: the whole journey as one strip, the line you are on, when the
// bus you are walking to actually comes, and when the next stop is yours.
// Pure, so it can be tested without a browser.
import { journeyStrip } from "./journeyStrip.js";
import { lineColour } from "./lineColours.js";
import { arrivalLabel } from "./tripDetail.js";

const WALK_ICONS = new Set(["footprints", "flag", "bike"]);

export function isRide(step) {
  const mode = String(step?.mode || "").toUpperCase();
  return Boolean(mode) && mode !== "WALK" && !WALK_ICONS.has(step.icon);
}

// The card strip, with each leg marked done, now or next. Empty when the steps
// can't be matched one-to-one, rather than highlighting the wrong leg.
export function navStrip(steps, idx, arrived) {
  if (!steps?.length) return [];
  const { strip } = journeyStrip({ steps });
  if (strip.length !== steps.length) return [];
  return strip.map((item, i) => ({ ...item, state: arrived || i < idx ? "done" : i === idx ? "now" : "next" }));
}

// The line you are riding, in its own colours, the way the platform signs show it.
export function rideBadge(step) {
  if (!isRide(step)) return null;
  const bus = String(step.mode).toUpperCase() === "BUS";
  const text = bus ? String(step.service || step.label || "").replace(/^BUS\s*/i, "") : String(step.label || "");
  if (!text) return null;
  const { bg, fg } = lineColour(bus ? `BUS ${text}` : text, step.mode);
  return { text, bg, fg, icon: bus ? "bus" : "train-front" };
}

// The stop to get off at, once it is the next one. `stopsLeft` counts the stop
// you alight at, so 1 means it is next.
export function alightNext(step, stopsLeft, arrived) {
  if (arrived || !isRide(step) || !step.stops?.length || stopsLeft !== 1) return null;
  return step.alight || step.stops[step.stops.length - 1];
}

// Walking to a bus stop: when that bus actually comes, from the live poll
// (keyed "<stopCode>:<service>") or whatever the planner fetched.
export function nextBusLine(steps, idx, arrivals) {
  const cur = steps?.[idx], next = steps?.[idx + 1];
  if (!cur || isRide(cur) || !next || String(next.mode).toUpperCase() !== "BUS" || !next.service) return null;
  const key = next.stopCode ? `${next.stopCode}:${next.service}` : null;
  const live = (key && arrivals && arrivals[key]) || next.arrivals || null;
  if (!live) return null;
  const label = arrivalLabel(live, next.service);
  if (!label.text) return null;
  return { text: `Bus ${next.service} · ${label.text.replace(/^Next: /, "")}`, live: label.live, soon: label.tone === "accent" };
}

// "Board BUS 858 toward Yishun Int" beside a badge that already says 858 reads
// as "Toward Yishun Int"; anything else is left as the planner wrote it.
export function rideTitle(step) {
  const badge = rideBadge(step);
  const match = badge && String(step.title || "").match(/^Board .+? (toward .+)$/i);
  return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : null;
}
