import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  workers: 2,
  use: { baseURL: "http://127.0.0.1:5180", screenshot: "only-on-failure", trace: "retain-on-failure", timezoneId: "Asia/Singapore" },
  projects: [
    { name: "chromium-phone", use: { browserName: "chromium", viewport: { width: 393, height: 700 }, isMobile: true, hasTouch: true } },
    { name: "webkit-phone", use: { browserName: "webkit", viewport: { width: 393, height: 700 }, isMobile: true, hasTouch: true } },
    { name: "webkit-small", use: { browserName: "webkit", viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5180 --strictPort",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: false,
    env: {
      ...process.env,
      // demo-path.spec.js drives the seed button, which only a demo build
      // offers. Every other spec intercepts /api/ itself, so the recorded
      // fallbacks this also switches on never come into play for them.
      VITE_DEMO_MODE: "1",
    },
  },
});
