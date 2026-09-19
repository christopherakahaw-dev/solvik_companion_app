// Promise wrapper around the browser geolocation API, with a cache of the
// last successful fix so separate screens (map, report) don't each trigger a
// permission prompt. Requires a secure context: works on localhost and over
// HTTPS, not on a plain-HTTP LAN address.

let lastFix = null; // { coords: [lat, lng], accuracy, at }

const OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 };

function normalizeError(err) {
  if (!err) return { code: "unavailable" };
  if (err.code === 1) return { code: "denied" };
  if (err.code === 3) return { code: "timeout" };
  return { code: "unavailable" };
}

export function getLastPosition() {
  return lastFix;
}

// `options` overrides the defaults — pass { maximumAge: 0 } when the user has
// explicitly asked where they are now and a cached fix would be misleading.
export function getPosition(options) {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject({ code: "unsupported" });
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastFix = {
          coords: [pos.coords.latitude, pos.coords.longitude],
          accuracy: pos.coords.accuracy,
          heading: typeof pos.coords.heading === "number" && !isNaN(pos.coords.heading) ? pos.coords.heading : null,
          speed: typeof pos.coords.speed === "number" && !isNaN(pos.coords.speed) ? pos.coords.speed : null,
          at: Date.now(),
        };
        resolve(lastFix);
      },
      (err) => reject(normalizeError(err)),
      { ...OPTIONS, ...(options || {}) }
    );
  });
}

// Continuous tracking, used by turn-by-turn so steps advance from the real
// position. Returns a watch id for clearWatch().
export function watchPosition(onFix, onError) {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError && onError({ code: "unsupported" });
    return null;
  }
  return navigator.geolocation.watchPosition(
    (pos) => {
      lastFix = {
        coords: [pos.coords.latitude, pos.coords.longitude],
        accuracy: pos.coords.accuracy,
        heading: typeof pos.coords.heading === "number" && !isNaN(pos.coords.heading) ? pos.coords.heading : null,
        speed: typeof pos.coords.speed === "number" && !isNaN(pos.coords.speed) ? pos.coords.speed : null,
        at: Date.now(),
      };
      onFix(lastFix);
    },
    (err) => onError && onError(normalizeError(err)),
    // Under way, a cached fix is worse than a slightly later fresh one.
    { ...OPTIONS, maximumAge: 2000, timeout: 20000 }
  );
}

export function clearWatch(id) {
  if (id != null && typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.clearWatch(id);
  }
}

export function messageForError(code) {
  if (code === "denied") return "Location permission denied — allow it in your browser settings";
  if (code === "unsupported") return "Location isn't available on this device";
  if (code === "timeout") return "Location is taking too long — try again";
  return "Couldn't get your location";
}
