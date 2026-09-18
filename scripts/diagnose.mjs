// Reports exactly what OneMap does with a routing request, so a vague
// "no route found" becomes a specific fault. Run against your real .env:
//
//   npm run diagnose
//   npm run diagnose -- --from 1.4294,103.8350 --to 1.3009,103.8559
//
// Prints the credential path taken, the outbound URL, the HTTP status and the
// head of the raw response. The token itself is never printed.
import { readFileSync } from "node:fs";
import { credentialSummary, getOneMapToken } from "../api/_lib/onemapAuth.js";
import { buildRouteUrl, otpError, hasTransit, REQUEST_VARIANTS } from "../api/_lib/onemap.js";
import { normalizeItinerary } from "../api/_lib/itinerary.js";

// Load .env the same way the dev server does, without adding a dependency.
try {
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
} catch {
  console.log("note: no .env file found next to package.json\n");
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith("--")) acc.push([arg.slice(2), all[i + 1]]);
    return acc;
  }, [])
);

const from = args.from || "1.4294,103.8350"; // Yishun
const to = args.to || "1.3009,103.8559"; // Marina Bay
const mode = args.mode || "transit";

function sgNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).reduce((out, p) => (p.type === "literal" ? out : { ...out, [p.type]: p.value }), {});
  return { date: `${parts.month}-${parts.day}-${parts.year}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

const line = (k, v) => console.log(`${k.padEnd(22)} ${v}`);

// `npm run diagnose -- --coverage` answers a different question: how much of
// the network the crowd feed covers, and how much of that we lose ourselves.
if ("coverage" in args) {
  const { coverageReport } = await import("../api/_lib/coverage.js");
  console.log("=== crowd feed coverage ===");
  line("LTA_ACCOUNT_KEY set", process.env.LTA_ACCOUNT_KEY ? "yes" : "no");
  try {
    const report = await coverageReport();
    line("lines asked", report.linesAsked);
    line("lines answering", report.linesAnswering);
    line("stations published", report.stations);
    line("located by us", report.located);
    line("dropped by us", report.droppedByUs);
    console.log("");
    report.lines.forEach((l) => {
      console.log(
        `${String(l.line).padEnd(6)} realtime ${String(l.realtime).padStart(3)}  forecast ${String(l.forecast).padStart(3)}` +
          `  located ${String(l.located).padStart(3)}` +
          (l.dropped.length ? `  dropped: ${l.dropped.join(", ")}` : "") +
          (l.realtimeOnly.length ? `\n       live but no forecast: ${l.realtimeOnly.join(", ")}` : "")
      );
    });
    console.log(
      report.droppedByUs
        ? `\nFix the dropped codes in api/_lib/stations.js before treating these as LTA gaps.`
        : `\nEvery published station was located; any gap is LTA's own coverage.`
    );
  } catch (err) {
    line("failed", String((err && err.message) || err));
  }
  process.exit(0);
}

console.log("=== credentials ===");
const creds = credentialSummary();
line("ONEMAP_TOKEN set", creds.hasStaticToken ? "yes" : "no");
line("EMAIL + PASSWORD set", creds.hasLogin ? `yes (${creds.email})` : "no");
line("LTA_ACCOUNT_KEY set", process.env.LTA_ACCOUNT_KEY ? "yes" : "no");

console.log("\n=== token ===");
let token = null;
try {
  token = await getOneMapToken();
  line("acquired", `yes (${String(token).length} chars)`);
  const payload = String(token).split(".")[1];
  if (payload) {
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
      if (claims.exp) {
        const exp = new Date(claims.exp * 1000);
        line("expires", `${exp.toISOString()} ${exp < new Date() ? "*** EXPIRED ***" : "(valid)"}`);
      }
    } catch { /* not a JWT; nothing to report */ }
  }
} catch (err) {
  line("acquired", `NO — ${err.message}`);
  process.exit(1);
}

console.log("\n=== routing request ===");
const { date, time } = sgNow();
let solved = false;
for (const variant of REQUEST_VARIANTS) {
  const url = buildRouteUrl({ start: from, end: to, routeType: "pt", mode, date, time, variant });

  for (const scheme of ["raw", "bearer"]) {
    const res = await fetch(url.toString(), {
      headers: { Authorization: scheme === "bearer" ? `Bearer ${token}` : token },
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep raw */ }

    console.log(`\n--- ${variant.id} · ${scheme} auth ---`);
    line("sent mode/date", `${url.searchParams.get("mode")} / ${url.searchParams.get("date")}`);
    line("status", `${res.status} ${res.statusText}`);

    const otp = otpError(json);
    if (otp) line("onemap error", `id=${otp.id} msg=${otp.msg}`);

    const itineraries = (json && json.plan && json.plan.itineraries) || [];
    line("itineraries", String(itineraries.length));
    line("has transit", hasTransit(json) ? "YES" : "no (walking only)");

    if (itineraries.length) {
      const kept = itineraries.map((i) => normalizeItinerary(i, "test")).filter(Boolean);
      kept.slice(0, 3).forEach((o, i) =>
        line(`  option ${i + 1}`, `${o.mins} min · ${o.fare || "no fare"} · ${o.legs.join(" + ")}`)
      );
    } else {
      line("body head", text.slice(0, 300).replace(/\s+/g, " "));
    }

    if (hasTransit(json)) {
      console.log(`\n=> OneMap accepts mode="${url.searchParams.get("mode")}" date="${url.searchParams.get("date")}" with ${scheme} auth.`);
      solved = true;
      break;
    }
    if (res.status !== 401 && res.status !== 403) break; // only auth issues are worth another scheme
  }
  if (solved) break;
}

if (!solved) {
  console.log("\n=> No spelling returned transit. If every attempt showed walking only, OneMap is reachable but has no transit for this pair — try points a few km apart during service hours.");
}

console.log("\nDone. Paste this output (it contains no secrets) if anything above looks wrong.");
