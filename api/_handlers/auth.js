// Endpoint for user authentication, registration, session validation,
// and user preference synchronization.
import {
  registerUser,
  loginUser,
  getUserByToken,
  saveUserPreferences,
  logoutUser,
} from "../_lib/db.js";

function extractToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return req.body?.token || req.query?.token || null;
}

export default async function handler(req, res) {
  // Disallow GET or other methods for mutation
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = req.body || {};
  const action = String(body.action || req.query?.action || "login").toLowerCase();

  try {
    switch (action) {
      case "register": {
        const { username, password, preferences } = body;
        const result = registerUser(username, password, preferences);
        res.status(201).json({
          ok: true,
          user: result.user,
          token: result.token,
          preferences: result.preferences,
        });
        return;
      }

      case "login": {
        const { username, password } = body;
        const result = loginUser(username, password);
        res.status(200).json({
          ok: true,
          user: result.user,
          token: result.token,
          preferences: result.preferences,
        });
        return;
      }

      case "me": {
        const token = extractToken(req);
        if (!token) {
          res.status(401).json({ error: "Not authenticated." });
          return;
        }
        const account = getUserByToken(token);
        if (!account) {
          res.status(401).json({ error: "Session expired or invalid." });
          return;
        }
        res.status(200).json({
          ok: true,
          user: account.user,
          preferences: account.preferences,
        });
        return;
      }

      case "save-preferences": {
        const token = extractToken(req);
        if (!token) {
          res.status(401).json({ error: "Not authenticated." });
          return;
        }
        const { preferences } = body;
        if (!preferences || typeof preferences !== "object") {
          res.status(400).json({ error: "Preferences payload must be an object." });
          return;
        }
        const result = saveUserPreferences(token, preferences);
        res.status(200).json({ ok: true, preferences: result.preferences });
        return;
      }

      case "logout": {
        const token = extractToken(req);
        if (token) {
          logoutUser(token);
        }
        res.status(200).json({ ok: true });
        return;
      }

      default:
        res.status(400).json({ error: `Unknown auth action: ${action}` });
    }
  } catch (err) {
    const message = err?.message || "Authentication error.";
    const status = message.includes("Invalid") || message.includes("expired")
      ? 401
      : message.includes("already taken") || message.includes("between 3 and 30") || message.includes("at least 6")
      ? 400
      : message.includes("Account sync is unavailable")
      ? 503
      : 500;
    res.status(status).json({ error: message });
  }
}
