export async function getNearbyBusStops(lat, lng, options = {}) {
  const res = await fetch("/api/nearby-stops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, limit: options.limit || 8, radiusM: options.radiusM || 1500 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't load nearby bus stops");
  return Array.isArray(data.stops) ? data.stops : [];
}
