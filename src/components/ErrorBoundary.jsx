import { Component } from "react";

// A render error anywhere used to unmount the whole app, leaving a blank
// screen — the worst possible failure during a live demo. This keeps the
// failure contained and recoverable, and shows what broke.
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Solvik crashed:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{ position: "absolute", inset: 0, zIndex: 100, background: "var(--surface-page)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 340, background: "var(--surface-card)", borderRadius: "var(--radius-card)", padding: 20, boxShadow: "var(--shadow-card)" }}>
          <div style={{ font: "var(--type-heading)", letterSpacing: "var(--tracking-heading)", color: "var(--text-strong)" }}>Something broke</div>
          <div style={{ font: "var(--type-body)", color: "var(--text-muted)", marginTop: 8, textWrap: "pretty" }}>
            This screen hit an error. The rest of the app is fine — reload to carry on.
          </div>
          <pre style={{ font: "var(--weight-regular) 11px/1.4 var(--font-body)", color: "var(--text-muted)", background: "var(--sand-100)", borderRadius: "var(--radius-sm,10px)", padding: 10, marginTop: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 14, width: "100%", height: 44, borderRadius: "var(--radius-control)", border: "none", background: "var(--accent)", color: "var(--text-on-accent)", font: "var(--weight-bold) var(--size-body-sm)/1 var(--font-body)", cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
