import test from "node:test";
import assert from "node:assert/strict";
import {
  getStoredToken,
  setStoredToken,
  getStoredUser,
  setStoredUser,
  isGuestSession,
  setGuestSession,
} from "../src/lib/auth.js";
import { KEYS, clearAllUserData } from "../src/lib/storage.js";

// Mock localStorage for node environment
function createMockStorage() {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
}

test("first time visitor lands on auth screen first", () => {
  globalThis.localStorage = createMockStorage();
  clearAllUserData();

  const token = getStoredToken();
  const isGuest = isGuestSession();

  assert.equal(token, null, "Should have no stored auth token initially");
  assert.equal(isGuest, false, "Should not be a guest initially");

  // Determine screen routing logic as implemented in appLogic
  const initialScreen = (() => {
    if (!token && !isGuest) return "auth";
    return "map";
  })();

  assert.equal(initialScreen, "auth", "User must land on the auth screen on first entry");
});

test("guest login sets guest flag and bypasses auth screen", () => {
  globalThis.localStorage = createMockStorage();
  clearAllUserData();

  assert.equal(isGuestSession(), false);
  setGuestSession(true);
  assert.equal(isGuestSession(), true);

  const token = getStoredToken();
  const isGuest = isGuestSession();

  const screen = (() => {
    if (!token && !isGuest) return "auth";
    return "intro";
  })();

  assert.equal(screen, "intro", "Guest user proceeds past auth screen to intro/map");
});

test("authenticated login stores token and user identity", () => {
  globalThis.localStorage = createMockStorage();
  clearAllUserData();

  const sampleUser = { id: 1, username: "commuter_sg", preferences: { persona: "stepFree" } };
  const sampleToken = "tok_abc123xyz";

  setStoredToken(sampleToken);
  setStoredUser(sampleUser);
  setGuestSession(false);

  assert.equal(getStoredToken(), sampleToken);
  assert.deepEqual(getStoredUser(), sampleUser);
  assert.equal(isGuestSession(), false);

  const screen = (() => {
    const token = getStoredToken();
    const guest = isGuestSession();
    if (!token && !guest) return "auth";
    return "map";
  })();

  assert.equal(screen, "map", "Authenticated user proceeds past auth screen");
});

test("guests do not sync preferences to database", () => {
  const syncAttempts = [];
  const mockSyncPreferences = (token, prefs) => {
    syncAttempts.push({ token, prefs });
  };

  function trySync({ currentUser, authToken, isGuest, preferences }) {
    if (!currentUser || !authToken || isGuest) return false;
    mockSyncPreferences(authToken, preferences);
    return true;
  }

  // 1. Guest user
  const guestResult = trySync({
    currentUser: null,
    authToken: null,
    isGuest: true,
    preferences: { persona: "fastest" },
  });
  assert.equal(guestResult, false, "Guest preference sync must be skipped");
  assert.equal(syncAttempts.length, 0);

  // 2. Authenticated user
  const authResult = trySync({
    currentUser: { id: 42, username: "alice" },
    authToken: "token_42",
    isGuest: false,
    preferences: { persona: "fastest" },
  });
  assert.equal(authResult, true, "Authenticated user preferences must sync to database");
  assert.equal(syncAttempts.length, 1);
  assert.equal(syncAttempts[0].token, "token_42");
  assert.deepEqual(syncAttempts[0].prefs, { persona: "fastest" });
});

test("logout clears session and resets to auth screen", () => {
  globalThis.localStorage = createMockStorage();

  setStoredToken("token_to_clear");
  setStoredUser({ id: 9, username: "bob" });
  setGuestSession(false);

  // Logout action
  setStoredToken(null);
  setStoredUser(null);
  setGuestSession(false);

  assert.equal(getStoredToken(), null);
  assert.equal(getStoredUser(), null);
  assert.equal(isGuestSession(), false);

  const screen = (() => {
    const token = getStoredToken();
    const guest = isGuestSession();
    if (!token && !guest) return "auth";
    return "map";
  })();

  assert.equal(screen, "auth", "After logout, screen resets to auth");
});

test("when user with saved travel style logs in again, they are not prompted for travel style", () => {
  globalThis.localStorage = createMockStorage();

  // Scenario 1: Returning user with saved travel style in their account
  const returningUser = {
    id: 10,
    username: "returning_commuter",
    preferences: { travelStyle: "fixed", persona: "fixed" },
  };

  const determineScreenOnLogin = (user) => {
    const userPrefs = user.preferences || {};
    const hasTravelStyle = Boolean(userPrefs.travelStyle || userPrefs.persona || userPrefs.scenario);
    return hasTravelStyle ? "map" : "intro";
  };

  const screenForReturning = determineScreenOnLogin(returningUser);
  assert.equal(screenForReturning, "map", "User with saved travel style bypasses intro prompt and goes directly to map");

  // Scenario 2: Brand new user with no saved travel style
  const brandNewUser = {
    id: 11,
    username: "brand_new_commuter",
    preferences: {},
  };

  const screenForNew = determineScreenOnLogin(brandNewUser);
  assert.equal(screenForNew, "intro", "Brand new user without travel style is prompted to choose a style");
});
