import { canonicalLine } from "./lines.js";

const railColors = { NSL: "#dc2626", EWL: "#16a34a", CGL: "#16a34a", NEL: "#9333ea", CCL: "#e5a000", CEL: "#e5a000", DTL: "#2563eb", TEL: "#92400e", BPL: "#64748b", SLRT: "#64748b", PLRT: "#64748b" };

export function routeSegments(option, coords) {
  const spans = option?.legSpans || [];
  const segments = spans.flatMap((span, index) => {
    if (!span) return [];
    const transit = option?.transitLegs?.find((leg) => leg.legIndex === index);
    const step = option?.steps?.find((item) => item.legIndex === index);
    const mode = String(transit?.mode || step?.mode || (option?.walkOnly ? "WALK" : "")).toUpperCase();
    const walking = mode === "WALK";
    const rail = canonicalLine(transit?.service) || canonicalLine(transit?.label);
    const color = walking ? "#64748b" : mode === "BUS" ? "#ea580c" : railColors[rail] || (/RAIL|TRAIN|SUBWAY|MRT|TRAM/.test(mode) ? "#7c3aed" : "#0891b2");
    const points = coords.slice(span.from, span.to + 1);
    return points.length > 1 ? [{ points, color, walking }] : [];
  });
  return segments.length ? segments : [{ points: coords, color: option?.walkOnly ? "#64748b" : "#0891b2", walking: !!option?.walkOnly }];
}
