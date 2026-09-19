import { Icon, IconButton, Button, SectionLabel } from "../design-system";
import { OneMapCanvas } from "../components/OneMapCanvas";
import { SolvikBrand } from "../components/SolvikBrand";
import { styleText } from "../lib/styleText";
import { CameraCapture } from "../components/CameraCapture";

export function NavScreen({ v }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <OneMapCanvas center={v.navCoord} zoom={15} route={v.navRouteOption?.geometry || v.routeCoords} routeOption={v.navRouteOption} marker={v.navMarker} markerAccuracy={v.navAccuracy} heading={v.navHeading} dest={v.destCoord} fitRoute={false} zoomControls={false} height="100%" />

      <div className="sv-nav-top" style={{ position: "absolute", left: 14, right: 14, top: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IconButton icon="x" label="End trip" tone="plain" size="md" onClick={v.endTrip} />
          <SolvikBrand compact className="sv-nav-brand" />
          <div style={{ font: "var(--weight-bold) 12px/1 var(--font-body)", color: "var(--text-strong)", background: "var(--surface-card)", borderRadius: 999, padding: "9px 15px", boxShadow: "var(--shadow-nav)", whiteSpace: "nowrap", flex: "none" }}>{v.navStepLabel}</div>
          {v.navTrackNote && (
            <div
              style={{
                font: "var(--weight-medium) 11px/1.2 var(--font-body)",
                color: v.navTrackTone === "warn" ? "var(--crowd-busy)" : "var(--text-muted)",
                background: "var(--surface-card)", borderRadius: 999, padding: "8px 12px",
                boxShadow: "var(--shadow-nav)", minWidth: 0, textWrap: "pretty",
              }}
            >
              {v.navTrackNote}
            </div>
          )}
        </div>
        <div className="sv-nav-instruction" style={{ background: "var(--accent)", color: "var(--text-on-accent)", borderRadius: "var(--radius-card)", padding: "15px 16px", boxShadow: "var(--shadow-nav)", display: "grid", gridTemplateColumns: "36px minmax(0, 1fr)", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: "none", width: 36, height: 36, borderRadius: 999, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={v.navIcon} size={21} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sv-nav-title" style={{ font: "var(--weight-heavy) 19px/1.25 var(--font-display)", letterSpacing: "-.02em", textWrap: "pretty" }}>{v.navTitle}</div>
            <div className="sv-nav-detail" style={{ font: "var(--type-caption)", opacity: 0.74, marginTop: 5, textWrap: "pretty" }}>{v.navDetail}</div>
          </div>
          <div style={{ gridColumn: 2, display: "flex", gap: 6, alignItems: "baseline" }}>
            <div className="sv-nav-countdown" style={{ font: "var(--weight-heavy) 20px/1 var(--font-numeric)", fontVariantNumeric: "tabular-nums" }}>{v.navCountdown}</div>
            <div style={{ font: "var(--weight-regular) 10px/1 var(--font-body)", opacity: 0.68, marginTop: 5 }}>to go</div>
          </div>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: "var(--surface-card)", boxShadow: "var(--shadow-nav)", overflow: "hidden" }}>
          <div style={v.navProgressStyle} />
        </div>
      </div>

      <div className="sv-nav-sheet" style={v.navSheetStyle}>
        <div onPointerDown={v.navSheetDrag} onDoubleClick={v.navSheetCycle} style={v.navGrabStyle}>
          <div style={{ width: 42, height: 4, borderRadius: 999, background: "var(--border-strong)", margin: "0 auto" }} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
          <div className="sv-nav-eta" style={{ font: "var(--weight-heavy) 26px/1 var(--font-numeric)", fontVariantNumeric: "tabular-nums", color: "var(--text-strong)" }}>{v.navEta}</div>
          <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>{v.navRemainLabel}</div>
        </div>
        <div ref={v.setStepsRef} onScroll={v.onStepsScroll} onPointerDown={v.stepsDragStart} style={v.stepsPagerStyle}>
          {v.navList.map((st, i) => (
            <div key={i} style={st.cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={st.iconWrapStyle}>
                  <Icon name={st.icon} size={17} />
                </div>
                <div style={st.chipStyle}>{st.state}</div>
                <div style={{ marginLeft: "auto", font: "var(--type-caption)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{st.dur}</div>
              </div>
              <div style={st.titleStyle}>{st.title}</div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>{st.detail}</div>
              {st.hasStops && (
                <div style={st.laneWrapStyle}>
                  <div style={st.laneStyle} />
                  <div style={st.laneFillStyle} />
                  {st.showVehicle && (
                    <div style={st.vehicleStyle}>
                      <Icon name={st.icon} size={15} />
                    </div>
                  )}
                  {st.stopList.map((sp, si) => (
                    <div key={si} style={sp.rowStyle}>
                      <div style={{ width: 26, flex: "none", display: "flex", justifyContent: "center" }}>
                        <div style={sp.dotStyle} />
                      </div>
                      <div style={sp.style}>{sp.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={v.navDotsWrapStyle}>
          {v.navDots.map((d, i) => (
            <span key={i} style={d.style} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" size="md" fullWidth iconRight="megaphone" onClick={v.goReport}>
            Report
          </Button>
          <Button variant="ghost" size="md" fullWidth onClick={v.endTrip}>
            End trip
          </Button>
        </div>
      </div>

      {v.navRepOpen && (
        <div className="sv-nav-modal-layer" style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(32,30,29,.38)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.closeNavRep} style={{ flex: 1 }} />
          <section className="sv-nav-modal-sheet" style={{ flex: "none", maxHeight: "82%", display: "flex", flexDirection: "column", background: "var(--surface-card)", borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0", boxShadow: "var(--shadow-sheet)", padding: "0 18px 18px", animation: "sv-rise 320ms cubic-bezier(.16,1,.3,1) both" }}>
            <div style={{ flex: "none", padding: "12px 0 8px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 42, height: 4, borderRadius: 999, background: "var(--sand-400)" }} />
            </div>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, paddingBottom: 12 }}>
              {v.navRepForm && <IconButton icon="arrow-left" label="Back" tone="ghost" size="sm" onClick={v.navRepBack} />}
              <div style={{ font: "var(--type-heading)", letterSpacing: "var(--tracking-heading)", color: "var(--text-strong)", textWrap: "pretty" }}>{v.navRepTitle}</div>
              <div style={{ marginLeft: "auto" }}>
                <Button variant="ghost" size="sm" onClick={v.closeNavRep}>
                  Cancel
                </Button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 4 }}>
              {v.navRepPick && (
                <div>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", paddingBottom: 11, textWrap: "pretty" }}>Reported against your current step. Your trip keeps running.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                    {v.navRepTypes.map((t, i) => (
                      <button key={i} onClick={t.pick} style={styleText(t.style)}>
                        <span style={{ width: 30, height: 30, borderRadius: 999, background: "var(--accent-soft)", color: "var(--text-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name={t.icon} size={16} />
                        </span>
                        <span style={{ font: "var(--type-body-strong)", color: "var(--text-strong)", textWrap: "pretty" }}>{t.label}</span>
                        <span style={{ font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>+{t.pts} pts</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {v.navRepForm && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <SectionLabel>{v.navRepSevQ}</SectionLabel>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 9 }}>
                      {v.navRepSevs.map((s, i) => (
                        <button key={i} onClick={s.pick} style={styleText(s.style)}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <SectionLabel>Photo · taken now, not uploaded</SectionLabel>
                    {v.navCameraOpen && (
                      <div style={{ marginTop: 9 }}>
                        <CameraCapture onCapture={v.onNavCapture} onCancel={v.closeNavCamera} />
                      </div>
                    )}
                    {v.navRepNoPhoto && !v.navCameraOpen && (
                      <button onClick={v.openNavCamera} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, marginTop: 9, padding: "14px 15px", borderRadius: "var(--radius-card)", border: "1px dashed var(--sand-400)", background: "var(--accent-soft)", cursor: "pointer" }}>
                        <span style={{ flex: "none", width: 40, height: 40, borderRadius: 999, background: "var(--accent)", color: "var(--text-on-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="camera" size={19} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", font: "var(--type-body-strong)", color: "var(--text-strong)" }}>Open the camera</span>
                          {/* Was "faces are blurred automatically", which nothing did. */}
                          <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 3, textWrap: "pretty" }}>Photograph the problem, not people. Checked, then discarded.</span>
                        </span>
                      </button>
                    )}
                    {v.navRepHasPhoto && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 9 }}>
                        <div style={{ flex: "none", width: 66, height: 66, borderRadius: "var(--radius-sm,12px)", overflow: "hidden", background: "var(--sand-100)" }}>{v.navRepThumb}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: "var(--type-body-strong)", color: "var(--text-strong)" }}>Photo attached</div>
                          <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 3, textWrap: "pretty" }}>{v.navRepPhotoName}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {v.navRepForm && (
              <div style={{ flex: "none", paddingTop: 12 }}>
                <Button size="lg" fullWidth disabled={v.navRepNoPhoto || v.reportBusy} onClick={v.navRepPost}>
                  {v.navRepCta}
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
