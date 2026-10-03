// A bottom sheet that follows the finger — and settles like a physical object.
//
// While a finger is down the sheet is moved by writing a CSS variable straight
// to the element: no React render per frame, and the move itself is a GPU
// transform (app.css), so it keeps up at 60fps however much the sheet holds.
//
// On release it doesn't play a fixed-length animation. A spring takes over
// with the finger's own speed, so a hard flick races to its stop with a hint
// of overshoot and a gentle release eases in — and the sheet can be caught
// again mid-flight, carrying on from wherever it is. With Reduce Motion on, it
// goes straight to its resting height.

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

// The settling spring. Slightly under-damped: a fast flick overshoots by a few
// pixels and comes back, which is what makes it read as physical.
export const SPRING = { stiffness: 420, damping: 0.72 };

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

// One step of a damped spring (mass 1). x and target in px, v in px/s, dt in s.
// Semi-implicit Euler: stable at the frame rates a phone actually delivers.
export function springStep({ x, v, target, dt, stiffness = SPRING.stiffness, damping = SPRING.damping }) {
  const c = 2 * damping * Math.sqrt(stiffness);
  const accel = -stiffness * (x - target) - c * v;
  const nextV = v + accel * dt;
  return { x: x + nextV * dt, v: nextV };
}

// Resting heights fitted to what the sheet holds, rather than fixed fractions
// of the screen: the peek stops just below the start and destination, and the
// middle stop just below the best route's card — so neither ever cuts a card
// in half. base is [peek, half, full]; *Bottom are px from the sheet's top.
// When the whole card won't fit, its headline row (duration, route type and
// lines) is what the middle stop shows instead: this far below its top.
const CARD_HEADLINE_PX = 104;

export function fitSnaps(base, { peekBottom, halfBottom, halfTop } = {}) {
  const full = base[2];
  const peek = Number.isFinite(peekBottom) && peekBottom > 0
    ? Math.round(Math.min(Math.max(peekBottom + 12, 140), full * 0.45))
    : base[0];
  let half = base[1];
  // Only a height that leaves a real step either side counts.
  const usable = (h) => h >= peek + 120 && h <= full - 90;
  const whole = Number.isFinite(halfBottom) && halfBottom > 0 ? Math.round(halfBottom + 16) : null;
  const headline = Number.isFinite(halfTop) && halfTop > 0 ? Math.round(halfTop + CARD_HEADLINE_PX) : null;
  if (whole != null && usable(whole)) half = whole;
  else if (headline != null && usable(headline)) half = headline;
  if (half <= peek + 60) half = Math.round((peek + full) / 2);
  return [peek, half, full];
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Wires the gesture to a sheet. Returns { detach, snapTo }.
//   wrap      the element whose --sheet-visible sets how much shows
//   handle    the grab bar: a tap on it toggles between half and full
//   scroller  the content that scrolls when the sheet is fully open
//   getSnaps  () => [peek, half, full] in px
//   getHeight () => the committed visible height
//   onSettle  (height) => commit the resting height to app state
export function attachSheetGesture({ wrap, handle, scroller, getSnaps, getHeight, onSettle, enabled = () => true }) {
  let g = null;
  let swallowClick = false;
  let anim = null; // { raf, x, v, target }

  const visibleNow = () => {
    if (anim) return anim.x;
    const host = wrap.parentElement.getBoundingClientRect();
    return Math.max(0, host.bottom - wrap.getBoundingClientRect().top);
  };
  const show = (height) => wrap.style.setProperty("--sheet-visible", `${Math.round(height * 10) / 10}px`);
  const stopAnim = () => {
    if (anim) cancelAnimationFrame(anim.raf);
    anim = null;
  };
  const rest = (height) => {
    stopAnim();
    show(height);
    delete wrap.dataset.dragging;
    onSettle(height);
  };

  // Spring from the current height to target, starting at velocity px/ms.
  const springTo = (target, velocity = 0) => {
    stopAnim();
    const from = visibleNow();
    if (reducedMotion()) { rest(target); return; }
    wrap.dataset.dragging = "1"; // the spring drives it; no CSS transition on top
    anim = { raf: 0, x: from, v: velocity * 1000, target };
    let last = performance.now();
    const frame = (now) => {
      if (!anim) return;
      // Long frames (a tab switch) are capped so the spring can't explode.
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
      last = now;
      const next = springStep({ x: anim.x, v: anim.v, target: anim.target, dt });
      anim.x = next.x;
      anim.v = next.v;
      if (Math.abs(anim.x - anim.target) < 0.5 && Math.abs(anim.v) < 20) { rest(anim.target); return; }
      show(anim.x);
      anim.raf = requestAnimationFrame(frame);
    };
    anim.raf = requestAnimationFrame(frame);
  };

  // A short tick when the sheet settles somewhere new. Android honours it; iOS
  // has no web vibration and simply ignores the call.
  const tick = () => { try { navigator.vibrate?.(8); } catch { /* not allowed here */ } };

  const nearestIndex = (height, snaps) => snaps.reduce((best, s, i) => (Math.abs(s - height) < Math.abs(snaps[best] - height) ? i : best), 0);

  // t is the input event's own timestamp: a flick's speed is when the finger
  // moved, not when a busy main thread got round to handling it.
  const begin = (x, y, target, t) => {
    if (!enabled()) return;
    if (target.closest("input, textarea, select, [contenteditable], [data-no-sheet-drag]")) return;
    // A button inside the grab bar (close) is its own tap, not a handle tap.
    const onHandle = !!handle && handle.contains(target) && !target.closest("button");
    // Catching the sheet mid-flight: it stops under the finger and carries on
    // from there, rather than jumping back to where the spring started.
    const startH = visibleNow();
    const caught = !!anim;
    stopAnim();
    if (caught) { wrap.dataset.dragging = "1"; show(startH); }
    g = { startX: x, startY: y, startH, height: startH, mode: caught ? "drag" : null, samples: [{ y, t }], onHandle, caught };
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
    const snaps = getSnaps();
    if (gesture.mode === "drag") {
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 0);
      const velocity = releaseVelocity(gesture.samples);
      const target = chooseSnap({ height: gesture.height, velocity, snaps });
      if (nearestIndex(target, snaps) !== nearestIndex(gesture.startH, snaps)) tick();
      springTo(target, velocity);
      return;
    }
    if (gesture.caught) { springTo(chooseSnap({ height: gesture.startH, snaps })); return; }
    if (!gesture.mode && gesture.onHandle) {
      // A tap on the grab bar: half ↔ full.
      const full = snaps[snaps.length - 1];
      springTo(getHeight() >= full - 2 ? snaps[1] : full);
      tick();
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
  return {
    // For the keyboard and screen readers: the same spring, to a given height.
    snapTo: (height) => { springTo(height); tick(); },
    detach: () => {
      stopAnim();
      wrap.removeEventListener("touchstart", onTouchStart);
      wrap.removeEventListener("touchmove", onTouchMove);
      wrap.removeEventListener("touchend", onTouchEnd);
      wrap.removeEventListener("touchcancel", onTouchEnd);
      wrap.removeEventListener("pointerdown", onPointerDown);
      wrap.removeEventListener("click", onClickCapture, true);
    },
  };
}
