// A small, explainable on-device agent. It deliberately stores only trip
// intent (a place label and when it was selected), never raw location traces.
const MAX_HISTORY = 40;

export function recordDestination(history = [], destination, at = Date.now()) {
  if (!destination || !destination.name) return history;
  const name = String(destination.name).trim();
  const key = name.toLowerCase();
  const prior = history.find((item) => item.key === key);
  const next = (prior ? history.filter((item) => item.key !== key) : history).concat({
    key,
    name,
    detail: destination.detail || "",
    ll: destination.ll || null,
    count: (prior ? prior.count : 0) + 1,
    lastUsedAt: at,
  });
  return next.sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_HISTORY);
}

export function commonDestinations(history = [], minUses = 2) {
  return history.filter((item) => item.count >= minUses).sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt);
}

function routeText(commute, places) {
  const from = places.find((p) => p.id === commute.from);
  const to = places.find((p) => p.id === commute.to);
  return [from && from.label, from && from.place, to && to.label, to && to.place].filter(Boolean).join(" ").toLowerCase();
}

function activeToday(commute, now) {
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
  return (commute.days || []).includes(day);
}

export function analyseCommutes({ commutes = [], places = [], faults = [], now = new Date() }) {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const active = commutes
    .filter((commute) => activeToday(commute, now))
    .map((commute) => ({ ...commute, minutesUntil: (commute.mins - nowMins + 1440) % 1440, routeText: routeText(commute, places) }))
    .filter((commute) => commute.minutesUntil <= 90)
    .sort((a, b) => a.minutesUntil - b.minutesUntil);

  const faultText = faults.map((fault) => `${fault.title || ""} ${fault.detail || ""}`.toLowerCase());
  const match = active.find((commute) => faultText.some((text) => {
    // At least one meaningful place token must occur in the official alert.
    const tokens = commute.routeText.split(/[^a-z0-9]+/).filter((token) => token.length >= 5);
    return tokens.some((token) => text.includes(token));
  }));
  const next = active[0] || null;
  const relevantFault = match ? faults[faultText.findIndex((text) => match.routeText.split(/[^a-z0-9]+/).some((token) => token.length >= 5 && text.includes(token)))] : null;

  if (relevantFault) return { level: "disruption", commute: match, fault: relevantFault, next, monitored: active.length };
  if (next && faults.length) return { level: "network", commute: next, fault: faults[0], next, monitored: active.length };
  if (next) return { level: "clear", commute: next, fault: null, next, monitored: active.length };
  return { level: "idle", commute: null, fault: null, next: null, monitored: 0 };
}
