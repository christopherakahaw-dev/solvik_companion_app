// Accounts: registration, sign-in, sessions and synced preferences.
//
// Where they are stored depends on the environment:
//   - Supabase (SUPABASE_URL + SUPABASE_SECRET_KEY) — production, durable.
//   - A local SQLite file under .data/ — development and tests only.
// A Vercel deployment with no Supabase project configured refuses with
// "Account sync is unavailable", which the client answers by keeping the
// account on the device instead. It used to fall back to an in-memory SQLite
// database there, which accepted registrations and then lost them on the next
// cold start.
import crypto from "node:crypto";
import path from "node:path";
import { createSupabaseStore, supabaseConfigFromEnv } from "./accounts/supabaseStore.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

// Errors carry the HTTP status the auth endpoint should answer with.
function authError(message, httpStatus) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  return err;
}

const INVALID_LOGIN = () => authError("Invalid username or password.", 401);

let store = null;

export function getDatabasePath() {
  return process.env.SOLVIK_DB_PATH || path.resolve(process.cwd(), ".data", "solvik.db");
}

export async function getStore() {
  if (store) return store;
  const supabase = supabaseConfigFromEnv();
  if (supabase) {
    store = createSupabaseStore(supabase);
    return store;
  }
  if (process.env.VERCEL) {
    throw authError(
      "Account sync is unavailable because this deployment has no account database configured. " +
        "Continue as a guest, or set SUPABASE_URL and SUPABASE_SECRET_KEY.",
      503
    );
  }
  const { createSqliteStore } = await import("./accounts/sqliteStore.js");
  store = createSqliteStore(getDatabasePath());
  return store;
}

// For tests: swap in a store, or pass null to go back to the environment's.
export function setStore(next) {
  if (store && store !== next) store.close?.();
  store = next;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const computed = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
}

export function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Only a hash of each session token is stored, so a copy of the database —
// like the one that was once committed to this repo — cannot sign anyone in.
export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function startSession(db, userId, now) {
  const token = generateToken();
  await db.insertSession({ token_hash: hashToken(token), user_id: userId, created_at: now, expires_at: now + SESSION_TTL_MS });
  return token;
}

export async function registerUser(username, password, initialPreferences = {}) {
  const cleanUsername = String(username || "").trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 30) {
    throw authError("Username must be between 3 and 30 characters.", 400);
  }
  if (!USERNAME_PATTERN.test(cleanUsername)) {
    throw authError("Username can only contain letters, numbers, hyphens, and underscores.", 400);
  }
  if (!password || password.length < 6) {
    throw authError("Password must be at least 6 characters.", 400);
  }

  const db = await getStore();
  if (await db.findUserByUsername(cleanUsername)) {
    throw authError("Username is already taken.", 400);
  }

  const id = crypto.randomUUID();
  const { hash, salt } = hashPassword(password);
  const now = Date.now();
  const preferences = initialPreferences || {};
  try {
    await db.insertUser({ id, username: cleanUsername, password_hash: hash, salt, preferences, created_at: now, updated_at: now });
  } catch (error) {
    // Two registrations racing for one name: the database's unique index wins.
    if (error?.duplicate) throw authError("Username is already taken.", 400);
    throw error;
  }

  return { user: { id, username: cleanUsername }, token: await startSession(db, id, now), preferences };
}

export async function loginUser(username, password) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername || !password) {
    throw authError("Username and password are required.", 400);
  }
  // No registered name can fail this, so there is nothing to look up.
  if (!USERNAME_PATTERN.test(cleanUsername)) throw INVALID_LOGIN();

  const db = await getStore();
  const user = await db.findUserByUsername(cleanUsername);
  if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
    throw INVALID_LOGIN();
  }

  const now = Date.now();
  await db.deleteExpiredSessions(user.id, now);
  return {
    user: { id: user.id, username: user.username },
    token: await startSession(db, user.id, now),
    preferences: user.preferences || {},
  };
}

export async function getUserByToken(token) {
  if (!token) return null;
  const db = await getStore();
  const account = await db.findSession(hashToken(token), Date.now());
  if (!account) return null;
  return { user: { id: account.id, username: account.username }, preferences: account.preferences || {} };
}

export async function saveUserPreferences(token, preferences) {
  if (!token) throw authError("Authentication token required.", 401);
  const db = await getStore();
  const account = await db.findSession(hashToken(token), Date.now());
  if (!account) throw authError("Session expired or invalid.", 401);
  await db.updatePreferences(account.id, preferences || {}, Date.now());
  return { ok: true, preferences };
}

export async function logoutUser(token) {
  if (!token) return { ok: true };
  const db = await getStore();
  await db.deleteSession(hashToken(token));
  return { ok: true };
}
