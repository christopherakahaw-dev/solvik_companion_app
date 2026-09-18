// Demo mode exists so a dead venue network can't kill a five-minute slot. The
// property that keeps it honest is tested here: it is off unless switched on,
// and anything it serves is marked as recorded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { demoMode, serveRecorded } from "../api/_lib/demo.js";
import { recordedForecast, recordedRoute, recordedStations } from "../api/_lib/recorded/index.js";
import { normalizeItinerary } from "../api/_lib/itinerary.js";

function fakeRes() {
  const res = { statusCode: null, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test("it is off unless explicitly switched on", () => {
  delete process.env.DEMO_MODE;
  assert.equal(demoMode(), false);
  const res = fakeRes();
  assert.equal(serveRecorded(res, { options: [] }), false, "and refuses to answer");
  assert.equal(res.body, null);

  process.env.DEMO_MODE = "0";
  assert.equal(demoMode(), false);
  process.env.DEMO_MODE = "1";
  assert.equal(demoMode(), true);
  delete process.env.DEMO_MODE;
});

test("anything it serves is marked recorded, so the UI can say so", () => {
  process.env.DEMO_MODE = "1";
  const res = fakeRes();
  assert.equal(serveRecorded(res, { options: [1, 2] }), true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.recorded, true);
  assert.deepEqual(res.body.options, [1, 2]);
  assert.equal(res.headers["Cache-Control"], "no-store");
  delete process.env.DEMO_MODE;
});

test("the recorded route is a real recording, and maps like a live one", () => {
  const options = (recordedRoute.plan.itineraries || []).map((i) => normalizeItinerary(i, "Bishan Park")).filter(Boolean);
  assert.ok(options.length >= 1);
  assert.ok(options[0].steps.length >= 2, "it has a real step sequence");
  assert.ok(options[0].legs.length >= 1);
});

test("the recorded forecast is anchored to the day it is asked for", () => {
  const morning = recordedForecast(new Date("2026-09-16T09:00:00+08:00"));
  const first = new Date(morning.slots[0]);
  assert.equal(first.getHours(), 5);
  assert.equal(first.getMinutes(), 30);
  // Busy somewhere in the peak, so the demo has something to show.
  assert.ok(Object.values(morning.series.NS26).includes("busy"));
  assert.ok(recordedStations.every((st) => st.code && Number.isFinite(st.lat)));
});

test("the recorded forecast covers the whole service day, not just the morning", () => {
  // It used to stop at 10:00. A demo at two in the afternoon then had no
  // forecast covering the trip, so the crowd warning never appeared — the one
  // feature the fixture exists to show.
  const fc = recordedForecast(new Date("2026-09-16T14:00:00+08:00"));
  const hours = fc.slots.map((iso) => new Date(iso).getHours());
  assert.ok(Math.min(...hours) <= 6, "starts at or before 06:00");
  assert.ok(Math.max(...hours) >= 23, "runs to the end of service");
  assert.equal(fc.slots.length, 37, "a 30-minute grid across the day");

  // Both peaks are present, so an evening demo shows a crowd as readily as a
  // morning one.
  const at = (hh) => fc.series.NS26[fc.slots.find((iso) => new Date(iso).getHours() === hh)];
  assert.equal(at(8), "busy", "morning peak");
  assert.equal(at(18), "busy", "evening peak");
  assert.equal(at(14), "light", "quiet in between");
});

test("the recorded disruption carries the mitigation LTA publishes with it", async () => {
  // The brief singles these fields out: the mitigation is in the feed, not
  // something to infer. A recording without them leaves the decision-support
  // line — the free bus and shuttle — impossible to demo or test.
  const { recordedAlerts } = await import("../api/_lib/recorded/index.js");
  const seg = recordedAlerts.AffectedSegments[0];
  assert.ok(seg.FreePublicBus, "FreePublicBus");
  assert.ok(seg.FreeMRTShuttle, "FreeMRTShuttle");
  assert.ok(seg.MRTShuttleDirection, "MRTShuttleDirection");
  // The free bus must cover stations the disruption actually names, or the
  // fixture is telling two different stories.
  const affected = seg.Stations.split(",").map((s) => s.trim());
  const free = seg.FreePublicBus.split(",").map((s) => s.trim());
  assert.ok(free.every((code) => affected.includes(code)));
});

test("VITE_DEMO_MODE alone turns demo mode on", () => {
  // It has to be set for the browser bundle regardless, so requiring a second
  // server-side variable saying the same thing was configuration for its own
  // sake — and a demo that half-works because you set one of two is worse than
  // one that does not run at all.
  delete process.env.DEMO_MODE;
  process.env.VITE_DEMO_MODE = "1";
  assert.equal(demoMode(), true);
  process.env.VITE_DEMO_MODE = "0";
  assert.equal(demoMode(), false);
  delete process.env.VITE_DEMO_MODE;
  assert.equal(demoMode(), false);
});

test("demo mode never calls a paid API, even with a key configured", async () => {
  // The live call used to run first and the recorded verdict was only a
  // fallback, so a demo with a key set billed for every report filed on stage.
  process.env.VITE_DEMO_MODE = "1";
  process.env.GEMINI_API_KEY = "AIza-should-never-be-used";
  let called = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("generativelanguage.googleapis.com")) called = true;
    return { ok: false, status: 503, json: async () => ({}) };
  };
  try {
    const { default: handler } = await import("../api/_handlers/report.js");
    const res = {
      headers: {}, statusCode: 0, body: null,
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    // The request can fail its deterministic checks; it must still never make
    // a paid vision call while demo mode is active.
    await handler({ method: "POST", headers: {}, body: { kind: "esc", stationCode: "NS17" } }, res);
    assert.equal(called, false, "demo mode must not reach the Gemini API");
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.__viteDemo;
    delete process.env.VITE_DEMO_MODE;
    delete process.env.GEMINI_API_KEY;
  }
});
