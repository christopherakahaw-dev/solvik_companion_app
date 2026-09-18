import { test, expect } from "@playwright/test";
test("the affected portion and the original route are both drawn", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("solvik:onboarded", "1");
    localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places: {
      home: { id: "home", name: "Yishun", address: "Yishun", ll: [1.4294, 103.835], source: "onemap", verified: true },
    } }));
    navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 1.4294, longitude: 103.835, accuracy: 12 }, timestamp: Date.now() });
  });
  const geom = [[1.43,103.83],[1.40,103.84],[1.37,103.845],[1.34,103.85],[1.30,103.855]];
  await page.route(u => u.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    let r = {};
    if (path.endsWith("onemap-search")) r = { results: [{ name: "RAFFLES PLACE", address: "Raffles Place", postal: "048616", lat: 1.2841, lng: 103.8515 }] };
    else if (path.endsWith("trip-options")) r = { options: [{ mins: 38, eta: "09:00", fare: "$2.20", fareValue: 2.2, walk: "6 min", walkSecs: 360, transfers: 1, tag: "Fastest", geometry: geom, legSpans: [{ from: 1, to: 3 }], legs: ["NSL", "BUS 12"], transitLegs: [{ legIndex: 0, label: "NSL", mode: "RAIL", service: "NS", fromStopCode: "NS13", toStopCode: "NS26", crowdLevel: "moderate" }, { legIndex: 1, label: "BUS 12", mode: "BUS", service: "12", fromLat: 1.3508, fromLng: 103.8485, crowdLevel: "light" }], steps: [{ legIndex: 0, mode: "RAIL", label: "NSL", secs: 1800, boardStopCode: "NS13", stopCodes: ["NS17"], alightStopCode: "NS26", crowdLevel: "moderate" }, { legIndex: 1, mode: "BUS", label: "BUS 12", secs: 300, crowdLevel: "light" }], note: "1 transfer" }] };
    else if (path.endsWith("lta") && new URL(route.request().url()).searchParams.get("endpoint") === "TrainServiceAlerts")
      r = { value: { Status: 2, AffectedSegments: [{ Line: "NSL", Direction: "Both", Stations: "NS13,NS17" }], Message: [] } };
    else if (path.endsWith("crowding")) r = { stations: [
      { code: "NS13", name: "Yishun", lat: 1.4294, lng: 103.835, level: "moderate" },
      { code: "NS17", name: "Bishan", lat: 1.3508, lng: 103.8485, level: "busy" },
    ], slots: [] };
    else if (path.endsWith("forecast")) r = { slots: [], series: {} };
    else if (path.endsWith("planned")) r = { works: [], roadWorks: [], busChanges: [] };
    else if (path.endsWith("weather")) r = { nowcast: null, outlook: null };
    else if (path.endsWith("road")) r = { bands: [], incidents: [{ type: "Road works", message: "Lane closure near Bishan", ll: [1.3508, 103.8485] }] };
    await route.fulfill({ json: r });
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: /Search address/ }).fill("raffles");
  await page.getByRole("button", { name: /^RAFFLES PLACE/ }).click();
  await expect(page.getByText("38", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Crowding layer/ })).toHaveCount(0);
  await expect(page.locator(".sv-route-crowd-station")).toHaveCount(2);
  await expect(page.locator(".sv-route-bus-load")).toHaveCount(1);
  await expect(page.locator(".sv-route-bus-load")).toContainText("BUS 12");
  await expect(page.locator(".sv-route-bus-load")).toContainText("Seats likely");
  const crowdGuide = page.getByLabel("Crowding color guide");
  await expect(crowdGuide).toBeVisible();
  for (const label of ["Light", "Filling", "Busy", "No data"]) {
    await expect(crowdGuide.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(crowdGuide.locator("i")).toHaveCount(4);
  await expect(page.getByText("Crowding along route")).toBeVisible();
  await expect(page.locator(".sv-route-sheet").getByText("Filling", { exact: true })).toBeVisible();
  await expect(page.getByText(/It remains the best choice because/)).toBeVisible();
  await expect(page.getByText(/allow extra time/)).toBeVisible();

  // Two polylines at minimum: the route, plus the disrupted stretch over it.
  const paths = await page.locator(".leaflet-overlay-pane path").count();
  expect(paths).toBeGreaterThan(1);

  // The disruption is not only a coloured stretch: its affected stations are
  // visible, focusable issue locations on the current route.
  await expect(page.locator(".sv-map-issue")).toHaveCount(3);
  await expect(page.locator(".leaflet-marker-pane [title*='NSL']")).toHaveCount(2);
  const issueMarker = page.locator(".leaflet-marker-pane [title*='NSL']").first();
  await issueMarker.hover();
  await expect(page.locator(".sv-issue-tooltip")).toHaveCount(0);
  await issueMarker.click();
  const issuePopup = page.locator(".sv-issue-popup-card");
  await expect(issuePopup).toBeVisible();
  await expect(issuePopup).toContainText("SERVICE ALERT");
  await expect(issuePopup).toContainText("ON YOUR ROUTE");
  const issuePopupBox = await issuePopup.boundingBox();
  expect(issuePopupBox?.width).toBeGreaterThan(220);
  expect(issuePopupBox?.height).toBeLessThan(220);

});
