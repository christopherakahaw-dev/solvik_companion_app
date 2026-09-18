// Forecast from /api/weather. Throws on failure so the caller can say the
// forecast is unavailable rather than implying fair weather.
export async function getWeather() {
  const res = await fetch("/api/weather");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't read the weather forecast");
  return data;
}
