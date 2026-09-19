// Frontend client for user authentication and preferences sync.
// Communicates with /api/auth.

import { KEYS, loadStored, store } from "../lib/storage.js";

const LOCAL_TOKEN_PREFIX = "local:";
const PBKDF2_ITERATIONS = 210000;

function normaliseUsername(value) {
  return String(value || "").trim();
}

function encodeBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function secureCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error("This browser cannot securely store an account on this device.");
  }
  return globalThis.crypto;
}

async function passwordVerifier(password, salt) {
  const webCrypto = secureCrypto();
  const passwordBytes = new TextEncoder().encode(String(password));
  const key = await webCrypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveBits"]);
  const derived = await webCrypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return encodeBytes(new Uint8Array(derived));
}

function validateCredentials(username, password) {
  if (username.length < 3 || username.length > 40) {
    throw new Error("Username must be between 3 and 40 characters.");
  }
  if (String(password || "").length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
}

function localAccounts() {
  return loadStored(KEYS.authAccounts, []).filter((account) => account && account.id && account.username && account.salt && account.verifier);
}

function localResult(account) {
  return {
    user: { id: account.id, username: account.username },
    token: `${LOCAL_TOKEN_PREFIX}${account.id}`,
    preferences: account.preferences || {},
    local: true,
  };
}

function localAccountForToken(token) {
  if (typeof token !== "string" || !token.startsWith(LOCAL_TOKEN_PREFIX)) return null;
  return localAccounts().find((account) => account.id === token.slice(LOCAL_TOKEN_PREFIX.length)) || null;
}

async function registerLocal(username, password, preferences) {
  const cleanUsername = normaliseUsername(username);
  validateCredentials(cleanUsername, password);
  const accounts = localAccounts();
  if (accounts.some((account) => account.username.toLocaleLowerCase() === cleanUsername.toLocaleLowerCase())) {
    throw new Error("That username is already registered on this device. Try signing in instead.");
  }

  const webCrypto = secureCrypto();
  const salt = new Uint8Array(16);
  webCrypto.getRandomValues(salt);
  const account = {
    id: webCrypto.randomUUID?.() || encodeBytes(salt),
    username: cleanUsername,
    salt: encodeBytes(salt),
    verifier: await passwordVerifier(password, salt),
    preferences: preferences || {},
  };
  store(KEYS.authAccounts, [...accounts, account]);
  return localResult(account);
}

async function loginLocal(username, password) {
  const cleanUsername = normaliseUsername(username);
  const account = localAccounts().find((item) => item.username.toLocaleLowerCase() === cleanUsername.toLocaleLowerCase());
  if (!account) throw new Error("Invalid username or password.");
  const verifier = await passwordVerifier(password, decodeBytes(account.salt));
  if (verifier !== account.verifier) throw new Error("Invalid username or password.");
  return localResult(account);
}

function canUseLocalAccount(error) {
  const message = String(error?.message || "").toLowerCase();
  return /readonly database|read-only database|sqlite_readonly|no writable persistent database|account sync is unavailable/.test(message);
}

async function requestAuth(body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch("/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({ error: "Network or server error." }));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed with status ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function loginUserApi(username, password) {
  try {
    return await requestAuth({ action: "login", username, password });
  } catch (error) {
    if (canUseLocalAccount(error)) return loginLocal(username, password);
    throw error;
  }
}

export async function registerUserApi(username, password, preferences = {}) {
  try {
    return await requestAuth({ action: "register", username, password, preferences });
  } catch (error) {
    if (canUseLocalAccount(error)) return registerLocal(username, password, preferences);
    throw error;
  }
}

export async function getMeApi(token) {
  const account = localAccountForToken(token);
  if (account) return localResult(account);
  return requestAuth({ action: "me" }, token);
}

export async function savePreferencesApi(token, preferences) {
  const account = localAccountForToken(token);
  if (account) {
    const accounts = localAccounts().map((item) => (item.id === account.id ? { ...item, preferences: preferences || {} } : item));
    store(KEYS.authAccounts, accounts);
    return { ok: true, preferences: preferences || {} };
  }
  return requestAuth({ action: "save-preferences", preferences }, token);
}

export async function logoutUserApi(token) {
  if (localAccountForToken(token)) return { ok: true };
  try {
    await requestAuth({ action: "logout" }, token);
  } catch {
    // Non-critical if offline or network fails
  }
  return { ok: true };
}
