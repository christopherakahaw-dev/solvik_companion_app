// Records the demo walkthrough: a phone-sized video and a numbered set of
// screenshots, from a cold browser through to every headline feature.
//
// `npm run capture` — output lands in demo-capture/.
//
// This is deliberately not in e2e/. It asserts nothing; it is a camera. Keeping
// it out of the suite means `npx playwright test` stays a pass/fail signal
// rather than something that also writes two megabytes of video.
//
// It runs in demo mode with no keys, so the recording is reproducible by anyone
// with the repo. Add real credentials to app/.env and re-run to capture the
// same walkthrough against live LTA and OneMap data.
export default {
  testDir: ".",
  testMatch: "capture-demo.spec.js",
  timeout: 120000,
  workers: 1,
  outputDir: "../demo-capture/video",
  use: {
    baseURL: "http://127.0.0.1:5179",
    timezoneId: "Asia/Singapore",
    video: { mode: "on", size: { width: 393, height: 852 } },
  },
  projects: [
    {
      name: "phone",
      use: {
        browserName: "chromium",
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
        // Retina, so the stills are sharp enough for a slide.
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5179 --strictPort",
    url: "http://127.0.0.1:5179",
    reuseExistingServer: false,
    cwd: "..",
    env: {
      ...process.env,
      // The seed button only exists in a demo build.
      VITE_DEMO_MODE: "1",
    },
  },
};
