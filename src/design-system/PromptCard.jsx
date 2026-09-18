import { Card } from "./Card";
import { Icon } from "./Icon";
import { Button } from "./Button";

export function PromptCard({ icon = "calendar", title, description, actionLabel, onAction, onDismiss, style, ...rest }) {
  return (
    <Card style={style} {...rest}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: "none", color: "var(--text-strong)" }}>
          <Icon name={icon} size={28} strokeWidth={1.9} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--weight-bold) var(--size-subheading)/1.2 var(--font-display)", color: "var(--text-strong)", letterSpacing: "var(--tracking-heading)" }}>
            {title}
          </div>
          {description ? (
            <div style={{ marginTop: 5, font: "var(--weight-regular) var(--size-body-sm)/1.3 var(--font-body)", color: "var(--text-muted)" }}>
              {description}
            </div>
          ) : null}
        </div>
        {actionLabel ? (
          <Button variant="primary" size="md" onClick={onAction} style={{ flex: "none" }}>
            {actionLabel}
          </Button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            style={{ flex: "none", border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
          >
            <Icon name="x" size={18} />
          </button>
        ) : null}
      </div>
    </Card>
  );
}
