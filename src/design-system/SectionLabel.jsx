export function SectionLabel({ children, style, ...rest }) {
  return (
    <div
      style={{
        font: "var(--weight-bold) var(--size-caption)/1.2 var(--font-body)",
        letterSpacing: "var(--tracking-label)",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
