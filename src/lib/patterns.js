// Turning journeys into commutes.
//
// No model and no clustering library: journeys whose two ends are both within a
// few hundred metres group together, and a group becomes a commute when it has
// happened often enough, on consistent days, at a consistent time, recently.
// The bar is deliberately high — a wrong commute means wrong leave-time alerts
// and a card you can't account for — and every promotion carries the evidence
// that justified it, so the app can always say why.

import { metresBetween } from "./geometry.js";

export const GROUP_RADIUS_M = 400;
export const MIN_JOURNEYS = 4;
export const MIN_COMPLETED = 3;
export const MIN_DATES = 2;
export const MAX_SPREAD_MINS = 45;
export const RECENT_MS = 21 * 24 * 60 * 60 * 1000;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const minutesOfDay = (ms) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};
const dayName = (ms) => DAY_NAMES[new Date(ms).getDay()];
const dateKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const isWeekday = (ms) => WEEKDAYS.includes(dayName(ms));

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Median absolute deviation: one late night out shouldn't disqualify a
// commute the way a plain range would.
export function spread(values) {
  if (values.length < 2) return 0;
  const mid = median(values);
  return median(values.map((v) => Math.abs(v - mid)));
}

// A stable name for a pattern, so one you rejected stays rejected as more
// journeys arrive. It is taken from the earliest journey in the group rather
// than a rolling average: rounding a moving centroid would flip the id the
// first time a fix landed on the wrong side of a boundary.
export function signatureOf(group) {
  const round = (ll) => `${ll[0].toFixed(3)},${ll[1].toFixed(3)}`;
  const first = (group.journeys || []).reduce((a, b) => (a && a.at <= b.at ? a : b), null);
  const fromLL = (first && first.fromLL) || group.fromLL;
  const toLL = (first && first.toLL) || group.toLL;
  return `${round(fromLL)}>${round(toLL)}|${group.dayClass}`;
}

// A signature carries its own endpoints, so two of them can be compared as
// places instead of as strings. That matters because the anchor journey a
// signature is taken from eventually ages out of the 90-day window, which
// shifts the string while the commute it describes stays exactly the same.
// Comparing strings there would let a rejected pattern come back, and a
// watched one be added a second time.
export function parseSignature(sig) {
  const m = /^(-?[\d.]+),(-?[\d.]+)>(-?[\d.]+),(-?[\d.]+)\|(\w+)$/.exec(String(sig || ""));
  if (!m) return null;
  return { fromLL: [Number(m[1]), Number(m[2])], toLL: [Number(m[3]), Number(m[4])], dayClass: m[5] };
}

function dayClassOf(days) {
  const list = days || [];
  if (!list.length) return null;
  const weekday = list.some((d) => WEEKDAYS.includes(d));
  const weekend = list.some((d) => !WEEKDAYS.includes(d));
  // A commute spanning both is not one class or the other, so it matches either.
  return weekday && weekend ? null : weekday ? "weekday" : "weekend";
}

// The endpoints of a signature, a group, or a saved commute — including one the
// user has edited, which keeps its places but loses the signature it was born
// with.
export function endpointsOf(value) {
  if (!value) return null;
  if (typeof value === "string") return parseSignature(value);
  if (value.fromLL && value.toLL) return { fromLL: value.fromLL, toLL: value.toLL, dayClass: value.dayClass || null };
  const fromLL = value.fromPlace && value.fromPlace.ll;
  const toLL = value.toPlace && value.toPlace.ll;
  if (fromLL && toLL) {
    return { fromLL, toLL, dayClass: (value.evidence && value.evidence.dayClass) || dayClassOf(value.days) };
  }
  return value.signature ? parseSignature(value.signature) : null;
}

// The same trip, by the same rule that groups journeys in the first place. An
// unknown day class matches either, because a commute the user typed in by hand
// is still the trip we would otherwise be about to learn.
export function sameRoute(a, b, radiusM = GROUP_RADIUS_M) {
  const x = endpointsOf(a);
  const y = endpointsOf(b);
  if (!x || !y) return false;
  if (x.dayClass && y.dayClass && x.dayClass !== y.dayClass) return false;
  return metresBetween(x.fromLL, y.fromLL) <= radiusM && metresBetween(x.toLL, y.toLL) <= radiusM;
}

export function groupJourneys(journeys, radiusM = GROUP_RADIUS_M) {
  const groups = [];
  (journeys || [])
    .filter((j) => j && j.fromLL && j.toLL)
    .forEach((journey) => {
      const dayClass = isWeekday(journey.at) ? "weekday" : "weekend";
      const hit = groups.find(
        (g) =>
          g.dayClass === dayClass &&
          metresBetween(g.fromLL, journey.fromLL) <= radiusM &&
          metresBetween(g.toLL, journey.toLL) <= radiusM
      );
      if (hit) {
        hit.journeys.push(journey);
        return;
      }
      groups.push({ fromLL: journey.fromLL, toLL: journey.toLL, dayClass, journeys: [journey] });
    });
  return groups.map((g) => summarise(g));
}

