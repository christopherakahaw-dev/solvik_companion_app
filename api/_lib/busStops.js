// The LTA bus stop directory. It changes rarely, so it's fetched once per
// serverless instance and kept in module memory — the same list answers
// "which stop is nearest?" for reports and "which stop code is this?" when a
// routing reply gives a stop we can't otherwise identify.
import { ltaFetchAll } from "./lta.js";

let stopsCache = null; // { stops, at }
let inFlight = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function loadStops() {
  if (stopsCache && Date.now() - stopsCache.at < CACHE_TTL_MS) return stopsCache.stops;
  if (inFlight) return inFlight;
  inFlight = ltaFetchAll("BusStops")
    .then((stops) => {
      stopsCache = { stops, at: Date.now() };
      inFlight = null;
      return stops;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

export function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function nearestStop(lat, lng) {
  const stops = await loadStops();
  let best = null;
  let bestD = Infinity;
  for (const s of stops) {
    const d = distanceMetres(lat, lng, s.Latitude, s.Longitude);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (!best) return null;
  return { code: best.BusStopCode, name: best.Description, road: best.RoadName, lat: best.Latitude, lng: best.Longitude, distanceM: bestD };
}

export async function nearestStopCode(lat, lng) {
  const stop = await nearestStop(lat, lng);
  return stop ? stop.code : null;
}

// DataMall wants a bare five-digit code. Routing replies spell stop ids in
// several ways ("53061", "1:53061", "BUS_STOP:53061"), and a mis-spelled code
// answers with nothing rather than an error — which reads as "no buses".
export function normalizeStopCode(raw) {
  if (raw == null) return null;
  // "53061" plain, "1:53061" and "BUS_STOP:53061" as OTP feeds spell it.
  const tail = String(raw).trim().split(/[:|/_\s]+/).pop() || "";
  if (/^\d{5}$/.test(tail)) return tail;
  const runs = String(raw).match(/(?<!\d)\d{5}(?!\d)/g) || [];
  return runs.length === 1 ? runs[0] : null;
}

// Best effort: the code if it is usable, otherwise the stop the coordinates
// land on. Returns null rather than guessing at more than 120 m away.
export async function resolveStopCode(raw, lat, lng) {
  const direct = normalizeStopCode(raw);
  if (direct) return direct;
  if (!isFinite(lat) || !isFinite(lng)) return null;
  try {
    const near = await nearestStop(lat, lng);
    return near && near.distanceM <= 120 ? near.code : null;
  } catch {
    return null;
  }
}
