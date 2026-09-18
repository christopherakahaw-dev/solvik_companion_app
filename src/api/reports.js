// Reports are checked by the server, then remembered only in this browser.
// The photo is never stored. Without an account there is no cross-device or
// community feed, so every label returned here is deliberately device-local.
import { KEYS, loadStored, store } from "../lib/storage";

const LIVE_MS = 30 * 60 * 1000;
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_REPORTS = 100;

function localReports(now = Date.now()) {
  return loadStored(KEYS.reports, [])
    .filter((report) => report && Number.isFinite(Number(report.at)) && now - Number(report.at) < KEEP_MS)
    .slice(0, MAX_REPORTS);
}

function saveLocalReport(report, now = Date.now()) {
  const reports = [report, ...localReports(now)].slice(0, MAX_REPORTS);
  store(KEYS.reports, reports);
  return reports;
}

export async function submitReport(payload) {
  const now = Date.now();
  const recentCount = localReports(now).filter((report) => now - report.at < 60 * 60 * 1000).length;
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, recentCount }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The report could not be checked.");
  if (data.verdict === "accepted") {
    saveLocalReport({
      id: data.id || `local-${now.toString(36)}`,
      kind: payload.kind,
      stationCode: data.stationCode || payload.stationCode || "NEARBY",
      stationName: payload.stationName || "Nearby stop",
      ll: [Number(payload.lat) || 0, Number(payload.lng) || 0],
      points: Number(data.points) || 0,
      state: "confirmed",
      at: Number(data.createdAt) || now,
    }, now);
  }
  return data;
}

export async function loadReportGroups(now = Date.now()) {
  const current = localReports(now).filter((report) => now - report.at < LIVE_MS);
  const groups = new Map();
  current.forEach((report) => {
    const key = `${report.stationCode}|${report.kind}`;
    const group = groups.get(key) || {
      key,
      kind: report.kind,
      stationCode: report.stationCode,
      stationName: report.stationName,
      ll: report.ll,
      reports: 0,
      people: 1,
      lastAt: 0,
    };
    group.reports += 1;
    group.lastAt = Math.max(group.lastAt, report.at);
    groups.set(key, group);
  });
  return { configured: true, groups: [...groups.values()] };
}

export async function loadMyReports() {
  return localReports().map((report) => ({
    id: report.id,
    kind: report.kind,
    stationName: report.stationName,
    points: report.points,
    state: report.state || "confirmed",
    at: report.at,
  }));
}
