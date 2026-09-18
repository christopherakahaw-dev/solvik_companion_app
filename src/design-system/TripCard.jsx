import { Card } from "./Card";
import { Tag } from "./Tag";

export function TripCard({ time, leaveAt, title, route, tags = [], highlighted = false, onClick, style, ...rest }) {
  return (
    <Card tone={highlighted ? "outlined" : "plain"} interactive={Boolean(onClick)} onClick={onClick} style={style} {...rest}>
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <div style={{ flex: "none", width: 92 }}>
          <div className="solvik-tnum" style={{ font: "var(--type-clock)", color: "var(--text-strong)", letterSpacing: "var(--tracking-title)", fontVariantNumeric: "tabular-nums" }}>
            {time}
          </div>
          {leaveAt ? (
            <div className="solvik-tnum" style={{ marginTop: 8, font: "var(--weight-regular) var(--size-body-sm)/1.25 var(--font-body)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              Leave
              <br />
              {leaveAt}
            </div>
          ) : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--weight-bold) var(--size-heading)/1.2 var(--font-display)", color: "var(--text-strong)", letterSpacing: "var(--tracking-heading)", textWrap: "pretty" }}>
            {title}
          </div>
          {route ? (
            <div style={{ marginTop: 7, font: "var(--weight-regular) var(--size-body)/1.3 var(--font-body)", color: "var(--text-muted)" }}>
              {route}
            </div>
          ) : null}
          {tags.length ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              {tags.map((raw, i) => {
                const t = typeof raw === "string" ? { label: raw } : raw;
                return (
                  <Tag key={i} tone={t.tone || "soft"} icon={t.icon} onClick={t.onClick}>
                    {t.label}
                  </Tag>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
