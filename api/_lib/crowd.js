// LTA platform crowd density — the real-time levels and the same-day forecast.
//
// Shared by the map's crowding overlay, the per-station forecast lookup the
// Today tab joins against a commute, and the coverage probe. All three want the
// same two fetches, so they share one cache rather than each paying for it.
import { ltaFetch, crowdLevelFrom, TRAIN_LINES } from "./lta.js";

// DataMall renamed these; try both spellings.
export const REALTIME = ["PCDRealTime", "PlatformCrowdDensityRealTime"];
export const FORECAST = ["PCDForecast", "PlatformCrowdDensityForecast"];

export const PCT = { light: 35, moderate: 65, busy: 92 };

// A missing forecast is unknown, never today's live level relabelled as future.
export function stationsAtForecast(stations, byCode, at) {
  return stations.map((station) => {
    const level = byCode.get(station.code)?.[at] || null;
    return { ...station, level, pct: level ? PCT[level] : null };
  });
}

const REALTIME_TTL_MS = 60_000;
const FORECAST_TTL_MS = 10 * 60_000;

let realtimeCache = null; // { at, levels }
let forecastCache = null; // { at, byCode, slots }

// Every line is asked separately, and one line answering is enough: a feed
// that has dropped a line shouldn't take the whole overlay down with it.
export async function perLine(paths, params, lines = TRAIN_LINES) {
  const results = await Promise.allSettled(
    lines.map(async (line) => ({ line, value: await ltaFetch(paths, { ...params, TrainLine: line }) }))
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  if (!ok.length) {
    const reason = results[0] && results[0].reason;
    throw new Error(reason ? String(reason.message || reason) : "No crowd data");
  }
  return ok.map((r) => r.value);
}

export function levelsFromRealtime(perLineRows) {
  const levels = new Map(); // code -> level
  perLineRows.forEach(({ value }) => {
    (value.value || []).forEach((row) => {
      const level = crowdLevelFrom(row.CrowdLevel);
      if (row.Station && level) levels.set(String(row.Station).toUpperCase(), level);
    });
  });
  return levels;
}

// Forecast rows carry a station's level at 30-minute intervals for the day.
export function seriesFromForecast(perLineRows) {
  const byCode = new Map(); // code -> { ISO -> level }
  const slots = new Set();
  perLineRows.forEach(({ value }) => {
    (value.value || []).forEach((row) => {
      (row.Stations || []).forEach((st) => {
        const code = String(st.Station || "").toUpperCase();
        if (!code) return;
        const series = byCode.get(code) || {};
        (st.Interval || []).forEach((iv) => {
          const level = crowdLevelFrom(iv.CrowdLevel);
          if (!level || !iv.Start) return;
          slots.add(iv.Start);
          series[iv.Start] = level;
        });
        byCode.set(code, series);
      });
    });
  });
  return { byCode, slots: [...slots].sort() };
}

export async function realtimeLevels() {
  if (realtimeCache && Date.now() - realtimeCache.at < REALTIME_TTL_MS) return realtimeCache.levels;
  const levels = levelsFromRealtime(await perLine(REALTIME));
  realtimeCache = { at: Date.now(), levels };
  return levels;
}

export async function forecastIndex() {
  if (forecastCache && Date.now() - forecastCache.at < FORECAST_TTL_MS) return forecastCache;
  const { byCode, slots } = seriesFromForecast(await perLine(FORECAST));
  forecastCache = { at: Date.now(), byCode, slots };
  return forecastCache;
}
