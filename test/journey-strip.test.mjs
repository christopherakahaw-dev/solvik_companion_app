// The route card's one-line summary and the colours behind it. A commuter reads
// "red then orange" before any text, so the colours have to match the signage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineColour, BUS, WALK } from "../src/lib/lineColours.js";
import { journeyStrip } from "../src/lib/journeyStrip.js";

test("rail lines take LTA's colours, however the planner names them", () => {
  assert.equal(lineColour("NSL").bg, "#D42E12");
  assert.equal(lineColour("NS").bg, "#D42E12");
  assert.equal(lineColour("EWL").bg, "#009645");
  assert.equal(lineColour("CCL").bg, "#FA9E0D");
  assert.equal(lineColour("DTL").bg, "#005EC4");
  assert.equal(lineColour("TEL").bg, "#9D5B25");
  assert.equal(lineColour("NEL").bg, "#9900AA");
});

test("the yellow line gets dark text, so its label stays readable", () => {
  assert.notEqual(lineColour("CCL").fg, "#ffffff");
});

test("buses and walks are told apart from rail by mode or by label", () => {
  assert.equal(lineColour("BUS 185"), BUS);
  assert.equal(lineColour("185", "BUS"), BUS);
  assert.equal(lineColour("WALK 0.2 km"), WALK);
  assert.equal(lineColour("", "WALK"), WALK);
});

test("an unnamed train is still drawn as a train, not as a bus", () => {
  assert.notEqual(lineColour("???", "SUBWAY"), BUS);
});

test("the strip reads walk, bus, train, walk — in order, with minutes for walks", () => {
  const { strip, stripSpoken } = journeyStrip({
    steps: [
      { mode: "WALK", icon: "footprints", secs: 180 },
      { mode: "BUS", service: "185", label: "BUS 185", secs: 600 },
      { mode: "SUBWAY", label: "EWL", secs: 900 },
      { mode: "WALK", icon: "flag", secs: 90 },
    ],
  });
  assert.deepEqual(strip.map((s) => s.text), ["3", "185", "EWL", "2"]);
  assert.deepEqual(strip.map((s) => s.kind), ["walk", "ride", "ride", "walk"]);
  assert.equal(strip[1].bg, BUS.bg);
  assert.equal(strip[2].bg, "#009645");
  assert.equal(stripSpoken, "walk 3 min, then bus 185, then EWL train, then walk 2 min");
});

test("a walk shorter than a minute still shows one minute, never zero", () => {
  assert.equal(journeyStrip({ steps: [{ mode: "WALK", secs: 10 }] }).strip[0].text, "1");
});

test("without steps it falls back to the legs", () => {
  const { strip } = journeyStrip({ legs: ["NSL", "BUS 52"] });
  assert.deepEqual(strip.map((s) => s.text), ["NSL", "52"]);
});

test("the facts line names fare, crowd and the next bus, and skips what it lacks", () => {
  const { factsLine } = journeyStrip({
    fare: "$1.89",
    crowdLevel: "moderate",
    transitLegs: [{ mode: "BUS", service: "185", etaMins: 3 }],
  });
  assert.equal(factsLine, "$1.89 · Filling up · 185 in 3 min");
  assert.equal(journeyStrip({ walkOnly: true, fare: "$0.00" }).factsLine, "");
  assert.match(journeyStrip({ transitLegs: [{ mode: "BUS", service: "7", etaMins: 0 }] }).factsLine, /7 arriving/);
});

test("a walking-only route shows how far, since the card already says how long", () => {
  const option = { walkOnly: true, mins: 154, legs: ["WALK 12.8 km"], steps: [{ mode: "WALK", metres: 12808, secs: 9240 }] };
  assert.equal(journeyStrip(option).strip[0].text, "12.8 km");
  assert.equal(journeyStrip({ walkOnly: true, mins: 6, steps: [{ mode: "WALK", metres: 446 }] }).strip[0].text, "450 m");
  assert.equal(journeyStrip({ walkOnly: true, mins: 6, legs: ["WALK 0.4 km"] }).strip[0].text, "0.4 km");
});
