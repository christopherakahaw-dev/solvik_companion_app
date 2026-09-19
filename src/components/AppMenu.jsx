import { Icon, IconButton } from "../design-system";
import { SolvikBrand } from "./SolvikBrand";

export function AppMenu({ v, onClose }) {
  return (
    <div className="sv-map-menu-layer">
      <button className="sv-overlay-dismiss" type="button" aria-label="Close menu" onClick={onClose} />
      <aside className="sv-map-menu" role="dialog" aria-modal="true" aria-label="Solvik menu">
        <div className="sv-map-menu-header">
          <SolvikBrand className="sv-menu-brand-lockup" />
          <IconButton icon="x" label="Close menu" tone="ghost" size="sm" onClick={onClose} />
        </div>

        <nav aria-label="Solvik sections">
          {v.navTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === v.tab ? "is-active" : ""}
              aria-current={tab.id === v.tab ? "page" : undefined}
              onClick={() => {
                tab.go();
                onClose();
              }}
            >
              <span className="sv-menu-nav-icon"><Icon name={tab.icon} size={19} /></span>
              <span>{tab.label}</span>
              {tab.id === v.tab && <span className="sv-menu-active-dot" aria-hidden="true" />}
            </button>
          ))}
        </nav>

        <div className="sv-menu-account-dock">
          <button
            type="button"
            className="sv-menu-account-trigger"
            aria-label="Open device data"
            onClick={() => { v.goAccount(); onClose(); }}
          >
            <span className="sv-account-avatar"><Icon name={v.authUser ? "user" : "shield-check"} size={19} /></span>
            <span className="sv-account-identity">
              <strong>{v.authUser ? `@${v.authUser.username}` : "Your data"}</strong>
              <span>{v.authUser ? "Account & preferences" : "Saved on this device"}</span>
            </span>
            <span className="sv-menu-account-arrow"><Icon name="chevron-right" size={18} /></span>
          </button>
        </div>
      </aside>
    </div>
  );
}
