// Everything the app remembers between visits lives behind these two helpers.
// Storage can be unavailable (private mode, blocked site data), so a failure to
// read or write is never allowed to take the session down with it.

import { addressDetail } from "./display.js";

export const KEYS = {
  onboarded: "solvik:onboarded",
  places: "solvik:places",
  preferences: "solvik:preferences",
  commutes: "solvik:commutes",
  searches: "solvik:searches",
  alertsRead: "solvik:alertsRead",
  // Learned and stored on this device: journeys you started, the patterns
  // inferred from them, and the ones you told Solvik to forget. If Gemini is
  // configured, a compact journey summary is sent for analysis; raw memory is
  // still never stored by this app on a remote database.
  journeys: "solvik:journeys",
  aiMemory: "solvik:aiMemory",
  patternsRejected: "solvik:patternsRejected",
  alertSeen: "solvik:alertSeen",
  reports: "solvik:reports",
  rewardRedemptions: "solvik:rewardRedemptions",
  authToken: "solvik:authToken",
  isGuest: "solvik:isGuest",
  authUser: "solvik:authUser",
};

export const PLACE_IDS = ["home", "work", "school"];

export const DEFAULT_PREFERENCES = {
  stepFree: false,
  lessWalking: false,
  avoidCrowds: false,
  studentFare: false,
  routineCommute: false,
  showSavedPlaces: true,
};

export function storageKey(key) {
  return key;
}

export function loadStored(key, fallback) {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(storageKey(key));
    const parsed = raw ? JSON.parse(raw) : fallback;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function store(key, value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Out of quota or storage denied; the session still works.
  }
}

export function removeStored(key) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(storageKey(key));
  } catch {
    // Storage access denied
  }
}

function validCoordinates(value) {
  return Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every((v) => v != null && v !== "" && Number.isFinite(Number(v))) && Math.abs(Number(value[0])) <= 90 && Math.abs(Number(value[1])) <= 180;
}

// Saved places are deliberately small, provider-neutral records. Search text
// is never retained; only the result the user explicitly selected is saved.
export function normalizeSavedPlace(value, id) {
  if (!value) return null;

  // Version 1 saved only free-form strings. Keep the label so the user does
  // not lose it, but do not guess coordinates or draw a potentially wrong
  // home marker until they verify it through search.
  if (typeof value === "string") {
    const name = value.trim();
    return name ? { id, name, address: name, postal: null, ll: null, source: "legacy", verified: false } : null;
  }

  if (typeof value !== "object") return null;
  // `text` was the shape of a short-lived intermediate version; read it too so
  // a place saved then isn't silently dropped on upgrade.
  const name = String(value.name || value.label || value.address || value.text || "").trim();
  if (!name) return null;
  const ll = validCoordinates(value.ll) ? [Number(value.ll[0]), Number(value.ll[1])] : null;
  return {
    id,
    name,
    address: String(value.address || value.detail || name).trim(),
    postal: value.postal ? String(value.postal) : null,
    ll,
    source: value.source === "onemap" && ll ? "onemap" : "legacy",
    verified: value.source === "onemap" && !!ll,
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : undefined,
  };
}

export function loadSavedPlaces() {
  const raw = loadStored(KEYS.places, {});
  const source = raw && raw.version === 2 && raw.places ? raw.places : {
    home: raw && raw.plHome,
    work: raw && raw.plWork,
    school: raw && raw.plSchool,
  };
  return Object.fromEntries(PLACE_IDS.map((id) => [id, normalizeSavedPlace(source && source[id], id)]));
}

export function saveSavedPlaces(places) {
  const normalized = Object.fromEntries(PLACE_IDS.map((id) => [id, normalizeSavedPlace(places && places[id], id)]));
  store(KEYS.places, { version: 2, places: normalized });
  return normalized;
}

export function savedPlaceDetail(place) {
  if (!place) return "";
  return addressDetail(place.address || place.name, place.postal);
}

export function loadPreferences() {
  const raw = loadStored(KEYS.preferences, {});
  const prefs = Object.fromEntries(
    Object.entries(DEFAULT_PREFERENCES).map(([key, fallback]) => [key, typeof raw?.[key] === "boolean" ? raw[key] : fallback])
  );
  // Persona is the one preference that is not a boolean: which of the three
  // commuters in the brief this person is.
  prefs.persona = typeof raw?.persona === "string" ? raw.persona : null;
  prefs.scenario = typeof raw?.scenario === "string" ? raw.scenario : null;
  return prefs;
}

export function savePreferences(prefs) {
  store(KEYS.preferences, prefs);
  return prefs;
}

export function clearAllUserData() {
  if (typeof localStorage === "undefined") return;
  Object.values(KEYS).forEach((key) => {
    try {
      localStorage.removeItem(storageKey(key));
    } catch {
      // Storage may be blocked. Clearing what is available is still useful.
    }
  });
}

const MAX_SEARCHES = 8;

// Destinations the user actually travelled to, newest first. Matching on name
// and coordinate keeps the same place from filling the list.
export function rememberSearch(dest, now = Date.now()) {
  if (!dest || !dest.name || !dest.ll) return loadStored(KEYS.searches, []);
  const entry = { name: dest.name, detail: dest.detail || "", ll: dest.ll, kind: dest.kind || null, at: now };
  const same = (a, b) =>
    a.name === b.name && Math.abs((a.ll[0] || 0) - (b.ll[0] || 0)) < 1e-6 && Math.abs((a.ll[1] || 0) - (b.ll[1] || 0)) < 1e-6;
  const list = [entry, ...loadStored(KEYS.searches, []).filter((p) => p && p.ll && !same(p, entry))].slice(0, MAX_SEARCHES);
  store(KEYS.searches, list);
  return list;
}

export function recentSearches() {
  return loadStored(KEYS.searches, []).filter((p) => p && p.name && Array.isArray(p.ll));
}

export function clearSearches() {
  store(KEYS.searches, []);
  return [];
}

const READ_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Read alerts are kept by content id rather than list position: LTA's feed
// reorders, and an alert that briefly disappears shouldn't come back unread.
export function loadReadAlerts(now = Date.now()) {
  const raw = loadStored(KEYS.alertsRead, {});
  const out = {};
  Object.keys(raw || {}).forEach((id) => {
    const at = Number(raw[id]);
    if (isFinite(at) && now - at < READ_TTL_MS) out[id] = at;
  });
  return out;
}

export function markAlertsRead(ids, current, now = Date.now()) {
  const next = { ...(current || {}) };
  (Array.isArray(ids) ? ids : [ids]).filter(Boolean).forEach((id) => {
    next[id] = now;
  });
  store(KEYS.alertsRead, next);
  return next;
}

// A stable id for an alert, derived from what it says. Same wording, same id.
export function alertId(item) {
  const text = [item.line, item.tag, item.title, item.detail].filter(Boolean).join("|");
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return `a${hash.toString(36)}`;
}
