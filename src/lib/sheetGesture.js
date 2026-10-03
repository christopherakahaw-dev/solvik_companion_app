// A bottom sheet that follows the finger, Google Maps style.
//
// While a finger is down the sheet is moved by writing a CSS variable straight
// to the element — no React render per frame, and the move itself is a GPU
// transform (app.css), so it keeps up at 60fps however much the sheet holds.
// On release it snaps to the nearest resting height, or — after a flick — to
// the next one in the flick's direction, and only then tells the app.

// A flick faster than this (px per ms) goes to the next snap in its direction,
// however short it was.
export const FLICK_VELOCITY = 0.45;
// How far ahead a slower release is projected before choosing the nearest snap.
const PROJECT_MS = 160;
// Past the first and last snaps the sheet still moves, at a fraction of the
// finger, so the ends feel elastic rather than like a wall.
const RUBBER = 0.28;
// Movement before a touch counts as a drag rather than a tap.
const SLOP_PX = 6;

// height: visible px. velocity: px/ms, positive while the sheet grows.
export function chooseSnap({ height, velocity = 0, snaps }) {
  const sorted = [...snaps].sort((a, b) => a - b);
  if (Math.abs(velocity) >= FLICK_VELOCITY) {
    if (velocity > 0) return sorted.find((s) => s > height + 1) ?? sorted[sorted.length - 1];
    return [...sorted].reverse().find((s) => s < height - 1) ?? sorted[0];
  }
  const projected = height + velocity * PROJECT_MS;
  return sorted.reduce((best, s) => (Math.abs(s - projected) < Math.abs(best - projected) ? s : best), sorted[0]);
}

export function rubberBand(height, min, max) {
  if (height > max) return max + (height - max) * RUBBER;
  if (height < min) return min - (min - height) * RUBBER;
  return height;
}

// Px/ms over the last ~100 ms of samples ({ y, t }), positive when the finger
// moved up (the sheet grew).
export function releaseVelocity(samples) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const first = samples.find((s) => last.t - s.t <= 100) || samples[0];
  const dt = last.t - first.t;
  return dt > 0 ? (first.y - last.y) / dt : 0;
}

// Wires the gesture to a sheet. Returns a cleanup function.
//   wrap      the element whose --sheet-visible sets how much shows
//   handle    the grab bar: a tap on it toggles between half and full
//   scroller  the content that scrolls when the sheet is fully open
//   getSnaps  () => [peek, half, full] in px
//   getHeight () => the committed visible height
//   onSettle  (height) => commit the resting height to app state
export function attachSheetGesture({ wrap, handle, scroller, getSnaps, getHeight, onSettle, enabled = () => true }) {
  let g = null;
  let swallowClick = false;

  const visibleNow = () => {
    const host = wrap.parentElement.getBoundingClientRect();
    return Math.max(0, host.bottom - wrap.getBoundingClientRect().top);
  };
  const show = (height) => wrap.style.setProperty("--sheet-visible", `${Math.round(height)}px`);
  const settle = (height) => {
    delete wrap.dataset.dragging;
    show(height);
    onSettle(height);
  };

  // t is the input event's own timestamp: a flick's speed is when the finger
  // moved, not when a busy main thread got round to handling it.
  const begin = (x, y, target, t) => {
    if (!enabled()) return;
    if (target.closest("input, textarea, select, [contenteditable], [data-no-sheet-drag]")) return;
    // A button inside the grab bar (close) is its own tap, not a handle tap.
    const onHandle = !!handle && handle.contains(target) && !target.closest("button");
    g = { startX: x, startY: y, startH: visibleNow(), height: null, mode: null, samples: [{ y, t }], onHandle };
  };

  // Returns true when the sheet took the move (so the caller stops the scroll).
  const update = (x, y, target, t) => {
    if (!g) return false;
    const dy = y - g.startY;
    if (!g.mode) {
      const dx = x - g.startX;
      if (Math.abs(dy) < SLOP_PX && Math.abs(dx) < SLOP_PX) return false;
      // Sideways first (the travel-mode chips scroll that way): not ours.
      if (Math.abs(dx) > Math.abs(dy)) { g.mode = "sideways"; return false; }
      const snaps = getSnaps();
      const full = g.startH >= snaps[snaps.length - 1] - 2;
      const inScroller = scroller && scroller.contains(target) && !g.onHandle;
      // Fully open, the list scrolls as normal; only a pull down from its very
      // top takes the sheet with it.
      g.mode = inScroller && full && (scroller.scrollTop > 0 || dy < 0) ? "scroll" : "drag";
      if (g.mode === "drag") wrap.dataset.dragging = "1";
    }
    if (g.mode !== "drag") return false;
    const snaps = getSnaps();
    g.height = rubberBand(g.startH - dy, snaps[0], snaps[snaps.length - 1]);
    show(g.height);
    g.samples.push({ y, t });
    if (g.samples.length > 8) g.samples.shift();
    return true;
  };

  const finish = () => {
    if (!g) return;
    const gesture = g;
    g = null;
    if (gesture.mode === "drag") {
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 0);
      settle(chooseSnap({ height: gesture.height, velocity: releaseVelocity(gesture.samples), snaps: getSnaps() }));
      return;
    }
    if (!gesture.mode && gesture.onHandle) {
      // A tap on the grab bar: half ↔ full.
      const snaps = getSnaps();
      const full = snaps[snaps.length - 1];
      settle(getHeight() >= full - 2 ? snaps[1] : full);
    }
  };

  const onTouchStart = (e) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target, e.timeStamp); };
  const onTouchMove = (e) => {
    if (!g || e.touches.length !== 1) return;
    if (update(e.touches[0].clientX, e.touches[0].clientY, e.target, e.timeStamp) && e.cancelable) e.preventDefault();
  };
  const onTouchEnd = () => finish();

  // Mouse (and pen) for desktop browsers narrowed to phone width; touch is
  // handled above so a fully-open list can still scroll natively.
  const onPointerDown = (e) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    begin(e.clientX, e.clientY, e.target, e.timeStamp);
    if (!g) return;
    const move = (ev) => { if (update(ev.clientX, ev.clientY, ev.target, ev.timeStamp)) ev.preventDefault(); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); finish(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // A drag that ends over a button must not also press it.
  const onClickCapture = (e) => {
    if (!swallowClick) return;
    e.stopPropagation();
    e.preventDefault();
  };

  wrap.addEventListener("touchstart", onTouchStart, { passive: true });
  wrap.addEventListener("touchmove", onTouchMove, { passive: false });
  wrap.addEventListener("touchend", onTouchEnd);
  wrap.addEventListener("touchcancel", onTouchEnd);
  wrap.addEventListener("pointerdown", onPointerDown);
  wrap.addEventListener("click", onClickCapture, true);
  return () => {
    wrap.removeEventListener("touchstart", onTouchStart);
    wrap.removeEventListener("touchmove", onTouchMove);
    wrap.removeEventListener("touchend", onTouchEnd);
    wrap.removeEventListener("touchcancel", onTouchEnd);
    wrap.removeEventListener("pointerdown", onPointerDown);
    wrap.removeEventListener("click", onClickCapture, true);
  };
}
