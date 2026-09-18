// Planned works. LTA's public feed here is narrower than its name: adhoc lift
// maintenance, one row per lift. These tests pin what we can honestly say from
// that — which station, which lift — and make sure a row we can't place on a
// route is dropped rather than shown floating.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFacilities, byStation, worksAtStations, worksLabel, worksDetail } from "../src/lib/planned.js";
import { usesStation, withoutStations, withoutAny } from "../api/_lib/avoid.js";
import { recordedFacilities } from "../api/_lib/recorded/index.js";

const feed = (rows) => ({ value: rows });

test("a lift row keeps its station, line and description", () => {
  const [item] = parseFacilities(feed([
    { Line: "NEL", StationCode: "NE12", StationName: "Serangoon", LiftID: "B1L01", LiftDesc: "Exit B Street level - Concourse" },
  ]));
  assert.equal(item.kind, "lift");
  assert.equal(item.stationCode, "NE12");
  assert.equal(item.stationName, "Serangoon");
  assert.equal(item.liftDesc, "Exit B Street level - Concourse");
});

test("a row with no station is dropped", () => {
  // A warning we cannot attach to a place on your route is not worth showing.
  assert.equal(parseFacilities(feed([{ Line: "NEL", LiftID: "X1" }])).length, 0);
});

test("an empty or malformed feed is empty, not an exception", () => {
  assert.deepEqual(parseFacilities(null), []);
  assert.deepEqual(parseFacilities({}), []);
  assert.deepEqual(parseFacilities({ value: "nonsense" }), []);
});

test("the same lift listed twice is one lift", () => {
  const rows = [
    { StationCode: "NS17", LiftID: "B1L01", LiftDesc: "Exit B" },
    { StationCode: "NS17", LiftID: "B1L01", LiftDesc: "Exit B" },
  ];
  assert.equal(parseFacilities(feed(rows)).length, 1);
});

test("several lifts out at one station is one problem, not three", () => {
  const groups = byStation(parseFacilities(recordedFacilities));
  const bishan = groups.find((g) => g.stationCode === "NS17");
  assert.equal(groups.length, 2, "Bishan and Paya Lebar");
  assert.equal(bishan.lifts.length, 2);
  assert.equal(worksLabel(bishan), "2 lifts out at Bishan");
  assert.match(worksDetail(bishan), /Exit B street level to concourse/);
});

test("a station with no description says so rather than inventing one", () => {
  const [group] = byStation(parseFacilities(feed([{ StationCode: "EW14", StationName: "Raffles Place", LiftID: "A1" }])));
  assert.equal(worksLabel(group), "Lift out at Raffles Place");
  assert.equal(worksDetail(group), "LTA hasn't said which lift.");
});

test("works are matched to the stations a journey passes through", () => {
  const items = parseFacilities(recordedFacilities);
  assert.deepEqual(worksAtStations(items, ["NS17", "NS13"]).map((g) => g.stationCode), ["NS17"]);
  assert.deepEqual(worksAtStations(items, ["ns17"]).map((g) => g.stationCode), ["NS17"], "case does not matter");
  assert.deepEqual(worksAtStations(items, []), [], "no stations, no works");
  assert.deepEqual(worksAtStations(items, ["EW24"]), [], "a station you don't pass is not your problem");
});

// --- Routing around a station rather than a whole line ---

const option = (codes) => ({
  transitLegs: [{ fromStopCode: codes[0], toStopCode: codes[codes.length - 1], label: "NSL" }],
  steps: [{ boardStopCode: codes[0], alightStopCode: codes[codes.length - 1], stopCodes: codes.slice(1, -1) }],
});

test("only the stations you board, alight or change at count", () => {
  const opt = option(["NS13", "NS15", "NS17", "NS19"]);
  assert.equal(usesStation(opt, "NS13"), true, "boarding");
  assert.equal(usesStation(opt, "NS19"), true, "alighting");
  // A lift out at a station the train runs through is not your problem, and
  // refusing that train would throw away a perfectly good route.
  assert.equal(usesStation(opt, "NS15"), false, "ridden through, never entered");
  assert.equal(usesStation(opt, "EW24"), false);
});

test("avoiding a station keeps the routes that go round it", () => {
  const through = option(["NS13", "NS17"]);
  const around = option(["NS13", "CC15"]);
  const out = withoutStations([through, around], "NS17");
  assert.equal(out.kept.length, 1);
  assert.deepEqual(out.kept, [around]);
  assert.deepEqual(out.stations, ["NS17"]);
});

