import { test, expect } from "@playwright/test";

const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  pageErrors.set(page, []);
  page.on("pageerror", error => pageErrors.get(page).push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), "No uncaught browser errors").toEqual([]);
});

const home = { id: "home", name: "413 COMMONWEALTH AVENUE WEST SINGAPORE 120413", address: "413 COMMONWEALTH AVENUE WEST SINGAPORE 120413", postal: "120413", ll: [1.311, 103.77], source: "onemap", verified: true };
const school = { id: "school", name: "NANYANG TECHNOLOGICAL UNIVERSITY", address: "50 NANYANG AVENUE SINGAPORE 639798", postal: "639798", ll: [1.348, 103.683], source: "onemap", verified: true };
const bugis = { name: "BUGIS+", address: "201 VICTORIA STREET SINGAPORE 188067", postal: "188067", lat: 1.299, lng: 103.855 };
const destination = { name: "CLEMENTI ARCADE", address: "41 SUNSET WAY CLEMENTI ARCADE SINGAPORE 597071", postal: "597071", lat: 1.323, lng: 103.767 };
const option = { mins: 154, eta: "03:22", fare: "$0.00", walk: "154 min", walkOnly: true, walkSecs: 9240, transfers: 0, tag: "Walking only", geometry: [home.ll, [destination.lat, destination.lng]], legSpans: [{from: 0, to: 1}], transitLegs: [], legs: ["WALK 12.8 km"], steps: [{ mode: "WALK", icon: "flag", title: "Walk to CLEMENTI ARCADE", detail: "12.8 km on foot", metres: 12808, secs: 9240 }], note: "OneMap returned walking only for this departure." };

async function setup(page, places = { home, school }, options = {}) {
  await page.addInitScript(({ places }) => {
    if (!localStorage.getItem("qa:seeded")) {
      localStorage.setItem("solvik:onboarded", "1");
      localStorage.setItem("solvik:is_guest", "true");
      localStorage.setItem("solvik:preferences", JSON.stringify({ travelStyle: "flexible", persona: "flexible", travelStyleSelected: true }));
      localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places }));
      localStorage.setItem("solvik:searches", JSON.stringify([{ name: "CLARKE QUAY MRT STATION", detail: "10 EU TONG SEN STREET", ll: [1.288, 103.846] }]));
      localStorage.setItem("qa:seeded", "1");
    }
    window.qaLocationCalls = 0;
    navigator.geolocation.getCurrentPosition = (success) => { window.qaLocationCalls++; success({ coords: { latitude: 1.34, longitude: 103.7, accuracy: 15 }, timestamp: Date.now() }); };
    navigator.geolocation.watchPosition = (success) => { success({ coords: { latitude: 1.34, longitude: 103.7, accuracy: 15 }, timestamp: Date.now() }); return 1; };
    navigator.geolocation.clearWatch = () => {};
  }, { places });
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    let response = {};
    if (path.endsWith("onemap-search")) {
      options.onSearch?.(body);
      response = /mrt station/i.test(body.query) && Array.isArray(body.near)
        ? { results: [
            { name: "FAR MRT STATION", address: "Across Singapore", postal: "999999", lat: body.near[0] + 0.1, lng: body.near[1] + 0.1 },
            { name: "PIN-SIDE MRT STATION", address: "Beside the dropped pin", postal: "111111", lat: body.near[0] + 0.0001, lng: body.near[1] + 0.0001 },
          ] }
        : { results: /bugis/i.test(body.query) ? [bugis] : /nanyang|^nt/i.test(body.query) ? [{ ...school, lat: school.ll[0], lng: school.ll[1] }] : Array.from({ length: 8 }, (_, i) => ({ ...destination, name: i ? `CLEMENTI PLACE ${i}` : destination.name })) };
    }
    else if (path.endsWith("trip-options")) response = { options: options.tripOptions || [option] };
    else if (path.endsWith("nearby-stops")) response = { stops: options.nearbyStops || [
      { code: "28031", name: "Opp Blk 413", road: "Commonwealth Ave West", lat: 1.3112, lng: 103.7701, distanceM: 24 },
      { code: "28039", name: "Blk 413", road: "Commonwealth Ave West", lat: 1.3121, lng: 103.771, distanceM: 160 },
    ] };
    else if (path.endsWith("ai")) response = options.aiDecision
      ? { configured: true, model: "gemini-3.5-flash-lite", decision: options.aiDecision }
      : { configured: false };
    else if (path.endsWith("crowding")) response = { stations: [{ code: "EW24", name: "Jurong East", lat: 1.333, lng: 103.742, level: "moderate" }], slots: (options.crowdOffsets || [-1800000, 1800000, 3600000]).map((offset) => new Date(Date.now() + offset).toISOString()) };
    else if (path.endsWith("forecast")) response = { slots: [], series: {} };
    await route.fulfill({ json: response });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Plan", exact: true })).toBeVisible();
}

async function pickDestination(page) {
  await page.getByRole("textbox", { name: "Search address, stop or area", exact: true }).fill("clem");
  await page.getByRole("button", { name: /^CLEMENTI ARCADE/ }).click();
}

