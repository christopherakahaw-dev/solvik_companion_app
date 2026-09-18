// Bus arrivals and the route-card breakdown, over recorded shapes. The point
// of most of these is the failure cases: an empty answer must arrive with a
// reason attached, because a blank where a time should be is what sent us
// looking for this in the first place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseArrivals } from "../api/_lib/arrivals.js";
import { normalizeStopCode } from "../api/_lib/busStops.js";
import { normalizeItinerary } from "../api/_lib/itinerary.js";
import { detailRows, arrivalKeys, stopSummary, distanceLabel, arrivalLabel } from "../src/lib/tripDetail.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/onemap-pt-route.json", import.meta.url)));
const trip = normalizeItinerary(fixture.plan.itineraries[0], "Bishan Park");
const inMins = (m) => new Date(Date.now() + m * 60000).toISOString();

test("three buses come back in order, with load and accessibility", () => {
  const out = parseArrivals(
    {
      Services: [
        {
          ServiceNo: "410",
          NextBus: { EstimatedArrival: inMins(3), Load: "SEA", Feature: "WAB", Monitored: 1 },
          NextBus2: { EstimatedArrival: inMins(11), Load: "SDA", Monitored: 1 },
          NextBus3: { EstimatedArrival: inMins(19), Load: "LSD", Monitored: 0 },
        },
      ],
    },
    "410"
  );
  assert.equal(out.reason, null);
  assert.deepEqual(out.buses.map((b) => b.etaMins), [3, 11, 19]);
  assert.deepEqual(out.buses.map((b) => b.load), ["light", "moderate", "busy"]);
  assert.equal(out.buses[0].accessible, true);
  assert.equal(out.buses[2].monitored, false, "Monitored: 0 is a timetable estimate, not a sighting");
});

test("a gap in the sequence is skipped rather than counted as an arrival", () => {
  const out = parseArrivals(
    { Services: [{ ServiceNo: "410", NextBus: { EstimatedArrival: inMins(4) }, NextBus2: { EstimatedArrival: "" }, NextBus3: {} }] },
    "410"
  );
  assert.equal(out.buses.length, 1);
  assert.equal(out.reason, null);
});

test("an empty answer says which kind of empty it is", () => {
  assert.equal(parseArrivals({ Services: [] }, "410").reason, "none-running");
  assert.equal(parseArrivals({ Services: [{ ServiceNo: "169", NextBus: { EstimatedArrival: inMins(2) } }] }, "410").reason, "not-serving");
  assert.equal(parseArrivals({ Services: [{ ServiceNo: "410" }] }, "410").reason, "none-running");
});

test("stop codes are recognised however the routing reply spells them", () => {
  assert.equal(normalizeStopCode("53061"), "53061");
  assert.equal(normalizeStopCode("1:53061"), "53061");
  assert.equal(normalizeStopCode("BUS_STOP:53061"), "53061");
  // A rail station code is not a bus stop, and must not be sent as one.
  assert.equal(normalizeStopCode("NS13"), null);
  assert.equal(normalizeStopCode(null), null);
});

test("a real itinerary becomes a step-by-step breakdown", () => {
  const rows = detailRows(trip, {});
  assert.equal(rows.length, 5);

  assert.equal(rows[0].kind, "walk");
  assert.match(rows[0].meta, /4 min on foot · 311 m/);

  assert.equal(rows[1].kind, "rail");
  assert.equal(rows[1].title, "NSL to Bishan");
  assert.match(rows[1].meta, /^4 stops · /);
  assert.equal(rows[1].board, "Board at Yishun");
  assert.equal(rows[1].alight, "Alight at Bishan");
  assert.deepEqual(rows[1].stops, ["Khatib", "Yio Chu Kang", "Ang Mo Kio", "Bishan"]);

  assert.equal(rows[2].kind, "transfer");
  assert.equal(rows[2].title, "Change at Bishan Stn Exit C");
  assert.equal(rows[3].kind, "bus");
  assert.equal(rows[3].title, "BUS 410 to Blk 511");

  assert.equal(rows[4].kind, "walk");
  assert.match(rows[4].title, /Walk to Bishan Park/);
});

test("live arrivals reach the bus row, keyed by stop and service", () => {
  const withCode = { ...trip, steps: trip.steps.map((st) => (st.service === "410" ? { ...st, stopCode: "53061" } : st)) };
  assert.deepEqual(arrivalKeys([withCode]), ["53061:410"]);

  const rows = detailRows(withCode, {
    "53061:410": { buses: [{ etaMins: 3, load: "light", monitored: true }, { etaMins: 11, load: "moderate", monitored: true }], reason: null },
  });
  const bus = rows.find((row) => row.kind === "bus");
  assert.equal(bus.arrival.text, "Next: 3, 11 min");
  assert.equal(bus.arrival.load, "light");
});

test("no arrivals reads as a sentence, never as a blank", () => {
  assert.equal(arrivalLabel({ buses: [], reason: "none-running" }, "410").text, "No 410 arrivals right now");
  assert.equal(arrivalLabel({ buses: [], reason: "no-key" }, "410").text, "Arrival times need an LTA DataMall key");
  assert.equal(arrivalLabel({ buses: [], reason: "unknown-stop" }, "410").text, "Arrival times unavailable for this stop");
  assert.equal(arrivalLabel({ buses: [{ etaMins: 0, load: "light" }] }, "410").text, "Next: now");
  // Rail has no arrival feed at all; the row says so rather than sitting empty.
  const rail = detailRows(trip, {})[1];
  assert.equal(rail.arrival.text, "Trains every few minutes");
});

test("long stop lists collapse in the middle, keeping both ends", () => {
  const stops = ["A", "B", "C", "D", "E", "F", "G", "H"];
  assert.deepEqual(stopSummary(stops), ["A", "B", "+5 more", "H"]);
  assert.deepEqual(stopSummary(["A", "B"]), ["A", "B"]);
  assert.equal(distanceLabel(1450), "1.5 km");
  assert.equal(distanceLabel(311), "311 m");
});
