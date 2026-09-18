// Shared OneMap token fetch + in-memory cache. OneMap's routing and other
// authenticated endpoints need a bearer token obtained from a registered
// account (https://www.onemap.gov.sg/apidocs/register). Search/reverse-geocode
// do not need auth, so only routing goes through this.
let cached = null; // { token, expiresAt }

// Tokens from the OneMap docs playground are short-lived, so never trust a
// stated expiry further out than this.
const MAX_TOKEN_LIFE_MS = 3 * 60 * 60 * 1000;

function envValue(name) {
  const value = process.env[name];
  if (!value) return "";
  const trimmed = String(value).trim();
  return trimmed.replace(/^(['"])(.*)\1$/, "$2").trim();
}

// A stale JWT should never be sent just because it is still present in an
// environment file. OneMap's manually copied tokens are short-lived; when an
// account login is also configured, skipping an expired token lets the server
// mint a fresh one before the route request instead of producing two noisy
// 401 attempts first. Opaque tokens have no readable expiry, so they remain
// valid candidates and OneMap is still the authority on whether to accept them.
export function tokenExpiresSoon(token, now = Date.now()) {
  const payload = String(token || "").split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    const expiresAt = Number(claims.exp) * 1000;
    return Number.isFinite(expiresAt) && expiresAt <= now + 60_000;
  } catch {
    return false;
  }
}

function configuredToken() {
  const token = envValue("ONEMAP_TOKEN");
  return token && !tokenExpiresSoon(token) ? token : "";
}

export function credentialSummary() {
  const token = envValue("ONEMAP_TOKEN");
  const email = envValue("ONEMAP_EMAIL");
  const password = envValue("ONEMAP_PASSWORD");
  return {
    hasStaticToken: !!token,
    staticTokenExpired: !!token && tokenExpiresSoon(token),
    hasLogin: !!(email && password),
    email: email ? email.replace(/(.).*(@.*)/, "$1***$2") : null,
    cachedUntil: cached ? new Date(cached.expiresAt).toISOString() : null,
  };
}

async function mintToken() {
  const email = envValue("ONEMAP_EMAIL");
  const password = envValue("ONEMAP_PASSWORD");
  if (!email || !password) return null;

  const res = await fetch("https://www.onemap.gov.sg/api/auth/post/getToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OneMap token request failed (${res.status}): ${body.slice(0, 200)}`);

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`OneMap token response was not JSON: ${body.slice(0, 200)}`);
  }
  if (!data.access_token) throw new Error("OneMap token response did not include access_token");

  // expiry_timestamp has been seen as both seconds and milliseconds; either way
  // a token must not outlive MAX_TOKEN_LIFE_MS, or a bad value pins a dead
  // token in cache until the process restarts.
  const raw = Number(data.expiry_timestamp);
  const asMs = isFinite(raw) ? (raw > 1e12 ? raw : raw * 1000) : NaN;
  const expiresAt = Math.min(isFinite(asMs) ? asMs : Date.now() + MAX_TOKEN_LIFE_MS, Date.now() + MAX_TOKEN_LIFE_MS);

  cached = { token: data.access_token, expiresAt };
  return cached.token;
}

// `force` skips both the configured static token and the cache, so a rejected
// token can be replaced rather than retried forever.
export async function getOneMapToken({ force = false } = {}) {
  if (!force) {
    const token = configuredToken();
    if (token) return token;
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  } else {
    cached = null;
  }

  const minted = await mintToken();
  if (minted) return minted;

  // No login to fall back on: an unusable static token is all we have.
  const token = configuredToken();
  if (token) return token;

  throw new Error(
    "OneMap credentials are not configured. Set ONEMAP_TOKEN, or ONEMAP_EMAIL + ONEMAP_PASSWORD, as environment variables."
  );
}
