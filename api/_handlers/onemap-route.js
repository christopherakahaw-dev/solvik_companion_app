import { oneMapRoute } from "../_lib/onemap.js";

// Proxies OneMap's routing service (walk / drive / cycle / public transport).
// Public-transport routing needs an authenticated token, which is fetched
// server-side so the OneMap credentials never reach the browser.

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const q = req.body && typeof req.body === "object" ? req.body : req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const { start, end, routeType = "pt", mode = "TRANSIT", date, time, maxWalkDistance, numItineraries } = q;

  if (!start || !end) {
    res.status(400).json({ error: "Missing start or end (lat,lng)" });
    return;
  }

  try {
    const data = await oneMapRoute({
      start,
      end,
      routeType,
      mode,
      date,
      time,
      ...(maxWalkDistance ? { maxWalkDistance } : {}),
      ...(numItineraries ? { numItineraries } : {}),
    });
    res.status(200).json(data);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    res.status(msg.includes("credentials") ? 501 : 502).json({ error: msg });
  }
}
