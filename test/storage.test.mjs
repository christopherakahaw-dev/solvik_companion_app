import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KEYS,
  alertId,
  clearAllUserData,
  loadSavedPlaces,
  loadStored,
  normalizeSavedPlace,
  saveSavedPlaces,
  storageKey,
} from "../src/lib/storage.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test("alert ids remain stable when the feed timestamp changes", () => {
  const base = {
    line: "NSL",
    tag: "Delay",
    title: "NSL service affected",
    detail: "Between Yishun and Bishan.",
    time: "09:00",
  };
  assert.equal(alertId(base), alertId({ ...base, time: "09:30" }));
});

test("invalid coordinates cannot become a verified saved place", () => {
  for (const ll of [[null, null], ["", ""], [91, 103], [1, 181], ["bad", 103]]) {
    const place = normalizeSavedPlace({ name: "Invalid", source: "onemap", ll }, "home");
    assert.equal(place.verified, false);
    assert.equal(place.ll, null);
  }
});

test("malformed stored collections fall back without crashing the app", () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = memoryStorage({ [KEYS.searches]: "{}", [KEYS.journeys]: "null" });
  try {
    assert.deepEqual(loadStored(KEYS.searches, []), []);
    assert.deepEqual(loadStored(KEYS.journeys, []), []);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("legacy place strings remain visible but are not treated as verified coordinates", () => {
  assert.deepEqual(normalizeSavedPlace("Yishun", "home"), {
    id: "home",
    name: "Yishun",
    address: "Yishun",
    postal: null,
    ll: null,
    source: "legacy",
    verified: false,
  });
});

test("selected OneMap places round-trip through the versioned local schema", () => {
  const previous = globalThis.localStorage;
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  try {
    saveSavedPlaces({
      home: { name: "Home", address: "1 Privacy Road", postal: "123456", ll: [1.3, 103.8], source: "onemap" },
    });
    const saved = JSON.parse(storage.values.get(KEYS.places));
    assert.equal(saved.version, 2);
    assert.deepEqual(loadSavedPlaces().home.ll, [1.3, 103.8]);
    assert.equal(loadSavedPlaces().home.verified, true);
    assert.equal(loadSavedPlaces().work, null);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("clear all removes every Solvik-owned storage key", () => {
  const previous = globalThis.localStorage;
  const storage = memoryStorage(Object.fromEntries(Object.values(KEYS).map((key) => [key, "saved"])));
  globalThis.localStorage = storage;
  try {
    clearAllUserData();
    assert.equal(storage.values.size, 0);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("device-local data uses stable browser keys", () => {
  assert.equal(storageKey(KEYS.places), KEYS.places);
  assert.equal(storageKey(KEYS.journeys), KEYS.journeys);
  assert.equal(storageKey(KEYS.reports), KEYS.reports);
});
