import { nearbyStops } from "../_lib/busStops.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, max-age=60");
  const q = req.body && typeof req.body === "object"
    ? req.body
    : req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "Missing or invalid lat/lng" });
    return;
  }

  const limit = Math.min(12, Math.max(1, Number(q.limit) || 8));
  const radiusM = Math.min(3000, Math.max(100, Number(q.radiusM) || 1500));
  try {
    const stops = await nearbyStops(lat, lng, { limit, radiusM });
    res.status(200).json({ stops, radiusM });
  } catch (err) {
    const message = String(err?.message || err);
    res.status(message.includes("not configured") ? 501 : 502).json({ error: message });
  }
}
