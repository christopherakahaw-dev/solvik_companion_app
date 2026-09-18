// How much of the network LTA's crowd feed actually covers — and how much of
// what it covers we then lose ourselves.
//
// resolveStations() drops any code it can't match to coordinates through OneMap
// search, silently. That makes our gaps indistinguishable from LTA's, which is
// the wrong way round for deciding whether a feature is buildable. This reports
// both separately, per line.
import { REALTIME, FORECAST, perLine, levelsFromRealtime, seriesFromForecast } from "./crowd.js";
import { resolveStations } from "./stations.js";
import { TRAIN_LINES } from "./lta.js";

export function reduceCoverage({ realtimeRows, forecastRows, resolvedCodes }) {
  const resolved = new Set((resolvedCodes || []).map((c) => String(c).toUpperCase()));
  const lines = [];
  const seen = new Set();

  const byLine = new Map(); // line -> { realtime:Set, forecast:Set }
  const bucket = (line) => {
    if (!byLine.has(line)) byLine.set(line, { realtime: new Set(), forecast: new Set() });
    return byLine.get(line);
  };

  (realtimeRows || []).forEach(({ line, value }) => {
    (value.value || []).forEach((row) => {
      if (!row.Station) return;
      const code = String(row.Station).toUpperCase();
      bucket(line).realtime.add(code);
      seen.add(code);
    });
  });

  (forecastRows || []).forEach(({ line, value }) => {
    (value.value || []).forEach((row) => {
      (row.Stations || []).forEach((st) => {
        if (!st.Station) return;
        const code = String(st.Station).toUpperCase();
        bucket(line).forecast.add(code);
        seen.add(code);
      });
    });
  });

  [...byLine.keys()].sort().forEach((line) => {
    const { realtime, forecast } = byLine.get(line);
    const union = new Set([...realtime, ...forecast]);
    const dropped = [...union].filter((code) => !resolved.has(code)).sort();
    lines.push({
      line,
      realtime: realtime.size,
      forecast: forecast.size,
      // Published by one feed but not the other — a station with a live level
      // and no forecast can't answer "will it be busy when I get there".
      realtimeOnly: [...realtime].filter((c) => !forecast.has(c)).sort(),
      forecastOnly: [...forecast].filter((c) => !realtime.has(c)).sort(),
      located: union.size - dropped.length,
      dropped,
    });
  });

  const totalCodes = seen.size;
  const totalDropped = [...seen].filter((code) => !resolved.has(code)).length;
  return {
    linesAsked: TRAIN_LINES.length,
    linesAnswering: lines.length,
    stations: totalCodes,
    located: totalCodes - totalDropped,
    droppedByUs: totalDropped,
    lines,
  };
}

export async function coverageReport() {
  const [realtimeRows, forecastRows] = await Promise.all([
    perLine(REALTIME).catch(() => []),
    perLine(FORECAST).catch(() => []),
  ]);
  if (!realtimeRows.length && !forecastRows.length) {
    throw new Error("LTA returned no crowd data for any line");
  }
  const codes = new Set([
    ...levelsFromRealtime(realtimeRows).keys(),
    ...seriesFromForecast(forecastRows).byCode.keys(),
  ]);
  const located = await resolveStations([...codes]);
  return reduceCoverage({ realtimeRows, forecastRows, resolvedCodes: located.map((s) => s.code) });
}
