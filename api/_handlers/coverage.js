// Which stations the crowd feed covers, and which of those we then fail to
// place on the map. Status only — no secrets — so it's safe to paste into an
// issue, like /api/diagnostics.
import { coverageReport } from "../_lib/coverage.js";

export default async function handler(req, res) {
  try {
    const report = await coverageReport();
    const hint = report.droppedByUs
      ? `LTA published ${report.stations} stations; ${report.droppedByUs} could not be matched to coordinates by our own lookup (api/_lib/stations.js). Fix those before assuming LTA's coverage is the problem.`
      : `Every station LTA published (${report.stations}) was located. Any gap you see is LTA's own coverage, not ours.`;
    res.setHeader("Cache-Control", "s-maxage=300");
    res.status(200).json({ ...report, hint });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    res.status(msg.includes("not configured") ? 501 : 502).json({ error: msg, hint: "Set LTA_ACCOUNT_KEY, then retry." });
  }
}
