// The coverage probe exists to separate LTA's gaps from our own: resolveStations
// drops any code it can't place on the map, and that loss used to be invisible.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceCoverage } from "../api/_lib/coverage.js";
import { seriesFromForecast, levelsFromRealtime } from "../api/_lib/crowd.js";

const realtimeRows = [
  { line: "NSL", value: { value: [{ Station: "NS13", CrowdLevel: "l" }, { Station: "NS17", CrowdLevel: "h" }] } },
  { line: "EWL", value: { value: [{ Station: "EW14", CrowdLevel: "m" }] } },
];
const forecastRows = [
  { line: "NSL", value: { value: [{ Stations: [
    { Station: "NS13", Interval: [{ Start: "2026-09-16T08:00:00+08:00", CrowdLevel: "l" }] },
    { Station: "NS16", Interval: [{ Start: "2026-09-16T08:00:00+08:00", CrowdLevel: "h" }] },
  ] }] } },
];

test("the report separates what LTA published from what we could place", () => {
  const report = reduceCoverage({ realtimeRows, forecastRows, resolvedCodes: ["NS13", "EW14"] });
  assert.equal(report.stations, 4, "NS13, NS17, EW14, NS16");
  assert.equal(report.located, 2);
  assert.equal(report.droppedByUs, 2);
  assert.equal(report.linesAnswering, 2);

  const nsl = report.lines.find((l) => l.line === "NSL");
  assert.equal(nsl.realtime, 2);
  assert.equal(nsl.forecast, 2);
  assert.deepEqual(nsl.dropped, ["NS16", "NS17"]);
  // A station with a live level but no forecast can't answer "will it be busy
  // when I get there" — worth naming separately.
  assert.deepEqual(nsl.realtimeOnly, ["NS17"]);
  assert.deepEqual(nsl.forecastOnly, ["NS16"]);
});

test("a fully located network reports no losses of ours", () => {
  const report = reduceCoverage({ realtimeRows, forecastRows, resolvedCodes: ["NS13", "NS16", "NS17", "EW14"] });
  assert.equal(report.droppedByUs, 0);
  assert.equal(report.located, report.stations);
});

test("crowd rows reduce to levels and per-station series", () => {
  const levels = levelsFromRealtime(realtimeRows);
  assert.equal(levels.get("NS17"), "busy");
  assert.equal(levels.get("EW14"), "moderate");

  const { byCode, slots } = seriesFromForecast(forecastRows);
  assert.deepEqual(slots, ["2026-09-16T08:00:00+08:00"]);
  assert.equal(byCode.get("NS16")["2026-09-16T08:00:00+08:00"], "busy");
});
