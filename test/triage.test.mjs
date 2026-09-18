// The gates a report passes before it counts, and the language used about them.
//
// The point of most of these is the rejection path: a report turned away in
// silence loses you the contributor, so every gate has to name itself and say
// what to do about it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { locationChecks, verdictFor, parseVision, visionPrompt, MAX_ACCURACY_M, MAX_DISTANCE_M } from "../api/_lib/triage.js";

const NOW = Date.UTC(2026, 8, 17, 9, 0, 0);
const good = { fixAt: NOW - 5000, accuracy: 12, distanceM: 40, capturedAt: NOW - 20000, recentCount: 0, now: NOW };
const failing = (over) => locationChecks({ ...good, ...over }).filter((c) => !c.ok).map((c) => c.id);

test("a report made on the spot, just now, passes every gate", () => {
  assert.deepEqual(failing({}), []);
});

test("a stale position is refused", () => {
  assert.deepEqual(failing({ fixAt: NOW - 5 * 60000 }), ["fresh-fix"]);
});

test("a vague position is refused, and says how vague", () => {
  const [check] = locationChecks({ ...good, accuracy: 400 }).filter((c) => !c.ok);
  assert.equal(check.id, "precise-fix");
  assert.match(check.detail, /±400 m/);
  assert.ok(MAX_ACCURACY_M < 400);
});

test("reporting somewhere you are not is refused, and says how far", () => {
  const [check] = locationChecks({ ...good, distanceM: 420 }).filter((c) => !c.ok);
  assert.equal(check.id, "at-the-place");
  assert.match(check.detail, /420 m away/);
  assert.ok(MAX_DISTANCE_M < 420);
});

test("a photo from earlier is refused", () => {
  assert.deepEqual(failing({ capturedAt: NOW - 10 * 60000 }), ["fresh-photo"]);
});

test("the fourth report in an hour is refused", () => {
  assert.deepEqual(failing({ recentCount: 3 }), ["not-flooding"]);
  assert.deepEqual(failing({ recentCount: 2 }), []);
});

test("every gate carries an instruction, not just a failure", () => {
  const checks = locationChecks({ fixAt: 0, accuracy: 999, distanceM: 9999, capturedAt: 0, recentCount: 9, now: NOW });
  assert.equal(checks.filter((c) => !c.ok).length, 5);
  for (const check of checks) {
    assert.ok(check.detail.length > 20, `${check.id} should tell the reporter what to do`);
  }
});

// --- the photo check ---

test("a malformed or truncated model response degrades to unclear, never passes", () => {
  for (const bad of ['{"depicts": "lift", "matchesRep', "", "not json at all", null, 42]) {
    const vision = parseVision(bad);
    assert.equal(vision.matchesReport, false, "a body we could not read must not count as a match");
    assert.equal(vision.depicts, "unclear");
  }
});

test("a well-formed response is read as written", () => {
  const vision = parseVision('{"depicts":"lift","matchesReport":true,"looksLikeTransitStation":true,"screenOfAScreen":false,"reason":"A lift with a notice."}');
  assert.equal(vision.matchesReport, true);
  assert.equal(vision.depicts, "lift");
  assert.equal(vision.reason, "A lift with a notice.");
});

test("a photo of a screen is refused", () => {
  // Photographing someone else's screenshot is the cheapest way to fake a report.
  const out = verdictFor({ checks: locationChecks(good), vision: parseVision('{"matchesReport":true,"screenOfAScreen":true,"depicts":"signage","looksLikeTransitStation":true,"reason":"x"}') });
  assert.equal(out.verdict, "rejected");
  assert.match(out.reason, /photo of a screen/i);
});

test("a photo that does not show what was reported is refused, in the model's words", () => {
  const out = verdictFor({ checks: locationChecks(good), vision: parseVision('{"matchesReport":false,"screenOfAScreen":false,"depicts":"other","looksLikeTransitStation":true,"reason":"This looks like a coffee cup."}') });
  assert.equal(out.verdict, "rejected");
  assert.equal(out.reason, "This looks like a coffee cup.");
});

test("a failed gate beats a good photo", () => {
  const out = verdictFor({
    checks: locationChecks({ ...good, distanceM: 900 }),
    vision: parseVision('{"matchesReport":true,"screenOfAScreen":false,"depicts":"lift","looksLikeTransitStation":true,"reason":"ok"}'),
  });
  assert.equal(out.verdict, "rejected");
  assert.equal(out.failed[0].id, "at-the-place");
});

test("passing is never described as verified", () => {
  // The model checks consistency, not truth. The wording has to hold that line.
  const out = verdictFor({ checks: locationChecks(good), vision: parseVision('{"matchesReport":true,"screenOfAScreen":false,"depicts":"lift","looksLikeTransitStation":true,"reason":"ok"}') });
  assert.equal(out.verdict, "accepted");
  assert.doesNotMatch(out.reason, /verif/i);
  assert.match(out.reason, /another commuter or LTA/);
});

test("with no photo check configured, the gates alone can still accept", () => {
  const out = verdictFor({ checks: locationChecks(good), vision: null });
  assert.equal(out.verdict, "accepted");
});

test("the prompt asks about the photo, not about whether the problem is real", () => {
  const prompt = visionPrompt("Lift or escalator disruption");
  assert.match(prompt, /CONSISTENT/);
  assert.match(prompt, /not being asked whether the problem is real/i);
});
