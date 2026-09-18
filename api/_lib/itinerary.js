// Turns OneMap's OTP-shaped routing response into the option cards and
// turn-by-turn steps the UI renders. Kept separate from the endpoint so the
// mapping can be tested against recorded fixtures without any network.
import { decodePolyline } from "./polyline.js";
import { singaporeClock } from "../../src/lib/display.js";

const CROWD_SCORE = { light: 0, moderate: 1, busy: 2 };

export function legLabel(leg) {
  const mode = String(leg.mode || "").toUpperCase();
  const route = String(leg.routeShortName || leg.route || "").trim();
  if (mode === "BUS") return route ? `BUS ${route}` : "BUS";
  if (mode === "WALK") return "WALK";
  if (!route) return mode;
  // NS -> NSL, so the label matches the line badges the design uses.
  return /^[A-Z]{2}$/.test(route) ? `${route}L` : route;
}

export function clockFrom(ms) {
  if (!ms) return "";
  return singaporeClock(ms);
}

function fareOf(itin) {
  const raw = itin.fare ?? (itin.fareProducts && itin.fareProducts[0] && itin.fareProducts[0].amount);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return isFinite(n) ? n : null;
}

// The whole journey as one line, plus where each leg sits inside it. The spans
// line up 1:1 with the steps from stepsOf(), which is what lets the app turn a
// GPS position into "which step, and how long is left on it" — without them,
// progress along the line would have to be read as progress through the clock,
// and a fast rail leg would look like it was taking as long as a short walk.
export function geometryOf(itin) {
  return geometryWithSpans(itin).coords;
}

export function geometryWithSpans(itin) {
  const coords = [];
  const spans = [];
  (itin.legs || []).forEach((leg) => {
    const pts = leg.legGeometry && leg.legGeometry.points ? decodePolyline(leg.legGeometry.points) : [];
    if (pts.length < 2) {
      spans.push(null);
      return;
    }
    const from = coords.length;
    coords.push(...pts);
    spans.push({ from, to: coords.length - 1 });
  });
  return { coords, spans };
}