async function noOverflow(page) {
  expect(await page.locator(".solvik-app-shell").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test("a new device opens the account gate with a guest option", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const accountOptions = page.getByRole("tablist", { name: "Account options" });
  await expect(accountOptions.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  await expect(accountOptions.getByRole("button", { name: "Register", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue as Guest" })).toBeVisible();
  await noOverflow(page);
});

test("map overlays remain separated and search is anchored to the field", async ({ page }, info) => {
  await setup(page);
  await expect(page.getByRole("button", { name: /Crowding layer/ })).toHaveCount(0);
  await expect(page.locator(".sv-crowd-bar")).toHaveCount(0);
  const nav = await page.getByRole("navigation").boundingBox();
  const search = page.getByRole("textbox", { name: "Search address, stop or area", exact: true });
  await search.focus();
  const panel = page.locator(".sv-map-results");
  await expect(panel).toBeVisible();
  const input = await search.boundingBox(), results = await panel.boundingBox();
  expect(results.y - input.y - input.height).toBeLessThan(40);
  await search.fill("clem");
  await expect(page.getByRole("button", { name: /^CLEMENTI ARCADE/ })).toBeVisible();
  const box = await panel.boundingBox();
  expect(box.y + box.height).toBeLessThan(nav.y);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("search.png") });
});

test("recent searches stay compact and close when search focus ends", async ({ page }) => {
  await setup(page);
  const search = page.getByRole("textbox", { name: "Search address, stop or area", exact: true });
  const panel = page.locator(".sv-map-results");

  for (const viewport of [{ width: 393, height: 700 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await search.focus();
    await expect(panel).toBeVisible();
    const sizes = await panel.locator(".sv-recent-row").first().evaluate((row) => ({
      name: parseFloat(getComputedStyle(row.querySelector(".sv-recent-name")).fontSize),
      detail: parseFloat(getComputedStyle(row.querySelector(".sv-recent-detail")).fontSize),
    }));
    expect(sizes.name).toBeLessThanOrEqual(14);
    expect(sizes.detail).toBeLessThanOrEqual(12);

    await page.mouse.click(5, Math.round(viewport.height / 2));
    await expect(panel).toBeHidden();
    await expect(search).not.toBeFocused();
  }
});

test("bus stops near me uses the device location and opens routing", async ({ page }) => {
  await setup(page);
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/nearby-stops")) requests.push(request.postDataJSON());
  });

  await page.getByRole("textbox", { name: "Search address, stop or area", exact: true }).focus();
  await page.getByRole("button", { name: /Bus stops near me/ }).click();

  const search = page.getByRole("textbox", { name: "Search address, stop or area", exact: true });
  const tray = page.getByRole("region", { name: "Bus stops near me" });
  await expect(search).not.toBeFocused();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(tray).toBeVisible();
  await expect(page.locator(".sv-nearby-bus-row", { hasText: "Opp Blk 413" })).toBeVisible();
  await expect(page.getByText("Commonwealth Ave West · 20 m away", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ lat: 1.34, lng: 103.7 });
  await expect(page.locator(".sv-nearby-bus-marker")).toHaveCount(2);
  const trayBox = await tray.boundingBox();
  const navBox = await page.getByRole("navigation", { name: "Main navigation" }).boundingBox();
  expect(trayBox.y + trayBox.height).toBeLessThanOrEqual(navBox.y + 1);

  await page.getByRole("button", { name: /Route to Opp Blk 413/ }).click();
  await expect(page.getByRole("button", { name: "Change destination" }).getByText("Opp Blk 413", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Route options" })).toBeVisible();
  await expect(page.locator(".sv-nearby-bus-marker")).toHaveCount(0);
});

test("search focus hides navigation and the first map tap only dismisses search", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 700 });
  await setup(page);
  const search = page.getByRole("textbox", { name: "Search address, stop or area", exact: true });
  const navigation = page.getByRole("navigation", { name: "Main navigation" });

  await expect(navigation).toBeVisible();
  await search.focus();
  await search.fill("clem");
  await expect(page.locator(".sv-map-results")).toBeVisible();
  await expect(navigation).toBeHidden();

  await page.mouse.click(5, 350);
  await expect(page.locator(".sv-map-results")).toBeHidden();
  await expect(search).not.toBeFocused();
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("button", { name: "Routes here", exact: true })).toHaveCount(0);

  await page.mouse.click(5, 350);
  await expect(page.getByRole("button", { name: "Routes here", exact: true })).toBeVisible();
});

test("a dropped pin searches nearby places and ranks the results", async ({ page }) => {
  const searchRequests = [];
  await setup(page, { home, school }, { onSearch: (body) => searchRequests.push(body) });
  await page.mouse.click(200, 300);
  await expect(page.getByRole("button", { name: "Search area", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Search area", exact: true }).click();

  const nearbySearch = page.getByRole("textbox", { name: "Search near dropped pin", exact: true });
  await expect(nearbySearch).toBeFocused();
  await expect(page.getByText("Search this area", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Nearby categories" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Food & drink", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clinics", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "MRT & LRT", exact: true }).click();

  await expect(page.getByRole("button", { name: /^PIN-SIDE MRT STATION/ })).toBeVisible();
  const resultNames = await page.locator(".sv-map-results button").allTextContents();
  expect(resultNames.findIndex((name) => name.includes("PIN-SIDE MRT STATION"))).toBeLessThan(resultNames.findIndex((name) => name.includes("FAR MRT STATION")));
  expect(searchRequests.at(-1).near).toHaveLength(2);
  expect(searchRequests.at(-1).near.every(Number.isFinite)).toBe(true);
  await expect(page.getByText(/(?:m|km) away/).first()).toBeVisible();
  await expect(page.getByText("Nearby", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ranked by distance from the pin · Results from OneMap", { exact: true })).toBeVisible();
});

test("tablet and laptop keep the map full-screen and reveal panels on demand", async ({ page }, info) => {
  await setup(page);

  for (const viewport of [{ width: 768, height: 720 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const shell = await page.locator(".solvik-app-shell--fluid").boundingBox();
      const visibleHeight = await page.evaluate(() => window.visualViewport?.height || window.innerHeight);
      return Math.max(Math.abs(shell.width - viewport.width), Math.abs(shell.height - visibleHeight));
    }).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.locator(".sv-tab-bar")).toBeHidden();
    const searchBox = await page.locator(".sv-map-search-wrap").boundingBox();
    expect(searchBox.x).toBeGreaterThanOrEqual(117);
    expect(searchBox.x).toBeLessThanOrEqual(120);
    const actionButtons = await page.locator(".sv-map-top-actions > button").all();
    expect(actionButtons).toHaveLength(2);
    for (const actionButton of actionButtons) {
      const actionBox = await actionButton.boundingBox();
      expect(viewport.width - actionBox.x - actionBox.width).toBeLessThanOrEqual(17);
    }
    await noOverflow(page);
  }

  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Solvik menu" });
  await expect(menu).toBeVisible();
  expect((await menu.boundingBox()).width).toBeLessThanOrEqual(311);
  await expect(menu.locator(".sv-brand-mark")).toBeVisible();
  const accountTrigger = menu.locator(".sv-menu-account-trigger");
  await expect(accountTrigger).toBeVisible();
  const menuBox = await menu.boundingBox(), accountBox = await accountTrigger.boundingBox();
  expect(menuBox.y + menuBox.height - accountBox.y - accountBox.height).toBeLessThanOrEqual(34);
  await accountTrigger.click();
  await expect(page.getByRole("heading", { name: "Your data", exact: true })).toBeVisible();
  await expect(page.locator(".sv-account-page")).toBeVisible();
  await page.screenshot({ path: info.outputPath("account-page.png") });
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Solvik menu" }).getByRole("button", { name: "Map", exact: true }).click();

  await expect(page.getByRole("button", { name: /Crowding layer/ })).toHaveCount(0);
  const pinHint = page.getByText("Tap anywhere to drop a pin");
  await expect(pinHint).toBeVisible();
  const hintBox = await pinHint.boundingBox();
  expect(page.viewportSize().height - hintBox.y - hintBox.height).toBeLessThanOrEqual(36);
  await page.screenshot({ path: info.outputPath("pin-hint.png") });
  const search = page.getByRole("textbox", { name: "Search address, stop or area", exact: true });
  const topbarBefore = await page.locator(".sv-map-topbar").boundingBox();
  await search.fill("clem");
  const results = page.locator(".sv-map-results");
  await expect(results).toBeVisible();
  expect((await results.boundingBox()).width).toBeLessThanOrEqual(541);
  await page.getByRole("button", { name: /^CLEMENTI ARCADE/ }).click();

  const routeSheet = page.locator(".sv-route-sheet-wrap");
  await expect(routeSheet).toBeVisible();
  expect((await routeSheet.boundingBox()).width).toBeLessThanOrEqual(421);
  const panelCloseBox = await routeSheet.getByRole("button", { name: "Collapse route options" }).boundingBox();
  const originFieldBox = await routeSheet.getByRole("combobox", { name: /starting/i }).boundingBox();
  expect(panelCloseBox.y + panelCloseBox.height).toBeLessThanOrEqual(originFieldBox.y - 3);
  const topbarAfter = await page.locator(".sv-map-topbar").boundingBox();
  expect(Math.abs(topbarAfter.x - topbarBefore.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(topbarAfter.width - topbarBefore.width)).toBeLessThanOrEqual(1);
  await expect(page.locator(".sv-route-panel-backdrop")).toHaveCount(0);
  await expect(routeSheet.getByRole("button", { name: "Show steps" })).toBeVisible();
  await expect(routeSheet.getByRole("button", { name: "Hide steps" })).toHaveCount(0);
  const mapCanvas = page.locator(".leaflet-container");
  const mapCenterBefore = await mapCanvas.getAttribute("data-map-center");
  await page.mouse.move(300, 650);
  await page.mouse.down();
  await page.mouse.move(430, 650, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => mapCanvas.getAttribute("data-map-center")).not.toBe(mapCenterBefore);
  await expect(page.getByRole("button", { name: "Re-centre to current location" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("route-options-simplified.png") });
  await routeSheet.getByRole("button", { name: "Show steps" }).click();
  await expect(routeSheet.getByRole("button", { name: "Hide steps" })).toBeVisible();
  const expandedRouteBox = await routeSheet.boundingBox();
  expect(expandedRouteBox.width).toBeLessThanOrEqual(421);
  expect(expandedRouteBox.x).toBeGreaterThanOrEqual(page.viewportSize().width - 440);
  await expect(routeSheet.locator(".sv-route-mode-primary > button")).toHaveCount(6);
  for (const mode of ["Bus", "Train", "Transit", "Walk", "Cycle", "Express"]) {
    await expect(routeSheet.getByRole("button", { name: mode, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Collapse route options" }).last().click();
  const summary = page.locator(".sv-route-summary");
  await expect(summary).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-centre to current location" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("responsive-map.png") });
});

test("travel choices use one horizontal swipe rail", async ({ page }, info) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await pickDestination(page);
  const modes = page.getByRole("group", { name: "Travel mode" });
  await expect(modes).toBeVisible();
  await expect(modes.locator("button")).toHaveCount(6);
  expect(await modes.evaluate((el) => getComputedStyle(el).display)).toBe("flex");
  expect(await modes.evaluate((el) => ["auto", "scroll"].includes(getComputedStyle(el).overflowX))).toBe(true);
  await page.screenshot({ path: info.outputPath("travel-mode-swipe-rail.png") });
});

test("the route panel opens immediately when route retrieval finishes", async ({ page }) => {
  await setup(page);
  let releaseRoute;
  const routeReady = new Promise((resolve) => { releaseRoute = resolve; });
  await page.route("**/api/trip-options", async (route) => {
    await routeReady;
    await route.fulfill({ json: { options: [option] } });
  });

  await page.getByRole("textbox", { name: "Search address, stop or area", exact: true }).fill("clem");
  await page.getByRole("button", { name: /^CLEMENTI ARCADE/ }).click();
  await expect(page.locator(".sv-route-summary")).toContainText("Finding route…");
  await expect(page.locator(".sv-route-sheet-wrap")).not.toHaveClass(/is-open/);

  releaseRoute();
  await expect(page.locator(".sv-route-sheet-wrap")).toHaveClass(/is-open/);
  await expect(page.getByRole("region", { name: "Route options" })).toBeVisible();
  await expect(page.locator(".sv-route-summary")).toHaveCount(0);
});

test("a nearby walking-only result switches from Transit to Walk", async ({ page }) => {
  await setup(page);
  const requestedModes = [];
  await page.route("**/api/trip-options", async (route) => {
    const body = route.request().postDataJSON();
    requestedModes.push(body.mode);
    await route.fulfill({
      json: body.mode === "walk"
        ? { mode: "walk", options: [option] }
        : { mode: body.mode, options: [], suggestedMode: "walk" },
    });
  });

  await pickDestination(page);

  const walk = page.getByRole("button", { name: "Walk", exact: true });
  await expect(walk).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Transit", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".sv-route-option-card").first()).toContainText("WALK 12.8 km");
  expect(requestedModes[0]).toBe("transit");
  expect(requestedModes.at(-1)).toBe("walk");
  expect(new Set(requestedModes)).toEqual(new Set(["transit", "walk"]));
});

test("desktop content and active navigation use compact responsive layouts", async ({ page }, info) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Solvik menu" }).getByRole("button", { name: "Plan", exact: true }).click();
  const plan = page.locator(".sv-plan-screen");
  await expect(plan).toBeVisible();
  await expect(page.locator(".sv-account-card")).toHaveCount(0);
  const planBox = await plan.boundingBox();
  expect(planBox.width).toBeGreaterThan(700);
  expect(planBox.width).toBeLessThanOrEqual(1041);
  expect((await plan.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length))).toBe(12);
  const placesBox = await page.locator(".sv-plan-places").boundingBox();
  expect(Math.abs(placesBox.width - planBox.width)).toBeLessThanOrEqual(3);
  const savedRows = await page.locator(".sv-saved-grid > button").all();
  expect(savedRows).toHaveLength(3);
  const savedTops = await Promise.all(savedRows.map(async row => (await row.boundingBox()).y));
  expect(Math.max(...savedTops) - Math.min(...savedTops)).toBeLessThanOrEqual(2);
  await expect(page.locator(".sv-tab-bar")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.locator(".sv-page-brand")).toBeHidden();
  await expect(page.locator(".sv-page-menu-button .sv-logo-menu-cue")).toBeVisible();
  expect(parseFloat(await page.getByRole("heading", { name: "Today" }).evaluate(el => getComputedStyle(el).fontSize))).toBeLessThanOrEqual(32);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("responsive-plan.png") });

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Solvik menu" }).getByRole("button", { name: "Map", exact: true }).click();
  await pickDestination(page);
  await expect(page.locator(".sv-route-sheet-wrap")).toBeVisible();
  await page.getByRole("button", { name: "Go", exact: true }).click();
  const instruction = page.locator(".sv-nav-current-step");
  const navSheet = page.locator(".sv-nav-sheet");
  await expect(instruction).toBeVisible();
  await expect(navSheet).toBeVisible();
  await expect(page.locator(".sv-nav-top .sv-nav-instruction")).toHaveCount(0);
  await expect(navSheet.getByText(/min left/)).toBeVisible();
  await expect(navSheet.getByText(/^Arrive /)).toBeVisible();
  const compactNavBox = await navSheet.boundingBox();
  expect(compactNavBox.width).toBeLessThanOrEqual(401);
  expect(compactNavBox.height).toBeLessThanOrEqual(181);
  expect(compactNavBox.x).toBeGreaterThanOrEqual(1280 - 416);
  await expect(page.locator(".sv-nav-steps")).toBeHidden();
  await page.getByRole("button", { name: "Show trip steps" }).click();
  await expect(page.getByRole("button", { name: "Hide trip steps" })).toBeVisible();
  await expect(page.locator(".sv-nav-steps")).toBeVisible();
  await expect(page.locator(".sv-nav-summary")).toBeHidden();
  const expandedNavBox = await navSheet.boundingBox();
  expect(expandedNavBox.width).toBeLessThanOrEqual(401);
  expect(expandedNavBox.height).toBeLessThanOrEqual(513);
  await expect(page.getByRole("button", { name: "Previous trip step" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next trip step" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume following my location" })).toHaveCount(0);
  const map = page.locator(".leaflet-container");
  const mapBox = await map.boundingBox();
  await page.mouse.move(mapBox.x + mapBox.width * 0.55, mapBox.y + mapBox.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + mapBox.width * 0.35, mapBox.y + mapBox.height * 0.45, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const exploredCenter = await map.getAttribute("data-map-center");
  await expect(page.getByRole("button", { name: "Resume following my location" })).toBeVisible();
  await page.waitForTimeout(4300);
  await expect(map).toHaveAttribute("data-map-center", exploredCenter);
  await page.getByRole("button", { name: "Resume following my location" }).click();
  await expect(page.getByRole("button", { name: "Resume following my location" })).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("responsive-navigation.png") });
});

test("Go keeps the map visible and exposes stations without fighting step paging", async ({ page }) => {
  const stationOption = {
    ...option,
    mins: 12,
    walkOnly: false,
    walk: "2 min",
    walkSecs: 120,
    legs: ["WALK 0.2 km", "BUS 95"],
    transitLegs: [{ mode: "BUS", service: "95", label: "BUS 95", legIndex: 1 }],
    geometry: [home.ll, [1.312, 103.771], [1.318, 103.77], [destination.lat, destination.lng]],
    legSpans: [{ from: 0, to: 1 }, { from: 1, to: 3 }],
    steps: [
      { legIndex: 0, mode: "WALK", icon: "footprints", title: "Walk to the bus stop", detail: "2 min on foot", secs: 120 },
      { legIndex: 1, mode: "BUS", icon: "bus", title: "Take BUS 95", detail: "3 stops", secs: 600, stops: ["Opp Blk 413", "Clementi Stn", "Sunset Way"], alight: "Sunset Way" },
    ],
  };
  await setup(page, { home, school }, { tripOptions: [stationOption] });
  await pickDestination(page);
  await page.getByRole("button", { name: "Go", exact: true }).click();

  const navSheet = page.locator(".sv-nav-sheet");
  expect((await navSheet.boundingBox()).height).toBeLessThanOrEqual(181);
  await expect(page.locator(".sv-nav-steps")).toBeHidden();
  await expect(navSheet.locator(".sv-nav-title")).toHaveText("Walk to the bus stop");
  await expect(navSheet.locator(".sv-nav-detail")).toHaveText("2 min on foot");
  await expect(navSheet.getByText(/min left/)).toBeVisible();
  await page.getByRole("button", { name: "Show trip steps" }).click();
  await expect(page.locator(".sv-nav-steps")).toBeVisible();
  await expect(page.locator(".sv-nav-summary")).toBeHidden();

  await page.getByRole("button", { name: "Next trip step" }).click();
  await expect(page.getByRole("button", { name: "Show step 2 of 2" })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("Opp Blk 413", { exact: true })).toBeVisible();
  await expect(page.getByText("Clementi Stn", { exact: true })).toBeVisible();
  await expect(page.getByText("Sunset Way", { exact: true })).toBeVisible();
  await expect(page.getByText("Upcoming", { exact: true })).toHaveCount(3);
  await page.waitForTimeout(450);
  const expandedBox = await navSheet.boundingBox();
  expect(expandedBox.height).toBeGreaterThanOrEqual(Math.floor(page.viewportSize().height * 0.58));
  expect(expandedBox.height).toBeLessThanOrEqual(Math.ceil(page.viewportSize().height * 0.64) + 1);
  await noOverflow(page);
});

test("places fit small screens, cancel discards edits, and incomplete text cannot be saved", async ({ page }, info) => {
  await setup(page);
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
  await expect(page.locator(".sv-page-brand .sv-brand-mark")).toBeHidden();
  await page.screenshot({ path: info.outputPath("mobile-plan-navigation.png") });
  await page.getByRole("button", { name: "Device data", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your data", exact: true })).toBeVisible();
  await expect(page.locator(".sv-account-page")).toBeVisible();
  await expect(page.locator(".sv-tab-account.is-active")).toHaveCSS("color", "rgb(34, 63, 46)");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await noOverflow(page);
  for (const card of await page.locator(".sv-saved-grid > button").all()) expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.setViewportSize({ width: 393, height: 420 });
  const dialog = page.getByRole("dialog", { name: "Your places" });
  const field = dialog.getByRole("combobox", { name: "Optional" });
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await field.fill("n");
  const saveBounds = await dialog.getByRole("button", { name: "Save addresses" }).boundingBox();
  expect(saveBounds.y + saveBounds.height).toBeLessThanOrEqual(420);
  await expect(dialog.getByText("Type at least 2 characters to search.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save addresses" })).toBeDisabled();
  await field.fill("nanyang");
  const result = page.getByRole("option").first();
  await expect(result).toBeVisible();
  const pop = await page.getByRole("listbox").boundingBox();
  expect(pop.y).toBeGreaterThanOrEqual(0);
  expect(pop.y + pop.height).toBeLessThanOrEqual(421);
  await page.screenshot({ path: info.outputPath("places-keyboard.png") });
  await result.click();
  await expect(field).toHaveValue(school.name);
  await field.fill("bugis");
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:places")).places.school.name)).toBe(school.name);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await field.fill("bugis");
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Save addresses" }).click();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:places")).places.school.name)).toBe("BUGIS+");
});

test("deleting Home clears it as the active route origin", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await pickDestination(page);

  const origin = page.locator(".sv-route-sheet-wrap").getByRole("combobox", { name: /starting/i });
  await origin.click();
  await page.getByRole("option").filter({ hasText: /^Home/ }).click();
  await expect(page.locator(".sv-route-origin-marker")).toHaveCount(1);

  await page.getByRole("button", { name: "Back to map search" }).click();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Solvik menu" }).getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const places = page.getByRole("dialog", { name: "Your places" });
  const homeField = places.getByRole("combobox", { name: "Block, street or MRT stop" });
  await homeField.locator("..").getByRole("button", { name: "Clear" }).click();
  await places.getByRole("button", { name: "Save addresses" }).click();

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Solvik menu" }).getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".sv-route-origin-marker")).toHaveCount(0);
  await expect(page.locator(".leaflet-marker-pane [title='Home']")).toHaveCount(0);
});

test("manual commutes keep both endpoints after reload", async ({ page }) => {
  await setup(page, { home });
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Add or edit a watched commute" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a commute" });
  await expect(dialog.getByRole("button", { name: "Pick places and days" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Search destination", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Search address, stop or area" }).fill("bugis");
  await dialog.getByRole("button", { name: /^BUGIS\+/ }).click();
  await dialog.getByRole("button", { name: "Save commute", exact: true }).click();
  await page.reload();
  const commute = await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:commutes"))[0]);
  expect(commute.fromPlace.ll).toEqual(home.ll);
  expect(commute.toPlace.ll).toEqual([bugis.lat, bugis.lng]);
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("button", { name: /Edit commute from Home to BUGIS/ })).toBeVisible();
  await noOverflow(page);
});

test("destination defaults to device location and origin choices stay inside search", async ({ page }, info) => {
  await setup(page);
  const queries = [], requests = [];
  page.on("request", request => {
    if (request.url().includes("/api/onemap-search")) queries.push(request.postDataJSON().query);
    if (request.url().includes("/api/trip-options")) requests.push(request.postDataJSON());
  });
  await pickDestination(page);
  const origin = page.getByRole("combobox", { name: /starting/i });
  await expect(origin).toHaveValue("My location");
  expect(await page.evaluate(() => window.qaLocationCalls)).toBe(1);
  await expect(page.getByRole("button", { name: "My location", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go", exact: true })).toBeVisible();
  await origin.focus();
  await expect(origin).toHaveValue("");
  const choices = page.getByRole("listbox", { name: "Choose starting place" });
  await expect(choices.getByRole("option", { name: /My location/ })).toBeVisible();
  await expect(choices.getByRole("option", { name: /Home/ })).toBeVisible();
  await expect(choices.getByRole("option", { name: /School/ })).toBeVisible();
  await expect(choices.getByRole("option", { name: /Work/ })).toHaveCount(0);
  expect(queries).not.toContain("Current location");
  await origin.fill("bugis");
  await page.getByRole("option").first().click();
  await expect.poll(() => requests.at(-1)?.from).toBe("1.299,103.855");
  await expect(origin).toHaveValue("BUGIS+");
  await noOverflow(page);
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page.getByText("2 h 34 min", { exact: true }).first()).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("navigation.png") });
  await page.getByRole("button", { name: "End trip", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Go", exact: true })).toBeVisible();
});

test("Gemini can rank supplied routes without inventing a journey", async ({ page }) => {
  const comfortOption = {
    ...option,
    mins: 161,
    eta: "03:29",
    transfers: 0,
    crowdLevel: "light",
    legs: ["BUS 7"],
    note: "Direct and lightly crowded",
  };
  await setup(page, { home, school }, {
    tripOptions: [option, comfortOption],
    aiDecision: {
      selectedIndex: 1,
      reason: "Light crowding and no changes fit your comfort preference despite the longer journey.",
      alternatives: [{ index: 0, reason: "Faster, but it does not match the comfort preference as well." }],
    },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await pickDestination(page);

  await expect(page.getByText(/AI-assisted recommendation · gemini-3.5-flash-lite/i)).toBeVisible();
  const cards = page.locator(".sv-route-option-card");
  await expect(cards.first()).toContainText("2 h 41 m");
  await expect(cards.first()).toContainText("Gemini explanation");
  await expect(cards.first()).toContainText("Light crowding and no changes");
  await expect(cards).toHaveCount(2);
});

test("recorded itineraries cannot start navigation", async ({ page }) => {
  await setup(page);
  await page.route("**/api/trip-options", route => route.fulfill({ json: { recorded: true, options: [{ ...option, recorded: true }] } }));
  await pickDestination(page);
  await expect(page.getByText(/Sample route only/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview only" })).toBeDisabled();
});

test("search errors recover and routing failures can be retried", async ({ page }) => {
  await setup(page);
  await page.route("**/api/onemap-search", route => route.fulfill({ status: 502, json: { error: "Search temporarily unavailable" } }));
  const search = page.getByRole("textbox", { name: "Search address, stop or area", exact: true });
  await search.fill("clem");
  await expect(page.getByText("Search temporarily unavailable")).toBeVisible();
  await page.unroute("**/api/onemap-search");
  await page.route("**/api/trip-options", route => route.fulfill({ status: 502, json: { error: "Routing temporarily unavailable" } }));
  await search.fill("clementi");
  await page.getByRole("button", { name: /^CLEMENTI ARCADE/ }).click();
  await expect(page.getByText("Routes are temporarily unavailable")).toBeVisible();
  await expect(page.getByText(/Your places are still here/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Try another travel mode" }).getByRole("button", { name: "Bus", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Go", exact: true })).toHaveCount(0);
  await page.unroute("**/api/trip-options");
  await page.getByRole("button", { name: /Try again|Retry/ }).click();
  await expect(page.getByRole("button", { name: "Go", exact: true })).toBeVisible();
  await expect(page.getByText("Show steps", { exact: true })).toBeVisible();
  await page.getByText("Show steps", { exact: true }).click();
  await expect(page.getByText("Hide steps", { exact: true })).toBeVisible();
  await page.getByText("Hide steps", { exact: true }).click();
  await expect(page.getByText("Show steps", { exact: true })).toBeVisible();
});

test("denied location still allows a manual origin and unfinished text disables routing", async ({ page }) => {
  await setup(page, {});
  await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (_, fail) => fail({ code: 1 }); });
  await pickDestination(page);
  await expect(page.getByText(/Location permission denied/)).toBeVisible();
  const origin = page.getByRole("combobox", { name: /starting/i });
  await origin.fill("bugis");
  await page.getByRole("option").first().click();
  await expect(page.getByRole("button", { name: "Go", exact: true })).toBeVisible();
  await origin.fill("n");
  await expect(page.getByRole("button", { name: "Go", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Select one of the search results for your starting place/)).toBeVisible();
});

test("crowding is fetched as a current route snapshot without a global scrubber", async ({ page }) => {
  const requests = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/crowding") requests.push(new URL(request.url())); });
  await setup(page);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => !url.searchParams.has("at"))).toBe(true);
  await expect(page.locator(".sv-crowd-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Crowding layer/ })).toHaveCount(0);
});

test("onboarding saves Rachel's scenario and opens its scheduled route", async ({ page }) => {
  await setup(page, {});
  let routeRequest = null;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("trip-options") && request.method() === "POST") routeRequest = request.postDataJSON();
  });
  await page.evaluate(() => localStorage.removeItem("solvik:onboarded"));
  await page.reload();
  await page.getByRole("button", { name: "Choose a commuter" }).click();
  await page.getByRole("button", { name: /^Rachel · fixed schedule/ }).click();
  await page.getByRole("button", { name: /^Continue with Rachel/ }).click();
  await expect(page.getByText("Tampines", { exact: true })).toBeVisible();
  await expect(page.getByText("Raffles Place", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review this setup" }).click();
  await page.getByRole("button", { name: "Show my route" }).click();
  await expect(page.getByText(/[A-Z][a-z]{2} 07:40/)).toBeVisible();
  await expect.poll(() => routeRequest?.time).toBe("07:40:00");
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:places")).places.home.name)).toBe("Tampines");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:places")).places.work.name)).toBe("Raffles Place");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:preferences")).scenario)).toBe("fixed");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:commutes"))[0].signature)).toBe("scenario:fixed");
  expect(await page.evaluate(() => window.qaLocationCalls)).toBe(0);
});

