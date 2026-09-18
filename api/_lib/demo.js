// Demo mode: when a live upstream call fails and DEMO_MODE is switched on, a
// recorded answer is served instead of an error.
//
// The rule that keeps this honest: anything served this way is marked
// `recorded: true`, and the UI shows it. The app never claims recorded data is
// live — it just refuses to die on stage because a venue's wifi did.
export function demoMode() {
  // One switch, not two. VITE_DEMO_MODE has to exist for the browser bundle
  // anyway, and it is just as readable from the server — so setting it alone
  // turns the whole thing on. DEMO_MODE is still honoured for anyone who has it
  // configured already.
  const flag = String(process.env.DEMO_MODE || process.env.VITE_DEMO_MODE || "").toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

// Wraps an endpoint's failure path. Returns true when it answered.
export function serveRecorded(res, payload, { status = 200 } = {}) {
  if (!demoMode()) return false;
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ...payload, recorded: true });
  return true;
}
