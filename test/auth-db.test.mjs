import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getDb,
  registerUser,
  authenticateUser,
  updateUserPreferences,
  createSession,
  validateSession,
  destroySession,
} from "../api/_lib/db.js";
import authHandler from "../api/_handlers/auth.js";

function mockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test("database creates tables and registers user with hashed password", () => {
  const db = getDb(":memory:");
  const user = registerUser(db, {
    username: "rachel_lim",
    password: "secretpassword123",
    preferences: { persona: "fixed", stepFree: false },
    savedPlaces: { home: { name: "Tampines" } },
  });

  assert.equal(user.username, "rachel_lim");
  assert.equal(user.preferences.persona, "fixed");
  assert.equal(user.savedPlaces.home.name, "Tampines");

  // Verify password hash in DB is salted and hashed, not plain text
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  assert.notEqual(row.password_hash, "secretpassword123");
  assert.ok(row.password_hash.includes(":"));
});

test("duplicate username registration is rejected", () => {
  const db = getDb(":memory:");
  registerUser(db, { username: "arjun", password: "password123" });

  assert.throws(
    () => registerUser(db, { username: "Arjun", password: "differentpassword" }),
    /already taken/
  );
});

test("short username or short password is rejected", () => {
  const db = getDb(":memory:");
  assert.throws(() => registerUser(db, { username: "a", password: "password123" }), /Username must be/);
  assert.throws(() => registerUser(db, { username: "validuser", password: "123" }), /Password must be/);
});

test("authentication verifies credentials and creates valid session", () => {
  const db = getDb(":memory:");
  registerUser(db, { username: "mdm_lim", password: "accessibilityfirst" });

  const authenticated = authenticateUser(db, { username: "mdm_lim", password: "accessibilityfirst" });
  assert.equal(authenticated.username, "mdm_lim");

  assert.throws(
    () => authenticateUser(db, { username: "mdm_lim", password: "wrongpassword" }),
    /Invalid username or password/
  );

  const { token } = createSession(db, authenticated.id);
  assert.ok(token);

  const sessionUser = validateSession(db, token);
  assert.equal(sessionUser.id, authenticated.id);
  assert.equal(sessionUser.username, "mdm_lim");

  destroySession(db, token);
  assert.equal(validateSession(db, token), null);
});

test("updating user preferences saves to database", () => {
  const db = getDb(":memory:");
  const user = registerUser(db, {
    username: "commuter_rachel",
    password: "password123",
    preferences: { persona: "fixed" },
  });

  const updated = updateUserPreferences(db, user.id, {
    preferences: { persona: "stepFree", largeText: true },
    savedPlaces: { home: { name: "Bedok", ll: [1.32, 103.93] } },
  });

  assert.equal(updated.preferences.persona, "stepFree");
  assert.equal(updated.preferences.largeText, true);
  assert.equal(updated.savedPlaces.home.name, "Bedok");
});

test("auth API handler performs end-to-end register, me, preferences, and logout", async () => {
  // Use in-memory for testing handler
  process.env.SOLVIK_DB_PATH = ":memory:";

  // 1. Register
  const regReq = {
    method: "POST",
    url: "/api/auth/register",
    body: {
      username: "testcommuter",
      password: "pass123456",
      preferences: { persona: "flexible", avoidCrowds: true },
    },
  };
  const regRes = mockResponse();
  await authHandler(regReq, regRes);
  assert.equal(regRes.statusCode, 201);
  assert.equal(regRes.body.success, true);
  const token = regRes.body.token;
  assert.ok(token);
  assert.equal(regRes.body.user.username, "testcommuter");

  // 2. Verify Session via /api/auth/me
  const meReq = {
    method: "GET",
    url: "/api/auth/me",
    headers: { authorization: `Bearer ${token}` },
  };
  const meRes = mockResponse();
  await authHandler(meReq, meRes);
  assert.equal(meRes.statusCode, 200);
  assert.equal(meRes.body.user.username, "testcommuter");
  assert.equal(meRes.body.user.preferences.avoidCrowds, true);

  // 3. Update preferences via /api/auth/preferences
  const prefReq = {
    method: "PUT",
    url: "/api/auth/preferences",
    headers: { authorization: `Bearer ${token}` },
    body: {
      preferences: { persona: "flexible", avoidCrowds: false, lessWalking: true },
      savedPlaces: { work: { name: "one-north" } },
    },
  };
  const prefRes = mockResponse();
  await authHandler(prefReq, prefRes);
  assert.equal(prefRes.statusCode, 200);
  assert.equal(prefRes.body.user.preferences.lessWalking, true);
  assert.equal(prefRes.body.user.savedPlaces.work.name, "one-north");

  // 4. Logout
  const logoutReq = {
    method: "POST",
    url: "/api/auth/logout",
    headers: { authorization: `Bearer ${token}` },
  };
  const logoutRes = mockResponse();
  await authHandler(logoutReq, logoutRes);
  assert.equal(logoutRes.statusCode, 200);

  // 5. Subsequent /me fails
  const meAfterReq = {
    method: "GET",
    url: "/api/auth/me",
    headers: { authorization: `Bearer ${token}` },
  };
  const meAfterRes = mockResponse();
  await authHandler(meAfterReq, meAfterRes);
  assert.equal(meAfterRes.statusCode, 401);
});
