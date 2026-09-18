// Recorded upstream answers, used only when DEMO_MODE is on and a live call
// fails. They are real captured responses, not invented ones — pt-route.json
// is the same recording the parser tests run against — and anything served
// from here is flagged `recorded: true` so the UI can say so on screen.
//
// This exists for one situation: a stage, a five-minute slot, and a venue
// network nobody can control. It is off unless explicitly switched on.
import route from "./pt-route.json" with { type: "json" };

export const recordedRoute = route;

export const recordedSearch = [
  { name: "RAFFLES PLACE MRT STATION", address: "5 RAFFLES PLACE", postal: "048618", lat: 1.28406, lng: 103.85152 },
  { name: "BISHAN MRT STATION", address: "200 BISHAN ROAD", postal: "579827", lat: 1.35131, lng: 103.84852 },
  { name: "BISHAN PARK", address: "ANG MO KIO AVENUE 1", postal: "569933", lat: 1.36262, lng: 103.84806 },
  { name: "YISHUN MRT STATION", address: "101 YISHUN CENTRAL", postal: "768794", lat: 1.42945, lng: 103.83513 },
  { name: "JURONG EAST MRT STATION", address: "10 JURONG GATEWAY ROAD", postal: "608553", lat: 1.33315, lng: 103.74228 },
];

// Crowd levels carry their own coordinates here: resolving codes to positions
// needs OneMap, which is exactly what may be unavailable.
export const recordedStations = [
  { code: "NS13", name: "Yishun", lat: 1.42945, lng: 103.83513, level: "moderate" },
  { code: "NS17", name: "Bishan", lat: 1.35131, lng: 103.84852, level: "busy" },
  { code: "NS21", name: "Newton", lat: 1.31305, lng: 103.83805, level: "moderate" },
  { code: "NS26", name: "Raffles Place", lat: 1.28406, lng: 103.85152, level: "busy" },
  { code: "EW24", name: "Jurong East", lat: 1.33315, lng: 103.74228, level: "busy" },
  { code: "CC9", name: "Paya Lebar", lat: 1.31771, lng: 103.89245, level: "light" },
];

// Where each station's two peaks fall, and how heavy each one gets. A Singapore
// weekday has a morning peak and an evening one, and which is worse depends on
// the station: Yishun empties in the morning and fills at night, Raffles Place
// does the opposite.
const PEAKS = {
  NS13: { am: 8.0, pm: 18.5, amTop: "busy", pmTop: "moderate" },
  NS17: { am: 8.5, pm: 18.5, amTop: "busy", pmTop: "busy" },
  NS21: { am: 8.5, pm: 18.0, amTop: "busy", pmTop: "moderate" },
  NS26: { am: 8.5, pm: 18.0, amTop: "busy", pmTop: "busy" },
  EW24: { am: 8.0, pm: 18.5, amTop: "busy", pmTop: "busy" },
  CC9: { am: 8.5, pm: 18.5, amTop: "moderate", pmTop: "moderate" },
};

const SHOULDER = { busy: "moderate", moderate: "light", light: "light" };

// At the peak itself, its level; within an hour and a half of it, one step down;
// otherwise light.
function levelAt(hour, { am, pm, amTop, pmTop }) {
  const near = (peak, top) => {
    const away = Math.abs(hour - peak);
    if (away <= 0.5) return top;
    if (away <= 1.5) return SHOULDER[top];
    return null;
  };
  return near(am, amTop) || near(pm, pmTop) || "light";
}

// The published grid is 30 minutes across the whole service day, and this
// mirrors that: 05:30 to 23:30. It used to stop at 10:00, which meant a demo
// run any later than mid-morning had no forecast covering the trip and the
// crowd warning — the headline feature — simply did not appear.
const FIRST_SLOT_HOUR = 5.5;
const SLOT_COUNT = 37;

