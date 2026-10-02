// Account storage in a Supabase Postgres database, through its REST API.
//
// The server talks to Supabase with the project's secret (service role) key,
// which bypasses row-level security. The tables have RLS switched on with no
// policies (see supabase/migrations), so the public anon key that a browser
// could hold can read nothing. The secret key must never get a VITE_ prefix.
//
// Plain fetch rather than @supabase/supabase-js: five small queries do not
// justify another dependency in the function bundle.

const USERS = "solvik_users";
const SESSIONS = "solvik_sessions";

export function supabaseConfigFromEnv(env = process.env) {
  const url = String(env.SUPABASE_URL || "").trim();
  const key = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

export function createSupabaseStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, "")}/rest/v1`;
  // Legacy service-role keys are JWTs and go in Authorization as well; the
  // newer sb_secret_ keys are not JWTs and belong in the apikey header only.
  const auth = { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
  const eq = (value) => `eq.${encodeURIComponent(value)}`;

  async function call(pathAndQuery, { method = "GET", body, prefer } = {}) {
    const res = await fetchImpl(`${base}/${pathAndQuery}`, {
      method,
      headers: { ...auth, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Left null; the status says what happened.
    }
    if (!res.ok) {
      const err = new Error(`Supabase ${method} ${pathAndQuery.split("?")[0]} failed (${res.status})${json?.message ? `: ${json.message}` : ""}`);
      err.status = res.status;
      // 23505 is Postgres' unique_violation.
      err.duplicate = res.status === 409 || json?.code === "23505";
      throw err;
    }
    return json;
  }

  return {
    async findUserByUsername(username) {
      const rows = await call(`${USERS}?select=*&username_lower=${eq(username.toLowerCase())}&limit=1`);
      return rows?.[0] || null;
    },
    async insertUser(user) {
      await call(USERS, {
        method: "POST",
        prefer: "return=minimal",
        body: { ...user, username_lower: user.username.toLowerCase() },
      });
    },
    async insertSession(session) {
      await call(SESSIONS, { method: "POST", prefer: "return=minimal", body: session });
    },
    async findSession(tokenHash, now) {
      const rows = await call(`${SESSIONS}?select=user:${USERS}(id,username,preferences)&token_hash=${eq(tokenHash)}&expires_at=gt.${now}&limit=1`);
      const user = rows?.[0]?.user;
      return user ? { id: user.id, username: user.username, preferences: user.preferences || {} } : null;
    },
    async updatePreferences(userId, preferences, now) {
      await call(`${USERS}?id=${eq(userId)}`, { method: "PATCH", prefer: "return=minimal", body: { preferences, updated_at: now } });
    },
    async deleteSession(tokenHash) {
      await call(`${SESSIONS}?token_hash=${eq(tokenHash)}`, { method: "DELETE", prefer: "return=minimal" });
    },
    async deleteExpiredSessions(userId, now) {
      await call(`${SESSIONS}?user_id=${eq(userId)}&expires_at=lte.${now}`, { method: "DELETE", prefer: "return=minimal" });
    },
    close() {},
  };
}
