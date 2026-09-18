export function AppHeader({ title, subtitle, uppercase = false, leading, action, sticky = true, style, ...rest }) {
  return (
    <header
      style={{
        position: sticky ? "sticky" : "relative",
        top: 0,
        zIndex: 5,
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "18px var(--pad-screen) 16px",
        background: "var(--surface-card)",
        borderBottom: "1px solid var(--border-card)",
        ...style,
      }}
      {...rest}
    >
      {leading ? <div className="sv-header-leading-slot" style={{ flex: "none" }}>{leading}</div> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            color: "var(--text-strong)",
            font: uppercase ? "var(--weight-heavy) var(--size-title)/1.1 var(--font-display)" : "var(--type-display)",
            letterSpacing: "var(--tracking-display)",
            textTransform: uppercase ? "uppercase" : "none",
            textWrap: "pretty",
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p style={{ margin: "6px 0 0", font: "var(--weight-regular) var(--size-body-sm)/1.35 var(--font-body)", color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div style={{ flex: "none", paddingTop: 2 }}>{action}</div> : null}
    </header>
  );
}
