// Dropping the itineraries that still use a broken line.
//
// OneMap's routing API has no banned-routes parameter — it takes a mode, a walk
// distance, a date and an itinerary count, and nothing else. So a reroute is
// done the only way it can be: ask for more options than we need, then discard
// the ones that run through the disruption. Kept pure and separate from the
// endpoint so the matching can be tested against recorded itineraries.
import { canonicalLine, squashLine as squash } from "../../src/lib/lines.js";

export { canonicalLine };


// Does this option ride the named line, or the named bus service?
export function usesLine(option, line) {
  const code = canonicalLine(line);
  const service = code ? null : squash(line);
  if (!code && !service) return false;
  return (option.transitLegs || []).some((leg) => {
    if (code) return canonicalLine(leg.label) === code || canonicalLine(leg.service) === code;
    // A bus service is matched exactly. Containment would let avoiding 51 drop
    // 510, 151 and 51A along with it.
    return squash(leg.service) === service || squash(leg.label) === `BUS${service}`;
  });
}

// Accepts "NSL", "NSL,410", or a list.
export function parseAvoid(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(",");
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
}

export function withoutLines(options, lines) {
  const avoid = parseAvoid(lines);
  if (!avoid.length) return { kept: options, dropped: 0, lines: [] };
  const kept = (options || []).filter((opt) => !avoid.some((line) => usesLine(opt, line)));
  return { kept, dropped: (options || []).length - kept.length, lines: avoid };
}

// Does this journey depend on the named station — somewhere you board, alight
// or change? A station the train merely runs through is not one you are in, and
// counting it would throw away good routes: a lift being out at Bishan is no
// reason to refuse a train that passes Bishan without stopping for you. This is
// the same set stationsAlong() uses for the crowd forecast, for the same reason.
export function usesStation(option, code) {
  const want = squash(code);
  if (!want) return false;
  const codes = [];
  (option.transitLegs || []).forEach((leg) => {
    codes.push(leg.fromStopCode, leg.toStopCode);
  });
  (option.steps || []).forEach((step) => {
    codes.push(step.boardStopCode, step.alightStopCode);
  });
  return codes.some((c) => c && squash(c) === want);
}

// Avoiding a station rather than a whole line. A lift being out at one
// interchange is no reason to write off every train on that line — it is a
// reason to find a way that doesn't go through that station.
export function withoutStations(options, stations) {
  const avoid = parseAvoid(stations);
  if (!avoid.length) return { kept: options, dropped: 0, stations: [] };
  const kept = (options || []).filter((opt) => !avoid.some((code) => usesStation(opt, code)));
  return { kept, dropped: (options || []).length - kept.length, stations: avoid };
}

// Both filters in one pass, for a request that names either or both.
export function withoutAny(options, { lines, stations } = {}) {
  const byLine = withoutLines(options, lines);
  const byStation = withoutStations(byLine.kept, stations);
  const all = [...byLine.lines, ...byStation.stations];
  return {
    kept: byStation.kept,
    dropped: byLine.dropped + byStation.dropped,
    lines: byLine.lines,
    stations: byStation.stations,
    all,
  };
}
