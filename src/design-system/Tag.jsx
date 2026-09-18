import { useState } from "react";
import { Icon } from "./Icon";

const tones = {
  soft: { background: "var(--accent-soft)", color: "var(--text-accent)", border: "1px solid transparent" },
  outline: { background: "var(--surface-card)", color: "var(--text-accent)", border: "1px solid var(--border-hairline)" },
  neutral: { background: "var(--surface-sunken)", color: "var(--text-muted)", border: "1px solid transparent" },
  warn: { background: "var(--amber-100)", color: "var(--rust-700)", border: "1px solid transparent" },
};

export function Tag({ children, tone = "soft", icon, onClick, style, ...rest }) {
  const t = tones[tone] || tones.soft;
  const [hover, setHover] = useState(false);
  const clickable = Boolean(onClick);
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 34,
        padding: "0 14px",
        borderRadius: "var(--radius-pill)",
        background: t.background,
        border: t.border,
        color: t.color,
        font: "var(--weight-bold) var(--size-caption)/1 var(--font-body)",
        letterSpacing: "var(--tracking-micro)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        cursor: clickable ? "pointer" : "default",
        opacity: clickable && hover ? 0.82 : 1,
        transition: "var(--transition-control)",
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}
