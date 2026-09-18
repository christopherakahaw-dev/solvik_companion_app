// Weather, parsed from the shapes data.gov.sg publishes — the OpenAPI specs the
// hackathon shipped in PS2/references are what these fixtures are built from.
//
// The rule being defended: the 24-hour feed publishes multi-hour periods, so a
// warning may never be phrased more precisely than that.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conditionOf, isWet, parseNowcast, parseOutlook, regionFor,
  forecastAt, nowcastAt, walkAdjustment, weatherLine, routeWeatherProfile, rankRoutesForWeather, weatherIconName, singaporeDayPhase, WET, SHOWERS, DRY,
} from "../src/lib/weather.js";
import { recordedNowcast, recordedOutlook } from "../api/_lib/recorded/index.js";

test("the forecast vocabulary sorts into what a commuter would do differently", () => {
  assert.equal(conditionOf("Heavy Thundery Showers"), WET);
  assert.equal(conditionOf("Moderate Rain"), SHOWERS);
  assert.equal(conditionOf("Light Rain"), SHOWERS);
  assert.equal(conditionOf("Fair (Day)"), DRY);
  assert.equal(conditionOf("Partly Cloudy"), DRY);
  assert.equal(conditionOf("Windy"), DRY, "wind is not rain");
  assert.equal(conditionOf(""), null, "nothing said is not the same as dry");
});

test("wet covers both rain grades, dry does not", () => {
  assert.ok(isWet(WET) && isWet(SHOWERS));
  assert.equal(isWet(DRY), false);
  assert.equal(isWet(null), false);
});

test("the nowcast keeps only areas it can place on a map", () => {
  const out = parseNowcast(recordedNowcast);
  assert.equal(out.areas.length, 3);
  assert.deepEqual(out.areas.map((a) => a.name), ["Yishun", "Bishan", "City"]);
  assert.equal(out.areas[0].condition, SHOWERS);
});

test("an unreadable weather payload is empty, not an exception", () => {
  assert.deepEqual(parseNowcast(null).areas, []);
  assert.deepEqual(parseOutlook(null).periods, []);
  assert.deepEqual(parseNowcast({ data: {} }).areas, []);
});

test("the nearest nowcast area to a point wins", () => {
  const out = parseNowcast(recordedNowcast);
  assert.equal(nowcastAt(out, [1.4294, 103.835]).name, "Yishun");
  assert.equal(nowcastAt(out, [1.2925, 103.8547]).name, "City");
  assert.equal(nowcastAt(out, null), null);
});

test("regions are picked by where you are", () => {
  assert.equal(regionFor([1.4294, 103.835]), "north");
  assert.equal(regionFor([1.2841, 103.8515]), "south");
  assert.equal(regionFor([1.35, 103.95]), "east");
  assert.equal(regionFor([1.35, 103.70]), "west");
  assert.equal(regionFor([1.35, 103.82]), "central");
});

test("the outlook is read at the time you would actually arrive", () => {
  const outlook = parseOutlook(recordedOutlook());
  assert.equal(outlook.periods.length, 4);
  const north = forecastAt({ outlook, ll: [1.4294, 103.835], at: Date.now() });
  assert.equal(north.condition, WET, "the recorded fixture puts heavy rain over the north");
  assert.equal(north.region, "north");
  const later = forecastAt({ outlook, ll: [1.4294, 103.835], at: Date.now() + 8 * 3600_000 });
  assert.equal(later.condition, DRY, "a later period is a different answer");
});

test("a time outside every published period returns nothing rather than guessing", () => {
  const outlook = parseOutlook(recordedOutlook());
  assert.equal(forecastAt({ outlook, ll: [1.43, 103.83], at: Date.now() + 40 * 3600_000 }), null);
  assert.equal(forecastAt({ outlook: null, ll: [1.43, 103.83], at: Date.now() }), null);
});

test("rain lengthens the walk, and by how much is a stated number", () => {
  const wet = walkAdjustment({ walkSecs: 720, condition: WET });
  assert.equal(wet.extraMins, 4);
  assert.ok(wet.wet);
  const dry = walkAdjustment({ walkSecs: 720, condition: DRY });
  assert.equal(dry.extraMins, 0);
  assert.equal(dry.factor, 1);
});

