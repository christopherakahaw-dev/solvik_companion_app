import test from "node:test";
import assert from "node:assert/strict";

import { FLICK_VELOCITY, chooseSnap, fitSnaps, releaseVelocity, rubberBand, springStep } from "../src/lib/sheetGesture.js";

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

// Runs the spring at 60fps until it rests (or gives up after 3 s).
function settle(from, target, velocityPxPerMs) {
  let x = from, v = velocityPxPerMs * 1000, frames = 0, peak = from;
  while (frames < 180) {
    ({ x, v } = springStep({ x, v, target, dt: 1 / 60 }));
    frames++;
    peak = target > from ? Math.max(peak, x) : Math.min(peak, x);
    if (Math.abs(x - target) < 0.5 && Math.abs(v) < 20) break;
  }
  return { x, frames, overshoot: Math.abs(peak - target) * (Math.sign(peak - target) === Math.sign(target - from) ? 1 : 0) };
}

test("the spring settles on its target within half a second", () => {
  const { x, frames } = settle(422, 774, 0);
  assert.ok(Math.abs(x - 774) < 0.5);
  assert.ok(frames <= 30, `rested after ${frames} frames`);
});

test("a hard flick overshoots by a few pixels and comes back; a gentle one barely", () => {
  const hard = settle(422, 774, 2.5);
  const gentle = settle(422, 774, 0.2);
  assert.ok(hard.overshoot > 2 && hard.overshoot < 40, `hard overshoot ${hard.overshoot}`);
  assert.ok(gentle.overshoot < hard.overshoot);
  assert.ok(Math.abs(hard.x - 774) < 0.5);
});

test("the spring stays stable on slow phones' long frames", () => {
  let x = 190, v = 3000;
  for (let i = 0; i < 120; i++) ({ x, v } = springStep({ x, v, target: 774, dt: 0.032 }));
  assert.ok(Math.abs(x - 774) < 1);
});

test("resting heights fit the content instead of cutting a card in half", () => {
  const base = [190, 422, 774];
  assert.deepEqual(fitSnaps(base, { peekBottom: 210, halfBottom: 480 }), [222, 496, 774]);
  assert.deepEqual(fitSnaps(base, {}), base, "nothing to measure: the plain heights");
});

test("fitted heights keep a real step between each", () => {
  // A route card taller than the screen leaves the middle at the plain half.
  assert.equal(fitSnaps([190, 422, 774], { peekBottom: 210, halfBottom: 900 })[1], 422);
  // A card ending just under the peek doesn't make the middle stop useless.
  const [peek, half] = fitSnaps([190, 422, 774], { peekBottom: 210, halfBottom: 260 });
  assert.ok(half - peek >= 60);
  // The peek never takes more than ~half the screen.
  assert.ok(fitSnaps([190, 422, 774], { peekBottom: 600 })[0] <= 774 * 0.45);
});
test("when the best route's card won't fit, the middle stop shows its headline row", () => {
  // Card from 330 to 900 on a 774 px sheet: too tall, so stop under its headline.
  assert.equal(fitSnaps([190, 422, 774], { peekBottom: 210, halfTop: 330, halfBottom: 900 })[1], 434);
  // A card that fits is shown whole.
  assert.equal(fitSnaps([190, 422, 774], { peekBottom: 210, halfTop: 330, halfBottom: 520 })[1], 536);
});
