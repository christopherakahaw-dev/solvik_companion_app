// Gemini assists with two bounded decisions. It never creates a route: it can
// only rank the real OneMap options supplied by the app. Memory analysis is
// returned to the same browser that supplied the recent journey summaries.
import { generateStructured, geminiConfigured, geminiModel } from "../_lib/gemini.js";

const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    selectedIndex: { type: "integer", minimum: 0, maximum: 4 },
    reason: { type: "string" },
    alternatives: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: { index: { type: "integer" }, reason: { type: "string" } },
        required: ["index", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["selectedIndex", "reason", "alternatives"],
  additionalProperties: false,
};

const MEMORY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    priorities: {
      type: "array",
      maxItems: 4,
      items: { type: "string", enum: ["comfort", "predictability", "speed", "less-walking", "fewer-changes", "low-crowding", "cycling", "accessibility"] },
    },
    preferredModes: {
      type: "array",
      maxItems: 4,
      items: { type: "string", enum: ["bus", "train", "transit", "walk", "cycle", "express"] },
    },
  },
  required: ["summary", "confidence", "priorities", "preferredModes"],
  additionalProperties: false,
};

const short = (value, max = 180) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function cleanRouteInput(body) {
  return {
    persona: short(body?.persona, 40),
    preferences: body?.preferences && typeof body.preferences === "object" ? body.preferences : {},
    memory: body?.memory && typeof body.memory === "object" ? body.memory : null,
    weather: body?.weather && typeof body.weather === "object" ? body.weather : null,
    options: (Array.isArray(body?.options) ? body.options : []).slice(0, 5).map((option, index) => ({
      index,
      optionNumber: index + 1,
      minutes: Math.max(0, number(option?.minutes)),
      walkMinutes: Math.max(0, number(option?.walkMinutes)),
      transfers: Math.max(0, number(option?.transfers)),
      crowd: short(option?.crowd, 20) || "unknown",
      accessibility: Math.max(0, Math.min(1, number(option?.accessibility, 1))),
      legs: (Array.isArray(option?.legs) ? option.legs : []).slice(0, 8).map((leg) => short(leg, 60)),
      weather: option?.weather && typeof option.weather === "object" ? option.weather : null,
      events: (Array.isArray(option?.events) ? option.events : []).slice(0, 6).map((event) => short(event, 160)),
    })),
  };
}

export function normalizeOptionNumbers(decision) {
  if (!decision) return decision;
  const reasons = [decision.reason, ...(decision.alternatives || []).map((item) => item.reason)];
  const usedZeroBasedLabels = reasons.some((reason) => /\boption\s+0\b/i.test(String(reason || "")));
  if (!usedZeroBasedLabels) return decision;
  const increment = (reason) => String(reason || "").replace(/\b(option\s+)([0-4])\b/gi, (_, label, value) => `${label}${Number(value) + 1}`);
  return {
    ...decision,
    reason: increment(decision.reason),
    alternatives: (decision.alternatives || []).map((item) => ({ ...item, reason: increment(item.reason) })),
  };
}

export function cleanMemoryInput(body) {
  return {
    persona: short(body?.persona, 40),
    preferences: body?.preferences && typeof body.preferences === "object" ? body.preferences : {},
    journeys: (Array.isArray(body?.journeys) ? body.journeys : []).slice(0, 40).map((journey) => ({
      at: number(journey?.at),
      from: short(journey?.fromName, 80),
      to: short(journey?.toName, 80),
      mode: short(journey?.mode, 20),
      legs: (Array.isArray(journey?.legs) ? journey.legs : []).slice(0, 6).map((leg) => short(leg, 60)),
      completed: journey?.completed === true,
    })),
  };
}

function validRouteDecision(result, optionCount) {
  if (!result || !Number.isInteger(result.selectedIndex) || result.selectedIndex < 0 || result.selectedIndex >= optionCount) return null;
  return {
    selectedIndex: result.selectedIndex,
    reason: short(result.reason, 360),
    alternatives: (Array.isArray(result.alternatives) ? result.alternatives : [])
      .filter((item) => Number.isInteger(item?.index) && item.index >= 0 && item.index < optionCount && item.index !== result.selectedIndex)
      .slice(0, optionCount - 1)
      .map((item) => ({ index: item.index, reason: short(item.reason, 260) })),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!geminiConfigured()) return res.status(200).json({ configured: false });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    if (body.action === "route") {
      const input = cleanRouteInput(body);
      if (!input.options.length) return res.status(400).json({ error: "At least one real route option is required." });
      const result = await generateStructured({
        schema: ROUTE_SCHEMA,
        maxOutputTokens: 900,
        prompt: [
          "You rank real Singapore commute options. Choose only an option index present in the JSON.",
          "Never invent a route, timing, event or transport leg. Treat official breakdowns, lift outages and road incidents as important constraints.",
          "Use weather, crowding, accessibility, explicit preferences and learned priorities. A step-free preference is a hard constraint when a more accessible option exists.",
          "The index field is zero-based and is only for selectedIndex. In user-facing reasons, use optionNumber instead: the first route is Option 1, never Option 0.",
          "Keep each reason to one short sentence of at most 25 words. Summarize the main preference match and material tradeoff or disruption. Mention weather or crowding only when it changes the choice; the UI already shows their status. Omit option numbers, filler, and claims about absent disruptions. Preserve meaningful uncertainty.",
          "Explain why each other option fits less well using only supplied facts. Do not mention AI and do not use generic claims such as 'best balance' without naming the deciding evidence.",
          `INPUT_JSON=${JSON.stringify(input)}`,
        ].join("\n"),
      });
      const decision = normalizeOptionNumbers(validRouteDecision(result, input.options.length));
      if (!decision) throw new Error("Gemini selected a route that was not supplied.");
      return res.status(200).json({ configured: true, model: geminiModel(), decision });
    }

    if (body.action === "memory") {
      const input = cleanMemoryInput(body);
      if (input.journeys.length < 2) return res.status(200).json({ configured: true, model: geminiModel(), insight: null });
      const result = await generateStructured({
        schema: MEMORY_SCHEMA,
        maxOutputTokens: 650,
        prompt: [
          "Summarise repeated commute behaviour from the supplied deliberate journey records.",
          "Do not infer sensitive traits, identity, home/work labels, or anything absent from the records. Do not claim a routine from one trip.",
          "Priorities must reflect observable mode, completion and route choices. Keep summary to one short sentence and do not mention AI.",
          `INPUT_JSON=${JSON.stringify(input)}`,
        ].join("\n"),
      });
      const insight = result && typeof result === "object" ? {
        summary: short(result.summary, 300),
        confidence: ["low", "medium", "high"].includes(result.confidence) ? result.confidence : "low",
        priorities: (Array.isArray(result.priorities) ? result.priorities : []).slice(0, 4),
        preferredModes: (Array.isArray(result.preferredModes) ? result.preferredModes : []).slice(0, 4),
        updatedAt: Date.now(),
      } : null;
      return res.status(200).json({ configured: true, model: geminiModel(), insight });
    }

    return res.status(400).json({ error: "Unknown AI action." });
  } catch (error) {
    return res.status(502).json({ error: String(error?.message || error), configured: true, model: geminiModel() });
  }
}
