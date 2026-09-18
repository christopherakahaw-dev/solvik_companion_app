import { test } from "node:test";
import assert from "node:assert/strict";
import aiHandler, { cleanMemoryInput, cleanRouteInput, normalizeOptionNumbers } from "../api/_handlers/ai.js";
import { generateStructured, geminiConfigured, geminiModel, geminiSchema } from "../api/_lib/gemini.js";

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
