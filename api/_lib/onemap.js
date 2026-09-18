// Server-side OneMap calls. Credentials stay here and are never exposed to
// the browser.
import { getOneMapToken, credentialSummary } from "./onemapAuth.js";

const SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const ROUTE_URL = "https://www.onemap.gov.sg/api/public/routingsvc/route";

// Reads the body once as text, then tries JSON. Checking res.ok before parsing
// means an HTML or empty error body reports its real status instead of dying
// in the JSON parser.
async function readBody(res) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Left null; callers fall back to the raw text.
  }
  return { text, json };
}

function upstreamError(label, res, body) {
  const detail = (body.json && (body.json.error || body.json.message)) || body.text.trim().split("\n")[0] || "";
  const err = new Error(`${label} failed (${res.status})${detail ? `: ${String(detail).slice(0, 200)}` : ""}`);
  err.status = res.status;
  return err;
}

const SEARCH_PAGE_LIMIT = 50;
const SEARCH_RESULT_LIMIT = 30;
const SEARCH_CACHE_MS = 5 * 60 * 1000;
const searchCache = new Map();
const nearbyCache = new Map();
let learnedSearchAuth = null;

const NEARBY_FILTERS = new Map([
  ["clinic", ['["amenity"~"^(clinic|doctors|hospital)$"]', '["healthcare"~"^(clinic|doctor|hospital)$"]']],
  ["food centre", ['["amenity"~"^(food_court|restaurant|cafe|fast_food|canteen)$"]']],
  ["mrt station", ['["railway"="station"]', '["station"~"^(subway|light_rail)$"]']],
  ["bus interchange", ['["amenity"="bus_station"]']],
]);

function buildSearchUrl(query, page) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("searchVal", query);
  url.searchParams.set("returnGeom", "Y");
  url.searchParams.set("getAddrDetails", "Y");
  url.searchParams.set("pageNum", String(page));
  return url;
}

async function callSearchPage(query, page, authScheme) {
  const token = authScheme === "public" ? null : await getOneMapToken({ force: authScheme === "refresh" });
  const authorization = authScheme === "bearer" ? `Bearer ${token}` : token;
  const res = await fetch(buildSearchUrl(query, page).toString(), {
    headers: token ? { Authorization: authorization } : {},
    signal: AbortSignal.timeout(12_000),
  });
  return { res, body: await readBody(res) };
}

async function fetchSearchPage(query, page) {
  const credentials = credentialSummary();
  const hasCredentials = credentials.hasStaticToken || credentials.hasLogin;
  const schemes = !hasCredentials ? ["public"] : learnedSearchAuth
    ? [learnedSearchAuth, "raw", "bearer", "refresh"]
    : ["raw", "bearer", "refresh"];
  let lastFailure = null;

  for (const scheme of [...new Set(schemes)]) {
    const { res, body } = await callSearchPage(query, page, scheme);
    if (res.status === 401 || res.status === 403) {
      lastFailure = upstreamError("OneMap search", res, body);
      continue;
    }
    if (!res.ok) throw upstreamError("OneMap search", res, body);
    if (!Array.isArray(body.json?.results)) {
      throw new Error("OneMap search is unavailable. The server may need a valid OneMap token.");
    }
    learnedSearchAuth = scheme === "refresh" ? "raw" : scheme;
    return body.json || {};
  }

  throw lastFailure || new Error("OneMap search returned no usable response");
}

function mapSearchResult(r) {
  return {
    name: r.BUILDING && r.BUILDING !== "NIL" ? r.BUILDING : r.SEARCHVAL,
    searchval: r.SEARCHVAL,
    address: r.ADDRESS,
    postal: r.POSTAL !== "NIL" ? r.POSTAL : null,
    lat: Number(r.LATITUDE),
    lng: Number(r.LONGITUDE),
  };
}

