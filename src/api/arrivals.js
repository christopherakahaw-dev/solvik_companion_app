// Live bus arrivals for the legs currently on screen, in one request.
export async function getArrivals(keys) {
  const stops = (keys || []).join(",");
  if (!stops) return {};
  const res = await fetch(`/api/arrivals?stops=${encodeURIComponent(stops)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Arrival times unavailable");
  return data.arrivals || {};
}
