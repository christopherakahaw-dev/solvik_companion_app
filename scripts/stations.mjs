// Builds api/_lib/stations.json: every station code LTA's crowd feed publishes,
// resolved once to a name and coordinates through OneMap.
//
// Run it from the app/ directory, with your .env in place:
//
//   npm run stations
//
// It is deliberately slow and patient — one search at a time, with retries —
// because this runs once on a laptop, not inside a request. The result is
// committed, so the deployed app never searches for a station again.
import { readFileSync, writeFileSync } from "node:fs";
import { ltaFetch, TRAIN_LINES } from "../api/_lib/lta.js";
import { oneMapSearch } from "../api/_lib/onemap.js";

try {
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
} catch {
  console.log("note: no .env next to package.json\n");
}

const out = new URL("../api/_lib/stations.json", import.meta.url);
const existing = (() => {
  try {
    return JSON.parse(readFileSync(out, "utf8"));
  } catch {
    return {};
  }
})();

const REALTIME = ["PCDRealTime", "PlatformCrowdDensityRealTime"];
const FORECAST = ["PCDForecast", "PlatformCrowdDensityForecast"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("Collecting station codes from LTA…");
const codes = new Set();
for (const line of TRAIN_LINES) {
  for (const paths of [REALTIME, FORECAST]) {
    try {
      const data = await ltaFetch(paths, { TrainLine: line });
      (data.value || []).forEach((row) => {
        if (row.Station) codes.add(String(row.Station).toUpperCase());
        (row.Stations || []).forEach((st) => st.Station && codes.add(String(st.Station).toUpperCase()));
      });
    } catch (err) {
      console.log(`  ${line}: ${String(err.message || err)}`);
    }
  }
}
console.log(`  ${codes.size} codes\n`);

// OneMap names stations like "BISHAN MRT STATION (NS17/CC9)", so the code
// itself is the most reliable thing to search for — with a couple of
// phrasings, since the index is not consistent.
const QUERIES = (code) => [code, `${code} MRT`, `${code} station`, `MRT STATION ${code}`];

function pick(code, results) {
  const upper = code.toUpperCase();
  const tagged = results.find((r) => {
    const hay = `${r.name || ""} ${r.searchval || ""} ${r.address || ""}`.toUpperCase();
    return hay.includes(`(${upper})`) || hay.includes(`/${upper})`) || hay.includes(`(${upper}/`) || hay.includes(`/${upper}/`);
  });
  if (tagged) return tagged;
  return results.find((r) => /MRT|LRT/i.test(`${r.name || ""} ${r.searchval || ""}`)) || null;
}

const clean = (raw) =>
  String(raw)
    .replace(/\s*\((?:[A-Z]{2,3}\d*\/?)+\)\s*$/i, "")
    .replace(/\s+(MRT|LRT)\s+STATION$/i, "")
    .trim();

const resolved = { ...existing };
let found = 0;
let failed = [];
const list = [...codes].sort();

for (const [i, code] of list.entries()) {
  if (resolved[code]) {
    found++;
    continue;
  }
  let hit = null;
  for (const q of QUERIES(code)) {
    try {
      hit = pick(code, await oneMapSearch(q));
    } catch {
      await sleep(400);
    }
    if (hit && isFinite(hit.lat) && isFinite(hit.lng)) break;
    hit = null;
    await sleep(120);
  }
  if (hit) {
    resolved[code] = { name: clean(hit.name || hit.searchval), lat: Number(hit.lat), lng: Number(hit.lng) };
    found++;
  } else {
    failed.push(code);
  }
  if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${list.length}…`);
  await sleep(120);
}

const ordered = Object.fromEntries(Object.keys(resolved).sort().map((k) => [k, resolved[k]]));
writeFileSync(out, `${JSON.stringify(ordered, null, 2)}\n`);

console.log(`\nResolved ${found}/${list.size || list.length} · written to api/_lib/stations.json`);
if (failed.length) console.log(`Still unresolved (the app will search for these live): ${failed.join(", ")}`);
