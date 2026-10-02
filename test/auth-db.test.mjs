import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  setStore,
  registerUser,
  loginUser,
  getUserByToken,
  saveUserPreferences,
  logoutUser,
  hashPassword,
  verifyPassword,
  hashToken,
} from "../api/_lib/db.js";
import { createSqliteStore } from "../api/_lib/accounts/sqliteStore.js";

// In memory, so the suite never writes a database file into the repo.
beforeEach(() => {
  setStore(createSqliteStore(":memory:"));
});

afterEach(() => {
  setStore(null);
});
test("password hashing and verification with scrypt works", async () => {
  const password = "SuperSecretPassword123!";
  const { hash, salt } = hashPassword(password);
  assert.ok(hash && hash.length > 30);
  assert.ok(salt && salt.length === 32);
  assert.equal(verifyPassword(password, hash, salt), true);
  assert.equal(verifyPassword("WrongPassword", hash, salt), false);
});

test("user registration validates username and password length", async () => {
  await assert.rejects(registerUser("ab", "password123"), /between 3 and 30/);
  await assert.rejects(registerUser("validuser", "12345"), /at least 6 characters/);
  await assert.rejects(registerUser("bad username with space", "password123"), /letters, numbers/);
});

test("user registration and duplicate username rejection", async () => {
  const result = await registerUser("rachel_commuter", "password123", { persona: "fixed" });
  assert.ok(result.token);
  assert.equal(result.user.username, "rachel_commuter");
  assert.deepEqual(result.preferences, { persona: "fixed" });

  await assert.rejects(registerUser("RACHEL_COMMUTER", "differentPassword"), /already taken/);
});

test("user login verifies credentials and creates session", async () => {
  await registerUser("arjun_commuter", "bikeTransit456", { persona: "flexible" });

  const loginRes = await loginUser("arjun_commuter", "bikeTransit456");
  assert.ok(loginRes.token);
  assert.equal(loginRes.user.username, "arjun_commuter");
  assert.deepEqual(loginRes.preferences, { persona: "flexible" });

  await assert.rejects(loginUser("arjun_commuter", "wrongPass"), /Invalid username or password/);

  await assert.rejects(loginUser("non_existent_user", "somePass123"), /Invalid username or password/);
});

test("getUserByToken retrieves user and stored preferences", async () => {
  const { token, user } = await registerUser("lim_auntie", "stepFreeAccess789", {
    persona: "stepFree",
    stepFree: true,
  });

  const session = await getUserByToken(token);
  assert.ok(session);
  assert.equal(session.user.id, user.id);
  assert.equal(session.user.username, "lim_auntie");
  assert.equal(session.preferences.stepFree, true);

  assert.equal(await getUserByToken("non_existent_token"), null);
});

test("saveUserPreferences updates preferences in the database", async () => {
  const { token } = await registerUser("preference_user", "password123", { persona: "fixed" });

  const updated = {
    persona: "flexible",
    stepFree: false,
    savedPlaces: {
      home: { name: "Bishan MRT", ll: [1.3508, 103.8482] },
    },
  };

  const res = await saveUserPreferences(token, updated);
  assert.deepEqual(res.preferences, updated);

  const check = await getUserByToken(token);
  assert.deepEqual(check.preferences, updated);
});

test("logoutUser deletes the session token", async () => {
  const { token } = await registerUser("logout_user", "password123");
  assert.ok(await getUserByToken(token));

  await logoutUser(token);
  assert.equal(await getUserByToken(token), null);
});

test("returning user with travel style saved preserves travelStyleSelected on login", async () => {
  const { token } = await registerUser("returning_commuter", "password123", {
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
  const loginRes = await loginUser("returning_commuter", "password123");
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
  await saveUserPreferences(loginRes.token, updatedPrefs);

  const check = await loginUser("returning_commuter", "password123");
  assert.equal(check.preferences.routingPreferences.travelStyleSelected, true);
  assert.equal(check.preferences.routingPreferences.travelStyle, "stepFree");
  assert.equal(check.preferences.routingPreferences.stepFree, true);
});

test("new user flow: registers with clean preferences, completes style selection, and subsequent login skips intro", async () => {
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
  const { token, user } = await registerUser("new_sg_user", "securePass123", initialPrefs);
  assert.ok(user.id);
  assert.equal(user.username, "new_sg_user");

  // Verify DB state for new user: travelStyleSelected is false
  const freshSession = await getUserByToken(token);
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

  await saveUserPreferences(token, completedPrefs);

  // 3. User logs in later: preferences are retrieved directly from SQLite database
  const returningLogin = await loginUser("new_sg_user", "securePass123");
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


test("session tokens are stored only as hashes", async () => {
  const store = createSqliteStore(":memory:");
  setStore(store);
  const sessions = [];
  const insertSession = store.insertSession;
  store.insertSession = async (session) => { sessions.push(session); return insertSession(session); };
  const { token } = await registerUser("hash_check", "password123");
  assert.equal(sessions.length, 1);
  assert.notEqual(sessions[0].token_hash, token);
  assert.equal(sessions[0].token_hash, hashToken(token));
});

test("a login name no account could have is rejected without a lookup", async () => {
  const store = createSqliteStore(":memory:");
  let lookups = 0;
  const find = store.findUserByUsername;
  store.findUserByUsername = async (name) => { lookups++; return find(name); };
  setStore(store);
  await assert.rejects(loginUser("a,b(c)", "password123"), /Invalid username or password/);
  assert.equal(lookups, 0);
});

test("a Vercel deployment without Supabase refuses, so the client keeps the account on the device", async () => {
  setStore(null);
  const saved = { VERCEL: process.env.VERCEL, SUPABASE_URL: process.env.SUPABASE_URL };
  process.env.VERCEL = "1";
  delete process.env.SUPABASE_URL;
  try {
    await assert.rejects(registerUser("vercel_user", "password123"), (err) => err.httpStatus === 503 && /Account sync is unavailable/.test(err.message));
  } finally {
    if (saved.VERCEL === undefined) delete process.env.VERCEL; else process.env.VERCEL = saved.VERCEL;
    if (saved.SUPABASE_URL !== undefined) process.env.SUPABASE_URL = saved.SUPABASE_URL;
  }
});
