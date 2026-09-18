// Turn-by-turn progress: where the traveller is on the route, which step that
// makes current, and how much of the journey is left.
//
// The rules here exist because the alternative — reading each GPS fix fresh and
// mapping distance straight onto time — makes the countdown and the station
// flicker back and forth:
//
//   * a fix vaguer than the corridor it's meant to place you in is ignored;
//   * a fix too far from the line is off-route: progress holds where it was
//     rather than snapping somewhere wrong;
//   * a fix is only matched within a window ahead of the last known progress,
//     bounded by how fast anything on the network can travel, so a route that
//     doubles back on itself can't jump the reading forwards or backwards;
//   * progress never decreases, so ordinary GPS jitter can't rewind the ETA;
//   * distance is converted to time *per leg*, using each leg's own share of
//     the geometry — half the metres of a trip is not half its minutes when
//     one leg is a walk and the next is a train.

// Explicit extension: this module is also loaded straight by node --test.
import { pathMetrics, locateAt, projectOnPath } from "./geometry.js";

const MAX_ACCURACY_M = 150; // a fix vaguer than this says nothing useful
const OFF_ROUTE_M = 250;
const BACK_WINDOW_M = 60;
const MAX_SPEED_MPS = 35; // ~126 km/h — faster than any service here runs
const MIN_AHEAD_M = 300;

export const STALE_FIX_MS = 45000;

export function totalSecsOf(route) {
  return ((route && route.steps) || []).reduce((a, s) => a + (s.secs || 0), 0);
}

function spansUsable(route) {
  const steps = (route && route.steps) || [];
  const spans = (route && route.legSpans) || [];
  return spans.length === steps.length && spans.some(Boolean);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Which step the clock alone puts you on.
export function stepAtTime(route, elapsedSecs) {
  const steps = (route && route.steps) || [];
  const total = totalSecsOf(route);
  if (!steps.length || !total) return { stepIdx: 0, stepFrac: 0, stepRemainSecs: 0, elapsedSecs: 0, totalSecs: total, remainSecs: total };
  const e = clamp(elapsedSecs || 0, 0, total);
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    const secs = steps[i].secs || 0;
    if (e < acc + secs || i === steps.length - 1) {
      return {
        stepIdx: i,
        stepFrac: secs ? clamp((e - acc) / secs, 0, 1) : 0,
        stepRemainSecs: Math.max(0, acc + secs - e),
        elapsedSecs: e,
        totalSecs: total,
        remainSecs: Math.max(0, total - e),
      };
    }
    acc += secs;
  }
  return { stepIdx: steps.length - 1, stepFrac: 1, stepRemainSecs: 0, elapsedSecs: total, totalSecs: total, remainSecs: 0 };
}

// Metres into the route a given elapsed time reaches, following each leg's own
// share of the geometry.
export function alongMAtTime(route, elapsedSecs) {
  const geometry = (route && route.geometry) || [];
  const { cum, total } = pathMetrics(geometry);
  if (!total) return 0;
  if (!spansUsable(route)) {
    const t = totalSecsOf(route);
    return t ? clamp(elapsedSecs / t, 0, 1) * total : 0;
  }
  const at = stepAtTime(route, elapsedSecs);
  const span = route.legSpans[at.stepIdx];
  if (!span) return clamp(at.elapsedSecs / (at.totalSecs || 1), 0, 1) * total;
  const startM = cum[span.from];
  const endM = cum[span.to];
  return startM + (endM - startM) * at.stepFrac;
}

// The inverse: what a position this far into the route means for the clock.
export function timeAtAlongM(route, alongM) {
  const steps = (route && route.steps) || [];
  const geometry = (route && route.geometry) || [];
  const totalSecs = totalSecsOf(route);
  const { cum, total } = pathMetrics(geometry);
  if (!steps.length || !totalSecs || !total) {
    return { stepIdx: 0, stepFrac: 0, stepRemainSecs: 0, elapsedSecs: 0, totalSecs, remainSecs: totalSecs };
  }
  const d = clamp(alongM || 0, 0, total);
  if (!spansUsable(route)) return stepAtTime(route, (d / total) * totalSecs);

  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    const secs = steps[i].secs || 0;
    const span = route.legSpans[i];
    if (!span) {
      acc += secs;
      continue;
    }
    const startM = cum[span.from];
    const endM = cum[span.to];
    const last = i === steps.length - 1;
    if (d < endM || last) {
      const legFrac = endM > startM ? clamp((d - startM) / (endM - startM), 0, 1) : 1;
      const elapsed = acc + secs * legFrac;
      return {
        stepIdx: i,
        stepFrac: legFrac,
        stepRemainSecs: Math.max(0, secs * (1 - legFrac)),
        elapsedSecs: elapsed,
        totalSecs,
        remainSecs: Math.max(0, totalSecs - elapsed),
      };
    }
    acc += secs;
  }
  return { stepIdx: steps.length - 1, stepFrac: 1, stepRemainSecs: 0, elapsedSecs: totalSecs, totalSecs, remainSecs: 0 };
}

// Fold a new GPS fix into the progress carried so far.
// Returns { progress, status } where status is one of:
//   ok | vague | off-route | no-route | no-fix
// and `progress` is unchanged from `prev` for every status but `ok`.
export function acceptFix(prev, fix, route, startedAt) {
  const geometry = (route && route.geometry) || [];
  if (!fix || !fix.coords) return { progress: prev || null, status: "no-fix" };
  // A route with no usable line (some replies carry placeholder geometry) can't
  // place anyone: say so, so the caller falls back to the clock rather than
  // reporting the traveller as permanently off-route.
  if (geometry.length < 2 || !pathMetrics(geometry).total) return { progress: prev || null, status: "no-route" };
  if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return { progress: prev || null, status: "vague" };

  const at = fix.at || Date.now();
  const since = Math.max(0, at - ((prev && prev.at) || startedAt || at));
  // The first fix has no prior belief to protect, so it may match anywhere on
  // the route — a trip started mid-journey still locks on. Afterwards the
  // window applies, bounded by how far anything could have travelled since.
  const bounds = prev
    ? { fromM: prev.alongM, backM: BACK_WINDOW_M, aheadM: MIN_AHEAD_M + (since / 1000) * MAX_SPEED_MPS }
    : {};
  const match = projectOnPath(geometry, fix.coords, {
    ...bounds,
    // A fix is allowed to sit its own accuracy away from the line before we
    // call it off-route — a 100 m-accurate fix genuinely could be on it.
    maxOffsetM: OFF_ROUTE_M + Math.min(fix.accuracy || 0, MAX_ACCURACY_M),
  });
  if (!match) return { progress: prev || null, status: "off-route" };

  // Forward only: jitter must not rewind the countdown.
  const alongM = prev ? Math.max(prev.alongM, match.alongM) : match.alongM;
  return { progress: { alongM, at, offsetM: match.offsetM }, status: "ok" };
}

// Where to draw the dot / centre the map for a given progress.
export function coordAt(route, alongM) {
  const at = locateAt((route && route.geometry) || [], alongM);
  return at ? at.coord : null;
}
