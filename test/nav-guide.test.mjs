// What the navigation screen adds beyond the current step: the journey strip,
// the line badge, the next bus, and the stop to get off at.
import { test } from "node:test";
import assert from "node:assert/strict";
import { navStrip, rideBadge, rideTitle, alightNext, nextBusLine, isRide } from "../src/lib/navGuide.js";

const steps = [
  { mode: "WALK", icon: "footprints", secs: 200 },
  { mode: "BUS", icon: "bus", service: "858", stopCode: "59009", title: "Board BUS 858 toward Yishun Int", stops: ["Blk 105", "Yishun Int"], alight: "Yishun Int", secs: 540 },
  { mode: "SUBWAY", icon: "train-front", label: "NSL", title: "Board NSL toward Marina South Pier", stops: ["Khatib", "Bishan"], alight: "Bishan", secs: 900 },
  { mode: "WALK", icon: "flag", secs: 120 },
];

test("the strip marks legs done, now and next", () => {
  assert.deepEqual(navStrip(steps, 2, false).map((s) => s.state), ["done", "done", "now", "next"]);
  assert.ok(navStrip(steps, 1, true).every((s) => s.state === "done"));
  assert.deepEqual(navStrip([], 0, false), []);
});

test("walks and cycling are not rides", () => {
  assert.equal(isRide(steps[0]), false);
  assert.equal(isRide({ mode: "BICYCLE", icon: "bike" }), false);
  assert.equal(isRide(steps[1]), true);
});

test("the badge shows the bus number or the line, in its colours", () => {
  assert.deepEqual(rideBadge(steps[1]), { text: "858", bg: "#334155", fg: "#ffffff", icon: "bus" });
  assert.equal(rideBadge(steps[2]).bg, "#D42E12");
  assert.equal(rideBadge(steps[0]), null);
});

test("beside the badge, the title drops the repeated line name", () => {
  assert.equal(rideTitle(steps[1]), "Toward Yishun Int");
  assert.equal(rideTitle(steps[2]), "Toward Marina South Pier");
  assert.equal(rideTitle(steps[0]), null);
  assert.equal(rideTitle({ ...steps[1], title: "Ride the 858" }), null);
});

test("get off is announced only when the alighting stop is next", () => {
  assert.equal(alightNext(steps[1], 1, false), "Yishun Int");
  assert.equal(alightNext(steps[1], 2, false), null);
  assert.equal(alightNext(steps[1], 1, true), null);
  assert.equal(alightNext(steps[0], 1, false), null);
});

test("walking to a bus shows when it comes, from the live poll first", () => {
  const live = { "59009:858": { buses: [{ etaMins: 2, monitored: true }, { etaMins: 11 }] } };
  assert.deepEqual(nextBusLine(steps, 0, live), { text: "Bus 858 · 2, 11 min", live: true, soon: true });
  assert.equal(nextBusLine(steps, 0, {}), null, "nothing fetched means nothing claimed");
  assert.equal(nextBusLine(steps, 1, live), null, "already on the bus");
  assert.equal(nextBusLine(steps, 2, live), null, "the next leg is not a bus");
});
