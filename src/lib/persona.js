// Who is reading, and what that changes.
//
// The brief is explicit that this is scored: "The same disruption means
// different things to Rachel, Arjun and Mdm Lim. Generic output serves nobody."
// And: "do not silently build for a generic commuter — that is how apps end up
// serving nobody."
//
// So the same facts produce different advice depending on who asked. Nothing
// here invents data; it decides which of the data already fetched is worth
// interrupting someone about, and how to rank what is offered.

export const PERSONAS = {
  fixed: {
    id: "fixed",
    name: "Fixed Schedule",
    blurb: "Same trip everyday. Notify me when my route gets disrupted.",
    example: "Reliable daily trips with a firm arrival time.",
    mode: "fast",
    // Notifies for any disruption as requested
    interruptAfterMins: 0,
    liftOutageBlocks: false,
    rainChangesRoute: false,
    largeText: false,
    wetMode: "fast",
    busyMode: "quiet",
    featured: true,
    route: {
      from: { id: "home", name: "Tampines", address: "Tampines, Singapore", ll: [1.3531, 103.9453] },
      to: { id: "work", name: "Raffles Place", address: "Raffles Place, Singapore", ll: [1.2841, 103.8515] },
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      leaveMins: 7 * 60 + 40,
      arriveBy: 8 * 60 + 45,
      label: "",
      schedule: "Defaults the fastest routes available",
      expected: "EWL with the walk at both ends",
    },
    fit: "",
    limitation: "Five-minute delays stay quiet; Solvik interrupts only when the impact reaches 15 minutes.",
  },
  flexible: {
    id: "flexible",
    name: "Flexible and Multi-Modal (Default)",
    blurb: "I'm okay with transfers along my journey.",
    example: "Comfort-first travel with quieter times and more ways to go.",
    mode: "quiet",
    interruptAfterMins: 5,
    liftOutageBlocks: false,
    // Weather decides whether he cycles at all.
    rainChangesRoute: true,
    largeText: false,
    wetMode: "walk",
    busyMode: "quiet",
    route: {
      from: { id: "home", name: "Punggol", address: "Punggol, Singapore", ll: [1.4053, 103.9023] },
      to: { id: "work", name: "one-north", address: "one-north, Singapore", ll: [1.2998, 103.7874] },
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      leaveMins: 8 * 60,
      flexibleMins: 60,
      label: "",
      schedule: "Defaults the most comfortable routes with least crowd levels.",
      expected: "Comfort-first transit, bus or cycling",
    },
    fit: "Comfort and predictability rank ahead of raw speed; a quieter departure may win.",
    limitation: "Bike carriage and sheltered-path availability are not published consistently, so Solvik identifies rather than guarantees them.",
  },
  stepFree: {
    id: "stepFree",
    name: "Easy and Accessible",
    blurb: "Suitable for the Elderly and people with mobility issues. I need lifts and shelter.",
    example: "Accessible door-to-door trips with lifts and shorter walks.",
    mode: "step",
    // She will not improvise on a platform, so anything that breaks the route
    // matters however small the time cost.
    interruptAfterMins: 0,
    liftOutageBlocks: true,
    rainChangesRoute: true,
    largeText: true,
    wetMode: "walk",
    busyMode: "step",
    route: {
      from: { id: "home", name: "Bedok", address: "Bedok, Singapore", ll: [1.3239, 103.9300] },
      to: { id: "work", name: "Singapore General Hospital", address: "Outram Road, Singapore General Hospital", ll: [1.2797, 103.8359] },
      days: ["Wed"],
      leaveMins: 9 * 60,
      arriveBy: 10 * 60,
      label: "",
      schedule: "Defaults the routes with the least walking.",
      expected: "Step-free, low-walking door-to-door route",
    },
    fit: "Step-free access, fewer changes and short walks outrank a faster arrival.",
    limitation: "LTA publishes lift maintenance but not complete sheltered-walkway or every exit-accessibility detail.",
  },
};

export const DEFAULT_PERSONA = "flexible";

export function personaOf(id) {
  return PERSONAS[id] || PERSONAS[DEFAULT_PERSONA];
}

export function personaList() {
  return Object.values(PERSONAS);
}

export function scenarioCommute(id, overrides = {}) {
  const persona = personaOf(id);
  const route = {
    ...persona.route,
    ...overrides,
    from: { ...persona.route.from, ...(overrides.from || {}) },
    to: { ...persona.route.to, ...(overrides.to || {}) },
  };
  return {
    from: route.from.id,
    to: route.to.id,
    days: route.days,
    mins: route.leaveMins,
    ...(route.arriveBy != null ? { arriveBy: route.arriveBy } : {}),
    ...(route.flexibleMins ? { flexibleMins: route.flexibleMins } : {}),
    mode: persona.id === "stepFree" ? "Step-free" : persona.id === "flexible" ? "Comfort" : "Fastest",
    legs: persona.id === "fixed" ? ["EWL"] : persona.id === "flexible" ? ["PGL", "NEL", "CCL"] : ["EWL", "NEL"],
    source: "scenario",
    signature: `scenario:${persona.id}`,
    fromPlace: { id: route.from.id, label: route.from.name, place: route.from.address, ll: route.from.ll },
    toPlace: { id: route.to.id, label: route.to.name, place: route.to.address, ll: route.to.ll },
  };
}

