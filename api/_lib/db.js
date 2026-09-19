// Persistent SQLite database storage for users, authentication, and synced preferences.
// Uses Node's built-in node:sqlite (DatabaseSync) and node:crypto.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let dbInstance = null;

export function getDatabasePath() {
  const customPath = process.env.SOLVIK_DB_PATH;
  if (customPath) return customPath;

  const dataDir = path.resolve(process.cwd(), ".data");
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {
      return ":memory:";
    }
  }
  return path.join(dataDir, "solvik.db");
}

export function initDatabase(dbPath = getDatabasePath()) {
  if (dbPath !== ":memory:") {
    const parentDir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(parentDir)) {
      try {
        fs.mkdirSync(parentDir, { recursive: true });
      } catch {
        // ignore
      }
    }
  }

  const db = new DatabaseSync(dbPath);

  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
  } catch {
    // In-memory or restricted environments may ignore WAL
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      preferences TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);

  return db;
}

export function getDb() {
  if (!dbInstance) {
    try {
      dbInstance = initDatabase();
    } catch (error) {
      // Vercel functions run on a read-only deployment filesystem. SQLite is
      // suitable for local development, but production account sync needs a
      // database adapter backed by a durable external service.
      if (/readonly|read-only|SQLITE_READONLY/i.test(String(error?.message || error))) {
        throw new Error(
          "Account sync is unavailable because this deployment has no writable persistent database. " +
          "Continue as a guest, or connect this app to a durable database service."
        );
      }
      throw error;
    }
  }
  return dbInstance;
}

export function setDb(db) {
  dbInstance = db;
}

export function closeDb() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // already closed
    }
    dbInstance = null;
  }
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

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function registerUser(username, password, initialPreferences = {}) {
  const cleanUsername = String(username || "").trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 30) {
    throw new Error("Username must be between 3 and 30 characters.");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
    throw new Error("Username can only contain letters, numbers, hyphens, and underscores.");
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(cleanUsername);
  if (existing) {
    throw new Error("Username is already taken.");
  }

  const id = crypto.randomUUID();
  const { hash, salt } = hashPassword(password);
  const now = Date.now();
  const prefsJson = JSON.stringify(initialPreferences || {});

  db.prepare(`
    INSERT INTO users (id, username, password_hash, salt, preferences, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, cleanUsername, hash, salt, prefsJson, now, now);

  const token = generateToken();
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, id, now, expiresAt);

  return {
    user: { id, username: cleanUsername },
    token,
    preferences: initialPreferences,
  };
}

export function loginUser(username, password) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername || !password) {
    throw new Error("Username and password are required.");
  }

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(cleanUsername);
  if (!user) {
    throw new Error("Invalid username or password.");
  }

  const valid = verifyPassword(password, user.password_hash, user.salt);
  if (!valid) {
    throw new Error("Invalid username or password.");
  }

  const token = generateToken();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, user.id, now, expiresAt);

  let preferences = {};
  try {
    preferences = JSON.parse(user.preferences || "{}");
  } catch {
    preferences = {};
  }

  return {
    user: { id: user.id, username: user.username },
    token,
    preferences,
  };
}

export function getUserByToken(token) {
  if (!token) return null;
  const db = getDb();
  const now = Date.now();
  const session = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.username, u.preferences
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now);

  if (!session) return null;

  let preferences = {};
  try {
    preferences = JSON.parse(session.preferences || "{}");
  } catch {
    preferences = {};
  }

  return {
    user: { id: session.id, username: session.username },
    preferences,
  };
}

export function saveUserPreferences(token, preferences) {
  if (!token) throw new Error("Authentication token required.");
  const db = getDb();
  const now = Date.now();
  const session = db.prepare(`
    SELECT s.user_id FROM sessions s
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now);

  if (!session) {
    throw new Error("Session expired or invalid.");
  }

  const prefsJson = JSON.stringify(preferences || {});
  db.prepare(`
    UPDATE users SET preferences = ?, updated_at = ?
    WHERE id = ?
  `).run(prefsJson, now, session.user_id);

  return { ok: true, preferences };
}

export function logoutUser(token) {
  if (!token) return { ok: true };
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  return { ok: true };
}
