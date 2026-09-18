// Rain, and what it does to a journey.
//
// The brief names weather as something that must change the recommendation, not
// just decorate it: "a disruption, a crowded platform or heavy rain should
// change what the app recommends, and the app should say why it changed."
//
// Two feeds from data.gov.sg, both free and keyless, so a judge can reproduce
// anything shown here without registering for anything:
//   two-hr-forecast       nowcast per named area
//   twenty-four-hr-forecast   per region, in periods of a few hours
//
// Same discipline as the crowd forecast: never a claim finer than the feed's own
// resolution. The 24-hour feed publishes multi-hour periods, so a warning says
// "around 08:00", never "at 08:12".

// The forecast text is a closed set in the published schema. Grouped by what a
// commuter would actually do differently.
const HEAVY = ["heavy rain", "heavy thundery showers", "heavy thundery showers with gusty winds", "heavy showers"];
const RAIN = ["light rain", "moderate rain", "passing showers", "light showers", "showers", "thundery showers", "strong winds, rain", "strong winds, showers"];

export const WET = "wet";
export const SHOWERS = "showers";
export const DRY = "dry";

// A walking leg in the rain is slower and less pleasant, and the covered route
// becomes worth its extra distance. These are the two numbers the rest of the
// app reads; both are stated on screen rather than folded silently into an ETA.
export const WALK_PENALTY = { [WET]: 1.35, [SHOWERS]: 1.15, [DRY]: 1 };

export function conditionOf(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return null;
  if (HEAVY.some((t) => value.includes(t))) return WET;
  if (RAIN.some((t) => value.includes(t)) || value.includes("rain") || value.includes("shower")) return SHOWERS;
  return DRY;
}

// The map control is glanceable, so preserve useful distinctions that the
// route-ranking buckets intentionally collapse. "Partly cloudy" and "fair"
// are both dry for routing, but should not look identical in the toolbar.
export function singaporeDayPhase(now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now)));
  return hour >= 7 && hour < 19 ? "day" : "night";
}

export function weatherIconName(text, phase = "day") {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return "cloud-off";
  const night = phase === "night";
  if (/thunder|lightning/.test(value)) return night ? "cloud-lightning-night" : "cloud-lightning";
  if (/heavy rain|heavy shower/.test(value)) return night ? "cloud-rain-wind-night" : "cloud-rain-wind";
  if (/rain|shower|drizzle/.test(value)) return "cloud-rain";
  if (/haze|hazy|mist|fog/.test(value)) return night ? "cloud-fog-night" : "cloud-fog";
  if (/wind|gust/.test(value)) return "wind";
  if (/partly|cloud.*sun|sun.*cloud/.test(value)) return night ? "cloud-moon" : "cloud-sun";
  if (/cloud|overcast/.test(value)) return "cloud";
  if (/fair|sun|clear/.test(value)) return night ? "moon" : "sun";
  return night ? "cloud-moon" : "cloud-sun";
}

export function isWet(condition) {
  return condition === WET || condition === SHOWERS;
}

// The nowcast: one entry per named area, which is the finest geography the feed
// offers. Areas carry coordinates, so the nearest one to a walking leg wins.
export function parseNowcast(payload) {
  const data = (payload && payload.data) || {};
  const areas = new Map();
  (data.area_metadata || []).forEach((area) => {
    const ll = area.label_location || {};
    if (!area.name || !Number.isFinite(ll.latitude)) return;
    areas.set(area.name, { name: area.name, ll: [ll.latitude, ll.longitude] });
  });
  const record = (data.items || data.records || [])[0] || {};
  const out = [];
  (record.forecasts || []).forEach((f) => {
    const area = areas.get(f.area);
    if (!area) return;
    out.push({ ...area, text: f.forecast, condition: conditionOf(f.forecast) });
  });
  return { areas: out, validTo: (record.valid_period && record.valid_period.end) || null };
}

// The 24-hour forecast, as periods per region. This is the one that lets the app
// warn before anyone has left the house.
export function parseOutlook(payload) {
  const record = (((payload && payload.data) || {}).records || [])[0] || {};
  const periods = (record.periods || []).map((period) => {
    const regions = period.regions || {};
    const byRegion = {};
    Object.keys(regions).forEach((key) => {
      const text = typeof regions[key] === "string" ? regions[key] : regions[key] && regions[key].text;
      byRegion[key] = { text: text || "", condition: conditionOf(text) };
    });
    return {
      start: (period.timePeriod && period.timePeriod.start) || null,
      end: (period.timePeriod && period.timePeriod.end) || null,
      label: (period.timePeriod && period.timePeriod.text) || "",
      regions: byRegion,
    };
  });
  return { periods, general: (record.general && record.general.forecast && record.general.forecast.text) || "" };
}

// Singapore's regions are coarse enough to pick by latitude and longitude.
export function regionFor(ll) {
  if (!Array.isArray(ll)) return "central";
  const [lat, lng] = ll;
  if (lat > 1.41) return "north";
  if (lat < 1.29) return "south";
  if (lng > 103.88) return "east";
  if (lng < 103.74) return "west";
  return "central";
}

// What the weather will be doing where you are, when you get there.
export function forecastAt({ outlook, ll, at }) {
  if (!outlook || !outlook.periods || !outlook.periods.length) return null;
  const when = Number(at) || Date.now();
  const region = regionFor(ll);
  const period =
    outlook.periods.find((p) => p.start && p.end && Date.parse(p.start) <= when && when < Date.parse(p.end)) || null;
  if (!period) return null;
  const forecast = period.regions[region] || period.regions.central;
  if (!forecast) return null;
  return { ...forecast, region, label: period.label, start: period.start, end: period.end };
}

