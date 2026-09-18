// Live bus arrivals for every bus leg currently on screen, in one round trip.
// The route sheet polls this while it's open, so the times on the cards tick
// down instead of being frozen at whenever the trip was planned.
import { serveRecorded } from "../_lib/demo.js";
import { recordedArrivals } from "../_lib/recorded/index.js";
import { parseArrivals } from "../_lib/arrivals.js";
import { nextBuses } from "../_lib/arrivals.js";

const MAX_PAIRS = 12;

export default async function handler(req, res) {
  const q = req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const raw = String(q.stops || "").trim();
  if (!raw) {
    res.status(400).json({ error: "Missing stops (stopCode:service,…)" });
    return;
  }

  const pairs = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, MAX_PAIRS)
    .map((part) => {
      const [stop, service] = part.split(":");
      return { key: part, stop: (stop || "").trim(), service: (service || "").trim() };
    });

  const results = await Promise.all(
    pairs.map(async ({ key, stop, service }) => [key, await nextBuses(stop, service)])
  );

  const arrivals = {};
  for (const [key, value] of results) arrivals[key] = value;

  // Every lookup failing for an upstream reason (not "no buses running") is
  // the signature of a dead connection rather than a quiet stop.
  const allFailed = Object.values(arrivals).every((a) => a.reason === "upstream" || a.reason === "no-key");
  if (Object.keys(arrivals).length && allFailed) {
    const recorded = {};
    Object.keys(arrivals).forEach((key) => {
      const service = key.split(":")[1] || null;
      recorded[key] = { ...parseArrivals(recordedArrivals(), "410"), stopCode: key.split(":")[0], service };
    });
    if (serveRecorded(res, { arrivals: recorded, at: new Date().toISOString() })) return;
  }
  res.status(200).json({ arrivals, at: new Date().toISOString() });
}
