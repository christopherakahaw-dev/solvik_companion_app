import test from "node:test";
import assert from "node:assert/strict";

import { placeFromReverse } from "../api/_lib/onemap.js";

test("a named building is named, with its street and postcode beneath", () => {
  assert.deepEqual(
    placeFromReverse({ GeocodeInfo: [{ BUILDINGNAME: "CLEMENTI MALL", BLOCK: "3155", ROAD: "COMMONWEALTH AVENUE WEST", POSTALCODE: "129588" }] }),
    { name: "CLEMENTI MALL", address: "BLK 3155 COMMONWEALTH AVENUE WEST SINGAPORE 129588", postal: "129588" }
  );
});

test("an HDB block with no building name reads as its block and road", () => {
  assert.deepEqual(
    placeFromReverse({ GeocodeInfo: [{ BUILDINGNAME: "NIL", BLOCK: "413", ROAD: "COMMONWEALTH AVENUE WEST", POSTALCODE: "120413" }] }),
    { name: "BLK 413 COMMONWEALTH AVENUE WEST", address: "SINGAPORE 120413", postal: "120413" }
  );
});

test("OneMap's placeholder values are treated as empty, and empty rows are skipped", () => {
  assert.equal(placeFromReverse({ GeocodeInfo: [{ BUILDINGNAME: "null", BLOCK: "NIL", ROAD: "NIL" }] }), null);
  assert.equal(placeFromReverse({ GeocodeInfo: [] }), null);
  assert.equal(placeFromReverse(null), null);
  assert.equal(placeFromReverse({ GeocodeInfo: [{ BUILDINGNAME: "NIL", ROAD: "NIL" }, { ROAD: "JURONG WEST STREET 62", BLOCK: "NIL" }] }).name, "JURONG WEST STREET 62");
});
