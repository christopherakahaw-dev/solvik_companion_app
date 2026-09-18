// The commute outlook: a join between a journey and LTA's published forecast.
// These tests pin the two things that make it honest — that a level is read at
// the interval you would actually be at that station, and that a station with
// no published forecast reads as uncovered rather than as quiet.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commuteOutlook, stationsAlong, worstAlong, betterDeparture, slotAt, outlookCodes, clockOf,
} from "../src/lib/outlook.js";

const DAY = "2026-09-16T";
const slot = (hhmm) => `${DAY}${hhmm}:00+08:00`;
const SLOTS = ["07:30", "08:00", "08:30", "09:00", "09:30"].map(slot);

const trip = {
  mins: 40,
  steps: [
    { mode: "WALK", secs: 300 },
    { mode: "SUBWAY", label: "NSL", secs: 1500, boardStopCode: "NS13", from: "Yishun", alightStopCode: "NS17", alight: "Bishan" },
    { mode: "BUS", label: "BUS 410", service: "410", secs: 480, boardStopCode: "53061", from: "Bishan Stn Exit C", alightStopCode: "53069", alight: "Blk 511" },
    { mode: "WALK", secs: 180 },
  ],
};

// Quiet at 08:00, crowded at 08:30 — the difference the whole feature rests on.
const series = {
  NS13: { [slot("07:30")]: "light", [slot("08:00")]: "light", [slot("08:30")]: "moderate" },
  NS17: { [slot("07:30")]: "light", [slot("08:00")]: "moderate", [slot("08:30")]: "busy", [slot("09:00")]: "moderate" },
};

const at = (hhmm) => new Date(slot(hhmm));

test("only rail stations count — bus stops are not a forecast gap", () => {
  const stations = stationsAlong(trip);
  assert.deepEqual(stations.map((s) => s.code), ["NS13", "NS17"]);
  // Reached 5 min in (the walk) and 30 min in (walk + the rail leg).
  assert.equal(stations[0].atSecs, 300);
  assert.equal(stations[1].atSecs, 300 + 1500);
  assert.deepEqual(outlookCodes([trip]), ["NS13", "NS17"]);
});

test("the level read is the one for when you would be standing there", () => {
  // The rail leg ends 30 minutes in, so leaving at 07:50 reaches Bishan at
  // 08:20 — inside the 08:00 interval, where it is only moderate.
  const early = worstAlong({ itinerary: trip, series, slots: SLOTS, departAt: at("07:50") });
  assert.equal(early.worst.code, "NS17");
  assert.equal(early.worst.level, "moderate");

  // Twenty minutes later and the same station is read in the 08:30 interval.
  const later = worstAlong({ itinerary: trip, series, slots: SLOTS, departAt: at("08:10") });
  assert.equal(later.worst.level, "busy");
});

test("an uncovered station is uncovered, never quiet", () => {
  const thin = { NS13: series.NS13 }; // nothing published for Bishan
  const out = commuteOutlook({ itinerary: trip, series: thin, slots: SLOTS, leaveAt: 8 * 60, now: at("07:30") });
  assert.deepEqual(out.coverage.uncovered, ["NS17"]);
  assert.equal(out.coverage.covered, 1);
  assert.equal(out.coverage.complete, false);
  assert.equal(out.worst.code, "NS13", "the busiest of what is actually known");

  const blind = commuteOutlook({ itinerary: trip, series: {}, slots: SLOTS, leaveAt: 8 * 60, now: at("07:30") });
  assert.equal(blind.coverage.none, true);
  assert.equal(blind.worst, null, "no data is not the same as no crowding");
});

test("leave-by comes from the arrive-by time, the journey and a buffer", () => {
  const out = commuteOutlook({ itinerary: trip, series, slots: SLOTS, arriveBy: 9 * 60, now: at("07:30") });
  assert.equal(out.basis, "arrive-by");
  // 09:00 arrival − 40 min journey − 5 min buffer.
  assert.equal(out.departLabel, "08:15");
  assert.equal(out.arriveLabel, "08:55");
});

test("without an arrive-by, the saved leave time still drives it", () => {
  const out = commuteOutlook({ itinerary: trip, series, slots: SLOTS, leaveAt: 8 * 60, now: at("07:30") });
  assert.equal(out.basis, "leave-at");
  assert.equal(out.departLabel, "08:00");
  assert.equal(out.arriveLabel, "08:40");
  assert.equal(out.departIn, 30);
});

test("a shift is offered only when it lands you somewhere quieter", () => {
  const busy = betterDeparture({ itinerary: trip, series, slots: SLOTS, departAt: at("08:10") });
  assert.equal(busy.shiftMins, -20, "leaving earlier drops Bishan from busy to moderate");

  // Already in the quietest interval on offer: nothing to suggest.
  const calm = betterDeparture({ itinerary: trip, series: { NS13: series.NS13 }, slots: SLOTS, departAt: at("07:30") });
  assert.equal(calm, null);
});

test("the warning is phrased at the feed's own resolution", () => {
  const out = commuteOutlook({ itinerary: trip, series, slots: SLOTS, leaveAt: 8 * 60 + 10, now: at("07:30") });
  assert.equal(out.worst.level, "busy");
  assert.equal(out.worst.fromLabel, "08:30", "the interval's start, not a minute-level guess");
  assert.equal(out.worst.name, "Bishan");
});

test("a commute whose time has passed refers to tomorrow", () => {
  const out = commuteOutlook({ itinerary: trip, series, slots: SLOTS, leaveAt: 7 * 60, now: at("09:00") });
  assert.equal(out.tomorrow, true);
  assert.ok(out.departIn > 0, "and it counts forward to it, not backwards");
});

test("slot lookup picks the interval you are inside, or none at all", () => {
  assert.equal(slotAt(SLOTS, at("08:14")), slot("08:00"));
  assert.equal(slotAt(SLOTS, at("08:30")), slot("08:30"));
  // Outside what LTA published there is no answer. The nearest interval is not
  // a substitute: the forecast is same-day, so a trip tomorrow morning read
  // against tonight's last interval would be invented.
  assert.equal(slotAt(SLOTS, at("06:00")), null);
  assert.equal(slotAt(SLOTS, at("11:00")), null);
  assert.equal(clockOf(8 * 60 + 5), "08:05");
});

test("a trip outside the published day reports no forecast, not a quiet one", () => {
  const out = commuteOutlook({ itinerary: trip, series, slots: SLOTS, leaveAt: 22 * 60, now: at("21:00") });
  assert.equal(out.coverage.none, true);
  assert.equal(out.worst, null);
  assert.equal(out.shift, null);
});
