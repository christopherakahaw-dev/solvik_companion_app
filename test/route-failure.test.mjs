import test from "node:test";
import assert from "node:assert/strict";
import { routeFailure, routeRecoveryModes } from "../src/lib/routeFailure.js";

test("an MRT 404 becomes useful recovery guidance", () => {
  const failure = routeFailure("OneMap routing failed (404): Unable to get MRT route", "train");
  assert.equal(failure.title, "No train-only route found");
  assert.match(failure.detail, /Try Transit/);
  assert.equal(failure.technical, "OneMap routing failed (404): Unable to get MRT route");
  assert.deepEqual(routeRecoveryModes("train").map((mode) => mode.id), ["transit", "bus", "walk"]);
});

test("temporary service failures keep the trip and offer recovery", () => {
  const failure = routeFailure("Routing temporarily unavailable (502)", "transit");
  assert.equal(failure.title, "Routes are temporarily unavailable");
  assert.equal(failure.retry, true);
  assert.equal(failure.alternatives, true);
});

test("an unselected origin asks for the missing input instead of blaming routing", () => {
  const failure = routeFailure("Select a starting place from the search results.", "transit");
  assert.equal(failure.title, "Choose a starting point");
  assert.equal(failure.retry, false);
  assert.equal(failure.alternatives, false);
});
