// Proxies OneMap's address/postal-code/building search so the browser never
// talks to onemap.gov.sg directly or receives the server-side API token.
import { serveRecorded } from "../_lib/demo.js";
import { recordedSearch } from "../_lib/recorded/index.js";
import { oneMapSearch } from "../_lib/onemap.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");

  const query = req.body?.query ?? req.query?.q ?? new URL(req.url, "http://localhost").searchParams.get("q");
  const normalized = String(query || "").trim();
  if (normalized.length < 2 || normalized.length > 120) {
    res.status(400).json({ error: "Search query must be between 2 and 120 characters" });
    return;
  }

  const nearValue = req.body?.near;
  let near;
  if (nearValue != null) {
    if (!Array.isArray(nearValue) || nearValue.length !== 2) {
      res.status(400).json({ error: "near must be a [latitude, longitude] pair" });
      return;
    }
    near = nearValue.map(Number);
    if (!near.every(Number.isFinite) || Math.abs(near[0]) > 90 || Math.abs(near[1]) > 180) {
      res.status(400).json({ error: "near contains invalid coordinates" });
      return;
    }
  }

  try {
    const results = await oneMapSearch(normalized, { near });
    res.status(200).json({ results });
  } catch (err) {
    // Match the recorded places against what was typed, so a demo search for
    // "bishan" doesn't answer with the whole list.
    const needle = normalized.toLowerCase();
    const matches = recordedSearch.filter((r) => `${r.name} ${r.address}`.toLowerCase().includes(needle));
    if (serveRecorded(res, { results: matches.length ? matches : recordedSearch })) return;
    res.status(502).json({ error: String(err && err.message ? err.message : err) });
  }
}
