import { test, expect } from "@playwright/test";

// "must be usable in large text" is part of Mdm Lim's brief, so the scale has to
// actually grow the type — and the layout has to survive it on a phone.
async function open(page, persona) {
  await page.addInitScript((persona) => {
    localStorage.setItem("solvik:onboarded", "1");
    localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places: {
      home: { id: "home", name: "Bedok", address: "Bedok", ll: [1.324, 103.93], source: "onemap", verified: true },
      work: { id: "work", name: "SGH", address: "Singapore General Hospital", ll: [1.2797, 103.835], source: "onemap", verified: true },
    } }));
    localStorage.setItem("solvik:preferences", JSON.stringify({ persona }));
    localStorage.setItem("solvik:commutes", JSON.stringify([{ from: "home", to: "work", days: ["Mon"], mins: 540, mode: "Comfort", legs: ["EWL"],
      fromPlace: { id: "home", label: "Bedok", place: "Bedok", ll: [1.324, 103.93] },
      toPlace: { id: "work", label: "SGH", place: "Singapore General Hospital", ll: [1.2797, 103.835] } }]));
  }, persona);
  await page.route(u => u.pathname.startsWith("/api/"), r => r.fulfill({ json: { stations: [], slots: [], works: [], roadWorks: [], busChanges: [], groups: [], series: {} } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Plan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
}

// A custom property reads back as its unresolved calc() text, so the scale has
// to be measured on something actually rendered.
const bodySize = (page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.fontSize = "var(--size-body)";
    document.querySelector(".solvik-app-shell").appendChild(probe);
    const size = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return size;
  });

test("the step-free persona gets larger type everywhere", async ({ page }) => {
  await open(page, "stepFree");
  await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  expect(await bodySize(page)).toBeGreaterThan(19);
});

test("other personas keep the default scale", async ({ page }) => {
  await open(page, "fixed");
  await expect(page.locator("html")).not.toHaveAttribute("data-text", "large");
  expect(await bodySize(page)).toBeCloseTo(17, 0);
});

test("large text does not break the phone layout", async ({ page }) => {
  // The reason this is not just a CSS variable: bigger type on a 393px screen is
  // where a layout falls apart, and it has to be checked rather than assumed.
  await open(page, "stepFree");
  expect(await page.locator(".solvik-app-shell").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("the hero clock stays on one line at large text", async ({ page }) => {
  // At 1.25 it wrapped to "09:" / "00", which is where a scale factor stops
  // being a token change and becomes a layout problem.
  await open(page, "stepFree");
  const clock = page.getByText(/^\d{2}:\d{2}$/).first();
  await expect(clock).toBeVisible();
  const lines = await clock.evaluate((el) => {
    const style = getComputedStyle(el);
    return el.getBoundingClientRect().height / parseFloat(style.fontSize);
  });
  expect(lines).toBeLessThan(1.6);
});
