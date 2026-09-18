// Planned works on the network, as opposed to the faults /api/lta reports.
//
// The brief calls treating these as first-class "a differentiator, not an
// afterthought", and names three feeds for it: lift maintenance at stations,
// road works and openings that slow a bus leg, and bus route changes published
// before their effective date. All three are asked together and any that
// answers is used — one feed being quiet is not a reason to show nothing.
import { ltaFetch } from "../_lib/lta.js";
import {
  parseFacilities, byStation, FACILITIES_PATHS,
  parseRoadWorks, currentRoadWorks, ROADWORK_PATHS, ROADOPENING_PATHS,
  parseBusRouteChanges, BUSROUTE_PATHS,
} from "../../src/lib/planned.js";
import { serveRecorded } from "../_lib/demo.js";
import { recordedFacilities, recordedRoadWorks, recordedBusRouteChanges } from "../_lib/recorded/index.js";

export default async function handler(req, res) {
  const [lifts, works, openings, routes] = await Promise.allSettled([
    ltaFetch(FACILITIES_PATHS),
    ltaFetch(ROADWORK_PATHS),
    ltaFetch(ROADOPENING_PATHS),
    ltaFetch(BUSROUTE_PATHS),
  ]);

  if ([lifts, works, openings, routes].every((r) => r.status === "rejected")) {
    const recorded = {
      works: byStation(parseFacilities(recordedFacilities)),
      roadWorks: currentRoadWorks(parseRoadWorks(recordedRoadWorks)),
      busChanges: parseBusRouteChanges(recordedBusRouteChanges),
    };
    if (serveRecorded(res, recorded)) return;
    const reason = lifts.reason;
    const msg = String((reason && reason.message) || reason || "Planned works unavailable");
    return res.status(msg.includes("not configured") ? 501 : 502).json({ error: msg });
  }

  const roadWorks = currentRoadWorks([
    ...(works.status === "fulfilled" ? parseRoadWorks(works.value, "roadwork") : []),
    ...(openings.status === "fulfilled" ? parseRoadWorks(openings.value, "roadopening") : []),
  ]);

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({
    works: lifts.status === "fulfilled" ? byStation(parseFacilities(lifts.value)) : [],
    roadWorks,
    busChanges: routes.status === "fulfilled" ? parseBusRouteChanges(routes.value) : [],
  });
}
