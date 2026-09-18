// Turn-by-turn progress: the rules that stop the countdown and the current
// station jumping around while the device reports an imperfect position.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metresBetween, projectOnPath, locateAt } from "../src/lib/geometry.js";
import { acceptFix, alongMAtTime, timeAtAlongM, stepAtTime, totalSecsOf } from "../src/lib/navProgress.js";
import { normalizeItinerary } from "../api/_lib/itinerary.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/onemap-pt-route.json", import.meta.url)));
const trip = normalizeItinerary(fixture.plan.itineraries[0], "Bishan Park");

// A straight line due east, ~1.1 km per 0.01°.
const line = [
  [1.3, 103.8],
  [1.3, 103.81],
  [1.3, 103.82],
];

test("distance is metres, not degrees", () => {
  // 0.01° of longitude at the equator is ~1113 m.
  const d = metresBetween([1.3, 103.8], [1.3, 103.81]);
  assert.ok(Math.abs(d - 1113) < 5, `${d} m`);
});

test("a position between two vertices reads between them, not at one", () => {
  // Three quarters along the first segment: vertex matching would report 0.
  const m = projectOnPath(line, [1.3, 103.8075]);
  assert.ok(Math.abs(m.fraction - 0.375) < 0.01, m.fraction);
  // Off to the side of the line, but still on it lengthwise.
  const side = projectOnPath(line, [1.3009, 103.8075]);
  assert.ok(Math.abs(side.fraction - 0.375) < 0.01, side.fraction);
  assert.ok(side.offsetM > 80 && side.offsetM < 120, `${side.offsetM} m`);
});

test("a position far off the line reports nothing rather than a guess", () => {
  assert.equal(projectOnPath(line, [1.9, 104.9]), null);
});

test("a route that doubles back cannot teleport progress", () => {
  // Out and back along the same line: the return passes right next to the start.
  const loop = [
    [1.3, 103.8],
    [1.3, 103.82],
    [1.3, 103.8],
  ];
  // 500 m into the return leg — a point that also sits on the outbound one.
  const here = locateAt(loop, 2226 + 500);
  // Read cold, the match lands on the outbound leg: the same place, half the
  // journey too early.
  assert.ok(projectOnPath(loop, here.coord).alongM < 2226);
  // Read with the traveller's last known progress, it stays on the return leg.
  const m = projectOnPath(loop, here.coord, { fromM: 2226 + 400, backM: 60, aheadM: 400 });
  assert.ok(m.alongM > 2226, `${m.alongM} m`);
});

test("progress never goes backwards on a jittery fix", () => {
  const route = { geometry: line, legSpans: [{ from: 0, to: 2 }], steps: [{ secs: 600 }] };
  const t0 = Date.now();
  const first = acceptFix(null, { coords: [1.3, 103.8018], accuracy: 20, at: t0 }, route, t0);
  assert.equal(first.status, "ok");
  const forward = first.progress.alongM;
  assert.ok(forward > 150 && forward < 250, `${forward} m`);
  // The next fix reads ~100 m behind — jitter, not reversal.
  const back = acceptFix(first.progress, { coords: [1.3, 103.8009], accuracy: 20, at: t0 + 5000 }, route, t0);
  assert.equal(back.status, "ok");
  assert.equal(back.progress.alongM, forward);
});

test("a fix impossibly far ahead of the last one is not believed", () => {
  const route = { geometry: line, legSpans: [{ from: 0, to: 2 }], steps: [{ secs: 600 }] };
  const t0 = Date.now();
  const first = acceptFix(null, { coords: [1.3, 103.8018], accuracy: 20, at: t0 }, route, t0);
  // 2 km further on, one second later: nothing on the network moves like that.
  const leap = acceptFix(first.progress, { coords: [1.3, 103.82], accuracy: 20, at: t0 + 1000 }, route, t0);
  assert.equal(leap.status, "off-route");
  assert.equal(leap.progress, first.progress);
});

test("a vague fix is ignored and an off-route one holds position", () => {
  const route = { geometry: line, legSpans: [{ from: 0, to: 2 }], steps: [{ secs: 600 }] };
  const t0 = Date.now();
  const first = acceptFix(null, { coords: [1.3, 103.805], accuracy: 15, at: t0 }, route, t0);
  assert.equal(first.status, "ok");

  const vague = acceptFix(first.progress, { coords: [1.3, 103.815], accuracy: 900, at: t0 + 5000 }, route, t0);
  assert.equal(vague.status, "vague");
  assert.equal(vague.progress, first.progress);

  const off = acceptFix(first.progress, { coords: [1.32, 103.805], accuracy: 15, at: t0 + 10000 }, route, t0);
  assert.equal(off.status, "off-route");
  assert.equal(off.progress, first.progress);
});

test("distance becomes time per leg, so a fast leg isn't read as a slow one", () => {
  // 100 m walk taking 5 min, then 10 km of rail taking 5 min.
  const route = {
    geometry: [
      [1.3, 103.8],
      [1.3, 103.80089],
      [1.3, 103.89],
    ],
    legSpans: [{ from: 0, to: 1 }, { from: 1, to: 2 }],
    steps: [{ secs: 300 }, { secs: 300 }],
  };
  assert.equal(totalSecsOf(route), 600);
  // Halfway through the walk is 50 m in — a hair of the total distance, but
  // a quarter of the journey's time.
  const half = timeAtAlongM(route, 50);
  assert.equal(half.stepIdx, 0);
  assert.ok(Math.abs(half.elapsedSecs - 150) < 5, half.elapsedSecs);
  // And the trip back out again: 150 s of clock is 50 m along.
  assert.ok(Math.abs(alongMAtTime(route, 150) - 50) < 3, alongMAtTime(route, 150));
  // Just onto the rail leg: the step advances, the clock doesn't leap.
  const boarded = timeAtAlongM(route, 200);
  assert.equal(boarded.stepIdx, 1);
  assert.ok(boarded.elapsedSecs > 300 && boarded.elapsedSecs < 310, boarded.elapsedSecs);
});

test("a real itinerary carries one geometry span per step", () => {
  assert.equal(trip.legSpans.length, trip.steps.length);
  trip.legSpans.forEach((span, i) => {
    assert.ok(span, `step ${i} has no span`);
    if (i > 0) assert.ok(span.from > trip.legSpans[i - 1].to, `step ${i} overlaps the one before`);
  });
  // The clock-only path still agrees about which step is current.
  assert.equal(stepAtTime(trip, totalSecsOf(trip) - 1).stepIdx, trip.steps.length - 1);
  assert.equal(stepAtTime(trip, 0).stepIdx, 0);
});

test("a route whose geometry has no length falls back to the clock", () => {
  // The recorded fixture's polylines are placeholders, all at one point.
  const t0 = Date.now();
  const out = acceptFix(null, { coords: [1.43, 103.83], accuracy: 10, at: t0 }, trip, t0);
  assert.equal(out.status, "no-route");
  assert.equal(out.progress, null);
  // ...and the clock still drives the steps, so the screen keeps working.
  const half = stepAtTime(trip, totalSecsOf(trip) / 2);
  assert.ok(half.stepIdx >= 0 && half.remainSecs > 0);
});
