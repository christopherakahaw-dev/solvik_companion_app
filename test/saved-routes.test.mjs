import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { KEYS, clearAllUserData } from "../src/lib/storage.js";
import {
  SAVED_ROUTES_LIMIT,
  SAVED_ROUTES_MAX_AGE_MS,
  looksOffline,
  rememberRoutes,
  savedRouteKey,
  savedRoutesFor,
} from "../src/lib/savedRoutes.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
});

const raffles = { origin: [1.3531, 103.9453], destLL: [1.2841, 103.8515], destName: "Raffles Place", mode: "transit" };
const route = (mins) => ({
  mins,
  legs: ["EWL"],
  crowdLevel: "busy",
  transitLegs: [{ mode: "RAIL", label: "EWL", crowdLevel: "busy", etaMins: 3 }],
  steps: [{ mode: "RAIL", title: "Board EWL", arrivals: { buses: [] }, crowdLevel: "busy" }],
});

test("a planned route can be read back with the time it was saved", () => {
  const key = savedRouteKey(raffles);
  rememberRoutes(key, [route(30)], 1_000);
  const saved = savedRoutesFor(key, 2_000);
  assert.equal(saved.savedAt, 1_000);
  assert.equal(saved.options[0].mins, 30);
  assert.equal(saved.options[0].savedAt, 1_000, "every option carries its age");
});

test("live crowding and arrivals are never kept, only the route itself", () => {
  const key = savedRouteKey(raffles);
  rememberRoutes(key, [route(30)]);
  const [option] = savedRoutesFor(key).options;
  assert.equal(option.crowdLevel, undefined);
  assert.equal(option.transitLegs[0].crowdLevel, undefined);
  assert.equal(option.transitLegs[0].etaMins, undefined);
  assert.equal(option.steps[0].arrivals, undefined);
  assert.equal(option.steps[0].title, "Board EWL");
});

test("a start more than ~1 km away is a different trip", () => {
  rememberRoutes(savedRouteKey(raffles), [route(30)]);
  assert.equal(savedRoutesFor(savedRouteKey({ ...raffles, origin: [1.4294, 103.835] })), null);
  assert.ok(savedRoutesFor(savedRouteKey({ ...raffles, origin: [1.3533, 103.9451] })), "a few metres away still matches");
  assert.equal(savedRoutesFor(savedRouteKey({ ...raffles, mode: "bus" })), null, "another mode is another question");
});

test("demo recordings are not saved as routes anyone planned", () => {
  const key = savedRouteKey(raffles);
  rememberRoutes(key, [{ ...route(30), recorded: true }]);
  assert.equal(savedRoutesFor(key), null);
});

test("only the most recent trips are kept, and old ones stop being offered", () => {
  for (let i = 0; i < SAVED_ROUTES_LIMIT + 2; i++) {
    rememberRoutes(savedRouteKey({ ...raffles, destName: `Place ${i}` }), [route(i)], i);
  }
  assert.equal(JSON.parse(localStorage.getItem(KEYS.savedRoutes)).length, SAVED_ROUTES_LIMIT);
  assert.equal(savedRoutesFor(savedRouteKey({ ...raffles, destName: "Place 0" })), null, "the oldest fell off");

  const key = savedRouteKey(raffles);
  rememberRoutes(key, [route(30)], 0);
  assert.equal(savedRoutesFor(key, SAVED_ROUTES_MAX_AGE_MS + 1), null);
});

test("erasing all data erases saved routes too", () => {
  rememberRoutes(savedRouteKey(raffles), [route(30)]);
  clearAllUserData();
  assert.equal(localStorage.getItem(KEYS.savedRoutes), null);
});

test("a failed fetch reads as offline; an HTTP error does not", () => {
  assert.equal(looksOffline(new TypeError("Failed to fetch")), true);
  assert.equal(looksOffline(new Error("OneMap routing failed (502)")), false);
});
