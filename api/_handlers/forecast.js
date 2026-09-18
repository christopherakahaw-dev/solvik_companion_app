// The same-day crowd forecast for named stations — what the Today tab joins
// against the stations on your own commute.
//
// Stations LTA publishes nothing for come back in `missing` rather than being
// left out: silence and "not busy" must not look the same.
import { serveRecorded } from "../_lib/demo.js";
import { recordedForecast } from "../_lib/recorded/index.js";
import { forecastIndex, realtimeLevels } from "../_lib/crowd.js";

const MAX_CODES = 24;

export default async function handler(req, res) {
  const q = req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const codes = String(q.codes || "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_CODES);

  if (!codes.length) {
    res.status(400).json({ error: "Missing codes (e.g. ?codes=NS13,NS17)" });
    return;
  }

  try {
    const fc = await forecastIndex();
    const now = await realtimeLevels().catch(() => new Map());

    const series = {};
    const live = {};
    const missing = [];
    codes.forEach((code) => {
      const forecast = fc.byCode.get(code);
      if (forecast && Object.keys(forecast).length) series[code] = forecast;
      else missing.push(code);
      const level = now.get(code);
      if (level) live[code] = level;
    });

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ slots: fc.slots, series, live, missing });
  } catch (err) {
    const fallback = recordedForecast();
    const known = codes.filter((c) => fallback.series[c]);
    if (serveRecorded(res, {
      slots: fallback.slots,
      series: Object.fromEntries(known.map((c) => [c, fallback.series[c]])),
      live: {},
      missing: codes.filter((c) => !fallback.series[c]),
    })) return;
    const msg = String(err && err.message ? err.message : err);
    res.status(msg.includes("not configured") ? 501 : 502).json({ error: msg });
  }
}
