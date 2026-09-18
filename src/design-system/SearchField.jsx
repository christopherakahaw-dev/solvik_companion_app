import { useState } from "react";
import { Icon } from "./Icon";

export function SearchField({
  value,
  placeholder = "Where to?",
  icon = "search",
  onChange,
  onClear,
  onSubmit,
  onFocus,
  onBlur,
  onKeyDown,
  style,
  ...rest
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 52,
        padding: "0 16px",
        background: "var(--surface-card)",
        borderRadius: "var(--radius-control)",
        border: `1px solid ${focus ? "var(--border-focus)" : "var(--border-hairline)"}`,
        boxShadow: focus ? "var(--ring-focus)" : "none",
        transition: "box-shadow var(--dur-fast) var(--ease-standard),border-color var(--dur-fast) var(--ease-standard)",
        ...style,
      }}
    >
      <Icon name={icon} size={19} color="var(--text-muted)" />
      <input
        {...rest}
        aria-label={rest["aria-label"] || placeholder}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={(e) => {
          setFocus(true);
          onFocus && onFocus(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur && onBlur(e);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key === "Enter" && onSubmit) onSubmit(value);
        }}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          font: "var(--weight-medium) max(16px, var(--size-body))/1.2 var(--font-body)",
          color: "var(--text-strong)",
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear"
          onClick={onClear || (() => onChange?.(""))}
          style={{ display: "flex", border: "none", background: "transparent", padding: 4, cursor: "pointer", color: "var(--text-muted)" }}
        >
          <Icon name="x" size={17} />
        </button>
      ) : null}
    </div>
  );
}
