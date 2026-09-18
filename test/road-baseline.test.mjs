// Road conditions and the historical baseline.
//
// The line both modules hold: they describe what is measured, and never convert
// it into a corrected arrival time. A speed band covers a road segment, not a
// bus's whole run, and a monthly volume is a comparison rather than a forecast.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpeedBands, parseIncidents, worstBandOn, bandLabel, roadLine, incidentNear, SLOW_BAND } from "../src/lib/roadConditions.js";
import { parseVolumes, volumeAt, peakFor, baselineNote, isHoliday } from "../src/lib/baseline.js";

const bands = parseSpeedBands({ value: [
  { RoadName: "BISHAN ROAD", SpeedBand: 2, MinimumSpeed: 10, MaximumSpeed: 19 },
  { RoadName: "THOMSON ROAD", SpeedBand: 5, MinimumSpeed: 60, MaximumSpeed: 70 },
  { RoadName: "BRADDELL ROAD", SpeedBand: 4, MinimumSpeed: 30, MaximumSpeed: 39 },
] });

test("speed bands are read with their speeds", () => {
  assert.equal(bands.length, 3);
  assert.equal(bands[0].band, 2);
  assert.equal(bandLabel(1), "heavily congested");
  assert.equal(bandLabel(5), "clear");
});

test("rows with no road or no band are dropped", () => {
  assert.equal(parseSpeedBands({ value: [{ RoadName: "", SpeedBand: 2 }, { RoadName: "X" }] }).length, 0);
  assert.deepEqual(parseSpeedBands(null), []);
});

test("the worst band on the roads you use is the one that matters", () => {
  const worst = worstBandOn(bands, ["THOMSON ROAD", "BISHAN ROAD", "BRADDELL ROAD"]);
  assert.equal(worst.road, "BISHAN ROAD", "band 1 is slowest, so the lowest number wins");
  assert.equal(worstBandOn(bands, ["ORCHARD ROAD"]), null);
  assert.equal(worstBandOn(bands, []), null);
});

test("a clear road says nothing at all", () => {
  // A card that fires when traffic is normal trains people to ignore it.
  assert.equal(roadLine(worstBandOn(bands, ["THOMSON ROAD"])), "");
  assert.equal(roadLine(worstBandOn(bands, ["BRADDELL ROAD"])), "", "moving is not worth interrupting for");
  assert.equal(roadLine(null), "");
  assert.ok(SLOW_BAND === 3);
});

test("a slow road says so, and does not convert itself into minutes", () => {
  const line = roadLine(worstBandOn(bands, ["BISHAN ROAD"]));
  assert.match(line, /congested/);
  assert.match(line, /10–19 km\/h/);
  assert.match(line, /timetabled/, "the honest caveat stays");
  assert.doesNotMatch(line, /\+\d+ min|\d+ min longer/, "a speed band is not an arrival time");
});

test("an incident is matched by nearness, or not at all", () => {
  const incidents = parseIncidents({ value: [
    { Type: "Accident", Message: "(17/9) Accident on Bishan Rd", Latitude: 1.3507, Longitude: 103.8481 },
  ] });
  assert.equal(incidentNear(incidents, [1.3509, 103.8485]).type, "Accident");
  assert.equal(incidentNear(incidents, [1.29, 103.85]), null, "across the island is not nearby");
  assert.equal(incidentNear(incidents, null), null);
});

// --- Historical baseline ---

const volumes = parseVolumes([
  { PT_CODE: "NS17", DAY_TYPE: "WEEKDAY", TIME_PER_HOUR: 8, TOTAL_TAP_IN_VOLUME: 12000 },
  { PT_CODE: "NS17", DAY_TYPE: "WEEKDAY", TIME_PER_HOUR: 14, TOTAL_TAP_IN_VOLUME: 3000 },
  { PT_CODE: "NS17", DAY_TYPE: "WEEKENDS/HOLIDAY", TIME_PER_HOUR: 8, TOTAL_TAP_IN_VOLUME: 2000 },
]);
const weekday8am = new Date(2026, 8, 17, 8, 0);
const sunday8am = new Date(2026, 8, 20, 8, 0);

test("volumes are read by station, day type and hour", () => {
  assert.equal(volumeAt(volumes, "NS17", weekday8am), 12000);
  assert.equal(volumeAt(volumes, "NS17", sunday8am), 2000, "a Sunday reads the weekend row");
  assert.equal(volumeAt(volumes, "NS17", new Date(2026, 8, 17, 3, 0)), null, "an hour with no row is unknown, not zero");
  assert.equal(volumeAt(volumes, "XX99", weekday8am), null);
});

test("a station is compared against its own peak, not another station's", () => {
  assert.equal(peakFor(volumes, "NS17"), 12000);
  assert.equal(peakFor(volumes, "XX99"), null);
});

test("crowding on a day that is normally quieter is the interesting case", () => {
  const note = baselineNote({ volumes, code: "NS17", name: "Bishan", at: weekday8am, level: "busy", schoolHoliday: true });
  assert.match(note, /school holidays/);
  assert.match(note, /usually quieter/);
});

test("an ordinary busy morning names its basis rather than claiming a pattern", () => {
  const note = baselineNote({ volumes, code: "NS17", name: "Bishan", at: weekday8am, level: "busy" });
  assert.match(note, /monthly passenger volumes/, "the source is named");
  assert.doesNotMatch(note, /will be|expect|predict/i, "a comparison, never a forecast");
});

test("with no volume for that hour there is nothing to compare, so nothing is said", () => {
  assert.equal(baselineNote({ volumes, code: "NS17", at: new Date(2026, 8, 17, 3, 0), level: "busy" }), "");
  assert.equal(baselineNote({ volumes, code: "NS17", at: weekday8am, level: null }), "");
});

test("public holidays are matched by date", () => {
  assert.equal(isHoliday(["2026-09-17"], Date.UTC(2026, 8, 17, 4)), true);
  assert.equal(isHoliday(["2026-09-18"], Date.UTC(2026, 8, 17, 4)), false);
  assert.equal(isHoliday(null, Date.now()), false);
});
