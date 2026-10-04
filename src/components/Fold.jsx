import { useId, useState } from "react";
import { Icon } from "../design-system";

// A secondary section folded to one row that shows its current value, so the
// screen leads with what matters day to day and keeps the rest one tap away.
export function Fold({ className, icon, label, value, startOpen = false, children }) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  return (
    <section className={"sv-plan-fold " + (className || "") + (open ? " is-open" : "")}>
      <button className="sv-plan-fold-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="sv-plan-fold-icon"><Icon name={icon} size={15} /></span>
        <span className="sv-plan-fold-copy">
          <span className="sv-plan-fold-label">{label}</span>
          {value && <span className="sv-plan-fold-value">{value}</span>}
        </span>
        <Icon name="chevron-down" size={17} />
      </button>
      {open && <div id={id} className="sv-plan-fold-body">{children}</div>}
    </section>
  );
}
