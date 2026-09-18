import { test, expect } from "@playwright/test";

test("the map weather button reflects Singapore conditions and opens a compact summary", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("solvik:onboarded", "1"));
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    let response = {};
    if (url.pathname.endsWith("weather")) response = {
      nowcast: {
        areas: [{ name: "City", ll: [1.2903, 103.8519], text: "Heavy Thundery Showers", condition: "wet" }],
        validTo: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      outlook: null,
    };
    else if (url.pathname.endsWith("crowding")) response = { stations: [], slots: [] };
    else if (url.pathname.endsWith("forecast")) response = { slots: [], series: {} };
    else if (url.pathname.endsWith("planned")) response = { works: [], roadWorks: [], busChanges: [] };
    else if (url.pathname.endsWith("road")) response = { bands: [], incidents: [] };
    else if (url.pathname.endsWith("lta")) response = { value: { Status: 1, AffectedSegments: [], Message: [] } };
    await route.fulfill({ json: response });
  });

  await page.goto("/");
  const weatherButton = page.getByRole("button", { name: "Singapore weather: Heavy Thundery Showers" });
  await expect(weatherButton).toBeVisible();
  await expect(weatherButton).toHaveAttribute("title", "Heavy Thundery Showers");
  await expect(weatherButton.locator("img[data-weather-icon='cloud-lightning']")).toBeVisible();
  expect(await weatherButton.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  expect(await weatherButton.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("rgb(22, 29, 33)");
  expect(await weatherButton.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius))).toBeGreaterThan(20);
  await weatherButton.click();

  const weatherPanel = page.getByRole("region", { name: "Singapore weather" });
  await expect(weatherPanel).toBeVisible();
  await expect(weatherPanel.getByText("Heavy Thundery Showers", { exact: true })).toBeVisible();
  await expect(weatherPanel.getByText(/City · NEA 2-hour forecast/)).toBeVisible();
  expect(await weatherPanel.locator(".sv-map-weather-hero").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  const box = await weatherPanel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(393);
});
