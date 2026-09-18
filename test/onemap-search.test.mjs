import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { distanceMetres, oneMapSearch } from "../api/_lib/onemap.js";

const realFetch = globalThis.fetch;
const realToken = process.env.ONEMAP_TOKEN;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realToken == null) delete process.env.ONEMAP_TOKEN;
  else process.env.ONEMAP_TOKEN = realToken;
});

function rawPlace(name, lat, lng) {
  return {
    BUILDING: name,
    SEARCHVAL: name,
    ADDRESS: `${name} ADDRESS`,
    POSTAL: "123456",
    LATITUDE: String(lat),
    LONGITUDE: String(lng),
  };
}

test("nearby OneMap search loads every page and ranks from the supplied pin", async () => {
  process.env.ONEMAP_TOKEN = "test-token";
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get("pageNum"));
    calls.push({ page, authorization: init?.headers?.Authorization });
    const results = page === 1
      ? [rawPlace("FAR CLINIC", 1.42, 103.94)]
      : [rawPlace("NEAR CLINIC", 1.3001, 103.8001)];
    return new Response(JSON.stringify({ totalNumPages: 2, pageNum: page, results }), { status: 200 });
  };

  const results = await oneMapSearch("qa-nearby-clinic", { near: [1.3, 103.8] });

  assert.deepEqual(calls.map((call) => call.page), [1, 2]);
  assert.ok(calls.every((call) => call.authorization === "test-token"));
  assert.deepEqual(results.map((result) => result.name), ["NEAR CLINIC", "FAR CLINIC"]);
  assert.ok(results[0].distanceMetres < results[1].distanceMetres);
});

test("preset area categories use a radius query centered on the dropped pin", async () => {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ elements: [
      { type: "node", id: 1, lat: 1.32, lon: 103.82, tags: { name: "FARTHER CLINIC", amenity: "clinic" } },
      { type: "node", id: 2, lat: 1.3001, lon: 103.8001, tags: { name: "PIN-SIDE CLINIC", amenity: "clinic", "addr:street": "Near Road" } },
    ] }), { status: 200 });
  };

  const results = await oneMapSearch("clinic", { near: [1.3, 103.8] });

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /overpass-api/);
  assert.match(requests[0].init.body, /around%3A5000%2C1.3%2C103.8/);
  assert.deepEqual(results.map((result) => result.name), ["PIN-SIDE CLINIC", "FARTHER CLINIC"]);
  assert.ok(results.every((result) => result.source === "OpenStreetMap"));
});

test("distance calculation is stable at Singapore latitudes", () => {
  const metres = distanceMetres([1.3, 103.8], [1.301, 103.8]);
  assert.ok(metres > 110 && metres < 112);
});

 test("search without credentials uses public results even with an auth advisory", async () => {
  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  delete process.env.ONEMAP_TOKEN;
  delete process.env.ONEMAP_EMAIL;
  delete process.env.ONEMAP_PASSWORD;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.headers.Authorization, undefined);
      return new Response(JSON.stringify({ error: "Authentication token missing", results: [rawPlace("CLEMENTI", 1.315, 103.765)] }), { status: 200 });
    };
    const results = await oneMapSearch("clementi");
    assert.equal(results[0].name, "CLEMENTI");
  } finally {
    if (email != null) process.env.ONEMAP_EMAIL = email;
    if (password != null) process.env.ONEMAP_PASSWORD = password;
  }
});
