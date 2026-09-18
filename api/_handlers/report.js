// Filing a commuter report.
//
// Reports are checked here but retained only by the browser that filed them.
// There is no account or remote report database.
//
// The photo is used and dropped. It is sent here, checked, and never written
// anywhere — no bucket, no retention, no archive of other people's faces.
import { locationChecks, verdictFor, parseVision, visionPrompt, VISION_SCHEMA, MAX_PER_HOUR } from "../_lib/triage.js";
import { resolveStopCode, distanceMetres, nearestStop, nearestStopCode } from "../_lib/busStops.js";
import { fromDirectory } from "../_lib/stations.js";
import { demoMode } from "../_lib/demo.js";
import { generateStructured, geminiModel } from "../_lib/gemini.js";
import { kindLabel } from "../../src/lib/confidence.js";

const POINTS = { crowd: 30, esc: 25, delay: 30, gantry: 20, bus: 20, aircon: 15 };

// Where the reporter says they are, against where the station actually is.
async function distanceToPlace(code, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Infinity;
  const station = fromDirectory(code);
  if (station && Number.isFinite(station.lat)) return distanceMetres(lat, lng, station.lat, station.lng);
  const stop = await nearestStop(lat, lng).catch(() => null);
  return stop && Number.isFinite(stop.distanceM) ? stop.distanceM : Infinity;
}

// Gemini checks the photo for consistency with the report — never for truth.
// With no key this returns null and the report rests on the other checks alone,
// which is stated rather than hidden.
async function visionCheck(kind, photo) {
  if (!photo) return null;
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(String(photo));
  if (!match) return null;
  return generateStructured({
    prompt: visionPrompt(kindLabel(kind)),
    schema: VISION_SCHEMA,
    image: { mimeType: match[1], data: match[2] },
    temperature: 0,
    maxOutputTokens: 500,
  });
}

// Demo builds: a recorded verdict, so the whole path can be shown without a key
// or a network. Marked recorded, like every other recorded answer in the app.
const RECORDED_VISION = {
  depicts: "lift", matchesReport: true, looksLikeTransitStation: true,
  screenOfAScreen: false, reason: "The photo shows a lift with an out-of-service notice.", usable: true,
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { kind, lat, lng, accuracy, fixAt, capturedAt, photo } = body;
  // A report filed mid-journey names no station — the nav sheet only knows where
  // you are. Resolving it here keeps one triage path instead of two.
  const stationCode = body.stationCode || (await nearestStopCode(Number(lat), Number(lng)).catch(() => null));
  if (!kind || !stationCode) return res.status(400).json({ error: "A report needs a kind, and a place we can find." });

  const code = await resolveStopCode(stationCode, lat, lng).catch(() => stationCode);
  const checks = locationChecks({
    fixAt: Number(fixAt),
    accuracy: Number(accuracy),
    distanceM: await distanceToPlace(stationCode, Number(lat), Number(lng)),
    capturedAt: Number(capturedAt),
    recentCount: Math.max(0, Math.min(MAX_PER_HOUR, Number(body.recentCount) || 0)),
  });

  let vision = null;
  let visionNote = null;
  if (demoMode()) {
    // Demo mode never calls the API, even when a key is configured. It used to
    // try the live call first and fall back, which meant a demo quietly billed
    // for every report filed on stage — the opposite of what demo mode is for.
    vision = RECORDED_VISION;
  } else {
    try {
      const checked = await visionCheck(kind, photo);
      vision = checked ? parseVision(checked) : null;
      if (!vision) visionNote = "The photo was not checked — no image model is configured on this deployment.";
    } catch (err) {
      visionNote = String(err.message || err);
    }
  }

  const outcome = verdictFor({ checks, vision });
  const points = POINTS[kind] || 10;

  if (outcome.verdict === "rejected") {
    // Nothing is written for a rejected report: it earns no points and does not
    // count towards anyone's corroboration.
    return res.status(200).json({ ...outcome, points: 0, pointsState: "none", vision, visionNote, recorded: vision === RECORDED_VISION });
  }

  const createdAt = Date.now();
  return res.status(200).json({
    ...outcome,
    id: `local-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    stationCode: String(code || stationCode).toUpperCase(),
    createdAt,
    points,
    pointsState: "confirmed",
    vision,
    visionNote,
    visionModel: vision && vision !== RECORDED_VISION ? geminiModel() : null,
    recorded: vision === RECORDED_VISION,
    maxPerHour: MAX_PER_HOUR,
  });
}
