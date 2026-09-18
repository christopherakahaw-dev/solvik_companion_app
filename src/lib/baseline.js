// What "normal" looks like, so an unusual crowd can be told from a Tuesday.
//
// The brief: "Use these to learn what 'normal' looks like for a given station
// and hour, so the app can tell an unusual crowd from a Tuesday." DataMall's
// PV/* endpoints publish monthly passenger volumes by station and hour; public
// holidays and school terms come from data.gov.sg.
//
// This is a comparison, not a model. It says "busier than this station usually
// is at this hour" — which is a fact about two numbers — and never predicts what
// the crowd will do next.

// PV/Train rows: YEAR_MONTH, DAY_TYPE, TIME_PER_HOUR, PT_TYPE, PT_CODE,
// TOTAL_TAP_IN_VOLUME, TOTAL_TAP_OUT_VOLUME.
export function parseVolumes(rows) {
  const out = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const code = String(row.PT_CODE || row.ptCode || "").trim().toUpperCase();
    const hour = Number(row.TIME_PER_HOUR ?? row.timePerHour);
    if (!code || !Number.isFinite(hour)) return;
    const dayType = String(row.DAY_TYPE || row.dayType || "WEEKDAY").trim().toUpperCase();
    const volume = Number(row.TOTAL_TAP_IN_VOLUME ?? row.totalTapInVolume) || 0;
    const key = `${code}|${dayType}|${hour}`;
    out.set(key, (out.get(key) || 0) + volume);
  });
  return out;
}

const dayTypeOf = (date, { holiday = false } = {}) => {
  if (holiday) return "WEEKENDS/HOLIDAY";
  const day = date.getDay();
  return day === 0 || day === 6 ? "WEEKENDS/HOLIDAY" : "WEEKDAY";
};

export function volumeAt(volumes, code, at, options) {
  if (!volumes || !code) return null;
  const date = at instanceof Date ? at : new Date(at || Date.now());
  const key = `${String(code).toUpperCase()}|${dayTypeOf(date, options)}|${date.getHours()}`;
  return volumes.has(key) ? volumes.get(key) : null;
}

// A station's own busiest hour is the yardstick — comparing across stations
// would just say that Raffles Place is bigger than Yishun, which nobody needs.
export function peakFor(volumes, code, dayType = "WEEKDAY") {
  let peak = 0;
  for (const [key, value] of volumes || []) {
    const [station, type] = key.split("|");
    if (station === String(code).toUpperCase() && type === dayType) peak = Math.max(peak, value);
  }
  return peak || null;
}

// "Busier than Bishan usually is at 08:00" — stated as a comparison with its
// own basis named, never as a prediction.
export function baselineNote({ volumes, code, name, at, level, holiday = false, schoolHoliday = false }) {
  const usual = volumeAt(volumes, code, at, { holiday });
  if (!usual || !level) return "";
  const where = name || code;
  const context = [
    holiday ? "a public holiday" : null,
    schoolHoliday ? "the school holidays" : null,
  ].filter(Boolean)[0];

  if (level === "busy" && context) {
    // The interesting case: crowded on a day that is normally quieter.
    return `Busy, and this is ${context} — ${where} is usually quieter at this hour.`;
  }
  if (context) return `${where} on ${context}: the usual peak does not apply.`;
  return `Typical for ${where} at this hour, from LTA's monthly passenger volumes.`;
}

// Public holidays and school terms, from data.gov.sg. Both shift the peak.
export function isHoliday(dates, at = Date.now()) {
  const day = new Date(at).toISOString().slice(0, 10);
  return (dates || []).includes(day);
}
