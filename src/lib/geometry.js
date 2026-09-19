// Geometry for following a route with the device's real position.
//
// Progress along the line drives both the ETA and which step is showing, so a
// wrong reading is worse than no reading: it makes the time left and the
// station jump around. Three things keep it steady:
//
//   * distances are metres, measured to the nearest point *on* a segment —
//     matching the nearest vertex makes progress hop between sparse points;
//   * matching is confined to a window around the last known progress, so a
//     route that passes near itself can't teleport the reading; and
//   * a position too far off the line reports nothing rather than a guess.

const EARTH_R = 6371008.8;
const DEG = Math.PI / 180;

// Equirectangular approximation — good to a fraction of a percent over the
// distances a single leg covers, and far cheaper than haversine per segment.
export function metresBetween(a, b) {
  const kx = EARTH_R * DEG * Math.cos((((a[0] + b[0]) / 2) * DEG));
  const ky = EARTH_R * DEG;
  return Math.hypot((b[1] - a[1]) * kx, (b[0] - a[0]) * ky);
}

// Initial bearing (azimuth) from coordinate a to coordinate b in degrees clockwise from true north (0–360°).
export function bearingBetween(a, b) {
  if (!a || !b || (a[0] === b[0] && a[1] === b[1])) return 0;
  const lat1 = a[0] * DEG;
  const lat2 = b[0] * DEG;
  const dLng = (b[1] - a[1]) * DEG;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

const metricsCache = new WeakMap();

// Per-segment and cumulative lengths, in metres. Cached per coordinate array:
// the route geometry is a stable snapshot for the length of a trip.
export function pathMetrics(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return { seg: [], cum: [0], total: 0 };
  const hit = metricsCache.get(coords);
  if (hit) return hit;
  const seg = [];
  const cum = [0];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = metresBetween(coords[i], coords[i + 1]);
    seg.push(d);
    total += d;
    cum.push(total);
  }
  const metrics = { seg, cum, total };
  metricsCache.set(coords, metrics);
  return metrics;
}

// Where `alongM` metres into the line falls: segment, position within it, and
// the interpolated coordinate.
export function locateAt(coords, alongM) {
  const { seg, cum, total } = pathMetrics(coords);
  if (!total) return null;
  const d = Math.max(0, Math.min(total, alongM || 0));
  let i = 0;
  while (i < seg.length - 1 && cum[i + 1] <= d) i++;
  const t = seg[i] ? Math.max(0, Math.min(1, (d - cum[i]) / seg[i])) : 0;
  const a = coords[i];
  const b = coords[i + 1];
  return {
    index: i,
    t,
    alongM: d,
    fraction: d / total,
    coord: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  };
}

// Nearest point on segment a→b to p, in a metre-space local to a.
function projectSegment(a, b, p, tLo, tHi) {
  const kx = EARTH_R * DEG * Math.cos(a[0] * DEG);
  const ky = EARTH_R * DEG;
  const bx = (b[1] - a[1]) * kx;
  const by = (b[0] - a[0]) * ky;
  const px = (p[1] - a[1]) * kx;
  const py = (p[0] - a[0]) * ky;
  const len2 = bx * bx + by * by;
  let t = len2 ? (px * bx + py * by) / len2 : 0;
  t = Math.max(tLo, Math.min(tHi, t));
  return { t, offsetM: Math.hypot(px - t * bx, py - t * by) };
}

// Match a position to the route.
//
// options:
//   fromM       metres along the route the traveller was last known to be at
//   backM       how far behind that to still consider (default: all of it)
//   aheadM      how far ahead of that to consider (default: all of it)
//   maxOffsetM  farther than this from the line counts as off-route → null
//
// Returns { alongM, fraction, index, t, offsetM } or null.
export function projectOnPath(coords, point, options = {}) {
  if (!coords || coords.length < 2 || !point || !isFinite(point[0]) || !isFinite(point[1])) return null;
  const { seg, cum, total } = pathMetrics(coords);
  if (!total) return null;

  const maxOffsetM = options.maxOffsetM == null ? 400 : options.maxOffsetM;
  const fromM = Math.max(0, Math.min(total, options.fromM || 0));
  const lo = options.backM == null ? 0 : Math.max(0, fromM - options.backM);
  const hi = options.aheadM == null ? total : Math.min(total, fromM + options.aheadM);

  let best = null;
  for (let i = 0; i < seg.length; i++) {
    const s0 = cum[i];
    const s1 = cum[i + 1];
    if (s1 < lo || s0 > hi) continue;
    // Only the part of this segment inside the window is a candidate.
    const tLo = seg[i] ? Math.max(0, (lo - s0) / seg[i]) : 0;
    const tHi = seg[i] ? Math.min(1, (hi - s0) / seg[i]) : 0;
    if (tHi < tLo) continue;
    const { t, offsetM } = projectSegment(coords[i], coords[i + 1], point, tLo, tHi);
    if (!best || offsetM < best.offsetM) {
      best = { index: i, t, offsetM, alongM: s0 + t * seg[i] };
    }
  }
  if (!best || best.offsetM > maxOffsetM) return null;
  return { ...best, fraction: best.alongM / total };
}

// How far along a polyline a position sits, 0..1 — the simple form, used by
// callers that don't track a previous position.
export function fractionAlong(coords, point, options) {
  const match = projectOnPath(coords, point, options);
  return match ? match.fraction : null;
}
