// Account storage in a local SQLite file, for development and tests only.
// Vercel's filesystem is read-only, so production uses supabaseStore.js; this
// module is only loaded when no Supabase project is configured.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

function parsePreferences(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

export function createSqliteStore(dbPath) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
  } catch {
    // In-memory or restricted environments may ignore WAL
  }

  // `sessions.token` holds the SHA-256 of the token, never the token itself.
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
  `);

  return {
    async findUserByUsername(username) {
      const row = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
      return row ? { ...row, preferences: parsePreferences(row.preferences) } : null;
    },
    async insertUser(user) {
      try {
        db.prepare(`
          INSERT INTO users (id, username, password_hash, salt, preferences, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, user.username, user.password_hash, user.salt, JSON.stringify(user.preferences), user.created_at, user.updated_at);
      } catch (error) {
        if (/UNIQUE/i.test(String(error?.message))) {
          const duplicate = new Error("duplicate username");
          duplicate.duplicate = true;
          throw duplicate;
        }
        throw error;
      }
    },
    async insertSession(session) {
      db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .run(session.token_hash, session.user_id, session.created_at, session.expires_at);
    },
    async findSession(tokenHash, now) {
      const row = db.prepare(`
        SELECT u.id, u.username, u.preferences
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?
      `).get(tokenHash, now);
      return row ? { id: row.id, username: row.username, preferences: parsePreferences(row.preferences) } : null;
    },
    async updatePreferences(userId, preferences, now) {
      db.prepare("UPDATE users SET preferences = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(preferences), now, userId);
    },
    async deleteSession(tokenHash) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(tokenHash);
    },
    async deleteExpiredSessions(userId, now) {
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").run(userId, now);
    },
    close() {
      try {
        db.close();
      } catch {
        // already closed
      }
    },
  };
}
