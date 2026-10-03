// Every bus due at each of a few stops, in one round trip: the nearby-stops
// tray asks for all its stops together and re-asks every 30 s while open.
//
//   GET /api/stop-arrivals?codes=28031,28039
//   → { stops: { "28031": { services: [{ service, operator, buses: [...] }], reason, stopCode } }, at }
import { serveRecorded } from "../_lib/demo.js";
import { recordedArrivals } from "../_lib/recorded/index.js";
import { parseStopArrivals, stopArrivals } from "../_lib/arrivals.js";

const MAX_STOPS = 10;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const codes = [...new Set(String(q.codes || "").split(",").map((code) => code.trim()).filter(Boolean))].slice(0, MAX_STOPS);
  if (!codes.length) {
    res.status(400).json({ error: "Missing codes (comma-separated bus stop codes)" });
    return;
  }

  const results = await Promise.all(codes.map(async (code) => [code, await stopArrivals(code)]));
  const stops = Object.fromEntries(results);

  // Every stop failing upstream is a dead connection, not a quiet night.
  const allFailed = results.every(([, value]) => value.reason === "upstream" || value.reason === "no-key");
  if (allFailed) {
    const recorded = Object.fromEntries(codes.map((code) => [code, { ...parseStopArrivals(recordedArrivals()), stopCode: code }]));
    if (serveRecorded(res, { stops: recorded, at: new Date().toISOString() })) return;
  }
  res.status(200).json({ stops, at: new Date().toISOString() });
}
