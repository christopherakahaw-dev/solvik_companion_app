import { useState } from "react";
import { Icon } from "./Icon";

const tones = {
  plain: { background: "var(--surface-card)", color: "var(--text-strong)", border: "1px solid var(--border-hairline)", hover: "var(--sand-100)" },
  soft: { background: "var(--accent-soft)", color: "var(--text-accent)", border: "1px solid transparent", hover: "var(--accent-soft-hover)" },
  accent: { background: "var(--accent)", color: "var(--text-on-accent)", border: "1px solid transparent", hover: "var(--accent-hover)" },
  ghost: { background: "transparent", color: "var(--text-strong)", border: "1px solid transparent", hover: "var(--sand-200)" },
};

const boxes = { sm: 34, md: 44, lg: 52 };

export function IconButton({
  icon,
  label,
  tone = "plain",
  size = "md",
  badge = false,
  onClick,
  disabled = false,
  style,
  ...rest
}) {
  const t = tones[tone] || tones.plain;
  const box = boxes[size] || boxes.md;
  const [state, setState] = useState("idle");
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setState("hover")}
      onMouseLeave={() => setState("idle")}
      onMouseDown={() => setState("press")}
      onMouseUp={() => setState("hover")}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: box,
        height: box,
        borderRadius: "var(--radius-pill)",
        background: state === "idle" || disabled ? t.background : t.hover,
        color: disabled ? "var(--text-subtle)" : t.color,
        border: t.border,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "var(--transition-control)",
        transform: state === "press" && !disabled ? "scale(var(--press-scale))" : "none",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(box * 0.45)} />
      {badge ? (
        <span
          style={{
            position: "absolute",
            top: 1,
            right: 1,
            width: 11,
            height: 11,
            borderRadius: "var(--radius-pill)",
            background: "var(--accent)",
            border: "2px solid var(--surface-card)",
          }}
        />
      ) : null}
    </button>
  );
}
