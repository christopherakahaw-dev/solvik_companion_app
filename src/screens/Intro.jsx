import { useEffect, useRef, useState } from "react";
import { Icon, Button } from "../design-system";
import { styleText } from "../lib/styleText";
import { SolvikBrand } from "../components/SolvikBrand";
import { PlacePicker } from "../components/PlacePicker";

function formatArrivalTime(value) {
  const [rawHour, rawMinute] = String(value || "08:45").split(":");
  const hour = Number(rawHour) || 0;
  const minute = String(Number(rawMinute) || 0).padStart(2, "0");
  const period = hour >= 12 ? "pm" : "am";
  return `${String(hour % 12 || 12).padStart(2, "0")}:${minute} ${period}`;
}

function WheelColumn({ label, options, value, onChange }) {
  const scroller = useRef(null);
  const itemHeight = 42;
  const selectedIndex = Math.max(0, options.indexOf(value));

  useEffect(() => {
    scroller.current?.scrollTo({ top: selectedIndex * itemHeight, behavior: "auto" });
  }, [selectedIndex]);

  return (
    <div className="sv-arrival-wheel-column">
      <span>{label}</span>
      <div
        ref={scroller}
        className="sv-arrival-wheel"
        aria-label={label}
        onScroll={(event) => {
          const index = Math.max(0, Math.min(options.length - 1, Math.round(event.currentTarget.scrollTop / itemHeight)));
          if (options[index] !== value) onChange(options[index]);
        }}
      >
        <div className="sv-arrival-wheel-pad" aria-hidden="true" />
        {options.map((option) => (
          <button key={option} type="button" className={option === value ? "is-selected" : ""} onClick={() => onChange(option)}>{option}</button>
        ))}
        <div className="sv-arrival-wheel-pad" aria-hidden="true" />
      </div>
    </div>
  );
}

function ArrivalTimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "08:45");
  const [hour24, minute = "00"] = String(draft || "08:45").split(":");
  const hour = Number(hour24) || 0;
  const displayHour = hour % 12 || 12;
  const period = hour >= 12 ? "pm" : "am";
  const update = (nextHour = displayHour, nextMinute = minute, nextPeriod = period) => {
    const baseHour = Number(nextHour) % 12;
    const as24 = nextPeriod === "pm" ? baseHour + 12 : baseHour;
    setDraft(`${String(as24).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`);
  };

  useEffect(() => {
    if (!open) setDraft(value || "08:45");
  }, [value, open]);

  return (
    <div className="sv-arrival-time-picker">
      <button type="button" className="sv-arrival-time-trigger" aria-expanded={open} aria-haspopup="dialog" onClick={() => { setDraft(value || "08:45"); setOpen((shown) => !shown); }}>
        <span>{formatArrivalTime(open ? draft : value)}</span>
        <Icon name="clock-3" size={17} />
      </button>
      {open && (
        <div className="sv-arrival-time-menu" role="dialog" aria-label="Choose arrival time">
          <div className="sv-arrival-wheel-row">
            <WheelColumn label="Hour" options={Array.from({ length: 12 }, (_, index) => index + 1)} value={displayHour} onChange={(next) => update(next)} />
            <WheelColumn label="Minute" options={["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]} value={minute} onChange={(next) => update(displayHour, next)} />
            <WheelColumn label="Period" options={["am", "pm"]} value={period} onChange={(next) => update(displayHour, minute, next)} />
          </div>
          <button type="button" className="sv-arrival-time-done" onClick={() => { onChange(draft); setOpen(false); }}>Set arrival time</button>
        </div>
      )}
    </div>
  );
}

export function Intro({ v }) {
  const [editingFrom, setEditingFrom] = useState(false);
  const [editingTo, setEditingTo] = useState(false);
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--sand-50)", display: "flex", flexDirection: "column", padding: "54px 20px 22px" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 9 }}>
        <SolvikBrand />
        <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
          {v.introDots.map((d, i) => (
            <span key={i} style={d.style} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingTop: 26 }}>
        {v.introS0 && (
          <div style={{ animation: "sv-rise 320ms cubic-bezier(.16,1,.3,1) both" }}>
            <div style={{ font: "var(--weight-heavy) 30px/1.15 var(--font-display)", letterSpacing: "-.028em", color: "var(--text-strong)", textWrap: "pretty" }}>Choose your style</div>
            <div style={{ font: "var(--type-body)", color: "var(--text-muted)", marginTop: 10, textWrap: "pretty" }}>Solvik will open this route and explain why it fits this commuter better than the alternatives.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 22 }}>
              {v.introRoles.map((r) => (
                <button key={r.id} onClick={r.toggle} style={styleText(r.style)}>
                  <span style={styleText(r.iconStyle)}>
                    <Icon name={r.icon} size={17} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ font: "var(--type-body-strong)" }}>{r.label}</span>
                    </span>
                    <span style={styleText(r.subStyle)}>{r.sub}</span>
                    {r.route ? <span style={{ display: "block", font: "var(--weight-bold) 11.5px/1.3 var(--font-body)", color: "var(--text-accent)", marginTop: 7 }}>{r.route}</span> : null}
                    {r.schedule ? <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-muted)", marginTop: r.route ? 2 : 6 }}>{r.schedule}</span> : null}
                  </span>
                  <span style={styleText(r.checkStyle)}>
                    <Icon name="check" size={14} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {v.introS1 && v.introJourney?.isFixed && (
          <div style={{ animation: "sv-rise 320ms cubic-bezier(.16,1,.3,1) both" }}>
            <div style={{ font: "var(--weight-heavy) 30px/1.15 var(--font-display)", letterSpacing: "-.028em", color: "var(--text-strong)", textWrap: "pretty" }}>Fixed Schedule&apos;s journey</div>
            <div style={{ font: "var(--type-body)", color: "var(--text-muted)", marginTop: 10, textWrap: "pretty" }}>This is the door-to-door journey Solvik will plan immediately.</div>
            {v.introJourney && <div style={{ marginTop: 22, padding: 18, borderRadius: "var(--radius-card)", background: "var(--surface-card)", border: "1px solid var(--border-card)", boxShadow: "var(--shadow-card)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: "14px 12px", alignItems: "start" }}>
                <span style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--text-strong)", color: "var(--text-on-dark)" }}><Icon name="map-pin" size={14} /></span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <small style={{ font: "var(--type-label)", color: "var(--text-muted)", textTransform: "uppercase" }}>From</small>
                    <button
                      type="button"
                      onClick={() => setEditingFrom(!editingFrom)}
                      style={{ background: "none", border: "none", color: "var(--accent)", font: "var(--weight-semibold) 11.5px/1 var(--font-body)", cursor: "pointer", padding: "0 4px", textDecoration: "underline" }}
                    >
                      {editingFrom ? "Done" : "Change"}
                    </button>
                  </div>
                  {editingFrom ? (
                    <div style={{ marginTop: 6 }}>
                      <PlacePicker
                        value={null}
                        displayValue={v.introJourney.from === "-" ? "" : v.introJourney.from}
                        clearOnFocus
                        placeholder="Search origin location…"
                        icon="map-pin"
                        onChange={(place) => {
                          if (place) {
                            v.setIntroCustomFrom(place);
                            setEditingFrom(false);
                          }
                        }}
                        showDetails={false}
                      />
                    </div>
                  ) : (
                    <strong
                      onClick={() => setEditingFrom(true)}
                      style={{ display: "block", font: "var(--type-body-strong)", color: "var(--text-strong)", marginTop: 2, cursor: "pointer" }}
                      title="Click to change origin"
                    >
                      {v.introJourney.from}
                    </strong>
                  )}
                </div>

                <span style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent)", color: "var(--text-on-accent)" }}><Icon name="flag" size={14} /></span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <small style={{ font: "var(--type-label)", color: "var(--text-muted)", textTransform: "uppercase" }}>To</small>
                    <button
                      type="button"
                      onClick={() => setEditingTo(!editingTo)}
                      style={{ background: "none", border: "none", color: "var(--accent)", font: "var(--weight-semibold) 11.5px/1 var(--font-body)", cursor: "pointer", padding: "0 4px", textDecoration: "underline" }}
                    >
                      {editingTo ? "Done" : "Change"}
                    </button>
                  </div>
                  {editingTo ? (
                    <div style={{ marginTop: 6 }}>
                      <PlacePicker
                        value={null}
                        displayValue={v.introJourney.to === "-" ? "" : v.introJourney.to}
                        clearOnFocus
                        placeholder="Search destination…"
                        icon="flag"
                        onChange={(place) => {
                          if (place) {
                            v.setIntroCustomTo(place);
                            setEditingTo(false);
                          }
                        }}
                        showDetails={false}
                      />
                    </div>
                  ) : (
                    <strong
                      onClick={() => setEditingTo(true)}
                      style={{ display: "block", font: "var(--type-body-strong)", color: "var(--text-strong)", marginTop: 2, cursor: "pointer" }}
                      title="Click to change destination"
                    >
                      {v.introJourney.to}
                    </strong>
                  )}
                </div>
              </div>

              <div style={{ height: 1, background: "var(--border-card)", margin: "16px 0" }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, padding: "8px 12px", background: "var(--sand-100)", borderRadius: "var(--radius-card)" }}>
                <div style={{ font: "var(--type-body-strong)", color: "var(--text-strong)", display: "flex", alignItems: "center", gap: 6, fontSize: "13px" }}>
                  <Icon name="clock-3" size={15} />
                  <span>Change Arrive By:</span>
                </div>
                <ArrivalTimePicker value={v.introArriveByTime} onChange={v.setIntroArriveBy} />
              </div>
              {v.introJourney.schedule ? (
                <div style={{ display: "flex", alignItems: "center", gap: 9, font: "var(--type-body-strong)", color: "var(--text-strong)" }}>
                  <Icon name="clock-3" size={17} />
                  <span>{v.introJourney.schedule}</span>
                </div>
              ) : null}
              {v.introJourney.hasCalculatedTravel && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, font: "var(--type-caption)", color: "var(--text-accent)", marginTop: 4, marginLeft: 26 }}>
                  <span>{v.introCalculatingTravel ? "Calculating travel time…" : `Estimated ${v.introTravelMins} mins travel time`}</span>
                </div>
              )}
              {v.introJourney.expected ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 10, font: "var(--type-caption)", color: "var(--text-muted)" }}>
                  <Icon name="route" size={16} style={{ flex: "none", marginTop: 1 }} />
                  <span>{v.introJourney.expected}</span>
                </div>
              ) : null}
            </div>}
          </div>
        )}


      </div>

      <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: 9, paddingTop: 14 }}>
        {v.introError && <div className="sv-auth-notice sv-auth-notice-error" role="alert">{v.introError}</div>}
        {v.introInvalid && <div className="sv-place-detail" role="status">Select a search result or clear the unfinished address.</div>}
        <Button size="lg" fullWidth disabled={v.introDisabled} onClick={v.introNext}>
          {v.introCta}
        </Button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {v.introCanBack ? (
            <Button variant="ghost" size="sm" iconLeft="arrow-left" onClick={v.introBack}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {v.introCanSkip && <div style={{ marginLeft: "auto" }}>
            <Button variant="ghost" size="sm" onClick={v.introSkip}>
              Skip for now
            </Button>
          </div>}
        </div>
      </div>
    </div>
  );
}
