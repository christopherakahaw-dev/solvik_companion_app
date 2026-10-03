// The nearest building or block to a point, or null when nothing is close.
export async function getPlaceAt([lat, lng]) {
  const res = await fetch(`/api/place-at?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't name this place");
  return data.place || null;
}
