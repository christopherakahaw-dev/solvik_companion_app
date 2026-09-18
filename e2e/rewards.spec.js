import { test, expect } from "@playwright/test";

async function openRewards(page, points) {
  await page.addInitScript(({ points }) => {
    if (!localStorage.getItem("qa:rewards-seeded")) {
      localStorage.setItem("solvik:onboarded", "1");
      localStorage.setItem("solvik:reports", JSON.stringify(points > 0 ? [{
        id: "reward-test-report",
        kind: "crowd",
        stationCode: "NS17",
        stationName: "Bishan",
        ll: [1.3508, 103.8485],
        points,
        state: "confirmed",
        at: Date.now(),
      }] : []));
      localStorage.setItem("solvik:rewardRedemptions", "[]");
      localStorage.setItem("qa:rewards-seeded", "1");
    }
  }, { points });
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    let response = {};
    if (url.pathname.endsWith("crowding")) response = { stations: [], slots: [] };
    else if (url.pathname.endsWith("forecast")) response = { slots: [], series: {} };
    else if (url.pathname.endsWith("planned")) response = { works: [], roadWorks: [], busChanges: [] };
    else if (url.pathname.endsWith("weather")) response = { nowcast: null, outlook: null };
    else if (url.pathname.endsWith("road")) response = { bands: [], incidents: [] };
    else if (url.pathname.endsWith("lta")) response = { value: { Status: 1, AffectedSegments: [], Message: [] } };
    await route.fulfill({ json: response });
  });
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Points", exact: true }).click();
}

test("rewards stay locked when there are no confirmed points", async ({ page }) => {
  await openRewards(page, 0);
  await expect(page.locator(".sv-rewards-screen").getByText("0", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Redeem", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Locked", exact: true })).toHaveCount(4);
});

test("redemption deducts confirmed points and persists", async ({ page }) => {
  await openRewards(page, 500);
  const kopitiam = page.getByText("$1 off at Kopitiam").locator("..").locator("..");
  await kopitiam.getByRole("button", { name: "Redeem", exact: true }).click();
  await expect(kopitiam.getByRole("button", { name: "Redeemed", exact: true })).toBeDisabled();
  await expect(page.getByText("100", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:rewardRedemptions")))).toEqual([
    expect.objectContaining({ id: "kopitiam-1", cost: 400 }),
  ]);

  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "Points", exact: true }).click();
  await expect(page.getByRole("button", { name: "Redeemed", exact: true })).toBeDisabled();
  await expect(page.getByText("100", { exact: true })).toBeVisible();
});
