// The Hobby plan allows twelve serverless functions and we have fifteen
// endpoints, so api/[...path].js dispatches to api/_handlers/*.js by hand.
// A hand-written table can fall out of step with the directory, and the only
// symptom would be a 404 in production. These tests make it a red test instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dispatch, { ROUTE_NAMES, routeNameFrom } from "../api/[...path].js";

const handlersDir = fileURLToPath(new URL("../api/_handlers/", import.meta.url));

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("every handler file is reachable through the dispatcher", async () => {
  const files = (await readdir(handlersDir)).filter((f) => f.endsWith(".js"));
  const onDisk = files.map((f) => f.replace(/\.js$/, "")).sort();
  assert.deepEqual(ROUTE_NAMES.slice().sort(), onDisk);
});

test("every route in the table actually loads", async () => {
  // Importing proves the module resolves — the relative-import rewrite that
  // came with the move (./_lib/ became ../_lib/) would fail loudly here.
  for (const name of ROUTE_NAMES) {
    const mod = await import(`../api/_handlers/${name}.js`);
    assert.equal(typeof mod.default, "function", `${name} exports no handler`);
  }
});

test("the endpoint is read from the matched path segment", () => {
  assert.equal(routeNameFrom({ query: { path: ["weather"] } }), "weather");
  assert.equal(routeNameFrom({ query: { path: "trip-options" } }), "trip-options");
  assert.equal(routeNameFrom({ url: "/api/lta?endpoint=TrainServiceAlerts" }), "lta");
});

test("an unknown endpoint is a 404, not a crash", async () => {
  const res = responseRecorder();
  await dispatch({ query: { path: ["nope"] } }, res);
  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /\/api\/nope/);
});

test("the router's own path segment is not passed on as a query parameter", async () => {
  let seen = null;
  const res = responseRecorder();
  // /api/lta with no key configured answers without touching the network, so
  // this exercises the real dispatch rather than a stub.
  const previous = process.env.LTA_ACCOUNT_KEY;
  delete process.env.LTA_ACCOUNT_KEY;
  try {
    const req = { url: "/api/lta?endpoint=TrainServiceAlerts", query: { path: ["lta"], endpoint: "TrainServiceAlerts" } };
    await dispatch(req, res);
    seen = req.query;
  } finally {
    if (previous != null) process.env.LTA_ACCOUNT_KEY = previous;
  }
  assert.deepEqual(seen, { endpoint: "TrainServiceAlerts" });
});
