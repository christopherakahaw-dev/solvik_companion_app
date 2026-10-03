// Every bus due at each of these stops, keyed by stop code.
export async function getStopArrivals(codes) {
  const list = [...new Set((codes || []).filter(Boolean))];
  if (!list.length) return { stops: {}, recorded: false };
  const res = await fetch(`/api/stop-arrivals?codes=${encodeURIComponent(list.join(","))}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Bus arrival times are unavailable");
  return { stops: data.stops || {}, recorded: !!data.recorded };
}
