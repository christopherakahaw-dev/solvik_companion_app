// Why there are no arrival times, in words — shared by the server (which knows
// the reason) and the client (which renders it). A blank where a time should be
// is the one thing this must never produce.
export function reasonText(reason, service) {
  const label = service ? `${service}` : "this service";
  if (reason === "no-key") return "Arrival times need an LTA DataMall key";
  if (reason === "unknown-stop") return "Arrival times unavailable for this stop";
  if (reason === "not-serving") return `${label} isn't running from this stop right now`;
  if (reason === "none-running") return `No ${label} arrivals right now`;
  if (reason === "upstream") return "LTA didn't answer — times will retry";
  return null;
}
