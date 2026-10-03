// Light, dark, or whatever the phone is set to. The effective theme is written
// to <html data-theme>, which tokens/dark.css keys off; "Automatic" follows
// prefers-color-scheme, including when the phone switches at sunset. The same
// logic runs inline in index.html before first paint, so a dark-mode user
// never sees a white flash on opening.
import { KEYS, loadStored, store } from "./storage.js";

export const THEME_CHOICES = [
  { id: "system", label: "Automatic" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const LIGHT_BAR = "#f4f3f1";
const DARK_BAR = "#141312";

export function storedTheme() {
  const value = loadStored(KEYS.theme, "system");
  return THEME_CHOICES.some((choice) => choice.id === value) ? value : "system";
}

// Wrapped rather than passed bare: window.matchMedia called off window throws.
const systemMedia = typeof window !== "undefined" && window.matchMedia ? (query) => window.matchMedia(query) : null;

export function isDark(choice, matchMedia = systemMedia) {
  if (choice === "dark") return true;
  if (choice === "light") return false;
  return Boolean(matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyTheme(choice) {
  if (typeof document === "undefined") return;
  const dark = isDark(choice);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // The browser bar follows the page, not just the OS setting.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", dark ? DARK_BAR : LIGHT_BAR));
}

export function setTheme(choice) {
  store(KEYS.theme, choice);
  applyTheme(choice);
}

// Re-apply when the phone's own setting changes, if the choice is Automatic.
export function followSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => { if (storedTheme() === "system") applyTheme("system"); };
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}
