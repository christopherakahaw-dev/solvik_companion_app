// Rerouting around a broken line. OneMap cannot be told to avoid one, so the
// exclusion happens here — which means these tests are the only thing standing
// between a disruption alert and a route that runs straight through the fault.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalLine, usesLine, withoutLines, parseAvoid } from "../api/_lib/avoid.js";
import { normalizeItinerary } from "../api/_lib/itinerary.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/onemap-pt-route.json", import.meta.url)));
const real = normalizeItinerary(fixture.plan.itineraries[0], "Bishan Park");

const option = (labels) => ({ transitLegs: labels.map((l) => (/^\d/.test(l) ? { mode: "BUS", label: `BUS ${l}`, service: l } : { mode: "RAIL", label: l, service: l })) });

test("the same line written three different ways is one line", () => {
  // LTA says NSL, OneMap's routeShortName is NS, a service message spells it out.
  assert.equal(canonicalLine("NSL"), "NSL");
  assert.equal(canonicalLine("NS"), "NSL");
  assert.equal(canonicalLine("North South Line"), "NSL");
  assert.equal(canonicalLine("north-south"), "NSL");
  assert.equal(canonicalLine("TE"), "TEL");
  assert.equal(canonicalLine("Circle Line"), "CCL");
});

test("a bus service is not mistaken for a line", () => {
  assert.equal(canonicalLine("410"), null);
  assert.equal(canonicalLine(""), null);
  assert.equal(canonicalLine(null), null);
});

test("an itinerary riding the broken line is recognised as such", () => {
  assert.equal(usesLine(option(["NSL", "410"]), "NSL"), true);
  assert.equal(usesLine(option(["NSL"]), "NS"), true, "the code OneMap uses must match the code LTA uses");
  assert.equal(usesLine(option(["EWL", "CCL"]), "NSL"), false);
});

test("avoiding a bus service is exact, not a prefix match", () => {
  assert.equal(usesLine(option(["410"]), "410"), true);
  // Containment here would drop 510, 151 and 41 along with 41.
  assert.equal(usesLine(option(["510"]), "51"), false);
  assert.equal(usesLine(option(["51"]), "510"), false);
});

test("the alternatives survive while the disrupted routes are dropped", () => {
  const options = [option(["NSL"]), option(["851", "CCL"]), option(["NSL", "EWL"])];
  const out = withoutLines(options, "NSL");
  assert.equal(out.kept.length, 1);
  assert.equal(out.dropped, 2);
  assert.deepEqual(out.kept[0].transitLegs.map((l) => l.label), ["BUS 851", "CCL"]);
});

test("a real itinerary is filtered on the lines it actually uses", () => {
  assert.ok(real.legs.length, "the fixture has transit legs to match on");
  const line = real.transitLegs[0].label;
  assert.equal(withoutLines([real], line).kept.length, 0, `${line} should be dropped when avoided`);
  assert.equal(withoutLines([real], "PLRT").kept.length, 1, "an unrelated line leaves it alone");
});

test("no avoid list means nothing is filtered", () => {
  const options = [option(["NSL"]), option(["EWL"])];
  assert.equal(withoutLines(options, "").kept.length, 2);
  assert.equal(withoutLines(options, null).dropped, 0);
  assert.deepEqual(withoutLines(options, "").lines, []);
});

test("several lines can be avoided at once", () => {
  assert.deepEqual(parseAvoid("NSL, 410 ,NSL"), ["NSL", "410"], "trimmed and de-duplicated");
  const out = withoutLines([option(["NSL"]), option(["410"]), option(["CCL"])], "NSL,410");
  assert.equal(out.kept.length, 1);
  assert.deepEqual(out.lines, ["NSL", "410"]);
});

test("filtering everything away is reported, not returned as an empty list", () => {
  // The caller has to be able to tell "every way still uses NSL" apart from
  // "there is no route", because only one of those is worth showing a map for.
  const out = withoutLines([option(["NSL"]), option(["NSL", "EWL"])], "NSL");
  assert.equal(out.kept.length, 0);
  assert.equal(out.dropped, 2);
  assert.deepEqual(out.lines, ["NSL"]);
});
