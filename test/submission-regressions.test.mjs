import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { addressDetail, durationLabel, forecastSlots } from "../src/lib/display.js";
import { normalizeItinerary } from "../api/_lib/itinerary.js";
import { stationsAtForecast } from "../api/_lib/crowd.js";

test("arrival clocks use Singapore time even on a UTC server", () => {
  const moduleUrl = new URL("../api/_lib/itinerary.js", import.meta.url).href;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", `import {clockFrom} from '${moduleUrl}'; console.log(clockFrom(Date.parse('2026-09-16T16:49:00Z')))`], { env: { ...process.env, TZ: "UTC" } });
  assert.equal(output.toString().trim(), "00:49");
});

test("forecast scrubber separates live Now from future forecast intervals", () => {
  const now = Date.parse("2026-09-17T00:48:00+08:00");
  assert.deepEqual(forecastSlots(["2026-09-17T00:30:00+08:00", "2026-09-17T01:00:00+08:00", "invalid"], now), [null, "2026-09-17T01:00:00+08:00"]);
});

test("address and long-duration labels remain concise", () => {
  assert.equal(addressDetail("413 COMMONWEALTH AVENUE WEST SINGAPORE 120413", "120413"), "413 COMMONWEALTH AVENUE WEST SINGAPORE 120413");
  assert.equal(durationLabel(154 * 60), "2 h 34 min");
});

test("missing transit fare stays unknown instead of becoming free", () => {
  const option = normalizeItinerary({ duration: 600, fare: null, legs: [{ mode: "BUS", duration: 600 }] }, "Destination");
  assert.equal(option.fare, null);
});

test("missing forecast is not replaced by a live crowd reading", () => {
  const stations = [{ code: "NS1", level: "light", pct: 35 }, { code: "NS2", level: "busy", pct: 92 }];
  const result = stationsAtForecast(stations, new Map([["NS1", { later: "moderate" }]]), "later");
  assert.equal(result[0].level, "moderate");
  assert.equal(result[1].level, null);
  assert.equal(result[1].pct, null);
  assert.equal(stations[1].level, "busy");
});
