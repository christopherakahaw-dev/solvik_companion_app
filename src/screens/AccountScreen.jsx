import { Button, Icon } from "../design-system";

export function AccountScreen({ v }) {
  const isUser = Boolean(v.currentUser);

  return (
    <main className="sv-account-page">
      <section className="sv-account-hero">
        <span className="sv-account-page-avatar">
          <Icon name={isUser ? "user" : "shield-check"} size={26} />
        </span>
        <div>
          <span className="sv-account-eyebrow">
            {isUser ? "Signed In" : "Guest Mode"}
          </span>
          <h2>{isUser ? `@${v.currentUser.username}` : "Guest commuter"}</h2>
          <p>
            {isUser
              ? "Your commute preferences and saved places are securely stored in the database."
              : "Browsing as guest. Preferences remain on this browser only."}
          </p>
        </div>
        <span className="sv-account-state">
          <i style={{ background: isUser ? "var(--status-live)" : "var(--sand-500)" }} />
          {isUser ? "Database sync active" : "Local only"}
        </span>
      </section>

      {/* Account actions card */}
      <section className="sv-account-section" style={{ marginTop: 12 }}>
        <div className="sv-account-section-title">
          <span><Icon name={isUser ? "log-out" : "log-in"} size={18} /></span>
          <div>
            <h3>{isUser ? "Account Management" : "Account & Cloud Sync"}</h3>
            <p>
              {isUser
                ? `Logged in as @${v.currentUser.username}`
                : "Create a persistent account to keep your preferences saved"}
            </p>
          </div>
        </div>
        {isUser ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Switch user or end your session on this browser
            </span>
            <Button variant="secondary" size="sm" iconLeft="log-out" onClick={v.authLogout}>
              Sign out
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Save your preferences to a database account
            </span>
            <Button variant="primary" size="sm" iconLeft="log-in" onClick={() => v.go("auth")}>
              Sign in / Register
            </Button>
          </div>
        )}
      </section>

      <div className="sv-account-page-grid">
        <section className="sv-account-section">
          <div className="sv-account-section-title">
            <span><Icon name="brain" size={18} /></span>
            <div><h3>Commute memory</h3><p>Built from routes you deliberately start.</p></div>
          </div>
          <p className="sv-account-local-note"><Icon name="route" size={15} />{v.memorySummary}</p>
          {v.memoryAiLabel && <p className="sv-account-local-note"><Icon name="sparkles" size={15} />{v.memoryAiLabel}</p>}
          {v.memoryAiSummary && <p className="sv-account-local-note"><Icon name="brain" size={15} />{v.memoryAiSummary}</p>}
          <p className="sv-account-local-note"><Icon name="clock-3" size={15} />Journey records expire automatically after 90 days.</p>
          <p className="sv-account-local-note"><Icon name="shield-check" size={15} />{v.memoryNote}</p>
          <Button variant="secondary" size="sm" disabled={!v.memoryCount} onClick={() => {
            if (window.confirm("Clear learned journeys and automatically learned commutes from this browser?")) v.forgetEverything();
          }}>Clear learned memory</Button>
        </section>

        <section className="sv-account-section">
          <div className="sv-account-section-title">
            <span><Icon name="hard-drive" size={18} /></span>
            <div><h3>Preferences & Places</h3><p>Persona, routing options, and custom locations.</p></div>
          </div>
          <p className="sv-account-local-note">
            <Icon name="shield-check" size={15} />
            {isUser
              ? "Preferences are synchronized to your database account on every change."
              : "Guest preferences stay in this browser's local storage."}
          </p>
          <p className="sv-account-local-note">
            <Icon name="smartphone" size={15} />
            {isUser
              ? "Signing in on any other device automatically restores your settings."
              : "Log in anytime to sync your settings to a permanent account."}
          </p>
        </section>
      </div>

      <section className="sv-account-section sv-account-actions-page">
        <div className="sv-account-section-title">
          <span><Icon name="trash-2" size={18} /></span>
          <div><h3>Reset Solvik</h3><p>Remove every Solvik preference and memory saved by this browser.</p></div>
        </div>
        <div className="sv-account-action-list">
          <button type="button" className="is-danger" onClick={v.clearAllData}>
            <span><Icon name="trash-2" size={18} /><span><strong>Erase all local data</strong><small>Onboarding will start again</small></span></span>
            <Icon name="chevron-right" size={17} />
          </button>
        </div>
      </section>
    </main>
  );
}
