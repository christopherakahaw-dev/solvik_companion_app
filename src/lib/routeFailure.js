const MODE_LABELS = {
  bus: "Bus",
  train: "Train",
  transit: "Transit",
  walk: "Walk",
  cycle: "Cycle",
  express: "Express",
};

const RECOVERY_MODES = {
  bus: ["transit", "walk", "cycle"],
  train: ["transit", "bus", "walk"],
  transit: ["bus", "train", "walk"],
  walk: ["transit", "cycle", "bus"],
  cycle: ["transit", "walk", "bus"],
  express: ["transit", "train", "bus"],
};

export function routeRecoveryModes(mode) {
  return (RECOVERY_MODES[mode] || RECOVERY_MODES.transit).map((id) => ({ id, label: MODE_LABELS[id] }));
}

export function routeFailure(error, mode = "transit") {
  const technical = String(error || "Routing unavailable").trim();
  const lower = technical.toLowerCase();

  if (/select a starting place|choose a starting place/.test(lower)) {
    return {
      title: "Choose a starting point",
      detail: "Select one of the search results for your starting place, then Solvik can plan the journey.",
      technical,
      retry: false,
      alternatives: false,
    };
  }

  if (/unable to get mrt route|mrt route/.test(lower) || (mode === "train" && /404|no route|not found/.test(lower))) {
    return {
      title: "No train-only route found",
      detail: "OneMap could not connect these exact places by rail alone. Try Transit to include the bus or walk needed to reach a station.",
      technical,
      retry: true,
      alternatives: true,
    };
  }

  if (/404|no route|not found/.test(lower)) {
    return {
      title: `No ${MODE_LABELS[mode]?.toLowerCase() || "matching"} route found`,
      detail: "That travel mode does not connect these exact places right now. Try another way to travel or adjust the starting point.",
      technical,
      retry: true,
      alternatives: true,
    };
  }

  if (/401|403|500|502|503|504|network|fetch|unavailable|timed out|timeout/.test(lower)) {
    return {
      title: "Routes are temporarily unavailable",
      detail: "Your places are still here. Try the request again or switch travel mode while the live routing service recovers.",
      technical,
      retry: true,
      alternatives: true,
    };
  }

  return {
    title: "We couldn’t plan this route",
    detail: "Try again, choose another travel mode, or adjust one of the places.",
    technical,
    retry: true,
    alternatives: true,
  };
}
