// Weather from data.gov.sg. No key, which matters: the submission rules say a
// judge must be able to reproduce anything claimed without paying for it, and
// this is the one live feed in the app that needs no registration at all.
import { parseNowcast, parseOutlook } from "../../src/lib/weather.js";
import { serveRecorded } from "../_lib/demo.js";
import { recordedNowcast, recordedOutlook } from "../_lib/recorded/index.js";

const BASE = "https://api-open.data.gov.sg/v2/real-time/api/";

async function get(path) {
  const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`data.gov.sg ${path} failed (${res.status})`);
  return res.json();
}

export default async function handler(req, res) {
  try {
    // Asked together; one answering is enough, because the nowcast and the
    // outlook serve different questions and either alone is still useful.
    const [now, outlook] = await Promise.allSettled([get("two-hr-forecast"), get("twenty-four-hr-forecast")]);
    if (now.status === "rejected" && outlook.status === "rejected") throw now.reason;

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({
      nowcast: now.status === "fulfilled" ? parseNowcast(now.value) : null,
      outlook: outlook.status === "fulfilled" ? parseOutlook(outlook.value) : null,
    });
  } catch (err) {
    if (serveRecorded(res, { nowcast: parseNowcast(recordedNowcast), outlook: parseOutlook(recordedOutlook()) })) return;
    res.status(502).json({ error: String(err.message || err) });
  }
}
