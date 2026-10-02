import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { setStore, registerUser, loginUser, getUserByToken, saveUserPreferences, logoutUser } from "../api/_lib/db.js";
import { createSupabaseStore, supabaseConfigFromEnv } from "../api/_lib/accounts/supabaseStore.js";

// A small stand-in for Supabase's REST API (PostgREST): just the filters the
// store uses, with the unique index on username_lower enforced as Postgres would.
function fakeSupabase() {
  const tables = { solvik_users: [], solvik_sessions: [] };
  const requests = [];

  const matches = (row, params) => [...params].every(([column, filter]) => {
    if (["select", "limit"].includes(column)) return true;
    const [op, ...rest] = filter.split(".");
    const value = rest.join(".");
    if (op === "eq") return String(row[column]) === value;
    if (op === "gt") return Number(row[column]) > Number(value);
    if (op === "lte") return Number(row[column]) <= Number(value);
    throw new Error(`fake does not support ${op}`);
  });

  async function fetchImpl(url, { method = "GET", headers = {}, body } = {}) {
    const parsed = new URL(url);
    const table = parsed.pathname.replace("/rest/v1/", "");
    requests.push({ method, table, headers, query: parsed.search });
    const rows = tables[table];
    const reply = (status, json) => ({ ok: status < 400, status, text: async () => (json === undefined ? "" : JSON.stringify(json)) });
    if (!rows) return reply(404, { code: "PGRST205", message: "table not found" });

    if (method === "POST") {
      const row = JSON.parse(body);
      if (table === "solvik_users" && rows.some((r) => r.username_lower === row.username_lower)) {
        return reply(409, { code: "23505", message: "duplicate key value violates unique constraint" });
      }
      rows.push(row);
      return reply(201);
    }
    const hits = rows.filter((row) => matches(row, parsed.searchParams));
    if (method === "PATCH") {
      hits.forEach((row) => Object.assign(row, JSON.parse(body)));
      return reply(204);
    }
    if (method === "DELETE") {
      tables[table] = rows.filter((row) => !hits.includes(row));
      return reply(204);
    }
    const select = parsed.searchParams.get("select");
    if (select && select.startsWith("user:solvik_users")) {
      return reply(200, hits.map((s) => {
        const u = tables.solvik_users.find((user) => user.id === s.user_id);
        return { user: u ? { id: u.id, username: u.username, preferences: u.preferences } : null };
      }));
    }
    return reply(200, hits);
  }

  return { tables, requests, fetchImpl };
}

afterEach(() => setStore(null));

test("accounts round-trip through Supabase: register, sign in, sync preferences, sign out", async () => {
  const fake = fakeSupabase();
  setStore(createSupabaseStore({ url: "https://demo.supabase.co/", key: "sb_secret_test", fetchImpl: fake.fetchImpl }));

  const registered = await registerUser("Rachel_T", "password123", { persona: "fixed" });
  assert.equal(fake.tables.solvik_users[0].username_lower, "rachel_t");

  await assert.rejects(registerUser("rachel_t", "password456"), /already taken/);

  const login = await loginUser("RACHEL_T", "password123");
  assert.equal(login.user.id, registered.user.id);
  assert.deepEqual(login.preferences, { persona: "fixed" });
  await assert.rejects(loginUser("rachel_t", "wrong-password"), /Invalid username or password/);

  await saveUserPreferences(login.token, { persona: "stepFree" });
  assert.deepEqual((await getUserByToken(login.token)).preferences, { persona: "stepFree" });

  await logoutUser(login.token);
  assert.equal(await getUserByToken(login.token), null);
  assert.ok(await getUserByToken(registered.token), "signing out one device leaves the other signed in");
});

test("raw session tokens never reach Supabase", async () => {
  const fake = fakeSupabase();
  setStore(createSupabaseStore({ url: "https://demo.supabase.co", key: "sb_secret_test", fetchImpl: fake.fetchImpl }));
  const { token } = await registerUser("token_user", "password123");
  await getUserByToken(token);
  assert.ok(fake.tables.solvik_sessions.every((s) => s.token_hash !== token));
  assert.ok(fake.requests.every((r) => !r.query.includes(token)));
});

test("expired sessions are refused and swept on the next sign-in", async () => {
  const fake = fakeSupabase();
  setStore(createSupabaseStore({ url: "https://demo.supabase.co", key: "sb_secret_test", fetchImpl: fake.fetchImpl }));
  const { token } = await registerUser("old_session", "password123");
  fake.tables.solvik_sessions[0].expires_at = Date.now() - 1;
  assert.equal(await getUserByToken(token), null);
  await loginUser("old_session", "password123");
  assert.equal(fake.tables.solvik_sessions.length, 1);
});

test("new sb_secret_ keys go in apikey only; legacy JWT keys also go in Authorization", async () => {
  for (const [key, expectBearer] of [["sb_secret_abc", false], ["eyJhbGciOi.legacy.jwt", true]]) {
    const fake = fakeSupabase();
    setStore(createSupabaseStore({ url: "https://demo.supabase.co", key, fetchImpl: fake.fetchImpl }));
    await getUserByToken("anything");
    const { headers } = fake.requests[0];
    assert.equal(headers.apikey, key);
    assert.equal("Authorization" in headers, expectBearer);
  }
});

test("a Supabase fault is not mistaken for a wrong password", async () => {
  const failing = async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ message: "boom" }) });
  setStore(createSupabaseStore({ url: "https://demo.supabase.co", key: "sb_secret_test", fetchImpl: failing }));
  await assert.rejects(loginUser("someone", "password123"), (err) => !err.httpStatus && /Supabase GET solvik_users failed \(500\)/.test(err.message));
});

test("Supabase is used only when both the URL and a secret key are set", () => {
  assert.equal(supabaseConfigFromEnv({ SUPABASE_URL: "https://x.supabase.co" }), null);
  assert.deepEqual(supabaseConfigFromEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "k" }), { url: "https://x.supabase.co", key: "k" });
  assert.deepEqual(supabaseConfigFromEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "j" }), { url: "https://x.supabase.co", key: "j" });
});
