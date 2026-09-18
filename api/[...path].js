// One serverless function, sixteen endpoints.
//
// Vercel's Hobby plan allows twelve serverless functions per deployment, and
// `api/` had one file per endpoint — so the build failed. A
// directory whose name starts with `_` is not scanned for functions (which is
// why `api/_lib/` has always been safe), so every handler now lives in
// `api/_handlers/` and this catch-all route dispatches to them. Every public
// URL is unchanged: /api/weather still reaches api/_handlers/weather.js.
//
// The imports below are written as static specifiers inside thunks on purpose.
// A template-literal import would be invisible to Vercel's dependency tracer
// and the handler files would be left out of the bundle; written this way they
// are traced at build time but still only loaded when their route is asked
// for, so a request for /api/weather does not pay to parse every other handler.
const ROUTES = {
  ai: () => import("./_handlers/ai.js"),
  arrivals: () => import("./_handlers/arrivals.js"),
  auth: () => import("./_handlers/auth.js"),
  coverage: () => import("./_handlers/coverage.js"),
  crowding: () => import("./_handlers/crowding.js"),
  diagnostics: () => import("./_handlers/diagnostics.js"),
  forecast: () => import("./_handlers/forecast.js"),
  lta: () => import("./_handlers/lta.js"),
  "nearest-stop": () => import("./_handlers/nearest-stop.js"),
  "onemap-route": () => import("./_handlers/onemap-route.js"),
  "onemap-search": () => import("./_handlers/onemap-search.js"),
  planned: () => import("./_handlers/planned.js"),
  report: () => import("./_handlers/report.js"),
  road: () => import("./_handlers/road.js"),
  "trip-options": () => import("./_handlers/trip-options.js"),
  weather: () => import("./_handlers/weather.js"),
};

export const ROUTE_NAMES = Object.keys(ROUTES);

// The first path segment names the endpoint. Vercel hands it over in
// req.query.path; falling back to the URL keeps this working under the dev
// server and in tests, which call the dispatcher directly.
export function routeNameFrom(req) {
  const fromQuery = req?.query?.path;
  if (Array.isArray(fromQuery) && fromQuery.length) return String(fromQuery[0]);
  if (typeof fromQuery === "string" && fromQuery) return fromQuery.split("/")[0];
  if (!req?.url) return null;
  const { pathname } = new URL(req.url, "http://localhost");
  return pathname.replace(/^\/api\//, "").split("/")[0] || null;
}

export default async function handler(req, res) {
  const name = routeNameFrom(req);
  const load = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null;
  if (!load) {
    res.status(404).json({ error: `No API endpoint at /api/${name ?? ""}`, endpoints: ROUTE_NAMES });
    return;
  }

  // `path` is the router's own bookkeeping, not a parameter anyone asked for.
  // Handlers read req.query as the caller's query string, so take it back out.
  if (req.query && "path" in req.query) {
    const { path: _routeSegments, ...rest } = req.query;
    req.query = rest;
  }

  const mod = await load();
  return mod.default(req, res);
}
