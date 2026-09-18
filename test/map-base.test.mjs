// The map base and its fallback. This exists because of a real failure: a
// deployment with no VITE_MAPTILER_KEY fell back from OneMap *to* MapTiler and
// requested tile after tile from a URL ending in a bare `?key=`, every one a
// 403, leaving an empty grid behind a flooded console.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseLayerOrder, mapTilerKey, osmTileUrl, ONEMAP_TILE_URL } from "../src/lib/mapBase.js";

test("with a key, OSM leads and OneMap catches it", () => {
  const order = baseLayerOrder("abc123");
  assert.deepEqual(order.map((l) => l.name), ["osm", "onemap"]);
  assert.match(order[0].url, /api\.maptiler\.com/);
  assert.match(order[0].url, /key=abc123/);
  assert.equal(order[1].url, ONEMAP_TILE_URL);
});

test("with no key, MapTiler is not in the list at all", () => {
  for (const missing of ["", "   ", undefined, null]) {
    const order = baseLayerOrder(mapTilerKey({ VITE_MAPTILER_KEY: missing }));
    assert.deepEqual(order.map((l) => l.name), ["onemap"], `key ${JSON.stringify(missing)}`);
    assert.ok(
      order.every((l) => !l.url.includes("maptiler")),
      "a keyless build must never request a MapTiler tile — every one is a 403",
    );
  }
});

test("no base is ever asked for with an empty key", () => {
  for (const key of ["", "   ", undefined]) {
    for (const layer of baseLayerOrder(mapTilerKey({ VITE_MAPTILER_KEY: key }))) {
      assert.doesNotMatch(layer.url, /key=(&|$)/, `${layer.name} was given an empty key`);
    }
  }
});

test("the fallback list always ends somewhere, and never cycles", () => {
  // Running off the end is how the component stops retrying. A list that
  // repeated a base would put it in a loop.
  for (const key of ["abc123", ""]) {
    const names = baseLayerOrder(key).map((l) => l.name);
    assert.ok(names.length >= 1);
    assert.equal(new Set(names).size, names.length, "a base appears twice");
  }
});

test("each base carries the attribution actually owed", () => {
  const [osm, onemap] = baseLayerOrder("abc123");
  // OneMap is SLA's own national map, not an OSM rendering, so crediting OSM
  // there would be a false statement about whose data is on screen.
  assert.match(osm.options.attribution, /OpenStreetMap contributors/);
  assert.match(onemap.options.attribution, /Singapore Land Authority/);
  assert.doesNotMatch(onemap.options.attribution, /OpenStreetMap/);
});

test("a key with URL-significant characters is escaped, not interpolated raw", () => {
  assert.match(osmTileUrl("a&b=c"), /key=a%26b%3Dc/);
});

test("whitespace around a key is trimmed rather than sent", () => {
  assert.equal(mapTilerKey({ VITE_MAPTILER_KEY: "  abc123\n" }), "abc123");
  assert.equal(mapTilerKey({}), "");
  assert.equal(mapTilerKey(undefined), "");
});
