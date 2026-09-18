import { Button, Icon } from "../design-system";

// There is deliberately no account behind this page. It is the one place a
// person can see what Solvik keeps in this browser and erase it again.
export function AccountScreen({ v }) {
  return (
    <main className="sv-account-page">
      <section className="sv-account-hero">
        <span className="sv-account-page-avatar"><Icon name="shield-check" size={26} /></span>
        <div>
          <span className="sv-account-eyebrow">Private by design</span>
          <h2>Your device data</h2>
          <p>No account, cloud sync or remote profile.</p>
        </div>
        <span className="sv-account-state"><i />Local only</span>
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
          <p className="sv-account-local-note"><Icon name="shield-check" size={15} />Nothing here is connected to a remote database or tied to an identity.</p>
          <p className="sv-account-local-note"><Icon name="smartphone" size={15} />The data stays on this browser and does not follow you to another device.</p>
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
