import { Component } from "react";
import { searchPlaces } from "../api/onemap";
import { getTrainServiceAlerts } from "../api/lta";
import { getTripOptions } from "../api/trips";
import { getCrowding } from "../api/crowding";
import { getNearestStop } from "../api/stop";
import { getArrivals } from "../api/arrivals";
import { arrivalKeys, detailRows } from "../lib/tripDetail";
import { commuteOutlook, outlookCodes } from "../lib/outlook";
import { worksLabel, worksDetail, mitigationsFor, roadWorksOnRoute, roadWorkLabel, roadWorkDetail, busChangesOnRoute, busChangeLabel, busChangeDetail } from "../lib/planned";
import { loadJourneys, recordJourney, completeJourney, clearJourneys, journeySummary, seedSampleJourneys } from "../lib/journeys";
import { inferCommutes, commuteFromPattern, evidenceLine, staleCommutes, RETIRE_MS } from "../lib/patterns";
import { canonicalLine, sameLine } from "../lib/lines";
import { learnedPlaces, linesForPlaces } from "../lib/places";
import { getPlannedWorks } from "../api/planned";
import { getWeather } from "../api/weather";
import { getRoadConditions } from "../api/road";
import { analyseCommuteMemory, rankRouteOptions } from "../api/ai";
import { worstBandOn, roadLine, incidentNear } from "../lib/roadConditions";
import { personaOf, personaList, scenarioCommute, scenarioDeparture, routeFitReason, modeFor, shouldInterrupt, reasonFor, DEFAULT_PERSONA } from "../lib/persona";
import { forecastAt, nowcastAt, weatherLine, isWet, walkAdjustment, rankRoutesForWeather, routeWeatherProfile, weatherIconName, singaporeDayPhase } from "../lib/weather";
import { submitReport, loadReportGroups as fetchReportGroups, loadMyReports as fetchMyReports } from "../api/reports";
import { groupsFromCounts } from "../lib/confidence";
import { requestNotify, showNotification, scheduleLeaveAlert, notifySupported } from "../lib/notify";
import { getForecast } from "../api/forecast";
import { getPosition, watchPosition, clearWatch, messageForError, getLastPosition } from "../lib/geolocation";
import { acceptFix, alongMAtTime, coordAt, stepAtTime, timeAtAlongM, STALE_FIX_MS } from "../lib/navProgress";
import { metresBetween } from "../lib/geometry";
import { resolveRouteOrigin } from "../lib/routeOrigin";
import { routeFailure, routeRecoveryModes } from "../lib/routeFailure";
import { addressDetail, durationLabel, forecastSlots, singaporeClock } from "../lib/display";
import {
  KEYS, loadStored, store, rememberSearch, recentSearches, clearSearches,
  loadReadAlerts, markAlertsRead, alertId, loadSavedPlaces, saveSavedPlaces,
  savedPlaceDetail, loadPreferences, clearAllUserData,
} from "../lib/storage";

const ONBOARDED_KEY = KEYS.onboarded;
const COMMUTES_KEY = KEYS.commutes;

// A neutral Singapore-wide fallback. If the user has explicitly saved a
// verified Home, that is a better local-only origin until they request GPS.
const ORIGIN_FALLBACK = [1.3521, 103.8198];

// How far the traveller has to move before the journey is worth re-planning,
// and before the map follows them rather than holding still.
const REPLAN_DRIFT_M = 150;
const MAP_FOLLOW_M = 120;

// A watched commute's preference, in the planner's own vocabulary.
const COMMUTE_MODES = { Fastest: "fast", Comfort: "quiet", "Step-free": "step" };

// How long before the leave time the reminder fires.
const LEAVE_ALERT_LEAD_MINS = 10;

// How often the service alerts are re-read while the app is open. There is no
// service worker here, so nothing is checked while it is closed — the catch-up
// line on reopening is the honest substitute.
const ALERT_POLL_MS = 3 * 60 * 1000;

// Demo builds get two extra affordances: recorded answers when a live call
// fails, and a way to seed the memory. Off unless VITE_DEMO_MODE says so.
const DEMO_MODE = (() => {
  try {
    return String(import.meta.env.VITE_DEMO_MODE || "").toLowerCase() === "1";
  } catch {
    return false;
  }
})();

// Ported from the Onward.dc.html prototype's embedded view-model script,
// almost verbatim. Every screen's render() calls `this.renderVals()` and
// reads off the same keys the prototype's `{{ }}` template bindings used, so
// this file stays the single source of truth for what each screen shows and
// how it behaves — only the render/JSX layer changed medium.
export const CROWD = { light: "var(--crowd-light)", moderate: "var(--crowd-moderate)", busy: "var(--crowd-busy)" };
export const WORD = { light: "Light", moderate: "Moderate", busy: "Busy" };

