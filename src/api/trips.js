function singaporeDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).reduce((out, part) => {
    if (part.type !== "literal") out[part.type] = part.value;
    return out;
  }, {});
  return {
    date: `${parts.month}-${parts.day}-${parts.year}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

// Journey options from /api/trip-options. Throws on failure so the caller can
// show an explicit error state rather than substituting invented routes.
// `avoid` names a line the answer must not use — a disruption reroute. The
// server filters rather than OneMap, which has no banned-routes parameter.
export async function getTripOptions(from, to, mode, destName, opts = {}) {
  const now = singaporeDateTime();
  const date = opts.date || now.date;
  const time = opts.time || now.time;
  const body = {
    from: `${from[0]},${from[1]}`,
    to: `${to[0]},${to[1]}`,
    mode,
    date,
    time,
  };
  if (destName) body.destName = destName;
  if (opts.avoid) body.avoid = Array.isArray(opts.avoid) ? opts.avoid.join(",") : opts.avoid;
  // A station rather than a line: a lift out at one interchange is no reason to
  // write off every train on that line.
  if (opts.avoidStations) body.avoidStations = Array.isArray(opts.avoidStations) ? opts.avoidStations.join(",") : opts.avoidStations;
  const res = await fetch("/api/trip-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't plan this trip");
  // `avoided` rides along on the array: an empty result with a reason attached
  // ("every route still uses NSL") must not read as "no routes exist".
  return Object.assign(data.options || [], { recorded: !!data.recorded, avoided: data.avoided || null });
}
