import { test } from "@playwright/test";

const OUT = process.env.SHOT_DIR || "demo-capture";

// The app scrolls an inner container, not the document, so fullPage screenshots
// catch only whatever happens to be in view. Find the real scroller and step
// down it.
async function scroller(page) {
  return page.evaluateHandle(() => {
    const all = [document.scrollingElement, ...document.querySelectorAll("div")];
    let best = document.scrollingElement;
    let most = 0;
    for (const el of all) {
      if (!el) continue;
      const over = el.scrollHeight - el.clientHeight;
      if (over > most && el.clientHeight > 300) { most = over; best = el; }
    }
    return best;
  });
}

test("demo data walkthrough", async ({ page }) => {
  let n = 0;
  const shot = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png` });
  };
  const toTop = async () => {
    const s = await scroller(page);
    await s.evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(500);
  };
  const scrollThrough = async (prefix) => {
    await toTop();
    const s = await scroller(page);
    const steps = await s.evaluate((el) => Math.ceil((el.scrollHeight - el.clientHeight) / (el.clientHeight * 0.8)));
    await shot(`${prefix}-top`);
    for (let i = 1; i <= Math.min(steps, 5); i++) {
      await s.evaluate((el, i) => { el.scrollTop = el.clientHeight * 0.8 * i; }, i);
      await shot(`${prefix}-${i}`);
    }
  };

  await page.goto("/");
  await page.waitForTimeout(1200);
  await shot("landing");

  await page.getByRole("button", { name: "Choose your style" }).click();
  await page.waitForTimeout(900);
  await shot("onboarding");

  await page.getByRole("button", { name: /^Fixed Schedule/ }).click();
  await page.getByRole("button", { name: /^Continue with Fixed Schedule/ }).click();
  await page.getByRole("button", { name: "Review this setup" }).click();
  await page.getByRole("button", { name: "Show my route" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.waitForTimeout(1500);
  await shot("empty-nothing-seeded");

  await page.getByRole("button", { name: /sample trips/ }).click();
  await page.waitForTimeout(3500);
  await scrollThrough("seeded");

  await toTop();
  await page.getByRole("button", { name: /Step-free access/ }).click();
  await page.waitForTimeout(1600);
  await scrollThrough("stepfree-large-text");

  await toTop();
  await page.getByRole("button", { name: /Fixed schedule/ }).click();
  await page.waitForTimeout(1200);

  for (const [tab, name] of [["Map", "map"], ["Report", "report"], ["Points", "points"]]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(2000);
    await shot(name);
  }
});
