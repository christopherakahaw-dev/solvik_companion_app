// Nearest bus stop to a coordinate, for filing a report against a real stop.
export async function getNearestStop(lat, lng) {
  const res = await fetch("/api/nearest-stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't find your stop");
  return data;
}
