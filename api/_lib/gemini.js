// One small server-side Gemini client shared by route ranking, commute memory,
// and report-photo checks. The key is never sent to the browser.

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function geminiModel() {
  return String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function responseText(body) {
  return (body?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .filter((part) => typeof part?.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}

// Gemini 2.5's REST responseSchema accepts the core JSON-schema subset but its
// live endpoint currently rejects additionalProperties even though newer API
// documentation lists it. Keep the stricter schema in source for local
// validation and remove only unsupported transport keywords on the wire.
export function geminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => key !== "additionalProperties")
      .map(([key, value]) => [key, geminiSchema(value)])
  );
}

export async function generateStructured({ prompt, schema, image = null, temperature = 0.1, maxOutputTokens = 1024 }) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;

  const parts = [{ text: String(prompt || "") }];
  if (image?.data && image?.mimeType) {
    parts.unshift({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  const response = await fetch(`${API_ROOT}/${encodeURIComponent(geminiModel())}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: geminiSchema(schema),
      },
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Gemini request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = responseText(body);
  if (!text) throw new Error("Gemini returned no structured result.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returned an unreadable structured result.");
  }
}
