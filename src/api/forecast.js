// Same-day crowd forecast for named stations, from /api/forecast.
export async function getForecast(codes) {
  const list = (codes || []).filter(Boolean);
  if (!list.length) return { slots: [], series: {}, live: {}, missing: [] };
  const res = await fetch(`/api/forecast?codes=${encodeURIComponent(list.join(","))}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Forecast unavailable");
  return { slots: data.slots || [], series: data.series || {}, live: data.live || {}, missing: data.missing || [], recorded: !!data.recorded };
}
