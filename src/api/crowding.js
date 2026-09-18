// Live station crowding from /api/crowding, optionally for a forecast slot.
export async function getCrowding(at) {
  const res = await fetch(`/api/crowding${at ? `?at=${encodeURIComponent(at)}` : ""}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Crowding unavailable");
  return { stations: data.stations || [], slots: data.slots || [], at: data.at || null, recorded: !!data.recorded };
}