test("a lift being out is no reason to write off the whole line", () => {
  // The distinction this feature rests on: avoid the station, keep the line.
  const viaBishan = option(["NS13", "NS17"]);
  const sameLineElsewhere = option(["NS1", "NS5"]);
  const out = withoutStations([viaBishan, sameLineElsewhere], "NS17");
  assert.equal(out.kept.length, 1);
  assert.equal(out.kept[0].transitLegs[0].label, "NSL", "still an NSL route");
});

test("lines and stations can be avoided in the same request", () => {
  const nsl = { ...option(["NS13", "NS19"]), transitLegs: [{ label: "NSL", fromStopCode: "NS13", toStopCode: "NS19" }] };
  const ccl = { ...option(["CC1", "CC9"]), transitLegs: [{ label: "CCL", fromStopCode: "CC1", toStopCode: "CC9" }] };
  const other = { ...option(["DT1", "DT5"]), transitLegs: [{ label: "DTL", fromStopCode: "DT1", toStopCode: "DT5" }] };
  const out = withoutAny([nsl, ccl, other], { lines: "NSL", stations: "CC9" });
  assert.deepEqual(out.kept, [other]);
  assert.deepEqual(out.lines, ["NSL"]);
  assert.deepEqual(out.stations, ["CC9"]);
  assert.deepEqual(out.all, ["NSL", "CC9"]);
  assert.equal(out.dropped, 2);
});

test("avoiding nothing filters nothing", () => {
  const opts = [option(["NS13", "NS17"])];
  assert.equal(withoutAny(opts, {}).kept.length, 1);
  assert.deepEqual(withoutAny(opts, {}).all, []);
});

// --- Mitigation LTA has already activated ------------------------------------
//
// The brief: "the mitigation is in the feed. You do not have to infer which
// buses might help." These fields were being parsed and thrown away.
import { mitigationOf, mitigationsFor } from "../src/lib/planned.js";

const NAMES = { NS13: "Yishun", NS14: "Khatib", NS15: "Yio Chu Kang", EW21: "Buona Vista", EW23: "Clementi" };
const nameFor = (code) => NAMES[code] || code;

test("free bus boarding is read out as station names", () => {
  const out = mitigationOf({ line: "NSL", freeBus: "NS13,NS14,NS15" }, nameFor);
  assert.deepEqual(out.lines, ["Free bus boarding at Yishun, Khatib, Yio Chu Kang"]);
  assert.deepEqual(out.bus.stations, ["NS13", "NS14", "NS15"]);
});

test("the island-wide sentence is quoted, not wrapped in \"at\"", () => {
  // The field is either a station list or a sentence; treating the sentence as
  // a list produced "Free bus boarding at Free bus service island wide".
  const out = mitigationOf({ line: "EWL", freeBus: "Free bus service island wide" }, nameFor);
  assert.deepEqual(out.lines, ["Free bus service island wide"]);
  assert.equal(out.bus.sentence, true);
});

test("a shuttle carries its direction when it runs one way", () => {
  const out = mitigationOf({ line: "EWL", freeShuttle: "EW21,EW23", shuttleDirection: "towards Jurong East" }, nameFor);
  assert.deepEqual(out.lines, ["Free MRT shuttle at Buona Vista, Clementi towards Jurong East"]);
  assert.equal(out.direction, "towards Jurong East");
});

test("a shuttle running both ways does not say so", () => {
  const out = mitigationOf({ line: "NSL", freeShuttle: "NS13,NS14", shuttleDirection: "Both" }, nameFor);
  assert.equal(out.direction, "");
  assert.doesNotMatch(out.lines[0], /both/i);
});

test("both mitigations appear together, bus first", () => {
  const out = mitigationOf({ line: "NSL", freeBus: "NS13", freeShuttle: "NS14" }, nameFor);
  assert.equal(out.lines.length, 2);
  assert.match(out.lines[0], /bus boarding/);
  assert.match(out.lines[1], /shuttle/);
});

test("an alert with no mitigation is null, not an empty card", () => {
  assert.equal(mitigationOf({ line: "NSL", freeBus: "", freeShuttle: "" }), null);
  assert.equal(mitigationOf({ line: "NSL" }), null);
  assert.equal(mitigationOf(null), null);
});

test("alerts without mitigation drop out of the list", () => {
  const out = mitigationsFor(
    [{ line: "NSL", freeBus: "NS13" }, { line: "EWL" }, { line: "CCL", freeShuttle: "CC1" }],
    nameFor
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((m) => m.line), ["NSL", "CCL"]);
});