export function scenarioDeparture(id, now = new Date()) {
  const persona = personaOf(id);
  const route = persona.route;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const departure = new Date(now);
  departure.setSeconds(0, 0);
  departure.setHours(Math.floor(route.leaveMins / 60), route.leaveMins % 60, 0, 0);
  for (let offset = 0; offset < 8; offset += 1) {
    if (route.days.includes(dayNames[departure.getDay()]) && departure.getTime() > now.getTime()) break;
    departure.setDate(departure.getDate() + 1);
  }
  const pad = (value) => String(value).padStart(2, "0");
  return {
    date: `${pad(departure.getMonth() + 1)}-${pad(departure.getDate())}-${departure.getFullYear()}`,
    time: `${pad(departure.getHours())}:${pad(departure.getMinutes())}:00`,
    label: `${dayNames[departure.getDay()]} ${pad(departure.getHours())}:${pad(departure.getMinutes())}`,
    at: departure.getTime(),
  };
}

const crowdRank = { light: 0, moderate: 1, busy: 2 };

// One concise explanation per option. The first option is the recommendation;
// the others must say why they lost for this specific commuter rather than
// merely repeating their duration.
export function routeFitReason(personaId, option, recommended, isRecommended = false) {
  const p = personaOf(personaId);
  if (!option) return "";
  if (isRecommended) {
    if (p.id === "fixed") return "Best fit · protects the fixed 08:45 arrival with the quickest door-to-door plan.";
    if (p.id === "flexible") return "Best fit · balances crowding, changes and journey time instead of chasing the fastest number.";
    return "Best fit · step-free access and a manageable walk take priority over speed.";
  }

  if (p.id === "fixed") {
    const extra = recommended && option.mins > recommended.mins ? option.mins - recommended.mins : 0;
    if (extra) return `Not first · ${extra} min slower, which leaves less protection for the 08:45 deadline.`;
    if (option.transfers > (recommended?.transfers ?? option.transfers)) return "Not first · an extra change adds risk without saving time.";
    return "Not first · it offers no useful time advantage for a fixed arrival.";
  }
  if (p.id === "flexible") {
    if ((crowdRank[option.crowdLevel] ?? 1) > (crowdRank[recommended?.crowdLevel] ?? 1)) return "Not first · busier than the comfort-first recommendation.";
    if (option.transfers > (recommended?.transfers ?? option.transfers)) return "Not first · more changes make the journey less predictable.";
    if ((option.walkSecs || 0) > (recommended?.walkSecs || 0) + 300) return "Not first · substantially more outdoor walking.";
    return "Not first · it is less predictable without a meaningful comfort gain.";
  }
  if ((option.accessibleScore ?? 1) < 1) return "Not first · not every bus leg is confirmed wheelchair accessible.";
  if ((option.walkSecs || 0) > (recommended?.walkSecs || 0)) return "Not first · more walking is a poor fit for a step-free journey.";
  if (option.transfers > (recommended?.transfers ?? option.transfers)) return "Not first · another interchange increases lift and wayfinding risk.";
  return "Not first · it does not improve step-free confidence.";
}

// The planner mode this persona wants, given what is happening. Crowding and
// rain pull in different directions, and which wins is a property of the person
// rather than of the network.
export function modeFor(persona, { wet = false, busy = false } = {}) {
  const p = personaOf(persona);
  if (wet && p.rainChangesRoute) return p.wetMode;
  if (busy) return p.busyMode;
  return p.mode;
}

// Is this worth interrupting them about? Rachel's threshold is fifteen minutes;
// Mdm Lim's is anything that breaks step-free access, whatever the clock says.
export function shouldInterrupt(persona, { delayMins = 0, liftOutage = false, wet = false } = {}) {
  const p = personaOf(persona);
  if (liftOutage && p.liftOutageBlocks) return true;
  if (wet && p.rainChangesRoute) return true;
  return delayMins >= p.interruptAfterMins && delayMins > 0;
}

// Why this persona is being shown this, in their own terms — so the card can
// say "your commute is step-free, so this blocks the way through" rather than
// stating a fact and leaving the reader to work out whether it applies.
// `blocking` lets the caller override the persona: a commute explicitly set to
// Step-free is a step-free journey whoever is making it, so the setting on the
// trip has to count alongside the setting on the person. Reading only the
// persona would quietly tell a step-free commuter the trains still run.
export function reasonFor(persona, kind, { blocking } = {}) {
  const p = personaOf(persona);
  if (kind === "lift") {
    return (blocking === undefined ? p.liftOutageBlocks : blocking)
      ? "You travel step-free, so this may block the way through."
      : "The trains still run — only the lift is out.";
  }
  if (kind === "rain") {
    return p.rainChangesRoute
      ? "You asked to avoid wet walks, so the route below favours shelter."
      : "Rain on the way. Your route is unchanged.";
  }
  if (kind === "crowd") {
    return p.id === "flexible"
      ? "You would rather wait than stand — leaving later is offered below."
      : "Busy, but on your usual route.";
  }
  return "";
}
