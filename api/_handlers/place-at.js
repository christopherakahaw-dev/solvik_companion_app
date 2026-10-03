// Names a dropped pin: the nearest building or block, via OneMap's reverse
// geocoder (which needs the server-side token).
//
//   GET /api/place-at?lat=1.3112&lng=103.7701
//   → { place: { name, address, postal } }  or  { place: null } when nothing is near
import { oneMapReverse } from "../_lib/onemap.js";

const IN_SINGAPORE = { lat: [1.13, 1.48], lng: [103.59, 104.1] };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const q = req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  const inside = lat >= IN_SINGAPORE.lat[0] && lat <= IN_SINGAPORE.lat[1] && lng >= IN_SINGAPORE.lng[0] && lng <= IN_SINGAPORE.lng[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inside) {
    res.status(400).json({ error: "lat and lng must be a point in Singapore" });
    return;
  }
  try {
    res.status(200).json({ place: await oneMapReverse(lat, lng) });
  } catch (err) {
    // The pin keeps its coordinates; there is no recorded stand-in for this.
    res.status(502).json({ error: String(err && err.message ? err.message : err) });
  }
}
