// Live platform crowding per MRT station, plus the same-day forecast that
// drives the time scrubber. Joins LTA's crowd levels (which identify stations
// only by code) with OneMap coordinates.
import { serveRecorded } from "../_lib/demo.js";
import { recordedForecast, recordedStations } from "../_lib/recorded/index.js";
import { realtimeLevels, forecastIndex, PCT, stationsAtForecast } from "../_lib/crowd.js";
import { resolveStations } from "../_lib/stations.js";

let locatedCache = null; // { at, stations } — resolved coordinates, not levels
const LOCATED_TTL_MS = 60_000;

async function stationsWithLevels() {
  const levels = await realtimeLevels();
  if (locatedCache && Date.now() - locatedCache.at < LOCATED_TTL_MS) {
    return locatedCache.stations.map((st) => ({ ...st, level: levels.get(st.code), pct: PCT[levels.get(st.code)] || PCT.light }));
  }
  const located = await resolveStations([...levels.keys()]);
  locatedCache = { at: Date.now(), stations: located };
  return located.map((st) => ({ ...st, level: levels.get(st.code), pct: PCT[levels.get(st.code)] || PCT.light }));
}

export default async function handler(req, res) {
  const q = req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);

  try {
    let stations = await stationsWithLevels();

    let slots = [];
    const at = q.at || null;
    try {
      const fc = await forecastIndex();
      slots = fc.slots;
      if (at) stations = stationsAtForecast(stations, fc.byCode, at);
    } catch {
      // Forecast is optional — real-time alone still renders the map.
      slots = [];
      if (at) stations = stationsAtForecast(stations, new Map(), at);
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json({ at, slots, stations });
  } catch (err) {
    const fc = recordedForecast();
    const at = q.at && fc.slots.includes(q.at) ? q.at : null;
    if (serveRecorded(res, {
      at,
      slots: fc.slots,
      stations: recordedStations.map((st) => {
        const level = (at && fc.series[st.code] && fc.series[st.code][at]) || st.level;
        return { ...st, level, pct: PCT[level] || PCT.light };
      }),
    })) return;
    const msg = String(err && err.message ? err.message : err);
    res.status(msg.includes("not configured") ? 501 : 502).json({ error: msg });
  }
}
