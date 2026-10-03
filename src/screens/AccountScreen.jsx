import { Button, Icon } from "../design-system";

// There is deliberately no account behind this page. It is the one place a
// person can see what Solvik keeps in this browser and erase it again.
export function AccountScreen({ v }) {
  const isUser = Boolean(v.authUser);

  return (
    <main className="sv-account-page">
      <section className="sv-account-hero">
        <span className="sv-account-page-avatar"><Icon name={isUser ? "user" : "shield-check"} size={26} /></span>
        <div>
          <span className="sv-account-eyebrow">{isUser ? "Signed In" : "Guest Mode"}</span>
          <h2>{isUser ? `@${v.authUser.username}` : "Your device data"}</h2>
          <p>{isUser ? "Preferences and saved places sync to your account." : "No account, cloud sync or remote profile."}</p>
        </div>
        <span className="sv-account-state"><i />{isUser ? "Cloud sync" : "Local only"}</span>
      </section>

      {isUser && (
        <section className="sv-account-section" style={{ marginTop: 12 }}>
          <div className="sv-account-section-title">
            <span><Icon name="user-check" size={18} /></span>
            <div><h3>Account session</h3><p>Manage your login session.</p></div>
          </div>
          <p className="sv-account-local-note"><Icon name="shield-check" size={15} />Your account preferences and places are securely backed up in Solvik's database.</p>
          <Button variant="secondary" size="sm" onClick={v.authLogout}>
            Sign out
          </Button>
        </section>
      )}

      {!isUser && (
        <section className="sv-account-section" style={{ marginTop: 12 }}>
          <div className="sv-account-section-title">
            <span><Icon name="log-in" size={18} /></span>
            <div><h3>Switch to an account</h3><p>Save your commute habits and places permanently.</p></div>
          </div>
          <p className="sv-account-local-note"><Icon name="cloud" size={15} />Create an account to retain your settings whenever you return.</p>
          <Button variant="primary" size="sm" onClick={v.authLogout}>
            Sign in or create account
          </Button>
        </section>
      )}

      <section className="sv-account-section" style={{ marginTop: 12 }} aria-label="App settings">
        <div className="sv-account-section-title">
          <span><Icon name="smartphone" size={18} /></span>
          <div><h3>App</h3><p>How Solvik looks, and keeping it on your home screen.</p></div>
        </div>

        <div className="sv-theme-picker" role="radiogroup" aria-label="Appearance">
          {v.themeChoices.map((choice) => (
            <button key={choice.id} type="button" role="radio" aria-checked={choice.on} className={choice.on ? "is-active" : ""} onClick={choice.pick}>
              <Icon name={choice.id === "dark" ? "moon" : choice.id === "light" ? "sun" : "sun-moon"} size={15} />
              {choice.label}
            </button>
          ))}
        </div>

        {v.installState === "installed" && (
          <p className="sv-account-local-note"><Icon name="circle-check" size={15} />Installed. Recently planned routes open even without signal.</p>
        )}
        {v.installState === "prompt" && (
          <>
            <p className="sv-account-local-note"><Icon name="wifi-off" size={15} />Opens full screen from your home screen, and recently planned routes still open without signal.</p>
            <Button variant="primary" size="sm" iconLeft="download" onClick={v.installApp}>Install Solvik</Button>
          </>
        )}
        {v.installState === "ios" && (
          <p className="sv-account-local-note"><Icon name="share" size={15} />To install on iPhone: tap Share in Safari, then Add to Home Screen. Recently planned routes then open even without signal.</p>
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
            <div><h3>Stored in this browser</h3><p>Places, preferences, watched commutes and recent destinations.</p></div>
          </div>
          {isUser ? (
            <>
              <p className="sv-account-local-note"><Icon name="cloud" size={15} />Your preferences and saved places also sync to your account, so they follow you when you sign in elsewhere.</p>
              <p className="sv-account-local-note"><Icon name="smartphone" size={15} />Watched commutes, journey memory, reports and saved routes stay on this browser only.</p>
            </>
          ) : (
            <>
              <p className="sv-account-local-note"><Icon name="shield-check" size={15} />Nothing here is connected to a remote database or tied to an identity.</p>
              <p className="sv-account-local-note"><Icon name="smartphone" size={15} />The data stays on this browser and does not follow you to another device.</p>
            </>
          )}
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
