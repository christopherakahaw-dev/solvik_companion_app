// The places you go, learned from the trips you took.
//
// A commute is a heavy claim — four journeys, three finished, consistent days,
// a 45-minute spread — and until one is promoted the app knows nothing it can
// protect you with. A *place* is a much lighter claim: you have been here more
// than once, and these are the lines you used to get here. That is enough to
// match a disruption against, and it is true after two trips instead of ten.
//
// Derived, never stored. Like inferCommutes() this runs off solvik:journeys on
// demand, so there is no fourth thing to keep in sync — and "Forget everything",
// which clears the journeys, clears these with them.

import { metresBetween } from "./geometry.js";
import { GROUP_RADIUS_M } from "./patterns.js";

export const MIN_VISITS = 2;
export const MIN_PLACE_DATES = 2;
export const PLACE_RECENT_MS = 21 * 24 * 60 * 60 * 1000;

const dateKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// Grouped by destination alone. Where you set off from varies — home, the
// office, a friend's — but the place you were going is the thing being learned.
export function groupDestinations(journeys, radiusM = GROUP_RADIUS_M) {
  const groups = [];
  (journeys || [])
    .filter((j) => j && Array.isArray(j.toLL))
    .forEach((journey) => {
      const hit = groups.find((g) => metresBetween(g.ll, journey.toLL) <= radiusM);
      if (hit) {
        hit.journeys.push(journey);
        return;
      }
      groups.push({ ll: journey.toLL, journeys: [journey] });
    });
  return groups.map(summarise);
}

function summarise(group) {
  const journeys = group.journeys;
  const dates = new Set(journeys.map((j) => dateKey(j.at)));
  return {
    ll: group.ll,
    name: journeys.find((j) => j.toName)?.toName || "",
    visits: journeys.length,
    dates: dates.size,
    // Only trips actually started say anything about how you travel; a
    // destination merely browsed has no legs to learn from.
    lines: [...new Set(journeys.filter((j) => j.started).flatMap((j) => j.legs || []))].sort(),
    lastSeen: Math.max(...journeys.map((j) => j.at)),
  };
}

// Twice on one afternoon is one outing, not a habit — hence distinct dates.
export function isRegular(place, now = Date.now()) {
  if (!place) return false;
  return place.visits >= MIN_VISITS && place.dates >= MIN_PLACE_DATES && now - place.lastSeen <= PLACE_RECENT_MS;
}

export function learnedPlaces(journeys, now = Date.now()) {
  return groupDestinations(journeys)
    .filter((p) => isRegular(p, now))
    .sort((a, b) => b.visits - a.visits || b.lastSeen - a.lastSeen);
}

// Every line you use to reach somewhere you go regularly.
export function linesForPlaces(places) {
  return [...new Set((places || []).flatMap((p) => p.lines))].map((l) => String(l).toUpperCase());
}
