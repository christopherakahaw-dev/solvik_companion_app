import test from "node:test";
import assert from "node:assert/strict";
import { analyseCommutes, commonDestinations, recordDestination } from "../src/lib/commuteAgent.js";

test("destination history promotes repeated selections", () => {
  let history = [];
  history = recordDestination(history, { name: "Bugis MRT", detail: "Bugis" }, 1);
  history = recordDestination(history, { name: "Bugis MRT", detail: "Bugis" }, 2);
  assert.equal(commonDestinations(history)[0].name, "Bugis MRT");
  assert.equal(commonDestinations(history)[0].count, 2);
});

test("agent flags an alert that names a saved commute place", () => {
  const result = analyseCommutes({
    commutes: [{ from: "home", to: "work", days: ["Mon"], mins: 8 * 60 + 30, mode: "Comfort" }],
    places: [{ id: "home", label: "Home", place: "Yishun" }, { id: "work", label: "Work", place: "Bugis" }],
    faults: [{ title: "East West Line disruption", detail: "Trains at Bugis are delayed." }],
    now: new Date("2026-09-14T08:00:00"), // Monday
  });
  assert.equal(result.level, "disruption");
  assert.equal(result.commute.to, "work");
});