test("storage denial does not prevent completing onboarding or browsing tabs", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Blocked", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); };
  });
  await page.reload();
  await page.getByRole("button", { name: "Choose a commuter" }).click();
  await page.getByRole("button", { name: /^Rachel · fixed schedule/ }).click();
  await page.getByRole("button", { name: /^Continue with Rachel/ }).click();
  await page.getByRole("button", { name: "Review this setup" }).click();
  await page.getByRole("button", { name: "Show my route" }).click();
  await page.getByRole("button", { name: "Back to map search" }).click();
  for (const name of ["Plan", "Report", "Points", "Map"]) {
    await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
    await noOverflow(page);
  }
});

test("erase all data removes saved places and local history", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Erase all data from this device" }).click();
  await expect(page.getByRole("button", { name: "Choose a commuter" })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("solvik:")))).toEqual([]);
});

// A learned commute must not outlive the trips that justified it: the evidence
// ages out at 90 days, so a conclusion drawn from it cannot be permanent.
test("a learned commute whose trips stopped is retired on opening, and says so", async ({ page }) => {
  const DAY = 24 * 60 * 60 * 1000;
  const auto = (sig, from, to, fromName, toName) => ({
    from: `auto-from:${sig}`, to: `auto-to:${sig}`,
    fromPlace: { id: `auto-from:${sig}`, label: fromName, place: "Learned from your trips", ll: from },
    toPlace: { id: `auto-to:${sig}`, label: toName, place: "Learned from your trips", ll: to },
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"], mins: 490, mode: "Comfort", legs: ["EWL"],
    arriveBy: null, source: "auto", signature: sig,
  });
  const journeysFor = (from, to, toName, agoDays) =>
    [0, 1, 2, 3].map((i) => ({
      id: `j${toName}${i}`, at: Date.now() - (agoDays + i) * DAY, fromLL: from, toLL: to,
      toName, mode: "Comfort", legs: ["EWL"], started: true, completed: true,
    }));

  await page.addInitScript(({ auto, oldTrips, freshTrips }) => {
    if (localStorage.getItem("qa:memory")) return;
    localStorage.setItem("solvik:commutes", JSON.stringify(auto));
    localStorage.setItem("solvik:journeys", JSON.stringify(oldTrips.concat(freshTrips)));
    localStorage.setItem("qa:memory", "1");
  }, {
    auto: [
      auto("1.311,103.770>1.299,103.855|weekday", [1.311, 103.77], [1.299, 103.855], "Old home", "Old job"),
      auto("1.348,103.683>1.323,103.767|weekday", [1.348, 103.683], [1.323, 103.767], "Campus", "New job"),
      { from: "home", to: "school", fromPlace: { id: "home", label: "Home", ll: [1.311, 103.77] }, toPlace: { id: "school", label: "School", ll: [1.348, 103.683] }, days: ["Mon"], mins: 480, mode: "Fastest" },
    ],
    oldTrips: journeysFor([1.311, 103.77], [1.299, 103.855], "Old job", 60),
    freshTrips: journeysFor([1.348, 103.683], [1.323, 103.767], "New job", 3),
  });
  await setup(page);

  await expect(page.getByText(/Stopped watching Old home → Old job/)).toBeVisible();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("button", { name: /Edit commute from Campus to New job/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit commute from Home to School/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit commute from Old home to Old job/ })).toHaveCount(0);

  // The retirement is written through, not just hidden for this session.
  await page.reload();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:commutes")).map((c) => c.toPlace.label));
  expect(kept).toEqual(["New job", "School"]);
  await noOverflow(page);
});

