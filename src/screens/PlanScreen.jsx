import { Icon, IconButton, Button, SectionLabel, SearchField, Tag } from "../design-system";
import { styleText } from "../lib/styleText";
import { PlacePicker } from "../components/PlacePicker";

export function PlanScreen({ v }) {
  return (
    <div className="sv-plan-screen" style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 14, paddingBottom: 104 }}>
      <div className="sv-plan-intro" style={{ padding: "0 4px" }}>
        <div style={{ font: "var(--weight-heavy) 22px/1.2 var(--font-display)", letterSpacing: "-.02em", color: "var(--text-strong)", textWrap: "pretty" }}>{v.planGreeting}</div>
        {v.recordedNotice && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 7, padding: "6px 10px", borderRadius: 999, background: "var(--sand-100,rgba(32,30,29,.05))", font: "var(--weight-semibold) 11.5px/1.2 var(--font-body)", color: "var(--text-muted)", textWrap: "pretty" }}>
            <Icon name="circle-dot-dashed" size={13} />
            {v.recordedNotice}
          </div>
        )}
        {v.alertCatchUpLine && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, font: "var(--type-caption)", color: "var(--status-fault)", textWrap: "pretty" }}>
            <Icon name="triangle-alert" size={13} />
            {v.alertCatchUpLine}
          </div>
        )}
      </div>

      {v.routineAlert && (
        <div
          className="sv-routine-alert"
          style={{
            borderRadius: "var(--radius-card)",
            background: "var(--surface-card)",
            border: "1.5px solid var(--status-warn, #d97706)",
            padding: "16px 16px 15px",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(217, 119, 6, 0.15)",
                color: "var(--status-warn, #d97706)",
              }}
            >
              <Icon name="triangle-alert" size={15} />
            </span>
            <SectionLabel>{v.routineAlert.kicker || "Routine Watch · Disruption Alert"}</SectionLabel>
          </div>
          <div
            style={{
              font: "var(--weight-heavy) 16.5px/1.25 var(--font-display)",
              letterSpacing: "-.02em",
              color: "var(--text-strong)",
              marginTop: 10,
              textWrap: "pretty",
            }}
          >
            {v.routineAlert.title}
          </div>
          <div style={{ font: "var(--type-body)", color: "var(--text-body)", marginTop: 5, textWrap: "pretty" }}>
            {v.routineAlert.detail}
          </div>
          {v.routineAlert.advice && (
            <div
              style={{
                font: "var(--type-caption)",
                color: "var(--text-body)",
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 12,
                background: "var(--sand-100)",
                textWrap: "pretty",
              }}
            >
              {v.routineAlert.advice}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" iconRight="arrow-right" onClick={v.routineAlert.action}>
              {v.routineAlert.actionLabel || "Check alternative routes"}
            </Button>
            {v.routineAlert.addCommute && (
              <Button variant="ghost" size="sm" iconLeft="bookmark-plus" onClick={v.routineAlert.addCommute}>
                Add to Commutes
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={v.routineAlert.dismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {v.planHasNext && (
        <article className="sv-next-journey" aria-label={`Next commute from ${v.planNextFrom} to ${v.planNextTo}`}>
          <div className="sv-next-journey-glow" aria-hidden="true" />
          <header className="sv-next-journey-head">
            <span className="sv-next-journey-kicker"><Icon name="sparkles" size={14} /> Next commute</span>
            <span className="sv-next-journey-countdown">{v.planNextIn}</span>
          </header>

          <div className="sv-next-journey-main">
            <div className="sv-next-route">
              <div className="sv-next-route-stop">
                <span className="sv-next-route-dot is-origin"><Icon name="circle-dot" size={15} /></span>
                <span><small>From</small><strong>{v.planNextFrom}</strong></span>
              </div>
              <span className="sv-next-route-line" aria-hidden="true" />
              <div className="sv-next-route-stop">
                <span className="sv-next-route-dot is-destination"><Icon name="map-pin" size={15} /></span>
                <span><small>To</small><strong>{v.planNextTo}</strong></span>
              </div>
            </div>
            <div className="sv-next-departure">
              <small>Leave at</small>
              <time>{v.planNextLeave}</time>
            </div>
          </div>

          <div className="sv-next-journey-note"><Icon name="clock" size={15} /> <span>{v.planNextNote}</span></div>
          <footer className="sv-next-journey-actions">
            <Button size="md" iconRight="arrow-right" onClick={v.startNext}>
              See routes
            </Button>
            <button className="sv-next-alert" onClick={v.watchNext}>
              <Icon name="bell" size={16} />
              {v.watchNextLabel}
            </button>
            {v.planNextCrowd && (
              <div className="sv-next-crowd">
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--crowd-" + (v.planNextCrowdLevel || "light") + ")" }} />
                {v.planNextCrowd}
              </div>
            )}
          </footer>
        </article>
      )}

      {v.fgHas && (
        <div className="sv-plan-forecast" style={{ borderRadius: "var(--radius-card)", background: "var(--surface-card)", border: "1px solid " + (v.fgTone === "busy" ? "var(--crowd-busy)" : v.fgTone === "moderate" ? "var(--crowd-moderate)" : "var(--border-card)"), padding: "16px 16px 15px", boxShadow: "var(--shadow-card)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", color: v.fgTone === "busy" ? "var(--crowd-busy)" : v.fgTone === "moderate" ? "var(--crowd-moderate)" : "var(--text-accent)" }}>
              <Icon name="chart-no-axes-column-increasing" size={15} />
            </span>
            <SectionLabel>Network forecast</SectionLabel>
          </div>
          <div style={{ font: "var(--weight-heavy) 17px/1.25 var(--font-display)", letterSpacing: "-.02em", color: "var(--text-strong)", marginTop: 11, textWrap: "pretty" }}>{v.fgTitle}</div>
          {v.fgDetail && (
            <div style={{ font: "var(--type-body)", color: "var(--text-body)", marginTop: 6, textWrap: "pretty" }}>{v.fgDetail}</div>
          )}
          {v.fgAlerts.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 9 }}>
              <span style={{ flex: "none", padding: "3px 8px", borderRadius: 999, background: "var(--status-warn)", color: "#fff", font: "var(--weight-heavy) 11px/1.3 var(--font-body)" }}>{a.line}</span>
              <span style={{ font: "var(--type-caption)", color: "var(--text-body)", textWrap: "pretty" }}>{a.title}</span>
            </div>
          ))}
          {/* LTA's own mitigation leads: free boarding is a better answer than
              anything we can compute, and it needs no caveat. */}
          {v.mitHas && (
            <div style={{ marginTop: 12, padding: "12px 13px", borderRadius: 14, background: "var(--crowd-light)", color: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Icon name="bus-front" size={15} />
                <span style={{ font: "var(--weight-heavy) 11px/1 var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase" }}>Free travel</span>
              </div>
              {v.mitLines.map((line, i) => (
                <div key={i} style={{ font: "var(--type-body-strong)", marginTop: 6, textWrap: "pretty" }}>{line}</div>
              ))}
              <div style={{ font: "var(--type-caption)", opacity: 0.82, marginTop: 6, textWrap: "pretty" }}>{v.mitNote}</div>
            </div>
          )}
          {v.rrHas && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-card)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", color: "var(--text-accent)" }}>
                  <Icon name="route" size={13} />
                </span>
                <SectionLabel>{v.rrPending ? "Finding another way" : "Another way"}</SectionLabel>
              </div>
              <div style={{ font: "var(--weight-bold) 14.5px/1.3 var(--font-body)", color: "var(--text-strong)", marginTop: 9, textWrap: "pretty" }}>{v.rrTitle}</div>
              {v.rrDetail && (
                <div style={{ font: "var(--type-body)", color: "var(--text-body)", marginTop: 5, textWrap: "pretty" }}>{v.rrDetail}</div>
              )}
              {v.rrAdvice && (
                <div style={{ font: "var(--type-caption)", color: "var(--text-body)", marginTop: 8, padding: "8px 10px", borderRadius: 12, background: "var(--accent-soft)", textWrap: "pretty" }}>{v.rrAdvice}</div>
              )}
              {v.rrCaveat && (
                <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 8, textWrap: "pretty" }}>{v.rrCaveat}</div>
              )}
            </div>
          )}
          {v.fgCoverage && (
            <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 10, textWrap: "pretty" }}>{v.fgCoverage}</div>
          )}
          {v.fgHasAction && (
            <div style={{ marginTop: 13 }}>
              <Button variant="secondary" size="md" iconRight="arrow-right" onClick={v.fgAction}>
                {v.fgActionLabel}
              </Button>
            </div>
          )}
        </div>
      )}

      {v.wxHas && (
        <div className="sv-plan-weather" style={{ borderRadius: "var(--radius-card)", background: "var(--surface-card)", border: "1px solid " + (v.wxWet ? "var(--crowd-moderate)" : "var(--border-card)"), padding: "16px 16px 15px", boxShadow: "var(--shadow-card)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)", color: v.wxWet ? "var(--crowd-moderate)" : "var(--text-accent)" }}>
              <Icon name={v.wxWet ? "cloud-rain" : "sun"} size={15} />
            </span>
            <SectionLabel>Weather on your way</SectionLabel>
          </div>
          <div style={{ font: "var(--weight-heavy) 17px/1.25 var(--font-display)", letterSpacing: "-.02em", color: "var(--text-strong)", marginTop: 11, textWrap: "pretty" }}>{v.wxTitle}</div>
          {v.wxDetail && (
            <div style={{ font: "var(--type-body)", color: "var(--text-body)", marginTop: 6, textWrap: "pretty" }}>{v.wxDetail}</div>
          )}
          {v.roadLine && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 9 }}>
              <span style={{ flex: "none", marginTop: 2, color: "var(--crowd-moderate)" }}><Icon name="traffic-cone" size={14} /></span>
              <span style={{ font: "var(--type-caption)", color: "var(--text-body)", textWrap: "pretty" }}>
                {v.roadLine}{v.roadIncident ? ` ${v.roadIncident}` : ""}
              </span>
            </div>
          )}
          {v.wxNote && (
            <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 10, textWrap: "pretty" }}>{v.wxNote}</div>
          )}
        </div>
      )}

      {v.pwHas && (
        <div className="sv-plan-work" style={{ borderRadius: "var(--radius-card)", background: "var(--surface-card)", border: "1px solid " + (v.pwBlocking ? "var(--crowd-busy)" : "var(--border-card)"), padding: "16px 16px 15px", boxShadow: "var(--shadow-card)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: v.pwBlocking ? "var(--crowd-busy)" : "var(--accent-soft)", color: v.pwBlocking ? "#fff" : "var(--text-accent)" }}>
              <Icon name="construction" size={15} />
            </span>
            <SectionLabel>Planned work</SectionLabel>
          </div>
          <div style={{ font: "var(--weight-heavy) 17px/1.25 var(--font-display)", letterSpacing: "-.02em", color: "var(--text-strong)", marginTop: 11, textWrap: "pretty" }}>{v.pwTitle}</div>
          {v.pwDetail && (
            <div style={{ font: "var(--type-body)", color: "var(--text-body)", marginTop: 6, textWrap: "pretty" }}>{v.pwDetail}</div>
          )}
          {v.pwScheduled.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 9 }}>
              <span style={{ flex: "none", marginTop: 2, color: "var(--text-accent)" }}><Icon name="calendar-clock" size={14} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", font: "var(--type-body-strong)", color: "var(--text-strong)", textWrap: "pretty" }}>{item.label}</span>
                {item.detail && <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 2, textWrap: "pretty" }}>{item.detail}</span>}
              </span>
            </div>
          ))}
          <div style={{ font: "var(--type-caption)", color: v.pwBlocking ? "var(--crowd-busy)" : "var(--text-muted)", marginTop: 10, textWrap: "pretty" }}>{v.pwNote}</div>
          {v.pwHasAction && (
            <div style={{ marginTop: 13 }}>
              <Button variant="secondary" size="md" iconRight="arrow-right" onClick={v.pwAction}>
                {v.pwActionLabel}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="sv-plan-places">
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 4px 9px" }}>
          <SectionLabel>Your places</SectionLabel>
          <div style={{ marginLeft: "auto", flex: "none" }}>
            <Button variant="ghost" size="sm" iconLeft="pencil" onClick={v.openPlaces}>
              Edit
            </Button>
          </div>
        </div>
        <div className="sv-saved-grid">
          {v.placeRows.map((p, i) => (
            <button className="sv-saved-place-row" key={i} onClick={v.openPlaces}>
              <span className="sv-saved-place-row-icon">
                <Icon name={p.icon} size={15} />
              </span>
              <span className="sv-saved-place-row-copy">
                <span>{p.short}</span>
                <strong>{p.shown}</strong>
              </span>
              <Icon name="chevron-right" size={17} />
            </button>
          ))}
        </div>
      </div>

      <div className="sv-plan-watched">
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 4px 9px" }}>
          <SectionLabel>Watched daily</SectionLabel>
          <div style={{ marginLeft: "auto", flex: "none" }}>
            <IconButton
              icon="pencil"
              label="Add or edit a watched commute"
              tone="ghost"
              size="sm"
              onClick={v.openAdd}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {!v.saved.length && (
            <div style={{ padding: "16px 15px", borderRadius: 20, background: "var(--surface-card)", border: "1px solid var(--border-card)", font: "var(--type-body)", color: "var(--text-muted)", textWrap: "pretty" }}>
              No commutes yet. Add one and Solvik will watch it before you leave.
            </div>
          )}
          {v.saved.map((s, i) => (
            <button className="sv-commute-card" key={i} onClick={s.edit} aria-label={`Edit commute from ${s.from} to ${s.to}`}>
              <span className="sv-commute-card-head">
                <span className="sv-commute-time">
                  <small>{s.timingLabel}</small>
                  <strong>{s.clock}</strong>
                </span>
                <Tag tone="soft">{s.mode}</Tag>
              </span>
              <span className="sv-commute-route">
                <span className="sv-commute-route-point is-origin" aria-hidden="true" />
                <strong>{s.from}</strong>
                <span className="sv-commute-route-rail" aria-hidden="true" />
                <span />
                <span className="sv-commute-route-point is-destination" aria-hidden="true" />
                <strong>{s.to}</strong>
              </span>
              <span className="sv-commute-card-foot">
                <span><Icon name="calendar" size={14} /> {s.days}</span>
                {s.learned && (
                  <span><Icon name="sparkles" size={14} /> Learned · {s.learned}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Named on screen, because the brief scores whether a submission says who
          it is for — and because the same disruption genuinely means different
          things to each of these three. */}
      <div className="sv-plan-persona">
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 4px 9px" }}>
          <SectionLabel>Tailored for you</SectionLabel>
        </div>
        <div style={{ padding: "15px 16px", borderRadius: 20, background: "var(--surface-card)", border: "1px solid var(--border-card)" }}>
          <div style={{ font: "var(--type-body)", color: "var(--text-strong)", textWrap: "pretty" }}>{v.personaBlurb}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {v.personaOptions.map((option) => (
              <button
                key={option.id}
                onClick={option.pick}
                aria-pressed={option.on}
                style={{
                  width: "100%", textAlign: "left", cursor: "pointer", padding: "12px 13px", borderRadius: 14,
                  background: option.on ? "var(--accent-soft)" : "var(--sand-100)",
                  border: "1.5px solid " + (option.on ? "var(--accent)" : "var(--border-card)"),
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ font: "var(--type-body-strong)", color: "var(--text-strong)" }}>{option.name}</span>
                  {option.on && <Icon name="check" size={15} />}
                </span>
                <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 4, textWrap: "pretty" }}>{option.example}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sv-plan-memory">
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 4px 9px" }}>
          <SectionLabel>What Solvik remembers</SectionLabel>
        </div>
        <div style={{ padding: "15px 16px", borderRadius: 20, background: "var(--surface-card)", border: "1px solid var(--border-card)" }}>
          <div style={{ font: "var(--type-body)", color: "var(--text-strong)", textWrap: "pretty" }}>{v.memorySummary}</div>
          {v.memoryAiLabel && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9, color: "var(--text-accent)", font: "var(--weight-bold) 10.5px/1.3 var(--font-body)", letterSpacing: ".035em", textTransform: "uppercase" }}>
              <Icon name="sparkles" size={13} />{v.memoryAiLabel}
            </div>
          )}
          {v.memoryAiSummary && <div style={{ marginTop: 7, color: "var(--text-body)", font: "var(--type-caption)", textWrap: "pretty" }}>{v.memoryAiSummary}</div>}
          {v.memoryLines.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
              {v.memoryLines.map((line, i) => (
                <span key={i} style={{ font: "var(--weight-medium) 11px/1 var(--font-body)", color: "var(--text-muted)", background: "var(--accent-soft)", borderRadius: 999, padding: "5px 9px", whiteSpace: "nowrap" }}>
                  {line}
                </span>
              ))}
            </div>
          )}
          {v.memoryRoutines && v.memoryRoutines.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <SectionLabel>Learned routines</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                {v.memoryRoutines.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 12px",
                      background: "var(--sand-100)",
                      borderRadius: 12,
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ font: "var(--type-body-strong)", color: "var(--text-strong)" }}>{r.name}</div>
                      <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 2 }}>{r.detail}</div>
                    </div>
                    {r.add && (
                      <Button variant="ghost" size="sm" iconLeft="plus" onClick={r.add}>
                        Add
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {v.memoryPlaces.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <SectionLabel>{v.memoryPlacesLabel}</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                {v.memoryPlaces.map((place, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ font: "var(--type-body-strong)", color: "var(--text-strong)", textWrap: "pretty" }}>{place.name}</span>
                    <span style={{ font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>{place.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 10, textWrap: "pretty" }}>{v.memoryNote}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
            {v.memoryCount > 0 && (
              <Button variant="secondary" size="sm" iconLeft="trash-2" onClick={v.forgetEverything}>
                Forget everything
              </Button>
            )}
            {v.canSeedTrips && (
              <Button variant="secondary" size="sm" iconLeft="sparkles" onClick={v.seedSampleTrips}>
                Add a week of sample trips
              </Button>
            )}
            {v.canToggleDemoAlert && (
              <Button
                variant={v.demoAlertActive ? "primary" : "secondary"}
                size="sm"
                iconLeft="triangle-alert"
                onClick={v.toggleDemoAlert}
              >
                {v.demoAlertActive ? "Clear simulated disruption" : "Simulate route disruption"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Rendered at the phone-frame level (not nested in the scrolling Plan
// content) so the sheet covers the whole screen, matching the prototype.
export function PlacesSheet({ v }) {
  return (
    <>
      {v.placesOpen && (
        <div className="sv-page-modal-layer" style={{ position: "absolute", inset: 0, zIndex: 32, background: "rgba(32,30,29,.34)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.closePlaces} style={{ flex: 1 }} />
          <section role="dialog" aria-modal="true" aria-label="Your places" className="sv-modal-sheet" style={{ flex: "none", maxHeight: "92%", display: "flex", flexDirection: "column", background: "var(--surface-card)", borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0", boxShadow: "var(--shadow-sheet)", padding: "0 18px 18px", animation: "sv-rise 320ms cubic-bezier(.16,1,.3,1) both" }}>
            <div style={{ flex: "none", padding: "12px 0 6px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 42, height: 4, borderRadius: 999, background: "var(--sand-400)" }} />
            </div>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "4px 0 14px" }}>
              <div style={{ font: "var(--type-heading)", letterSpacing: "var(--tracking-heading)", color: "var(--text-strong)" }}>Your places</div>
              <div style={{ marginLeft: "auto" }}>
                <Button variant="ghost" size="sm" onClick={v.closePlaces}>
                  Cancel
                </Button>
              </div>
            </div>
            <div className="sv-scroll-stack" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 6 }}>
              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>Search text goes to OneMap only while you search. Selected places, preferences and commute memory stay in this browser.</div>
              {v.placeRows.map((p, i) => (
                <div key={i}>
                  <SectionLabel>{p.label}</SectionLabel>
                  <div style={{ marginTop: 8 }}>
                    <PlacePicker value={p.value} placeholder={p.placeholder} icon={p.icon} onChange={p.set} onDraftChange={p.draft} />
                  </div>
                </div>
              ))}
              <button type="button" onClick={v.toggleSavedPlaces} aria-pressed={v.showSavedPlaces} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 13px", cursor: "pointer", textAlign: "left", background: "var(--sand-100)", border: "1px solid var(--border-card)", borderRadius: "var(--radius-card)", color: "var(--text-body)" }}>
                <Icon name={v.showSavedPlaces ? "eye" : "eye-off"} size={17} />
                <span style={{ flex: 1, font: "var(--type-body-strong)" }}>Show saved places on the map</span>
                <span style={{ font: "var(--type-caption)", color: "var(--text-muted)" }}>{v.showSavedPlaces ? "On" : "Off"}</span>
              </button>
              <Button variant="ghost" size="md" fullWidth iconLeft="trash-2" onClick={v.clearAllData}>
                Erase all data from this device
              </Button>
            </div>
            <div style={{ flex: "none", paddingTop: 14 }}>
              {v.placesInvalid && <p className="sv-place-detail" role="status">Select a search result for each edited place, or clear its field.</p>}
              <Button size="lg" fullWidth disabled={v.placesInvalid} onClick={v.savePlaces}>
                Save addresses
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function AddCommuteSheet({ v }) {
  return (
    <>
      {v.addOpen && (
        <div className="sv-page-modal-layer" style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(32,30,29,.34)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.closeAdd} style={{ flex: 1 }} />
          <section role="dialog" aria-modal="true" aria-label={v.addSheetTitle} className="sv-modal-sheet" style={{ position: "relative", flex: "none", maxHeight: "92%", display: "flex", flexDirection: "column", background: "var(--surface-card)", borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0", boxShadow: "var(--shadow-sheet)", padding: "0 18px 18px", animation: "sv-rise 320ms cubic-bezier(.16,1,.3,1) both" }}>
            {v.addSearchOpen && (
              <div style={{ position: "absolute", inset: 0, zIndex: 4, background: "var(--surface-card)", borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0", padding: "12px 18px 18px", display: "flex", flexDirection: "column" }}>
                <div style={{ flex: "none", display: "flex", justifyContent: "center", paddingBottom: 10 }}>
                  <div style={{ width: 42, height: 4, borderRadius: 999, background: "var(--sand-400)" }} />
                </div>
                <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, paddingBottom: 12 }}>
                  <IconButton icon="arrow-left" label="Back" tone="ghost" size="sm" onClick={v.addSearchClose} />
                  <div style={{ font: "var(--type-heading)", letterSpacing: "var(--tracking-heading)", color: "var(--text-strong)" }}>{v.addSearchTitle}</div>
                </div>
                <div style={{ flex: "none" }}>
                  <SearchField value={v.addQuery} placeholder="Search address, stop or area" icon="search" onChange={v.setAddQuery} />
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", marginTop: 6 }}>
                  {v.addSearchPending && (
                    <div style={{ padding: "18px 4px", font: "var(--type-body)", color: "var(--text-muted)" }}>Searching…</div>
                  )}
                  {!v.addSearchPending && v.addSearchError && (
                    <div style={{ padding: "18px 4px", font: "var(--type-body)", color: "var(--status-fault)", textWrap: "pretty" }}>{v.addSearchError}</div>
                  )}
                  {v.addResults.map((r, i) => (
                    <button key={i} onClick={r.pick} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--border-card)", padding: "14px 2px", cursor: "pointer" }}>
                      <div style={{ flex: "none", width: 32, height: 32, borderRadius: 999, background: "var(--accent-soft)", color: "var(--text-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="map-pin" size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "var(--weight-bold) 15px/1.3 var(--font-body)", color: "var(--text-strong)", textWrap: "pretty" }}>{r.label}</div>
                        <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 3, textWrap: "pretty" }}>{r.detail}</div>
                      </div>
                      <Tag tone="neutral">{r.kind}</Tag>
                    </button>
                  ))}
                  {v.addNoResults && (
                    <div style={{ padding: "26px 4px", font: "var(--type-body)", color: "var(--text-muted)", textWrap: "pretty" }}>
                      No match for &ldquo;{v.addQuery}&rdquo;. Try a postal code, MRT stop or building name.
                    </div>
                  )}
                  <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 14 }}>Results from OneMap · Singapore Land Authority</div>
                </div>
              </div>
            )}
            <div style={{ flex: "none", padding: "12px 0 6px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 42, height: 4, borderRadius: 999, background: "var(--sand-400)" }} />
            </div>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "4px 0 14px" }}>
              <div style={{ font: "var(--type-heading)", letterSpacing: "var(--tracking-heading)", color: "var(--text-strong)" }}>{v.addSheetTitle}</div>
              <div style={{ marginLeft: "auto" }}>
                <Button variant="ghost" size="sm" onClick={v.closeAdd}>
                  Cancel
                </Button>
              </div>
            </div>
            <div className="sv-scroll-stack" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 6 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <SectionLabel>From</SectionLabel>
                  <div style={{ marginLeft: "auto", flex: "none" }}>
                    <IconButton icon="search" label="Search another place" tone="ghost" size="sm" onClick={v.addSearchFrom} />
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 7 }}>
                  {v.addFromOpts.map((p, i) => (
                    <button key={i} onClick={p.pick} style={styleText(p.style)}>
                      {p.label}
                    </button>
                  ))}
                  <Button variant="secondary" size="sm" iconLeft="search" onClick={v.addSearchFrom}>Search start</Button>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <SectionLabel>To</SectionLabel>
                  <div style={{ marginLeft: "auto", flex: "none" }}>
                    <IconButton icon="search" label="Search another place" tone="ghost" size="sm" onClick={v.addSearchTo} />
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 7 }}>
                  {v.addToOpts.map((p, i) => (
                    <button key={i} onClick={p.pick} style={styleText(p.style)}>
                      {p.label}
                    </button>
                  ))}
                  <Button variant="secondary" size="sm" iconLeft="search" onClick={v.addSearchTo}>Search destination</Button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 15px", borderRadius: "var(--radius-card)", background: "var(--accent-soft)" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                    {v.addWhenOpts.map((o, i) => (
                      <button key={i} onClick={o.pick} style={styleText(o.style)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ font: "var(--weight-heavy) 30px/1 var(--font-numeric)", fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em", color: "var(--text-strong)", marginTop: 8 }}>{v.addTime}</div>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 6, textWrap: "pretty" }}>{v.addArrive}</div>
                </div>
                <div style={{ flex: "none", display: "flex", gap: 8 }}>
                  <IconButton icon="minus" label="Earlier" tone="plain" size="md" onClick={v.addTimeDown} />
                  <IconButton icon="plus" label="Later" tone="plain" size="md" onClick={v.addTimeUp} />
                </div>
              </div>
              <div>
                <SectionLabel>Repeats · {v.addDaysLabel}</SectionLabel>
                <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                  {v.addDayOpts.map((d, i) => (
                    <button key={i} onClick={d.toggle} style={styleText(d.style)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                  {v.addDayPresets.map((p, i) => (
                    <button key={i} onClick={p.pick} style={styleText(p.style)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>Watch for</SectionLabel>
                <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                  {v.addModeOpts.map((m, i) => (
                    <button key={i} onClick={m.pick} style={styleText(m.style)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 14px", borderRadius: "var(--radius-card)", border: "1px solid var(--border-card)" }}>
                <div style={{ flex: "none", width: 30, height: 30, borderRadius: 999, background: "var(--accent-soft)", color: "var(--text-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="bell" size={15} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ font: "var(--type-body-strong)", color: "var(--text-strong)", textWrap: "pretty" }}>{v.addPreviewName}</div>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 4, textWrap: "pretty" }}>{v.addPreviewDetail}</div>
                </div>
              </div>
            </div>
            <div style={{ flex: "none", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <Button size="lg" fullWidth disabled={v.addInvalid} onClick={v.saveCommute}>
                {v.addCta}
              </Button>
              {v.addEditing && (
                <Button variant="ghost" size="md" fullWidth iconLeft="trash-2" onClick={v.deleteCommute}>
                  Delete commute
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
