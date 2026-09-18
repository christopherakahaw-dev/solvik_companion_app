import { useState } from "react";

const tones = {
  plain: { background: "var(--surface-card)", border: "1px solid transparent" },
  outlined: { background: "var(--surface-card)", border: "1px solid var(--border-accent)" },
  hairline: { background: "var(--surface-card)", border: "1px solid var(--border-card)" },
  accent: { background: "var(--surface-accent)", border: "1px solid transparent" },
  dark: { background: "var(--surface-dark)", border: "1px solid transparent" },
};

export function Card({
  children,
  tone = "plain",
  padding = "default",
  interactive = false,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const pad = padding === "none" ? 0 : padding === "tight" ? "var(--pad-card-tight)" : "var(--pad-card)";
  const t = tones[tone] || tones.plain;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => interactive && setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        background: t.background,
        border: t.border,
        borderRadius: "var(--radius-card)",
        padding: pad,
        color: tone === "dark" ? "var(--text-on-dark)" : "var(--text-body)",
        boxShadow: interactive && hover ? "var(--shadow-raised)" : "var(--shadow-card)",
        transform: press ? "scale(var(--press-scale))" : interactive && hover ? "translateY(var(--lift-hover))" : "none",
        transition: "box-shadow var(--dur-base) var(--ease-standard),transform var(--dur-fast) var(--ease-standard)",
        cursor: interactive ? "pointer" : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
