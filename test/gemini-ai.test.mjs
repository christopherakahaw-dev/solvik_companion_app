import { test } from "node:test";
import assert from "node:assert/strict";
import aiHandler, { cleanMemoryInput, cleanRouteInput, normalizeOptionNumbers } from "../api/_handlers/ai.js";
import { generateStructured, geminiConfigured, geminiModel, geminiSchema } from "../api/_lib/gemini.js";
import { remapOptionLabels } from "../src/lib/display.js";

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function withoutGeminiKey(run) {
  const oldGemini = process.env.GEMINI_API_KEY;
  const oldGoogle = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (oldGemini == null) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = oldGemini;
      if (oldGoogle == null) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = oldGoogle;
    });
}

test("no Gemini key keeps the deterministic systems available", async () => {
  await withoutGeminiKey(async () => {
    assert.equal(geminiConfigured(), false);
    assert.equal(await generateStructured({ prompt: "unused", schema: { type: "object" } }), null);
    const res = responseRecorder();
    await aiHandler({ method: "POST", body: { action: "route", options: [{ minutes: 20 }] } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { configured: false });
  });
});

test("Gemini receives a server-side structured multimodal request", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldModel = process.env.GEMINI_MODEL;
  const realFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "server-secret";
  process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init, body: JSON.parse(init.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"matches":true}' }] } }] }),
    };
  };
  try {
    const result = await generateStructured({
      prompt: "Classify this image",
      schema: { type: "object", properties: { matches: { type: "boolean" } }, required: ["matches"] },
      image: { mimeType: "image/jpeg", data: "YWJj" },
    });
    assert.deepEqual(result, { matches: true });
    assert.match(request.url, /gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(request.init.headers["x-goog-api-key"], "server-secret");
    assert.equal(request.body.contents[0].parts[0].inlineData.data, "YWJj");
    assert.equal(request.body.generationConfig.responseMimeType, "application/json");
  } finally {
    globalThis.fetch = realFetch;
    if (oldKey == null) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
    if (oldModel == null) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = oldModel;
  }
});

test("AI inputs are bounded and routes remain tied to supplied indexes", () => {
  const route = cleanRouteInput({
    persona: "flexible",
    options: Array.from({ length: 9 }, (_, index) => ({ minutes: index + 1, legs: ["BUS 7"], events: ["Road work"] })),
  });
  assert.equal(route.options.length, 5);
  assert.deepEqual(route.options.map((option) => option.index), [0, 1, 2, 3, 4]);
  assert.deepEqual(route.options.map((option) => option.optionNumber), [1, 2, 3, 4, 5]);

  const memory = cleanMemoryInput({ journeys: Array.from({ length: 55 }, (_, index) => ({ at: index, toName: "Place", completed: true })) });
  assert.equal(memory.journeys.length, 40);
  assert.equal(geminiModel().length > 0, true);
});

test("zero-based option labels from Gemini are converted for people", () => {
  const decision = normalizeOptionNumbers({
    selectedIndex: 0,
    reason: "Option 0 is quicker than Option 2.",
    alternatives: [{ index: 1, reason: "Option 1 is less suitable than Option 0." }],
  });
  assert.equal(decision.reason, "Option 1 is quicker than Option 3.");
  assert.equal(decision.alternatives[0].reason, "Option 2 is less suitable than Option 1.");
});

test("a zero-based winner label is detected even when Option 0 is not mentioned", () => {
  const decision = normalizeOptionNumbers({
    selectedIndex: 2,
    reason: "Option 2 has the shortest walk.",
    alternatives: [],
  });
  assert.equal(decision.reason, "Option 3 has the shortest walk.");
});

test("Gemini option labels follow the final card order", () => {
  // Original Option 2 is recommended and moved above original Option 1.
  const order = [1, 0, 2];
  assert.equal(
    remapOptionLabels("Option 2 is less crowded than Option 1.", order),
    "Option 1 is less crowded than Option 2."
  );
  assert.equal(remapOptionLabels("Option 3 has more walking.", order), "Option 3 has more walking.");
});

test("unsupported schema keywords are removed only from the Gemini wire schema", () => {
  const source = {
    type: "object",
    properties: { nested: { type: "object", additionalProperties: false, properties: { value: { type: "string" } } } },
    additionalProperties: false,
  };
  const wire = geminiSchema(source);
  assert.equal("additionalProperties" in wire, false);
  assert.equal("additionalProperties" in wire.properties.nested, false);
  assert.equal(source.additionalProperties, false, "the validation source schema stays strict");
});

test("cleanMemoryInput preserves coordinate endpoints and memory handler returns routines", async () => {
  const cleaned = cleanMemoryInput({
    persona: "punctual",
    journeys: [
      {
        at: 1700000000000,
        fromName: "Yishun",
        toName: "Raffles Place",
        fromLL: [1.4294, 103.835],
        toLL: [1.2840, 103.8515],
        mode: "Transit",
        legs: ["NSL"],
        completed: true,
      },
      {
        at: 1700086400000,
        fromName: "Yishun",
        toName: "Raffles Place",
        fromLL: [1.4294, 103.835],
        toLL: [1.2840, 103.8515],
        mode: "Transit",
        legs: ["NSL"],
        completed: true,
      },
    ],
  });
  assert.equal(cleaned.journeys.length, 2);
  assert.deepEqual(cleaned.journeys[0].fromLL, [1.4294, 103.835]);
  assert.deepEqual(cleaned.journeys[0].toLL, [1.2840, 103.8515]);

  // Test handler parses routines in insight
  const oldKey = process.env.GEMINI_API_KEY;
  const realFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "server-secret";
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              summary: "Regular weekday commute to Raffles Place.",
              patterns: ["Departs around 08:30"],
              confidence: "high",
              preferences: { preferredModes: ["Transit"], avoidsCrowds: true, weatherSensitive: true },
              routines: [{
                fromName: "Yishun",
                toName: "Raffles Place",
                mode: "Transit",
                days: "weekday",
                departureTime: "08:30",
                evidence: "Taken consistently on 4 weekday mornings.",
              }],
            }),
          }],
        },
      }],
    }),
  });
  try {
    const res = responseRecorder();
    await aiHandler({ method: "POST", body: { action: "memory", journeys: cleaned.journeys } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.configured, true);
    assert.equal(res.body.insight.routines.length, 1);
    assert.equal(res.body.insight.routines[0].fromName, "Yishun");
    assert.equal(res.body.insight.routines[0].departureTime, "08:30");
  } finally {
    globalThis.fetch = realFetch;
    if (oldKey == null) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("aiHandler returns demo recorded fallback when Gemini is unconfigured and demo mode is active", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldDemo = process.env.DEMO_MODE;
  delete process.env.GEMINI_API_KEY;
  process.env.DEMO_MODE = "1";
  try {
    const res = responseRecorder();
    await aiHandler({ method: "POST", body: { action: "memory", journeys: [] } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.configured, true);
    assert.match(res.body.model, /Demo/);
    assert.equal(res.body.insight.routines.length, 1);
    assert.equal(res.body.insight.routines[0].fromName, "Yishun");
    assert.equal(res.body.insight.routines[0].toName, "Raffles Place");
  } finally {
    if (oldKey == null) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
    if (oldDemo == null) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = oldDemo;
  }
});

