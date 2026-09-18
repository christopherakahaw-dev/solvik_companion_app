import { serveRecorded } from "../_lib/demo.js";
import { recordedAlerts } from "../_lib/recorded/index.js";

// Generic proxy for LTA DataMall so the AccountKey never reaches the
// browser. Only a fixed set of read-only endpoints can be requested, and the
// path is validated against that allowlist before being forwarded.
const ALLOWED_ENDPOINTS = new Set([
  "v3/BusArrival",
  "BusArrivalv2",
  "PCDRealTime",
  "PCDForecast",
  "v2/FacilitiesMaintenance",
  "FacilitiesMaintenance",
  "BusServices",
  "BusRoutes",
  "BusStops",
  "TrainServiceAlerts",
  "PlatformCrowdDensityRealTime",
  "PlatformCrowdDensityForecast",
  "TrafficIncidents",
  "CarParkAvailability",
  "TaxiAvailability",
  "FaultyTrafficLights",
]);

export default async function handler(req, res) {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) {
    const missingKeyQuery = req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
    if (recordedFor(res, missingKeyQuery.endpoint)) return;
    res.status(501).json({ error: "LTA_ACCOUNT_KEY is not configured on the server." });
    return;
  }

  const q = req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const { endpoint, ...rest } = q;
  if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
    res.status(400).json({ error: "Missing or unsupported endpoint", allowed: Array.from(ALLOWED_ENDPOINTS) });
    return;
  }

  const url = new URL(`https://datamall2.mytransport.sg/ltaodataservice/${endpoint}`);
  for (const [k, v] of Object.entries(rest)) {
    if (v != null) url.searchParams.set(k, v);
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: { AccountKey: key, accept: "application/json" },
    });
    // Read as text first: an HTML or empty error body must not die in the JSON
    // parser and hide the real status.
    const text = await upstream.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!upstream.ok) {
      if (recordedFor(res, endpoint)) return;
      res.status(upstream.status).json({
        error: `LTA DataMall request failed (${upstream.status})`,
        detail: data || text.slice(0, 200),
      });
      return;
    }
    if (data == null) {
      if (recordedFor(res, endpoint)) return;
      res.status(502).json({ error: "LTA DataMall returned a non-JSON response", detail: text.slice(0, 200) });
      return;
    }
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
    res.status(200).json(data);
  } catch (err) {
    if (recordedFor(res, endpoint)) return;
    res.status(502).json({ error: "LTA DataMall request failed", detail: String(err) });
  }
}

// Service alerts are the only endpoint proxied here that a screen reads
// directly; everything else can be empty without the demo losing its thread.
function recordedFor(res, endpoint) {
  const alerts = String(endpoint || "").includes("TrainServiceAlerts");
  return serveRecorded(res, { value: alerts ? recordedAlerts : [] });
}