test("the warning is never phrased more precisely than the feed", () => {
  const line = weatherLine({
    forecast: { condition: SHOWERS, text: "Moderate Rain", label: "7.00 am to 9.00 am" },
    walkSecs: 720,
  });
  assert.match(line, /7\.00 am to 9\.00 am/, "the feed's own period, not a minute");
  assert.doesNotMatch(line, /\d{2}:\d{2}/, "no clock time we cannot support");
  assert.match(line, /2 min longer/);
});

test("fair weather says nothing at all", () => {
  // A card that fires on every dry day is noise, and trains people to ignore it.
  assert.equal(weatherLine({ forecast: { condition: DRY, text: "Fair" }, walkSecs: 720 }), "");
  assert.equal(weatherLine({ forecast: null, walkSecs: 720 }), "");
});

test("the map weather icon follows the published condition", () => {
  assert.equal(weatherIconName("Heavy Thundery Showers"), "cloud-lightning");
  assert.equal(weatherIconName("Moderate Rain"), "cloud-rain");
  assert.equal(weatherIconName("Partly Cloudy"), "cloud-sun");
  assert.equal(weatherIconName("Fair (Day)"), "sun");
  assert.equal(weatherIconName("Hazy"), "cloud-fog");
  assert.equal(weatherIconName(""), "cloud-off");
  assert.equal(weatherIconName("Partly Cloudy", "night"), "cloud-moon");
  assert.equal(weatherIconName("Fair (Night)", "night"), "moon");
});

test("Singapore time selects day and night weather themes", () => {
  assert.equal(singaporeDayPhase(Date.parse("2026-09-18T04:00:00Z")), "day");
  assert.equal(singaporeDayPhase(Date.parse("2026-09-18T13:00:00Z")), "night");
});

test("rain can move a slightly slower route with less walking into first place", () => {
  const nowcast = { areas: [
    { name: "Start", ll: [1.3, 103.8], text: "Heavy Rain", condition: WET },
    { name: "End", ll: [1.31, 103.81], text: "Heavy Rain", condition: WET },
  ] };
  const options = [
    { mins: 20, walkSecs: 900, legs: ["EWL"] },
    { mins: 22, walkSecs: 120, legs: ["EWL", "TEL"] },
  ];
  const ranked = rankRoutesForWeather(options, { nowcast, outlook: null, from: [1.3, 103.8], to: [1.31, 103.81], departureAt: Date.now() });
  assert.equal(ranked[0].originalIndex, 1);
  assert.equal(ranked[0].weather.wet, true);
  assert.match(ranked[0].weather.detail, /walking may take/i);
});

test("dry weather preserves OneMap's route order and is still visible", () => {
  const nowcast = { areas: [{ name: "City", ll: [1.3, 103.8], text: "Partly Cloudy", condition: DRY }] };
  const options = [{ mins: 20, walkSecs: 900, legs: ["EWL"] }, { mins: 22, walkSecs: 60, legs: ["BUS 10"] }];
  const ranked = rankRoutesForWeather(options, { nowcast, outlook: null, from: [1.3, 103.8], to: [1.31, 103.81], departureAt: Date.now() });
  assert.equal(ranked[0].originalIndex, 0);
  assert.equal(ranked[0].weather.title, "Partly Cloudy on this route");
  assert.match(ranked[0].weather.detail, /No rain adjustment/i);
});

test("wet cycling is placed behind a usable transit route", () => {
  const nowcast = { areas: [{ name: "City", ll: [1.3, 103.8], text: "Showers", condition: SHOWERS }] };
  const options = [{ mins: 18, walkSecs: 0, legs: ["CYCLE 8 km"] }, { mins: 26, walkSecs: 180, legs: ["NEL"] }];
  const ranked = rankRoutesForWeather(options, { nowcast, outlook: null, from: [1.3, 103.8], to: [1.31, 103.81], departureAt: Date.now() });
  assert.equal(ranked[0].originalIndex, 1);
  assert.match(ranked[1].weather.detail, /Cycling is deprioritised/i);
});
