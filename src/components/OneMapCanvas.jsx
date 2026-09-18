import { useEffect, useRef } from "react";
import L from "leaflet";
import { routeSegments } from "../lib/routeSegments.js";
import "leaflet/dist/leaflet.css";
import { baseLayerOrder, mapTilerKey } from "../lib/mapBase.js";

// The map surface. OpenStreetMap is the base, with OneMap as the fallback —
// see the tile constants below for why it is that way round — and props that
// update after mount.
const isLL = (v) => Array.isArray(v) && v.length >= 2 && isFinite(v[0]) && isFinite(v[1]);

// Which base renders, and what it falls back to, lives in src/lib/mapBase.js so
// it can be tested without a browser. Leaflet's attribution control is kept,
// compacted to a prefix-free corner so it costs almost no screen on a phone.
const MAPTILER_KEY = (() => {
  try {
    return mapTilerKey(import.meta.env);
  } catch {
    return "";
  }
})();

// A missing key is a deployment mistake whose only symptom is the map quietly
// not being OpenStreetMap, so say so once where a developer will look.
if (!MAPTILER_KEY && typeof console !== "undefined") {
  console.warn(
    "VITE_MAPTILER_KEY is not set, so the map base is OneMap, not OpenStreetMap. " +
      "It is read at build time — setting it on the host requires a rebuild to take effect.",
  );
}

const SAVED_PLACE_GLYPHS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  work: '<rect width="18" height="14" x="3" y="7" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  school: '<path d="m3 10 9-5 9 5-9 5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/>',
};

function savedPlaceHtml(kind) {
  return `<div class="sv-saved-place sv-saved-place-${kind}"><svg viewBox="0 0 24 24" aria-hidden="true">${SAVED_PLACE_GLYPHS[kind]}</svg></div>`;
}

function issueHtml(kind) {
  const glyph = kind === "lift" ? "↕" : "!";
  return `<div class="sv-map-issue sv-map-issue-${kind || "alert"}" aria-hidden="true"><span>${glyph}</span></div>`;
}

