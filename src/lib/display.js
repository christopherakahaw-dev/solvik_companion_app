export function singaporeClock(ms) {
  if (ms == null || !Number.isFinite(new Date(ms).getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}

export function durationLabel(seconds) {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
}

export function addressDetail(address, postal) {
  const text = String(address || "").trim();
  const code = String(postal || "").trim();
  return code && !text.includes(code) ? [text, code].filter(Boolean).join(" · ") : text;
}

export function forecastSlots(slots, now = Date.now()) {
  return [null, ...[...new Set(slots || [])].filter((slot) => Number.isFinite(Date.parse(slot)) && Date.parse(slot) > now).sort((a, b) => Date.parse(a) - Date.parse(b))];
}
