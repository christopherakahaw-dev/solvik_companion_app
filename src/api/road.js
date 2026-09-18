// Road conditions from /api/road. Throws so the caller can stay silent about
// traffic rather than implying the roads are clear.
export async function getRoadConditions() {
  const res = await fetch("/api/road");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't read road conditions");
  return data;
}
