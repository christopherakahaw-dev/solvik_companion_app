// Resolves the bus stop nearest a coordinate, so a report is filed against a
// real stop. The stop directory itself lives in _lib/busStops.js, shared with
// the arrivals lookup.
import { nearestStop } from "../_lib/busStops.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const q = req.body && typeof req.body === "object" ? req.body : req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!isFinite(lat) || !isFinite(lng)) {
    res.status(400).json({ error: "Missing or invalid lat/lng" });
    return;
  }

  try {
    const best = await nearestStop(lat, lng);
    if (!best) {
      res.status(404).json({ error: "No stops found" });
      return;
    }
    res.status(200).json(best);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    res.status(msg.includes("not configured") ? 501 : 502).json({ error: msg });
  }
}
