// LTA's alerts name stations by code ("NS13"), which only a rail enthusiast can
// read. The server already keeps a code → name directory for placing crowding
// circles; the same file turns codes into names a commuter recognises.
import directory from "../../shared/stations.json" with { type: "json" };

// The directory stores OneMap's upper-case names ("CHOA CHU KANG").
function titleCase(name) {
  return String(name)
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (_, before, letter) => before + letter.toUpperCase());
}

// A code with no entry is shown as the code: better than inventing a name.
export function stationName(code) {
  const key = String(code || "").trim().toUpperCase();
  const entry = directory[key];
  return entry && entry.name ? titleCase(entry.name) : key;
}

// LTA's Direction is "Both" or the terminus trains are heading to.
export function affectedDirection(direction) {
  const value = String(direction || "").trim();
  if (!value) return "service affected";
  if (/^both$/i.test(value)) return "both directions affected";
  return `trains towards ${value} affected`;
}

// "Between Yishun and Bishan. 5 stations: Yishun, Khatib, …"
export function describeAffectedSegment(segment = {}) {
  const codes = String(segment.Stations || "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  const names = [...new Set(codes.map(stationName))];
  return [
    segment.StartStation && segment.EndStation
      ? `Between ${stationName(segment.StartStation)} and ${stationName(segment.EndStation)}.`
      : "",
    names.length ? `${names.length} station${names.length === 1 ? "" : "s"}: ${names.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
}
