// Which map base to render, and what to fall back to when it fails.
//
// OpenStreetMap is the required geospatial base, and the OSM tile policy
// forbids serving it from tile.openstreetmap.org — that server runs on donated
// infrastructure and prohibits application traffic. Both conditions hold at
// once only by rendering OSM through a provider key, so OSM arrives via
// MapTiler and needs VITE_MAPTILER_KEY.
//
// Without that key the base is OneMap instead. OneMap renders Singapore
// properly, but it is the Singapore Land Authority's own national map rather
// than an OSM rendering, so the required base is no longer OSM. The key is the
// difference between meeting that requirement and not.

// OneMap publishes several renderings of the same map. Night is a real dark
// map, so dark mode no longer has to invert a light one. (Grey was tried for
// light mode: it turns water and parks grey too, which costs orientation.)
export const onemapTileUrl = (style) => `https://www.onemap.gov.sg/maps/tiles/${style}/{z}/{x}/{y}.png`;
export const ONEMAP_STYLE = { light: "Default", dark: "Night" };
export const ONEMAP_TILE_URL = onemapTileUrl(ONEMAP_STYLE.light);

export const osmTileUrl = (key) =>
  `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`;

// Attribution is a licence condition, not decoration, and each base gets the
// credit that is actually owed. OneMap is NOT derived from OpenStreetMap, so
// crediting OSM there would be a false statement about whose data is on screen;
// their terms ask for OneMap and SLA. The OSM base is ODbL, which requires
// "© OpenStreetMap contributors" wherever the map is shown.
export const ONEMAP_ATTRIBUTION =
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noreferrer">OneMap</a> © Singapore Land Authority';
export const OSM_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">© MapTiler</a> · map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';

export function mapTilerKey(env) {
  try {
    return String((env && env.VITE_MAPTILER_KEY) || "").trim();
  } catch {
    return "";
  }
}

// The bases to try, in order.
//
// MapTiler appears only when there is a key to send it. A keyless request to
// api.maptiler.com is a guaranteed 403, and Leaflet asks for a tile per
// screenful, so putting that URL in the list produces hundreds of failed
// requests and still leaves an empty grid. The old fallback did exactly that:
// with no key it started on OneMap and, the moment one OneMap tile failed,
// swapped to a MapTiler URL ending in a bare `?key=`.
//
// A missing key costs OSM as the base, which is worth saying out loud. It must
// never cost a working map.
//
// `nativeDark` marks a base drawn dark by its publisher. Only a light base
// gets the CSS inversion in dark mode.
export function baseLayerOrder(key, { dark = false } = {}) {
  const onemap = {
    name: "onemap",
    url: onemapTileUrl(dark ? ONEMAP_STYLE.dark : ONEMAP_STYLE.light),
    nativeDark: dark,
    options: { minZoom: 11, maxZoom: 19, attribution: ONEMAP_ATTRIBUTION },
  };
  if (!key) return [onemap];
  const osm = {
    name: "osm",
    url: osmTileUrl(key),
    nativeDark: false,
    options: { maxZoom: 19, attribution: OSM_ATTRIBUTION },
  };
  return [osm, onemap];
}
