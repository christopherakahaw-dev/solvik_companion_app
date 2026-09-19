import { test } from "node:test";
import assert from "node:assert/strict";
import { bearingBetween } from "../src/lib/geometry.js";
import { subscribeHeading, getCurrentHeading } from "../src/lib/compass.js";

test("bearingBetween calculates accurate compass bearings clockwise from true north", () => {
  // Heading Due North
  const north = bearingBetween([1.3000, 103.8000], [1.4000, 103.8000]);
  assert.ok(Math.abs(north - 0) < 0.1 || Math.abs(north - 360) < 0.1, `expected ~0 deg, got ${north}`);

  // Heading Due East
  const east = bearingBetween([1.3000, 103.8000], [1.3000, 103.9000]);
  assert.ok(Math.abs(east - 90) < 0.5, `expected ~90 deg, got ${east}`);

  // Heading Due South
  const south = bearingBetween([1.4000, 103.8000], [1.3000, 103.8000]);
  assert.ok(Math.abs(south - 180) < 0.5, `expected ~180 deg, got ${south}`);

  // Heading Due West
  const west = bearingBetween([1.3000, 103.9000], [1.3000, 103.8000]);
  assert.ok(Math.abs(west - 270) < 0.5, `expected ~270 deg, got ${west}`);

  // Invalid or identical points
  assert.equal(bearingBetween([1.3, 103.8], [1.3, 103.8]), 0);
  assert.equal(bearingBetween(null, [1.3, 103.8]), 0);
  assert.equal(bearingBetween([1.3, 103.8], null), 0);
});

test("subscribeHeading registers and unregisters listeners safely in environments without window", () => {
  const headings = [];
  const unsub = subscribeHeading((h) => headings.push(h));
  assert.equal(typeof unsub, "function");
  unsub();
  assert.equal(headings.length, 0);
  assert.equal(getCurrentHeading(), null);
});