// A disruption on your line should arrive with an answer attached, not just bad
// news. OneMap has no banned-routes parameter, so the alternative is produced by
// filtering — which means the thing to check is that nothing NSL survives it.
const nslOption = { mins: 38, eta: "09:10", fare: "$2.20", fareValue: 2.2, walk: "6 min", walkSecs: 360, transfers: 1, tag: "Fastest", geometry: [[1.43, 103.83], [1.28, 103.85]], legSpans: [{ from: 0, to: 1 }], legs: ["NSL", "EWL"], transitLegs: [{ legIndex: 0, label: "NSL", mode: "RAIL", service: "NS" }, { legIndex: 1, label: "EWL", mode: "RAIL", service: "EW" }], steps: [], note: "1 transfer" };
const busOption = { mins: 52, eta: "09:24", fare: "$2.10", fareValue: 2.1, walk: "9 min", walkSecs: 540, transfers: 1, tag: "Avoids the disruption", geometry: [[1.43, 103.83], [1.28, 103.85]], legSpans: [{ from: 0, to: 1 }], legs: ["BUS 851", "CCL"], transitLegs: [{ legIndex: 0, label: "BUS 851", mode: "BUS", service: "851" }, { legIndex: 1, label: "CCL", mode: "RAIL", service: "CC" }], steps: [], note: "1 transfer" };

