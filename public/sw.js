// Solvik's service worker: makes the app open with no signal (underground,
// in a lift) and installable from the browser.
//
// What it caches, and what it deliberately never does:
//   - The app shell (the page, its hashed JS/CSS, icons, fonts): yes. These are
//     the same for everyone and safe to replay.
//   - /api/ responses: never. Crowding, arrivals and alerts are only worth
//     anything live; replaying a cached one would pass stale data off as
//     current. The app keeps its own clearly-labelled copy of the last routes
//     you planned instead (see src/lib/savedRoutes.js).
//   - Map tiles: not stored here. They come from OneMap or MapTiler under their
//     own terms, and the browser's normal HTTP cache already applies to them.
//
// Bump VERSION when this file's caching rules change; old caches are dropped.
const VERSION = "v1";
const SHELL = `solvik-shell-${VERSION}`;
const RUNTIME = `solvik-runtime-${VERSION}`;

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/solvik-favicon.svg?v=2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("solvik-") && key !== SHELL && key !== RUNTIME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(SHELL)).put("/", response.clone());
    return response;
  } catch {
    // Every route is the same single-page app, so the cached "/" serves any URL.
    return (await caches.match("/")) || Response.error();
  }
}

// Vite fingerprints /assets/ files, so a cached copy can never be out of date.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(RUNTIME)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return; // live data: straight to the network
    if (request.mode === "navigate") return event.respondWith(networkFirstPage(request));
    if (url.pathname.startsWith("/assets/")) return event.respondWith(cacheFirst(request));
    return event.respondWith(staleWhileRevalidate(request));
  }

  if (FONT_HOSTS.has(url.hostname)) return event.respondWith(staleWhileRevalidate(request));
  // Everything else cross-origin (map tiles, OneMap search) is left to the browser.
});
