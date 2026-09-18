// Same checks as `npm run diagnose`, reachable from a browser while the app is
// running: open /api/diagnostics. Reports credential *status* and upstream
// responses only — never a token, password or account key — so the output is
// safe to paste into an issue.
import { credentialSummary, getOneMapToken } from "../_lib/onemapAuth.js";
import { buildRouteUrl, otpError, hasTransit, REQUEST_VARIANTS, learnedRequestShape } from "../_lib/onemap.js";
import { normalizeItinerary } from "../_lib/itinerary.js";
import { ltaKey, ltaFetch } from "../_lib/lta.js";

function singaporeNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  })
    .formatToParts(new Date())
    .reduce((out, p) => (p.type === "literal" ? out : { ...out, [p.type]: p.value }), {});
  return { date: `${parts.month}-${parts.day}-${parts.year}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}

function tokenExpiry(token) {
  const payload = String(token).split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    if (!claims.exp) return null;
    const at = new Date(claims.exp * 1000);
    return { expiresAt: at.toISOString(), expired: at < new Date() };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const q = req.query ?? Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const from = q.from || "1.4294,103.8350";
  const to = q.to || "1.3009,103.8559";

  const report = {
    checkedAt: new Date().toISOString(),
    credentials: { ...credentialSummary(), ltaAccountKeySet: !!ltaKey() },
    onemapToken: null,
    routing: null,
    lta: null,
    hint: null,
  };

  // --- OneMap token ---
  let token = null;
  try {
    token = await getOneMapToken();
    report.onemapToken = { acquired: true, length: String(token).length, ...(tokenExpiry(token) || {}) };
    if (report.onemapToken.expired) report.hint = "The OneMap token has expired. Set ONEMAP_EMAIL + ONEMAP_PASSWORD so the server can mint a fresh one automatically.";
  } catch (err) {
    report.onemapToken = { acquired: false, error: String(err.message || err) };
    report.hint = "OneMap credentials are missing or rejected — routing cannot work until this is fixed.";
    res.status(200).json(report);
    return;
  }

  // --- OneMap routing ---
  // Probe every request spelling: OneMap answers an unparsed mode or date with
  // HTTP 200 and a walking-only plan, so "which spelling returns transit" is
  // the question that actually matters.
  const { date, time } = singaporeNow();
  const attempts = [];
  try {
    for (const variant of REQUEST_VARIANTS) {
      const url = buildRouteUrl({ start: from, end: to, routeType: "pt", mode: "transit", date, time, variant });
      for (const scheme of ["raw", "bearer"]) {
        const upstream = await fetch(url.toString(), {
          headers: { Authorization: scheme === "bearer" ? `Bearer ${token}` : token },
        });
        const text = await upstream.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* keep raw */ }

        const itineraries = (json && json.plan && json.plan.itineraries) || [];
        const kept = itineraries.map((i) => normalizeItinerary(i, "diagnostic")).filter(Boolean);
        const transit = hasTransit(json);
        attempts.push({
          variant: variant.id,
          authScheme: scheme,
          status: upstream.status,
          onemapError: otpError(json),
          itineraries: itineraries.length,
          withTransit: transit,
          sample: kept.slice(0, 2).map((o) => ({ mins: o.mins, fare: o.fare, legs: o.legs })),
          bodyHead: itineraries.length ? undefined : text.slice(0, 300),
          sentDate: url.searchParams.get("date"),
          sentMode: url.searchParams.get("mode"),
        });
        if (upstream.status === 401 || upstream.status === 403) continue; // try other auth
        break; // this variant answered; move to the next spelling
      }
      if (attempts[attempts.length - 1]?.withTransit) break;
    }

    report.routing = { request: { from, to, date, time }, learned: learnedRequestShape(), attempts };

    const winner = attempts.find((a) => a.withTransit);
    const walkOnly = attempts.find((a) => a.itineraries > 0 && !a.withTransit);
    if (!report.hint) {
      if (winner) report.hint = `Routing works. OneMap accepts mode="${winner.sentMode}" with date="${winner.sentDate}" (${winner.authScheme} auth) — ${winner.itineraries} itineraries.`;
      else if (walkOnly) report.hint = "Every request spelling came back with walking only. That means OneMap is reachable but returning no transit for this pair — try coordinates a few km apart, and a time inside service hours (roughly 05:30–24:00).";
      else if (attempts.some((a) => a.status === 401 || a.status === 403)) report.hint = "OneMap rejected the token (401/403) under both auth schemes — the credentials are wrong or lack routing access.";
      else if (attempts.some((a) => a.onemapError)) report.hint = `OneMap declined the trip: ${attempts.find((a) => a.onemapError).onemapError.msg}`;
      else report.hint = "OneMap returned an HTTP error — see status and bodyHead below.";
    }
  } catch (err) {
    report.routing = { error: String(err.message || err), attempts };
  }

  // --- LTA reachability ---
  if (ltaKey()) {
    try {
      const data = await ltaFetch(["PCDRealTime", "PlatformCrowdDensityRealTime"], { TrainLine: "NSL" });
      report.lta = { ok: true, stationsReturned: (data.value || []).length };
    } catch (err) {
      report.lta = { ok: false, error: String(err.message || err) };
    }
  } else {
    report.lta = { ok: false, error: "LTA_ACCOUNT_KEY is not configured on the server." };
  }

  res.status(200).json(report);
}