// --- The other half of "planned": road works and route changes ---------------
import { parseRoadWorks, currentRoadWorks, roadWorksOnRoute, roadWorkLabel, roadWorkDetail,
         parseBusRouteChanges, busChangesOnRoute, busChangeLabel, busChangeDetail } from "../src/lib/planned.js";

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 17, 9, 0, 0);
const work = (extra = {}) => ({ EventID: "RW1", RoadName: "BISHAN ROAD", Other: "Resurfacing", StartDate: new Date(NOW - DAY).toISOString(), EndDate: new Date(NOW + 7 * DAY).toISOString(), ...extra });

test("a road work keeps its road, dates and description", () => {
  const [w] = parseRoadWorks({ value: [work()] });
  assert.equal(w.kind, "roadwork");
  assert.equal(w.road, "BISHAN ROAD");
  assert.equal(w.other, "Resurfacing");
  assert.ok(w.startsAt < NOW && w.endsAt > NOW);
});

test("openings are tagged apart from works", () => {
  const [o] = parseRoadWorks({ value: [work()] }, "roadopening");
  assert.equal(o.kind, "roadopening");
  assert.match(roadWorkLabel(o), /^Road opening on/);
  assert.match(roadWorkLabel(parseRoadWorks({ value: [work()] })[0]), /^Road works on/);
});

test("a work with no road is dropped", () => {
  assert.equal(parseRoadWorks({ value: [work({ RoadName: "" })] }).length, 0);
  assert.deepEqual(parseRoadWorks(null), []);
});

test("finished works and ones far in the future are not current", () => {
  const rows = [
    work({ EventID: "past", EndDate: new Date(NOW - DAY).toISOString() }),
    work({ EventID: "soon", StartDate: new Date(NOW + 2 * 3600_000).toISOString(), EndDate: new Date(NOW + 5 * DAY).toISOString() }),
    work({ EventID: "far", StartDate: new Date(NOW + 30 * DAY).toISOString(), EndDate: new Date(NOW + 40 * DAY).toISOString() }),
  ];
  const out = currentRoadWorks(parseRoadWorks({ value: rows }), NOW);
  assert.deepEqual(out.map((w) => w.id), ["soon"], "only what is running now or starting within the day");
});

test("works are matched to the roads the journey actually uses", () => {
  const works = parseRoadWorks({ value: [work()] });
  assert.equal(roadWorksOnRoute(works, ["BISHAN ROAD"]).length, 1);
  assert.equal(roadWorksOnRoute(works, ["bishan road"]).length, 1, "case does not matter");
  assert.equal(roadWorksOnRoute(works, ["ORCHARD ROAD"]).length, 0, "a road you don't use is not your problem");
  assert.equal(roadWorksOnRoute(works, []).length, 0);
});

test("a work already under way says when it ends, not when it started", () => {
  const [w] = parseRoadWorks({ value: [work()] });
  assert.match(roadWorkDetail(w, NOW), /Until/);
  const [later] = parseRoadWorks({ value: [work({ StartDate: new Date(NOW + 2 * 3600_000).toISOString() })] });
  assert.match(roadWorkDetail(later, NOW), /Starts/);
});

test("one service changing at many stops is one change", () => {
  const out = parseBusRouteChanges({ value: [
    { ServiceNo: "410", EffectiveDate: new Date(NOW + 10 * DAY).toISOString() },
    { ServiceNo: "410", EffectiveDate: new Date(NOW + 10 * DAY).toISOString() },
    { ServiceNo: "851", EffectiveDate: new Date(NOW + 3 * DAY).toISOString() },
  ] });
  assert.equal(out.length, 2);
  assert.equal(out.find((c) => c.service === "410").stops, 2);
});

test("only changes to services you ride, and only ones still ahead", () => {
  const changes = parseBusRouteChanges({ value: [
    { ServiceNo: "410", EffectiveDate: new Date(NOW + 10 * DAY).toISOString() },
    { ServiceNo: "851", EffectiveDate: new Date(NOW - 10 * DAY).toISOString() },
    { ServiceNo: "999", EffectiveDate: new Date(NOW + 5 * DAY).toISOString() },
  ] });
  const out = busChangesOnRoute(changes, ["410", "851"], NOW);
  assert.deepEqual(out.map((c) => c.service), ["410"], "851's change already happened; 999 is not ridden");
});

test("a route change says its date, because being ahead of time is the point", () => {
  const [c] = parseBusRouteChanges({ value: [{ ServiceNo: "410", EffectiveDate: new Date(NOW + 10 * DAY).toISOString() }] });
  assert.equal(busChangeLabel(c), "Bus 410 route changes");
  assert.match(busChangeDetail(c), /From /);
  assert.match(busChangeDetail(c), /before it takes effect/);
});
