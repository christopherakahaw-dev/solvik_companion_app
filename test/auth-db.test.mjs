import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  initDatabase,
  closeDb,
  registerUser,
  loginUser,
  getUserByToken,
  saveUserPreferences,
  logoutUser,
  hashPassword,
  verifyPassword,
} from "../api/_lib/db.js";

const TEST_DB_PATH = path.resolve(process.cwd(), ".data", "test_solvik.db");

beforeEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB_PATH)) {
    try { fs.unlinkSync(TEST_DB_PATH); } catch {}
  }
  process.env.SOLVIK_DB_PATH = TEST_DB_PATH;
  initDatabase(TEST_DB_PATH);
});

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB_PATH)) {
    try { fs.unlinkSync(TEST_DB_PATH); } catch {}
  }
  delete process.env.SOLVIK_DB_PATH;
});

test("password hashing and verification with scrypt works", () => {
  const password = "SuperSecretPassword123!";
  const { hash, salt } = hashPassword(password);
  assert.ok(hash && hash.length > 30);
  assert.ok(salt && salt.length === 32);
  assert.equal(verifyPassword(password, hash, salt), true);
  assert.equal(verifyPassword("WrongPassword", hash, salt), false);
});

test("user registration validates username and password length", () => {
  assert.throws(() => registerUser("ab", "password123"), /between 3 and 30/);
  assert.throws(() => registerUser("validuser", "12345"), /at least 6 characters/);
  assert.throws(() => registerUser("bad username with space", "password123"), /letters, numbers/);
});

test("user registration and duplicate username rejection", () => {
  const result = registerUser("rachel_commuter", "password123", { persona: "fixed" });
  assert.ok(result.token);
  assert.equal(result.user.username, "rachel_commuter");
  assert.deepEqual(result.preferences, { persona: "fixed" });

  assert.throws(() => {
    registerUser("RACHEL_COMMUTER", "differentPassword");
  }, /already taken/);
});

test("user login verifies credentials and creates session", () => {
  registerUser("arjun_commuter", "bikeTransit456", { persona: "flexible" });

  const loginRes = loginUser("arjun_commuter", "bikeTransit456");
  assert.ok(loginRes.token);
  assert.equal(loginRes.user.username, "arjun_commuter");
  assert.deepEqual(loginRes.preferences, { persona: "flexible" });

  assert.throws(() => {
    loginUser("arjun_commuter", "wrongPass");
  }, /Invalid username or password/);

  assert.throws(() => {
    loginUser("non_existent_user", "somePass123");
  }, /Invalid username or password/);
});

test("getUserByToken retrieves user and stored preferences", () => {
  const { token, user } = registerUser("lim_auntie", "stepFreeAccess789", {
    persona: "stepFree",
    stepFree: true,
  });

  const session = getUserByToken(token);
  assert.ok(session);
  assert.equal(session.user.id, user.id);
  assert.equal(session.user.username, "lim_auntie");
  assert.equal(session.preferences.stepFree, true);

  assert.equal(getUserByToken("non_existent_token"), null);
});

test("saveUserPreferences updates preferences in the database", () => {
  const { token } = registerUser("preference_user", "password123", { persona: "fixed" });

  const updated = {
    persona: "flexible",
    stepFree: false,
    savedPlaces: {
      home: { name: "Bishan MRT", ll: [1.3508, 103.8482] },
    },
  };

  const res = saveUserPreferences(token, updated);
  assert.deepEqual(res.preferences, updated);

  const check = getUserByToken(token);
  assert.deepEqual(check.preferences, updated);
});

test("logoutUser deletes the session token", () => {
  const { token } = registerUser("logout_user", "password123");
  assert.ok(getUserByToken(token));

  logoutUser(token);
  assert.equal(getUserByToken(token), null);
});

