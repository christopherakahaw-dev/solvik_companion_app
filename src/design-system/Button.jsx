import { useState } from "react";
import { Icon } from "./Icon";

const variants = {
  primary: { background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid transparent", hover: "var(--accent-hover)", press: "var(--accent-press)" },
  secondary: { background: "var(--surface-card)", color: "var(--text-strong)", border: "1px solid var(--border-hairline)", hover: "var(--sand-100)", press: "var(--sand-200)" },
  soft: { background: "var(--accent-soft)", color: "var(--text-accent)", border: "1px solid transparent", hover: "var(--accent-soft-hover)", press: "var(--green-300)" },
  ghost: { background: "transparent", color: "var(--text-strong)", border: "1px solid transparent", hover: "var(--sand-200)", press: "var(--sand-300)" },
  dark: { background: "var(--surface-dark)", color: "var(--text-on-dark)", border: "1px solid transparent", hover: "var(--sand-800)", press: "var(--sand-700)" },
};

const sizes = {
  sm: { height: 34, padding: "0 14px", font: "var(--weight-bold) var(--size-caption)/1 var(--font-body)", icon: 16, gap: 6 },
  md: { height: 44, padding: "0 20px", font: "var(--weight-bold) var(--size-body-sm)/1 var(--font-body)", icon: 18, gap: 8 },
  lg: { height: 56, padding: "0 24px", font: "var(--weight-bold) var(--size-subheading)/1 var(--font-body)", icon: 22, gap: 10 },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  fullWidth = false,
  disabled = false,
  onClick,
  type = "button",
  style,
  ...rest
}) {
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.md;
  const [state, setState] = useState("idle");
  const bg = disabled ? "var(--sand-200)" : state === "press" ? v.press : state === "hover" ? v.hover : v.background;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setState("hover")}
      onMouseLeave={() => setState("idle")}
      onMouseDown={() => setState("press")}
      onMouseUp={() => setState("hover")}
      onBlur={() => setState("idle")}
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        alignItems: "center",
        justifyContent: iconRight ? "space-between" : "center",
        gap: s.gap,
        height: s.height,
        padding: s.padding,
        font: s.font,
        letterSpacing: "var(--tracking-body)",
        background: bg,
        color: disabled ? "var(--text-subtle)" : v.color,
        border: v.border,
        borderRadius: "var(--radius-control)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "var(--transition-control)",
        transform: state === "press" && !disabled ? "scale(var(--press-scale))" : "none",
        boxShadow: state === "press" ? "var(--shadow-press)" : "none",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      {...rest}
    >
      {iconLeft ? <Icon name={iconLeft} size={s.icon} /> : null}
      <span style={{ display: "inline-flex", alignItems: "center", gap: s.gap }}>{children}</span>
      {iconRight ? <Icon name={iconRight} size={s.icon} /> : null}
    </button>
  );
}
