// How much belief a report has earned, and why.
//
// The rule this module exists to enforce: every tier is a countable fact, not a
// score. "4 commuters reported this" can be checked; "87% confident" cannot, and
// inventing one would undo the discipline the rest of the app is built on. So
// there are no percentages here, and no weights — only how many distinct people
// said it, and whether LTA's own feed has caught up yet.

export const WINDOW_MS = 30 * 60 * 1000;
export const MANY_ACCOUNTS = 3;

// LTA's own feed agreeing is not a tier of confidence — it is the end of the
// question. Everything below it is commuters ahead of the official record.
export const TIERS = {
  lta: { key: "lta", label: "Confirmed by LTA", tone: "busy", official: true },
  many: { key: "many", label: "Multiple reports", tone: "warn", official: false },
  few: { key: "few", label: "Reported", tone: "warn", official: false },
  one: { key: "one", label: "Unconfirmed", tone: "muted", official: false },
};

const KIND_LABELS = {
  crowd: "Crowding",
  esc: "Lift or escalator disruption",
  delay: "Train held",
  gantry: "Gantry queue",
  bus: "Bus full",
  aircon: "Comfort issue",
};

export function kindLabel(kind) {
  return KIND_LABELS[kind] || "Disruption";
}

export function isCurrent(report, now = Date.now()) {
  if (!report || !report.at) return false;
  return now - report.at < WINDOW_MS;
}

// Distinct accounts, never submissions. One person reporting four times is one
// person with an opinion, not four commuters agreeing — and counting the
// submissions is exactly how a rewards scheme gets farmed.
export function distinctReporters(reports, now = Date.now()) {
  return new Set(
    (reports || [])
      .filter((r) => isCurrent(r, now) && r.reporter)
      .map((r) => String(r.reporter))
  ).size;
}

// `lta` is whether LTA's own feed names this station for this kind of problem —
// the planned-works join for a lift, a service alert for a delay.
//
// Takes either raw reports or the counts the grouped view returns, because the
// client only ever sees the counts: the rows carry a per-person id, and handing
// that to every reader would build the movement trace the app refuses to keep.
export function confidenceOf({ reports, people: givenPeople, count, lta = false, now = Date.now() } = {}) {
  const current = (reports || []).filter((r) => isCurrent(r, now));
  const people = Number.isFinite(givenPeople) ? givenPeople : distinctReporters(current, now);
  const tier = lta ? TIERS.lta : people >= MANY_ACCOUNTS ? TIERS.many : people >= 2 ? TIERS.few : TIERS.one;

  return {
    ...tier,
    reports: Number.isFinite(count) ? count : current.length,
    people,
    lta: !!lta,
    // The sentence under the headline. Each clause is a fact with a source, and
    // the "not yet confirmed" half matters as much as the count: it is what
    // stops a handful of reports reading like an official notice.
    line: [
      people === 0
        ? "No current reports"
        : `Reported by ${people} commuter${people === 1 ? "" : "s"}`,
      lta ? "confirmed by LTA's own feed" : "not yet confirmed by LTA",
    ].join(" · "),
  };
}

// Sorting a list of places with reports: official first, then weight of
// agreement, then recency.
export function rankByConfidence(groups) {
  return [...(groups || [])].sort(
    (a, b) =>
      Number(b.confidence.lta) - Number(a.confidence.lta) ||
      b.confidence.people - a.confidence.people ||
      (b.lastAt || 0) - (a.lastAt || 0)
  );
}

// Reports collapsed to one entry per station and kind — what the Nearby list
// and the map pins render.
export function groupReports(reports, { ltaStations = [], now = Date.now() } = {}) {
  const official = new Set(ltaStations.map((c) => String(c).toUpperCase()));
  const map = new Map();
  (reports || [])
    .filter((r) => isCurrent(r, now) && r.stationCode)
    .forEach((r) => {
      const code = String(r.stationCode).toUpperCase();
      const key = `${code}|${r.kind}`;
      const group = map.get(key) || {
        key, kind: r.kind, stationCode: code,
        stationName: r.stationName || code, entries: [], lastAt: 0,
      };
      group.entries.push(r);
      group.lastAt = Math.max(group.lastAt, r.at || 0);
      group.stationName = group.stationName || r.stationName;
      map.set(key, group);
    });

  return rankByConfidence(
    [...map.values()].map((group) => ({
      ...group,
      label: kindLabel(group.kind),
      // A lift report is corroborated by the lift feed; a delay by the service
      // alerts. Only ever at the station the report actually names.
      confidence: confidenceOf({ reports: group.entries, lta: official.has(group.stationCode), now }),
    }))
  );
}

// The same shape as groupReports, built from the counts the view returns rather
// than from rows we are deliberately not allowed to read.
export function groupsFromCounts(groups, { ltaStations = [], now = Date.now() } = {}) {
  const official = new Set((ltaStations || []).map((c) => String(c).toUpperCase()));
  return rankByConfidence(
    (groups || []).map((group) => ({
      ...group,
      label: kindLabel(group.kind),
      confidence: confidenceOf({
        people: group.people,
        count: group.reports,
        lta: official.has(String(group.stationCode).toUpperCase()),
        now,
      }),
    }))
  );
}
