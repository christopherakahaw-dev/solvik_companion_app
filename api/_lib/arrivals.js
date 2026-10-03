// Live bus arrivals from LTA DataMall, in the shape the route cards show.
//
// The important part is what happens when there is nothing to show: an empty
// answer here means something specific — the service has finished for the
// night, the stop code was wrong, the key is missing — and each of those
// deserves to be said rather than silently leaving a blank where the times go.
import { ltaFetch, busLoadLevel } from "./lta.js";
import { normalizeStopCode } from "./busStops.js";

export const ARRIVAL_PATHS = ["v3/BusArrival", "BusArrivalv2"];

function busesOf(svc) {
  return ["NextBus", "NextBus2", "NextBus3"]
    .map((key) => svc[key])
    .filter((bus) => bus && bus.EstimatedArrival)
    .map((bus) => ({
      etaMins: Math.max(0, Math.round((new Date(bus.EstimatedArrival) - Date.now()) / 60000)),
      load: busLoadLevel(bus.Load),
      accessible: bus.Feature === "WAB",
      // "Monitored: 0" means DataMall is working from the timetable, not a
      // vehicle's own position — worth not presenting as a live sighting.
      monitored: bus.Monitored == null || Number(bus.Monitored) === 1,
    }))
    .filter((bus) => isFinite(bus.etaMins))
    .sort((a, b) => a.etaMins - b.etaMins);
}

export function parseArrivals(payload, service) {
  const services = (payload && payload.Services) || [];
  const svc = service
    ? services.find((s) => String(s.ServiceNo) === String(service))
    : services[0];
  if (!svc) return { buses: [], reason: services.length ? "not-serving" : "none-running" };

  const buses = busesOf(svc);
  return buses.length ? { buses, reason: null } : { buses: [], reason: "none-running" };
}

// "2" < "10" < "10e" < "160" < "160A": by number first, then any suffix.
export function compareServiceNo(a, b) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
  return String(a).localeCompare(String(b));
}

// Every service calling at a stop, for the stop itself rather than one route
// leg: LTA answers a query with no ServiceNo with all of them. A service with
// no bus coming keeps its row with an empty list — "no more 95 tonight" is
// worth seeing, where a missing row would just look like the 95 doesn't stop.
export function parseStopArrivals(payload) {
  const services = ((payload && payload.Services) || [])
    .map((svc) => ({ service: String(svc.ServiceNo || ""), operator: svc.Operator || null, buses: busesOf(svc) }))
    .filter((svc) => svc.service)
    .sort((a, b) => compareServiceNo(a.service, b.service));
  return { services, reason: services.length ? null : "none-running" };
}

// stopCode may be any spelling a routing reply uses; it is normalised here.
export async function nextBuses(stopCode, service) {
  const code = normalizeStopCode(stopCode);
  if (!code) return { buses: [], reason: "unknown-stop", stopCode: null };
  try {
    const data = await ltaFetch(ARRIVAL_PATHS, { BusStopCode: code, ServiceNo: service || undefined });
    return { ...parseArrivals(data, service), stopCode: code };
  } catch (err) {
    const msg = String((err && err.message) || err);
    return { buses: [], reason: msg.includes("not configured") ? "no-key" : "upstream", stopCode: code };
  }
}

export async function stopArrivals(stopCode) {
  const code = normalizeStopCode(stopCode);
  if (!code) return { services: [], reason: "unknown-stop", stopCode: null };
  try {
    const data = await ltaFetch(ARRIVAL_PATHS, { BusStopCode: code });
    return { ...parseStopArrivals(data), stopCode: code };
  } catch (err) {
    const msg = String((err && err.message) || err);
    return { services: [], reason: msg.includes("not configured") ? "no-key" : "upstream", stopCode: code };
  }
}
