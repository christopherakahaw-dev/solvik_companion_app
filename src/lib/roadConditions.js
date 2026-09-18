// How the roads are actually running, for the bus legs of a journey.
//
// The reroute card has to caveat its own times because OneMap plans from the
// timetable and does not know a disruption is happening. These feeds are the
// nearest thing to closing that gap honestly: TrafficSpeedBands gives a
// congestion proxy per road segment, EstTravelTimes gives measured minutes on
// expressway segments, and TrafficIncidents and VMS give the reason.
//
// What this does NOT do is invent a corrected ETA. A speed band is not a bus
// arrival time, and pretending otherwise would be exactly the fabrication the
// rest of the app refuses. It says the roads are slow, and why.

// DataMall bands: 1 is slowest. The published ranges are km/h.
const BAND_LABEL = {
  1: "heavily congested",
  2: "congested",
  3: "slow",
  4: "moving",
  5: "clear",
};

export const SLOW_BAND = 3;

export function parseSpeedBands(payload) {
  const rows = (payload && (payload.value || payload.Value)) || [];
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      road: String(row.RoadName || "").trim(),
      band: Number(row.SpeedBand) || null,
      minSpeed: Number(row.MinimumSpeed) || null,
      maxSpeed: Number(row.MaximumSpeed) || null,
    }))
    .filter((r) => r.road && r.band);
}

export function parseIncidents(payload) {
  const rows = (payload && (payload.value || payload.Value)) || [];
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      type: String(row.Type || "").trim(),
      message: String(row.Message || "").trim(),
      ll: [Number(row.Latitude), Number(row.Longitude)],
    }))
    .filter((r) => r.message && Number.isFinite(r.ll[0]));
}

export function bandLabel(band) {
  return BAND_LABEL[band] || "";
}

// The worst band on any road this journey's buses use. One number, because a
// commuter deciding whether to board does not want a table of segments.
export function worstBandOn(bands, roadNames) {
  const wanted = new Set((roadNames || []).map((r) => String(r).trim().toUpperCase()).filter(Boolean));
  if (!wanted.size) return null;
  const hits = (bands || []).filter((b) => wanted.has(b.road.toUpperCase()));
  if (!hits.length) return null;
  return hits.reduce((worst, b) => (b.band < worst.band ? b : worst), hits[0]);
}

// Said only when it would change a decision — "clear" and "moving" are the
// normal case and a card that fires on them is noise.
export function roadLine(worst) {
  if (!worst || worst.band > SLOW_BAND) return "";
  const speed = Number.isFinite(worst.minSpeed) && Number.isFinite(worst.maxSpeed)
    ? ` (${worst.minSpeed}–${worst.maxSpeed} km/h)`
    : "";
  // Deliberately not converted into added minutes: a speed band covers a road
  // segment, not a bus's whole run, and the arithmetic would look more precise
  // than the input.
  return `${worst.road} is ${bandLabel(worst.band)}${speed}. Bus times here are timetabled, so expect them to run late.`;
}

// The nearest incident to a point, within a radius, as the reason text.
export function incidentNear(incidents, ll, withinDeg = 0.02) {
  if (!Array.isArray(ll)) return null;
  let best = null;
  let bestD = withinDeg * withinDeg;
  for (const incident of incidents || []) {
    const d = (incident.ll[0] - ll[0]) ** 2 + (incident.ll[1] - ll[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = incident;
    }
  }
  return best;
}