async function disruptedCommute(page, { rerouteBody } = {}) {
  await page.addInitScript(({ home, school }) => {
    if (localStorage.getItem("qa:disrupt")) return;
    localStorage.setItem("solvik:onboarded", "1");
    localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places: {
      home: { id: "home", name: "Home", address: "Home", ll: home, source: "onemap", verified: true },
      school: { id: "school", name: "School", address: "School", ll: school, source: "onemap", verified: true },
    } }));
    localStorage.setItem("solvik:commutes", JSON.stringify([{
      from: "home", to: "school", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], mins: 480, mode: "Comfort", legs: ["NSL"],
      fromPlace: { id: "home", label: "Home", place: "Home", ll: home }, toPlace: { id: "school", label: "School", place: "School", ll: school },
    }]));
    localStorage.setItem("solvik:aiMemory", JSON.stringify({
      summary: "You usually prefer predictable rail journeys with fewer changes.",
      confidence: "medium",
      model: "Gemini",
    }));
    localStorage.setItem("qa:disrupt", "1");
  }, { home: [1.311, 103.77], school: [1.348, 103.683] });

  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    const query = new URL(route.request().url()).searchParams;
    let response = {};
    if (path.endsWith("trip-options")) {
      // The reroute is the request that carries `avoid` — answer it the way the
      // server would, with NSL already filtered out.
      response = body.avoid ? (rerouteBody || { mode: "reroute", options: [busOption], avoided: { lines: [body.avoid], dropped: 2, none: false } }) : { options: [nslOption] };
    } else if (path.endsWith("lta") && String(query.get("endpoint")).includes("TrainServiceAlerts")) {
      // DataMall nests the alert object under `value`, and callLta unwraps it.
      response = { value: { Status: 2, AffectedSegments: [{ Line: "NSL", Direction: "Both", StartStation: "NS13", EndStation: "NS17", Stations: "NS13,NS14,NS15,NS16,NS17" }], Message: [{ Content: "NSL - Train fault between Yishun and Bishan. Free bridging buses are available at all affected stations.", CreatedDate: "Now" }] } };
    } else if (path.endsWith("forecast")) response = { slots: [], series: {} };
    else if (path.endsWith("crowding")) response = { stations: [], slots: [] };
    await route.fulfill({ json: response });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Plan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
}

