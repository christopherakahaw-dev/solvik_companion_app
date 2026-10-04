// Search results lead with an icon guessed from the name. A wrong guess is
// worse than none, so anything unclear stays a plain pin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeKind } from "../src/lib/placeKind.js";

const icon = (name, detail) => placeKind(name, detail).icon;

test("stations, interchanges and malls are recognised by name", () => {
  assert.equal(icon("BISHAN MRT STATION (NS17 / CC15)"), "train-front");
  assert.equal(icon("PUNGGOL LRT STATION (PE1)"), "tram-front");
  assert.equal(icon("BISHAN BUS INTERCHANGE"), "bus");
  assert.equal(icon("JUNCTION 8 SHOPPING CENTRE"), "shopping-bag");
  assert.equal(icon("CATHOLIC HIGH SCHOOL"), "graduation-cap");
  assert.equal(icon("TAN TOCK SENG HOSPITAL"), "hospital");
  assert.equal(icon("BISHAN-ANG MO KIO PARK"), "trees");
  assert.equal(icon("MAXWELL FOOD CENTRE"), "utensils");
  assert.equal(icon("BLK 123 ANG MO KIO AVENUE 3"), "building-2");
});

test("a road named after a park is a road, not a park", () => {
  assert.equal(icon("PARK LANE"), "map-pin");
  assert.equal(icon("BOTANIC GARDENS ROAD"), "map-pin");
});

test("the name decides before the address does", () => {
  assert.equal(icon("BISHAN MRT STATION", "9 BISHAN PLACE JUNCTION 8 SHOPPING CENTRE"), "train-front");
  assert.equal(icon("UNIQLO", "JUNCTION 8 SHOPPING CENTRE"), "shopping-bag");
});

test("anything unclear is a plain pin", () => {
  assert.deepEqual(placeKind("1 RAFFLES PLACE"), { icon: "map-pin", label: "Place" });
  assert.deepEqual(placeKind(""), { icon: "map-pin", label: "Place" });
});
