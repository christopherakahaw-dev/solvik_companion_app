import { lineColour } from "./lineColours.js";

// The route split into its legs, each in its own line's colour — the same
// colour its chip has on the route card.
export function routeSegments(option, coords) {
  const spans = option?.legSpans || [];
  const segments = spans.flatMap((span, index) => {
    if (!span) return [];
    const transit = option?.transitLegs?.find((leg) => leg.legIndex === index);
    const step = option?.steps?.find((item) => item.legIndex === index);
    const mode = String(transit?.mode || step?.mode || (option?.walkOnly ? "WALK" : "")).toUpperCase();
    const walking = mode === "WALK";
    const color = lineColour(transit?.label || transit?.service || step?.label, mode).bg;
    const points = coords.slice(span.from, span.to + 1);
    // Where this leg is boarded and left, for the stop markers on the map.
    const board = step?.from || transit?.fromName || "";
    const alight = step?.alight || "";
    return points.length > 1 ? [{ points, color, walking, mode, label: transit?.label || step?.label || "", board, alight }] : [];
  });
  return segments.length ? segments : [{ points: coords, color: lineColour("", option?.walkOnly ? "WALK" : "").bg, walking: !!option?.walkOnly, mode: option?.walkOnly ? "WALK" : "", label: "" }];
}
