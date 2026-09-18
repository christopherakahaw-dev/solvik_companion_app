// Thin client for the OneMap proxy endpoints in /api. Every function throws
// on failure (network error, missing server credentials, no results) so
// callers can fall back to illustrative data when live keys aren't wired up
// yet — see src/lib/withFallback.js.

export async function searchPlaces(query, { signal, near } = {}) {
  const body = { query };
  if (Array.isArray(near) && near.length === 2) body.near = near;
  const res = await fetch("/api/onemap-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "OneMap search failed");
  return data.results;
}

// start/end: [lat, lng]
export async function getPublicTransportRoute(start, end, { date, time, mode = "TRANSIT" } = {}) {
  const body = {
    start: `${start[0]},${start[1]}`,
    end: `${end[0]},${end[1]}`,
    routeType: "pt",
    mode,
  };
  if (date) body.date = date;
  if (time) body.time = time;
  const res = await fetch("/api/onemap-route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "OneMap routing failed");
  return data;
}

export async function getWalkingRoute(start, end) {
  const body = {
    start: `${start[0]},${start[1]}`,
    end: `${end[0]},${end[1]}`,
    routeType: "walk",
  };
  const res = await fetch("/api/onemap-route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "OneMap routing failed");
  return data;
}
