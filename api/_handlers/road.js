// How the roads are running, for the bus legs of a journey.
//
// Deliberately not turned into a corrected arrival time: a speed band covers a
// road segment, not a bus's whole run, so this says the roads are slow and why,
// and leaves the timetable caveat standing rather than pretending to replace it.
import { ltaFetch } from "../_lib/lta.js";
import { parseSpeedBands, parseIncidents } from "../../src/lib/roadConditions.js";
import { serveRecorded } from "../_lib/demo.js";
import { recordedSpeedBands, recordedIncidents } from "../_lib/recorded/index.js";

export default async function handler(req, res) {
  const [bands, incidents] = await Promise.allSettled([
    ltaFetch(["v4/TrafficSpeedBands", "TrafficSpeedBandsv2", "TrafficSpeedBands"]),
    ltaFetch(["TrafficIncidents"]),
  ]);

  if (bands.status === "rejected" && incidents.status === "rejected") {
    if (serveRecorded(res, { bands: parseSpeedBands(recordedSpeedBands), incidents: parseIncidents(recordedIncidents) })) return;
    const msg = String((bands.reason && bands.reason.message) || bands.reason || "Road conditions unavailable");
    return res.status(msg.includes("not configured") ? 501 : 502).json({ error: msg });
  }

  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=240");
  res.status(200).json({
    bands: bands.status === "fulfilled" ? parseSpeedBands(bands.value) : [],
    incidents: incidents.status === "fulfilled" ? parseIncidents(incidents.value) : [],
  });
}
