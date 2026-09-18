import { Icon, IconButton, Card, SectionLabel, TogglePill, Button } from "../design-system";
import { CameraCapture } from "../components/CameraCapture";
import { styleText } from "../lib/styleText";

export function ReportScreen({ v }) {
  return (
    <div className="sv-report-screen" style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 14 }}>
      {v.reportPick && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ position: "relative", overflow: "hidden", background: "var(--surface-dark)", color: "var(--text-on-dark)", borderRadius: "var(--radius-card)", padding: "16px 17px", display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ position: "absolute", right: -30, top: -40, width: 130, height: 130, borderRadius: 999, background: "rgba(255,255,255,.06)" }} />
            <div style={{ position: "relative", flex: "none", width: 40, height: 40, borderRadius: 999, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="radar" size={20} />
            </div>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--crowd-busy)", animation: "sv-ping 1.8s var(--ease-standard) infinite" }} />
                <span style={{ font: "var(--weight-bold) 11px/1 var(--font-body)", letterSpacing: ".07em", textTransform: "uppercase", opacity: 0.8 }}>{v.locEyebrow}</span>
              </div>
              <div style={{ font: "var(--weight-heavy) 18px/1.25 var(--font-display)", letterSpacing: "-.02em", marginTop: 7 }}>{v.locStopName}</div>
              <div style={{ font: "var(--type-caption)", opacity: 0.72, marginTop: 4, textWrap: "pretty" }}>{v.locDetail}</div>
            </div>
            <button onClick={v.locRecheck} style={{ position: "relative", flex: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, background: "rgba(255,255,255,.14)", border: "none", color: "var(--text-on-dark)", cursor: "pointer", font: "var(--weight-bold) 12px/1 var(--font-body)" }}>
              <Icon name="crosshair" size={14} />
              {v.locRecheckLabel}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {v.reportTypes.map((t, i) => (
              <Card key={i} tone={t.tone} padding="tight" interactive onClick={t.pick}>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={t.iconStyle}>
                    <Icon name={t.icon} size={17} />
                  </div>
                  <div style={{ font: "var(--type-body-strong)", color: "var(--text-strong)", textWrap: "pretty" }}>{t.label}</div>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>{t.sub}</div>
                  <div style={t.ptsStyle}>+{t.pts} pts</div>
                </div>
              </Card>
            ))}
          </div>

          <Card tone="plain">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <SectionLabel>Nearby · last 30 min</SectionLabel>
            </div>
            <div style={{ font: "var(--type-caption)", color: v.reportsError ? "var(--status-fault)" : "var(--text-muted)", marginTop: 7, textWrap: "pretty" }}>{v.reportsNote}</div>
            {v.reportsPending && (
              <div style={{ font: "var(--type-body)", color: "var(--text-muted)", padding: "14px 0" }}>Checking what people are reporting…</div>
            )}
            {v.reportsEmpty && (
              <div style={{ font: "var(--type-body)", color: "var(--text-muted)", padding: "14px 0", textWrap: "pretty" }}>Nobody has reported anything nearby in the last 30 minutes.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 10 }}>
              {v.recentReports.map((r) => (
                <div key={r.key} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 0", borderTop: "1px solid var(--border-card)" }}>
                  <div style={{ ...r.dotStyle, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "var(--type-body)", color: "var(--text-body)", textWrap: "pretty" }}>{r.text}</div>
                    {/* The count and the "not yet confirmed" half, together —
                        one without the other is how a rumour reads as a notice. */}
                    <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 3, textWrap: "pretty" }}>{r.line}</div>
                    <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{r.ago} ago</div>
                  </div>
                  <span style={styleText(r.tierStyle)}>{r.tier}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {v.reportConfirm && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Button variant="ghost" size="sm" iconLeft="arrow-left" onClick={v.backToPick}>
            Change
          </Button>
          <Card tone="plain">
            <div style={{ font: "var(--type-heading)", letterSpacing: "var(--tracking-heading)", color: "var(--text-strong)" }}>{v.chosenLabel}</div>
            <div style={{ font: "var(--type-body)", color: "var(--text-muted)", marginTop: 6 }}>{v.locStopName} · stays live 30 min</div>
            <div style={{ height: 14 }} />
            <SectionLabel>{v.severityQ}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {v.severities.map((s, i) => (
                <TogglePill key={i} pressed={s.on} onChange={s.pick} fullWidth>
                  {s.label}
                </TogglePill>
              ))}
            </div>
          </Card>
          <Card tone="plain">
            <SectionLabel>Photo · taken now, not uploaded</SectionLabel>
            {v.cameraOpen && (
              <div style={{ marginTop: 10 }}>
                <CameraCapture onCapture={v.onCapture} onCancel={v.closeCamera} />
              </div>
            )}
            {v.noPhoto && !v.cameraOpen && (
              <button onClick={v.openCamera} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 10, padding: "26px 16px", borderRadius: "var(--radius-card)", border: "1px dashed var(--sand-400)", background: "var(--accent-soft)", cursor: "pointer", textAlign: "center" }}>
                <span style={{ width: 46, height: 46, borderRadius: 999, background: "var(--accent)", color: "var(--text-on-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="camera" size={22} />
                </span>
                <span style={{ font: "var(--type-body-strong)", color: "var(--text-strong)" }}>Open the camera</span>
                {/* The old copy said faces were blurred automatically. Nothing
                    blurred anything, so it says what is true instead. */}
                <span style={{ font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>The photo has to be taken here, now — it can't be chosen from your files. If Gemini is enabled, it is sent to Google for this check, then discarded.</span>
              </button>
            )}
            {v.hasPhoto && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                <div style={{ flex: "none", width: 84, height: 84, borderRadius: "var(--radius-sm,12px)", overflow: "hidden", background: "var(--sand-100)" }}>{v.photoThumb}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "var(--type-body-strong)", color: "var(--text-strong)" }}>Photo attached</div>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 3, textWrap: "pretty" }}>{v.photoName}</div>
                </div>
                <IconButton icon="x" label="Remove photo" tone="ghost" size="sm" onClick={v.clearPhoto} />
              </div>
            )}
          </Card>
          <Button size="lg" fullWidth disabled={v.noPhoto || v.reportBusy} onClick={v.submitReport}>
            {v.reportCta}
          </Button>
          <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", textAlign: "center", textWrap: "pretty" }}>The report is saved only in this browser. The photo may be checked by Google Gemini, then discarded and never stored by Solvik.</div>
        </div>
      )}

      {v.reportDone && (
        <div style={{ paddingTop: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: v.reportAccepted ? "var(--accent)" : "var(--status-fault)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={v.reportAccepted ? "check" : "x"} size={34} />
          </div>
          <div style={{ font: "var(--type-title)", letterSpacing: "var(--tracking-title)", color: "var(--text-strong)" }}>
            {v.reportAccepted ? "Saved" : "Not saved"}
          </div>
          <div style={{ font: "var(--type-body)", color: "var(--text-muted)", maxWidth: 320, textWrap: "pretty" }}>{v.reportReason}</div>
          {v.reportPhotoNote && (
            <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", maxWidth: 320, textWrap: "pretty" }}>Photo check: {v.reportPhotoNote}</div>
          )}
          {/* Which checks ran, and which one turned it away. */}
          {v.reportChecks.length > 0 && (
            <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 6, textAlign: "left", padding: "13px 15px", borderRadius: "var(--radius-card)", background: "var(--surface-card)", border: "1px solid var(--border-card)" }}>
              {v.reportChecks.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span style={{ flex: "none", color: c.ok ? "var(--crowd-light)" : "var(--status-fault)", marginTop: 1 }}>
                    <Icon name={c.ok ? "check" : "x"} size={14} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-body)", textWrap: "pretty" }}>{c.label}</span>
                    {c.detail && <span style={{ display: "block", font: "var(--type-caption)", color: "var(--status-fault)", marginTop: 2, textWrap: "pretty" }}>{c.detail}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", maxWidth: 320, textWrap: "pretty" }}>{v.reportPointsLine}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <Button size="md" onClick={v.goRewards}>See points</Button>
            <Button variant="secondary" size="md" onClick={v.backToPick}>Report again</Button>
          </div>
        </div>
      )}
    </div>
  );
}