test("a fault on your line brings an alternative that avoids it", async ({ page }) => {
  await disruptedCommute(page);

  await expect(page.getByText("BUS 851 · CCL", { exact: true })).toBeVisible();
  await expect(page.getByText(/52 min · 14 min longer · avoids NSL entirely/)).toBeVisible();
  // The alternative must never be presented as a live-adjusted time.
  await expect(page.getByText(/timetable, which doesn't know about the disruption/)).toBeVisible();
  // LTA's own bridging-bus text is better information than we can derive.
  await expect(page.getByText(/Free bridging buses/)).toBeVisible();

  // The point of the whole feature: the legs offered are exactly the ones that
  // survived the filter, and the broken line is not among them.
  await expect(page.getByText("BUS 851 · CCL", { exact: true })).toHaveText("BUS 851 · CCL");
  await noOverflow(page);
});

test("alerts separate commute-relevant updates from the full LTA feed", async ({ page }) => {
  await disruptedCommute(page);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Alerts", exact: true }).click();

  const forYou = page.getByRole("tab", { name: /For you/ });
  const allLta = page.getByRole("tab", { name: /All LTA alerts/ });
  await expect(forYou).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Your commute memory", { exact: true })).toBeVisible();
  await expect(page.getByText(/predictable rail journeys/)).toBeVisible();
  await expect(page.locator(".sv-alert-card")).toHaveCount(1);

  await allLta.click();
  await expect(allLta).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".sv-alert-card")).toHaveCount(2);
});

