// A reminder to leave, fired by the browser.
//
// A web page can only do this while it is open: there is no service worker and
// no push subscription here, so a scheduled timer dies with the tab. That
// limitation is stated in the UI rather than papered over — an alert you think
// is set and isn't is worse than no alert.

export function notifySupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyPermission() {
  if (!notifySupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotify() {
  if (!notifySupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function showNotification(title, body) {
  if (!notifySupported() || Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body, tag: "solvik-leave", renotify: false });
    return true;
  } catch {
    return false;
  }
}

// Fire `onFire` once, `leadMins` before the given clock time. Returns a
// canceller, or null when the moment has already passed.
export function scheduleLeaveAlert({ departAt, leadMins = 10, onFire }) {
  if (!departAt) return null;
  const fireAt = departAt.getTime() - leadMins * 60000;
  const delay = fireAt - Date.now();
  if (delay <= 0) return null;
  // setTimeout is clamped to ~24.8 days; a commute is always well inside that.
  const id = setTimeout(onFire, delay);
  return () => clearTimeout(id);
}
