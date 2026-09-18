import { useState } from "react";
import { Icon } from "./Icon";

export function TogglePill({ children, icon, pressed = false, onChange, fullWidth = true, style, ...rest }) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange && onChange(!pressed)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: "flex",
        width: fullWidth ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        height: 50,
        padding: "0 20px",
        borderRadius: "var(--radius-control)",
        background: pressed ? "var(--accent-soft)" : hover ? "var(--sand-100)" : "var(--surface-card)",
        color: pressed ? "var(--text-accent)" : "var(--text-strong)",
        border: `1px solid ${pressed ? "var(--border-accent)" : "var(--border-hairline)"}`,
        font: "var(--weight-bold) var(--size-body-sm)/1 var(--font-body)",
        cursor: "pointer",
        transition: "var(--transition-control)",
        transform: press ? "scale(var(--press-scale))" : "none",
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}