// Steps for the turn-by-turn pager: walk / board / transfer / arrive, with the
// real stop sequence between board and alight.
export function stepsOf(itin, destName) {
  const legs = itin.legs || [];
  const steps = [];
  legs.forEach((leg, i) => {
    const mode = String(leg.mode || "").toUpperCase();
    const secs = Math.max(30, Math.round((leg.duration || 0) || ((leg.endTime - leg.startTime) / 1000) || 0));
    const toName = (leg.to && leg.to.name) || "";
    const fromName = (leg.from && leg.from.name) || "";

    if (mode === "WALK") {
      const last = i === legs.length - 1;
      const metres = Math.round(leg.distance || 0);
      steps.push({
        legIndex: i,
        mode: "WALK",
        icon: last ? "flag" : "footprints",
        title: last ? `Walk to ${destName || toName}` : `Walk to ${toName}`,
        detail: metres ? `${metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`} on foot` : "Walk",
        toName: last ? destName || toName : toName,
        metres,
        secs,
      });
      return;
    }

    const stops = (leg.intermediateStops || []).map((st) => st.name).filter(Boolean);
    const alight = toName || stops[stops.length - 1] || "";
    const label = legLabel(leg);
    const headsign = leg.headsign || leg.tripHeadsign || alight;
    // The stops you ride: every intermediate stop plus the one you get off at.
    // The boarding stop is where you already are, so it isn't counted.
    const ridden = stops.concat(alight ? [alight] : []);
    const stopPoints = [leg.from, ...(leg.intermediateStops || []), leg.to]
      .filter(Boolean)
      .map((stop) => {
        const ll = [Number(stop.lat ?? stop.latitude), Number(stop.lon ?? stop.lng ?? stop.longitude)];
        return {
          code: stop.stopCode || stop.stopId || null,
          name: stop.name || "",
          ll: ll.every(Number.isFinite) ? ll : null,
        };
      });
    steps.push({
      legIndex: i,
      mode,
      icon: mode === "BUS" ? "bus" : "train-front",
      label,
      title: `Board ${label}${headsign ? ` toward ${headsign}` : ""}`,
      detail: `${ridden.length} stop${ridden.length === 1 ? "" : "s"} · alight at ${alight}`,
      stops: ridden,
      stopCount: ridden.length,
      alight,
      boardStopCode: (leg.from && (leg.from.stopCode || leg.from.stopId)) || null,
      // The crowd feed is keyed by station code, so a leg needs the codes it
      // passes through, not just the names it shows.
      alightStopCode: (leg.to && (leg.to.stopCode || leg.to.stopId)) || null,
      stopCodes: (leg.intermediateStops || []).map((st) => st.stopCode || st.stopId || null).filter(Boolean),
      stopPoints,
      boardLat: (leg.from && (leg.from.lat ?? leg.from.latitude)) ?? null,
      boardLng: (leg.from && (leg.from.lon ?? leg.from.lng ?? leg.from.longitude)) ?? null,
      service: mode === "BUS" ? String(leg.routeShortName || leg.route || "") : null,
      from: fromName,
      secs,
    });
  });
  return steps;
}

export function normalizeItinerary(itin, destName) {
  const allLegs = itin.legs || [];
  if (!allLegs.length) return null;
  const path = geometryWithSpans(itin);
  const legs = allLegs.filter((l) => String(l.mode).toUpperCase() !== "WALK");
  // A walk-only itinerary is OneMap's correct answer for a short trip, not a
  // failure — keep it as a walking option instead of discarding it.
  const walkOnly = legs.length === 0;
  const fare = fareOf(itin);
  const durationSecs = itin.duration || Math.round(((itin.endTime || 0) - (itin.startTime || 0)) / 1000);
  return {
    mins: Math.max(1, Math.round(durationSecs / 60)),
    eta: clockFrom(itin.endTime),
    fare: walkOnly ? "$0.00" : fare == null ? null : `$${fare.toFixed(2)}`,
    fareValue: walkOnly ? 0 : fare,
    walk: `${Math.round((itin.walkTime || 0) / 60)} min`,
    walkSecs: itin.walkTime || 0,
    walkDistance: itin.walkDistance || 0,
    transfers: itin.transfers != null ? itin.transfers : Math.max(0, legs.length - 1),
    walkOnly,
    legs: walkOnly ? [`WALK ${((itin.walkDistance || 0) / 1000).toFixed(1)} km`] : legs.map(legLabel),
    // legIndex ties each transit leg back to its step, so enrichment fetched
    // once (crowding, arrivals) can be written onto both.
    transitLegs: legs.map((leg) => ({
      legIndex: allLegs.indexOf(leg),
      label: legLabel(leg),
      mode: String(leg.mode || "").toUpperCase(),
      service: String(leg.routeShortName || leg.route || ""),
      fromName: (leg.from && leg.from.name) || "",
      fromStopCode: (leg.from && (leg.from.stopCode || leg.from.stopId)) || null,
      toStopCode: (leg.to && (leg.to.stopCode || leg.to.stopId)) || null,
      fromLat: (leg.from && (leg.from.lat ?? leg.from.latitude)) ?? null,
      fromLng: (leg.from && (leg.from.lon ?? leg.from.lng ?? leg.from.longitude)) ?? null,
    })),
    geometry: path.coords,
    legSpans: path.spans,
    steps: stepsOf(itin, destName),
    startTime: itin.startTime || null,
    endTime: itin.endTime || null,
  };
}

export function crowdScoreOf(option) {
  const levels = option.transitLegs.map((l) => l.crowdLevel).filter(Boolean);
  if (!levels.length) return null;
  return levels.reduce((a, l) => a + CROWD_SCORE[l], 0) / levels.length;
}

export function crowdLevelOf(option) {
  const score = crowdScoreOf(option);
  if (score == null) return null;
  return score >= 1.5 ? "busy" : score >= 0.5 ? "moderate" : "light";
}

// A signature for de-duplicating itineraries that differ only by seconds.
export function signature(option) {
  return `${option.legs.join(">")}|${option.mins}`;
}