test("returning user with travel style saved preserves travelStyleSelected on login", () => {
  const { token } = registerUser("returning_commuter", "password123", {
    routingPreferences: {
      travelStyle: "fixed",
      travelStyleSelected: true,
      persona: "fixed",
    },
    savedPlaces: {
      home: { name: "Woodlands MRT", ll: [1.4360, 103.7865] },
    },
  });

  // Verify login returns the saved travel style
  const loginRes = loginUser("returning_commuter", "password123");
  assert.equal(loginRes.preferences.routingPreferences.travelStyleSelected, true);
  assert.equal(loginRes.preferences.routingPreferences.travelStyle, "fixed");
  assert.equal(loginRes.preferences.savedPlaces.home.name, "Woodlands MRT");

  // Updating style after initial selection persists correctly
  const updatedPrefs = {
    routingPreferences: {
      travelStyle: "stepFree",
      travelStyleSelected: true,
      persona: "stepFree",
      stepFree: true,
    },
    savedPlaces: loginRes.preferences.savedPlaces,
  };
  saveUserPreferences(loginRes.token, updatedPrefs);

  const check = loginUser("returning_commuter", "password123");
  assert.equal(check.preferences.routingPreferences.travelStyleSelected, true);
  assert.equal(check.preferences.routingPreferences.travelStyle, "stepFree");
  assert.equal(check.preferences.routingPreferences.stepFree, true);
});

test("new user flow: registers with clean preferences, completes style selection, and subsequent login skips intro", () => {
  // 1. Initial registration starts with travelStyleSelected: false
  const initialPrefs = {
    routingPreferences: {
      stepFree: false,
      lessWalking: false,
      avoidCrowds: false,
      studentFare: false,
      routineCommute: false,
      showSavedPlaces: true,
      persona: null,
      travelStyle: null,
      travelStyleSelected: false,
      scenario: null,
    },
    savedPlaces: { home: null, work: null, school: null },
  };
  const { token, user } = registerUser("new_sg_user", "securePass123", initialPrefs);
  assert.ok(user.id);
  assert.equal(user.username, "new_sg_user");

  // Verify DB state for new user: travelStyleSelected is false
  const freshSession = getUserByToken(token);
  assert.equal(freshSession.preferences.routingPreferences.travelStyleSelected, false);

  // 2. User completes style selection with Fixed Schedule and custom commute places
  const customHome = { name: "Tampines St 21", address: "Tampines, Singapore", ll: [1.3532, 103.9456] };
  const customWork = { name: "Raffles Place Tower", address: "Raffles Place, Singapore", ll: [1.2838, 103.8515] };
  const completedPrefs = {
    routingPreferences: {
      ...initialPrefs.routingPreferences,
      persona: "fixed",
      travelStyle: "fixed",
      travelStyleSelected: true,
      routineCommute: true,
      leaveMins: 460, // 07:40
      arriveBy: 525,  // 08:45
      commuteMins: 460,
    },
    savedPlaces: {
      home: { ...customHome, source: "onemap", verified: true },
      work: { ...customWork, source: "onemap", verified: true },
      school: null,
    },
  };

  saveUserPreferences(token, completedPrefs);

  // 3. User logs in later: preferences are retrieved directly from SQLite database
  const returningLogin = loginUser("new_sg_user", "securePass123");
  assert.equal(returningLogin.preferences.routingPreferences.travelStyleSelected, true);
  assert.equal(returningLogin.preferences.routingPreferences.travelStyle, "fixed");
  assert.equal(returningLogin.preferences.routingPreferences.arriveBy, 525);
  assert.equal(returningLogin.preferences.savedPlaces.home.name, "Tampines St 21");
  assert.equal(returningLogin.preferences.savedPlaces.work.name, "Raffles Place Tower");

  // In appLogic.jsx: hasSelectedStyle will evaluate to true
  const hasSelectedStyle = Boolean(
    returningLogin.preferences.routingPreferences?.travelStyleSelected === true ||
    returningLogin.preferences?.travelStyleSelected === true
  );
  assert.equal(hasSelectedStyle, true);
});