test("when every route still uses the broken line, the app says so", async ({ page }) => {
  // The honest failure: not "no route found", which would be a different claim.
  await disruptedCommute(page, { rerouteBody: { mode: "reroute", options: [], avoided: { lines: ["NSL"], dropped: 4, none: true } } });

  await expect(page.getByText(/No way around NSL right now/)).toBeVisible();
  await expect(page.getByText(/Every route OneMap offers still uses NSL/)).toBeVisible();
  await expect(page.getByText(/timetable, which doesn't know/)).toHaveCount(0);
  await noOverflow(page);
});

test("an alert on a line you never ride offers no reroute", async ({ page }) => {
  await setup(page, { home });
  const planned = [];
  page.on("request", r => { if (r.url().includes("trip-options")) planned.push(r.postDataJSON()); });
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByText(/Another way/)).toHaveCount(0);
  expect(planned.some(b => b && b.avoid), "no reroute should have been requested").toBe(false);
});

// Two trips somewhere is enough to be told when that line breaks — the point of
// learning places rather than waiting for a full commute to be promoted.
test("two trips to a place is enough to be warned about its line", async ({ page }) => {
  await page.addInitScript(({ office }) => {
    if (localStorage.getItem("qa:places")) return;
    localStorage.setItem("solvik:onboarded", "1");
    localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places: {} }));
    // Two visits on two days, well under the commute bar of four journeys.
    localStorage.setItem("solvik:journeys", JSON.stringify([1, 3].map((n) => ({
      id: `p${n}`, at: Date.now() - n * 86400000, fromLL: [1.4294, 103.835], toLL: office,
      toName: "The Office", mode: "Comfort", legs: ["NSL"], started: true, completed: true,
    }))));
    localStorage.setItem("qa:places", "1");
  }, { office: [1.3009, 103.8559] });

  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    const query = new URL(route.request().url()).searchParams;
    let response = {};
    if (path.endsWith("lta") && String(query.get("endpoint")).includes("TrainServiceAlerts")) {
      response = { value: { Status: 2, AffectedSegments: [{ Line: "NSL", Direction: "Both", StartStation: "NS13", EndStation: "NS17", Stations: "NS13,NS17" }], Message: [] } };
    } else if (path.endsWith("crowding")) response = { stations: [], slots: [] };
    else if (path.endsWith("forecast")) response = { slots: [], series: {} };
    await route.fulfill({ json: response });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Plan", exact: true })).toBeVisible();

  // No commute was ever promoted — the place alone carries the line.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:commutes") || "[]").length)).toBe(0);

  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByText(/The Office/)).toBeVisible();
  await expect(page.getByText(/2 visits · via NSL/)).toBeVisible();

  // And the alert says which place it affects, not just which line.
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Alerts" }).click();
  await expect(page.getByText(/You use this line to get to The Office/)).toBeVisible();
  await noOverflow(page);
});

// Planned works: scheduled, not a fault, and only worth raising when they fall
// on a station your own commute passes through.
// Changes at Bishan — which is what makes a lift there matter. A station the
// train only runs through is deliberately not a warning.
const bishanRoute = { mins: 38, eta: "08:38", fare: "$2.20", fareValue: 2.2, walk: "6 min", walkSecs: 360, transfers: 1, tag: "Fastest", geometry: [[1.43, 103.83], [1.28, 103.85]], legSpans: [{ from: 0, to: 1 }], legs: ["NSL", "CCL"],
  transitLegs: [
    { legIndex: 0, label: "NSL", mode: "RAIL", service: "NS", fromStopCode: "NS13", toStopCode: "NS17" },
    { legIndex: 1, label: "CCL", mode: "RAIL", service: "CC", fromStopCode: "CC15", toStopCode: "CC19" },
  ],
  steps: [
    { legIndex: 0, mode: "RAIL", label: "NSL", secs: 900, from: "Yishun", alight: "Bishan", boardStopCode: "NS13", alightStopCode: "NS17", stopCodes: ["NS15", "NS16"] },
    { legIndex: 1, mode: "RAIL", label: "CCL", secs: 1380, from: "Bishan", alight: "Botanic Gardens", boardStopCode: "CC15", alightStopCode: "CC19", stopCodes: ["CC17"] },
  ],
  note: "1 transfer" };

async function plannedWorks(page, { mode = "Comfort" } = {}) {
  await page.addInitScript(({ mode }) => {
    if (localStorage.getItem("qa:pw")) return;
    localStorage.setItem("solvik:onboarded", "1");
    localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places: {
      home: { id: "home", name: "Yishun", address: "Yishun", ll: [1.4294, 103.835], source: "onemap", verified: true },
      school: { id: "school", name: "Raffles Place", address: "Raffles Place", ll: [1.2841, 103.8515], source: "onemap", verified: true },
    } }));
    localStorage.setItem("solvik:commutes", JSON.stringify([{
      from: "home", to: "school", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], mins: 480, mode, legs: ["NSL"],
      fromPlace: { id: "home", label: "Yishun", place: "Yishun", ll: [1.4294, 103.835] },
      toPlace: { id: "school", label: "Raffles Place", place: "Raffles Place", ll: [1.2841, 103.8515] },
    }]));
    localStorage.setItem("qa:pw", "1");
  }, { mode });

  const planned = [];
  page.on("request", r => { if (r.url().includes("trip-options")) planned.push(r.postDataJSON()); });
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    let response = {};
    if (path.endsWith("trip-options")) response = { options: [bishanRoute] };
    else if (path.endsWith("planned")) response = { works: [{ stationCode: "NS17", stationName: "Bishan", line: "NSL", lifts: [{ id: "B1L01", desc: "Exit B street level to concourse" }] }] };
    else if (path.endsWith("forecast")) response = { slots: [], series: {} };
    else if (path.endsWith("crowding")) response = { stations: [], slots: [] };
    await route.fulfill({ json: response });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Plan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  return planned;
}

test("a lift out at a station on your way is raised as planned work, not a fault", async ({ page }) => {
  await plannedWorks(page);
  await expect(page.getByText("Planned work")).toBeVisible();
  await expect(page.getByText("Lift out at Bishan")).toBeVisible();
  await expect(page.getByText("Exit B street level to concourse")).toBeVisible();
  // For a commute that isn't step-free this is a note, not a blocked journey.
  await expect(page.getByText(/The trains still run — only the lift is out/)).toBeVisible();
  await noOverflow(page);
});

