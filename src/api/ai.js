async function ask(action, payload) {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "AI assistance is temporarily unavailable.");
  return data;
}

export function analyseCommuteMemory(payload) {
  return ask("memory", payload);
}

export function rankRouteOptions(payload) {
  return ask("route", payload);
}

