import test from "node:test";
import assert from "node:assert/strict";

import { ROUTE_MODES, optionMatchesMode, queriesFor, collapseFamilies } from "../api/_handlers/trip-options.js";

const option = (...modes) => ({
  walkOnly: modes.length === 0,
  transitLegs: modes.map((mode) => ({ mode })),
});

test("Walk is a real door-to-door walking request, not the legacy least-walking transit mode", () => {
  assert.equal(ROUTE_MODES.walk.walk, true);
  assert.equal(ROUTE_MODES.walk.query, undefined);
  assert.equal(ROUTE_MODES.leastWalk.tag, "Least walking");
  assert.equal(optionMatchesMode(option(), "walk"), true);
  assert.equal(optionMatchesMode(option("RAIL"), "walk"), false);
});

test("Bus and Train tabs reject mixed-mode public transport routes", () => {
  assert.equal(optionMatchesMode(option("BUS"), "bus"), true);
  assert.equal(optionMatchesMode(option("BUS", "RAIL"), "bus"), false);
  assert.equal(optionMatchesMode(option("RAIL"), "train"), true);
  assert.equal(optionMatchesMode(option("SUBWAY", "TRAM"), "train"), true);
  assert.equal(optionMatchesMode(option("RAIL", "BUS"), "train"), false);
});

test("Transit and Express accept public transport but never relabel walking-only routes", () => {
  assert.equal(optionMatchesMode(option("BUS", "RAIL"), "transit"), true);
  assert.equal(optionMatchesMode(option("BUS"), "express"), true);
  assert.equal(optionMatchesMode(option(), "transit"), false);
  assert.equal(optionMatchesMode(option(), "express"), false);
});

test("Transit modes widen the search with bus-only and rail-only requests", () => {
  const queries = queriesFor(ROUTE_MODES.fast);
  assert.deepEqual(queries.map((q) => q.mode).sort(), ["bus", "rail", "transit", "transit"]);
  assert.equal(queries[0].maxWalkDistance, 1000, "the mode's own request is sent first, unchanged");
});

test("Widening never relaxes the walking cap that Least walking and Step-free promise", () => {
  assert.ok(queriesFor(ROUTE_MODES.leastWalk).every((q) => q.maxWalkDistance <= 500));
  assert.ok(queriesFor(ROUTE_MODES.step).every((q) => q.maxWalkDistance <= 800));
});

test("Bus and Train tabs stay single-mode when widened", () => {
  assert.ok(queriesFor(ROUTE_MODES.bus).every((q) => q.mode === "bus"));
  assert.ok(queriesFor(ROUTE_MODES.train).every((q) => q.mode === "rail"));
  assert.ok(queriesFor(ROUTE_MODES.bus).length > 1);
});

test("Walk and Cycle send no public-transport requests", () => {
  assert.deepEqual(queriesFor(ROUTE_MODES.walk), []);
  assert.deepEqual(queriesFor(ROUTE_MODES.cycle), []);
});

const route = (mins, ...legs) => ({
  mins,
  transitLegs: legs.map(([mode, service, from, to]) => ({ mode, service, label: mode === "BUS" ? `BUS ${service}` : service, fromStopCode: from, toStopCode: to })),
});
const byMins = (a, b) => a.mins - b.mins;

test("Routes differing only in which bus serves the same stretch collapse into one card", () => {
  const options = [
    route(70, ["RAIL", "EWL", "EW24", "EW4"], ["BUS", "24", "96041", "95129"]),
    route(69, ["RAIL", "EWL", "EW24", "EW4"], ["BUS", "53", "96041", "95129"]),
    route(70, ["RAIL", "EWL", "EW24", "EW4"], ["BUS", "858", "96041", "95129"]),
  ];
  const collapsed = collapseFamilies(options, byMins);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].mins, 69);
  assert.deepEqual(collapsed[0].alsoBy, ["24", "858"]);
});

test("Routes through different stops or lines stay separate choices", () => {
  const options = [
    route(30, ["RAIL", "EWL", "EW2", "EW14"]),
    route(80, ["BUS", "10", "75009", "03011"]),
    route(79, ["BUS", "67", "75019", "40011"], ["BUS", "107", "40011", "03019"]),
  ];
  const collapsed = collapseFamilies(options, byMins);
  assert.equal(collapsed.length, 3);
  assert.ok(collapsed.every((o) => !o.alsoBy));
});