test("the same lift is a blocked journey when the commute is step-free", async ({ page }) => {
  const planned = await plannedWorks(page, { mode: "Step-free" });
  await expect(page.getByText(/You travel step-free, so this may block the way through/)).toBeVisible();
  // And we do not claim to know how long it will be out — LTA doesn't publish that.
  await expect(page.getByText(/publishes which lift, not how long/)).toBeVisible();

  // Routing around it avoids the station, not the whole line: the trains run.
  await page.getByRole("button", { name: /Route around Bishan/ }).click();
  await expect.poll(() => planned.some(b => b && b.avoidStations === "NS17")).toBe(true);
  expect(planned.some(b => b && b.avoid), "the line itself must not be avoided").toBe(false);
});

test("a lift out somewhere you never go is not mentioned", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("solvik:onboarded", "1");
    localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places: {
      home: { id: "home", name: "Yishun", address: "Yishun", ll: [1.4294, 103.835], source: "onemap", verified: true },
      school: { id: "school", name: "Raffles Place", address: "Raffles Place", ll: [1.2841, 103.8515], source: "onemap", verified: true },
    } }));
    localStorage.setItem("solvik:commutes", JSON.stringify([{
      from: "home", to: "school", days: ["Mon"], mins: 480, mode: "Comfort", legs: ["NSL"],
      fromPlace: { id: "home", label: "Yishun", place: "Yishun", ll: [1.4294, 103.835] },
      toPlace: { id: "school", label: "Raffles Place", place: "Raffles Place", ll: [1.2841, 103.8515] },
    }]));
  });
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    let response = {};
    if (path.endsWith("trip-options")) response = { options: [bishanRoute] };
    // Punggol is nowhere near this commute.
    else if (path.endsWith("planned")) response = { works: [{ stationCode: "PE5", stationName: "Punggol", line: "PLRT", lifts: [{ id: "A1", desc: "Exit A" }] }] };
    else if (path.endsWith("forecast")) response = { slots: [], series: {} };
    else if (path.endsWith("crowding")) response = { stations: [], slots: [] };
    await route.fulfill({ json: response });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByText(/38 min journey/)).toBeVisible();
  await expect(page.getByText("Planned work")).toHaveCount(0);
});

// Reports: camera-only capture, triage before anything is saved, and no remote
// account or report database.
async function reportFlow(page, { verdict = "accepted" } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("solvik:onboarded", "1");
    localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places: {} }));
    // A camera that exists, so getUserMedia resolves the way it would on a phone.
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext("2d");
    // Keep drawing, or captureStream produces no frames and the video never
    // reports dimensions.
    setInterval(() => { ctx.fillStyle = `hsl(${Date.now() % 360},50%,50%)`; ctx.fillRect(0, 0, 640, 480); }, 100);
    // mediaDevices is a prototype getter in Chromium — plain assignment is
    // silently dropped.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => canvas.captureStream(5) },
    });
    navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 1.3507, longitude: 103.8481, accuracy: 10 }, timestamp: Date.now() });
    navigator.geolocation.watchPosition = (ok) => { ok({ coords: { latitude: 1.3507, longitude: 103.8481, accuracy: 10 }, timestamp: Date.now() }); return 1; };
    navigator.geolocation.clearWatch = () => {};
  });

  const posted = [];
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    let response = {};
    if (path.endsWith("/api/report")) {
      posted.push(route.request().postDataJSON());
      response = verdict === "accepted"
        ? { verdict: "accepted", reason: "Checks passed. Saved on this device.", points: 25, pointsState: "confirmed", stationCode: "53061", createdAt: Date.now(), checks: [{ id: "fresh-fix", ok: true }, { id: "at-the-place", ok: true }], vision: { reason: "The photo shows a lift with a notice." } }
        : { verdict: "rejected", reason: "You appear to be 420 m away. Reports have to be made where the problem is.", points: 0, pointsState: "none", checks: [{ id: "fresh-fix", ok: true }, { id: "at-the-place", ok: false, detail: "You appear to be 420 m away. Reports have to be made where the problem is." }] };
    } else if (path.endsWith("nearest-stop")) response = { code: "53061", name: "Bishan Stn Exit C", road: "Bishan Rd", lat: 1.3507, lng: 103.8485, distanceM: 30 };
    else if (path.endsWith("crowding")) response = { stations: [], slots: [] };
    else if (path.endsWith("forecast")) response = { slots: [], series: {} };
    else if (path.endsWith("planned")) response = { works: [] };
    await route.fulfill({ json: response });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Report", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  return posted;
}

test("a report cannot be saved from a file, only from the camera", async ({ page }) => {
  await reportFlow(page);
  await page.getByRole("button", { name: /Use location|Recheck/ }).click();
  await page.getByText("Escalator or lift down").click();

  // The one assertion this whole feature rests on: there is no file input to use.
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByText(/can't be chosen from your files/)).toBeVisible();
  // And the claim that used to sit here, which nothing did, is gone.
  await expect(page.getByText(/Faces are blurred/)).toHaveCount(0);
  await noOverflow(page);
});

test("a checked report and its points stay on this device", async ({ page }) => {
  const posted = await reportFlow(page);
  await page.getByRole("button", { name: /Use location|Recheck/ }).click();
  await page.getByText("Escalator or lift down").click();
  await page.getByRole("button", { name: /Open the camera/ }).click();
  await page.getByRole("button", { name: "Take photo" }).click();
  await page.getByRole("button", { name: /Save report/ }).click();

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByText(/points saved on this device/).first()).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("solvik:reports")))).toHaveLength(1);
  // Never the word the model cannot support.
  await expect(page.getByText(/verified/i)).toHaveCount(0);

  // The shutter time and the fix travel with the report so the server can judge it.
  expect(posted).toHaveLength(1);
  expect(posted[0].capturedAt).toBeGreaterThan(0);
  expect(posted[0].photo.startsWith("data:image/jpeg;base64,")).toBe(true);
  expect(posted[0].accuracy).toBe(10);
});

test("saving a report resolves a fresh location when Use location was skipped", async ({ page }) => {
  const posted = await reportFlow(page);
  await page.getByText("Escalator or lift down").click();
  await page.getByRole("button", { name: /Open the camera/ }).click();
  await page.getByRole("button", { name: "Take photo" }).click();
  await page.getByRole("button", { name: /Save report/ }).click();

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0].stationCode).toBe("53061");
  expect(posted[0].fixAt).toBeGreaterThan(0);
});

test("a rejected report is not saved and says which check failed", async ({ page }) => {
  await reportFlow(page, { verdict: "rejected" });
  await page.getByRole("button", { name: /Use location|Recheck/ }).click();
  await page.getByText("Escalator or lift down").click();
  await page.getByRole("button", { name: /Open the camera/ }).click();
  await page.getByRole("button", { name: "Take photo" }).click();
  await page.getByRole("button", { name: /Save report/ }).click();

  await expect(page.getByText("Not saved").first()).toBeVisible();
  await expect(page.getByText(/420 m away/).first()).toBeVisible();
  await expect(page.getByText(/No points — this report wasn't saved/)).toBeVisible();
  await noOverflow(page);
});
