import test from "node:test";
import assert from "node:assert/strict";

import { FLICK_VELOCITY, chooseSnap, releaseVelocity, rubberBand } from "../src/lib/sheetGesture.js";

const snaps = [190, 422, 774]; // peek, half, full on an 844 px phone

test("a slow release settles on the nearest resting height", () => {
  assert.equal(chooseSnap({ height: 250, velocity: 0, snaps }), 190);
  assert.equal(chooseSnap({ height: 400, velocity: 0, snaps }), 422);
  assert.equal(chooseSnap({ height: 700, velocity: 0, snaps }), 774);
});

test("a flick goes to the next resting height in its direction, however short", () => {
  assert.equal(chooseSnap({ height: 430, velocity: FLICK_VELOCITY + 0.1, snaps }), 774, "flick up from half opens fully");
  assert.equal(chooseSnap({ height: 420, velocity: -(FLICK_VELOCITY + 0.1), snaps }), 190, "flick down from half goes to peek");
  assert.equal(chooseSnap({ height: 770, velocity: -(FLICK_VELOCITY + 0.1), snaps }), 422, "flick down from full goes to half, not straight to peek");
  assert.equal(chooseSnap({ height: 780, velocity: FLICK_VELOCITY + 1, snaps }), 774, "nothing above full");
  assert.equal(chooseSnap({ height: 185, velocity: -(FLICK_VELOCITY + 1), snaps }), 190, "nothing below peek");
});

test("a gentle push carries a little way before choosing", () => {
  // At 560 with no speed, half (422) is nearer than full (774)…
  assert.equal(chooseSnap({ height: 560, velocity: 0, snaps }), 422);
  // …but moving up at 0.4 px/ms projects past the midpoint, so it opens.
  assert.equal(chooseSnap({ height: 560, velocity: 0.4, snaps }), 774);
});

test("past either end the sheet still moves, at a fraction of the finger", () => {
  assert.equal(rubberBand(500, 190, 774), 500);
  assert.ok(rubberBand(874, 190, 774) > 774 && rubberBand(874, 190, 774) < 874);
  assert.ok(rubberBand(90, 190, 774) < 190 && rubberBand(90, 190, 774) > 90);
});

test("release speed uses the last ~100 ms, positive when the finger moves up", () => {
  const samples = [{ y: 600, t: 0 }, { y: 590, t: 100 }, { y: 540, t: 150 }, { y: 490, t: 200 }];
  assert.equal(releaseVelocity(samples), (590 - 490) / 100);
  assert.ok(releaseVelocity([{ y: 400, t: 0 }, { y: 460, t: 50 }]) < 0);
  assert.equal(releaseVelocity([{ y: 400, t: 0 }]), 0);
});
