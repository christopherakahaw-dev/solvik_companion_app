// The sample trips behind "Add a week of sample trips". They exist so the
// memory system and the leave-time card can be shown without waiting a week,
// so what matters is that they clear the pattern detector's real bar and land
// somewhere the same-day forecast can still say something about.
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedSampleJourneys, SAMPLE_LEAD_MINS } from "../src/lib/journeys.js";
import { inferCommutes, isConfident } from "../src/lib/patterns.js";

const YISHUN = { name: "Yishun", ll: [1.42945, 103.83513] };
const RAFFLES = { name: "Raffles Place", ll: [1.28406, 103.85152] };

// A Wednesday, so walking back four weekdays never crosses a weekend boundary
// in a way that changes the count.
const WEDNESDAY_2PM = new Date(2026, 8, 16, 14, 0).getTime();

test("the seeded trips are timed from now, not a fixed morning", () => {
  // They used to sit at 08:04 whatever the clock said, which put the learned
  // commute's next occurrence in tomorrow — outside LTA's same-day forecast —
  // for most of the day. The crowd warning then correctly had nothing to say,
  // which is the one thing the seed exists to show.
  const seeded = seedSampleJourneys(YISHUN, RAFFLES, WEDNESDAY_2PM);
  const target = new Date(WEDNESDAY_2PM + SAMPLE_LEAD_MINS * 60000);
  for (const j of seeded) {
    const at = new Date(j.at);
    const minsFromTarget =
      (at.getHours() * 60 + at.getMinutes()) - (target.getHours() * 60 + target.getMinutes());
    assert.ok(minsFromTarget >= 0 && minsFromTarget < 45, `${at.getHours()}:${at.getMinutes()} is off target`);
  }
});

test("the seeded trips actually clear the bar for a learned commute", () => {
  // Seeding trips that do not produce a commute would demo nothing at all.
  const seeded = seedSampleJourneys(YISHUN, RAFFLES, WEDNESDAY_2PM);
  const [pattern] = inferCommutes({ journeys: seeded, now: WEDNESDAY_2PM });
  assert.ok(pattern, "no commute inferred from the sample trips");
  assert.ok(isConfident(pattern), "the inferred commute is not confident enough to be offered");
});

test("the seeded trips are on weekdays, in the past, and finished", () => {
  const seeded = seedSampleJourneys(YISHUN, RAFFLES, WEDNESDAY_2PM);
  assert.equal(seeded.length, 4);
  for (const j of seeded) {
    const at = new Date(j.at);
    assert.ok(at.getDay() !== 0 && at.getDay() !== 6, "a sample trip landed on a weekend");
    assert.ok(j.at < WEDNESDAY_2PM, "a sample trip is in the future");
    assert.ok(j.started && j.completed, "a sample trip was not finished");
  }
});

test("seeding late in the evening still produces a usable commute", () => {
  // 23:30 plus the lead crosses midnight. The trips must stay coherent rather
  // than scattering across two clock days, or the pattern never forms.
  const lateNight = new Date(2026, 8, 16, 23, 30).getTime();
  const seeded = seedSampleJourneys(YISHUN, RAFFLES, lateNight);
  const [pattern] = inferCommutes({ journeys: seeded, now: lateNight });
  assert.ok(pattern, "no commute inferred when seeded near midnight");
});
