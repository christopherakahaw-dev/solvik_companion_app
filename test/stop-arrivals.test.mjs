import test from "node:test";
import assert from "node:assert/strict";

import { compareServiceNo, parseStopArrivals } from "../api/_lib/arrivals.js";
import { etaLabel, stopArrivalsSummary, stopArrivalsView } from "../src/lib/stopArrivals.js";

const inMins = (mins) => new Date(Date.now() + mins * 60000 + 5000).toISOString();

test("a stop-only answer keeps every service, in the order a bus stop pole lists them", () => {
  const parsed = parseStopArrivals({
    Services: [
      { ServiceNo: "160A", Operator: "SMRT", NextBus: { EstimatedArrival: inMins(7), Load: "SDA" } },
      { ServiceNo: "10", Operator: "SBST", NextBus: { EstimatedArrival: inMins(2), Load: "SEA", Feature: "WAB" }, NextBus2: { EstimatedArrival: inMins(11) } },
      { ServiceNo: "2", Operator: "GAS", NextBus: { EstimatedArrival: "" } },
      { ServiceNo: "160", Operator: "SMRT", NextBus: { EstimatedArrival: inMins(4), Monitored: 0 } },
    ],
  });
  assert.deepEqual(parsed.services.map((s) => s.service), ["2", "10", "160", "160A"]);
  assert.equal(parsed.reason, null);
  assert.deepEqual(parsed.services[0].buses, [], "a service with nothing due keeps its row");
  assert.equal(parsed.services[1].buses.length, 2);
  assert.equal(parsed.services[1].buses[0].accessible, true);
  assert.equal(parsed.services[2].buses[0].monitored, false);
});

test("a stop with no services at all says none are running", () => {
  assert.deepEqual(parseStopArrivals({ Services: [] }), { services: [], reason: "none-running" });
});

test("service numbers sort by number, then suffix", () => {
  assert.deepEqual(["970", "10e", "2", "10", "NR1", "160A", "160"].sort(compareServiceNo), ["2", "10", "10e", "160", "160A", "970", "NR1"]);
});

test("times read as LTA's own words, and scheduled ones are marked", () => {
  assert.equal(etaLabel({ etaMins: 0, monitored: true }), "Arr");
  assert.equal(etaLabel({ etaMins: 4, monitored: true }), "4 min");
  assert.equal(etaLabel({ etaMins: 4, monitored: false }), "~4 min");
});

test("each service shows its next bus and the one after", () => {
  const view = stopArrivalsView({
    services: [
      { service: "10", buses: [{ etaMins: 2, monitored: true, load: "light", accessible: true }, { etaMins: 11, monitored: true }] },
      { service: "2", buses: [] },
    ],
    reason: null,
  });
  assert.equal(view.status, "ready");
  assert.deepEqual(view.services.map(({ service, next, after, due }) => ({ service, next, after, due })), [
    { service: "10", next: "2 min", after: "11 min", due: true },
    { service: "2", next: "No bus due", after: "", due: false },
  ]);
  assert.match(view.services[0].title, /Seats available · wheelchair accessible/);
});

test("nothing to show says which kind of nothing", () => {
  assert.equal(stopArrivalsView(undefined, { pending: true }).message, "Getting bus times…");
  assert.equal(stopArrivalsView(undefined, { error: "boom" }).status, "error");
  assert.match(stopArrivalsView({ services: [], reason: "no-key" }).message, /LTA DataMall key/);
  assert.match(stopArrivalsView({ services: [], reason: "none-running" }).message, /No buses due/);
});

test("the map marker summary lists the soonest buses first", () => {
  const view = stopArrivalsView({
    services: ["10", "95", "185", "196", "285"].map((service, i) => ({ service, buses: [{ etaMins: 9 - i * 2, monitored: true }] })),
  });
  assert.equal(stopArrivalsSummary(view), "285 1 min · 196 3 min · 185 5 min · 95 7 min · +1 more");
});
