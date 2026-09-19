import { useEffect, useRef, useState } from "react";
import { Icon, IconButton, SearchField, Card, Tag, Button } from "../design-system";
import { OneMapCanvas } from "../components/OneMapCanvas";
import { PlacePicker } from "../components/PlacePicker";
import { AppMenu } from "../components/AppMenu";
import { SolvikBrand } from "../components/SolvikBrand";
import { AnimatedWeatherIcon } from "../components/AnimatedWeatherIcon";
import { journeyDuration, arrivalClockLabel } from "../lib/display";
import { styleText } from "../lib/styleText";

export function MapScreen({ v }) {
  const routeScrollRef = useRef(null);
  const routeCardRef = useRef(null);
  useEffect(() => {
    const el = routeCardRef.current;
    if (!el || v.routeSheetExpanded) return;
    if (routeScrollRef.current) routeScrollRef.current.scrollTop = 0;
    let touch = null;
    const wheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      if (event.deltaY !== 0) v.expandRouteSheet();
    };
    const start = (event) => { touch = event.touches[0] ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; };
    const move = (event) => {
      if (!touch || !event.touches[0]) return;
      const dx = event.touches[0].clientX - touch.x;
      const dy = event.touches[0].clientY - touch.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        event.preventDefault();
        v.expandRouteSheet();
        touch = null;
      }
    };
    el.addEventListener("wheel", wheel, { passive: false, capture: true });
    el.addEventListener("touchstart", start, { passive: true, capture: true });
    el.addEventListener("touchmove", move, { passive: false, capture: true });
    return () => {
      el.removeEventListener("wheel", wheel, true);
      el.removeEventListener("touchstart", start, true);
      el.removeEventListener("touchmove", move, true);
    };
  }, [v.mapRoute, v.routeSheetExpanded, v.expandRouteSheet]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [openRouteFor, setOpenRouteFor] = useState(null);
  const [dismissedRouteFor, setDismissedRouteFor] = useState(null);
  const routeSummary = v.tripOptions?.[0];
  const routeReady = Boolean(v.destName && !v.tripsPending && routeSummary);
  const routePanelOpen = Boolean(v.destName && (openRouteFor === v.destName || (routeReady && dismissedRouteFor !== v.destName)));

  useEffect(() => {
    if (!menuOpen && !routePanelOpen && !weatherOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setWeatherOpen(false);
      setOpenRouteFor(null);
      setDismissedRouteFor(v.destName);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen, routePanelOpen, weatherOpen, v.destName]);

  useEffect(() => {
    if (!v.showSearchHome && !v.showNearbyBusStops && !v.showResults && !v.showAreaSearch) return undefined;
    const closeSearchOnOutsidePress = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".sv-map-search-wrap, .sv-map-results")) return;
      // Let the Leaflet click handler consume a map tap. It dismisses search
      // without also turning that same tap into a dropped pin.
      if (event.target.closest(".leaflet-container")) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest(".sv-map-search-wrap")) active.blur();
      v.hideSearch();
    };
    document.addEventListener("pointerdown", closeSearchOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeSearchOnOutsidePress, true);
  }, [v.showSearchHome, v.showNearbyBusStops, v.showResults, v.showAreaSearch, v.hideSearch]);

  useEffect(() => {
    if (v.searchTarget !== "area" || !v.mapSearch) return undefined;
    const frame = requestAnimationFrame(() => document.querySelector(".sv-map-search-wrap input")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [v.searchTarget, v.mapSearch]);

  return (
    <div className={`sv-map-screen${v.mapRoute ? " has-route" : ""}${v.searchOpen ? " is-search-focused" : ""}`} style={{ position: "absolute", inset: 0 }}>
      <OneMapCanvas
        center={v.mapCenter}
        zoom={12}
        route={v.routeCoords}
        routeOption={v.routeOption}
        compareRoute={v.compareRouteCoords}
        affected={v.affectedSpans}
        marker={v.userMarker}
        markerAccuracy={v.userAccuracy}
        origin={v.routeOriginCoord}
        dest={v.destCoord}
        pin={v.pinCoord}
        savedPlaces={v.savedPlaceMarkers}
        busStops={v.nearbyBusStopMarkers}
        zones={v.routeCrowdStations}
        issues={v.mapIssues}
        onMapClick={v.dropPin}
        zoomControls={false}
        recenterToken={v.recenterToken}
        height="100%"
      />

      <div className="sv-map-overlay-stack">
        <div className="sv-map-topbar">
          <div className="sv-map-leading">
            {v.mapRoute ? (
              <button type="button" className="sv-map-control sv-map-back" aria-label="Back to map search" title="Back to map search" onClick={() => { setWeatherOpen(false); setMenuOpen(false); setOpenRouteFor(null); setDismissedRouteFor(null); v.backToSearch(); }}>
                <Icon name="arrow-left" size={21} strokeWidth={2.2} />
              </button>
            ) : <>

            <button
              type="button"
              className="sv-map-control sv-map-menu-button sv-logo-menu-button"
              aria-label="Open menu"
              title="Open Solvik menu"
              aria-expanded={menuOpen}
              onClick={() => { setWeatherOpen(false); setMenuOpen(true); }}
            >
              <Icon name="route" size={20} strokeWidth={2.35} />
              <span className="sv-logo-menu-cue" aria-hidden="true"><Icon name="menu" size={13} strokeWidth={2.8} /></span>
            </button>
            <SolvikBrand compact className="sv-map-brand" />
            </>}
          </div>

          {v.mapSearch ? (
            <div
              className={`sv-map-search-wrap${v.searchPending ? " is-searching" : ""}`}
              onFocusCapture={v.openSearch}
              onBlurCapture={v.closeSearch}
              onKeyDown={(e) => {
                if (e.key === "Escape") v.dismissSearch();
              }}
            >
              <SearchField value={v.query} placeholder={v.searchPlaceholder} icon="search" onChange={v.setQuery} onClear={v.clearQuery} />
            </div>
           ) : null}

          <div className="sv-map-top-actions">
              <button className="sv-map-action sv-map-action-alert" onClick={() => { setWeatherOpen(false); v.fcToggleAlerts(); }} aria-label="Alerts" title="Alerts" style={styleText(v.fcBellStyle)}>
                <Icon name="bell" size={20} strokeWidth={2.1} />
                {v.fcHasFaults && <span style={styleText(v.fcBellDotStyle)}>{v.fcFaultN}</span>}
              </button>
              <button
                type="button"
                className={`sv-map-action sv-map-action-weather is-${v.mapWeather.phase}${v.mapWeather.wet ? " is-wet" : ""}${weatherOpen ? " is-open" : ""}`}
                aria-label={v.mapWeather.ariaLabel}
                aria-expanded={weatherOpen}
                title={v.mapWeather.title}
                onClick={() => setWeatherOpen((open) => !open)}
              >
                <AnimatedWeatherIcon name={v.mapWeather.icon} size={34} style={v.mapWeather.pending ? { animation: "sv-spin 900ms linear infinite" } : undefined} />
              </button>
              {weatherOpen && (
                <section className="sv-map-weather-popover" aria-label="Singapore weather" aria-live="polite">
                  <span className={`sv-map-weather-hero is-${v.mapWeather.phase}${v.mapWeather.wet ? " is-wet" : ""}`} aria-hidden="true">
                    <AnimatedWeatherIcon name={v.mapWeather.icon} size={40} style={v.mapWeather.pending ? { animation: "sv-spin 900ms linear infinite" } : undefined} />
                  </span>
                  <div className="sv-map-weather-copy">
                    <span>Singapore weather</span>
                    <strong>{v.mapWeather.title}</strong>
                    <p>{v.mapWeather.detail}</p>
                  </div>
                  <div className="sv-map-weather-meta">{v.mapWeather.meta}</div>
                  {v.mapWeather.error && (
                    <Button variant="secondary" size="sm" onClick={v.mapWeather.retry} iconLeft="refresh-cw">Refresh</Button>
                  )}
                </section>
              )}
          </div>
        </div>

        {v.showSearchHome && (
          <div className="sv-map-results" aria-label="Search shortcuts and recent places">
            <Card className="sv-recent-card" tone="plain" style={{ padding: "var(--recent-card-padding, 14px 16px)" }}>
              <button type="button" className="sv-nearby-bus-action" onMouseDown={(event) => event.preventDefault()} onClick={v.findNearbyBusStops}>
                <span><Icon name="bus-front" size={18} /></span>
                <span><strong>Bus stops near me</strong><small>Find the closest LTA stops using your location</small></span>
                <Icon name="chevron-right" size={17} />
              </button>
              {v.showRecents && (
                <>
                  <div className="sv-recent-head sv-nearby-recents-head">
                    <div className="sv-recent-title">Recent</div>
                    <Button className="sv-recent-clear" variant="ghost" size="sm" onClick={v.clearRecents}>Clear</Button>
                  </div>
                  {v.recents.map((p, i) => (
                    <button
                      key={i}
                      className="sv-recent-row"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={p.pick}
                    >
                      <span className="sv-recent-icon">
                        <Icon name="history" size={14} />
                      </span>
                      <span className="sv-recent-copy">
                        <span className="sv-recent-name">{p.name}</span>
                        <span className="sv-recent-detail">{p.detail}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </Card>
          </div>
        )}

        {v.showNearbyBusStops && (
          <div className="sv-map-results" role="region" aria-label="Bus stops near me">
            <Card className="sv-nearby-bus-card" tone="plain">
              <div className="sv-nearby-bus-head">
                <span><Icon name="bus-front" size={17} /></span>
                <div><strong>Bus stops near me</strong><small>Closest stops within 1.5 km</small></div>
                <IconButton icon="x" label="Close nearby bus stops" tone="ghost" size="sm" onClick={v.closeNearbyBusStops} />
              </div>
              {v.nearbyBusStopsPending && (
                <div className="sv-nearby-bus-status"><Icon name="loader-2" size={16} style={{ animation: "sv-spin 900ms linear infinite" }} /> Finding your closest stops…</div>
              )}
              {!v.nearbyBusStopsPending && v.nearbyBusStopsError && (
                <div className="sv-nearby-bus-error">
                  <p>{v.nearbyBusStopsError}</p>
                  <Button variant="secondary" size="sm" iconLeft="refresh-cw" onClick={v.findNearbyBusStops}>Try again</Button>
                </div>
              )}
              {v.nearbyBusStopsEmpty && <div className="sv-nearby-bus-status">No LTA bus stops were found within 1.5 km.</div>}
              {!v.nearbyBusStopsPending && !v.nearbyBusStopsError && v.nearbyBusStops.map((stop) => (
                <button type="button" className="sv-nearby-bus-row" key={stop.code} onClick={stop.pick}>
                  <span className="sv-nearby-bus-code">{stop.code}</span>
                  <span><strong>{stop.name}</strong><small>{stop.detail}</small></span>
                  <Icon name="arrow-right" size={16} />
                </button>
              ))}
              {!v.nearbyBusStopsPending && !v.nearbyBusStopsError && v.nearbyBusStops.length > 0 && (
                <div className="sv-nearby-bus-source">Live stop directory from LTA DataMall</div>
              )}
            </Card>
          </div>
        )}

        {v.showAreaSearch && (
          <div className="sv-map-results">
            <Card className="sv-area-search-card" tone="plain" style={{ padding: "16px" }}>
              <div className="sv-area-search-head">
                <span className="sv-area-search-icon"><Icon name="scan-search" size={17} /></span>
                <span><strong>Search this area</strong><small>{v.areaSearchDetail}</small></span>
              </div>
              <p>Type what you need or start with a nearby category.</p>
              <div className="sv-area-search-categories" role="group" aria-label="Nearby categories">
                {v.areaSearchCategories.map((category) => (
                  <button type="button" key={category.label} onMouseDown={(event) => event.preventDefault()} onClick={category.pick}>
                    <Icon name={category.icon} size={15} />
                    {category.label}
                  </button>
                ))}
              </div>
              <div className="sv-area-search-note"><Icon name="map-pin" size={13} /> Results will be ranked from this pin.</div>
            </Card>
          </div>
        )}

        {v.showResults && (
          <div className="sv-map-results">
            <Card tone="plain" className="sv-search-results-card">
              <div className="sv-search-results-label">{v.resultsLabel}</div>
              {v.searchPending && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "16px 0", font: "var(--type-body)", color: "var(--text-muted)" }}>
                  <Icon name="loader-2" size={16} style={{ animation: "sv-spin 900ms linear infinite" }} />
                  Searching…
                </div>
              )}
              {!v.searchPending && v.searchError && (
                <div style={{ padding: "16px 0", font: "var(--type-body)", color: "var(--status-fault)", textWrap: "pretty" }}>
                  {v.searchError}
                </div>
              )}
              {!v.searchPending && !v.searchError && v.searchEmpty && (
                <div style={{ padding: "16px 0", font: "var(--type-body)", color: "var(--text-muted)", textWrap: "pretty" }}>
                  No match for “{v.query.trim()}”. Try a postal code, MRT stop or building name.
                </div>
              )}
              {v.results.map((p, i) => (
                <button className="sv-search-result-row" key={i} onMouseDown={(event) => event.preventDefault()} onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--border-card)", padding: "14px 0", cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sv-search-result-name">{p.name}</div>
                    <div className="sv-search-result-detail">{p.detail}</div>
                  </div>
                  <Icon name="chevron-right" size={15} color="var(--text-muted)" />
                </button>
              ))}
              <div className="sv-search-results-footer">{v.searchFooter}</div>
            </Card>
          </div>
        )}
      </div>

      {v.mapRoute && v.routeCrowdStations.length > 0 && (
        <aside className="sv-map-crowd-key" aria-label="Crowding color guide">
          <strong>Crowding</strong>
          <div>
            {v.routeCrowdGuide.map((item) => (
              <span key={item.level}>
                <i style={{ "--crowd-key-tone": item.color }} aria-hidden="true" />
                {item.label}
              </span>
            ))}
          </div>
        </aside>
      )}

      {menuOpen && <AppMenu v={v} onClose={() => setMenuOpen(false)} />}

      {v.mapRoute && !routePanelOpen && (
        <button
          type="button"
          className="sv-route-summary"
          aria-expanded="false"
          onClick={() => { setDismissedRouteFor(null); setOpenRouteFor(v.destName); }}
        >
          <span className="sv-route-summary-icon"><Icon name="route" size={17} /></span>
          <span className="sv-route-summary-places">{v.routeOriginName} <span aria-hidden="true">→</span> {v.destName}</span>
          <strong>{v.tripsPending ? "Finding route…" : routeSummary ? journeyDuration(routeSummary.mins) : "View routes"}</strong>
          <Icon name="chevron-up" size={17} />
        </button>
      )}

      {v.mapRoute && (
        <div ref={v.setSheetRef} className={`sv-route-sheet-wrap${routePanelOpen ? " is-open" : ""}${v.routeSheetExpanded ? " is-expanded" : ""}`} style={v.sheetWrapStyle}>
          <section ref={routeCardRef} className="sv-route-sheet" style={v.sheetStyle} aria-label="Route options">
            <div className="sv-route-sheet-toolbar" onPointerDown={v.sheetDragStart} style={v.sheetGrabStyle}>
              <div style={{ width: 42, height: 4, borderRadius: 999, background: "var(--border-strong)", margin: "0 auto" }} />
              <button type="button" className="sv-route-panel-close" aria-label="Collapse route options" onPointerDown={(event) => event.stopPropagation()} onClick={() => { setOpenRouteFor(null); setDismissedRouteFor(v.destName); }}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div ref={routeScrollRef} className="sv-scroll-stack sv-route-scroll" tabIndex={0} aria-label="Route options" onKeyDown={(event) => {
              if (!v.routeSheetExpanded && event.target === event.currentTarget && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "End"].includes(event.key)) {
                event.preventDefault(); v.expandRouteSheet();
              }
            }} style={{ flex: 1, minHeight: 0, overflowY: v.routeSheetExpanded ? "auto" : "hidden", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 10 }}>
              <div className="sv-route-location-block">
                <div className="sv-route-endpoints">
                  <div className="sv-route-endpoint-rail" aria-hidden="true">
                    <span className="sv-route-endpoint-start" />
                    <span className="sv-route-endpoint-line" />
                    <Icon name="map-pin" size={18} />
                  </div>
                  <div className="sv-route-endpoint-fields">
                    <div className="sv-route-endpoint-box">
                      <span className="sv-route-endpoint-label">Start</span>
                      <PlacePicker key={v.routeOriginReset} value={v.routeOriginPlace} displayValue={v.routeOriginDisplay} clearOnFocus placeholder="Choose starting location" icon="circle-dot" onChange={v.setRouteOrigin} onDraftChange={v.setRouteOriginDraft} presets={v.originPresets} showDetails={false} />
                    </div>
                    <button type="button" className="sv-route-endpoint-box sv-route-endpoint-destination" onClick={v.backToSearch} aria-label={`Change destination: ${v.destName}`}>
                      <span className="sv-route-endpoint-label">Destination</span>
                      <span className="sv-route-endpoint-name">{v.destName === "Dropped pin" ? "Pinned location" : v.destName}</span>
                      <Icon name="chevron-right" size={16} />
                    </button>
                  </div>
                </div>
                <div className="sv-route-departure"><Icon name="clock-3" size={12} /><span>{v.tripDepartureLabel}</span></div>
              </div>
              <div className="sv-route-travel-nav">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ font: "var(--weight-heavy) 11px/1 var(--font-body)", letterSpacing: ".09em", textTransform: "uppercase", color: "var(--text-muted)" }}>Travel by</div>
                <div style={{ flex: 1, height: 1, background: "var(--border-card)" }} />
              </div>
              <div className="sv-route-mode-primary" role="group" aria-label="Travel mode">
                {v.tripModeTiles.map((m) => (
                  <button key={m.id} aria-pressed={v.tripMode === m.id} onClick={m.pick} style={styleText(m.tileStyle)}>
                    <Icon name={m.icon} size={16} />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
              </div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>{v.tripModeBlurb}</div>
              {v.routeAssistantLabel && (
                <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-accent)", font: "var(--weight-bold) 10.5px/1.3 var(--font-body)", letterSpacing: ".025em", textWrap: "pretty" }}>
                  <Icon name={v.tripsPending || /comparing/i.test(v.routeAssistantLabel) ? "loader-2" : "sparkles"} size={13} style={/comparing/i.test(v.routeAssistantLabel) ? { animation: "sv-spin 900ms linear infinite" } : undefined} />
                  {v.routeAssistantLabel}
                </div>
              )}
              {v.routeCrowdLegend.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "9px 10px", borderRadius: 14, background: "var(--sand-100)" }}>
                  <span style={{ font: "var(--weight-bold) 10.5px/1 var(--font-body)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Crowding along route</span>
                  {v.routeCrowdLegend.map((item) => (
                    <span key={item.level} style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "var(--type-caption)", color: "var(--text-body)" }}>
                      <i style={{ width: 8, height: 8, borderRadius: 999, background: item.color }} />{item.label}
                    </span>
                  ))}
                </div>
              )}
              {v.recordedNotice && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 999, background: "var(--sand-100,rgba(32,30,29,.05))", font: "var(--weight-semibold) 11.5px/1.2 var(--font-body)", color: "var(--text-muted)", textWrap: "pretty" }}>
                  <Icon name="circle-dot-dashed" size={14} />
                  {v.recordedNotice}
                </div>
              )}
              {v.tripsPending && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "18px 0", font: "var(--type-body)", color: "var(--text-muted)" }}>
                  <Icon name="loader-2" size={16} style={{ animation: "sv-spin 900ms linear infinite" }} />
                  Planning your trip…
                </div>
              )}
              {!v.tripsPending && v.tripsError && (
                <section className="sv-route-recovery" aria-live="polite">
                  <span className="sv-route-recovery-icon" aria-hidden="true"><Icon name="route-off" size={19} /></span>
                  <div className="sv-route-recovery-copy">
                    <strong>{v.tripRecovery.title}</strong>
                    <p>{v.tripRecovery.detail}</p>
                  </div>
                  {v.tripRecovery.alternatives && (
                    <div className="sv-route-recovery-modes" role="group" aria-label="Try another travel mode">
                      {v.tripRecovery.modes.map((mode, index) => (
                        <Button key={mode.id} variant={index === 0 ? "primary" : "secondary"} size="sm" onClick={mode.pick}>
                          {mode.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  {v.tripRecovery.retry && (
                    <Button className="sv-route-recovery-retry" variant="ghost" size="sm" onClick={v.retryTrips}>
                      <Icon name="refresh-cw" size={14} /> Try again
                    </Button>
                  )}
                  <details className="sv-route-recovery-details">
                    <summary>Technical details</summary>
                    <p>{v.tripRecovery.technical}</p>
                  </details>
                </section>
              )}
              {!v.tripsPending && !v.tripsError && v.tripsEmpty && (
                <div style={{ padding: "18px 0", font: "var(--type-body)", color: "var(--text-muted)", textWrap: "pretty" }}>
                  {v.tripsEmptyNote}
                </div>
              )}
              {v.tripsAvoiding && (
                <div style={{ font: "var(--weight-semibold) 11px/1 var(--font-body)", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-accent)", padding: "2px 0 4px" }}>
                  {v.tripsAvoiding}
                </div>
              )}
              {v.tripOptions.map((o, i) => (
                <Card className="sv-route-option-card" key={i} tone={o.tone} padding="tight" interactive onClick={o.pick} style={{ "--sv-card-index": i }}>
                  <div className="sv-route-option-heading">
                    <span style={{ font: "var(--weight-heavy) 32px/1 var(--font-numeric)", letterSpacing: "-.022em", fontVariantNumeric: "tabular-nums", color: "var(--text-strong)" }}>{journeyDuration(o.mins)}</span>
                    <div className="sv-route-option-status">
                      <Tag tone={o.tagTone}>{o.tag}</Tag>

                    </div>
                  </div>
                  <div className="sv-route-option-metadata">
                    <span className="sv-route-meta-item"><Icon name="clock" size={13} /><span>Arrive {arrivalClockLabel(o.eta)}</span></span>
                    <span className="sv-route-meta-item"><Icon name="wallet" size={14} />{o.fare}</span>
                      {o.weather && <span className="sv-route-weather-badge" title={o.weather.detail}>
                        <Icon name={o.weather.pending ? "loader-2" : o.weather.wet ? "cloud-rain" : o.weather.available ? "cloud-sun" : "cloud-off"} size={13} />
                        <span>{o.weather.title?.replace(/ on this route$/i, "") || "Weather unavailable"}</span>
                      </span>}
                  </div>


                  <div className="sv-route-services">
                    {o.legs.map((l, li) => (
                      <span key={li} style={l.style}>
                        {l.label}
                      </span>
                    ))}
                    <button type="button" aria-expanded={o.expanded} onClick={(event) => { event.stopPropagation(); o.pick(); }} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, font: "var(--weight-semibold) 11px/1 var(--font-body)", color: "var(--text-muted)", border: 0, padding: "8px 0", background: "transparent", cursor: "pointer" }}>
                      {o.detailHint}
                      <Icon name={o.expanded ? "chevron-up" : "chevron-down"} size={13} />
                    </button>
                  </div>

                  {o.expanded && o.details.length > 0 && (
                    <div ref={o.detailsRef} style={{ marginTop: 12, paddingLeft: 3, display: "flex", flexDirection: "column", gap: 2 }}>
                      {o.details.map((d, di) => (
                        <div key={di} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch" }}>
                            <span style={styleText(d.iconWrapStyle)}>
                              <Icon name={d.icon} size={15} />
                            </span>
                            {di < o.details.length - 1 && (
                              <span style={{ flex: 1, width: 2, minHeight: 12, background: "var(--border-card)", borderRadius: 999, margin: "3px 0" }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0, paddingBottom: di < o.details.length - 1 ? 12 : 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <span style={{ font: "var(--type-body-strong)", color: "var(--text-strong)", textWrap: "pretty" }}>{d.title}</span>
                              <span style={{ font: "var(--type-caption)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{d.meta}</span>
                            </div>
                            {d.board && (
                              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 3, textWrap: "pretty" }}>{d.board}</div>
                            )}
                            {d.alight && (
                              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 2, textWrap: "pretty" }}>{d.alight}</div>
                            )}
                            {d.arrival && d.arrival.text && (
                              <div style={{ display: "flex", alignItems: "center", marginTop: 6 }}>
                                <span style={styleText(d.loadDotStyle)} />
                                <span style={styleText(d.arrivalStyle)}>{d.arrival.text}</span>
                                {d.crowdLabel && <span style={{ ...styleText(d.crowdStyle), marginLeft: 8 }}>{d.crowdLabel}</span>}
                              </div>
                            )}
                            {!(d.arrival && d.arrival.text) && d.crowdLabel && (
                              <div style={{ marginTop: 6 }}>
                                <span style={styleText(d.crowdStyle)}>{d.crowdLabel}</span>
                              </div>
                            )}
                            {d.stops.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                                {d.stops.map((sp, si) => (
                                  <span key={si} style={styleText(d.stopChipStyle)}>{sp}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="sv-route-crowd-status">
                    <Icon name="users" size={13} />
                    <span>{o.crowd === "Crowding unknown" ? "Crowding unavailable" : o.crowd}</span>
                  </div>
                  {o.fitReason && (
                    <div className="sv-route-reason">
                      <Icon name={o.recommended ? "sparkles" : "info"} size={13} />
                      <p><span className="sv-route-reason-label">{o.fitReasonSource?.includes("Gemini") ? "Gemini explanation" : "Why this route"}</span>{o.fitReason}</p>
                    </div>
                  )}
                  <div className="sv-route-option-footer">
                    <span>{o.note?.replace(/(\d+) min/g, (_, minutes) => journeyDuration(Number(minutes)))}</span>
                    <Button size="sm" style={{ minHeight: 40, padding: "0 16px" }} iconRight="navigation" onClick={(event) => { event.stopPropagation(); o.start(); }} disabled={o.recorded}>
                      {o.recorded ? "Preview only" : "Go"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
            <div style={{ flex: "none", padding: "8px 0 14px", font: "var(--weight-regular) 10px/1.3 var(--font-body)", color: "var(--text-muted)", textAlign: "center", background: "var(--surface-card)" }}>
              Map data © OneMap · Singapore Land Authority
            </div>
          </section>
        </div>
      )}

      {v.fcPinned && (
        <div className="sv-map-card-overlay" style={{ position: "absolute", left: 14, right: 14, bottom: 88, zIndex: 16, padding: "14px 15px 15px", borderRadius: 22, background: "var(--surface-card)", boxShadow: "var(--shadow-sheet)", animation: "sv-rise 300ms cubic-bezier(.16,1,.3,1) both" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={styleText(v.fcPinned.dotStyle)} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ font: "var(--weight-heavy) 16px/1.2 var(--font-body)", letterSpacing: "-.012em", color: "var(--text-strong)", textWrap: "pretty" }}>{v.fcPinned.name}</div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 4, textWrap: "pretty" }}>{v.fcPinned.detail}</div>
            </div>
            <div style={{ flex: "none", textAlign: "right" }}>
              <div style={styleText(v.fcPinned.pctStyle)}>{v.fcPinned.pct}</div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 2 }}>{v.fcPinned.word}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 14 }}>
            {v.fcPinned.hours.map((h, i) => (
              <button key={i} onClick={h.pick} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <span style={styleText(h.barStyle)} />
                <span style={styleText(h.labelStyle)}>{h.label}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
            <Button size="md" iconLeft="bell" onClick={v.fcWatchPinned}>
              {v.fcWatchLabel}
            </Button>
            <Button variant="secondary" size="md" onClick={v.fcRoutesHere}>
              Routes
            </Button>
            <Button variant="ghost" size="md" onClick={v.fcClearPin}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {v.fcAlertsOpen && (
        <div className="sv-map-modal-layer" style={{ position: "absolute", inset: 0, zIndex: 24, background: "rgba(32,30,29,.34)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.fcToggleAlerts} style={{ flex: 1 }} />
          <section className="sv-map-modal-sheet" style={{ flex: "none", maxHeight: "76%", display: "flex", flexDirection: "column", background: "var(--surface-card)", borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0", boxShadow: "var(--shadow-sheet)", padding: "0 16px 18px", animation: "sv-rise 320ms cubic-bezier(.16,1,.3,1) both" }}>
            <div style={{ flex: "none", padding: "12px 0 6px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 42, height: 4, borderRadius: 999, background: "var(--border-strong)" }} />
            </div>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "4px 0 12px" }}>
              <div style={{ font: "var(--type-heading)", letterSpacing: "var(--tracking-heading)", color: "var(--text-strong)" }}>Alerts</div>
              <div style={styleText(v.fcFaultCountStyle)}>{v.fcFaultCount}</div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {v.fcHasUnread && (
                  <Button variant="ghost" size="sm" onClick={v.fcMarkAllRead}>
                    Mark all read
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={v.fcToggleAlerts}>
                  Close
                </Button>
              </div>
            </div>
            <div className="sv-alert-tabs" role="tablist" aria-label="Alert views">
              {v.fcAlertTabs.map((tab) => (
                <button key={tab.id} type="button" role="tab" aria-selected={tab.active} onClick={tab.pick}>
                  <span>{tab.label}</span>
                  <small>{tab.count}</small>
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>
              {v.fcPersonalContext && (
                <aside className="sv-alert-personal-context">
                  <span aria-hidden="true"><Icon name="sparkles" size={16} /></span>
                  <div>
                    <strong>{v.fcPersonalContext.title}</strong>
                    <p>{v.fcPersonalContext.detail}</p>
                    <small>{v.fcPersonalContext.meta}</small>
                  </div>
                </aside>
              )}
              {v.faultsPending && (
                <div style={{ padding: "14px 0", font: "var(--type-body)", color: "var(--text-muted)" }}>Checking LTA for disruptions…</div>
              )}
              {!v.faultsPending && v.faultsError && (
                <div style={{ padding: "14px 0", font: "var(--type-body)", color: "var(--status-fault)", textWrap: "pretty" }}>{v.faultsError}</div>
              )}
              {!v.faultsPending && !v.faultsError && v.faultsClear && (
                <div className="sv-alert-empty">
                  <span aria-hidden="true"><Icon name="circle-check" size={18} /></span>
                  <div><strong>{v.faultsClearTitle}</strong><p>{v.faultsClearDetail}</p></div>
                </div>
              )}
              {v.fcFaults.map((f, i) => (
                <button className="sv-alert-card" key={i} onClick={f.toggleRead} style={styleText(f.cardStyle)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={styleText(f.badgeStyle)}>{f.line}</span>
                    <span style={styleText(f.tagStyle)}>{f.tag}</span>
                    <span style={styleText(f.readDotStyle)} />
                    <span style={{ marginLeft: "auto", font: "var(--type-caption)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{f.time}</span>
                  </div>
                  <div style={{ font: "var(--weight-bold) 14.5px/1.3 var(--font-body)", color: "var(--text-strong)", marginTop: 9, textWrap: "pretty" }}>{f.title}</div>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 5, textWrap: "pretty" }}>{f.detail}</div>
                  {f.placeNote && (
                    <div style={{ font: "var(--type-caption)", color: "var(--text-accent)", marginTop: 6, textWrap: "pretty" }}>{f.placeNote}</div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 9 }}>
                    <span style={{ font: "var(--weight-bold) 11px/1 var(--font-body)", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" }}>{f.readLabel}</span>
                    {f.canReroute && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); f.reroute(); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); f.reroute(); } }}
                        style={{ marginLeft: "auto", cursor: "pointer", font: "var(--weight-bold) 11.5px/1 var(--font-body)", color: "var(--text-accent)", padding: "6px 10px", borderRadius: 999, background: "var(--accent-soft)", whiteSpace: "nowrap" }}
                      >
                        Find another way
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {v.hasPin && (
        <div className="sv-map-card-overlay" style={{ position: "absolute", left: 14, right: 14, bottom: 88, background: "var(--surface-card)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-sheet)", padding: "14px 15px", display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
            <div style={{ flex: "none", width: 34, height: 34, borderRadius: 999, background: "var(--accent-soft)", color: "var(--text-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="map-pin" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "var(--type-body-strong)", color: "var(--text-strong)", textWrap: "pretty" }}>{v.pinName}</div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 3, fontVariantNumeric: "tabular-nums", textWrap: "pretty" }}>{v.pinDetail}</div>
            </div>
            <IconButton icon="x" label="Remove pin" tone="ghost" size="sm" onClick={v.clearPin} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="md" fullWidth iconRight="arrow-right" onClick={v.pinDirections}>
              Routes here
            </Button>
            <Button variant="secondary" size="md" fullWidth onClick={v.pinSearch}>
              Search area
            </Button>
          </div>
        </div>
      )}

      <button
        className={`sv-map-locate${v.hasFix ? " has-fix" : ""}`}
        onClick={v.locateMe}
        aria-label="Show my location"
        title="Show my location"
        style={{
          position: "absolute",
          right: 14,
          "--sv-locate-mobile-bottom": v.locateBottom,
          maxHeight: 46,
          zIndex: 18,
          width: 46,
          height: 46,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          border: "none",
          background: "var(--surface-card)",
          color: v.hasFix ? "var(--text-accent)" : "var(--text-strong)",
          boxShadow: "0 4px 14px rgba(32,30,29,.18)",
          transition: "bottom var(--dur-base) var(--ease-out),color var(--dur-fast) var(--ease-standard)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <Icon
          name={v.locating ? "loader-2" : "locate-fixed"}
          size={20}
          strokeWidth={2.1}
          style={v.locating ? { animation: "sv-spin 900ms linear infinite" } : undefined}
        />
      </button>

      {v.showPinHint && (
        <div className="sv-map-pin-hint">
          <Icon name="map-pin" size={14} />
          Tap anywhere to drop a pin
        </div>
      )}

      {v.showMapAttrib && (
        <div style={{ position: "absolute", left: 16, bottom: 92, font: "var(--weight-regular) 10px/1.3 var(--font-body)", color: "var(--sand-700)", textShadow: "0 1px 2px rgba(255,255,255,.9)" }}>
          Map data © OneMap · Singapore Land Authority
        </div>
      )}
    </div>
  );
}
