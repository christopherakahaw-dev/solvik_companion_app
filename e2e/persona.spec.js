import { test, expect } from "@playwright/test";

// The brief scores whether the same disruption produces different advice for
// different commuters. This drives that through the real UI.
async function withCommute(page) {
  await page.addInitScript(() => {
    localStorage.setItem("solvik:onboarded", "1");
    localStorage.setItem("solvik:places", JSON.stringify({ version: 2, places: {
      home: { id: "home", name: "Yishun", address: "Yishun", ll: [1.4294, 103.835], source: "onemap", verified: true },
      school: { id: "school", name: "Botanic Gardens", address: "Botanic Gardens", ll: [1.3225, 103.8156], source: "onemap", verified: true },
    } }));
    localStorage.setItem("solvik:commutes", JSON.stringify([{
      from: "home", to: "school", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], mins: 480, mode: "Comfort", legs: ["NSL"],
      fromPlace: { id: "home", label: "Yishun", place: "Yishun", ll: [1.4294, 103.835] },
      toPlace: { id: "school", label: "Botanic Gardens", place: "Botanic Gardens", ll: [1.3225, 103.8156] },
    }]));
  });
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    let r = {};
    if (path.endsWith("trip-options")) r = { options: [{ mins: 38, eta: "08:38", fare: "$2.20", fareValue: 2.2, walk: "12 min", walkSecs: 720, transfers: 1, tag: "Fastest", geometry: [[1.43,103.83],[1.32,103.81]], legSpans: [{from:0,to:1}], legs: ["NSL","CCL"], transitLegs: [{legIndex:0,label:"NSL",mode:"RAIL",service:"NS",fromStopCode:"NS13",toStopCode:"NS17"},{legIndex:1,label:"CCL",mode:"RAIL",service:"CC",fromStopCode:"CC15",toStopCode:"CC19"}], steps: [{legIndex:0,mode:"RAIL",label:"NSL",secs:900,from:"Yishun",alight:"Bishan",boardStopCode:"NS13",alightStopCode:"NS17"},{legIndex:1,mode:"RAIL",label:"CCL",secs:1380,from:"Bishan",alight:"Botanic Gardens",boardStopCode:"CC15",alightStopCode:"CC19"}], note: "1 transfer" }] };
    else if (path.endsWith("planned")) r = { works: [{ stationCode: "NS17", stationName: "Bishan", line: "NSL", lifts: [{ id: "B1L01", desc: "Exit B street level to concourse" }] }] };
    else if (path.endsWith("forecast")) r = { slots: [], series: {} };
    else if (path.endsWith("crowding")) r = { stations: [], slots: [] };
    else if (path.endsWith("weather")) r = { nowcast: null, outlook: null };
    await route.fulfill({ json: r });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
}

test("the same lift outage reads differently for each commuter", async ({ page }) => {
  await withCommute(page);
  await expect(page.getByText("Lift out at Bishan")).toBeVisible();

  // Fixed schedule: a note. The trains still run.
  await page.getByRole("button", { name: /Fixed schedule/ }).click();
  await expect(page.getByText(/trains still run — only the lift is out/)).toBeVisible();

  // Step-free: the same feed row, now a blocked journey.
  await page.getByRole("button", { name: /Step-free access/ }).click();
  await expect(page.getByText(/You travel step-free, so this may block the way through/)).toBeVisible();

  // Neither version claims how long, because LTA does not publish that.
  await expect(page.getByText(/not how long it will be out/)).toBeVisible();
});

test("the chosen persona is named on screen and survives a reload", async ({ page }) => {
  await withCommute(page);
  await page.getByRole("button", { name: /Flexible and multi-modal/ }).click();
  await page.reload();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("button", { name: /Flexible and multi-modal/ })).toHaveAttribute("aria-pressed", "true");
});