function busStopHtml() {
  return '<div class="sv-nearby-bus-marker" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 17h12M6 17V6.8C6 5.3 7.2 4 8.8 4h6.4C16.8 4 18 5.3 18 6.8V17M6 9h12M8.5 13h.01M15.5 13h.01M8 17v2M16 17v2"/></svg></div>';
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function issuePopupNode(issue) {
  const card = document.createElement("article");
  card.className = "sv-issue-popup-card";

  const eyebrow = document.createElement("div");
  eyebrow.className = "sv-issue-popup-eyebrow";
  const dot = document.createElement("span");
  dot.className = `sv-issue-popup-dot is-${issue.kind || "alert"}`;
  const kind = document.createElement("span");
  kind.textContent = issue.kind === "lift" ? "ACCESS ISSUE" : issue.kind === "road" ? "ROAD ALERT" : "SERVICE ALERT";
  eyebrow.append(dot, kind);

  const title = document.createElement("strong");
  title.textContent = issue.title || "Issue on this route";
  const detail = document.createElement("p");
  detail.textContent = issue.detail || "Tap the route card for the latest journey advice.";
  const route = document.createElement("span");
  route.className = "sv-issue-popup-route";
  route.textContent = "ON YOUR ROUTE";
  card.append(eyebrow, title, detail, route);
  return card;
}

export function OneMapCanvas({
  center,
  zoom,
  route,
  routeOption,
  // The route being compared against, drawn faint behind the live one, and the
  // spans of the live route that are disrupted.
  compareRoute,
  affected,
  marker,
  markerAccuracy,
  origin,
  dest,
  pin,
  savedPlaces,
  busStops,
  zones,
  issues,
  onMapClick,
  onZoneClick,
  height = 320,
  interactive = true,
  style,
  fitRoute = true,
  recenterToken = 0,
  zoomControls = true,
  zoomInset = 12,
  zoomTop = "50%",
}) {
  const safeCenter = isLL(center) ? center : [1.3521, 103.8198];
  const safeZoom = isFinite(zoom) ? zoom : 12;
  const safeRoute = Array.isArray(route) ? route.filter(isLL) : [];
  // The route being compared against — the original, when an alternative is
  // being shown — and which spans of the live route are disrupted.
  const safeCompare = Array.isArray(compareRoute) ? compareRoute.filter(isLL) : [];
  const safeZones = Array.isArray(zones) ? zones.filter((z) => z && isLL(z.ll)) : [];
  const safeIssues = Array.isArray(issues) ? issues.filter((issue) => issue && isLL(issue.ll)) : [];
  const safeSavedPlaces = Array.isArray(savedPlaces)
    ? savedPlaces.filter((place) => place && SAVED_PLACE_GLYPHS[place.id] && isLL(place.ll))
    : [];
  const safeBusStops = Array.isArray(busStops) ? busStops.filter((stop) => stop && isLL(stop.ll)) : [];

  const ref = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const clickZoneRef = useRef(onZoneClick);
  clickZoneRef.current = onZoneClick;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, {
      center: safeCenter,
      zoom: safeZoom,
      zoomControl: false,
      attributionControl: false,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      keyboard: interactive,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
    });
    L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);
    const layers = baseLayerOrder(MAPTILER_KEY);
    let baseIndex = 0;
    let base = null;
    // Walk the list on failure. The list only ever holds bases that *can*
    // authenticate, so running out of it means the tile servers are down or
    // the network is — not that we have another spelling left to try.
    const useBase = (index) => {
      if (base) map.removeLayer(base);
      const spec = layers[index];
      base = L.tileLayer(spec.url, spec.options);
      base.on("tileerror", () => {
        if (baseIndex !== index || index + 1 >= layers.length) return;
        baseIndex = index + 1;
        useBase(baseIndex);
      });
      base.addTo(map);
    };
    useBase(0);
    map.on("click", (e) => {
      if (clickRef.current) clickRef.current([e.latlng.lat, e.latlng.lng]);
    });
    const exposeCenter = () => {
      if (!ref.current) return;
      const next = map.getCenter();
      ref.current.dataset.mapCenter = `${next.lat.toFixed(6)},${next.lng.toFixed(6)}`;
    };
    map.whenReady(exposeCenter);
    map.on("moveend", exposeCenter);
    mapRef.current = map;
    let disposed = false;
    const invalidate = () => {
      // Auth and onboarding can replace the whole map screen between this
      // callback being queued and the next frame. Leaflet no longer has panes
      // after remove(), so a late invalidateSize would otherwise throw.
      if (disposed || mapRef.current !== map || !map._mapPane) return;
      map.invalidateSize();
    };
    const resizeFrame = requestAnimationFrame(invalidate);
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(invalidate);
      ro.observe(ref.current);
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(resizeFrame);
      if (ro) ro.disconnect();
      // Finish anything in flight first: a pan or zoom animation still running
      // when the panes go away throws from its own callback afterwards.
      try {
        map.stop();
        if (map._animatingZoom && typeof map._onZoomTransitionEnd === "function") map._onZoomTransitionEnd();
      } catch {
        // Already torn down — nothing left to settle.
      }
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];
    const green = getComputedStyle(document.documentElement).getPropertyValue("--map-route").trim() || "#437858";

    // The route the commuter would otherwise have taken, drawn faint and behind
    // the live one. 3.2.3 asks for "the alternative shown against the original,
    // so the commuter can judge the trade-off rather than being told to trust
    // the app" — which only works if both are on the map at once.
    if (safeCompare.length > 1) {
      const was = L.polyline(safeCompare, {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#7a736c",
        weight: 4, opacity: 0.45, lineCap: "round",
      }).addTo(map);
      layersRef.current.push(was);
    }
    if (safeRoute.length > 1) {
      routeSegments(routeOption, safeRoute).forEach(({ points, color, walking }) => {
        const line = L.polyline(points, { color, weight: 5, opacity: 1, dashArray: walking ? "1 10" : null, lineCap: "round", lineJoin: "round" }).addTo(map);
        layersRef.current.push(line);
      });

      // The affected stretch, drawn over the route in the disruption colour.
      // Same requirement: "the affected portion clearly distinguished from the
      // unaffected portion". Colour alone would not be enough on a bright
      // platform, so it is also twice the weight.
      const fault = getComputedStyle(document.documentElement).getPropertyValue("--crowd-busy").trim() || "#b4483c";
      (Array.isArray(affected) ? affected : []).forEach((span) => {
        const slice = safeRoute.slice(Math.max(0, span.from | 0), Math.min(safeRoute.length, (span.to | 0) + 1));
        if (slice.length < 2) return;
        const hit = L.polyline(slice, { color: fault, weight: 9, opacity: 0.85, lineCap: "round" }).addTo(map);
        layersRef.current.push(hit);
      });

      const bounds = safeCompare.length > 1 ? L.latLngBounds(safeRoute).extend(L.latLngBounds(safeCompare)) : L.latLngBounds(safeRoute);
      if (fitRoute) map.fitBounds(bounds, { padding: [34, 34] });
    }
    if (isLL(marker)) {
      // GPS accuracy ring, drawn under the position dot — context, not the
      // marker itself, so it stays faint.
      if (isFinite(markerAccuracy) && markerAccuracy > 0) {
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#437858";
        const ring = L.circle(marker, {
          radius: Math.min(markerAccuracy, 2000),
          color: accent,
          weight: 1,
          opacity: 0.3,
          fillColor: accent,
          fillOpacity: 0.06,
        }).addTo(map);
        layersRef.current.push(ring);
      }
      // An HTML marker rather than a circle, so the dot can carry the pulsing
      // halo (CSS, see tokens/index.css) that a Leaflet vector can't.
      const me = L.marker(marker, {
        interactive: false,
        keyboard: false,
        zIndexOffset: 800,
        icon: L.divIcon({
          className: "",
          html: '<div class="sv-locate"><span class="sv-locate-halo"></span><span class="sv-locate-dot"></span></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).addTo(map);
      layersRef.current.push(me);
    }
    if (isLL(pin)) {
      const p = L.marker(pin, {
        title: "Dropped pin",
        zIndexOffset: 900,
        icon: L.divIcon({
          className: "sv-dropped-pin",
          html: '<svg width="32" height="42" viewBox="0 0 32 42" aria-hidden="true"><path fill="#ff0000" stroke="#ffffff" stroke-width="1.5" d="M16 1C7.7 1 1 7.7 1 16c0 11 15 25 15 25s15-14 15-25C31 7.7 24.3 1 16 1Z"/><circle cx="16" cy="15" r="5" fill="#ffffff"/></svg>',
          iconSize: [32, 42],
          iconAnchor: [16, 42],
        }),
      }).addTo(map);
      layersRef.current.push(p);
    }
    if (isLL(origin)) {
      const start = L.circleMarker(origin, {
        radius: 8,
        color: "#fff",
        weight: 3,
        fillColor: "#201e1d",
        fillOpacity: 1,
        className: "sv-route-origin-marker",
      }).addTo(map);
      start.bindTooltip("Start", { direction: "top", offset: [0, -8] });
      layersRef.current.push(start);
    }
    if (isLL(dest)) {
      const d = L.circleMarker(dest, { radius: 9, color: "#fff", weight: 3, fillColor: green, fillOpacity: 1 }).addTo(map);
      layersRef.current.push(d);
    }
    safeIssues.forEach((issue) => {
      const issueMarker = L.marker(issue.ll, {
        keyboard: true,
        zIndexOffset: 900,
        title: issue.title || "Issue on this route",
        icon: L.divIcon({
          className: "",
          html: issueHtml(issue.kind),
          iconSize: [38, 46],
          iconAnchor: [19, 42],
        }),
      }).addTo(map);
      issueMarker.bindPopup(issuePopupNode(issue), {
        className: "sv-issue-popup",
        closeButton: true,
        autoPan: true,
        autoPanPadding: [18, 18],
        maxWidth: 292,
        minWidth: 252,
        offset: [0, -34],
      });
      layersRef.current.push(issueMarker);
    });
    safeSavedPlaces.forEach((place) => {
      const label = { home: "Home", work: "Work", school: "School" }[place.id];
      const saved = L.marker(place.ll, {
        keyboard: true,
        zIndexOffset: 500,
        title: label,
        icon: L.divIcon({
          className: "",
          html: savedPlaceHtml(place.id),
          iconSize: [38, 44],
          iconAnchor: [19, 40],
        }),
      }).addTo(map);
      saved.bindTooltip(label, { direction: "top", offset: [0, -35] });
      layersRef.current.push(saved);
    });
    safeBusStops.forEach((stop) => {
      const label = `${stop.name || "Bus stop"}${stop.code ? ` · ${stop.code}` : ""}`;
      const marker = L.marker(stop.ll, {
        keyboard: true,
        zIndexOffset: 620,
        title: label,
        icon: L.divIcon({
          className: "",
          html: busStopHtml(),
          iconSize: [32, 38],
          iconAnchor: [16, 34],
        }),
      }).addTo(map);
      marker.bindTooltip(label, { direction: "top", offset: [0, -27], className: "sv-nearby-bus-tooltip" });
      layersRef.current.push(marker);
    });
    if (safeZones.length) {
      const cs = getComputedStyle(document.documentElement);
      const tone = (lv) => cs.getPropertyValue("--crowd-" + lv).trim() || "#777974";
      safeZones.forEach((z) => {
        const c = tone(z.level);
        if (z.busLoad) {
          const levelWord = z.level === "busy" ? "Busy on board" : z.level === "moderate" ? "Filling up" : z.level === "light" ? "Seats likely" : "Load unavailable";
          const bus = L.marker(z.ll, {
            keyboard: true,
            zIndexOffset: 720,
            title: `${z.label || "Bus"} · ${levelWord}`,
            icon: L.divIcon({
              className: "",
              html: `<div class="sv-route-bus-load" style="--bus-load-tone:${c}"><span class="sv-route-bus-load-icon">BUS</span><span><strong>${escapeHtml(z.label || "Bus")}</strong><small>${levelWord}</small></span></div>`,
              iconSize: [0, 0],
            }),
          }).addTo(map);
          bus.bindTooltip(`${z.label || "Bus"} · ${levelWord}`, { direction: "top", offset: [0, -18] });
          layersRef.current.push(bus);
          return;
        }
        if (z.routeStop) {
          const levelWord = z.level === "busy" ? "Busy" : z.level === "moderate" ? "Filling" : z.level === "light" ? "Light" : "No live crowd data";
          const halo = L.circleMarker(z.ll, {
            radius: 12,
            color: c,
            weight: 3,
            opacity: 0.95,
            fillColor: c,
            fillOpacity: 0.2,
            className: `sv-route-crowd-station sv-route-crowd-${z.level || "unknown"}`,
          }).addTo(map);
          const core = L.circleMarker(z.ll, {
            radius: 4.5,
            color: c,
            weight: 0,
            fillColor: c,
            fillOpacity: 1,
            className: "sv-route-crowd-core",
          }).addTo(map);
          halo.bindTooltip(`${z.label || "Station"} · ${levelWord}`, { sticky: true, className: "sv-crowd-stop-tooltip" });
          core.bindTooltip(`${z.label || "Station"} · ${levelWord}`, { sticky: true, className: "sv-crowd-stop-tooltip" });
          layersRef.current.push(halo, core);
          return;
        }
        const sel = !!z.selected;
        const ring = L.circle(z.ll, {
          radius: z.radius || 1400,
          color: sel ? "#201e1d" : c,
          weight: sel ? 2.5 : 1.5,
          opacity: sel ? 0.85 : 0.5,
          fillColor: c,
          fillOpacity: z.level === "busy" ? 0.3 : z.level === "moderate" ? 0.22 : 0.15,
        }).addTo(map);
        if (clickZoneRef.current) {
          ring.on("click", (e) => {
            e.originalEvent && e.originalEvent.stopPropagation();
            clickZoneRef.current(z.id);
          });
        }
        layersRef.current.push(ring);
        if (z.label) {
          const m = L.marker(z.ll, {
            interactive: !!clickZoneRef.current,
            icon: L.divIcon({
              className: "",
              html:
                '<div class="' + (z.routeStop ? "sv-route-crowd-label" : "") + '" style="transform:translate(-50%,-50%);white-space:nowrap;display:flex;align-items:center;gap:5px;cursor:pointer;' +
                "padding:" + (sel ? "5px 10px" : "3px 8px") + ";border-radius:999px;background:" + (sel ? "#201e1d" : "rgba(255,255,255,.94)") + ";" +
                "box-shadow:0 2px 6px rgba(32,30,29,.16);" +
                "font:700 " + (sel ? "12px" : "11px") + '/1 Archivo,sans-serif;color:' + (sel ? "#fff" : "#3a3a36") + '">' +
                '<span style="width:7px;height:7px;border-radius:999px;background:' + c + '"></span>' +
                z.label + (z.pct ? '<span style="opacity:.62;font-weight:600">' + z.pct + "</span>" : "") + "</div>",
              iconSize: [0, 0],
            }),
          }).addTo(map);
          if (clickZoneRef.current) m.on("click", () => clickZoneRef.current(z.id));
          layersRef.current.push(m);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(routeOption), JSON.stringify(safeRoute), JSON.stringify(safeCompare), JSON.stringify(affected), JSON.stringify(marker), markerAccuracy, JSON.stringify(origin), JSON.stringify(dest), JSON.stringify(pin), JSON.stringify(safeSavedPlaces), JSON.stringify(safeBusStops), JSON.stringify(safeZones), JSON.stringify(safeIssues)]);

  const lastTokenRef = useRef(recenterToken);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLL(center)) return;
    // A bumped token is an explicit "take me there" (the locate button), so it
    // overrides both the route framing and the unchanged-centre short-circuit.
    const forced = recenterToken !== lastTokenRef.current;
    lastTokenRef.current = recenterToken;
    // A view change can land while the map is being torn down (leaving the
    // screen mid-animation); that is not worth an uncaught error.
    try {
      if (forced) {
        map.setView(center, Math.max(safeZoom, 16), { animate: true });
        return;
      }
      if (safeRoute.length && fitRoute) return;
      if (Math.abs(map.getZoom() - safeZoom) > 0.01) map.setView(center, safeZoom, { animate: false });
      else map.panTo(center, { animate: true, duration: 0.8 });
    } catch {
      // The map is gone or not laid out yet; the next render sets the view.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(center), safeZoom, fitRoute, recenterToken]);

  const zoomBy = (delta) => {
    const m = mapRef.current;
    if (m) m.setZoom(m.getZoom() + delta);
  };

  return (
    <div style={{ position: "relative", height, background: "var(--map-land)", overflow: "hidden", ...style }}>
      <div ref={ref} style={{ position: "absolute", inset: 0, filter: "saturate(.72) sepia(.12) brightness(1.03) contrast(.96)" }} />
      {interactive && zoomControls ? (
        <div
          style={{
            position: "absolute",
            right: zoomInset,
            top: zoomTop,
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 6px 18px rgba(32,30,29,.18)",
            zIndex: 500,
          }}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={(e) => {
              e.stopPropagation();
              zoomBy(1);
            }}
            style={zoomBtnStyle("14px 14px 0 0", true)}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={(e) => {
              e.stopPropagation();
              zoomBy(-1);
            }}
            style={zoomBtnStyle("0 0 14px 14px", false)}
          >
            &minus;
          </button>
        </div>
      ) : null}
    </div>
  );
}

function zoomBtnStyle(radius, withBorder) {
  return {
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--surface-card,#fff)",
    border: "none",
    cursor: "pointer",
    font: "600 21px/1 Archivo,sans-serif",
    color: "var(--text-strong,#201e1d)",
    borderRadius: radius,
    borderBottom: withBorder ? "1px solid var(--border-card,rgba(32,30,29,.12))" : "none",
  };
}
