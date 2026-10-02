import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { KEYS } from "../src/lib/storage.js";
import { isDark, storedTheme } from "../src/lib/theme.js";

beforeEach(() => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
});

const media = (dark) => () => ({ matches: dark });

test("an explicit choice wins over the phone's setting", () => {
  assert.equal(isDark("dark", media(false)), true);
  assert.equal(isDark("light", media(true)), false);
});

test("Automatic follows the phone", () => {
  assert.equal(isDark("system", media(true)), true);
  assert.equal(isDark("system", media(false)), false);
});

test("an unknown stored value falls back to Automatic", () => {
  assert.equal(storedTheme(), "system");
  localStorage.setItem(KEYS.theme, JSON.stringify("purple"));
  assert.equal(storedTheme(), "system");
  localStorage.setItem(KEYS.theme, JSON.stringify("dark"));
  assert.equal(storedTheme(), "dark");
});
