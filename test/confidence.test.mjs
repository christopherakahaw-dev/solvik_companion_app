// What a report has earned the right to claim. The rule these tests defend is
// that every tier is a countable fact — so there is a test asserting no tier
// ever renders a percentage, because a percentage is the one thing here that
// could not be checked by the person reading it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { confidenceOf, distinctReporters, groupReports, groupsFromCounts, TIERS, WINDOW_MS, kindLabel } from "../src/lib/confidence.js";

const NOW = Date.UTC(2026, 8, 17, 9, 0, 0);
const report = (reporter, minsAgo, extra = {}) => ({
  reporter, at: NOW - minsAgo * 60000, kind: "esc",
  stationCode: "NS17", stationName: "Bishan", ...extra,
});

test("three different commuters is agreement", () => {
  const c = confidenceOf({ reports: [report("a", 1), report("b", 2), report("c", 3)], now: NOW });
  assert.equal(c.key, TIERS.many.key);
  assert.equal(c.people, 3);
  assert.match(c.line, /Reported by 3 commuters/);
});

test("one commuter reporting three times is one commuter", () => {
  // Counting submissions instead of people is how a rewards scheme gets farmed.
  const c = confidenceOf({ reports: [report("a", 1), report("a", 2), report("a", 3)], now: NOW });
  assert.equal(c.people, 1);
  assert.equal(c.reports, 3, "the submissions are still counted, just not as people");
  assert.equal(c.key, TIERS.one.key);
});

test("LTA's own feed outranks any number of commuters", () => {
  const crowd = confidenceOf({ reports: [report("a", 1), report("b", 1), report("c", 1), report("d", 1)], now: NOW });
  const official = confidenceOf({ reports: [report("a", 1)], lta: true, now: NOW });
  assert.equal(crowd.official, false);
  assert.equal(official.official, true);
  assert.equal(official.label, "Confirmed by LTA");
});

test("the unconfirmed half of the sentence is always said", () => {
  // Without it, four reports read like an official notice.
  const c = confidenceOf({ reports: [report("a", 1), report("b", 1), report("c", 1)], now: NOW });
  assert.match(c.line, /not yet confirmed by LTA/);
});

test("reports older than the window are not current", () => {
  const stale = [report("a", 45), report("b", 50)];
  const c = confidenceOf({ reports: stale, now: NOW });
  assert.equal(c.people, 0);
  assert.equal(c.reports, 0);
  assert.match(c.line, /No current reports/);
  assert.equal(distinctReporters(stale, NOW), 0);
  assert.equal(WINDOW_MS, 30 * 60 * 1000);
});

test("no tier ever renders a percentage", () => {
  const cases = [
    confidenceOf({ reports: [report("a", 1)], now: NOW }),
    confidenceOf({ reports: [report("a", 1), report("b", 1)], now: NOW }),
    confidenceOf({ reports: [report("a", 1), report("b", 1), report("c", 1)], now: NOW }),
    confidenceOf({ reports: [report("a", 1)], lta: true, now: NOW }),
    confidenceOf({ now: NOW }),
  ];
  for (const c of cases) {
    assert.doesNotMatch(`${c.label} ${c.line}`, /%|\bconfiden(ce|t)\b/i, `"${c.label} · ${c.line}" must not imply a score`);
  }
});

test("reports group by station and kind, most corroborated first", () => {
  const groups = groupReports(
    [
      report("a", 1), report("b", 2),
      report("c", 1, { kind: "crowd", stationCode: "EW24", stationName: "Jurong East" }),
      report("d", 1, { stationCode: "CC9", stationName: "Paya Lebar" }),
    ],
    { now: NOW }
  );
  assert.equal(groups.length, 3);
  assert.equal(groups[0].stationCode, "NS17", "two people beats one");
  assert.equal(groups[0].confidence.people, 2);
  assert.equal(groups[0].label, kindLabel("esc"));
});

test("an LTA-confirmed group sorts above a more-reported one", () => {
  const groups = groupsFromCounts(
    [
      { key: "a", kind: "esc", stationCode: "NS17", stationName: "Bishan", people: 1, reports: 1, lastAt: NOW },
      { key: "b", kind: "crowd", stationCode: "EW24", stationName: "Jurong East", people: 5, reports: 9, lastAt: NOW },
    ],
    { ltaStations: ["NS17"], now: NOW }
  );
  assert.equal(groups[0].stationCode, "NS17");
  assert.equal(groups[0].confidence.official, true);
  assert.equal(groups[1].confidence.people, 5);
});

test("counts from the view carry through without the rows", () => {
  // The client never sees who reported — only how many did.
  const [group] = groupsFromCounts([{ key: "a", kind: "esc", stationCode: "NS17", people: 4, reports: 6, lastAt: NOW }], { now: NOW });
  assert.equal(group.confidence.people, 4);
  assert.equal(group.confidence.reports, 6);
  assert.equal(group.confidence.key, TIERS.many.key);
});

test("nothing reported says so rather than showing a tier", () => {
  const c = confidenceOf({ reports: [], now: NOW });
  assert.equal(c.people, 0);
  assert.match(c.line, /No current reports/);
});
