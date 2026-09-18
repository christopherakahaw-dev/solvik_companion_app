// Deciding whether a report is worth passing on.
//
// Two stages, in this order because the first is free and rejects most bad
// input: deterministic gates on where and when the report was made, then a
// vision check on the photo.
//
// What the vision stage can establish is narrower than it looks, and the naming
// here is deliberate. A model can say an image is *consistent* with what was
// reported. It cannot say the report is true — it cannot tell a broken lift from
// a working one with a sign taped to it, and a fresh camera capture carries no
// EXIF to cross-check against. So nothing this module returns is ever called
// "verified", and the UI must not call it that either.

export const MAX_FIX_AGE_MS = 60_000;
export const MAX_ACCURACY_M = 100;
export const MAX_DISTANCE_M = 150;
export const MAX_CAPTURE_AGE_MS = 2 * 60_000;
export const MAX_PER_HOUR = 3;

// Each gate names itself, so a rejection can say which one failed. A silent
// rejection is how you lose the contributors you wanted.
export function locationChecks({ fixAt, accuracy, distanceM, capturedAt, recentCount, now = Date.now() }) {
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok, detail });

  add("fresh-fix", Number.isFinite(fixAt) && now - fixAt <= MAX_FIX_AGE_MS,
    "Your location needs to be current — move to the spot and try again.");
  add("precise-fix", Number.isFinite(accuracy) && accuracy <= MAX_ACCURACY_M,
    `Your position is only accurate to ±${Math.round(accuracy || 0)} m. Step outside or wait for a better fix.`);
  add("at-the-place", Number.isFinite(distanceM) && distanceM <= MAX_DISTANCE_M,
    `You appear to be ${Math.round(distanceM || 0)} m away. Reports have to be made where the problem is.`);
  add("fresh-photo", Number.isFinite(capturedAt) && now - capturedAt <= MAX_CAPTURE_AGE_MS,
    "The photo is too old — take it now, at the problem.");
  add("not-flooding", (recentCount || 0) < MAX_PER_HOUR,
    `You've already filed ${recentCount} reports this hour. That's the limit.`);

  return checks;
}

// The vision stage's answer, defensively parsed: a truncated or malformed body
// must degrade to "unclear", never throw and never silently pass.
export function parseVision(raw) {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  if (!value || typeof value !== "object") {
    return { depicts: "unclear", matchesReport: false, looksLikeTransitStation: false, screenOfAScreen: false, reason: "The photo could not be read.", usable: false };
  }
  return {
    depicts: String(value.depicts || "unclear"),
    matchesReport: value.matchesReport === true,
    looksLikeTransitStation: value.looksLikeTransitStation === true,
    screenOfAScreen: value.screenOfAScreen === true,
    reason: String(value.reason || "").slice(0, 200),
    usable: true,
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// accepted — everything lines up, and it still needs someone else to agree
//            before it earns anything.
// rejected — a gate failed, or the photo is of a screen, or it plainly isn't
//            the thing reported.
export function verdictFor({ checks, vision }) {
  const failed = (checks || []).filter((c) => !c.ok);
  if (failed.length) {
    return { verdict: "rejected", failed, reason: failed[0].detail, checks };
  }
  if (vision && vision.screenOfAScreen) {
    return { verdict: "rejected", failed: [{ id: "screen-of-a-screen", ok: false, detail: "That looks like a photo of a screen. Photograph the problem itself." }], reason: "That looks like a photo of a screen. Photograph the problem itself.", checks };
  }
  if (vision && !vision.matchesReport) {
    const detail = vision.reason || "The photo doesn't appear to show what was reported.";
    return { verdict: "rejected", failed: [{ id: "photo-mismatch", ok: false, detail }], reason: detail, checks };
  }
  return {
    verdict: "accepted",
    failed: [],
    // Said this way on purpose: the checks passed, which is not the same as the
    // report being true. Corroboration is what moves it further.
    reason: "Checks passed. It needs another commuter or LTA to confirm it.",
    checks,
  };
}

// The prompt is narrow by design: consistency questions with yes/no answers,
// nothing that invites the model to judge whether the problem is real.
export function visionPrompt(kindLabel) {
  return [
    `A commuter at a Singapore MRT station or bus stop reported: "${kindLabel}".`,
    "Looking only at this photo, answer whether it is CONSISTENT with that report.",
    "You are not being asked whether the problem is real — only whether the photo could plausibly show it.",
    "Set screenOfAScreen when the image is a photograph of a phone, monitor or printed screenshot rather than a scene.",
    "Keep reason to one short sentence addressed to the person who took it.",
  ].join(" ");
}

export const VISION_SCHEMA = {
  type: "object",
  properties: {
    depicts: { type: "string", enum: ["lift", "escalator", "crowd", "obstruction", "signage", "vehicle", "other", "unclear"] },
    matchesReport: { type: "boolean" },
    looksLikeTransitStation: { type: "boolean" },
    screenOfAScreen: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["depicts", "matchesReport", "looksLikeTransitStation", "screenOfAScreen", "reason"],
  additionalProperties: false,
};
