// How a stop's arrivals read on screen: every service, its next bus and the one
// after, and — when there is nothing — which kind of nothing it is.

const LOAD_WORD = { light: "Seats available", moderate: "Standing room", busy: "Limited standing" };

// "Arr" is LTA's own word for a bus at or pulling into the stop. A time LTA
// takes from the timetable rather than a tracked bus gets a "~": it is a
// schedule, not a sighting.
export function etaLabel(bus) {
  if (!bus) return "";
  const time = bus.etaMins <= 0 ? "Arr" : `${bus.etaMins} min`;
  return bus.monitored === false ? `~${time}` : time;
}

const REASONS = {
  "no-key": "Live times need an LTA DataMall key on the server.",
  upstream: "LTA's arrival feed didn't answer. Trying again shortly.",
  "unknown-stop": "LTA doesn't recognise this stop code.",
  "none-running": "No buses due right now.",
};

// entry: one stop's answer from /api/stop-arrivals, or undefined while loading.
export function stopArrivalsView(entry, { pending = false, error = null } = {}) {
  if (!entry) {
    if (error) return { status: "error", message: "Bus times are unavailable right now.", services: [] };
    return { status: pending ? "loading" : "idle", message: pending ? "Getting bus times…" : "", services: [] };
  }
  const services = (entry.services || []).map((svc) => {
    const [next, after] = svc.buses || [];
    return {
      service: svc.service,
      next: next ? etaLabel(next) : "No bus due",
      after: after ? etaLabel(after) : "",
      due: Boolean(next),
      load: next?.load || null,
      accessible: Boolean(next?.accessible),
      title: next
        ? [
            `Bus ${svc.service}: ${etaLabel(next)}${after ? `, then ${etaLabel(after)}` : ""}`,
            next.load ? LOAD_WORD[next.load] : null,
            next.accessible ? "wheelchair accessible" : null,
            next.monitored === false ? "scheduled time, not a tracked bus" : null,
          ].filter(Boolean).join(" · ")
        : `Bus ${svc.service}: no bus due`,
    };
  });
  if (!services.length) return { status: "empty", message: REASONS[entry.reason] || REASONS["none-running"], services };
  return { status: "ready", message: "", services };
}

// One line for a map marker's popup: the first few services due soonest.
export function stopArrivalsSummary(view, limit = 4) {
  if (view.status !== "ready") return view.message;
  const due = view.services.filter((svc) => svc.due);
  if (!due.length) return "No buses due right now.";
  const soonest = [...due].sort((a, b) => minutes(a.next) - minutes(b.next)).slice(0, limit);
  const more = due.length - soonest.length;
  return soonest.map((svc) => `${svc.service} ${svc.next}`).join(" · ") + (more > 0 ? ` · +${more} more` : "");
}

function minutes(label) {
  if (/Arr/.test(label)) return 0;
  const n = parseInt(String(label).replace("~", ""), 10);
  return Number.isFinite(n) ? n : 999;
}
