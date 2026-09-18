// The two upstream APIs are unreachable from this sandbox, so the mapping
// from their response shapes to what the UI renders is proved here against
// recorded fixtures instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeItinerary, legLabel, stepsOf, crowdLevelOf, clockFrom } from "../api/_lib/itinerary.js";
import { crowdLevelFrom, busLoadLevel } from "../api/_lib/lta.js";
import { fractionAlong } from "../src/lib/geometry.js";

const route = JSON.parse(readFileSync(new URL("./fixtures/onemap-pt-route.json", import.meta.url)));
const itin = route.plan.itineraries[0];

test("itinerary becomes an option card the UI can render", () => {
  const opt = normalizeItinerary(itin, "Bishan Park");
  assert.equal(opt.mins, 44);
  assert.equal(opt.fare, "$1.71");
  assert.equal(opt.walk, "7 min");
  assert.equal(opt.transfers, 1);
  assert.deepEqual(opt.legs, ["NSL", "BUS 410"]);
  assert.equal(opt.eta, clockFrom(itin.endTime));
});

test("rail and bus legs are labelled the way the line badges expect", () => {
  assert.equal(legLabel({ mode: "SUBWAY", routeShortName: "NS" }), "NSL");
  assert.equal(legLabel({ mode: "SUBWAY", routeShortName: "TEL" }), "TEL");
  assert.equal(legLabel({ mode: "BUS", routeShortName: "969" }), "BUS 969");
});

test("turn-by-turn steps carry the real stop sequence", () => {
  const steps = stepsOf(itin, "Bishan Park");
  assert.equal(steps.length, 4);
  assert.equal(steps[0].icon, "footprints");
  assert.match(steps[0].detail, /311 m/);
  assert.equal(steps[1].icon, "train-front");
  assert.match(steps[1].title, /Board NSL toward Marina South Pier/);
  assert.deepEqual(steps[1].stops, ["Khatib", "Yio Chu Kang", "Ang Mo Kio", "Bishan"]);
  assert.deepEqual(steps[1].stopPoints.map((stop) => stop.code), ["NS13", "NS14", "NS15", "NS16", "NS17"]);
  assert.equal(steps[1].alight, "Bishan");
  assert.equal(steps[2].service, "410");
  assert.equal(steps[2].boardStopCode, "53061");
  assert.equal(steps[3].title, "Walk to Bishan Park");
});

test("crowd level averages the transit legs", () => {
  const opt = normalizeItinerary(itin, "x");
  opt.transitLegs[0].crowdLevel = "busy";
  opt.transitLegs[1].crowdLevel = "moderate";
  assert.equal(crowdLevelOf(opt), "busy");
  opt.transitLegs[0].crowdLevel = "light";
  assert.equal(crowdLevelOf(opt), "moderate");
});

test("LTA level codes map to the design's three words", () => {
  assert.equal(crowdLevelFrom("l"), "light");
  assert.equal(crowdLevelFrom("m"), "moderate");
  assert.equal(crowdLevelFrom("h"), "busy");
  assert.equal(crowdLevelFrom(""), null);
  assert.equal(busLoadLevel("SEA"), "light");
  assert.equal(busLoadLevel("SDA"), "moderate");
  assert.equal(busLoadLevel("LSD"), "busy");
});

test("progress along the route comes from the real position", () => {
  const line = [[1.0, 103.0], [1.0, 103.1], [1.0, 103.2]];
  assert.equal(fractionAlong(line, [1.0, 103.0]), 0);
  assert.equal(Math.round(fractionAlong(line, [1.0, 103.1]) * 100), 50);
  // A position far off the line gives no reading rather than a wrong one.
  assert.equal(fractionAlong(line, [1.9, 104.9]), null);
});
