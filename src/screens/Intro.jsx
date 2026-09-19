import { Icon, Button } from "../design-system";
import { styleText } from "../lib/styleText";
import { SolvikBrand } from "../components/SolvikBrand";

export function Intro({ v }) {
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
          <div style={{ animation: "sv-rise 420ms cubic-bezier(.16,1,.3,1) both" }}>
            <div style={{ font: "var(--weight-heavy) 38px/1.1 var(--font-display)", letterSpacing: "-.03em", color: "var(--text-strong)", textWrap: "pretty" }}>
              Your commute, minus the guesswork
            </div>
            <div style={{ font: "var(--type-body)", color: "var(--text-muted)", marginTop: 14, textWrap: "pretty" }}>
              Tell Solvik who you are and where you go. It then watches your lines, warns you before you leave, and routes around the crush.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 28 }}>
              {v.introPromises.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 15px", borderRadius: "var(--radius-card)", background: "var(--surface-card)", border: "1px solid var(--border-card)" }}>
                  <span style={{ flex: "none", width: 34, height: 34, borderRadius: 999, background: "var(--accent-soft)", color: "var(--text-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={p.icon} size={17} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", font: "var(--type-body-strong)", color: "var(--text-strong)" }}>{p.title}</span>
                    <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 3, textWrap: "pretty" }}>{p.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {v.introS1 && (
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
                      <span style={{ padding: "3px 7px", borderRadius: 999, background: r.id === "fixed" ? "var(--accent)" : "var(--sand-200)", color: r.id === "fixed" ? "var(--text-on-accent)" : "var(--text-muted)", font: "var(--weight-bold) 9px/1 var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase" }}>{r.badge}</span>
                    </span>
                    <span style={styleText(r.subStyle)}>{r.sub}</span>
                    <span style={{ display: "block", font: "var(--weight-bold) 11.5px/1.3 var(--font-body)", color: "var(--text-accent)", marginTop: 7 }}>{r.route}</span>
                    <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 2 }}>{r.schedule}</span>
                  </span>
                  <span style={styleText(r.checkStyle)}>
                    <Icon name="check" size={14} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {v.introS2 && (
          <div style={{ animation: "sv-rise 320ms cubic-bezier(.16,1,.3,1) both" }}>
            <div style={{ font: "var(--weight-heavy) 30px/1.15 var(--font-display)", letterSpacing: "-.028em", color: "var(--text-strong)", textWrap: "pretty" }}>{v.introJourney?.name}&apos;s journey</div>
            <div style={{ font: "var(--type-body)", color: "var(--text-muted)", marginTop: 10, textWrap: "pretty" }}>This is the door-to-door journey Solvik will plan immediately.</div>
            {v.introJourney && <div style={{ marginTop: 22, padding: 18, borderRadius: "var(--radius-card)", background: "var(--surface-card)", border: "1px solid var(--border-card)", boxShadow: "var(--shadow-card)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: "14px 12px", alignItems: "start" }}>
                <span style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--text-strong)", color: "var(--text-on-dark)" }}><Icon name="map-pin" size={14} /></span>
                <div><small style={{ font: "var(--type-label)", color: "var(--text-muted)", textTransform: "uppercase" }}>From</small><strong style={{ display: "block", font: "var(--type-body-strong)", color: "var(--text-strong)", marginTop: 2 }}>{v.introJourney.from}</strong></div>
                <span style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent)", color: "var(--text-on-accent)" }}><Icon name="flag" size={14} /></span>
                <div><small style={{ font: "var(--type-label)", color: "var(--text-muted)", textTransform: "uppercase" }}>To</small><strong style={{ display: "block", font: "var(--type-body-strong)", color: "var(--text-strong)", marginTop: 2 }}>{v.introJourney.to}</strong></div>
              </div>
              <div style={{ height: 1, background: "var(--border-card)", margin: "16px 0" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 9, font: "var(--type-body-strong)", color: "var(--text-strong)" }}><Icon name="clock-3" size={17} />{v.introJourney.schedule}</div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 10, font: "var(--type-caption)", color: "var(--text-muted)" }}><Icon name="route" size={16} style={{ flex: "none", marginTop: 1 }} /><span>{v.introJourney.expected}</span></div>
            </div>}
            {v.introJourney && <div style={{ marginTop: 12, padding: "13px 14px", borderRadius: "var(--radius-card)", background: "var(--accent-soft)", color: "var(--text-body)", font: "var(--type-caption)", textWrap: "pretty" }}><strong style={{ color: "var(--text-accent)" }}>Why this fit:</strong> {v.introJourney.fit}</div>}
            {v.introJourney && !v.introJourney.featured && <div style={{ marginTop: 10, padding: "13px 14px", borderRadius: "var(--radius-card)", background: "var(--sand-100)", color: "var(--text-muted)", font: "var(--type-caption)", textWrap: "pretty" }}><strong>Honest limitation:</strong> {v.introJourney.limitation}</div>}
          </div>
        )}

        {v.introS3 && (
          <div style={{ animation: "sv-rise 320ms cubic-bezier(.16,1,.3,1) both" }}>
            <div style={{ font: "var(--weight-heavy) 30px/1.15 var(--font-display)", letterSpacing: "-.028em", color: "var(--text-strong)", textWrap: "pretty" }}>{v.introSummaryTitle}</div>
            <div style={{ font: "var(--type-body)", color: "var(--text-muted)", marginTop: 10, textWrap: "pretty" }}>You can change any of this later in Plan.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
              {v.introSummary.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "14px 15px", borderRadius: "var(--radius-card)", background: "var(--surface-card)", border: "1px solid var(--border-card)" }}>
                  <span style={{ flex: "none", width: 26, height: 26, borderRadius: 999, background: "var(--accent)", color: "var(--text-on-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="check" size={14} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, font: "var(--type-body)", color: "var(--text-body)", textWrap: "pretty" }}>{l.text}</span>
                </div>
              ))}
            </div>
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