function nearbyDistance(metres) {
  if (!Number.isFinite(metres)) return "";
  if (metres < 1000) return `${Math.max(10, Math.round(metres / 10) * 10)} m away`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km away`;
}

function confirmedPointTotal(reports) {
  return (reports || [])
    .filter((report) => report && report.state === "confirmed")
    .reduce((sum, report) => sum + Math.max(0, Number(report.points) || 0), 0);
}

function redeemedPointTotal(redemptions) {
  return (redemptions || []).reduce((sum, redemption) => sum + Math.max(0, Number(redemption?.cost) || 0), 0);
}

export class AppLogic extends Component {
  initialPreferences = (() => {
    const prefs = loadPreferences();
    // Onboarding already asks how someone travels. Reading a persona out of
    // that beats making them answer the same question twice — they can still
    // change it on the Today tab.
    if (!prefs.persona) {
      prefs.persona = prefs.stepFree ? "stepFree" : prefs.avoidCrowds || prefs.lessWalking ? "flexible" : DEFAULT_PERSONA;
    }
    return prefs;
  })();
  state = {
    savedList: loadStored(COMMUTES_KEY, []),
    savedPlaces: loadSavedPlaces(),
    routingPreferences: this.initialPreferences,
    addEdit: null, placesOpen: false,
    addOpen: false, addFrom: "home", addTo: "work", addDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    addMode: "Comfort", addMins: 462, addWhen: "leave", fcSlot: 0, fcPin: null, fcAlerts: false, fcWatch: [], crowdOn: false,
    hoverTab: null, pressTab: null, sheetH: 430, sheetDrag: false, navRoute: null, navStart: null,
    navPage: 0, stepsDrag: false, pin: null,
    screen: loadStored(ONBOARDED_KEY, false) ? "map" : "intro",
    introScenario: null,
    rep: "pick", repType: null, sev: 1, rewardRedemptions: loadStored(KEYS.rewardRedemptions, []), toast: null, tick: 0,
    planned: { works: [], roadWorks: [], busChanges: [], pending: true, error: null },
    weather: { nowcast: null, outlook: null, pending: true, error: null },
    road: { bands: [], incidents: [], pending: true, error: null },
    reportGroups: { groups: [], configured: true, pending: true, error: null },
    myReports: [],
    photo: null, cameraOpen: false, reportBusy: false, reportResult: null,
    navPhoto: null, navCameraOpen: false,
    query: "", dest: null, routeOrigin: null, searchTarget: "dest", searchOpen: false, tripAvoid: null, tripAvoidStations: null, tripDeparture: null, tripMode: "transit", tripRoute: 0, tripCollapsed: true,
    userLoc: null, userAccuracy: null, userFixAt: null, locating: false, routeLocationPending: false, recenterToken: 0,
    // Turn-by-turn progress, advanced only by fixes good enough to trust.
    navProgress: null, navFixStatus: null,
    // Remote data, each held with its own pending/error so screens can say
    // exactly what is missing instead of showing invented values.
    trips: { key: null, options: [], pending: false, error: null },
    // Live bus arrivals keyed "<stopCode>:<service>", refreshed while the
    // route sheet is open so the times on the cards tick down.
    arrivals: {},
    // Today's outlook for the next watched commute: its journey, the forecast
    // for the stations it passes, and why either is missing.
    outlook: { key: null, itinerary: null, forecast: null, pending: false, error: null },
    // What Solvik has learned from trips you took, all of it on this device.
    journeys: loadJourneys(),
    patternsRejected: loadStored(KEYS.patternsRejected, []),
    justAdded: null,
    // Remembered between visits: where you've been, and which alerts you read.
    recents: recentSearches(),
    aiMemory: loadStored(KEYS.aiMemory, null),
    aiMemoryStatus: "idle",
    aiRoute: { key: null, pending: false, decision: null, error: null, configured: null },
    readAlerts: loadReadAlerts(),
    crowd: { stations: [], slots: [], at: null, pending: false, error: null },
    faults: { items: [], pending: false, error: null },
    stop: { data: null, pending: false, error: null, requested: false },
  };

  effectiveRouteOrigin() {
    return resolveRouteOrigin({
      selected: this.state.routeOrigin,
      userLoc: this.state.userLoc,
      home: this.state.savedPlaces?.home,
    });
  }

  currentOrigin() {
    return this.effectiveRouteOrigin()?.ll || ORIGIN_FALLBACK;
  }

  setCrowdBarRef = (element) => {
    if (this._crowdBar === element) return;
    this._crowdBarObserver?.disconnect();
    this._crowdBar = element;
    if (!element) return;
    const measure = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (this.state.crowdBarHeight !== height) this.setState({ crowdBarHeight: height });
    };
    this._crowdBarObserver = new ResizeObserver(measure);
    this._crowdBarObserver.observe(element);
    measure();
  };

  // Centre the map on the real position and adopt it as the trip origin. Every
  // press recentres, not just the first: the watch is already delivering fixes,
  // so a recent one is used straight away, and only a cold start waits on a new
  // one — asking the device for a brand-new fix on every press can take many
  // seconds indoors, or time out entirely.
  locateMe = () => {
    const last = getLastPosition();
    if (last && Date.now() - last.at < 15000) {
      this._mapCenter = last.coords;
      this._mapCenterReal = true;
      this.applyFix(last, (st) => ({ locating: false, recenterToken: st.recenterToken + 1, fcPin: null }));
      return;
    }
    this.requestCurrentLocation(true, true).catch(() => {});
  };

  // Everything that arrives from the geolocation API lands here, so a fix
  // updates the position and the trip progress in one state change.
  applyFix = (fix, extra) => {
    this.setState((st) => {
      const next = {
        userLoc: fix.coords,
        userAccuracy: fix.accuracy,
        userFixAt: fix.at || Date.now(),
        ...(typeof extra === "function" ? extra(st) : extra || {}),
      };
      if (st.screen === "nav" && st.navTrip) {
        const { progress, status } = acceptFix(st.navProgress, fix, st.navTrip, st.navStart);
        next.navProgress = progress;
        next.navFixStatus = status;
      }
      return next;
    });
  };

  requestCurrentLocation = (recenter = false, force = false) => {
    if (!force && this.state.userLoc) return Promise.resolve(this.state.userLoc);
    if (this._locationPromise) return this._locationPromise;

    this.setState({ locating: true });
    this._locationPromise = getPosition(force ? { maximumAge: 5000 } : undefined)
      .then((fix) => {
        if (recenter) {
          this._mapCenter = fix.coords;
          this._mapCenterReal = true;
        }
        this.applyFix(fix, (st) => ({
          locating: false,
          recenterToken: recenter ? st.recenterToken + 1 : st.recenterToken,
          fcPin: recenter ? null : st.fcPin,
        }));
        return fix.coords;
      })
      .catch((err) => {
        this.setState({ locating: false });
        if (recenter) this.flash(messageForError(err && err.code));
        throw err;
      })
      .finally(() => {
        this._locationPromise = null;
      });
    return this._locationPromise;
  };

  // Only places the user actually told us about, plus anything they've
  // searched for in the Add sheet. Nothing invented. A place carries a
  // coordinate only once it has been verified through OneMap search, and a
  // commute can't be planned until both of its ends have one.
  placeList(state) {
    const s = state || this.state;
    const savedPlaces = s.savedPlaces || {};
    return [
      savedPlaces.home && { id: "home", label: "Home", place: savedPlaceDetail(savedPlaces.home), ll: savedPlaces.home.ll },
      savedPlaces.work && { id: "work", label: "Work", place: savedPlaceDetail(savedPlaces.work), ll: savedPlaces.work.ll },
      savedPlaces.school && { id: "school", label: "School", place: savedPlaceDetail(savedPlaces.school), ll: savedPlaces.school.ll },
    ]
      .filter(Boolean)
      .concat(s.addExtra || [])
      // Commutes Solvik learned carry their own endpoints, so they can be
      // planned without depending on a saved place that may never be created.
      .concat(
        (s.savedList || []).flatMap((c) => [c.fromPlace, c.toPlace].filter((p) => p && p.id && Array.isArray(p.ll)))
      )
      .filter((place, i, all) => all.findIndex((p) => p.id === place.id) === i);
  }

  // The commute coming up next, by clock time, wrapping past midnight.
  nextCommute() {
    const list = this.state.savedList || [];
    if (!list.length) return null;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    // An arrive-by commute is anchored at its arrival, so it comes up earlier
    // than that clock time suggests — a rough allowance keeps the ordering sane
    // before the real journey time is known.
    const anchor = (c) => (c.arriveBy != null ? c.arriveBy - 45 : c.mins);
    return list
      .slice()
      .sort((a, b) => ((anchor(a) - nowMins + 1440) % 1440) - ((anchor(b) - nowMins + 1440) % 1440))[0];
  }

  // Plan the next commute and fetch the forecast for the stations it passes.
  // Both halves are real requests; neither is substituted when it fails.
  // The service alert, if any, that names a line this itinerary rides. Shared by
  // the card and the reroute loader so both agree on what counts as disrupted —
  // matched by canonical line code, since LTA and OneMap spell them differently.
  disruptingAlerts(itinerary) {
    const labels = (itinerary && itinerary.legs) || [];
    if (!labels.length) return [];
    return ((this.state.faults && this.state.faults.items) || []).filter(
      (item) => canonicalLine(item.line) && labels.some((label) => sameLine(label, item.line))
    );
  }

  // Your line is down — so plan the same trip again without it. OneMap has no
  // banned-routes parameter, so /api/trip-options asks for more itineraries than
  // it needs and drops the ones still using the broken line.
  //
  // Only ever for the commute you are about to make. Keyed on the outlook and
  // the alert together, so a three-minute alert poll doesn't re-request a
  // reroute it already has.
  loadReroute = () => {
    const outlook = this.state.outlook || {};
    const itinerary = outlook.itinerary;
    if (!itinerary || outlook.pending) return;
    const alert = this.disruptingAlerts(itinerary)[0];
    const current = this.state.reroute || {};
    if (!alert) {
      if (current.key) this.setState({ reroute: {} });
      return;
    }
    const key = `${outlook.key || ""}|${alert.id}`;
    if (current.key === key) return;

    const next = this.nextCommute();
    const places = this.placeList();
    const from = next && places.find((p) => p.id === next.from);
    const to = next && places.find((p) => p.id === next.to);
    if (!from || !to || !from.ll || !to.ll) return;

    this.setState({ reroute: { key, line: alert.line, alertId: alert.id, pending: true, option: null, avoided: null, error: null } });
    getTripOptions(from.ll, to.ll, "reroute", to.label, { avoid: alert.line })
      .then((options) => {
        if ((this.state.reroute || {}).key !== key) return;
        this.setState({
          reroute: {
            key, line: alert.line, alertId: alert.id, pending: false, error: null,
            option: (options || [])[0] || null,
            avoided: options.avoided || null,
          },
        });
      })
      .catch((err) => {
        if ((this.state.reroute || {}).key !== key) return;
        this.setState({ reroute: { key, line: alert.line, alertId: alert.id, pending: false, option: null, avoided: null, error: String(err.message || err) } });
      });
  };

  // Planned works, read once on opening and then left alone: lift maintenance
  // changes over days, not minutes, so re-asking on the alert poll would be
  // three requests an hour for an answer that does not move.
  loadPlanned = () => {
    getPlannedWorks()
      .then((data) => this.setState({ planned: { ...data, pending: false, error: null } }))
      .catch((err) => this.setState({ planned: { works: [], roadWorks: [], busChanges: [], pending: false, error: String(err.message || err) } }));
  };

  // The planned works that fall on the stations this journey actually passes
  // through. Matched by station code, not by line: a lift out at Bishan matters
  // if you go through Bishan, and not otherwise.
  worksOnRoute(itinerary) {
    const works = ((this.state.planned || {}).works) || [];
    if (!itinerary || !works.length) return [];
    const codes = new Set(outlookCodes([itinerary]).map((c) => String(c).toUpperCase()));
    return works.filter((w) => codes.has(String(w.stationCode).toUpperCase()));
  }

  // The station codes LTA is currently naming itself, from either feed. A
  // commuter report at one of these is not a rumour any more — it is the
  // official record catching up, which is the strongest thing this app can say
  // about a report and costs nothing, because both feeds are already fetched.
  ltaNamedStations() {
    const works = ((this.state.planned || {}).works || []).map((w) => String(w.stationCode).toUpperCase());
    const alerts = ((this.state.faults && this.state.faults.items) || []).flatMap((f) => f.stations || []);
    return [...new Set([...works, ...alerts])];
  }

  // Read once on opening and every half hour: the nowcast covers two hours and
  // the outlook is issued a few times a day, so asking more often would be
  // traffic for an answer that has not moved.
  loadWeather = () => {
    getWeather()
      .then((data) => this.setState({ weather: { ...data, pending: false, error: null } }))
      .catch((err) => this.setState({ weather: { nowcast: null, outlook: null, pending: false, error: String(err.message || err) } }));
  };

  // Speed bands move on a five-minute cadence, so this rides the same slow
  // timer as the weather rather than polling on its own.
  loadRoad = () => {
    getRoadConditions()
      .then((data) => this.setState({ road: { ...data, pending: false, error: null } }))
      .catch((err) => this.setState({ road: { bands: [], incidents: [], pending: false, error: String(err.message || err) } }));
  };

  loadReportGroups = () => {
    fetchReportGroups()
      .then(({ groups, configured }) => this.setState({ reportGroups: { groups, configured, pending: false, error: null } }))
      .catch((err) => this.setState({ reportGroups: { groups: [], configured: true, pending: false, error: String(err.message || err) } }));
    fetchMyReports()
      .then((myReports) => this.setState({ myReports }))
      .catch(() => {});
  };

  // Filing one. Everything the server needs to judge it travels with it: where
  // the device thinks it is, how sure it is of that, and when the shutter fired.
  // The photo goes too, and is discarded after the check — it is never stored.
  submitReportNow = async () => {
    const s = this.state;
    const photo = s.photo;
    if (!photo || s.reportBusy) return;
    const kind = s.repType;

    this.setState({ reportBusy: true, reportResult: null });
    try {
      // Submission used to silently return when the stop had not already been
      // resolved. Resolve it here from a fresh fix instead: the green button
      // must never be an apparent no-op, and an old fix can fail the freshness
      // gate while someone is taking the photo.
      const fix = await getPosition({ maximumAge: 0 });
      this.applyFix(fix);
      const stop = await getNearestStop(fix.coords[0], fix.coords[1]);
      this.setState({ stop: { data: stop, pending: false, error: null, requested: true } });

      const result = await submitReport({
        kind,
        stationCode: stop.code,
        stationName: stop.name,
        lat: fix.coords[0],
        lng: fix.coords[1],
        accuracy: fix.accuracy,
        fixAt: fix.at,
        capturedAt: photo.capturedAt,
        photo: photo.dataUrl,
      });
      // The photo is dropped from state the moment it has been checked. It is
      // not stored on the server either.
      this.setState({ reportBusy: false, reportResult: result, photo: null, rep: "done" });
      this.flash(result.verdict === "accepted" ? `Saved locally · ${result.points} points` : "Not saved");
      if (result.verdict === "accepted") this.loadReportGroups();
    } catch (err) {
      // Shown on the result screen, not just flashed: leaving the reporter on
      // the form with a vanishing toast is how a failure reads as a bug.
      this.setState({ reportBusy: false, rep: "done", reportResult: { verdict: "rejected", reason: String(err.message || err), checks: [] } });
    }
  };

  // Filed from the nav sheet, mid-journey. Same endpoint, same checks; the trip
  // keeps running either way.
  submitNavReport = () => {
    const s = this.state;
    const photo = s.navPhoto;
    if (!photo || !s.userLoc || s.reportBusy) return;
    this.setState({ reportBusy: true });
    submitReport({
      kind: s.nrType,
      stationName: "",
      lat: s.userLoc[0],
      lng: s.userLoc[1],
      accuracy: s.userAccuracy,
      fixAt: s.userFixAt,
      capturedAt: photo.capturedAt,
      photo: photo.dataUrl,
    })
      .then((result) => {
        this.setState({ reportBusy: false, navRepOpen: false, nrType: null, nrSev: null, navPhoto: null });
        this.flash(result.verdict === "accepted" ? `Saved locally · ${result.points} points` : result.reason || "Not saved");
        if (result.verdict === "accepted") this.loadReportGroups();
      })
      .catch((err) => {
        this.setState({ reportBusy: false });
        this.flash(String(err.message || err));
      });
  };

  // Road works and bus route changes that fall on this journey's own bus legs.
  // Matched by the road a stop sits on and by the service ridden — never by
  // proximity, for the same reason a lift is matched by station.
  roadEventsOnRoute(itinerary) {
    const planned = this.state.planned || {};
    if (!itinerary) return { roadWorks: [], busChanges: [] };
    const roads = (itinerary.steps || []).flatMap((step) => [step.road, step.fromRoad, step.toRoad]).filter(Boolean);
    const services = (itinerary.transitLegs || []).filter((l) => l.mode === "BUS").map((l) => l.service);
    return {
      roadWorks: roadWorksOnRoute(planned.roadWorks, roads),
      busChanges: busChangesOnRoute(planned.busChanges, services),
    };
  }

  // An alert is actionable when it names a rail line you use and there is a
  // commute with a known destination to re-plan towards.
  canRerouteFrom(alert) {
    if (!alert || !canonicalLine(alert.line)) return false;
    if (!this.myLines().some((used) => sameLine(used, alert.line))) return false;
    const next = this.nextCommute();
    if (!next) return false;
    const to = this.placeList().find((p) => p.id === next.to);
    return !!(to && to.ll);
  }

  rerouteFromAlert = (alert) => {
    const next = this.nextCommute();
    const places = this.placeList();
    const to = next && places.find((p) => p.id === next.to);
    const from = next && places.find((p) => p.id === next.from);
    if (!to || !to.ll) {
      this.flash("No commute to re-plan yet");
      return;
    }
    this.setState({ screen: "map", fcAlerts: false, tripMode: "reroute", tripAvoid: alert.line, tripAvoidStations: null });
    this.chooseDest(
      { name: to.label, detail: to.place, ll: to.ll, kind: "Commute" },
      from && from.ll ? { routeOrigin: { id: from.id, name: from.label, address: from.place, ll: from.ll } } : undefined
    );
    this.flash(`Planning around ${alert.line}`);
  };

  loadOutlook = () => {
    const next = this.nextCommute();
    const blank = { key: null, itinerary: null, forecast: null, pending: false, error: null };
    if (!next) {
      if ((this.state.outlook || blank).key) this.setState({ outlook: blank });
      return;
    }
    const places = this.placeList();
    const from = places.find((p) => p.id === next.from);
    const to = places.find((p) => p.id === next.to);
    const key = [next.from, next.to, next.mode, next.mins, next.arriveBy || ""].join("|");

    if (!from || !to || !from.ll || !to.ll) {
      const missing = [
        !from || !from.ll ? (from && from.label) || "the start" : null,
        !to || !to.ll ? (to && to.label) || "the destination" : null,
      ].filter(Boolean);
      this.setState({
        outlook: { ...blank, key, error: `Search for ${missing.join(" and ")} in Your places so this commute can be planned.` },
      });
      return;
    }
    const current = this.state.outlook || blank;
    if (current.key === key && (current.pending || current.itinerary)) return;

    this.setState({ outlook: { key, itinerary: null, forecast: null, pending: true, error: null } });
    getTripOptions(from.ll, to.ll, COMMUTE_MODES[next.mode] || "fast", to.label)
      .then(async (options) => {
        const itinerary = (options || [])[0];
        if (!itinerary) throw new Error("No route found for this commute right now.");
        let forecast = null;
        try {
          forecast = await getForecast(outlookCodes([itinerary]));
        } catch (err) {
          forecast = { slots: [], series: {}, live: {}, missing: [], error: String(err.message || err) };
        }
        if ((this.state.outlook || blank).key !== key) return;
        this.setState({ outlook: { key, itinerary, forecast, pending: false, error: null } }, this.loadReroute);
      })
      .catch((err) => {
        if ((this.state.outlook || blank).key !== key) return;
        this.setState({ outlook: { ...blank, key, error: String(err.message || err) } });
      });
  };

  // "Alert me" actually sets something: a timer that fires a notification a
  // few minutes before the leave time, for as long as Solvik stays open.
  armLeaveAlert = async (view, name) => {
    if (this._leaveCancel) {
      this._leaveCancel();
      this._leaveCancel = null;
    }
    if (!view) {
      this.flash("Nothing to alert on until this trip plans");
      return;
    }
    const key = (this.state.outlook && this.state.outlook.key) || "";
    const departAt = new Date();
    departAt.setHours(0, 0, 0, 0);
    departAt.setMinutes(view.departMins + (view.tomorrow ? 1440 : 0));

    const permission = await requestNotify();
    const lead = Math.min(LEAVE_ALERT_LEAD_MINS, Math.max(1, view.departIn - 1));
    const body = [
      `Leave at ${view.departLabel} for ${name}.`,
      view.worst ? `${view.worst.word} at ${view.worst.name} from ${view.worst.fromLabel}.` : null,
    ].filter(Boolean).join(" ");

    const cancel = scheduleLeaveAlert({
      departAt,
      leadMins: lead,
      onFire: () => {
        this.setState({ leaveAlert: null });
        if (!showNotification("Time to go", body)) this.flash(body);
      },
    });
    if (!cancel) {
      this.flash("That leave time has already passed");
      return;
    }
    this._leaveCancel = cancel;
    this.setState({ leaveAlert: { key, at: departAt.getTime(), lead } });
    this.flash(
      permission === "granted"
        ? `Alert set · ${lead} min before ${view.departLabel}, while Solvik is open`
        : notifySupported()
        ? `Alert set · ${lead} min before ${view.departLabel} (in-app only — notifications are blocked)`
        : `Alert set · ${lead} min before ${view.departLabel} (in-app only)`
    );
  };

  // The lines you actually use: from the commutes Solvik watches (learned or
  // your own) and the journeys you have taken. This is what an alert is
  // matched against, so a disruption three lines away stays quiet.
  myLines() {
    const fromCommutes = (this.state.savedList || []).flatMap((c) => c.legs || []);
    const fromJourneys = (this.state.journeys || []).filter((j) => j.started).flatMap((j) => j.legs || []);
    const fromOutlook = ((this.state.outlook && this.state.outlook.itinerary) || {}).legs || [];
    return [...new Set([...fromCommutes, ...fromJourneys, ...fromOutlook, ...linesForPlaces(this.myPlaces())].map((l) => String(l).toUpperCase()))];
  }

  // Somewhere you go regularly — two visits on two days is the whole bar,
  // because all this decides is whether a disruption is worth mentioning.
  // Derived from the journeys each time rather than stored, so forgetting the
  // journeys forgets these too.
  myPlaces() {
    return learnedPlaces(this.state.journeys || []);
  }

  alertTouchesMe(item) {
    return !!canonicalLine(item && item.line) && this.myLines().some((used) => sameLine(used, item.line));
  }

  // Which of your places this disruption sits on the way to. Being able to say
  // "that's your line to the office" is the point of learning places at all —
  // a bare line code means nothing until it is attached to somewhere you go.
  placesOnLine(item) {
    if (!canonicalLine(item && item.line)) return [];
    return this.myPlaces()
      .filter((place) => place.lines.some((line) => sameLine(line, item.line)))
      .map((place) => place.name)
      .filter(Boolean);
  }

  // Alerts are re-read while the app is open, and a new one on a line you use
  // interrupts you. One that doesn't, waits in the Alerts sheet.
  reviewAlerts = () => {
    const items = ((this.state.faults && this.state.faults.items) || []).filter((f) => f.id);
    if (!items.length) return;
    const seen = loadStored(KEYS.alertSeen, null);
    // First run: note what is already there instead of interrupting about
    // disruptions that may have been posted hours ago. Only what appears
    // afterwards is worth a notification.
    if (!seen) {
      store(KEYS.alertSeen, { ids: items.map((f) => f.id), at: Date.now() });
      return;
    }
    const known = new Set(seen.ids || []);
    const fresh = items.filter((f) => !known.has(f.id));
    const mine = fresh.filter((f) => this.alertTouchesMe(f));

    if (mine.length) {
      const first = mine[0];
      const body = mine.length === 1 ? first.title : `${first.title} · and ${mine.length - 1} more on your lines`;
      if (!showNotification(`${first.line} · ${first.tag}`, body)) this.flash(`${first.line}: ${first.title}`);
    }
    store(KEYS.alertSeen, { ids: items.map((f) => f.id), at: Date.now() });
    this.setState({ alertCatchUp: mine.length ? { count: mine.length, at: seen.at || null } : null });
  };

  startAlertPoll = () => {
    this.stopAlertPoll();
    this.alertIv = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      this.loadFaults();
    }, ALERT_POLL_MS);
  };
  stopAlertPoll = () => {
    if (this.alertIv) {
      clearInterval(this.alertIv);
      this.alertIv = null;
    }
  };

  // Record a journey the user actually began, and see whether it completes a
  // pattern. Everything written here stays in this browser.
  rememberJourney = (option) => {
    const dest = this.state.dest;
    const origin = this.effectiveRouteOrigin();
    if (!dest || !dest.ll) return;
    // A fresh start to the same place is a new journey, not the old one again.
    this._arrivalMarked = null;
    const journeys = recordJourney({
      fromLL: origin ? origin.ll : null,
      fromName: origin ? origin.name : null,
      toLL: dest.ll,
      toName: dest.name,
      mode: this.commuteModeLabel(),
      legs: (option && option.legs) || [],
      started: true,
    });
    this.setState({ journeys }, this.reviewPatterns);
  };

  // Arriving is what separates a trip taken from a tap abandoned.
  markArrived = () => {
    const dest = this.state.dest;
    if (!dest || !dest.ll || this._arrivalMarked === dest.name) return;
    this._arrivalMarked = dest.name;
    // Arrival is noticed while rendering the nav screen, so the write is
    // deferred rather than run inside render.
    setTimeout(() => this.setState({ journeys: completeJourney(dest.ll) }, this.reviewPatterns), 0);
  };

  // The planner's mode in the vocabulary a watched commute uses.
  commuteModeLabel() {
    const mode = this.state.tripMode;
    return { bus: "Bus", train: "Train", transit: "Transit", walk: "Walk", cycle: "Cycle", express: "Express" }[mode] || "Transit";
  }

  // The raw journey records remain in this browser. When Gemini is configured,
  // a small deliberate-trip summary is sent for preference analysis and only
  // the returned insight is stored locally. Deterministic pattern detection
  // below remains the authority for creating and retiring watched commutes.
  refreshAiMemory = () => {
    const journeys = (this.state.journeys || []).filter((journey) => journey?.started).slice(0, 40);
    if (journeys.length < 2) return;
    const payload = {
      persona: (this.state.routingPreferences || {}).persona || DEFAULT_PERSONA,
      preferences: this.state.routingPreferences || {},
      journeys: journeys.map((journey) => ({
        at: journey.at,
        fromName: journey.fromName,
        toName: journey.toName,
        mode: journey.mode,
        legs: journey.legs,
        completed: journey.completed,
      })),
    };
    const key = JSON.stringify(payload);
    if (key === this._aiMemoryKey) return;
    this._aiMemoryKey = key;
    this.setState({ aiMemoryStatus: "pending" });
    analyseCommuteMemory(payload)
      .then((result) => {
        if (this._aiMemoryKey !== key) return;
        if (!result?.configured) {
          this.setState({ aiMemoryStatus: "unconfigured" });
          return;
        }
        const insight = result.insight ? { ...result.insight, model: result.model || "Gemini" } : null;
        if (insight) store(KEYS.aiMemory, insight);
        this.setState({ aiMemory: insight, aiMemoryStatus: "ready" });
      })
      .catch(() => {
        if (this._aiMemoryKey === key) this.setState({ aiMemoryStatus: "unavailable" });
      });
  };

  routeEventsForAi(option) {
    const events = [];
    this.disruptingAlerts(option).forEach((item) => events.push(`${item.title}. ${item.detail || ""}`));
    this.worksOnRoute(option).forEach((item) => events.push(`${worksLabel(item)}. ${worksDetail(item)}`));
    const roadEvents = this.roadEventsOnRoute(option);
    (roadEvents.roadWorks || []).forEach((item) => events.push(`${roadWorkLabel(item)}. ${roadWorkDetail(item)}`));
    (roadEvents.busChanges || []).forEach((item) => events.push(`${busChangeLabel(item)}. ${busChangeDetail(item)}`));
    (option?.transitLegs || [])
      .filter((leg) => leg.mode === "BUS" && Number.isFinite(leg.fromLat) && Number.isFinite(leg.fromLng))
      .map((leg) => incidentNear((this.state.road || {}).incidents, [leg.fromLat, leg.fromLng]))
      .filter(Boolean)
      .forEach((item) => events.push(`${item.type || "Road incident"}. ${item.message || ""}`));
    return [...new Set(events)].slice(0, 6);
  }

  // Gemini ranks only the real itineraries already returned by OneMap. If it
  // is missing, rate-limited or invalid, the weather/persona rules continue to
  // rank the same cards exactly as before.
  refreshAiRouteDecision = () => {
    const s = this.state;
    const options = s.trips?.options || [];
    const origin = this.effectiveRouteOrigin()?.ll;
    if (!s.dest?.ll || !origin || !options.length || s.trips?.pending || s.trips?.recorded) {
      this._aiRouteRequestKey = null;
      if (s.aiRoute?.key || s.aiRoute?.pending || s.aiRoute?.decision) this.setState({ aiRoute: { key: null, pending: false, decision: null, error: null, configured: s.aiRoute.configured } });
      return;
    }
    const departureAt = s.tripDeparture?.at || Date.now();
    const payload = {
      persona: (s.routingPreferences || {}).persona || DEFAULT_PERSONA,
      preferences: s.routingPreferences || {},
      memory: s.aiMemory,
      weather: { pending: !!s.weather?.pending, available: !!(s.weather?.nowcast || s.weather?.outlook) },
      options: options.map((option) => {
        const weather = routeWeatherProfile({
          nowcast: s.weather?.nowcast,
          outlook: s.weather?.outlook,
          from: origin,
          to: s.dest.ll,
          departureAt,
          option,
        });
        return {
          minutes: option.mins,
          walkMinutes: Math.round((option.walkSecs || 0) / 60),
          transfers: option.transfers,
          crowd: option.crowdLevel || "unknown",
          accessibility: option.accessibleScore == null ? 1 : option.accessibleScore,
          legs: option.legs || [],
          weather: {
            available: weather.available,
            condition: weather.text || weather.condition || "unknown",
            wet: weather.wet,
            extraMinutes: weather.extraMins,
          },
          events: this.routeEventsForAi(option),
        };
      }),
    };
    const key = `${s.trips.key}|${JSON.stringify(payload)}`;
    if (key === s.aiRoute?.key || key === this._aiRouteRequestKey) return;
    this._aiRouteRequestKey = key;
    this.setState({ aiRoute: { key, pending: true, decision: null, error: null, configured: s.aiRoute?.configured } });
    rankRouteOptions(payload)
      .then((result) => {
        if (this._aiRouteRequestKey !== key) return;
        this.setState({
          aiRoute: {
            key,
            pending: false,
            decision: result?.configured ? result.decision || null : null,
            error: null,
            configured: result?.configured === true,
            model: result?.model || null,
          },
        });
      })
      .catch((error) => {
        if (this._aiRouteRequestKey !== key) return;
        this.setState({ aiRoute: { key, pending: false, decision: null, error: String(error?.message || error), configured: true } });
      });
  };

  // A pattern strong enough to act on becomes a watched commute on its own —
  // and says so, with the evidence, and an Undo. Suggesting would be safer but
  // would put the work back on the user; adding without a word would leave a
  // commute nobody could account for.
  reviewPatterns = () => {
    const s = this.state;
    const journeys = s.journeys || [];
    this.refreshAiMemory();
    // Retire before promoting, so a routine that moved is replaced in one pass
    // rather than leaving the old commute sitting next to the new one.
    const stale = staleCommutes(s.savedList, journeys);
    const kept = stale.length ? (s.savedList || []).filter((c) => !stale.includes(c)) : s.savedList || [];
    const pattern = inferCommutes({ journeys, existing: kept, rejected: s.patternsRejected || [] })[0];
    const commute = pattern ? commuteFromPattern(pattern) : null;
    if (!commute && !stale.length) return;

    this.setState({
      savedList: commute ? kept.concat([commute]) : kept,
      ...(commute ? { justAdded: { signature: commute.signature, at: Date.now() } } : {}),
    });

    // A commute that disappears without a word is the thing the evidence line
    // exists to prevent, so a retirement is announced the same as a promotion.
    const name = (c) => `${(c.fromPlace && c.fromPlace.label) || "start"} → ${(c.toPlace && c.toPlace.label) || "destination"}`;
    const dropped = stale.length === 1 ? name(stale[0]) : `${stale.length} learned trips`;
    this.flash(
      commute && stale.length
        ? `Your routine changed · now watching ${name(commute)}`
        : commute
          ? `Learned your ${name(commute)} trip`
          : `Stopped watching ${dropped} · no trips in ${Math.round(RETIRE_MS / 86400000)} days`
    );
  };

  // Undo removes the commute and remembers the refusal, so the same pattern is
  // never offered again however many more times it is seen.
  forgetPattern = (signature) => {
    this.setState(
      (st) => ({
        savedList: (st.savedList || []).filter((c) => c.signature !== signature),
        patternsRejected: [...new Set([...(st.patternsRejected || []), signature])],
        justAdded: null,
      }),
      () => store(KEYS.patternsRejected, this.state.patternsRejected)
    );
    this.flash("Forgotten · Solvik won't add this again");
  };

  // Demo builds only: four weekday mornings between two real stations, so the
  // learned-commute card can be shown in seconds rather than over a fortnight.
  seedSampleTrips = () => {
    const journeys = seedSampleJourneys(
      { name: "Yishun", ll: [1.42945, 103.83513] },
      { name: "Raffles Place", ll: [1.28406, 103.85152] }
    );
    this.setState({ journeys }, this.reviewPatterns);
  };

  forgetEverything = () => {
    clearJourneys();
    store(KEYS.patternsRejected, []);
    store(KEYS.aiMemory, null);
    this.setState((st) => ({
      journeys: [],
      aiMemory: null,
      aiMemoryStatus: "idle",
      patternsRejected: [],
      justAdded: null,
      recents: clearSearches(),
      // Commutes Solvik added itself go too; ones you created stay.
      savedList: (st.savedList || []).filter((c) => c.source !== "auto"),
    }));
    this.flash("Cleared everything Solvik had learned");
  };

  // "4 min ago" — for report ages, which are always inside the 30-minute window.
  relTimeOf(at) {
    const mins = Math.max(0, Math.round((Date.now() - (at || 0)) / 60000));
    return mins < 1 ? "just now" : `${mins} min`;
  }

  // The Today tab: when to leave, and what the stations on the way are
  // forecast to be like when you get to them. Every number here comes from a
  // real request — the journey from OneMap, the levels from LTA — and where
  // one is missing the card says which, rather than filling it in.
  todayVals(s, PLACES, clock) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    const next = this.nextCommute();
    const outlook = s.outlook || { pending: false, error: null };
    const base = {
      planGreeting: greeting,
      fgHas: false, fgTitle: "", fgDetail: "", fgTone: "muted", fgCoverage: "", fgAlerts: [],
      fgActionLabel: "View alternatives", fgAction: () => {}, fgHasAction: false,
      rrHas: false, rrPending: false, rrLine: "", rrTitle: "", rrDetail: "", rrCaveat: "", rrAdvice: "",
      mitHas: false, mitLines: [], mitNote: "",
      wxHas: false, wxTitle: "", wxDetail: "", wxNote: "", wxWet: false,
      roadLine: "", roadIncident: "",
      pwHas: false, pwTitle: "", pwDetail: "", pwNote: "", pwBlocking: false, pwAction: () => {}, pwHasAction: false, pwActionLabel: "", pwScheduled: [],
    };
    if (!next) {
      return {
        ...base,
        planHasNext: false, planNextName: "", planNextFrom: "", planNextTo: "", planNextLeave: "", planNextIn: "", planNextRoute: "",
        planNextNote: "", planNextCrowd: "", planNextCrowdLevel: "light", planNextPending: false, planNextError: null,
        startNext: () => {}, watchNext: () => {}, watchNextLabel: "Alert me",
      };
    }

    const f = PLACES.find((p) => p.id === next.from) || { label: next.from, place: next.from, ll: null };
    const t = PLACES.find((p) => p.id === next.to) || { label: next.to, place: next.to, ll: null };
    const itinerary = outlook.itinerary || null;
    const forecast = outlook.forecast || { series: {}, slots: [], missing: [] };
    const view = itinerary
      ? commuteOutlook({
          itinerary,
          series: forecast.series,
          slots: forecast.slots,
          leaveAt: next.mins,
          arriveBy: next.arriveBy != null ? next.arriveBy : null,
        })
      : null;

    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const inMins = view ? view.departIn : (next.mins - nowMins + 1440) % 1440;
    const inLabel = inMins < 60 ? `leave in ${Math.max(0, inMins)} min` : `leave in ${Math.floor(inMins / 60)} h ${inMins % 60} min`;

    // Any service alert already loaded that names a line this journey uses.
    const legLabels = itinerary ? itinerary.legs || [] : [];
    const alerts = this.disruptingAlerts(itinerary);

    const worst = view && view.worst;
    const busy = !!(worst && worst.level !== "light");
    const reroute = s.reroute && s.reroute.key ? s.reroute : {};
    // Planned works on the stations this commute passes through. Step-free is
    // the whole point of the weighting: a lift out is a note if you can take the
    // stairs and a blocked journey if you can't, and the commute already says
    // which of those you are.
    const works = this.worksOnRoute(itinerary);
    const roadEvents = this.roadEventsOnRoute(itinerary);
    const scheduled = [
      ...roadEvents.roadWorks.map((w) => ({ label: roadWorkLabel(w), detail: roadWorkDetail(w) })),
      ...roadEvents.busChanges.map((c) => ({ label: busChangeLabel(c), detail: busChangeDetail(c) })),
    ];
    // Step-free is the commute's own setting or the persona's — either is a
    // reason to treat a lift outage as blocking.
    const stepFree = next.mode === "Step-free" || personaOf((s.routingPreferences || {}).persona).liftOutageBlocks;
    // What LTA has already activated for this disruption. Station codes are
    // resolved to names through the crowd feed, which carries both.
    const stationName = (code) => {
      const hit = ((s.crowd && s.crowd.stations) || []).find((st) => String(st.code).toUpperCase() === String(code).toUpperCase());
      return (hit && hit.name) || code;
    };
    const mitigations = mitigationsFor(alerts, stationName);

    // Weather at the destination end, at the time you would arrive — the walk
    // legs are where rain actually costs you. The penalty is stated, never
    // folded silently into the ETA.
    const persona = personaOf((s.routingPreferences || {}).persona);
    const weather = s.weather || {};
    const arriveAt = view && view.arriveAt ? view.arriveAt : Date.now() + (view ? view.durationMins : 0) * 60000;
    const wxForecast = forecastAt({ outlook: weather.outlook, ll: t.ll, at: arriveAt });
    const wxNow = nowcastAt(weather.nowcast, f.ll);
    const wxWet = !!(wxForecast && isWet(wxForecast.condition));
    const wxWalk = walkAdjustment({ walkSecs: (itinerary && itinerary.walkSecs) || 0, condition: wxForecast && wxForecast.condition });
    const rrOption = reroute.option || null;
    const rrNone = !!(reroute.avoided && reroute.avoided.none);
    const rrDelta = rrOption && view ? rrOption.mins - view.durationMins : null;
    const coverage = view ? view.coverage : null;
    const coverageNote = !coverage
      ? ""
      : coverage.outsideWindow
      ? "LTA publishes its crowd forecast for the current day only, and this trip falls outside it."
      : coverage.none
      ? "LTA publishes no crowd forecast for the stations on this trip."
      : coverage.complete
      ? `Forecast from LTA for all ${coverage.total} station${coverage.total === 1 ? "" : "s"} on the way.`
      : `Forecast from LTA for ${coverage.covered} of ${coverage.total} stations on the way.`;

    const goToCommute = (mode, avoid = null, avoidStations = null) => {
      if (!t.ll) {
        this.flash("Search for this place in Your places first");
        return;
      }
      this.setState({ screen: "map", tripMode: mode, tripAvoid: avoid, tripAvoidStations: avoidStations });
      // A commute names both ends, so the map is given both. Without the
      // origin it would fall back to your position — or, with none, to saved
      // Home, which on an evening trip home means planning Home → Home.
      this.chooseDest(
        { name: t.label, detail: t.place, ll: t.ll, kind: "Commute" },
        f.ll ? { routeOrigin: { id: f.id, name: f.label, address: f.place, ll: f.ll } } : undefined
      );
    };

    return {
      ...base,
      planHasNext: true,
      planNextName: `${f.label} → ${t.label}`,
      planNextFrom: f.label,
      planNextTo: t.label,
      planNextLeave: view ? view.departLabel : clock(next.mins),
      planNextIn: inLabel,
      planNextRoute: `${f.place} → ${t.place}`,
      planNextPending: !!outlook.pending,
      planNextError: outlook.error || null,
      planNextNote: outlook.pending
        ? "Planning this trip and reading LTA's forecast…"
        : outlook.error
        ? outlook.error
        : view
        ? [
            view.basis === "arrive-by"
              ? `Arrive by ${clock(next.arriveBy)} · ${view.durationMins} min journey`
              : `${view.durationMins} min journey · arrive ${view.arriveLabel}`,
            legLabels.length ? legLabels.join(" · ") : null,
          ].filter(Boolean).join(" · ")
        : "",
      planNextCrowd: view
        ? worst
          ? `${worst.word} at ${worst.name}`
          : coverage && coverage.none
          ? "No forecast yet"
          : "Light all the way"
        : "",
      planNextCrowdLevel: worst ? worst.level : "light",
      // Which of rain and crowding wins is a property of the person, not the
      // network — Rachel keeps her fast route in the rain, Mdm Lim does not.
      startNext: () => {
        const suggested = modeFor(persona.id, { wet: wxWet, busy });
        goToCommute(suggested === "bike" ? "cycle" : suggested === "walk" ? "walk" : "transit");
      },
      watchNext: () => this.armLeaveAlert(view, `${f.label} → ${t.label}`),
      watchNextLabel: s.leaveAlert && s.leaveAlert.key === (outlook.key || "") ? "Alert set" : "Alert me",

      // The forecast card. Scoped to this commute's own stations — a network
      // -wide list of busy stations would be noise, not a warning.
      fgHas: !!(view && (busy || alerts.length || (coverage && coverage.none))),
      fgTitle: busy
        ? `${worst.word} at ${worst.name} from ${worst.fromLabel}`
        : alerts.length
        ? `${alerts[0].line} · ${alerts[0].tag}`
        : coverage && coverage.outsideWindow
        ? "No forecast for that time yet"
        : coverage && coverage.none
        ? "No crowd forecast for this route"
        : "",
      fgDetail: busy
        ? [
            `On your ${worst.leg} leg, around when you'd be there.`,
            view.shift
              ? `Leaving ${view.shift.label} would put you there while it's ${view.shift.word.toLowerCase()} (${view.shift.departLabel}).`
              : null,
          ].filter(Boolean).join(" ")
        : alerts.length
        // The title already carries the line and the tag, so the body carries
        // what the title doesn't: which stations, and which direction.
        ? alerts[0].detail || alerts[0].title
        : coverage && coverage.outsideWindow
        ? "LTA's crowd forecast runs to the end of today. Check back nearer the time and this will fill in."
        : coverage && coverage.none
        ? "The stations on this trip aren't in LTA's crowd feed, so there's nothing to forecast from."
        : "",
      fgTone: busy && worst.level === "busy" ? "busy" : busy ? "moderate" : alerts.length ? "warn" : "muted",
      fgCoverage: coverageNote,
      // The first alert is the card's own title and detail; only the others need
      // a chip of their own.
      fgAlerts: (busy ? alerts.slice(0, 2) : alerts.slice(1, 3)).map((a) => ({ line: a.line, title: a.title })),
      fgHasAction: !!(view && (busy || rrOption) && t.ll),
      fgActionLabel: rrOption ? "Show this way" : "View alternatives",
      fgAction: () => {
        if (rrOption) {
          goToCommute("reroute", reroute.line);
          this.flash(`Avoiding ${reroute.line}`);
          return;
        }
        goToCommute("quiet");
        this.flash("Ranked by live crowding");
      },

      // The reroute. Only ever present when an alert names a line this trip
      // rides — see loadReroute().
      rrHas: !!(reroute.key && (rrOption || rrNone || reroute.pending || reroute.error)),
      rrPending: !!reroute.pending,
      rrLine: reroute.line || "",
      // The section label already says "Another way", so the title is the route.
      rrTitle: rrOption
        ? rrOption.legs.join(" · ")
        : rrNone
        ? `No way around ${reroute.line} right now`
        : reroute.pending
        ? "Looking for another way…"
        : reroute.error
        ? "Couldn't plan an alternative"
        : "",
      rrDetail: rrOption
        ? [
            `${rrOption.mins} min${rrDelta == null ? "" : rrDelta > 0 ? ` · ${rrDelta} min longer` : rrDelta < 0 ? ` · ${-rrDelta} min faster` : " · same time"}`,
            `avoids ${reroute.line} entirely`,
          ].join(" · ")
        : rrNone
        // Honest about which of the two it is: every route OneMap offered still
        // runs through the fault, which is not the same as there being no route.
        ? `Every route OneMap offers still uses ${reroute.line}. Sitting it out or a taxi may be the only options.`
        : reroute.error || "",
      // The alternative is planned from the timetable. OneMap does not know a
      // disruption is happening, so this is a route that avoids the broken line
      // — not a live-adjusted time. Saying so is the whole point.
      rrCaveat: rrOption ? `${rrOption.mins} min is OneMap's timetable, which doesn't know about the disruption. Expect the alternative to be busier than usual.` : "",
      // Road conditions on this journey's bus legs. Said only when slow enough
      // to change a decision, and never converted into minutes — a speed band
      // covers a segment, not a bus's run.
      roadLine: (() => {
        const roads = ((itinerary && itinerary.steps) || []).flatMap((step) => [step.road, step.fromRoad, step.toRoad]).filter(Boolean);
        return roadLine(worstBandOn((s.road || {}).bands, roads));
      })(),
      roadIncident: (() => {
        const board = ((itinerary && itinerary.transitLegs) || []).find((l) => l.mode === "BUS" && Number.isFinite(l.fromLat));
        if (!board) return "";
        const hit = incidentNear((s.road || {}).incidents, [board.fromLat, board.fromLng]);
        return hit ? hit.message : "";
      })(),

      // Weather. The brief names rain as something that must change the
      // recommendation, so this both warns and shifts the mode: a wet walk is
      // ranked differently, and the card says that is why.
      wxHas: !!wxForecast,
      wxWet,
      wxTitle: wxForecast ? (wxWet ? `${wxForecast.text} when you arrive` : wxForecast.text) : "",
      wxDetail: wxForecast ? weatherLine({ forecast: wxForecast, walkSecs: (itinerary && itinerary.walkSecs) || 0 }) : "",
      wxNote: [
        wxNow && isWet(wxNow.condition) ? `${wxNow.text} at ${wxNow.name} right now.` : "",
        // Said at the feed's own resolution — periods of hours, never a minute.
        wxForecast ? "From NEA's 24-hour forecast, published in multi-hour periods." : "",
      ].filter(Boolean).join(" "),

      // What LTA has activated. Shown above our own alternative because it is
      // quoted from the feed rather than computed — which is also why it carries
      // no timetable caveat, unlike the reroute below it.
      mitHas: mitigations.length > 0,
      mitLines: mitigations.flatMap((m) => m.lines).slice(0, 3),
      mitNote: mitigations.length ? "Activated by LTA for this disruption." : "",

      // Planned works — scheduled, not a fault, so stated separately from the
      // disruption above rather than blended into it.
      pwHas: works.length > 0 || scheduled.length > 0,
      // Road works and bus route changes sit alongside lift maintenance: all
      // three are scheduled rather than faults, and the brief treats that
      // distinction as the differentiator.
      pwScheduled: scheduled.slice(0, 3),
      pwBlocking: stepFree && works.length > 0,
      pwTitle: works.length === 1
        ? worksLabel(works[0])
        : works.length > 1
          ? `Lifts out at ${works.length} stations on your way`
          : scheduled.length === 1
            ? scheduled[0].label
            : `${scheduled.length} planned changes on your way`,
      pwDetail: works.length === 1
        ? worksDetail(works[0])
        : works.length > 1
          ? works.map((w) => w.stationName || w.stationCode).join(", ")
          : scheduled.length === 1
            ? scheduled[0].detail
            : "",
      // The same feed row, weighted by who is reading it. LTA publishes which
      // lift, never for how long, so neither version claims a duration.
      pwNote: works.length
        ? `${reasonFor(persona.id, "lift", { blocking: stepFree })} LTA publishes which lift, not how long it will be out.`
        : "Scheduled by LTA and published in advance, so it can be planned around.",
      pwHasAction: !!(works.length && t.ll),
      pwActionLabel: works.length === 1 ? `Route around ${works[0].stationName || works[0].stationCode}` : "Route around these stations",
      pwAction: () => {
        goToCommute(stepFree ? "step" : "reroute", null, works.map((w) => w.stationCode));
        this.flash(`Avoiding ${works.map((w) => w.stationName || w.stationCode).join(", ")}`);
      },

      // LTA's own message often names bridging buses — better information than
      // we can derive, and already fetched. It arrives as a general service
      // message rather than a per-line segment, so it is looked for across all
      // alerts, narrowed to ones that actually name the disrupted line.
      rrAdvice: reroute.line
        ? (((s.faults && s.faults.items) || []).find(
            (a) => a.detail && /bridg|shuttle|free bus/i.test(a.detail) && a.detail.toUpperCase().includes(String(reroute.line).toUpperCase())
          ) || {}).detail || ""
        : "",
    };
  }

  addCommuteVals(s) {
    // The picker lives on this screen, so it resolves the persona here rather
    // than borrowing todayVals' local.
    const persona = personaOf((s.routingPreferences || {}).persona);
    const savedPlaces = s.savedPlaces || {};
    const PLACES = this.placeList(s);
    const addSearch = s.addSearchResults || { items: [], pending: false, error: null, query: "" };
    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const from = s.addFrom || "home", to = s.addTo || "work";
    const days = s.addDays || ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const mode = s.addMode || "Comfort";
    const mins = s.addMins == null ? 462 : s.addMins;
    const fromP = PLACES.find((p) => p.id === from) || null;
    const toP = PLACES.find((p) => p.id === to) || null;
    const clock = (m) => { const n = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`; };
    const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const dayLabel =
      days.length === 0 ? "no days yet"
      : days.length === 7 ? "every day"
      : weekday.every((d) => days.indexOf(d) >= 0) && days.length === 5 ? "Mon to Fri"
      : days.length === 2 && days.indexOf("Sat") >= 0 && days.indexOf("Sun") >= 0 ? "weekends"
      : DAYS.filter((d) => days.indexOf(d) >= 0).join(", ");
    const pill = (on) =>
      "flex:none;max-width:100%;overflow-wrap:anywhere;padding:10px 14px;border-radius:999px;cursor:pointer;white-space:normal;" +
      "font:var(--weight-bold) 13px/1 var(--font-body);transition:background .15s,color .15s;" +
      (on
        ? "background:var(--accent);border:1px solid var(--accent);color:var(--text-on-accent);"
        : "background:var(--accent-soft);border:1px solid var(--border-card);color:var(--text-body);");
    const aq = (s.addQuery || "").trim();
    const aResults = addSearch.query === aq ? addSearch.items : [];
    const invalid = !fromP?.ll || !toP?.ll || from === to || (fromP?.ll && toP?.ll && metresBetween(fromP.ll, toP.ll) < 10) || days.length === 0;
    const name = invalid ? "" : fromP.label + " → " + toP.label;
    return {
      addOpen: !!s.addOpen,
      closeAdd: () => this.setState({ addOpen: false, addEdit: null, addSearchFor: null, addQuery: "" }),
      addFromOpts: PLACES.map((p) => ({ label: p.label, style: pill(p.id === from), pick: () => this.setState({ addFrom: p.id }) })),
      addToOpts: PLACES.map((p) => ({ label: p.label, style: pill(p.id === to), pick: () => this.setState({ addTo: p.id }) })),
      addSearchOpen: !!s.addSearchFor,
      addSearchTitle: s.addSearchFor === "to" ? "Where are you going?" : "Where do you start?",
      addSearchFrom: () => this.setState({ addSearchFor: "from", addQuery: "" }),
      addSearchTo: () => this.setState({ addSearchFor: "to", addQuery: "" }),
      addSearchClose: () => this.setState({ addSearchFor: null, addQuery: "" }),
      addQuery: s.addQuery || "",
      setAddQuery: (v) => this.setState({ addQuery: typeof v === "string" ? v : v && v.target ? v.target.value : "" }),
      addNoResults: !!aq && !addSearch.pending && !addSearch.error && aResults.length === 0,
      addResults: aResults.map((p) => ({
        label: p.name,
        detail: p.detail,
        kind: p.kind,
        pick: () => {
          const entry = { id: p.id, label: p.name, place: p.detail, ll: p.ll };
          const extra = (s.addExtra || []).filter((x) => x.id !== p.id).concat([entry]).slice(-4);
          const key = s.addSearchFor === "to" ? "addTo" : "addFrom";
          this.setState({ addExtra: extra, [key]: p.id, addSearchFor: null, addQuery: "" });
        },
      })),
      addSearchPending: !!addSearch.pending,
      addSearchError: addSearch.error || null,
      addTime: clock(mins),
      addArrive: !PLACES.length
        ? "Add your home and work addresses first, or search for a place."
        : invalid
        ? "Pick two different places and at least one day."
        : (s.addWhen || "leave") === "arrive"
        ? "Solvik works out when to leave from the live journey time, and says so if a leg turns busy."
        : "Solvik checks this trip against LTA's forecast before you leave.",
      addTimeUp: () => this.setState({ addMins: (mins + 5 + 1440) % 1440 }),
      addTimeDown: () => this.setState({ addMins: (mins - 5 + 1440) % 1440 }),
      addDaysLabel: dayLabel,
      addDayOpts: DAYS.map((d) => {
        const on = days.indexOf(d) >= 0;
        return {
          label: d.slice(0, 1),
          toggle: () => this.setState({ addDays: on ? days.filter((x) => x !== d) : DAYS.filter((x) => days.indexOf(x) >= 0 || x === d) }),
          style: "flex:1;min-width:0;height:40px;border-radius:999px;cursor:pointer;font:var(--weight-bold) 13px/1 var(--font-body);" +
            (on ? "background:var(--accent);border:1px solid var(--accent);color:var(--text-on-accent);" : "background:var(--sand-100);border:1px solid var(--border-card);color:var(--text-muted);"),
        };
      }),
      addDayPresets: [
        { label: "Weekdays", set: weekday },
        { label: "Weekends", set: ["Sat", "Sun"] },
        { label: "Every day", set: DAYS },
      ].map((p) => ({
        label: p.label,
        pick: () => this.setState({ addDays: p.set }),
        style: "flex:none;padding:8px 13px;border-radius:999px;cursor:pointer;font:var(--weight-semibold) 12px/1 var(--font-body);background:var(--surface-card);border:1px solid var(--border-card);color:var(--text-body)",
      })),
      addModeOpts: ["Fastest", "Comfort", "Step-free"].map((m) => ({ label: m, style: pill(m === mode), pick: () => this.setState({ addMode: m }) })),
      // Leave at a time, or be somewhere by one — the second lets Solvik work
      // the leave time out from the journey and shift it when a leg turns busy.
      addWhen: s.addWhen || "leave",
      addWhenOpts: [
        { id: "leave", label: "Leave at" },
        { id: "arrive", label: "Arrive by" },
      ].map((o) => ({ label: o.label, style: pill(o.id === (s.addWhen || "leave")), pick: () => this.setState({ addWhen: o.id }) })),
      addPreviewName: invalid ? "Not ready yet" : "Alerts for " + name,
      addPreviewDetail: invalid ? "Choose a different destination, or tap a day." : "Checked 25 min before " + clock(mins) + " on " + dayLabel.toLowerCase() + ". " + mode + " routes preferred.",
      addInvalid: invalid,
      addEditing: s.addEdit != null,
      addSheetTitle: s.addEdit != null ? "Edit commute" : "Add a commute",
      addCta: invalid ? "Pick places and days" : s.addEdit != null ? "Save changes" : "Save commute",
      deleteCommute: () => {
        const list = (s.savedList || []).filter((x, i) => i !== s.addEdit);
        this.setState({ savedList: list, addOpen: false, addEdit: null });
        this.flash("Commute removed");
      },
      saved: (s.savedList || []).map((c, i) => {
        const f = PLACES.find((p) => p.id === c.from) || { label: c.from, place: c.from };
        const t = PLACES.find((p) => p.id === c.to) || { label: c.to, place: c.to };
        const ds = c.days || [];
        const dl =
          ds.length === 0 ? "no days"
          : ds.length === 7 ? "every day"
          : ds.length === 5 && weekday.every((d) => ds.indexOf(d) >= 0) ? "Mon to Fri"
          : ds.length === 2 && ds.indexOf("Sat") >= 0 && ds.indexOf("Sun") >= 0 ? "weekends"
          : DAYS.filter((d) => ds.indexOf(d) >= 0).join(", ");
        const anchored = c.arriveBy != null ? "arrive by " + clock(c.arriveBy) : "leave at " + clock(c.mins);
        const learned = c.source === "auto" ? evidenceLine(c) : "";
        return {
          name: f.label + " → " + t.label,
          from: f.label,
          to: t.label,
          clock: clock(c.arriveBy != null ? c.arriveBy : c.mins),
          // The place names above already identify both ends. Repeating both
          // postal addresses made this scan like a receipt instead of a
          // commute, so the card keeps only the actionable schedule here.
          sub: dl + " · " + anchored,
          days: dl,
          timingLabel: c.arriveBy != null ? "Arrive by" : "Leave at",
          learned,
          detail: f.place + " → " + t.place + " · " + dl + ", " + clock(c.mins),
          mode: c.mode,
          edit: () => this.setState({ addOpen: true, addEdit: i, addFrom: c.from, addTo: c.to, addDays: ds.slice(), addMins: c.arriveBy != null ? c.arriveBy : c.mins, addMode: c.mode, addWhen: c.arriveBy != null ? "arrive" : "leave" }),
        };
      }),
      ...this.todayVals(s, PLACES, clock),
      // What Solvik has learned, and how to make it forget.
      memoryCount: (s.journeys || []).length,
      memorySummary: (() => {
        const sum = journeySummary(s.journeys || []);
        if (!sum.total) return "Nothing learned yet. Start a route and Solvik begins noticing where you go.";
        const auto = (s.savedList || []).filter((c) => c.source === "auto").length;
        const since = sum.oldest ? new Date(sum.oldest).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
        return [
          `${sum.total} trip${sum.total === 1 ? "" : "s"} remembered since ${since}`,
          `${sum.completed} finished`,
          auto ? `${auto} commute${auto === 1 ? "" : "s"} learned from them` : null,
        ].filter(Boolean).join(" · ");
      })(),
      memoryAiSummary: s.aiMemory?.summary || "",
      memoryAiLabel: s.aiMemoryStatus === "pending"
        ? "Gemini is updating your travel preferences…"
        : s.aiMemory?.model
          ? `AI-assisted · ${s.aiMemory.confidence || "low"} confidence`
          : s.aiMemoryStatus === "unconfigured"
            ? "Add GEMINI_API_KEY to enable AI-assisted memory"
            : "",
      memoryLines: [...new Set((s.journeys || []).flatMap((j) => j.legs || []))].slice(0, 8),
      // The places it has noticed, with what it knows about each. Listed rather
      // than counted, because "3 places remembered" is not something you can
      // check — and checking is the point of this panel.
      memoryPlaces: this.myPlaces().slice(0, 4).map((place) => ({
        name: place.name || "Somewhere you go",
        detail: [
          `${place.visits} visit${place.visits === 1 ? "" : "s"}`,
          place.lines.length ? `via ${place.lines.slice(0, 3).join(", ")}` : null,
        ].filter(Boolean).join(" · "),
      })),
      alertCatchUpLine: (() => {
        const c = s.alertCatchUp;
        if (!c) return "";
        const since = c.at ? ` since ${new Date(c.at).toLocaleDateString(undefined, { weekday: "long" })}` : "";
        return `${c.count} new alert${c.count === 1 ? "" : "s"} on your lines${since}.`;
      })(),
      memoryNote: "Journey records stay in this browser and expire after 90 days. When Gemini is enabled, a compact trip summary is sent to Google for preference analysis; the app stores only the returned insight. Google's free-tier data terms apply.",
      memoryPlacesLabel: "Places it has noticed",
      // Named on screen rather than inferred silently: the brief scores whether
      // a submission says who it is for.
      personaId: persona.id,
      personaName: persona.name,
      personaBlurb: persona.blurb,
      personaOptions: personaList().map((option) => ({
        id: option.id,
        name: option.name,
        blurb: option.blurb,
        example: option.example,
        on: option.id === persona.id,
        pick: () =>
          this.setState(
            (st) => ({ routingPreferences: { ...st.routingPreferences, persona: option.id } }),
            () => {
              this.flash(`Tailored for: ${option.name}`);
              this.loadOutlook();
            }
          ),
      })),
      forgetEverything: this.forgetEverything,
      canSeedTrips: DEMO_MODE && !(s.journeys || []).length,
      seedSampleTrips: this.seedSampleTrips,
      // The card shown when a commute has just been learned.
      justAdded: (() => {
        const mark = s.justAdded;
        if (!mark) return null;
        const commute = (s.savedList || []).find((c) => c.signature === mark.signature);
        if (!commute) return null;
        return {
          title: `Added ${commute.fromPlace.label} → ${commute.toPlace.label}`,
          when: `${commute.days.length >= 5 ? "Weekdays" : commute.days.join(", ")}, around ${clock(commute.mins)}`,
          evidence: evidenceLine(commute),
          undo: () => this.forgetPattern(commute.signature),
          dismiss: () => this.setState({ justAdded: null }),
        };
      })(),
      openAdd: () => this.setState({ addOpen: true, addEdit: null, addSearchFor: null, addQuery: "", addFrom: PLACES[0]?.id || "", addTo: PLACES[1]?.id || "", addDays: weekday.slice(), addMins: 462, addMode: "Comfort", addWhen: "leave" }),
      placesOpen: !!s.placesOpen,
      openPlaces: () => this.setState({ placesOpen: true, placesDraft: { ...savedPlaces }, placesDraftPending: {}, placesShowDraft: s.routingPreferences?.showSavedPlaces !== false }),
      closePlaces: () => this.setState({ placesOpen: false, placesDraft: null, placesDraftPending: {} }),
      placesInvalid: Object.values(s.placesDraftPending || {}).some(Boolean),
      savePlaces: () => {
        if (Object.values(s.placesDraftPending || {}).some(Boolean)) return;
        const nextPlaces = s.placesDraft || savedPlaces;
        const savedOriginId = ["home", "work", "school"].includes(s.routeOrigin?.id) ? s.routeOrigin.id : null;
        const nextSavedOrigin = savedOriginId && nextPlaces[savedOriginId]?.verified
          ? { ...nextPlaces[savedOriginId], id: savedOriginId }
          : savedOriginId ? null : s.routeOrigin;
        this.setState({
          placesOpen: false,
          savedPlaces: nextPlaces,
          placesDraft: null,
          routeOrigin: nextSavedOrigin,
          routeOriginReset: savedOriginId ? (s.routeOriginReset || 0) + 1 : s.routeOriginReset,
          trips: savedOriginId && nextSavedOrigin !== s.routeOrigin
            ? { key: null, options: [], pending: false, error: null }
            : s.trips,
          routingPreferences: { ...s.routingPreferences, showSavedPlaces: s.placesShowDraft },
        });
        this.flash("Places saved");
      },
      placeRows: [
        { key: "home", label: "Home", short: "Home", icon: "house", placeholder: "Block, street or MRT stop" },
        { key: "work", label: "Work", short: "Work", icon: "briefcase", placeholder: "Office, building or area" },
        { key: "school", label: "School or campus", short: "School", icon: "graduation-cap", placeholder: "Optional" },
      ].map((p) => ({
        label: p.label, short: p.short, icon: p.icon, placeholder: p.placeholder,
        value: (s.placesOpen ? s.placesDraft : savedPlaces)?.[p.key] || null,
        shown: savedPlaces[p.key]?.name || "Add",
        set: (place) => this.setState((st) => ({ placesDraft: { ...(st.placesDraft || {}), [p.key]: place ? { ...place, id: p.key } : null } })),
        draft: (pending) => this.setState((st) => ({ placesDraftPending: { ...st.placesDraftPending, [p.key]: pending } })),
      })),
      showSavedPlaces: s.placesOpen ? s.placesShowDraft : s.routingPreferences?.showSavedPlaces !== false,
      toggleSavedPlaces: () => this.setState((st) => ({ placesShowDraft: !st.placesShowDraft })),
      clearAllData: () => {
        if (typeof window !== "undefined" && !window.confirm("Erase all Solvik data saved in this browser? This cannot be undone.")) return;
        clearAllUserData();
        if (typeof window !== "undefined") window.location.reload();
      },
      saveCommute: () => {
        if (invalid) return;
        const arrive = (s.addWhen || "leave") === "arrive";
        const entry = { from, to, fromPlace: { ...fromP }, toPlace: { ...toP }, days: days.slice(), mins: ((mins % 1440) + 1440) % 1440, mode, arriveBy: arrive ? ((mins % 1440) + 1440) % 1440 : null };
        const list = (s.savedList || []).slice();
        if (s.addEdit != null) list[s.addEdit] = entry;
        else list.push(entry);
        this.setState({ savedList: list, addEdit: null, addOpen: false });
        this.flash("Watching " + name + " · " + dayLabel + ", " + clock(mins));
      },
    };
  }

  forecastVals(s) {
    const crowd = s.crowd || { stations: [], slots: [] };
    const stations = crowd.stations || [];
    const level = (st) => st.level || "unknown";
    const tone = (lv) => lv === "unknown" ? "var(--text-muted)" : "var(--crowd-" + lv + ")";
    const word = { busy: "Busy", moderate: "Filling", light: "Light", unknown: "No data" };

    const pinned = s.crowdOn !== false ? stations.find((st) => st.code === s.fcPin) || null : null;
    const watched = s.fcWatch || [];
    const crowdOn = s.crowdOn !== false;

    const zones = stations.map((st) => ({
      id: st.code,
      ll: [st.lat, st.lng],
      // Station-scale circles, not the prototype's district blobs.
      radius: 320,
      level: level(st),
      label: st.name,
      pct: "", // LTA supplies categories, not measured occupancy percentages.
      selected: st.code === s.fcPin,
    }));

    const faults = s.faults || { items: [], error: null };
    const sevTone = { fault: "var(--status-fault)", warn: "var(--status-warn)", info: "var(--sand-500)" };
    const readAlerts = s.readAlerts || {};
    const isRead = (f) => !!(f && f.id && readAlerts[f.id]);
    const unread = faults.items.filter((f) => !isRead(f));

    const slots = forecastSlots(crowd.slots);
    const slotIndex = s.fcAt ? slots.indexOf(s.fcAt) : 0;
    const slotLabel = (iso) => {
      return singaporeClock(iso);
    };

    return {
      crowdOn,
      crowdPending: !!crowd.pending,
      crowdError: crowd.error || null,
      crowdEmpty: !crowd.pending && !crowd.error && stations.length === 0,
      mapZones: crowdOn && !s.dest ? zones : [],
      showCrowdBar: false,
      toggleCrowd: () => this.setState({ crowdOn: !crowdOn, fcPin: null }),
      crowdToggleLabel: crowdOn ? "Crowding layer on" : "Crowding layer off",
      crowdToggleStyle: "position:relative;flex:none;width:46px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;box-shadow:0 4px 14px rgba(32,30,29,.18);" +
        (crowdOn ? "background:var(--accent);color:var(--text-on-accent,#fff);" : "background:var(--surface-card);color:var(--text-body);"),
      fcPickZone: (id) => this.setState({ fcPin: id, fcAlerts: false, pin: null, searchOpen: false }),
      fcRoutesHere: () => {
        if (!pinned) return;
        this.chooseDest(
          { name: pinned.name, detail: word[level(pinned)] + (s.fcAt ? " forecast" : " now") + " · platform crowding from LTA", ll: [pinned.lat, pinned.lng] },
          { fcPin: null }
        );
      },
      fcClearPin: () => this.setState({ fcPin: null }),
      fcWatchLabel: pinned && watched.indexOf(pinned.code) >= 0 ? "Watching" : "Alert me",
      fcWatchPinned: () => {
        if (!pinned) return;
        const on = watched.indexOf(pinned.code) >= 0;
        this.setState({ fcWatch: on ? watched.filter((x) => x !== pinned.code) : watched.concat([pinned.code]) });
        this.flash(on ? "Stopped watching " + pinned.name : "Alerts on for " + pinned.name);
      },
      fcPinned: pinned && {
        name: pinned.name,
        detail: pinned.code + " · " + (s.fcAt ? "Forecast " + singaporeClock(s.fcAt) : "Live platform crowding") + " · LTA DataMall",
        pct: "",
        word: word[level(pinned)],
        dotStyle: "flex:none;margin-top:4px;width:12px;height:12px;border-radius:999px;background:" + tone(level(pinned)),
        pctStyle: "font:var(--weight-heavy) 24px/1 var(--font-numeric);font-variant-numeric:tabular-nums;color:" + tone(level(pinned)),
        hours: [],
      },
      fcLegend: ["busy", "moderate", "light"].map((lv) => ({
        label: { busy: "Busy — expect to stand", moderate: "Filling up", light: "Light — seats likely" }[lv],
        short: { busy: "Busy", moderate: "Filling", light: "Light" }[lv],
        swatch: "width:9px;height:9px;border-radius:999px;flex:none;background:" + tone(lv) + ";opacity:.9",
      })),
      // Scrubber slots are the forecast intervals LTA actually publishes.
      fcSlots: (crowd.error || !stations.length ? [] : slots).map((iso, n) => {
        const on = n === slotIndex;
        return {
          label: n === 0 ? "Now" : slotLabel(iso),
          active: on,
          pick: () => this.setState({ fcAt: iso }),
          style: "flex:none;display:flex;flex-direction:column;align-items:center;gap:7px;padding:9px 13px;border-radius:14px;cursor:pointer;transition:background .16s,border-color .16s;" +
            (on ? "background:var(--accent);border:1.5px solid var(--accent);" : "background:var(--sand-100);border:1.5px solid var(--border-card);"),
          timeStyle: "font:var(--weight-bold) 12.5px/1 var(--font-numeric);font-variant-numeric:tabular-nums;color:" + (on ? "#fff" : "var(--text-body)"),
          barStyle: "display:block;width:30px;height:4px;border-radius:999px;background:" + (on ? "#fff" : "var(--sand-400)") + ";opacity:" + (on ? 0.9 : 0.8),
        };
      }),
      fcFaults: faults.items.map((f) => ({
        ...f,
        // Only an alert on a line you ride offers a reroute, and only on a tap:
        // the Today card covers the trip you are about to make, and a sheet of
        // alerts shouldn't fire a routing request each.
        canReroute: this.canRerouteFrom(f),
        reroute: () => this.rerouteFromAlert(f),
        // "That's your line to the office" — a line code means nothing until it
        // is attached to somewhere you actually go.
        placeNote: (() => {
          const names = this.placesOnLine(f);
          if (!names.length) return "";
          return names.length === 1
            ? `You use this line to get to ${names[0]}.`
            : `You use this line to get to ${names.slice(0, 2).join(" and ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""}.`;
        })(),
        readLabel: isRead(f) ? "Read" : "Tap to mark as read",
        readDotStyle: isRead(f) ? "display:none" : "width:7px;height:7px;border-radius:999px;background:var(--status-fault)",
        toggleRead: () => {
          if (!isRead(f)) this.setState((st) => ({ readAlerts: markAlertsRead([f.id], st.readAlerts) }));
        },
        cardStyle: "width:100%;text-align:left;display:block;cursor:pointer;padding:13px 14px;border-radius:16px;background:var(--surface-card);opacity:" + (isRead(f) ? ".6" : "1") + ";border:1px solid " + (isRead(f) ? "var(--border-card)" : sevTone[f.sev] || "var(--border-card)"),
        badgeStyle: "flex:none;padding:3px 8px;border-radius:999px;font:var(--weight-heavy) 11px/1.3 var(--font-body);letter-spacing:.02em;color:#fff;background:" + (sevTone[f.sev] || "var(--sand-500)"),
        tagStyle: "font:var(--weight-semibold) 11px/1 var(--font-body);letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)",
      })),
      faultsPending: !!faults.pending,
      faultsError: faults.error || null,
      faultsClear: !faults.pending && !faults.error && faults.items.length === 0,
      fcFaultCount: unread.length ? unread.length + " unread" : "All read",
      fcFaultN: unread.length,
      fcHasFaults: unread.length > 0,
      fcHasUnread: unread.length > 0,
      fcMarkAllRead: () => {
        this.setState((st) => ({ readAlerts: markAlertsRead(faults.items.map((f) => f.id), st.readAlerts) }));
        this.flash("All alerts marked read");
      },
      fcAlertsOpen: !!s.fcAlerts,
      fcToggleAlerts: () => this.setState({ fcAlerts: !s.fcAlerts }),
      fcBellStyle: "position:relative;flex:none;margin-left:auto;width:46px;height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;color:" +
        (s.fcAlerts ? "#fff" : "var(--text-strong)") + ";background:" + (s.fcAlerts ? "var(--text-strong)" : "var(--surface-card)") + ";box-shadow:0 4px 14px rgba(32,30,29,.18)",
      fcBellDotStyle: "position:absolute;top:5px;right:5px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;display:flex;align-items:center;justify-content:center;font:var(--weight-heavy) 10.5px/1 var(--font-numeric);color:#fff;background:var(--status-fault);border:2px solid " + (s.fcAlerts ? "var(--text-strong)" : "var(--surface-card)"),
      fcFaultCountStyle: "font:var(--weight-bold) 11px/1 var(--font-body);padding:4px 9px;border-radius:999px;color:var(--status-fault);background:color-mix(in oklch, var(--status-fault) 12%, transparent)",
    };
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.screen === "nav" && this.stepsEl) {
      const idx = this._navIdx || 0;
      if (idx !== this._scrolledTo && (!this.userScrolled || Date.now() - this.userScrolled > 6000)) {
        this._scrolledTo = idx;
        this.scrollToStep(idx);
        if (idx !== this.state.navPage) this.setState({ navPage: idx });
      }
    }
    if (this.state.query !== prevState.query) this.scheduleLiveSearch();
    if (this.state.addQuery !== prevState.addQuery) this.scheduleAddSearch();

    // Anything that changes what a journey looks like re-asks OneMap. Position
    // counts only once it has actually moved: with the watch running, every
    // small jitter would otherwise re-plan the trip and reshuffle the cards.
    const s = this.state;
    if (
      s.dest &&
      !s.routeLocationPending &&
      s.screen !== "nav" &&
      (s.dest !== prevState.dest || s.tripMode !== prevState.tripMode || s.tripAvoid !== prevState.tripAvoid || s.tripAvoidStations !== prevState.tripAvoidStations || s.routeOrigin !== prevState.routeOrigin || s.routeOriginDraft !== prevState.routeOriginDraft || s.routeLocationPending !== prevState.routeLocationPending || (!s.routeOriginDraft && this.originDrifted()))
    ) {
      this.loadTripOptions();
    }
    // Scrubbing to another forecast slot re-asks LTA.
    if (s.fcAt !== prevState.fcAt) this.loadCrowding(s.fcAt || null);

    if (s.savedList !== prevState.savedList) store(COMMUTES_KEY, s.savedList);
    if (s.savedPlaces !== prevState.savedPlaces) saveSavedPlaces(s.savedPlaces);
    if (s.routingPreferences !== prevState.routingPreferences) {
      store(KEYS.preferences, s.routingPreferences);
      this.refreshAiMemory();
    }
    if (s.rewardRedemptions !== prevState.rewardRedemptions) store(KEYS.rewardRedemptions, s.rewardRedemptions);

    // Arrivals are polled only while there are options on screen to show them.
    if (s.trips.options !== prevState.trips.options) {
      if (s.dest && s.trips.options.length) this.startArrivalsPoll();
      else this.stopArrivalsPoll();
    }
    if (!s.dest && prevState.dest) this.stopArrivalsPoll();

    if (
      s.trips.options !== prevState.trips.options ||
      s.weather !== prevState.weather ||
      s.faults !== prevState.faults ||
      s.planned !== prevState.planned ||
      s.road !== prevState.road ||
      s.routingPreferences !== prevState.routingPreferences ||
      s.aiMemory !== prevState.aiMemory
    ) {
      this.refreshAiRouteDecision();
    }

    // The Today tab's outlook depends on the commutes, the places they point at
    // and the clock; re-ask when any of those move.
    if (
      s.savedList !== prevState.savedList ||
      s.savedPlaces !== prevState.savedPlaces ||
      s.addExtra !== prevState.addExtra ||
      (s.screen === "plan" && prevState.screen !== "plan")
    ) {
      this.loadOutlook();
    }

    // Continuous location is needed only during active turn-by-turn. The map
    // requests a one-off fix only after the user presses its locate control.
    const tracks = s.screen === "nav";
    const tracked = prevState.screen === "nav";
    if (tracks && !tracked) this.startTracking();
    if (!tracks && tracked) this.stopTracking();
  }
  componentDidMount() {
    this.t0 = Date.now();
    this.iv = setInterval(() => this.setState({ tick: Date.now() }), 1000);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.loadFaults();
    this.loadCrowding();
    this.loadOutlook();
    this.loadPlanned();
    this.loadReportGroups();
    this.loadWeather();
    this.loadRoad();
    this.weatherIv = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      this.loadWeather();
      this.loadRoad();
    }, 30 * 60 * 1000);
    // Journeys outlive the session that recorded them, so the pattern has to be
    // re-read on opening too. Without this, the trip that tipped the balance
    // would only be noticed on the next one — and a commute you had already
    // finished making would sit there unlearned.
    this.reviewPatterns();
    // The forecast moves in 30-minute steps and the clock moves under it, so
    // the outlook is re-read a few times an hour rather than once a session.
    this.startAlertPoll();
    this.outlookIv = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      this.loadOutlook();
    }, 5 * 60 * 1000);
  }
  componentWillUnmount() {
    this._crowdBarObserver?.disconnect();
    clearTimeout(this.bt);
    clearInterval(this.iv);
    if (this.tt) clearTimeout(this.tt);
    if (this._searchT) clearTimeout(this._searchT);
    if (this._addSearchT) clearTimeout(this._addSearchT);
    if (this._settleT) clearTimeout(this._settleT);
    if (this._snapBackT) clearTimeout(this._snapBackT);
    if (this.outlookIv) clearInterval(this.outlookIv);
    if (this.weatherIv) clearInterval(this.weatherIv);
    this.stopAlertPoll();
    if (this._leaveCancel) this._leaveCancel();
    this.stopTracking();
    this.stopArrivalsPoll();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  // Turn-by-turn follows the real position rather than a simulated clock.
  startTracking = () => {
    this.stopTracking();
    // Seed from the fix the map already has, so the first step is right before
    // the watch produces anything. Anything older than a minute is stale enough
    // to be worth waiting for the real one instead.
    const seed = getLastPosition();
    if (seed && Date.now() - seed.at < 60000) this.applyFix(seed);
    this.watchId = watchPosition(
      (fix) => {
        this._trackErrorShown = false;
        this.applyFix(fix);
      },
      (err) => {
        const code = (err && err.code) || "unavailable";
        this.setState({ navFixStatus: code === "denied" ? "denied" : "no-fix" });
        // A watch can fail repeatedly indoors; say it once, not every retry.
        if (!this._trackErrorShown) {
          this._trackErrorShown = true;
          this.flash(messageForError(code));
        }
      }
    );
  };
  // Bus arrivals go stale in about a minute, so they are re-asked while the
  // route sheet is on screen — one batched request for every bus leg showing.
  startArrivalsPoll = () => {
    this.stopArrivalsPoll();
    if (typeof document !== "undefined" && document.hidden) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const keys = arrivalKeys(this.state.trips.options);
      if (!keys.length) return;
      getArrivals(keys)
        .then((arrivals) => this.setState((st) => ({ arrivals: { ...st.arrivals, ...arrivals } })))
        .catch(() => {
          // The cards keep the times the planner returned, and say how old
          // they are rather than blanking.
        });
    };
    tick();
    this._arrivalsIv = setInterval(tick, 30000);
  };
  stopArrivalsPoll = () => {
    if (this._arrivalsIv) {
      clearInterval(this._arrivalsIv);
      this._arrivalsIv = null;
    }
  };
  handleVisibilityChange = () => {
    if (typeof document === "undefined") return;
    if (document.hidden) {
      this.stopArrivalsPoll();
      return;
    }
    const { dest, trips } = this.state;
    if (dest && trips.options.length) this.startArrivalsPoll();
  };

  stopTracking = () => {
    this._trackErrorShown = false;
    if (this.watchId != null) {
      clearWatch(this.watchId);
      this.watchId = null;
    }
  };

  // Live OneMap place search, debounced. Falls back to the illustrative
  // PLACES list in renderVals() whenever this fails or a key isn't set.
  scheduleLiveSearch = () => {
    if (this._searchT) clearTimeout(this._searchT);
    const query = this.state.query;
    if (!query || query.trim().length < 2) {
      this.setState({ liveResults: null, searchPending: false, searchError: null });
      return;
    }
    this.setState({ searchPending: true });
    // Keep the request tied to the pin that opened area search. Capturing the
    // coordinates here also prevents a later map pan from silently changing
    // what "nearby" means while the request is in flight.
    const near = this.state.searchTarget === "area" && Array.isArray(this.state.pin?.ll)
      ? [...this.state.pin.ll]
      : undefined;
    this._searchT = setTimeout(async () => {
      try {
        const items = await searchPlaces(query, { near });
        if (this.state.query !== query) return;
        this.setState({
          searchPending: false,
          searchError: null,
          liveResults: {
            query,
            items: (items || []).map((r) => ({
              name: r.name || r.address,
              detail: addressDetail(r.address, r.postal),
              kind: "Address",
              ll: [r.lat, r.lng],
              source: r.source || "OneMap",
            })),
          },
        });
      } catch {
        // Live search is unreachable — fall back to the built-in place list,
        // labelled as such so it never reads as live data.
        if (this.state.query !== query) return;
        this.setState({ liveResults: null, searchPending: false, searchError: "Can't reach OneMap — check your connection" });
      }
    }, 350);
  };

  // Debounced OneMap search inside the add-commute sheet.
  scheduleAddSearch = () => {
    if (this._addSearchT) clearTimeout(this._addSearchT);
    const query = (this.state.addQuery || "").trim();
    if (query.length < 2) {
      this.setState({ addSearchResults: { items: [], pending: false, error: null, query } });
      return;
    }
    this.setState({ addSearchResults: { items: [], pending: true, error: null, query } });
    this._addSearchT = setTimeout(() => {
      searchPlaces(query)
        .then((items) => {
          if ((this.state.addQuery || "").trim() !== query) return;
          this.setState({
            addSearchResults: {
              query,
              pending: false,
              error: null,
              items: (items || []).map((r, i) => ({
                id: `om-${r.postal || i}-${r.lat}`,
                name: r.name || r.address,
                detail: addressDetail(r.address, r.postal),
                kind: "Address",
                ll: [r.lat, r.lng],
              })),
            },
          });
        })
        .catch((err) => {
          if ((this.state.addQuery || "").trim() !== query) return;
          this.setState({ addSearchResults: { items: [], pending: false, error: String(err.message || err), query } });
        });
    }, 350);
  };

  // One step of a route card's breakdown, dressed in design-system tokens.
  detailRowVals(row) {
    const tone = { light: "var(--crowd-light)", moderate: "var(--crowd-moderate)", busy: "var(--crowd-busy)" };
    return {
      ...row,
      iconWrapStyle:
        "flex:none;width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;" +
        (row.kind === "walk"
          ? "background:var(--sand-200,rgba(32,30,29,.06));color:var(--text-body)"
          : "background:var(--accent-soft);color:var(--text-accent)"),
      arrivalStyle:
        "font:var(--weight-bold) 12px/1.2 var(--font-body);font-variant-numeric:tabular-nums;color:" +
        (row.arrival && row.arrival.tone === "accent" ? "var(--text-accent)" : "var(--text-muted)"),
      loadDotStyle: row.arrival && row.arrival.load
        ? "display:inline-block;width:7px;height:7px;border-radius:999px;margin-right:6px;background:" + tone[row.arrival.load]
        : "display:none",
      crowdStyle: row.crowdLevel
        ? "font:var(--weight-semibold) 11px/1 var(--font-body);color:" + tone[row.crowdLevel]
        : "display:none",
      crowdLabel: row.crowdLevel ? WORD[row.crowdLevel] + " now" : "",
      stopChipStyle:
        "font:var(--weight-medium) 11px/1 var(--font-body);color:var(--text-muted);background:var(--accent-soft);" +
        "border-radius:999px;padding:5px 9px;white-space:nowrap",
    };
  }

  // The one way a destination is chosen or cleared. Everything derived from it
  // resets together — otherwise the previous plan's route line stays drawn over
  // the map after you go back, and its cards flash under the new destination
  // before its own request resolves.
  rememberSearch = (dest) => {
    this.setState({ recents: rememberSearch(dest) });
  };

  chooseDest = (dest, extra) => {
    const hasExplicitOrigin = !!(extra && Object.prototype.hasOwnProperty.call(extra, "routeOrigin"));
    const shouldUseDeviceLocation = !!dest && !hasExplicitOrigin;
    const needsLocation = shouldUseDeviceLocation && !this.state.userLoc;
    this.setState({
      dest: dest || null,
      tripRoute: 0,
      navRoute: null,
      query: "",
      liveResults: null,
      searchOpen: false,
      searchTarget: "dest",
      searchPending: false,
      // A destination picked from the main search starts from the device by
      // default. Saved-commute actions pass an explicit origin and therefore
      // never trigger an unnecessary permission prompt.
      routeOrigin: shouldUseDeviceLocation ? null : this.state.routeOrigin,
      routeLocationPending: needsLocation,
      routeOriginDraft: false,
      tripCollapsed: true,
      tripDeparture: null,
      trips: { key: null, options: [], pending: !!dest, error: null },
      arrivals: {},
      ...(extra || {}),
    });
    // The first card is selected, but its breakdown stays closed until the
    // user asks for the steps.
    this._detailsFor = 0;
    if (dest) {
      this.rememberSearch(dest);
      if (needsLocation) {
        this.requestCurrentLocation(false, false)
          .then(() => this.setState({ routeOrigin: null, routeLocationPending: false, trips: { key: null, options: [], pending: false, error: null } }, this.loadTripOptions))
          .catch((err) => {
            this.setState({ routeLocationPending: false, trips: { key: null, options: [], pending: false, error: null } }, this.loadTripOptions);
            this.flash(messageForError(err && err.code));
          });
      }
    }
  };

  // Has the position moved far enough from the one the current options were
  // planned from to be worth planning again? A few metres of GPS wander is not.
  originDrifted = () => {
    const here = this.effectiveRouteOrigin()?.ll;
    if (!here) return false;
    if (!this._planOrigin) return true;
    return metresBetween(this._planOrigin, here) > REPLAN_DRIFT_M;
  };

  // Real journey options for the picked destination and mode. No fallback:
  // a failure surfaces in the sheet rather than being papered over.
  loadTripOptions = () => {
    const { dest, tripMode, tripAvoid, tripAvoidStations, tripDeparture } = this.state;
    if (!dest || !dest.ll) return;
    if (this.state.routeOriginDraft) {
      this.setState({ trips: { key: null, options: [], pending: false, error: "Select a starting place from the search results." } });
      return;
    }
    const resolvedOrigin = this.effectiveRouteOrigin();
    if (!resolvedOrigin) {
      this.setState({ trips: { key: null, options: [], pending: false, error: "Choose a starting place or use your location." } });
      return;
    }
    const request = (origin) => {
      const key = `${dest.name}|${tripMode}|${tripAvoid || ""}|${(tripAvoidStations || []).join("+")}|${tripDeparture?.date || "now"}|${tripDeparture?.time || ""}|${origin.join(",")}`;
      if (this.state.trips.key === key && (this.state.trips.pending || this.state.trips.options.length)) {
        return Promise.resolve();
      }
      this._planOrigin = origin;
      // Hold on to what was being shown, so an avoid-route can be drawn against
      // the route it replaced rather than appearing out of nowhere.
      const before = !tripAvoid && !(tripAvoidStations || []).length ? null : (this.state.trips.options || [])[0] || this.state.tripBefore || null;
      this.setState({ trips: { key, options: [], pending: true, error: null }, tripBefore: before });
      return getTripOptions(origin, dest.ll, tripMode, dest.name, { avoid: tripAvoid, avoidStations: tripAvoidStations, date: tripDeparture?.date, time: tripDeparture?.time })
      .then((options) => {
        if (this.state.dest !== dest || this.state.tripMode !== tripMode || this.state.trips.key !== key) return;
        this.setState({ trips: { key, options, pending: false, error: null, recorded: !!options.recorded, avoided: options.avoided || null }, tripRoute: 0, tripCollapsed: true });
      })
      .catch((err) => {
        if (this.state.dest !== dest || this.state.trips.key !== key) return;
        this.setState({ trips: { key, options: [], pending: false, error: String(err.message || err) } });
      });
    };
    request(resolvedOrigin.ll);
  };

  // Live platform crowding, optionally for a forecast slot.
  loadCrowding = (at) => {
    const requestId = this._crowdRequestId = (this._crowdRequestId || 0) + 1;
    this.setState((st) => ({ crowd: { ...st.crowd, pending: true, error: null } }));
    getCrowding(at)
      .then((data) => { if (requestId === this._crowdRequestId) this.setState({ crowd: { ...data, pending: false, error: null } }); })
      .catch((err) => { if (requestId === this._crowdRequestId) this.setState((st) => ({ crowd: { ...st.crowd, stations: [], pending: false, error: String(err.message || err) } })); });
  };

  // Live LTA DataMall train service alerts.
  loadFaults = () => {
    this.setState((st) => ({ faults: { ...st.faults, pending: true, error: null } }));
    getTrainServiceAlerts()
      .then((data) => {
        const segments = data && Array.isArray(data.AffectedSegments) ? data.AffectedSegments : [];
        const segmentItems = segments.map((seg) => ({
          line: seg.Line || "Rail",
          tag: "Delay",
          sev: "warn",
          time: "Now",
          title: `${seg.Line || "Line"} — ${seg.Direction || "service"} affected`,
          detail: [
            seg.StartStation && seg.EndStation ? `Between ${seg.StartStation} and ${seg.EndStation}.` : "",
            seg.Stations ? `Stations: ${seg.Stations}` : "",
          ].filter(Boolean).join(" "),
          // Kept so a commuter report at one of these stations can be matched
          // against LTA's own record of the same problem.
          stations: String(seg.Stations || "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
          // The mitigation is in the feed. When LTA activates free boarding onto
          // normal buses, or runs a shuttle, this endpoint says where — so there
          // is nothing to infer and nothing to caveat. Quoted, not computed.
          freeBus: String(seg.FreePublicBus || "").trim(),
          freeShuttle: String(seg.FreeMRTShuttle || "").trim(),
          shuttleDirection: String(seg.MRTShuttleDirection || "").trim(),
        }));
        const messageItems = data && Array.isArray(data.Message)
          ? data.Message.filter((message) => message && message.Content).map((message) => {
              const content = String(message.Content).trim();
              const separator = content.indexOf("-");
              const title = separator > 0 ? content.slice(separator + 1).split(". ")[0] : content;
              return {
                line: "LTA",
                tag: "Service update",
                sev: "warn",
                time: message.CreatedDate || "Today",
                title,
                detail: content,
              };
            })
          : [];
        // A content-derived id, so "read" survives a reload and LTA's feed
        // reordering — an index into this array survives neither.
        const items = [...segmentItems, ...messageItems].map((item) => ({ ...item, id: alertId(item) }));
        // A new alert can disrupt a commute that was fine when it was planned,
        // so the reroute is reconsidered whenever the alert list changes.
        this.setState({ faults: { items, pending: false, error: null } }, () => {
          this.reviewAlerts();
          this.loadReroute();
        });
      })
      .catch((err) =>
        this.setState({ faults: { items: [], pending: false, error: String(err.message || err) } })
      );
  };

  // Resolves the stop a report is filed against from the real position.
  findNearestStop = () => {
    this.setState((st) => ({ stop: { ...st.stop, pending: true, error: null, requested: true } }));
    getPosition()
      .then((fix) => {
        this.applyFix(fix);
        return getNearestStop(fix.coords[0], fix.coords[1]);
      })
      .then((data) => this.setState({ stop: { data, pending: false, error: null, requested: true } }))
      .catch((err) =>
        this.setState({ stop: { data: null, pending: false, error: messageForError(err && err.code) || String(err.message || err), requested: true } })
      );
  };

  navSnaps = [152, 260, 620];
  navSnap(h) {
    return this.navSnaps.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a), this.navSnaps[0]);
  }
  startNavDrag = (e) => {
    const startY = e.clientY, startH = this.state.navSheetH == null ? 260 : this.state.navSheetH;
    this.setState({ navDragging: true });
    const move = (ev) => {
      const h = Math.max(148, Math.min(680, startH - (ev.clientY - startY)));
      this.setState({ navSheetH: h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.setState((st) => ({ navDragging: false, navSheetH: this.navSnap(st.navSheetH == null ? 260 : st.navSheetH) }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  cycleNavSheet = () => {
    const h = this.state.navSheetH == null ? 260 : this.state.navSheetH;
    const idx = this.navSnaps.indexOf(this.navSnap(h));
    this.setState({ navSheetH: this.navSnaps[(idx + 1) % this.navSnaps.length] });
  };

  introVals(s, sc) {
    const step = s.introStep || 0;
    const selectedId = s.introScenario;
    const selected = selectedId ? personaOf(selectedId) : null;
    const scenarioIcon = { fixed: "clock-3", flexible: "bike", stepFree: "accessibility" };
    const rolePill = (on) =>
      "display:flex;align-items:center;gap:12px;padding:14px 15px;border-radius:var(--radius-card);cursor:pointer;font:var(--font-body);transition:background .15s,border-color .15s;" +
      (on ? "background:var(--accent-soft);border:1px solid var(--accent);color:var(--text-strong);" : "background:var(--surface-card);border:1px solid var(--border-card);color:var(--text-strong);");
    const total = 4;
    const summary = selected ? [
      { text: `${selected.route.label} is saved as the journey Solvik will open first.` },
      { text: selected.fit },
      { text: selected.id === "fixed" ? "Solvik stays quiet for minor delays and interrupts Rachel only when the impact reaches 15 minutes." : selected.limitation },
      { text: "Live conditions may revise the recommendation. Any issue shown is tied to this route and marked on the map." },
    ] : [];
    return {
      isIntro: sc === "intro",
      introS0: step === 0, introS1: step === 1, introS2: step === 2, introS3: step === 3,
      introCanBack: step > 0,
      introDots: [0, 1, 2, 3].map((idx) => ({
        style: { width: idx === step ? 18 : 6, height: 6, borderRadius: 999, background: idx <= step ? "var(--accent)" : "var(--sand-300)", transition: "width 220ms cubic-bezier(.2,.7,.3,1),background-color 220ms linear" },
      })),
      introPromises: [
        { icon: "route", title: "A real door-to-door route", detail: "The walk at both ends is part of the journey, not hidden." },
        { icon: "triangle-alert", title: "Issues where they happen", detail: "Relevant disruptions and lift faults appear on the route map." },
        { icon: "message-circle", title: "A recommendation with reasons", detail: "Every alternative says why it fits you less well." },
      ],
      introRoles: personaList().map((p) => ({
        id: p.id,
        label: p.id === "fixed" ? "Rachel · fixed schedule" : p.id === "flexible" ? "Arjun · flexible and multi-modal" : "Mdm Lim · step-free travel",
        sub: p.blurb,
        icon: scenarioIcon[p.id],
        route: p.route.label,
        schedule: p.route.schedule,
        badge: p.featured ? "Full journey demo" : "Preference preview",
        style: rolePill(selectedId === p.id),
        iconStyle: "flex:none;width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;" + (selectedId === p.id ? "background:var(--accent);color:var(--text-on-accent);" : "background:var(--accent-soft);color:var(--text-accent);"),
        subStyle: "display:block;font:var(--type-caption);color:var(--text-muted);margin-top:3px",
        checkStyle: "flex:none;width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;" + (selectedId === p.id ? "background:var(--accent);color:var(--text-on-accent);" : "background:transparent;color:transparent;"),
        toggle: () => this.setState({ introScenario: p.id }),
      })),
      introJourney: selected ? {
        name: selected.id === "fixed" ? "Rachel" : selected.id === "flexible" ? "Arjun" : "Mdm Lim",
        from: selected.route.from.name,
        to: selected.route.to.name,
        schedule: selected.route.schedule,
        expected: selected.route.expected,
        fit: selected.fit,
        limitation: selected.limitation,
        featured: !!selected.featured,
      } : null,
      introSummaryTitle: selected ? `${selected.route.label} is ready` : "Choose a journey first",
      introSummary: summary,
      introCta: s.introSaving ? "Preparing route…" : ["Choose a commuter", selected ? `Continue with ${selected.id === "fixed" ? "Rachel" : selected.id === "flexible" ? "Arjun" : "Mdm Lim"}` : "Choose one to continue", "Review this setup", "Show my route"][step],
      introError: s.introError || "",
      introCanSkip: false,
      introInvalid: false,
      introDisabled: Boolean(s.introSaving) || (step > 0 && !selected),
      introNext: async () => {
        if (step > 0 && !selected) return;
        if (step < total - 1) return this.setState({ introStep: step + 1 });
        const persona = selected || personaOf(DEFAULT_PERSONA);
        const commute = scenarioCommute(persona.id);
        const departure = scenarioDeparture(persona.id);
        const asSavedPlace = (place) => ({ ...place, source: "onemap", verified: true, updatedAt: Date.now() });
        const routingPreferences = {
          ...(s.routingPreferences || {}),
          persona: persona.id,
          scenario: persona.id,
          stepFree: persona.id === "stepFree",
          lessWalking: persona.id === "stepFree",
          avoidCrowds: persona.id === "flexible",
          studentFare: false,
          routineCommute: persona.id === "fixed",
        };
        const savedPlaces = {
          ...(s.savedPlaces || {}),
          home: asSavedPlace(persona.route.from),
          work: asSavedPlace(persona.route.to),
          school: null,
        };
        const origin = { ...savedPlaces.home };
        const destination = { name: persona.route.to.name, detail: persona.route.to.address, ll: persona.route.to.ll, kind: "Scenario" };
        this.setState({ introSaving: true, introError: "" });
        try {
          this.setState({
            screen: "map", introStep: 0, introSaving: false,
            savedPlaces,
            savedList: [commute, ...(s.savedList || []).filter((item) => item.source !== "scenario")],
            routingPreferences,
            mode: persona.id === "stepFree" ? "silver" : persona.id === "flexible" ? "comfort" : "rush",
            tripMode: "transit",
            tripDeparture: departure,
            routeOrigin: origin,
            dest: destination,
            query: "",
            searchOpen: false,
            tripRoute: 0,
            tripCollapsed: true,
            trips: { key: null, options: [], pending: false, error: null },
          }, this.loadTripOptions);
          store(ONBOARDED_KEY, 1);
          this.flash(`${persona.route.label} · planning your best fit`);
        } catch (error) {
          this.setState({ introSaving: false, introError: error?.message || "Setup could not be saved. Try again." });
        }
      },
      introBack: () => this.setState({ introStep: Math.max(0, step - 1) }),
      introSkip: () => {
        this.setState({ screen: "map", introStep: 0 });
        store(ONBOARDED_KEY, 1);
        this.flash("Set your places any time in Plan");
      },
    };
  }

  go = (screen) => this.setState({ screen, rep: "pick", repType: null, sev: null });
  flash = (toast) => {
    this.setState({ toast });
    if (this.tt) clearTimeout(this.tt);
    this.tt = setTimeout(() => this.setState({ toast: null }), 2600);
  };

  redeemReward = (reward) => {
    let outcome = "insufficient";
    this.setState((state) => {
      const redemptions = Array.isArray(state.rewardRedemptions) ? state.rewardRedemptions : [];
      if (redemptions.some((redemption) => redemption?.id === reward.id)) {
        outcome = "already";
        return null;
      }
      const available = Math.max(0, confirmedPointTotal(state.myReports) - redeemedPointTotal(redemptions));
      if (available < reward.cost) return null;
      outcome = "redeemed";
      return {
        rewardRedemptions: [...redemptions, { id: reward.id, cost: reward.cost, title: reward.title, at: Date.now() }],
      };
    }, () => {
      if (outcome === "redeemed") this.flash(`Redeemed · ${reward.title}`);
      else if (outcome === "already") this.flash("This reward has already been redeemed");
      else this.flash("Not enough points for this reward");
    });
  };
  lineStyle(label) {
    const L = [["NS", "#D42E12", "#fff"], ["EW", "#009645", "#fff"], ["NE", "#9900AA", "#fff"], ["CC", "#FA9E0D", "#201e1d"], ["DT", "#005EC4", "#fff"], ["TE", "#9D5B25", "#fff"]];
    const hit = L.find(([p]) => String(label).toUpperCase().indexOf(p) === 0);
    const [bg, fg] = hit ? [hit[1], hit[2]] : ["#201e1d", "#fff"];
    return { display: "inline-flex", alignItems: "center", borderRadius: "999px", padding: "5px 10px", font: "var(--weight-bold) 12px/1 var(--font-body)", letterSpacing: ".01em", background: bg, color: fg, whiteSpace: "nowrap" };
  }
  level(v) { return v < 0.45 ? "light" : v < 0.75 ? "moderate" : "busy"; }
  barsFor(l) { return [{ style: { width: "11px", height: "11px", borderRadius: "999px", background: CROWD[l], display: "block" } }]; }
  bars(v) { return this.barsFor(this.level(v)); }
  snaps(H) { return [190, Math.round(H * 0.55), Math.round(H - 104)]; }

  // The tall snap point, for when there is a breakdown to read.
  tallSheet() {
    const host = this.sheetEl && this.sheetEl.parentElement;
    const H = host ? host.getBoundingClientRect().height : (typeof window !== "undefined" ? window.innerHeight : 844);
    return this.snaps(H)[2];
  }

  // Bring a newly opened breakdown into view, once per selection — a ref
  // callback fires on every render, and scrolling on every tick would fight
  // anyone trying to read it.
  scrollDetailsIntoView = (el) => {
    if (!el) return;
    if (this._detailsFor === this.state.tripRoute) return;
    this._detailsFor = this.state.tripRoute;
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch {
        el.scrollIntoView(false);
      }
    });
  };

  // Distance between two step cards. Measured rather than assumed, so a gap or
  // width change can't put paging out of step with the layout.
  stepPitch(el) {
    const [first, second] = el.children;
    if (first && second) return Math.max(1, second.offsetLeft - first.offsetLeft);
    return Math.max(1, el.clientWidth + 10);
  }

  scrollToStep(idx, smooth = true) {
    const el = this.stepsEl;
    if (!el) return;
    this._programmaticScroll = true;
    el.scrollTo({ left: idx * this.stepPitch(el), behavior: smooth ? "smooth" : "auto" });
  }

  // Touch and pen are left to the browser: native scroll-snap handles a swipe
  // far better than re-implementing momentum, and driving scrollLeft by hand at
  // the same time made the two fight. Only a mouse, which has no native drag
  // scrolling, is handled here.
  startStepsDrag(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const el = this.stepsEl;
    if (!el || e.button === 2) return;

    const startX = e.clientX, startLeft = el.scrollLeft;
    this.setState({ stepsDrag: true });
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // Capture is an optimisation; dragging still works without it.
    }

    const move = (ev) => {
      el.scrollLeft = startLeft + (startX - ev.clientX);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const page = Math.round(el.scrollLeft / this.stepPitch(el));
      this.userScrolled = Date.now();
      this.setState({ navPage: page });
      this.scrollToStep(page);
      // Snap stays off until the programmatic scroll lands — re-enabling it
      // mid-flight cancels that scroll and leaves the pager between cards.
      if (this._snapBackT) clearTimeout(this._snapBackT);
      this._snapBackT = setTimeout(() => this.setState({ stepsDrag: false }), 420);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  }

  startSheetDrag(e) {
    const el = this.sheetEl, host = el && el.parentElement;
    if (!host) return;
    e.preventDefault();
    const H = host.getBoundingClientRect().height;
    const snaps = this.snaps(H), startY = e.clientY, startH = this.state.sheetH || snaps[1];
    let moved = false, cur = startH;
    this.setState({ sheetDrag: true });
    const move = (ev) => {
      const d = startY - ev.clientY;
      if (Math.abs(d) > 4) moved = true;
      cur = Math.max(150, Math.min(snaps[2], startH + d));
      this.setState({ sheetH: cur });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      let target;
      if (!moved) target = cur >= snaps[2] - 10 ? snaps[1] : snaps[2];
      else target = snaps.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a), snaps[0]);
      this.setState({ sheetH: target, sheetDrag: false });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  renderVals() {
    const s = this.state, sc = s.screen;

    const rTypes = [
      { id: "crowd", label: "Packed platform", sub: "Two trains to board", pts: 30 },
      { id: "esc", label: "Escalator or lift down", sub: "Out of service", pts: 25 },
      { id: "delay", label: "Train held", sub: "Waiting at the platform", pts: 30 },
      { id: "gantry", label: "Gantry queue", sub: "Backed up to the street", pts: 20 },
      { id: "bus", label: "Bus full", sub: "Drove past the stop", pts: 20 },
      { id: "aircon", label: "Comfort issue", sub: "Carriage too warm", pts: 15 },
    ].map((t) => {
      const on = s.repType === t.id;
      const icon = { crowd: "users", esc: "move-vertical", delay: "timer", gantry: "scan-line", bus: "bus", aircon: "thermometer" }[t.id];
      return {
        ...t, icon, pick: () => this.setState({ repType: t.id, rep: "confirm", sev: null }), tone: on ? "accent" : "plain",
        iconStyle: { width: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: on ? "var(--accent)" : "var(--accent-soft)", color: on ? "var(--text-on-accent)" : "var(--text-accent)" },
        ptsStyle: { display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start", font: "var(--weight-bold) 11px/1 var(--font-body)", color: "var(--text-accent)", background: on ? "var(--surface-card)" : "var(--accent-soft)", borderRadius: 999, padding: "6px 9px" },
      };
    });
    const chosen = rTypes.find((t) => t.id === s.repType) || rTypes[0];

    const SEV = {
      crowd: { q: "How packed is it", opts: ["Manageable · one train wait", "Getting busy · two to three trains", "Crush · holding at the gantry"] },
      esc: { q: "What is out", opts: ["One escalator stopped · stairs beside it", "Escalator out · long queue at the stairs", "Lift out · no step-free way up"] },
      delay: { q: "How long has it been held", opts: ["Under 5 min · doors still open", "5 to 15 min · no announcement yet", "Over 15 min · staff turning people away"] },
      gantry: { q: "How far does the queue reach", opts: ["A few people at the gates", "Queue inside the concourse", "Queue out to the street"] },
      bus: { q: "What happened at the stop", opts: ["Standing room only · squeezed on", "Full · only a few could board", "Drove past · nobody could board"] },
      aircon: { q: "What is uncomfortable", opts: ["Slightly warm · bearable", "No aircon · uncomfortable", "Unbearable · people moving carriage"] },
    };
    const sevSet = SEV[s.repType || "crowd"] || SEV.crowd;
    const severities = sevSet.opts.map((label, i) => ({ label, on: s.sev === i, pick: () => this.setState({ sev: i }) }));

    // Reports, grouped and scored against LTA's own feed. Every number the
    // Report tab shows comes from here, and every one of them is countable.
    const reportsState = s.reportGroups || { groups: [], pending: false, error: null };
    const reportGroups = groupsFromCounts(reportsState.groups, { ltaStations: this.ltaNamedStations() });
    const mine = s.myReports || [];
    // Confirmed points are spendable; pending ones are not, because the report
    // they came from has not been corroborated yet.
    const confirmedPoints = confirmedPointTotal(mine);
    const pendingPoints = mine.filter((r) => r.state === "pending").reduce((sum, r) => sum + (r.points || 0), 0);
    const rewardRedemptions = Array.isArray(s.rewardRedemptions) ? s.rewardRedemptions : [];
    const redeemedPoints = redeemedPointTotal(rewardRedemptions);
    const availablePoints = Math.max(0, confirmedPoints - redeemedPoints);
    const redeemedRewardIds = new Set(rewardRedemptions.map((redemption) => redemption?.id).filter(Boolean));

    const vouchers = [
      { id: "kopitiam-1", title: "$1 off at Kopitiam", sub: "400 points · 6 outlets nearby", cost: 400 },
      { id: "ezlink-5", title: "$5 EZ-Link top-up", sub: "1,800 points · instant", cost: 1800 },
      { id: "fairprice-3", title: "$3 FairPrice voucher", sub: "1,200 points", cost: 1200 },
      { id: "offpeak-rebate", title: "Off-peak fare rebate", sub: "3,000 points · LTA pilot", cost: 3000 },
    ].map((v, vi) => {
      const redeemed = redeemedRewardIds.has(v.id);
      const can = !redeemed && availablePoints >= v.cost;
      const locked = !can && !redeemed;
      return {
        ...v, cta: redeemed ? "Redeemed" : can ? "Redeem" : "Locked", variant: can ? "primary" : "secondary", disabled: !can, locked, redeemed,
        icon: ["coffee", "credit-card", "shopping-basket", "ticket"][vi] || "gift",
        gap: Math.max(0, v.cost - availablePoints).toLocaleString(),
        cardStyle: { background: "var(--surface-card)", border: "1px solid var(--border-card)", borderRadius: "var(--radius-card)", padding: "14px 15px", opacity: can ? 1 : 0.78 },
        iconStyle: { flex: "none", width: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: can ? "var(--accent-soft)" : "var(--sand-100)", color: can ? "var(--text-accent)" : "var(--text-muted)" },
        barStyle: { width: Math.round(Math.min(1, availablePoints / v.cost) * 100) + "%", height: "100%", background: "var(--accent)", borderRadius: 999 },
        redeem: () => this.redeemReward(v),
      };
    });

    const resolvedOrigin = this.effectiveRouteOrigin();
    const ORIGIN = resolvedOrigin?.ll || ORIGIN_FALLBACK;
    const MAP_ORIGIN = s.routeOrigin?.ll || s.userLoc || (resolvedOrigin?.kind === "home" ? resolvedOrigin.ll : ORIGIN_FALLBACK);
    // The dot follows every fix; the viewport follows real movement only. GPS
    // wander of a few metres would otherwise pan the map continuously under
    // anyone trying to read it.
    if (
      !this._mapCenter ||
      (!this._mapCenterReal && s.userLoc && !s.routeOrigin) ||
      metresBetween(this._mapCenter, MAP_ORIGIN) > MAP_FOLLOW_M
    ) {
      this._mapCenter = MAP_ORIGIN;
      this._mapCenterReal = !!s.userLoc && !s.routeOrigin;
    }
    const q = s.query.trim().toLowerCase();
    // Only ever live OneMap results.
    const resultSource = s.liveResults && s.liveResults.query === s.query ? s.liveResults.items : [];
    const areaCenter = s.searchTarget === "area" && Array.isArray(s.pin?.ll) ? s.pin.ll : null;
    const rankedResults = areaCenter
      ? resultSource.map((place) => ({ ...place, areaMetres: metresBetween(areaCenter, place.ll) })).sort((a, b) => a.areaMetres - b.areaMetres)
      : resultSource;
    const results = rankedResults.slice(0, 6).map((p) => ({
      ...p,
      detail: areaCenter ? `${p.detail} · ${nearbyDistance(p.areaMetres)}` : p.detail,
      kind: areaCenter ? "Nearby" : p.kind,
      // Clearing the query here is what stops the panel reopening when the
      // user comes back via "Change".
      pick: () => s.searchTarget === "origin"
        ? this.setState({ routeOrigin: { ...p, id: p.id || "custom" }, searchTarget: "dest", query: "", searchOpen: false, liveResults: null, searchPending: false, trips: { key: null, options: [], pending: false, error: null } })
        : this.chooseDest(p, s.searchTarget === "area" ? { pin: null } : undefined),
    }));

    const dest = s.dest;
    const trips = s.trips || { options: [], pending: false, error: null };
    // Cards come straight from OneMap itineraries, enriched with LTA crowding.
    const rawTripOptions = trips.options || [];
    const routePersona = (s.routingPreferences || {}).persona || DEFAULT_PERSONA;
    const weatherRankedTrips = rankRoutesForWeather(rawTripOptions, {
      nowcast: s.weather?.nowcast,
      outlook: s.weather?.outlook,
      from: ORIGIN,
      to: dest?.ll,
      departureAt: s.tripDeparture?.at || Date.now(),
    });
    const aiSelectedIndex = s.aiRoute?.decision?.selectedIndex;
    const aiSelected = Number.isInteger(aiSelectedIndex)
      ? weatherRankedTrips.find((entry) => entry.originalIndex === aiSelectedIndex)
      : null;
    const rankedTrips = aiSelected
      ? [aiSelected, ...weatherRankedTrips.filter((entry) => entry !== aiSelected)]
      : weatherRankedTrips;
    const recommendedTrip = rankedTrips[0]?.option || null;
    const weatherChangedRecommendation = Boolean(
      rankedTrips[0]?.weather?.wet && rankedTrips[0]?.originalIndex !== 0
    );
    const tripOptions = rankedTrips.map(({ option: o, weather, originalIndex }, i) => ({
      ...o,
      // Selecting a card opens its breakdown, so give the sheet room for it.
      pick: () => this.setState((st) => ({ tripRoute: i, tripCollapsed: st.tripRoute === i ? !st.tripCollapsed : false, sheetH: Math.max(st.sheetH || 430, this.tallSheet()) })),
      tone: s.tripRoute === i ? "accent" : "hairline",
      start: (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (trips.recorded || o.recorded) return;
        // Starting a route is the strongest signal there is about where you
        // actually travel, so it is what the memory learns from.
        this.rememberJourney(o);
        // Snapshot the route: re-planning while under way must not pull the
        // steps out from under the screen showing them.
        this.setState({
          tripRoute: i, navRoute: i, navTrip: o, screen: "nav", navStart: Date.now(),
          navProgress: null, navFixStatus: null, navPage: 0,
        });
      },
      legs: (o.legs || []).map((label) => ({ label, style: this.lineStyle(label) })),
      bars: o.crowdLevel ? this.barsFor(o.crowdLevel) : [],
      recorded: !!trips.recorded || !!o.recorded,
      crowd: o.walkOnly ? "Walking route" : o.crowdLevel ? WORD[o.crowdLevel] : "Crowding unknown",
      fare: o.fare || "Fare unknown",
      fitReason: (() => {
        const aiAlternative = (s.aiRoute?.decision?.alternatives || []).find((item) => item.index === originalIndex);
        const aiReason = i === 0 && aiSelected
          ? s.aiRoute.decision.reason
          : aiAlternative?.reason;
        // When Gemini answers, show its returned explanation verbatim. Local
        // rules below are a fallback only; mixing the two made model output
        // indistinguishable from hardcoded copy.
        if (aiReason) return aiReason;
        const base = i === 0 && weatherChangedRecommendation
          ? weather.cycling
            ? `Best fit · ${weather.text} is expected, so Solvik moved cycling behind a weather-safe option.`
            : `Best fit · ${weather.text} is expected, so this route's shorter walk wins after the rain adjustment.`
          : routeFitReason(routePersona, o, recommendedTrip, i === 0);
        if (i !== 0) return base;

        const plannedRoadWork = this.roadEventsOnRoute(o).roadWorks[0] || null;
        const liveIncident = (o.transitLegs || [])
          .filter((leg) => leg.mode === "BUS" && Number.isFinite(leg.fromLat) && Number.isFinite(leg.fromLng))
          .map((leg) => incidentNear((s.road || {}).incidents, [leg.fromLat, leg.fromLng]))
          .find(Boolean) || null;
        if (!plannedRoadWork && !liveIncident) return base;

        const issue = plannedRoadWork
          ? `${roadWorkLabel(plannedRoadWork)} ${plannedRoadWork.kind === "roadopening" ? "affects" : "affect"} this journey`
          : `${liveIncident.type || "A road issue"} is reported near this journey`;
        const next = rankedTrips[1]?.option || null;
        const advantage = next ? Math.max(0, (next.mins || 0) - (o.mins || 0)) : 0;
        const modeName = { bus: "bus", train: "train", transit: "combined-transit", walk: "walking", cycle: "cycling", express: "express" }[s.tripMode] || "route";
        const why = advantage > 0
          ? `it is still about ${advantage} min quicker than the next ${modeName} option`
          : s.tripMode === "transit"
            ? "it still has the best balance of changes and total journey time"
            : `it is still the highest-ranked ${modeName} option from OneMap`;
        return `${issue}. It remains the best choice because ${why}. The road issue can add uncertainty that is not included in the timetable, so allow extra time.`;
      })(),
      fitReasonSource: (i === 0 && aiSelected) || (s.aiRoute?.decision?.alternatives || []).some((item) => item.index === originalIndex)
        ? "Gemini explanation"
        : "Local fallback",
      recommended: i === 0,
      weather: s.weather?.pending
        ? { pending: true, title: "Checking weather along this route…", detail: "The recommendation will update when the forecast arrives." }
        : weather,
      weatherChangedRecommendation: i === 0 && weatherChangedRecommendation,
      originalRank: originalIndex,
      // The breakdown is built for the selected card only — the others stay
      // compact so three options still fit on a phone screen.
      expanded: s.tripRoute === i && !s.tripCollapsed,
      detailHint: s.tripRoute === i && !s.tripCollapsed ? "Hide steps" : "Show steps",
      details: s.tripRoute === i ? detailRows(o, s.arrivals).map((row) => this.detailRowVals(row)) : [],
      detailsRef: this.scrollDetailsIntoView,
    }));

    const destShort = dest ? dest.name.split(" (")[0].replace(/\s+$/, "") : "your destination";
    const navOpt = s.navTrip || tripOptions[s.navRoute != null ? s.navRoute : s.tripRoute] || tripOptions[0];
    const navArr = (navOpt && navOpt.steps) || [];
    const navGeometry = (navOpt && navOpt.geometry) || [];
    const navTotal = navArr.reduce((a, b) => a + (b.secs || 0), 0) || 1;

    // Progress comes from the device's position whenever one has placed the
    // traveller on this route. The clock is only a stand-in until then: mixing
    // the two mid-trip is what made the countdown and the current station jump
    // about, so once the position leads, the clock never takes over again — a
    // lost or off-route fix holds progress where it was and says so.
    const nowMs = s.tick || Date.now();
    const elapsedSecs = s.navStart ? (nowMs - s.navStart) / 1000 : 0;
    const navByGps = !!s.navProgress;
    const navAlongM = navByGps ? s.navProgress.alongM : alongMAtTime(navOpt, elapsedSecs);
    const at = navByGps ? timeAtAlongM(navOpt, navAlongM) : stepAtTime(navOpt, elapsedSecs);
    const navElapsed = at.elapsedSecs;
    const navFrac = Math.max(0, Math.min(1, navTotal ? navElapsed / navTotal : 0));
    const navIdx = at.stepIdx;
    const stepRem = at.stepRemainSecs;

    const fixAge = s.userFixAt ? nowMs - s.userFixAt : null;
    const navStale = navByGps && (s.navFixStatus === "off-route" || (fixAge != null && fixAge > STALE_FIX_MS));
    const navTrackNote = !s.navTrip
      ? null
      : s.navFixStatus === "denied"
      ? "Location off · timings are estimated"
      : s.navFixStatus === "no-route"
      ? "Timings from the timetable · this route has no map line"
      : !navByGps
      ? "Waiting for GPS · timings are estimated"
      : s.navFixStatus === "off-route"
      ? "Off route · holding your last position"
      : navStale
      ? "GPS lost · holding your last position"
      : null;

    const arrived = navArr.length > 0 && navElapsed >= navTotal - 1;
    if (arrived) this.markArrived();
    this._navIdx = navIdx;
    const fmtS = (x) => (x >= 60 ? durationLabel(x) : Math.max(0, Math.ceil(x)) + " s");
    const curStep = navArr[navIdx] || {};
    const stepProg = at.stepFrac || 0;
    const curStops = curStep.stops && curStep.stops.length ? curStep.stops : null;
    const passed = curStops ? Math.min(curStops.length - 1, Math.floor(stepProg * curStops.length)) : 0;
    const stopsLeft = curStops ? curStops.length - passed : 0;
    const liveStopLine = curStops
      ? "Next: " + curStops[passed] + " · " + stopsLeft + " stop" + (stopsLeft === 1 ? "" : "s") + " to " + curStep.alight
      : curStep.detail;

    const nav = {
      navIcon: arrived ? "circle-check" : curStep.icon || "navigation",
      navTitle: arrived ? "You have arrived" : curStep.title || "Getting your next step",
      navDetail: arrived ? destShort : liveStopLine,
      navCountdown: arrived ? "Done" : fmtS(stepRem),
      navStepLabel: arrived ? "Trip complete" : navArr.length ? "Step " + (navIdx + 1) + " of " + navArr.length : "Preparing trip",
      navEta: navOpt ? singaporeClock(Date.now() + Math.max(0, navTotal - navElapsed) * 1000) : "",
      navRemainLabel: arrived ? "Arrived · " + destShort : Math.max(1, Math.ceil((navTotal - navElapsed) / 60)) + " min left · " + destShort,
      navTrackNote,
      navTrackTone: s.navFixStatus === "denied" || navStale || s.navFixStatus === "off-route" ? "warn" : "muted",
      // The map follows the real position; where there isn't one, it frames the
      // route instead of drawing a dot the device never reported.
      navCoord: s.userLoc || coordAt(navOpt, navAlongM) || navGeometry[0] || ORIGIN,
      navMarker: s.userLoc || null,
      navAccuracy: s.userLoc ? s.userAccuracy : null,
      navProgressStyle: { width: Math.round(navFrac * 100) + "%", height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 1s linear" },
      setStepsRef: (el) => { this.stepsEl = el; },
      stepsPagerStyle: {
        flex: "1 1 auto", width: "100%", minWidth: 0, maxWidth: "100%", minHeight: 0, display: s.navSheetH != null && s.navSheetH < 240 ? "none" : "flex", alignItems: "stretch", gap: 10, overflowX: "auto", overflowY: "hidden",
        scrollSnapType: s.stepsDrag ? "none" : "x mandatory", scrollbarWidth: "none",
        cursor: s.stepsDrag ? "grabbing" : "grab", userSelect: "none",
      },
      stepsDragStart: (e) => this.startStepsDrag(e),
      onStepsScroll: (e) => {
        const el = e.currentTarget;
        if (!this._programmaticScroll) this.userScrolled = Date.now();
        if (this._settleT) clearTimeout(this._settleT);
        this._settleT = setTimeout(() => {
          this._programmaticScroll = false;
          const p = Math.round(el.scrollLeft / this.stepPitch(el));
          if (p !== this.state.navPage) this.setState({ navPage: p });
        }, 120);
      },
      navDots: navArr.map((st, idx) => ({
        style: { width: idx === s.navPage ? 18 : 6, height: 6, borderRadius: 999, background: idx === s.navPage ? "var(--accent)" : idx < navIdx ? "var(--sand-400)" : "var(--sand-300)", transition: "width var(--dur-base) var(--ease-out),background-color var(--dur-base) var(--ease-standard)" },
      })),
      navList: navArr.map((st, idx) => {
        const done = idx < navIdx || arrived, cur = idx === navIdx && !arrived;
        const nStops = (st.stops || []).length;
        const ROW = 32, span = Math.max(0, (nStops - 1) * ROW);
        const prog = cur ? stepProg : done ? 1 : 0;
        const stopList = (st.stops || []).map((name, j) => {
          const sDone = done || (cur && j < passed), sNext = cur && j === passed;
          return {
            name,
            rowStyle: { display: "flex", alignItems: "center", gap: 10, height: ROW, position: "relative", zIndex: 1 },
            style: { font: (sNext ? "var(--weight-bold)" : "var(--weight-regular)") + " 12px/1.2 var(--font-body)", color: sNext ? "var(--text-accent)" : sDone ? "var(--text-subtle)" : "var(--text-body)", textWrap: "pretty" },
            dotStyle: { width: sNext ? 11 : 9, height: sNext ? 11 : 9, borderRadius: 999, background: sDone ? "var(--accent)" : "var(--surface-card)", border: sDone ? "2px solid var(--accent)" : "2px solid var(--sand-400)", boxShadow: sNext ? "0 0 0 3px var(--accent-soft)" : "none" },
          };
        });
        return {
          title: st.title, detail: cur && st.stops ? liveStopLine : st.detail, dur: fmtS(st.secs), icon: st.icon,
          stopList, hasStops: nStops > 0, showVehicle: cur && nStops > 0,
          laneWrapStyle: { position: "relative", marginTop: 4, paddingLeft: 0 },
          laneStyle: { position: "absolute", left: 11, top: ROW / 2, height: span, width: 4, background: "var(--sand-200)", borderRadius: 999 },
          laneFillStyle: { position: "absolute", left: 11, top: ROW / 2, height: Math.round(span * prog), width: 4, background: "var(--accent)", borderRadius: 999, transition: "height 1s linear" },
          vehicleStyle: { position: "absolute", left: 0, top: Math.round(ROW / 2 + span * prog - 13), width: 26, height: 26, borderRadius: 999, background: "var(--accent)", color: "var(--text-on-accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(32,30,29,.3)", transition: "top 1s linear", zIndex: 2 },
          state: done ? "Done" : cur ? "Now" : "Next",
          cardStyle: { flex: "0 0 100%", minWidth: 0, boxSizing: "border-box", scrollSnapAlign: "start", background: cur ? "var(--accent-soft)" : "var(--surface-card)", border: "1px solid " + (cur ? "transparent" : "var(--border-card)"), borderRadius: "var(--radius-card)", padding: "14px 15px", display: "flex", flexDirection: "column", gap: 7, overflowY: "auto", overscrollBehaviorY: "contain", opacity: done ? 0.62 : 1 },
          iconWrapStyle: { flex: "none", width: 30, height: 30, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: cur ? "var(--accent)" : "var(--sand-100)", color: cur ? "var(--text-on-accent)" : "var(--text-body)" },
          chipStyle: { font: "var(--weight-bold) 10px/1 var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase", color: cur ? "var(--text-accent)" : "var(--text-muted)", background: cur ? "var(--surface-card)" : "var(--sand-100)", borderRadius: 999, padding: "5px 9px" },
          titleStyle: { font: "var(--weight-heavy) var(--size-body)/1.3 var(--font-body)", color: "var(--text-strong)", textWrap: "pretty" },
        };
      }),
    };

    const tabDefs = [{ id: "map", label: "Map" }, { id: "plan", label: "Plan" }, { id: "report", label: "Report" }, { id: "rewards", label: "Points" }];
    const chipDefs = [["intro", "Intro"], ["map", "Map"], ["plan", "Plan"], ["report", "Report"], ["rewards", "Points"]];
    const activeRoute = dest ? tripOptions[s.tripRoute] || tripOptions[0] : null;
    const crowdByCode = new Map(((s.crowd && s.crowd.stations) || []).map((station) => [String(station.code || "").toUpperCase(), station]));
    const routeCrowdStations = [];
    const seenRouteStops = new Set();
    (activeRoute?.steps || []).forEach((step) => {
      const mode = String(step.mode || "").toUpperCase();
      if (mode === "WALK") return;
      if (mode === "BUS") {
        const leg = (activeRoute.transitLegs || []).find((item) => item.legIndex === step.legIndex) || null;
        const span = activeRoute.legSpans?.[step.legIndex] || null;
        const ll = span && activeRoute.geometry?.length
          ? activeRoute.geometry[Math.round((span.from + span.to) / 2)]
          : Number.isFinite(leg?.fromLat) && Number.isFinite(leg?.fromLng)
            ? [leg.fromLat, leg.fromLng]
            : step.stopPoints?.find((point) => Array.isArray(point.ll))?.ll || null;
        if (Array.isArray(ll) && ll.every(Number.isFinite)) {
          routeCrowdStations.push({
            id: `route-bus-${step.legIndex}`,
            ll,
            level: leg?.crowdLevel || step.crowdLevel || "unknown",
            label: leg?.label || step.label || (leg?.service ? `BUS ${leg.service}` : "Bus"),
            busLoad: true,
          });
        }
        return;
      }
      const points = Array.isArray(step.stopPoints) && step.stopPoints.length
        ? step.stopPoints
        : [step.boardStopCode, ...(step.stopCodes || []), step.alightStopCode].filter(Boolean).map((code) => ({ code }));
      points.forEach((point) => {
        const code = String(point.code || "").toUpperCase();
        const live = code ? crowdByCode.get(code) : null;
        const ll = live && Number.isFinite(Number(live.lat)) && Number.isFinite(Number(live.lng))
          ? [Number(live.lat), Number(live.lng)]
          : Array.isArray(point.ll) && point.ll.length >= 2 ? point.ll.map(Number) : null;
        if (!ll || !ll.every(Number.isFinite)) return;
        const key = code || `${ll[0].toFixed(5)},${ll[1].toFixed(5)}`;
        if (seenRouteStops.has(key)) return;
        seenRouteStops.add(key);
        routeCrowdStations.push({
          id: `route-crowd-${key}`,
          ll,
          radius: 220,
          level: live?.level || "unknown",
          label: live?.name || point.name || code || "Stop",
          routeStop: true,
        });
      });
    });
    const routeCrowdLevels = new Set(routeCrowdStations.map((station) => station.level));
    const routeCrowdGuide = [
      { level: "light", label: "Light", color: "var(--crowd-light)" },
      { level: "moderate", label: "Filling", color: "var(--crowd-moderate)" },
      { level: "busy", label: "Busy", color: "var(--crowd-busy)" },
      { level: "unknown", label: "No data", color: "var(--text-muted)" },
    ];
    const weatherState = s.weather || { nowcast: null, outlook: null, pending: false, error: null };
    const weatherPoint = s.userLoc || dest?.ll || this._mapCenter || ORIGIN;
    const currentNowcast = nowcastAt(weatherState.nowcast, weatherPoint);
    const currentOutlook = forecastAt({ outlook: weatherState.outlook, ll: weatherPoint, at: Date.now() });
    const weatherText = currentNowcast?.text || currentOutlook?.text || weatherState.outlook?.general || "";
    const weatherArea = currentNowcast?.name || (currentOutlook?.region ? `${currentOutlook.region[0].toUpperCase()}${currentOutlook.region.slice(1)} Singapore` : "Singapore");
    const weatherValidTo = currentNowcast?.validTo || weatherState.nowcast?.validTo || null;
    const weatherPhase = singaporeDayPhase(s.tick || Date.now());
    const mapWeather = {
      pending: !!weatherState.pending,
      error: weatherState.error || null,
      icon: weatherState.pending ? "loader-2" : weatherState.error ? "cloud-off" : weatherIconName(weatherText, weatherPhase),
      phase: weatherPhase,
      title: weatherState.pending ? "Checking the weather…" : weatherState.error ? "Weather unavailable" : weatherText || "Forecast unavailable",
      detail: weatherState.pending
        ? "Reading Singapore’s latest NEA forecast."
        : weatherState.error
          ? "The live NEA forecast could not be reached. Try again in a moment."
          : `${weatherArea} · ${currentNowcast ? "NEA 2-hour forecast" : "NEA 24-hour forecast"}`,
      meta: weatherValidTo ? `Valid until ${singaporeClock(weatherValidTo)}` : "Live Singapore forecast from NEA",
      wet: isWet(currentNowcast?.condition || currentOutlook?.condition),
      ariaLabel: weatherState.pending ? "Checking Singapore weather" : weatherState.error ? "Singapore weather unavailable" : `Singapore weather: ${weatherText || "forecast unavailable"}`,
      retry: this.loadWeather,
    };

    return {
      chips: chipDefs.map(([id, label]) => ({
        label, go: () => this.go(id),
        style: { cursor: "pointer", borderRadius: "999px", padding: "8px 14px", font: "var(--weight-semibold) 13px/1 var(--font-body)", border: "1px solid " + (sc === id ? "var(--accent)" : "var(--border-hairline)"), background: sc === id ? "var(--accent)" : "var(--surface-card)", color: sc === id ? "var(--text-on-accent)" : "var(--text-muted)", transition: "background 150ms cubic-bezier(.2,.7,.3,1)" },
      })),
      ...this.introVals(s, sc),
      isReport: sc === "report", isRewards: sc === "rewards", isPlan: sc === "plan", isAccount: sc === "account",
      showStatus: ["report", "rewards", "plan", "account"].indexOf(sc) >= 0,
      showTabs: ["map", "plan", "report", "rewards", "account"].indexOf(sc) >= 0 && !(sc === "map" && !!s.dest),
      isMap: sc === "map", mapSearch: !s.dest, mapRoute: !!s.dest,
      mapWeather,
      // The panel stays shut until there is a real query to answer — focusing
      // the field no longer surfaces the built-in place list.
      showResults: !s.dest && s.searchOpen && q.length >= 2,
      // Your own history, shown only when you open an empty search box — it
      // disappears the moment you start typing.
      showRecents: s.searchTarget === "dest" && !s.dest && !!s.searchOpen && q.length < 2 && (s.recents || []).length > 0,
      showAreaSearch: s.searchTarget === "area" && !s.dest && !!s.searchOpen && q.length < 2 && !!s.pin,
      areaSearchCategories: [
        { label: "Food & drink", query: "food centre", icon: "utensils" },
        { label: "MRT & LRT", query: "MRT station", icon: "train-front" },
        { label: "Bus hubs", query: "bus interchange", icon: "bus" },
        { label: "Clinics", query: "clinic", icon: "cross" },
      ].map((category) => ({ ...category, pick: () => this.setState({ query: category.query }) })),
      areaSearchDetail: s.pin?.detail || "Dropped pin",
      recents: (s.recents || []).map((r) => ({
        name: r.name,
        detail: r.detail || "Recent destination",
        pick: () => this.chooseDest({ name: r.name, detail: r.detail || "", ll: r.ll, kind: r.kind || "Recent" }),
      })),
      clearRecents: () => this.setState({ recents: clearSearches() }),
      openSearch: () => {
        clearTimeout(this.bt);
        this.setState((current) => ({ searchOpen: true, searchTarget: current.searchTarget === "area" ? "area" : "dest" }));
      },
      hideSearch: () => { clearTimeout(this.bt); this.setState({ searchOpen: false }); },
      openOriginSearch: () => this.setState({
        searchOpen: true,
        searchTarget: "origin",
        query: resolvedOrigin?.name || "",
        liveResults: null,
        searchPending: false,
      }),
      closeSearch: () => { if (this.bt) clearTimeout(this.bt); this.bt = setTimeout(() => this.setState({ searchOpen: false }), 160); },
      dismissSearch: () => this.setState({ query: "", searchOpen: false, searchTarget: "dest", liveResults: null, searchPending: false }),
      query: s.query,
      searchTarget: s.searchTarget,
      setQuery: (val) => this.setState({ query: val }),
      clearQuery: () => this.setState({ query: "", liveResults: null, searchPending: false }),
      results,
      resultsLabel: s.searchTarget === "area" ? `Nearest matches for “${s.query.trim()}”` : "Results for “" + s.query.trim() + "”",
      searchPending: !!s.searchPending,
      searchEmpty: !s.searchPending && !s.searchError && results.length === 0,
      searchError: s.searchError || null,
      searchFooter: s.searchTarget === "area"
        ? (s.liveResults?.items || []).some((item) => item.source === "OpenStreetMap")
          ? "Nearest to the pin · Place data © OpenStreetMap contributors"
          : "Ranked by distance from the pin · Results from OneMap"
        : "Results from OneMap · Singapore Land Authority",
      routeOriginPlace: s.routeOrigin || null,
      routeOriginReset: s.routeOriginReset || 0,
      routeOriginName: resolvedOrigin?.name || "Choose a starting place",
      routeOriginDisplay: (() => {
        const savedId = s.routeOrigin?.id;
        if (savedId && ["home", "work", "school"].includes(savedId)) {
          return { home: "Home", work: "Work", school: "School" }[savedId];
        }
        if (!s.routeOrigin && s.userLoc) return "My location";
        if (!s.routeOrigin && s.savedPlaces?.home?.verified) return "Home";
        return s.routeOrigin?.name || resolvedOrigin?.name || "";
      })(),
      setRouteOrigin: (place) => this.setState({ routeOrigin: place, routeOriginDraft: false, tripCollapsed: true, trips: { key: null, options: [], pending: false, error: null } }),
      setRouteOriginDraft: (draft) => this.setState({ routeOriginDraft: draft }),
      routeOriginInput: s.searchTarget === "origin" ? s.query : (resolvedOrigin?.name || "Current location"),
      searchPlaceholder: s.searchTarget === "origin" ? "Search starting place" : s.searchTarget === "area" ? "Search near dropped pin" : "Search address, stop or area",
      originPresets: [
        {
          id: "location",
          label: s.locating ? "Locating…" : "My location",
          icon: "locate-fixed",
          detail: "Use this device's current position",
          active: !s.routeOrigin && !!s.userLoc,
          disabled: !!s.locating,
          pick: () => this.requestCurrentLocation(true, true)
            .then(() => this.setState((st) => ({ routeOrigin: null, routeOriginDraft: false, routeOriginReset: (st.routeOriginReset || 0) + 1, trips: { key: null, options: [], pending: false, error: null } }), this.loadTripOptions))
            .catch(() => {}),
        },
        ...["home", "work", "school"]
          .map((id) => s.savedPlaces?.[id])
          .filter((place) => place?.verified && Array.isArray(place.ll))
          .map((place) => ({
            id: place.id,
            label: { home: "Home", work: "Work", school: "School" }[place.id],
            icon: { home: "house", work: "briefcase", school: "graduation-cap" }[place.id],
            detail: savedPlaceDetail(place),
            active: s.routeOrigin?.id === place.id || (!s.routeOrigin && !s.userLoc && place.id === "home"),
            disabled: false,
            pick: () => this.setState({ routeOrigin: place, routeOriginDraft: false, tripCollapsed: true, trips: { key: null, options: [], pending: false, error: null } }, this.loadTripOptions),
          })),
      ],
      destName: dest ? dest.name : "", destDetail: dest ? dest.detail : "",
      tripDepartureLabel: s.tripDeparture?.label || "Leave now",
      destCoord: dest ? dest.ll : null, originCoord: ORIGIN, routeOriginCoord: dest ? s.routeOrigin?.ll || null : null, mapCenter: this._mapCenter,
      savedPlaceMarkers: s.routingPreferences?.showSavedPlaces === false
        ? []
        : ["home", "work", "school"].map((id) => s.savedPlaces?.[id]).filter((place) => place?.verified && Array.isArray(place.ll)),
      // The dot is drawn only where the device actually reported being — the
      // fallback origin is good enough to plan from, not to point at.
      userMarker: s.userLoc || null,
      // No destination, no line: the map must not keep drawing the plan you
      // just backed out of.
      routeCoords: dest ? (tripOptions[s.tripRoute] || tripOptions[0] || {}).geometry || [] : [],
      routeCrowdStations,
      routeCrowdGuide,
      routeCrowdLegend: routeCrowdGuide.filter((item) => routeCrowdLevels.has(item.level)),
      // When the shown route avoids something, the route it replaced is drawn
      // faint behind it: 3.2.3 wants the trade-off visible, not asserted.
      compareRouteCoords: dest && (s.tripAvoid || (s.tripAvoidStations || []).length) ? ((s.tripBefore && s.tripBefore.geometry) || []) : [],
      // Which spans of the shown route are disrupted. A leg on a line named in
      // a current alert is drawn in the fault colour over the route.
      affectedSpans: (() => {
        const option = dest ? tripOptions[s.tripRoute] || tripOptions[0] : null;
        if (!option || !option.legSpans) return [];
        const hit = (label) => ((s.faults && s.faults.items) || []).some((f) => canonicalLine(f.line) && sameLine(label, f.line));
        return (option.transitLegs || [])
          .filter((leg) => hit(leg.label))
          .map((leg) => option.legSpans[leg.legIndex])
          .filter(Boolean);
      })(),
      // Only issues that touch the route currently drawn are mapped. LTA rail
      // alerts carry station codes; planned lift works do too. When a line-wide
      // alert has no station coordinate, its marker falls on the affected leg
      // rather than somewhere unrelated on the island.
      mapIssues: (() => {
        const option = dest ? tripOptions[s.tripRoute] || tripOptions[0] : null;
        if (!option) return [];
        const stationIndex = new Map(((s.crowd && s.crowd.stations) || []).map((station) => [String(station.code || "").toUpperCase(), station]));
        const items = [];
        const seen = new Set();
        const push = (issue) => {
          if (!issue || !Array.isArray(issue.ll)) return;
          const key = `${issue.kind}|${issue.title}|${issue.ll[0].toFixed(4)},${issue.ll[1].toFixed(4)}`;
          if (seen.has(key)) return;
          seen.add(key);
          items.push(issue);
        };
        const midpointForLine = (line) => {
          const leg = (option.transitLegs || []).find((entry) => sameLine(entry.label, line));
          const span = leg && option.legSpans && option.legSpans[leg.legIndex];
          if (!span || !option.geometry) return null;
          return option.geometry[Math.round((span.from + span.to) / 2)] || null;
        };

        ((s.faults && s.faults.items) || [])
          .filter((fault) => (option.transitLegs || []).some((leg) => sameLine(leg.label, fault.line)))
          .forEach((fault) => {
            const located = (fault.stations || []).map((code) => stationIndex.get(String(code).toUpperCase())).filter(Boolean);
            if (located.length) {
              located.slice(0, 3).forEach((station) => push({ kind: "alert", ll: [station.lat, station.lng], title: fault.title, detail: station.name || fault.detail }));
            } else {
              push({ kind: "alert", ll: midpointForLine(fault.line), title: fault.title, detail: fault.detail });
            }
          });

        this.worksOnRoute(option).forEach((work) => {
          const station = stationIndex.get(String(work.stationCode || "").toUpperCase());
          if (station) push({ kind: "lift", ll: [station.lat, station.lng], title: worksLabel(work), detail: worksDetail(work) });
        });

        (option.transitLegs || []).filter((leg) => leg.mode === "BUS" && Number.isFinite(leg.fromLat)).forEach((leg) => {
          const incident = incidentNear((s.road || {}).incidents, [leg.fromLat, leg.fromLng]);
          if (incident) push({ kind: "road", ll: incident.ll, title: incident.type || "Road issue", detail: incident.message });
        });
        return items.slice(0, 6);
      })(),
      userAccuracy: s.userLoc ? s.userAccuracy : null,
      recenterToken: s.recenterToken || 0,
      locating: !!s.locating,
      hasFix: !!s.userLoc,
      locateMe: this.locateMe,
      // Sits clear of whichever bottom overlay is currently showing.
      setCrowdBarRef: this.setCrowdBarRef,
      locateBottom: dest ? `min(${(s.sheetH || 430) + 12}px, calc(100% - 64px))` : `calc(${s.fcPin ? 250 : s.pin ? 210 : 96}px + env(safe-area-inset-bottom))`,
      backToSearch: () => this.chooseDest(null),
      pinCoord: s.pin ? s.pin.ll : null,
      hasPin: !!s.pin && !dest && !s.fcPin && !(s.searchTarget === "area" && s.searchOpen),
      showMapAttrib: !dest && !s.pin && !s.fcPin && s.crowdOn === false,
      showPinHint: !s.pin && !dest && !s.searchOpen && !q && !s.fcPin && s.crowdOn === false,
      pinName: s.pin ? s.pin.name : "",
      pinDetail: s.pin ? s.pin.detail : "",
      dropPin: (ll) => {
        if (this.state.dest) return;
        this.setState({
          pin: { ll, name: "Dropped pin", detail: ll[0].toFixed(5) + ", " + ll[1].toFixed(5) },
          searchOpen: false,
        });
      },
      clearPin: () => this.setState({ pin: null }),
      pinDirections: () => {
        const p = this.state.pin;
        if (!p) return;
        this.chooseDest({ name: p.name, detail: p.detail, ll: p.ll, kind: "Pin" }, { pin: null, sheetH: 430 });
      },
      pinSearch: () => {
        const p = this.state.pin;
        if (!p) return;
        this.setState({ query: "", searchOpen: true, searchTarget: "area", liveResults: null, searchPending: false, searchError: null });
      },
      setSheetRef: (el) => { this.sheetEl = el; },
      sheetWrapStyle: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 15, display: "flex", height: (s.sheetH || 430) + "px", maxHeight: "calc(100% - 70px)", transition: s.sheetDrag ? "none" : "height var(--dur-base) var(--ease-out)" },
      sheetStyle: { flex: 1, minHeight: 0, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", background: "var(--surface-card)", borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0", boxShadow: "var(--shadow-sheet)", display: "flex", flexDirection: "column", padding: "0 16px" },
      sheetGrabStyle: { flex: "none", padding: "10px 0 12px", cursor: s.sheetDrag ? "grabbing" : "grab", touchAction: "none", userSelect: "none" },
      sheetDragStart: (e) => this.startSheetDrag(e),
      tripModeTiles: [
        { id: "bus", label: "Bus", icon: "bus" },
        { id: "train", label: "Train", icon: "train-front" },
        { id: "transit", label: "Transit", icon: "route" },
        { id: "walk", label: "Walk", icon: "footprints" },
        { id: "cycle", label: "Cycle", icon: "bike" },
        { id: "express", label: "Express", icon: "zap" },
      ].map((m) => {
        const on = s.tripMode === m.id;
        return {
          ...m, pick: () => this.setState({ tripMode: m.id, tripAvoid: null, tripAvoidStations: null, tripRoute: 0, tripCollapsed: true }),
          tileStyle: "flex:none;padding:10px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;font:var(--weight-bold) 13px/1 var(--font-body);letter-spacing:-.005em;transition:background .15s,color .15s;" +
            (on ? "background:var(--accent);border:1px solid var(--accent);color:var(--text-on-accent);" : "background:var(--accent-soft);border:1px solid var(--border-card);color:var(--text-body);"),
        };
      }),
      tripMode: s.tripMode, setTripMode: (id) => this.setState({ tripMode: id, tripAvoid: null, tripAvoidStations: null, tripRoute: 0, tripCollapsed: true }),
      routeAssistantLabel: s.aiRoute?.pending
        ? "Gemini is comparing weather, preferences and route events…"
        : s.aiRoute?.decision
          ? `AI-assisted recommendation · ${s.aiRoute.model || "Gemini"}`
          : s.aiRoute?.configured === false
            ? "Smart local ranking active · add GEMINI_API_KEY for Gemini assistance"
            : s.aiRoute?.error
              ? "Gemini unavailable · using smart local ranking"
              : "",
      scenarioAdvice: (() => {
        const scenario = (s.routingPreferences || {}).scenario;
        if (!scenario || !recommendedTrip) return "";
        const alerts = this.disruptingAlerts(recommendedTrip);
        if (scenario === "fixed") {
          const alternative = s.reroute && s.reroute.option;
          const delayMins = alternative ? Math.max(0, alternative.mins - recommendedTrip.mins) : 0;
          if (alerts.length && shouldInterrupt("fixed", { delayMins })) {
            return `Act now · take ${(alternative.legs || []).join(" · ")}; ${alerts[0].line} puts the 08:45 arrival at risk by about ${delayMins} min.`;
          }
          return alerts.length
            ? `${alerts[0].line} issue mapped · no 15-minute impact is confirmed, so Rachel is not interrupted yet.`
            : `No action needed · ${(recommendedTrip.legs || []).join(" · ") || "the current route"} still protects the 08:45 arrival.`;
        }
        if (scenario === "flexible") {
          return recommendedTrip.crowdLevel === "busy"
            ? "Crowding is high · compare a later departure or cycling before committing."
            : "Go-to route · the best available balance of comfort, changes and journey time.";
        }
        const works = this.worksOnRoute(recommendedTrip);
        return works.length
          ? `${worksLabel(works[0])} · review the mapped issue before starting this step-free journey.`
          : "Go-to route · step-free access and the shortest manageable walk come first.";
      })(),
      tripModeBlurb: {
        bus: "Bus-first journeys, including the walk to and from each stop.",
        train: "Rail-first journeys, including every transfer and walking connection.",
        transit: "The best combined bus, rail and walking journey available.",
        walk: "A door-to-door walking route from OneMap.",
        cycle: "A door-to-door route on OneMap's cycling network.",
        express: "The quickest public-transport option, ranked by total journey time.",
      }[s.tripMode],
      tripOptions,
      // Demo mode may serve recorded answers when a live call fails. Whenever
      // it does, the screen says so — recorded data is never shown as live.
      recordedNotice: (() => {
        const sources = [
          trips.recorded ? "routes" : null,
          s.crowd && s.crowd.recorded ? "crowding" : null,
          s.outlook && s.outlook.forecast && s.outlook.forecast.recorded ? "forecast" : null,
        ].filter(Boolean);
        return trips.recorded ? "Sample route only — it does not match your selected places. Live routing is unavailable." : sources.length ? `Recorded ${sources.join(" and ")} — the live service didn't answer` : "";
      })(),
      tripsPending: !!trips.pending,
      tripsError: trips.error || null,
      tripRecovery: trips.error ? {
        ...routeFailure(trips.error, s.tripMode),
        modes: routeRecoveryModes(s.tripMode).map((mode) => ({
          ...mode,
          pick: () => this.setState({
            tripMode: mode.id,
            tripAvoid: null,
            tripAvoidStations: null,
            tripRoute: 0,
            tripCollapsed: true,
            trips: { key: null, options: [], pending: false, error: null },
          }),
        })),
      } : null,
      // Only after a request has actually resolved — the initial state is not "empty".
      tripsEmpty: !!trips.key && !trips.pending && !trips.error && tripOptions.length === 0,
      // Nothing left after avoiding a disrupted line is a different answer from
      // no route existing, and the sheet has to say which.
      tripsEmptyNote: trips.avoided && trips.avoided.none
        ? `Every route OneMap offers still goes via ${(trips.avoided.all || trips.avoided.lines || []).join(" and ")}. Nothing here avoids it.`
        : "No public transport route found for this trip.",
      tripsAvoiding: trips.avoided && !trips.avoided.none ? `Avoiding ${(trips.avoided.all || trips.avoided.lines || []).join(" and ")}` : "",
      retryTrips: () => { this.setState({ trips: { key: null, options: [], pending: false, error: null } }, this.loadTripOptions); },
      isNav: sc === "nav",
      endTrip: () => { this.setState({ screen: "map", navTrip: null, navProgress: null, navFixStatus: null }); this.flash("Trip ended"); },
      goReport: () => this.setState({ navRepOpen: true, nrType: null, nrSev: null }),
      ...nav,
      // Read by the app shell. The step-free persona asks for large text, and
      // the scale is one token rather than a list of overridden sizes.
      largeText: personaOf((s.routingPreferences || {}).persona).largeText,
      headerTitle: { map: "Map", report: "Report", rewards: "Points", plan: "Today", account: "Your data" }[sc] || "Solvik",
      headerSub: {
        map: "OneMap · Singapore Land Authority",
        report: s.stop.data ? `${s.stop.data.name} · reports stay live 30 min` : "Reports stay live 30 min",
        rewards: "Sample rewards data",
        plan: (() => {
          const n = (s.savedList || []).length;
          const today = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
          return `${today} · ${n} watched commute${n === 1 ? "" : "s"}`;
        })(),
        account: "Private storage on this browser",
      }[sc] || "",
      toast: s.toast,
      tabItems: tabDefs, tab: sc, setTab: (id) => this.go(id),
      tabPill: {
        position: "absolute", top: 7, bottom: 7, left: 7, width: "calc((100% - 14px) / 4)",
        transform: "translateX(" + Math.max(0, tabDefs.findIndex((t) => t.id === sc)) * 100 + "%)",
        background: "var(--accent-soft)", borderRadius: "var(--radius-pill)", transition: "transform var(--dur-base) var(--ease-out)",
      },
      navTabs: tabDefs.map((t) => {
        const on = t.id === sc, hov = s.hoverTab === t.id, pressed = s.pressTab === t.id;
        return {
          ...t, go: () => this.go(t.id),
          enter: () => this.setState({ hoverTab: t.id }),
          leave: () => this.setState({ hoverTab: null, pressTab: null }),
          down: () => this.setState({ pressTab: t.id }),
          up: () => this.setState({ pressTab: null }),
          icon: { map: "map", plan: "calendar-days", report: "megaphone", rewards: "award" }[t.id],
          dot: t.id === "map" || (t.id === "rewards" && availablePoints > 2000),
          dotStyle: { position: "absolute", top: -2, right: -4, width: 7, height: 7, borderRadius: 999, background: t.id === "map" ? "var(--crowd-busy)" : "var(--accent)", border: "1.5px solid var(--surface-card)", animation: t.id === "map" ? "sv-ping 1.8s var(--ease-standard) infinite" : "none" },
          style: {
            position: "relative", zIndex: 1, height: 54, border: "none", background: "transparent",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
            color: on ? "var(--green-900)" : hov ? "var(--text-strong)" : "var(--text-muted)", cursor: "pointer",
            transform: pressed ? "scale(.92)" : hov && !on ? "translateY(-2px)" : "none",
            transition: "color var(--dur-base) var(--ease-standard),transform var(--dur-fast) var(--ease-out)",
            WebkitTapHighlightColor: "transparent",
          },
          iconStyle: { position: "relative", display: "inline-flex", transform: on ? "translateY(-1px) scale(1.12)" : "none", transition: "transform var(--dur-base) var(--ease-out)" },
          labelStyle: { font: (on ? "var(--weight-bold)" : "var(--weight-regular)") + " 11px/1 var(--font-body)", letterSpacing: ".01em", opacity: on || hov ? 1 : 0.82, transition: "opacity var(--dur-base) var(--ease-standard)" },
        };
      }),
      goAccount: () => this.go("account"),
      goRewards: () => this.go("rewards"),
      ...this.forecastVals(s),
      reportPick: s.rep === "pick", reportConfirm: s.rep === "confirm", reportDone: s.rep === "done",
      reportTypes: rTypes, chosenLabel: chosen.label, chosenPts: chosen.pts, severities, severityQ: sevSet.q,
      navSheetStyle: {
        position: "absolute", left: 0, right: 0, bottom: 0, height: s.navSheetH == null ? 260 : s.navSheetH, maxHeight: "calc(100% - 70px)",
        background: "var(--surface-card)", borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0", boxShadow: "var(--shadow-sheet)",
        padding: "10px 16px 16px", display: "flex", flexDirection: "column", gap: 11, boxSizing: "border-box", overflow: "hidden",
        transition: s.navDragging ? "none" : "height 260ms cubic-bezier(.2,.7,.3,1)",
      },
      navGrabStyle: { flex: "none", padding: "6px 0 4px", cursor: s.navDragging ? "grabbing" : "grab", touchAction: "none", userSelect: "none" },
      navDotsWrapStyle: { flex: "none", display: s.navSheetH != null && s.navSheetH < 240 ? "none" : "flex", justifyContent: "center", alignItems: "center", gap: 6 },
      navSheetDrag: this.startNavDrag,
      navSheetCycle: this.cycleNavSheet,
      navRepOpen: !!s.navRepOpen,
      navRepPick: !!s.navRepOpen && !s.nrType,
      navRepForm: !!s.navRepOpen && !!s.nrType,
      closeNavRep: () => this.setState({ navRepOpen: false, nrType: null, nrSev: null, navPhoto: null, navCameraOpen: false }),
      navRepBack: () => this.setState({ nrType: null, nrSev: null, navPhoto: null, navCameraOpen: false }),
      navRepTypes: rTypes.map((t) => ({
        label: t.label, sub: t.sub, pts: t.pts, icon: t.icon,
        pick: () => this.setState({ nrType: t.id, nrSev: null }),
        style: "display:flex;flex-direction:column;gap:6px;text-align:left;padding:12px 13px;border-radius:18px;cursor:pointer;background:var(--surface-card);border:1px solid var(--border-card);font:var(--font-body)",
      })),
      navRepTitle: s.nrType ? (rTypes.find((t) => t.id === s.nrType) || {}).label : "What is happening here",
      navRepSevQ: (SEV[s.nrType] || SEV.crowd).q,
      navRepSevs: (SEV[s.nrType] || SEV.crowd).opts.map((label, i) => ({
        label, pick: () => this.setState({ nrSev: i }),
        style: "width:100%;text-align:left;padding:12px 14px;border-radius:999px;cursor:pointer;font:var(--weight-bold) 13px/1.3 var(--font-body);" +
          (s.nrSev === i ? "background:var(--accent);border:1px solid var(--accent);color:var(--text-on-accent);" : "background:var(--accent-soft);border:1px solid var(--border-card);color:var(--text-body);"),
      })),
      navRepNoPhoto: !s.navPhoto, navRepHasPhoto: !!s.navPhoto,
      navRepPhotoName: "Taken just now · checked, then discarded",
      navRepThumb: s.navPhoto ? <img src={s.navPhoto.dataUrl} alt="Report photo" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null,
      // The same camera and the same triage as the Report tab — one path, one
      // set of checks. The station is left for the server to resolve, because
      // mid-journey all the app knows is where you are.
      navCameraOpen: !!s.navCameraOpen,
      openNavCamera: () => this.setState({ navCameraOpen: true }),
      closeNavCamera: () => this.setState({ navCameraOpen: false }),
      onNavCapture: (photo) => this.setState({ navPhoto: photo, navCameraOpen: false }),
      navRepCta: s.reportBusy ? "Checking…" : !s.navPhoto ? "Take a photo to save" : "Save locally · " + (rTypes.find((t) => t.id === s.nrType) || { pts: 0 }).pts + " points",
      navRepPost: () => this.submitNavReport(),
      locEyebrow: s.stop.data ? "Live at your stop" : s.stop.requested ? (s.stop.error ? "No stop found" : "Finding your stop") : "Location is off",
      locStopName: s.stop.data ? s.stop.data.name : s.stop.error ? "Location unavailable" : s.stop.pending ? "Locating…" : "Use your location",
      locDetail: s.stop.data
        ? `Stop ${s.stop.data.code} · ${Math.round(s.stop.data.distanceM)} m away · reports stay live 30 min`
        : s.stop.error || (s.stop.requested ? "Using your location to pick the stop you can report on." : "Solvik will ask for a one-time location fix to find the nearest stop."),
      locRecheckLabel: s.stop.pending ? "Locating" : s.stop.requested ? "Recheck" : "Use location",
      locRecheck: () => this.findNearestStop(),
      reportStopReady: !!s.stop.data,
      // Camera-only: getUserMedia, never a file input. An old or borrowed image
      // cannot enter the flow because there is no file to choose.
      cameraOpen: !!s.cameraOpen,
      openCamera: () => this.setState({ cameraOpen: true }),
      closeCamera: () => this.setState({ cameraOpen: false }),
      onCapture: (photo) => {
        this.setState({ photo, cameraOpen: false });
        this.flash("Photo taken");
      },
      hasPhoto: !!s.photo, noPhoto: !s.photo,
      photoName: s.photo ? "Taken just now · checked, then discarded" : "",
      photoThumb: s.photo ? <img src={s.photo.dataUrl} alt="Report photo" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null,
      reportBusy: !!s.reportBusy,
      reportCta: s.reportBusy ? "Checking location and photo…" : s.photo ? "Save report · " + chosen.pts + " points" : "Take a photo to save",
      clearPhoto: () => this.setState({ photo: null }),
      backToPick: () => this.setState({ rep: "pick", repType: null, sev: null, photo: null, reportResult: null, cameraOpen: false }),
      submitReport: this.submitReportNow,

      // What came back from triage. A rejection says which check failed — a
      // silent one is how you lose the contributor you wanted.
      reportVerdict: (s.reportResult && s.reportResult.verdict) || null,
      reportAccepted: !!(s.reportResult && s.reportResult.verdict === "accepted"),
      reportReason: (s.reportResult && s.reportResult.reason) || "",
      reportPhotoNote: (s.reportResult && s.reportResult.vision && s.reportResult.vision.reason) || (s.reportResult && s.reportResult.visionNote) || "",
      reportChecks: ((s.reportResult && s.reportResult.checks) || []).map((c) => ({
        id: c.id,
        ok: c.ok,
        label: { "fresh-fix": "Location is current", "precise-fix": "Position is precise enough", "at-the-place": "You are at the place", "fresh-photo": "Photo taken just now", "not-flooding": "Within your hourly limit" }[c.id] || c.id,
        detail: c.ok ? "" : c.detail,
      })),
      reportPointsLine: s.reportResult && s.reportResult.verdict === "accepted"
        ? `${s.reportResult.points} points saved on this device with the report.`
        : "No points — this report wasn't saved.",

      // Real reports, grouped, with the evidence that justifies each tier.
      // Nothing here is sample data any more.
      recentReports: reportGroups.map((group) => ({
        key: group.key,
        text: `${group.label} · ${group.stationName}`,
        tier: group.confidence.label,
        line: group.confidence.line,
        ago: this.relTimeOf(group.lastAt),
        official: group.confidence.official,
        dotStyle: { flex: "none", width: 10, height: 10, borderRadius: 999, background: group.confidence.official ? CROWD.busy : CROWD.moderate, boxShadow: "0 0 0 4px color-mix(in oklch, " + (group.confidence.official ? CROWD.busy : CROWD.moderate) + " 18%, transparent)" },
        tierStyle: "font:var(--weight-bold) 10px/1 var(--font-body);letter-spacing:.06em;text-transform:uppercase;padding:5px 9px;border-radius:999px;white-space:nowrap;color:" +
          (group.confidence.official ? "#fff" : "var(--text-muted)") + ";background:" + (group.confidence.official ? "var(--crowd-busy)" : "var(--sand-200)"),
      })),
      reportsPending: !!reportsState.pending,
      reportsError: reportsState.error || null,
      reportsEmpty: !reportsState.pending && !reportsState.error && reportGroups.length === 0,
      reportsNote: reportsState.error
        ? reportsState.error
        // "No reports" is a fact worth stating; inventing three to fill the
        // space is what this list used to do.
        : "Reports saved by this browser remain visible here for 30 minutes.",

      points: availablePoints.toLocaleString(), vouchers,
      pendingPoints: pendingPoints.toLocaleString(),
      hasPending: pendingPoints > 0,
      pendingLine: pendingPoints > 0
        ? `${pendingPoints.toLocaleString()} points waiting on someone else to report the same thing, or on LTA confirming it.`
        : "",
      // Derived from points that are now real, rather than a fixed label.
      tierName: confirmedPoints >= 3100 ? "Gold tier" : confirmedPoints >= 1000 ? "Silver tier" : "Bronze tier",
      toGold: Math.max(0, 3100 - confirmedPoints).toLocaleString(),
      tierBarStyle: { width: Math.round(Math.max(0, Math.min(1, (confirmedPoints - 1000) / 2100)) * 100) + "%", height: "100%", background: "var(--crowd-light)", borderRadius: 999, transition: "width var(--dur-slow) var(--ease-out)" },
      pointStats: [
        { icon: "megaphone", value: String(mine.length), label: "Reports saved" },
        { icon: "badge-check", value: String(mine.filter((r) => r.state === "confirmed").length), label: "Checks passed" },
        { icon: "hard-drive", value: String(mine.length), label: "Stored locally" },
      ],
      ...this.addCommuteVals(s),
    };
  }
}
