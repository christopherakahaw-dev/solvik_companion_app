// The colours a commuter already knows from station signage and the network
// map: LTA's own line colours. One table for the map's route lines and the
// cards' journey strips, so the same line is the same colour everywhere.
import { canonicalLine } from "./lines.js";

// { bg, fg }: the line colour, and the text colour that reads on it.
const RAIL = {
  NSL: { bg: "#D42E12", fg: "#ffffff" },
  EWL: { bg: "#009645", fg: "#ffffff" },
  CGL: { bg: "#009645", fg: "#ffffff" }, // Changi Airport branch of the EWL
  NEL: { bg: "#9900AA", fg: "#ffffff" },
  CCL: { bg: "#FA9E0D", fg: "#201e1d" },
  CEL: { bg: "#FA9E0D", fg: "#201e1d" }, // Circle Line extension
  DTL: { bg: "#005EC4", fg: "#ffffff" },
  TEL: { bg: "#9D5B25", fg: "#ffffff" },
  BPL: { bg: "#748477", fg: "#ffffff" },
  SLRT: { bg: "#748477", fg: "#ffffff" },
  PLRT: { bg: "#748477", fg: "#ffffff" },
};

export const BUS = { bg: "#334155", fg: "#ffffff" };
export const WALK = { bg: "#64748b", fg: "#ffffff" };
// A train whose line the planner didn't name.
const OTHER_RAIL = { bg: "#5b5f97", fg: "#ffffff" };

// label: "EWL", "NS", "CC", "BUS 185", "WALK 0.2 km" … mode: OneMap's leg mode.
export function lineColour(label, mode = "") {
  const text = String(label || "");
  const kind = String(mode || "").toUpperCase();
  if (kind === "WALK" || /^WALK\b/i.test(text)) return WALK;
  if (kind === "BUS" || /^BUS\b/i.test(text)) return BUS;
  const rail = canonicalLine(text.split(" ")[0]) || canonicalLine(text.slice(0, 2));
  if (rail && RAIL[rail]) return RAIL[rail];
  return /RAIL|TRAIN|SUBWAY|MRT|TRAM/.test(kind) ? OTHER_RAIL : BUS;
}
