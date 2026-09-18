import { Icon } from "../design-system";

export function SolvikBrand({ compact = false, className = "" }) {
  return (
    <span className={`sv-brand${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`} aria-label="Solvik">
      <span className="sv-brand-mark" aria-hidden="true"><Icon name="route" size={19} strokeWidth={2.25} /></span>
      {!compact && <span className="sv-brand-name">Solvik</span>}
    </span>
  );
}
