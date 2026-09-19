// Device compass / orientation listener.
// Captures heading from hardware magnetometer / gyroscope sensors (mobile & tablets)
// and normalizes it to degrees clockwise from North (0–360°).

let currentHeading = null;
const listeners = new Set();
let listening = false;

function getScreenAngle() {
  if (typeof window === "undefined") return 0;
  if (window.screen?.orientation?.angle != null) {
    return window.screen.orientation.angle;
  }
  if (typeof window.orientation === "number") {
    return window.orientation;
  }
  return 0;
}

function handleOrientation(event) {
  let heading = null;
  // iOS Safari: webkitCompassHeading is already clockwise degrees from true/magnetic North (0–360)
  if (typeof event.webkitCompassHeading === "number" && !isNaN(event.webkitCompassHeading) && event.webkitCompassHeading >= 0) {
    heading = event.webkitCompassHeading;
  } else if (typeof event.alpha === "number" && !isNaN(event.alpha)) {
    // Android / Standard: alpha is rotation around z-axis (0–360).
    // In Android Chrome, alpha is counter-clockwise, so compass heading = (360 - alpha) % 360
    const screenAngle = getScreenAngle();
    let compass = 360 - event.alpha;
    compass = (compass + screenAngle) % 360;
    if (compass < 0) compass += 360;
    heading = compass;
  }

  if (heading != null) {
    const rounded = Math.round(heading);
    if (rounded !== currentHeading) {
      currentHeading = rounded;
      for (const listener of listeners) {
        try {
          listener(currentHeading);
        } catch {
          // ignore listener errors
        }
      }
    }
  }
}

export function subscribeHeading(callback) {
  if (typeof callback !== "function") return () => {};
  listeners.add(callback);

  if (currentHeading != null) {
    callback(currentHeading);
  }

  if (!listening && typeof window !== "undefined") {
    if ("ondeviceorientationabsolute" in window) {
      window.addEventListener("deviceorientationabsolute", handleOrientation, true);
      listening = true;
    } else if ("ondeviceorientation" in window) {
      window.addEventListener("deviceorientation", handleOrientation, true);
      listening = true;
    }
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && listening && typeof window !== "undefined") {
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
      listening = false;
    }
  };
}

export function getCurrentHeading() {
  return currentHeading;
}

export function resetHeadingForTesting() {
  currentHeading = null;
  listeners.clear();
}