// The nearest nowcast area — used for "is it raining on me right now".
export function nowcastAt(nowcast, ll) {
  if (!nowcast || !Array.isArray(ll) || !nowcast.areas || !nowcast.areas.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const area of nowcast.areas) {
    const d = (area.ll[0] - ll[0]) ** 2 + (area.ll[1] - ll[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = area;
    }
  }
  return best;
}

// How much longer the walking legs take, and the sentence explaining it. The
// penalty is shown, not hidden: a number that changed without saying why is the
// thing the brief calls out.
export function walkAdjustment({ walkSecs, condition }) {
  const factor = WALK_PENALTY[condition] || 1;
  const extraSecs = Math.round((walkSecs || 0) * (factor - 1));
  return {
    factor,
    extraSecs,
    extraMins: Math.round(extraSecs / 60),
    wet: isWet(condition),
  };
}

// "Moderate rain around 08:00 — your 12 min of walking will take about 4 min
// longer." One sentence, at the feed's own resolution.
export function weatherLine({ forecast, walkSecs }) {
  if (!forecast || !isWet(forecast.condition)) return "";
  const adj = walkAdjustment({ walkSecs, condition: forecast.condition });
  const when = forecast.label ? ` around ${forecast.label}` : "";
  const walk = Math.round((walkSecs || 0) / 60);
  if (!walk) return `${forecast.text}${when}.`;
  return adj.extraMins > 0
    ? `${forecast.text}${when}. Your ${walk} min on foot will take about ${adj.extraMins} min longer.`
    : `${forecast.text}${when}. You have ${walk} min on foot.`;
}

const CONDITION_RANK = { [DRY]: 0, [SHOWERS]: 1, [WET]: 2 };

// Weather attached to one complete route. The feed is coarse, so we compare
// the conditions nearest the start and destination instead of pretending to
// know what happens on every metre of track. Near-term trips can use the
// two-hour nowcast; scheduled trips use the 24-hour regional outlook.
export function routeWeatherProfile({ nowcast, outlook, from, to, departureAt, option, now = Date.now() }) {
  const leaveAt = Number(departureAt) || now;
  const arriveAt = leaveAt + Math.max(0, Number(option?.mins) || 0) * 60_000;
  const candidates = [];
  const add = (forecast, where, source) => {
    if (!forecast || !forecast.condition) return;
    candidates.push({ ...forecast, where, source });
  };

  // The nowcast is useful only for a trip that is about to happen. For a
  // future scenario, the period forecast is the honest source.
  if (Math.abs(leaveAt - now) <= 2 * 60 * 60 * 1000) {
    add(nowcastAt(nowcast, from), "near the start", "Nowcast");
    add(nowcastAt(nowcast, to), "near the destination", "Nowcast");
  }
  add(forecastAt({ outlook, ll: from, at: leaveAt }), "near the start", "Forecast");
  add(forecastAt({ outlook, ll: to, at: arriveAt }), "near the destination", "Forecast");

  const forecast = candidates.sort(
    (a, b) => (CONDITION_RANK[b.condition] ?? -1) - (CONDITION_RANK[a.condition] ?? -1)
  )[0] || null;
  if (!forecast) {
    return {
      available: false,
      condition: null,
      wet: false,
      extraMins: 0,
      adjustedMins: Number(option?.mins) || 0,
      cycling: false,
      title: "Weather unavailable",
      detail: "The route is ranked without a weather adjustment.",
    };
  }

  const walkSecs = Number(option?.walkSecs) || 0;
  const adjustment = walkAdjustment({ walkSecs, condition: forecast.condition });
  const cycling = (option?.legs || []).some((leg) => /cycle|bike/i.test(String(leg)));
  const walkMins = Math.round(walkSecs / 60);
  const when = forecast.label ? ` · ${forecast.label}` : "";
  let detail = `${forecast.source} ${forecast.where}${when}.`;
  if (cycling && adjustment.wet) {
    detail += " Cycling is deprioritised because rain is expected.";
  } else if (adjustment.wet && walkMins) {
    detail += adjustment.extraMins
      ? ` ${walkMins} min walking may take about ${adjustment.extraMins} min longer.`
      : ` ${walkMins} min walking is exposed to rain.`;
  } else if (!adjustment.wet) {
    detail += " No rain adjustment is needed.";
  }

  return {
    available: true,
    condition: forecast.condition,
    wet: adjustment.wet,
    text: forecast.text,
    source: forecast.source,
    where: forecast.where,
    extraMins: adjustment.extraMins,
    adjustedMins: (Number(option?.mins) || 0) + adjustment.extraMins,
    walkMins,
    cycling,
    title: `${forecast.text || "Weather"} on this route`,
    detail,
  };
}

// Preserve OneMap's order in dry weather. In rain, compare the journey time
// after the walking penalty and put a wet cycling option behind a usable
// transit route. The original ETA remains visible; the adjustment is stated
// separately instead of silently changing OneMap's number.
export function rankRoutesForWeather(options, context) {
  const profiled = (options || []).map((option, originalIndex) => ({
    option,
    originalIndex,
    weather: routeWeatherProfile({ ...context, option }),
  }));
  if (!profiled.some((entry) => entry.weather.wet)) return profiled;
  return profiled.sort((a, b) => {
    const aCycle = a.weather.cycling && a.weather.wet ? 1 : 0;
    const bCycle = b.weather.cycling && b.weather.wet ? 1 : 0;
    return aCycle - bCycle
      || a.weather.adjustedMins - b.weather.adjustedMins
      || a.originalIndex - b.originalIndex;
  });
}
