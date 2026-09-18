// The line-code trap, straight from the brief's own table (PS2 section 2.4).
//
// "The same physical line has different codes depending on which API you call.
// This will bite you when you join data." It had: before this table was fixed,
// STL, PTL and CEL all resolved to null, so a Sengkang LRT disruption could not
// reach a Sengkang commuter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalLine, sameLine, crowdCodesFor, lineCovers } from "../src/lib/lines.js";
import { TRAIN_LINES } from "../api/_lib/lta.js";

// Sengkang and Punggol LRT are the same line under two spellings — they unify.
test("the two LRT lines unify across the two feeds", () => {
  assert.equal(canonicalLine("STL"), "SLRT", "TrainServiceAlerts spelling");
  assert.equal(canonicalLine("PTL"), "PLRT");
  assert.ok(sameLine("STL", "SLRT"));
  assert.ok(sameLine("PTL", "PLRT"));
  assert.ok(sameLine("SLRT", "STL"), "and in the other direction");
});

test("Bukit Panjang is the one line both feeds already agree on", () => {
  assert.ok(sameLine("BPL", "BPL"));
  assert.deepEqual(crowdCodesFor("BPL"), ["BPL"]);
});

// The extensions are containment, not equality: alerts fold them in, the crowd
// feed splits them out.
test("an alert on EWL covers Changi, which the crowd feed publishes separately", () => {
  assert.deepEqual(crowdCodesFor("EWL"), ["EWL", "CGL"]);
  assert.ok(lineCovers("EWL", "CGL"));
});

test("an alert on CCL covers the Circle Line Extension", () => {
  assert.deepEqual(crowdCodesFor("CCL"), ["CCL", "CEL"]);
  assert.ok(lineCovers("CCL", "CEL"));
  assert.equal(canonicalLine("CEL"), "CEL", "CEL is its own code, not an alias of CCL");
});

test("containment does not run backwards", () => {
  // A Changi-only crowd reading says nothing about the rest of the East-West
  // line, and treating CGL as equal to EWL would let it pretend otherwise.
  assert.equal(lineCovers("CGL", "EWL"), false);
  assert.equal(lineCovers("CEL", "CCL"), false);
  assert.equal(sameLine("EWL", "CGL"), false, "equal is the wrong relationship here");
});

test("every row of the brief's trap table resolves", () => {
  const table = [["STL", "SLRT"], ["PTL", "PLRT"], ["BPL", "BPL"], ["CCL", "CEL"], ["EWL", "CGL"]];
  for (const [alertCode, crowdCode] of table) {
    assert.ok(
      sameLine(alertCode, crowdCode) || lineCovers(alertCode, crowdCode),
      `${alertCode} (alerts) must reach ${crowdCode} (crowd density)`
    );
  }
});

test("we poll every line the crowd feed accepts", () => {
  // The brief lists the eleven valid TrainLine values; CEL was missing, so one
  // line's crowding was silently never fetched.
  const expected = ["NSL", "EWL", "CGL", "CCL", "CEL", "NEL", "DTL", "BPL", "SLRT", "PLRT", "TEL"];
  assert.deepEqual([...TRAIN_LINES].sort(), [...expected].sort());
  assert.equal(TRAIN_LINES.length, 11);
});

test("every polled line is a code we can canonicalise", () => {
  for (const line of TRAIN_LINES) assert.equal(canonicalLine(line), line, `${line} must round-trip`);
});

test("a bus service is still not a line", () => {
  assert.equal(canonicalLine("410"), null);
  assert.equal(canonicalLine("LTA"), null);
  assert.deepEqual(crowdCodesFor("410"), []);
});
