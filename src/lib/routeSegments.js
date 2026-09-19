import { canonicalLine } from "./lines.js";

const railColors = { NSL: "#f81919", EWL: "#27b621", CGL: "#27b621", NEL: "#a020f0", CCL: "#ffed02", CEL: "#ffed02", DTL: "#1677ff", TEL: "#b76b35", BPL: "#64748b", SLRT: "#64748b", PLRT: "#64748b" };

export function routeSegments(option, coords) {
  const spans = option?.legSpans || [];
  const segments = spans.flatMap((span, index) => {
    if (!span) return [];
    const transit = option?.transitLegs?.find((leg) => leg.legIndex === index);
    const step = option?.steps?.find((item) => item.legIndex === index);
    const mode = String(transit?.mode || step?.mode || (option?.walkOnly ? "WALK" : "")).toUpperCase();
    const walking = mode === "WALK";
    const rail = canonicalLine(transit?.service) || canonicalLine(transit?.label);
    const color = walking ? "#64748b" : mode === "BUS" ? "#13c2f9" : railColors[rail] || (/RAIL|TRAIN|SUBWAY|MRT|TRAM/.test(mode) ? "#7c3aed" : "#13d4c7");
    const points = coords.slice(span.from, span.to + 1);
    return points.length > 1 ? [{ points, color, walking }] : [];
  });
  return segments.length ? segments : [{ points: coords, color: option?.walkOnly ? "#64748b" : "#13d4c7", walking: !!option?.walkOnly }];
}