function summarise(group) {
  const times = group.journeys.map((j) => minutesOfDay(j.at));
  const dates = new Set(group.journeys.map((j) => dateKey(j.at)));
  const days = [...new Set(group.journeys.map((j) => dayName(j.at)))];
  const completed = group.journeys.filter((j) => j.completed).length;
  const lastSeen = Math.max(...group.journeys.map((j) => j.at));
  const summary = {
    ...group,
    fromName: group.journeys.find((j) => j.fromName)?.fromName || null,
    toName: group.journeys.find((j) => j.toName)?.toName || "",
    mode: commonest(group.journeys.map((j) => j.mode).filter(Boolean)) || "Comfort",
    legs: [...new Set(group.journeys.flatMap((j) => j.legs || []))],
    count: group.journeys.length,
    completed,
    dates: dates.size,
    // The days it actually happened on. Groups are already split weekday from
    // weekend, so a Saturday trip can't land in a weekday commute; and a trip
    // seen on three or more different weekdays is a daily routine rather than
    // a Monday-and-Wednesday one, so it takes the whole working week.
    days: daysFor(days, group.journeys),
    mins: Math.round(median(times) / 5) * 5,
    spreadMins: spread(times),
    lastSeen,
  };
  summary.signature = signatureOf(summary);
  return summary;
}

function daysFor(seen, journeys) {
  const weekdaysSeen = seen.filter((d) => WEEKDAYS.includes(d));
  if (weekdaysSeen.length >= 3) return WEEKDAYS.slice();
  const ordered = [...new Set(seen)].sort((a, b) => DAY_NAMES.indexOf(a) - DAY_NAMES.indexOf(b));
  // A day seen only once, in a group that has other days, is not yet a habit.
  return ordered.length > 1
    ? ordered.filter((d) => journeys.filter((j) => dayName(j.at) === d).length >= 1)
    : ordered;
}

function commonest(values) {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// Is this group solid enough to create a commute from, unasked?
export function isConfident(group, now = Date.now()) {
  if (!group) return false;
  return (
    group.count >= MIN_JOURNEYS &&
    group.completed >= MIN_COMPLETED &&
    group.dates >= MIN_DATES &&
    group.days.length > 0 &&
    group.spreadMins <= MAX_SPREAD_MINS &&
    now - group.lastSeen <= RECENT_MS
  );
}

// The commutes a set of journeys justifies, strongest first, minus anything
// already watched or explicitly rejected.
export function inferCommutes({ journeys, existing = [], rejected = [], now = Date.now() }) {
  return groupJourneys(journeys)
    .filter((g) => isConfident(g, now))
    .filter((g) => !(rejected || []).some((sig) => sameRoute(sig, g)))
    .filter((g) => !(existing || []).some((c) => sameRoute(c, g)))
    .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);
}

// How long a learned commute outlives the trips that justified it. Longer than
// the window that creates one, so a holiday doesn't erase your commute, and
// well inside the 90 days journeys survive, so the evidence is still there to
// judge it by.
export const RETIRE_MS = 35 * 24 * 60 * 60 * 1000;

// The commutes the app inferred that its own evidence no longer supports.
//
// Journeys age out at 90 days but a commute drawn from them used to last
// forever, so a job you left kept its card on Today and kept matching
// disruption alerts to lines you no longer ride. An inference should be no more
// durable than what supports it. Commutes the user created or edited by hand
// are theirs, and are never touched.
export function staleCommutes(commutes, journeys, now = Date.now()) {
  const groups = groupJourneys(journeys);
  return (commutes || []).filter((c) => {
    if (!c || c.source !== "auto") return false;
    const support = groups.filter((g) => sameRoute(g, c));
    const lastSeen = support.length
      ? Math.max(...support.map((g) => g.lastSeen))
      : (c.evidence && c.evidence.lastSeen) || c.addedAt || 0;
    return now - lastSeen > RETIRE_MS;
  });
}

// A pattern as the app's own commute record, carrying its endpoints so it can
// be planned without depending on a saved place that may not exist.
export function commuteFromPattern(group, now = Date.now()) {
  const fromId = `auto-from:${group.signature}`;
  const toId = `auto-to:${group.signature}`;
  return {
    from: fromId,
    to: toId,
    fromPlace: { id: fromId, label: group.fromName || "Where you start", place: group.fromName || "Learned from your trips", ll: group.fromLL },
    toPlace: { id: toId, label: group.toName || "Where you go", place: group.toName || "Learned from your trips", ll: group.toLL },
    days: group.days,
    mins: group.mins,
    mode: group.mode,
    // The lines these trips used, so a disruption can be matched to a commute
    // you actually make without re-planning it first.
    legs: group.legs,
    arriveBy: null,
    source: "auto",
    signature: group.signature,
    addedAt: now,
    evidence: {
      count: group.count,
      completed: group.completed,
      days: group.days,
      lastSeen: group.lastSeen,
      spreadMins: group.spreadMins,
      dayClass: group.dayClass,
    },
  };
}

// "Seen 5 times in the last 2 weeks, most recently Tuesday."
export function evidenceLine(commute, now = Date.now()) {
  const e = commute && commute.evidence;
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e.text) return e.text;
  const days = Math.max(1, Math.round((now - e.lastSeen) / (24 * 60 * 60 * 1000)));
  const when = days <= 1 ? "today" : days < 7 ? `${days} days ago` : days < 14 ? "last week" : `${Math.round(days / 7)} weeks ago`;
  const span = e.dayClass === "weekend" ? "weekends" : (e.days && e.days.length >= 4) ? "most weekdays" : (e.days ? e.days.join(", ") : "regular days");
  return `Seen ${e.count || "several"} times on ${span}${e.lastSeen ? `, most recently ${when}` : ""}.`;
}