// Anchored to the day it is asked for, so a recorded forecast still lines up
// with the clock the demo is running on.
export function recordedForecast(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${day}T05:30:00+08:00`);
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) =>
    new Date(start.getTime() + i * 30 * 60000).toISOString(),
  );
  const series = {};
  Object.entries(PEAKS).forEach(([code, peak]) => {
    series[code] = Object.fromEntries(
      slots.map((iso, i) => [iso, levelAt(FIRST_SLOT_HOUR + i * 0.5, peak)]),
    );
  });
  return { slots, series };
}

export function recordedArrivals(now = Date.now()) {
  const at = (mins) => new Date(now + mins * 60000).toISOString();
  return {
    Services: [
      {
        ServiceNo: "410",
        NextBus: { EstimatedArrival: at(3), Load: "SEA", Feature: "WAB", Monitored: 1 },
        NextBus2: { EstimatedArrival: at(11), Load: "SDA", Feature: "WAB", Monitored: 1 },
        NextBus3: { EstimatedArrival: at(19), Load: "LSD", Feature: "WAB", Monitored: 0 },
      },
    ],
  };
}

// The disruption the demo turns on, with the mitigation LTA publishes alongside
// it. FreePublicBus / FreeMRTShuttle / MRTShuttleDirection are the fields the
// brief singles out — "the mitigation is in the feed, you do not have to infer
// which buses might help" — so a recording without them would leave the
// decision-support line untestable, which is the one thing this fixture is for.
export const recordedAlerts = {
  Status: 2,
  AffectedSegments: [
    {
      Line: "NSL",
      Direction: "Both",
      StartStation: "NS13",
      EndStation: "NS17",
      Stations: "NS13,NS14,NS15,NS16,NS17",
      FreePublicBus: "NS13,NS14,NS15,NS16,NS17",
      FreeMRTShuttle: "NS13,NS14,NS15,NS16,NS17",
      MRTShuttleDirection: "Both",
    },
  ],
  Message: [
    { Content: "NSL - Train fault between Yishun and Bishan. Add 10 minutes of travel time.", CreatedDate: "Recorded" },
  ],
};

// Lift maintenance, in the shape v2/FacilitiesMaintenance returns. NS17 is
// Bishan, which the recorded itinerary passes through — so the demo shows a
// planned work landing on a route rather than floating unattached.
export const recordedFacilities = {
  value: [
    { Line: "NSL", StationCode: "NS17", StationName: "Bishan", LiftID: "B1L01", LiftDesc: "Exit B street level to concourse" },
    { Line: "NSL", StationCode: "NS17", StationName: "Bishan", LiftID: "B2L03", LiftDesc: "Concourse to platform B" },
    { Line: "CCL", StationCode: "CC9", StationName: "Paya Lebar", LiftID: "A1L01", LiftDesc: "Exit A street level to concourse" },
  ],
};

// Weather, in the shape data.gov.sg publishes. Rain over the north so it lands
// on the recorded Yishun commute rather than floating unattached.
export const recordedNowcast = {
  data: {
    area_metadata: [
      { name: "Yishun", label_location: { latitude: 1.4304, longitude: 103.8354 } },
      { name: "Bishan", label_location: { latitude: 1.3509, longitude: 103.8485 } },
      { name: "City", label_location: { latitude: 1.2925, longitude: 103.8547 } },
    ],
    items: [
      {
        valid_period: { end: new Date(Date.now() + 2 * 3600_000).toISOString() },
        forecasts: [
          { area: "Yishun", forecast: "Moderate Rain" },
          { area: "Bishan", forecast: "Light Rain" },
          { area: "City", forecast: "Partly Cloudy (Day)" },
        ],
      },
    ],
  },
};

// Periods are generated around the current time so the demo always has one that
// covers "now" — the shape is the published one, the clock is ours.
export function recordedOutlook(now = Date.now()) {
  const start = new Date(Math.floor(now / 3600_000) * 3600_000);
  const periods = [0, 1, 2, 3].map((i) => {
    const from = new Date(start.getTime() + i * 6 * 3600_000);
    const to = new Date(from.getTime() + 6 * 3600_000);
    const wet = i === 0;
    const text = wet ? "Moderate Rain" : "Partly Cloudy (Day)";
    return {
      timePeriod: {
        start: from.toISOString(),
        end: to.toISOString(),
        text: `${from.getHours()}.00 to ${to.getHours()}.00`,
      },
      regions: {
        west: { text }, east: { text }, central: { text },
        south: { text }, north: { text: wet ? "Heavy Thundery Showers" : text },
      },
    };
  });
  return { data: { records: [{ general: { forecast: { text: "Thundery Showers" } }, periods }] } };
}

// Road works on Bishan Road, which the recorded commute's bus legs run along,
// and a bus route change published ahead of its date.
export const recordedRoadWorks = {
  value: [
    { EventID: "RW-REC-1", RoadName: "BISHAN ROAD", Other: "Resurfacing works, one lane closed", StartDate: new Date(Date.now() - 3 * 86400000).toISOString(), EndDate: new Date(Date.now() + 14 * 86400000).toISOString(), SvcDept: "LTA" },
  ],
};

export const recordedBusRouteChanges = {
  value: [
    { ServiceNo: "410", EffectiveDate: new Date(Date.now() + 10 * 86400000).toISOString(), Operator: "SBST" },
    { ServiceNo: "410", EffectiveDate: new Date(Date.now() + 10 * 86400000).toISOString(), Operator: "SBST" },
  ],
};

// Congestion on the road the recorded bus legs use, with the incident behind it.
export const recordedSpeedBands = {
  value: [
    { RoadName: "BISHAN ROAD", SpeedBand: 2, MinimumSpeed: 10, MaximumSpeed: 19 },
    { RoadName: "THOMSON ROAD", SpeedBand: 4, MinimumSpeed: 30, MaximumSpeed: 39 },
  ],
};

export const recordedIncidents = {
  value: [
    { Type: "Vehicle breakdown", Message: "Vehicle breakdown on Bishan Rd towards Thomson Rd.", Latitude: 1.3507, Longitude: 103.8481 },
  ],
};

export const recordedBusStops = [
  { BusStopCode: "53061", RoadName: "Bishan Rd", Description: "Bishan Stn Exit C", Latitude: 1.35072, Longitude: 103.84853 },
  { BusStopCode: "53069", RoadName: "Bishan Rd", Description: "Blk 511", Latitude: 1.35548, Longitude: 103.84796 },
];
