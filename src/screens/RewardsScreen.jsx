import { Icon, Card, SectionLabel, Button } from "../design-system";

export function RewardsScreen({ v }) {
  return (
    <div className="sv-rewards-screen" style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 14 }}>
      <div style={{ position: "relative", overflow: "hidden", background: "var(--surface-dark)", color: "var(--text-on-dark)", borderRadius: "var(--radius-card)", padding: 20, boxShadow: "var(--shadow-card)" }}>
        <div style={{ position: "absolute", right: -38, top: -38, width: 150, height: 150, borderRadius: 999, background: "rgba(255,255,255,.06)" }} />
        <div style={{ position: "absolute", right: 6, bottom: -52, width: 110, height: 110, borderRadius: 999, background: "rgba(255,255,255,.05)" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.14)", borderRadius: 999, padding: "6px 11px", font: "var(--weight-bold) 11px/1 var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase" }}>
            <Icon name="medal" size={14} />
            {v.tierName}
          </div>
          {/* A "6-day streak" used to sit here. Nothing counted days. */}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 9, marginTop: 16 }}>
          <div style={{ font: "var(--weight-heavy) 52px/1 var(--font-numeric)", fontVariantNumeric: "tabular-nums", letterSpacing: "-.03em" }}>{v.points}</div>
          <div style={{ font: "var(--type-body)", opacity: 0.72 }}>points</div>
          {/* Was "+180 this week", which nothing counted. */}
          {v.hasPending && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, font: "var(--weight-bold) 12px/1 var(--font-body)", color: "var(--crowd-moderate)" }}>
              <Icon name="hourglass" size={15} />
              {v.pendingPoints} pending
            </div>
          )}
        </div>
        {/* The rule the whole rewards change rests on: filing earns nothing on
            its own. Said here, not just on the report screen. */}
        {v.hasPending && (
          <div style={{ position: "relative", font: "var(--type-caption)", opacity: 0.74, marginTop: 9, textWrap: "pretty" }}>{v.pendingLine}</div>
        )}
        <div style={{ position: "relative", marginTop: 18 }}>
          <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.16)", overflow: "hidden" }}>
            <div style={v.tierBarStyle} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, font: "var(--weight-regular) 11px/1 var(--font-body)", opacity: 0.76 }}>
            <span>Silver</span>
            <span>{v.toGold} points to Gold</span>
            <span>Gold</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px" }}>
        <span style={{ font: "var(--weight-bold) 10px/1 var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)", background: "var(--sand-200)", borderRadius: 999, padding: "5px 9px" }}>
          Sample data
        </span>
        <span style={{ font: "var(--type-caption)", color: "var(--text-muted)", textWrap: "pretty" }}>
          {/* Points are counted from your own filed reports now, so the label
              narrows to what is still illustrative: the catalogue. */}
          The vouchers below are illustrative — nothing here issues a real one. Your points are counted from reports saved on this device.
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {v.pointStats.map((ps, i) => (
          <div key={i} style={{ background: "var(--surface-card)", border: "1px solid var(--border-card)", borderRadius: "var(--radius-card)", padding: "13px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: "var(--accent-soft)", color: "var(--text-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={ps.icon} size={15} />
            </div>
            <div style={{ font: "var(--weight-heavy) 20px/1 var(--font-numeric)", fontVariantNumeric: "tabular-nums", color: "var(--text-strong)" }}>{ps.value}</div>
            <div style={{ font: "var(--weight-regular) 11px/1.25 var(--font-body)", color: "var(--text-muted)", textWrap: "pretty" }}>{ps.label}</div>
          </div>
        ))}
      </div>

      <SectionLabel>Redeem</SectionLabel>
      {v.vouchers.map((voucher, i) => (
        <div key={i} style={voucher.cardStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={voucher.iconStyle}>
              <Icon name={voucher.icon} size={17} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ font: "var(--type-body-strong)", color: "var(--text-strong)", textWrap: "pretty" }}>{voucher.title}</div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 4, textWrap: "pretty" }}>{voucher.sub}</div>
            </div>
            <Button variant={voucher.variant} size="sm" disabled={voucher.disabled} onClick={voucher.redeem}>
              {voucher.cta}
            </Button>
          </div>
          {voucher.locked && (
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 5, borderRadius: 999, background: "var(--sand-200)", overflow: "hidden" }}>
                <div style={voucher.barStyle} />
              </div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-muted)", marginTop: 7 }}>{voucher.gap} points to go</div>
            </div>
          )}
        </div>
      ))}
      <Card tone="hairline">
        <SectionLabel>Why reports earn points</SectionLabel>
        <div style={{ font: "var(--type-body)", color: "var(--text-muted)", marginTop: 8, textWrap: "pretty" }}>
          Verified reports give LTA a live picture of the network — faster than a camera sweep, cheaper than a sensor rollout.
        </div>
      </Card>
    </div>
  );
}
