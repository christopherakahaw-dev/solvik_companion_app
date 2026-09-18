// Places are a much weaker claim than commutes, and deliberately so: two visits
// is enough, because all the app does with a place is decide whether a
// disruption is worth mentioning. These tests fix where that bar sits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { learnedPlaces, groupDestinations, isRegular, linesForPlaces } from "../src/lib/places.js";

const day = (d, h, mi) => new Date(2026, 8, d, h, mi).getTime(); // Sep 2026
const OFFICE = [1.3009, 103.8559];
const GYM = [1.3644, 103.9915];
const NOW = day(11, 9, 0);

const visit = (ll, d, h, extra = {}) => ({
  at: day(d, h, 0), fromLL: [1.4294, 103.835], toLL: ll, toName: extra.name || "Office",
  legs: extra.legs || ["NSL"], started: true, completed: true, ...extra,
});

test("two visits on two days is a place you go", () => {
  const places = learnedPlaces([visit(OFFICE, 7, 9), visit(OFFICE, 8, 9)], NOW);
  assert.equal(places.length, 1);
  assert.equal(places[0].visits, 2);
  assert.equal(places[0].name, "Office");
});

test("twice in one afternoon is one outing, not a habit", () => {
  const places = learnedPlaces([visit(OFFICE, 7, 9), visit(OFFICE, 7, 15)], NOW);
  assert.equal(places.length, 0, "distinct dates, not distinct trips");
  assert.equal(groupDestinations([visit(OFFICE, 7, 9), visit(OFFICE, 7, 15)])[0].visits, 2, "the group still exists");
});

test("somewhere you went once does not count", () => {
  assert.equal(learnedPlaces([visit(OFFICE, 7, 9)], NOW).length, 0);
});

test("a place you stopped going to falls away", () => {
  const stale = [visit(OFFICE, 7, 9), visit(OFFICE, 8, 9)];
  assert.equal(learnedPlaces(stale, NOW + 30 * 24 * 60 * 60 * 1000).length, 0);
});

test("two destinations a long way apart stay separate", () => {
  const places = learnedPlaces(
    [visit(OFFICE, 7, 9), visit(OFFICE, 8, 9), visit(GYM, 7, 19, { name: "Gym", legs: ["EWL"] }), visit(GYM, 9, 19, { name: "Gym", legs: ["EWL"] })],
    NOW
  );
  assert.equal(places.length, 2);
  assert.deepEqual(places.map((p) => p.name).sort(), ["Gym", "Office"]);
});

test("a destination reached from anywhere is still the same destination", () => {
  // Grouping is by where you went, not where you set off — the office is the
  // office whether you came from home or from a friend's.
  const places = learnedPlaces(
    [visit(OFFICE, 7, 9), { ...visit(OFFICE, 8, 9), fromLL: [1.28, 103.85] }],
    NOW
  );
  assert.equal(places.length, 1);
  assert.equal(places[0].visits, 2);
});

test("a place carries every line used to reach it", () => {
  const places = learnedPlaces(
    [visit(OFFICE, 7, 9, { legs: ["NSL"] }), visit(OFFICE, 8, 9, { legs: ["EWL", "BUS 851"] }), visit(OFFICE, 9, 9, { legs: ["NSL"] })],
    NOW
  );
  assert.deepEqual(places[0].lines, ["BUS 851", "EWL", "NSL"]);
  assert.deepEqual(linesForPlaces(places), ["BUS 851", "EWL", "NSL"]);
});

test("a destination only browsed contributes no lines", () => {
  // started: false is a destination chosen but never travelled to — it says
  // where you looked, not how you get there.
  const places = learnedPlaces(
    [visit(OFFICE, 7, 9, { started: false, legs: ["CCL"] }), visit(OFFICE, 8, 9, { legs: ["NSL"] })],
    NOW
  );
  assert.equal(places[0].visits, 2);
  assert.deepEqual(places[0].lines, ["NSL"]);
});

test("a group below the bar is reported as not regular, not as absent", () => {
  const group = groupDestinations([visit(OFFICE, 7, 9)])[0];
  assert.ok(group);
  assert.equal(isRegular(group, NOW), false);
});
