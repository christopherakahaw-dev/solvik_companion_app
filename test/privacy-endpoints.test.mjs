import { test } from "node:test";
import assert from "node:assert/strict";
import searchHandler from "../api/_handlers/onemap-search.js";
import stopHandler from "../api/_handlers/nearest-stop.js";
import nearbyStopsHandler from "../api/_handlers/nearby-stops.js";

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
}

test("private search rejects invalid input without putting it in the URL or cache", async () => {
  const res = responseRecorder();
  await searchHandler({ url: "/api/onemap-search", body: { query: "x" }, query: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["cache-control"], "private, no-store");
  assert.equal(res.headers["referrer-policy"], "no-referrer");
});

test("private search rejects malformed nearby coordinates", async () => {
  const res = responseRecorder();
  await searchHandler({ url: "/api/onemap-search", body: { query: "clinic", near: [1.3] }, query: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /latitude, longitude/);
});

test("nearest-stop coordinates are accepted from a private POST body", async () => {
  const res = responseRecorder();
  await stopHandler({ url: "/api/nearest-stop", body: { lat: "not-a-number", lng: 103.8 }, query: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["cache-control"], "private, no-store");
});

test("nearby bus-stop coordinates stay in a private POST body", async () => {
  const res = responseRecorder();
  await nearbyStopsHandler({ url: "/api/nearby-stops", body: { lat: 91, lng: 103.8 }, query: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["cache-control"], "private, max-age=60");
  assert.match(res.body.error, /lat\/lng/);
});
