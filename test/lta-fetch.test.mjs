// Which DataMall failures are worth retrying under the endpoint's other
// spelling. This exists because PCDForecast answered 500 for a whole morning
// while PlatformCrowdDensityForecast — the same feed, renamed — was fine, and
// we never asked it.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ltaFetch } from "../api/_lib/lta.js";

const realFetch = globalThis.fetch;
const realKey = process.env.LTA_ACCOUNT_KEY;

// Answers each call with the next status in the list, recording the paths asked.
function stubFetch(statuses) {
  const asked = [];
  let i = 0;
  globalThis.fetch = async (url) => {
    asked.push(new URL(url).pathname.split("/").pop());
    const status = statuses[Math.min(i++, statuses.length - 1)];
    return status === 200
      ? { ok: true, status, json: async () => ({ value: ["ok"] }) }
      : { ok: false, status, json: async () => ({}) };
  };
  return asked;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey == null) delete process.env.LTA_ACCOUNT_KEY;
  else process.env.LTA_ACCOUNT_KEY = realKey;
});

test("a 500 falls through to the other spelling of the same endpoint", async () => {
  process.env.LTA_ACCOUNT_KEY = "test-key";
  const asked = stubFetch([500, 200]);
  const body = await ltaFetch(["PCDForecast", "PlatformCrowdDensityForecast"], { TrainLine: "NSL" });
  assert.deepEqual(body.value, ["ok"]);
  assert.deepEqual(asked, ["PCDForecast", "PlatformCrowdDensityForecast"]);
});

test("a 404 still falls through", async () => {
  process.env.LTA_ACCOUNT_KEY = "test-key";
  const asked = stubFetch([404, 200]);
  await ltaFetch(["PCDRealTime", "PlatformCrowdDensityRealTime"]);
  assert.equal(asked.length, 2);
});

test("a bad key stops after one try — every spelling would say the same", async () => {
  process.env.LTA_ACCOUNT_KEY = "wrong-key";
  const asked = stubFetch([401, 200]);
  await assert.rejects(() => ltaFetch(["PCDForecast", "PlatformCrowdDensityForecast"]), /401/);
  assert.deepEqual(asked, ["PCDForecast"]);
});

test("when every spelling fails, the error names each status", async () => {
  process.env.LTA_ACCOUNT_KEY = "test-key";
  stubFetch([500, 404]);
  await assert.rejects(() => ltaFetch(["PCDForecast", "PlatformCrowdDensityForecast"]), /500, 404/);
});

test("a missing key is reported as configuration, not as a request failure", async () => {
  delete process.env.LTA_ACCOUNT_KEY;
  await assert.rejects(() => ltaFetch("PCDForecast"), /not configured/);
});
