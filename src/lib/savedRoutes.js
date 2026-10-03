// The last few routes you planned, kept on this device so they can still be
// opened with no signal — underground, in a lift lobby, on a flaky connection.
//
// They are a record of what OneMap said when you were online, not a live
// answer, and every option read back from here says when it was saved. Live
// crowding and arrivals are never kept: a saved option is stripped of them.
import { KEYS, loadStored, store } from "./storage.js";

export const SAVED_ROUTES_LIMIT = 6;
export const SAVED_ROUTES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Same destination, mode and roughly the same start (~1 km): a route from the
// other side of the island is not "the route you planned".
export function savedRouteKey({ origin, destLL, destName, mode }) {
  const round = (ll) => (Array.isArray(ll) ? ll.map((n) => Number(n).toFixed(2)).join(",") : "");
  return `${mode}|${String(destName || "").trim().toLowerCase()}|${round(destLL)}|${round(origin)}`;
}

const LIVE_FIELDS = ["crowdLevel", "etaMins", "arrivals", "accessible"];

function withoutLiveData(option) {
  const strip = (item) => {
    const copy = { ...item };
    LIVE_FIELDS.forEach((field) => delete copy[field]);
    return copy;
  };
  return {
    ...strip(option),
    transitLegs: (option.transitLegs || []).map(strip),
    steps: (option.steps || []).map(strip),
  };
}

export function rememberRoutes(key, options, now = Date.now()) {
  // A demo recording is not a route anyone planned.
  if (!key || !Array.isArray(options) || !options.length || options.recorded || options.some((o) => o.recorded)) return;
  const entry = { key, savedAt: now, options: options.map(withoutLiveData) };
  const others = loadStored(KEYS.savedRoutes, []).filter((item) => item && item.key !== key);
  store(KEYS.savedRoutes, [entry, ...others].slice(0, SAVED_ROUTES_LIMIT));
}

// Options marked with when they were saved, or null if there is nothing
// recent enough to be worth showing.
export function savedRoutesFor(key, now = Date.now()) {
  const entry = loadStored(KEYS.savedRoutes, []).find((item) => item && item.key === key);
  if (!entry || !Array.isArray(entry.options) || now - entry.savedAt > SAVED_ROUTES_MAX_AGE_MS) return null;
  return { savedAt: entry.savedAt, options: entry.options.map((option) => ({ ...option, savedAt: entry.savedAt })) };
}

// navigator.onLine only ever errs towards "online", so it is trusted when it
// says offline; a failed fetch with no HTTP status is the other sign.
export function looksOffline(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(String(error?.message || error));
}
