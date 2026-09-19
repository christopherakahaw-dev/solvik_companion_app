import { useEffect, useState } from "react";
import { AppLogic } from "./state/appLogic";
import { AppHeader, Icon } from "./design-system";
import { Intro } from "./screens/Intro";
import { MapScreen } from "./screens/MapScreen";
import { NavScreen } from "./screens/NavScreen";
import { ReportScreen } from "./screens/ReportScreen";
import { RewardsScreen } from "./screens/RewardsScreen";
import { PlanScreen, PlacesSheet, AddCommuteSheet } from "./screens/PlanScreen";
import { TabBar } from "./screens/TabBar";
import { ViewportShell } from "./components/ViewportShell";
import { AppMenu } from "./components/AppMenu";
import { SolvikBrand } from "./components/SolvikBrand";
import { AccountScreen } from "./screens/AccountScreen";
import { AuthScreen } from "./screens/AuthScreen";
import "./app.css";

function ResponsivePageHeader({ v }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <AppHeader
        className="sv-page-header"
        title={v.headerTitle}
        subtitle={v.headerSub}
        leading={(
          <div className="sv-page-leading">
            <button type="button" className="sv-page-menu-button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
              <Icon name="route" size={20} strokeWidth={2.35} />
              <span className="sv-logo-menu-cue" aria-hidden="true"><Icon name="menu" size={13} strokeWidth={2.8} /></span>
            </button>
            <SolvikBrand compact className="sv-page-brand" />
          </div>
        )}
      />
      {open && <AppMenu v={v} onClose={() => setOpen(false)} />}
    </>
  );
}

class LocalApp extends AppLogic {
  render() {
    const v = this.renderVals();
    return (
      <ViewportShell fluid={!v.isIntro && !v.isAuth} largeText={v.largeText}>
        {v.isAuth && <AuthScreen v={v} />}
        {v.isIntro && <Intro v={v} />}
        {v.isMap && <MapScreen v={v} />}
        {v.isNav && <NavScreen v={v} />}

        {v.showStatus && (
          <ResponsivePageHeader v={v} />
        )}

        {(v.isReport || v.isRewards || v.isPlan || v.isAccount) && (
          <div className="sv-page-scroll sv-page-enter" key={v.tab}>
            {v.isReport && <ReportScreen v={v} />}
            {v.isRewards && <RewardsScreen v={v} />}
            {v.isPlan && <PlanScreen v={v} />}
            {v.isAccount && <AccountScreen v={v} />}
          </div>
        )}

        <PlacesSheet v={v} />
        <AddCommuteSheet v={v} />

        {v.toast && (
          <div className="sv-toast" role="status" aria-live="polite">
            <span className="sv-toast-icon" aria-hidden="true"><Icon name="route" size={16} strokeWidth={2.4} /></span>
            <span>{v.toast}</span>
          </div>
        )}

        {v.showTabs && <TabBar v={v} />}
      </ViewportShell>
    );
  }
}

export function App() {
  return <LocalApp />;
}
