import test from "node:test";
import assert from "node:assert/strict";

import { ROUTE_MODES, optionMatchesMode } from "../api/_handlers/trip-options.js";

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
