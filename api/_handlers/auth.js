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
  // Never from the query string: URLs end up in access logs.
  return req.body?.token || null;
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
        const result = await registerUser(username, password, preferences);
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
        const result = await loginUser(username, password);
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
        const account = await getUserByToken(token);
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
        const result = await saveUserPreferences(token, preferences);
        res.status(200).json({ ok: true, preferences: result.preferences });
        return;
      }

      case "logout": {
        const token = extractToken(req);
        if (token) {
          await logoutUser(token);
        }
        res.status(200).json({ ok: true });
        return;
      }

      default:
        res.status(400).json({ error: `Unknown auth action: ${action}` });
    }
  } catch (err) {
    // Errors raised on purpose carry their status and a message meant for the
    // user. Anything else is a database or network fault: logged here, and
    // answered generically so no table names or upstream detail reach the page.
    if (err?.httpStatus) {
      res.status(err.httpStatus).json({ error: err.message });
      return;
    }
    console.error("[auth]", action, err);
    res.status(503).json({ error: "The account service is unavailable right now. Try again shortly, or continue as a guest." });
  }
}
