// Authentication handler for user accounts.
//
// Manages registration, credential login, session validation, preference
// syncing, and logout backed by the SQLite database.

import {
  getDb,
  registerUser,
  authenticateUser,
  createSession,
  validateSession,
  destroySession,
  updateUserPreferences,
} from "../_lib/db.js";

function getAuthToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const customHeader = req.headers?.["x-auth-token"];
  if (customHeader && typeof customHeader === "string") {
    return customHeader.trim();
  }
  return req.body?.token || null;
}

function resolveAction(req) {
  if (req.query?.action) return String(req.query.action).toLowerCase();
  if (req.body?.action) return String(req.body.action).toLowerCase();
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    const segments = pathname.replace(/^\/api\/auth\/?/, "").split("/").filter(Boolean);
    if (segments.length) return segments[0].toLowerCase();
  } catch {
    // Fall back to method-based routing
  }
  if (req.method === "GET") return "me";
  return "login";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");

  const db = getDb();
  const action = resolveAction(req);

  try {
    // 1. REGISTER
    if (action === "register") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed. Use POST to register." });
      }
      const { username, password, preferences, savedPlaces } = req.body || {};
      const user = registerUser(db, { username, password, preferences, savedPlaces });
      const { token, expiresAt } = createSession(db, user.id);
      return res.status(201).json({
        success: true,
        token,
        expiresAt,
        user,
      });
    }

    // 2. LOGIN
    if (action === "login") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed. Use POST to log in." });
      }
      const { username, password } = req.body || {};
      const user = authenticateUser(db, { username, password });
      const { token, expiresAt } = createSession(db, user.id);
      return res.status(200).json({
        success: true,
        token,
        expiresAt,
        user,
      });
    }

    // 3. ME (Session Verification)
    if (action === "me") {
      const token = getAuthToken(req);
      if (!token) {
        return res.status(401).json({ error: "No authentication token provided." });
      }
      const user = validateSession(db, token);
      if (!user) {
        return res.status(401).json({ error: "Invalid or expired session token." });
      }
      return res.status(200).json({
        success: true,
        user,
      });
    }

    // 4. UPDATE PREFERENCES
    if (action === "preferences") {
      if (req.method !== "PUT" && req.method !== "POST") {
        res.setHeader("Allow", "PUT, POST");
        return res.status(405).json({ error: "Method not allowed. Use PUT or POST." });
      }
      const token = getAuthToken(req);
      if (!token) {
        return res.status(401).json({ error: "No authentication token provided." });
      }
      const user = validateSession(db, token);
      if (!user) {
        return res.status(401).json({ error: "Invalid or expired session token." });
      }

      const { preferences, savedPlaces } = req.body || {};
      const updated = updateUserPreferences(db, user.id, { preferences, savedPlaces });
      return res.status(200).json({
        success: true,
        user: updated,
      });
    }

    // 5. LOGOUT
    if (action === "logout") {
      const token = getAuthToken(req);
      if (token) {
        destroySession(db, token);
      }
      return res.status(200).json({
        success: true,
        message: "Logged out successfully.",
      });
    }

    return res.status(400).json({ error: `Unknown authentication action: ${action}` });
  } catch (error) {
    const status = error.message.includes("Invalid username") ||
      error.message.includes("already taken") ||
      error.message.includes("between 2 and 32") ||
      error.message.includes("at least 6")
      ? 400
      : 500;
    return res.status(status).json({ error: error.message || "Authentication error." });
  }
}
