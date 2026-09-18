// Client authentication service for Solvik.
//
// Communicates with /api/auth endpoints to register, login, restore sessions,
// and sync user preferences with the remote SQLite database.

import { loadStored, store, removeStored, KEYS } from "./storage.js";

export function getStoredToken() {
  return loadStored(KEYS.authToken, null);
}

export function setStoredToken(token) {
  if (token) {
    store(KEYS.authToken, token);
  } else {
    removeStored(KEYS.authToken);
  }
}

export function getStoredUser() {
  return loadStored(KEYS.authUser, null);
}

export function setStoredUser(user) {
  if (user) {
    store(KEYS.authUser, user);
  } else {
    removeStored(KEYS.authUser);
  }
}

export function isGuestSession() {
  return loadStored(KEYS.isGuest, false) === true;
}

export function setGuestSession(val) {
  if (val) {
    store(KEYS.isGuest, true);
  } else {
    removeStored(KEYS.isGuest);
  }
}

export async function apiRegister({ username, password, preferences, savedPlaces }) {
  const res = await fetch("/api/auth?action=register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, preferences, savedPlaces }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to create account.");
  }
  return data;
}

export async function apiLogin({ username, password }) {
  const res = await fetch("/api/auth?action=login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Invalid username or password.");
  }
  return data;
}

export async function apiGetMe(token) {
  if (!token) return null;
  const res = await fetch("/api/auth?action=me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.success ? data.user : null;
}

export async function apiSyncPreferences(token, { preferences, savedPlaces }) {
  if (!token) return null;
  const res = await fetch("/api/auth?action=preferences", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ preferences, savedPlaces }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to save preferences.");
  }
  return data.user;
}

export async function apiLogout(token) {
  if (!token) return;
  try {
    await fetch("/api/auth?action=logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // Ignore network error on logout
  }
}