export function distanceMetres(a, b) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRad(Number(a[0]));
  const lat2 = toRad(Number(b[0]));
  const dLat = lat2 - lat1;
  const dLng = toRad(Number(b[1]) - Number(a[1]));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function uniqueValidResults(results) {
  const seen = new Set();
  return results.map(mapSearchResult).filter((result) => {
    if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return false;
    const key = `${result.lat.toFixed(7)},${result.lng.toFixed(7)}|${result.name || result.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function overpassAddress(tags) {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  return [street, tags["addr:postcode"]].filter(Boolean).join(" · ") || tags.description || "Near the dropped pin";
}

async function nearbyCategorySearch(query, near) {
  const normalized = String(query).trim().toLowerCase();
  const filters = NEARBY_FILTERS.get(normalized);
  if (!filters) return null;

  const cacheKey = `${normalized}|${Number(near[0]).toFixed(3)},${Number(near[1]).toFixed(3)}`;
  const cached = nearbyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  const around = `(around:5000,${Number(near[0])},${Number(near[1])})`;
  const statements = filters.map((filter) => `nwr${around}${filter};`).join("");
  const overpassQuery = `[out:json][timeout:12];(${statements});out center tags;`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: overpassQuery }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await readBody(res);
  if (!res.ok) throw upstreamError("Nearby place search", res, body);

  const seen = new Set();
  const results = ((body.json && body.json.elements) || [])
    .map((element) => {
      const tags = element.tags || {};
      const lat = Number(element.lat ?? element.center?.lat);
      const lng = Number(element.lon ?? element.center?.lon);
      const name = tags.name || tags.official_name || tags.operator;
      return {
        name,
        searchval: name,
        address: overpassAddress(tags),
        postal: tags["addr:postcode"] || null,
        lat,
        lng,
        source: "OpenStreetMap",
        distanceMetres: distanceMetres(near, [lat, lng]),
      };
    })
    .filter((result) => {
      if (!result.name || !Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return false;
      const key = result.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distanceMetres - b.distanceMetres)
    .slice(0, SEARCH_RESULT_LIMIT);

  nearbyCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_MS, results });
  return results;
}

async function allSearchResults(query) {
  const key = String(query).trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  const first = await fetchSearchPage(query, 1);
  const totalPages = Math.max(1, Math.min(SEARCH_PAGE_LIMIT, Number(first.totalNumPages) || 1));
  const pages = [first];

  // Small batches avoid turning one nearby search into a burst of dozens of
  // simultaneous calls while still keeping the sheet responsive.
  for (let page = 2; page <= totalPages; page += 4) {
    const numbers = Array.from({ length: Math.min(4, totalPages - page + 1) }, (_, index) => page + index);
    pages.push(...await Promise.all(numbers.map((number) => fetchSearchPage(query, number))));
  }

  const results = uniqueValidResults(pages.flatMap((payload) => payload.results || []));
  searchCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_MS, results });
  return results;
}

export async function oneMapSearch(query, { near } = {}) {
  if (!near) {
    const first = await fetchSearchPage(query, 1);
    return uniqueValidResults(first.results || []);
  }

  // OneMap's text endpoint is an address index, not a semantic nearby-place
  // service. For the four category chips, query mapped POIs inside a real
  // 5 km radius first; if that service has no usable data, fall back to the
  // complete OneMap text result set below.
  try {
    const nearby = await nearbyCategorySearch(query, near);
    if (nearby && nearby.length) return nearby;
  } catch {
    // The authenticated OneMap fallback remains available during a transient
    // community-map outage.
  }

  const results = await allSearchResults(query);
  return results
    .map((result) => ({ ...result, source: "OneMap", distanceMetres: distanceMetres(near, [result.lat, result.lng]) }))
    .sort((a, b) => a.distanceMetres - b.distanceMetres)
    .slice(0, SEARCH_RESULT_LIMIT);
}

const pad = (n) => String(n).padStart(2, "0");

// Accepts either spelling and returns parts, so the wire format can be varied
// independently of what the caller passed.
export function parseDateInput(date) {
  const mdy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(date || ""));
  if (mdy) return { y: +mdy[3], m: +mdy[1], d: +mdy[2] };
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(date || ""));
  if (ymd) return { y: +ymd[1], m: +ymd[2], d: +ymd[3] };
  return null;
}

const DATE_FORMATS = {
  "MM-DD-YYYY": (p) => `${pad(p.m)}-${pad(p.d)}-${p.y}`,
  "YYYY-MM-DD": (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`,
};

// OneMap rejects anything but MM-DD-YYYY for `date` (it says so in a 400), but
// its docs and deployed build disagree on the casing of `mode`, and a mode it
// cannot parse comes back 200 with walking-only itineraries rather than an
// error. So only the casing is probed, and whichever returns transit is kept.
export const REQUEST_VARIANTS = [
  { id: "mode=TRANSIT", modeCase: "upper", dateFormat: "MM-DD-YYYY" },
  { id: "mode=transit", modeCase: "lower", dateFormat: "MM-DD-YYYY" },
];

export function buildRouteUrl({ start, end, routeType = "pt", mode = "transit", date, time, maxWalkDistance = 1000, numItineraries = 3, variant = REQUEST_VARIANTS[0] }) {
  const url = new URL(ROUTE_URL);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  url.searchParams.set("routeType", routeType);
  if (routeType === "pt") {
    if (!date || !time) throw new Error("OneMap routing requires a date and time");
    if (!["transit", "bus", "rail"].includes(String(mode).toLowerCase())) {
      throw new Error("OneMap routing requires mode transit, bus, or rail");
    }
    const parts = parseDateInput(date);
    if (!parts) throw new Error(`OneMap routing got an unrecognised date: ${date}`);
    // OneMap requires a real calendar date; catch 02-30 style input here rather
    // than trading a round trip for the same complaint.
    const probe = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
    if (probe.getUTCMonth() !== parts.m - 1 || probe.getUTCDate() !== parts.d) {
      throw new Error(`OneMap routing got an impossible date: ${date}`);
    }

    url.searchParams.set("date", DATE_FORMATS[variant.dateFormat](parts));
    url.searchParams.set("time", time);
    url.searchParams.set("mode", variant.modeCase === "upper" ? String(mode).toUpperCase() : String(mode).toLowerCase());
    url.searchParams.set("maxWalkDistance", String(maxWalkDistance));
    url.searchParams.set("numItineraries", String(numItineraries));
    // The turn-by-turn lane diagram needs the stops between board and alight.
    url.searchParams.set("showIntermediateStops", "true");
  }
  return url;
}

// A plan that contains nothing but walking is what OneMap returns when it
// cannot use the request, so it does not count as a transit answer.
export function hasTransit(json) {
  const itineraries = (json && json.plan && json.plan.itineraries) || [];
  return itineraries.some((i) => (i.legs || []).some((l) => String(l.mode).toUpperCase() !== "WALK"));
}

// OneMap answers "trip not possible" with HTTP 200 and an OTP-style error
// object, so a 200 is not on its own a success.
export function otpError(json) {
  if (!json || !json.error) return null;
  const e = json.error;
  const msg = typeof e === "string" ? e : e.msg || e.message || "";
  const id = typeof e === "object" && e ? e.id : null;
  return { id, msg: msg || "OneMap could not plan this trip" };
}

// Remembered once per process: the first combination that actually worked.
let learned = { auth: null, variant: null };

export function learnedRequestShape() {
  return { ...learned };
}

async function callOnce(url, authScheme) {
  const token = authScheme === "public" ? null : await getOneMapToken({ force: authScheme === "refresh" });
  const header = authScheme === "bearer" ? `Bearer ${token}` : token;
  const res = await fetch(url.toString(), { headers: { Authorization: header } });
  return { res, body: await readBody(res) };
}

// start/end are "lat,lng" strings. Extra params vary by route type.
export async function oneMapRoute(params) {
  if ((params.routeType || "pt") !== "pt") {
    const url = buildRouteUrl(params);
    const { res, body } = await callOnce(url, learned.auth || "raw");
    if (!res.ok) throw upstreamError("OneMap routing", res, body);
    return body.json || {};
  }

  const authSchemes = learned.auth ? [learned.auth, "raw", "bearer", "refresh"] : ["raw", "bearer", "refresh"];
  const variants = learned.variant
    ? [learned.variant, ...REQUEST_VARIANTS.filter((v) => v.id !== learned.variant.id)]
    : REQUEST_VARIANTS;

  let walkOnlyFallback = null;
  const failures = [];

  const note = (variant, err) => {
    failures.push({ variant: variant.id, message: String(err && err.message ? err.message : err), status: err && err.status, otpErrorId: err && err.otpErrorId });
  };

  for (const variant of variants) {
    const url = buildRouteUrl({ ...params, variant });

    for (const scheme of [...new Set(authSchemes)]) {
      const { res, body } = await callOnce(url, scheme);

      if (res.status === 401 || res.status === 403) {
        note(variant, upstreamError("OneMap routing", res, body));
        continue; // try the next auth scheme
      }
      if (!res.ok) {
        note(variant, upstreamError("OneMap routing", res, body));
        break; // a real upstream fault: another auth scheme will not help
      }

      const otp = otpError(body.json);
      if (otp) {
        const e = new Error(otp.msg);
        e.otpErrorId = otp.id;
        note(variant, e);
        break; // try the next request variant
      }

      if (hasTransit(body.json)) {
        learned = { auth: scheme === "refresh" ? "raw" : scheme, variant };
        return body.json;
      }

      // A valid response with only walking in it — keep it in case every
      // variant says the same, which would mean it is the true answer.
      if (!walkOnlyFallback) walkOnlyFallback = body.json || {};
      break;
    }
  }

  if (walkOnlyFallback) return walkOnlyFallback;
  throw aggregateFailure(failures);
}

// Every spelling failed, so the message has to say what each one was told —
// reporting only the last attempt hides the answer for the others.
export function aggregateFailure(failures) {
  if (!failures.length) return new Error("OneMap routing returned no usable response");

  const distinct = [...new Set(failures.map((f) => f.message))];
  const err = new Error(
    distinct.length === 1
      ? distinct[0]
      : `OneMap routing failed. ${failures.map((f) => `${f.variant}: ${f.message}`).join(" · ")}`
  );
  err.status = failures[0].status;
  err.otpErrorId = failures[0].otpErrorId;
  err.attempts = failures;
  return err;
}
