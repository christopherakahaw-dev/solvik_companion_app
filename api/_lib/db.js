// Database storage and session management for Solvik user accounts.
//
// Backed by Node.js 24's built-in `node:sqlite` module, requiring zero
// third-party compilation binaries. Stores user credentials with salted scrypt
// hashes and persists preferences and places across sessions.

import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let dbInstance = null;

export function getDb(customPath = null) {
  if (dbInstance && !customPath) return dbInstance;

  const dbPath = customPath || process.env.SOLVIK_DB_PATH || path.resolve(process.cwd(), "data", "solvik.db");
  if (dbPath !== ":memory:") {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      preferences TEXT,
      saved_places TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(String(password), salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") return false;
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const derivedKey = crypto.scryptSync(String(password), salt, 64);
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

function sanitizeUser(row) {
  if (!row) return null;
  let preferences = null;
  let savedPlaces = null;
  try {
    preferences = row.preferences ? JSON.parse(row.preferences) : null;
  } catch {
    preferences = null;
  }
  try {
    savedPlaces = row.saved_places ? JSON.parse(row.saved_places) : null;
  } catch {
    savedPlaces = null;
  }
  return {
    id: row.id,
    username: row.username,
    preferences,
    savedPlaces,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerUser(db, { username, password, preferences = null, savedPlaces = null }) {
  const cleanUsername = String(username || "").trim();
  if (cleanUsername.length < 2 || cleanUsername.length > 32) {
    throw new Error("Username must be between 2 and 32 characters.");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
    throw new Error("Username can only contain letters, numbers, underscores, and dashes.");
  }
  const cleanPassword = String(password || "");
  if (cleanPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(cleanUsername);
  if (existing) {
    throw new Error("Username is already taken.");
  }

  const id = crypto.randomUUID();
  const passwordHash = hashPassword(cleanPassword);
  const now = Date.now();
  const prefJson = preferences ? JSON.stringify(preferences) : null;
  const placesJson = savedPlaces ? JSON.stringify(savedPlaces) : null;

  db.prepare(`
    INSERT INTO users (id, username, password_hash, preferences, saved_places, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, cleanUsername, passwordHash, prefJson, placesJson, now, now);

  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return sanitizeUser(row);
}

export function authenticateUser(db, { username, password }) {
  const cleanUsername = String(username || "").trim();
  const cleanPassword = String(password || "");
  if (!cleanUsername || !cleanPassword) {
    throw new Error("Please enter both username and password.");
  }

  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(cleanUsername);
  if (!row) {
    throw new Error("Invalid username or password.");
  }

  if (!verifyPassword(cleanPassword, row.password_hash)) {
    throw new Error("Invalid username or password.");
  }

  return sanitizeUser(row);
}

export function getUserById(db, id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return sanitizeUser(row);
}

export function updateUserPreferences(db, userId, { preferences, savedPlaces }) {
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!current) throw new Error("User not found.");

  const prefJson = preferences !== undefined ? JSON.stringify(preferences) : current.preferences;
  const placesJson = savedPlaces !== undefined ? JSON.stringify(savedPlaces) : current.saved_places;
  const now = Date.now();

  db.prepare(`
    UPDATE users SET preferences = ?, saved_places = ?, updated_at = ? WHERE id = ?
  `).run(prefJson, placesJson, now, userId);

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  return sanitizeUser(updated);
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expiresAt, now);

  return { token, expiresAt };
}

export function validateSession(db, token) {
  if (!token || typeof token !== "string") return null;
  const now = Date.now();
  const session = db.prepare(`
    SELECT s.token, s.user_id, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now);

  if (!session) return null;
  return sanitizeUser(session);
}

export function destroySession(db, token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
