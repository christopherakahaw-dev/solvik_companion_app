import { test, expect } from "@playwright/test";

// These runs have no VITE_MAPTILER_KEY, so the live base is OneMap. That is the
// case worth pinning here: the keyed case is covered in test/map-base.test.mjs,
// and the key cannot be changed per test anyway — Vite bakes it in at build.

async function openMap(page) {
  await page.addInitScript(() => {
    localStorage.setItem("solvik:onboarded", "1");
    localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places: {} }));
  });
  await page.route(u => u.pathname.startsWith("/api/"), r => r.fulfill({ json: { stations: [], slots: [], works: [], groups: [] } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Map", exact: true })).toBeVisible();
}

test("the live base is credited, and the credit clears the tab bar", async ({ page }) => {
  await openMap(page);
  const attr = page.locator(".leaflet-control-attribution").first();
  await expect(attr).toBeVisible();

  // Attribution is a licence condition, so it must name whoever's data is
  // actually on screen. With no key that is OneMap — SLA's own national map,
  // which is not derived from OpenStreetMap, so crediting OSM here would be a
  // false statement about the map being shown.
  await expect(attr).toContainText("Singapore Land Authority");

  // Clear of the tab bar: a credit hidden behind a nav bar is not displayed,
  // and the licence requires it to be shown.
  const lifted = await attr.evaluate(el => getComputedStyle(el.closest(".leaflet-bottom")).bottom);
  expect(parseInt(lifted, 10)).toBeGreaterThan(60);
});

test("a build with no MapTiler key never requests a MapTiler tile", async ({ page }) => {
  // The regression this guards: with no key the map used to start on OneMap
  // and, the first time a OneMap tile failed, swap to a MapTiler URL ending in
  // a bare `?key=`. Every tile after that was a 403 — hundreds of them, and an
  // empty grid at the end of it.
  const maptiler = [];
  page.on("request", (r) => {
    if (r.url().includes("api.maptiler.com")) maptiler.push(r.url());
  });

  await openMap(page);
  // Give the tile layer time to fail and fall back if it is going to.
  await page.waitForTimeout(2500);

  expect(maptiler, `requested MapTiler with no key: ${maptiler[0]}`).toEqual([]);
});
