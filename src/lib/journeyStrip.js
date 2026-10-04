// A route as one glanceable line, the way Citymapper and Google Maps show it:
//   🚶 3  ›  🚌 185  ›  🚇 EWL  ›  🚶 2
// each ride in its line's colour, so a card reads at a glance without opening
// its steps. Also a one-line summary for screen readers, and the short facts
// line beneath it.
import { lineColour } from "./lineColours.js";

const WORD = { light: "Not busy", moderate: "Filling up", busy: "Busy" };

const minutes = (secs) => Math.max(1, Math.round((Number(secs) || 0) / 60));
const distance = (metres) => (metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 10) * 10} m`);

// A walk-only card already leads with its duration; repeating the minutes in
// the strip says nothing, so it shows how far instead.
function walkOnlyItem(option) {
  const metres = (option.steps || []).reduce((sum, step) => sum + (Number(step.metres) || 0), 0);
  const fromLeg = String(option.legs?.[0] || "").match(/[\d.]+\s*k?m\b/i)?.[0];
  const text = metres > 0 ? distance(metres) : fromLeg || `${option.mins} min`;
  return [{ kind: "walk", icon: "footprints", text, spoken: `walk ${text}` }];
}

function stripItems(option) {
  if (option?.walkOnly) return walkOnlyItem(option);
  const steps = Array.isArray(option?.steps) ? option.steps : [];
  if (!steps.length) {
    return (option?.legs || []).map((label) => {
      const bus = /^BUS\b/i.test(label);
      const { bg, fg } = lineColour(label);
      return { kind: "ride", icon: bus ? "bus" : "train-front", text: bus ? label.replace(/^BUS\s*/i, "") : label, bg, fg, spoken: bus ? `bus ${label.replace(/^BUS\s*/i, "")}` : label };
    });
  }
  return steps.flatMap((step) => {
    const mode = String(step.mode || "").toUpperCase();
    if (mode === "WALK" || step.icon === "footprints" || step.icon === "flag") {
      const m = minutes(step.secs);
      return [{ kind: "walk", icon: "footprints", text: String(m), spoken: `walk ${m} min` }];
    }
    if (step.icon === "bike") return [{ kind: "walk", icon: "bike", text: String(minutes(step.secs)), spoken: `cycle ${minutes(step.secs)} min` }];
    const label = step.label || step.service || "";
    const bus = mode === "BUS";
    const { bg, fg } = lineColour(bus ? `BUS ${step.service || label}` : label, mode);
    const text = bus ? String(step.service || label).replace(/^BUS\s*/i, "") : label;
    return [{ kind: "ride", icon: bus ? "bus" : "train-front", text, bg, fg, spoken: bus ? `bus ${text}` : `${text} train` }];
  });
}

export function journeyStrip(option) {
  const items = stripItems(option);
  const nextBus = (option?.transitLegs || []).find((leg) => leg.mode === "BUS" && Number.isFinite(leg.etaMins));
  const facts = [
    option?.walkOnly ? null : option?.fare,
    option?.crowdLevel ? WORD[option.crowdLevel] : null,
    nextBus ? `${nextBus.service} ${nextBus.etaMins <= 0 ? "arriving" : `in ${nextBus.etaMins} min`}` : null,
  ].filter(Boolean);
  return {
    strip: items,
    stripSpoken: items.map((item) => item.spoken).join(", then "),
    factsLine: facts.join(" · "),
  };
}
