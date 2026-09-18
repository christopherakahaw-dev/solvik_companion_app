# Solvik

Solvik is a Singapore transit companion: a live OneMap-based map with
live station crowding, multi-mode trip planning (Fastest / Cheapest / Less
crowded / Step-free / Fewest changes / Least walking / Cycling),
turn-by-turn navigation, fault reporting and a points wallet. This is the
mobile build, implemented from the `Onward.dc.html` Claude Design handoff
(Solvik design system).

## Stack

- **React + Vite** — single-page app, no server-rendering.
- **Leaflet + OpenStreetMap** — the map surface (`src/components/OneMapCanvas.jsx`). OSM is served through MapTiler (`VITE_MAPTILER_KEY`), because the OSM tile policy forbids applications from using `tile.openstreetmap.org`; OneMap's own tiles are the fallback. The ordering and the fallback rule are in `src/lib/mapBase.js` so they can be tested without a browser; MapTiler is only ever in the list when a key exists, because a keyless request to it is a guaranteed 403 and Leaflet asks for a tile per screenful. `VITE_MAPTILER_KEY` is compiled into the bundle at build time, so setting it on a host takes effect on the next deploy, not immediately.
- **`lucide`** for icons, matching the design system's icon set.
- **Browser storage** — onboarding, places, preferences, watched commutes,
  learned journeys and checked reports remain on the current device. There is
no account or cloud-sync dependency.
- **Scenario-first setup** — Rachel, Arjun and Mdm Lim each seed a concrete
  local journey and preference profile. Rachel's Tampines → Raffles Place trip
  is the primary end-to-end demonstration.
- **`api/`** — the server side (Vercel Node runtime), which proxies OneMap and LTA DataMall so their credentials never reach the browser and does the joining work (journey ranking, crowd density to station coordinates) there rather than in the client. `api/[...path].js` is a catch-all that dispatches on the first path segment to one handler per endpoint in `api/_handlers/`, with shared code in `api/_lib/`; both underscore directories are outside Vercel's function scan, so the fifteen endpoints deploy as one function and stay under the free tier's twelve-function cap. `npm run dev` loads the same dispatcher (see `vite.config.js`), so the app is fully functional without deploying anywhere.

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL. Without keys the UI loads but transit data will
show as unavailable — see below.

## Wiring up real data

Copy `.env.example` to `.env` and fill in:

- **OneMap** — place search works with no credentials. Public-transport
  routing needs an authenticated token: register a free account at
  <https://www.onemap.gov.sg/apidocs/register> and set `ONEMAP_EMAIL` +
  `ONEMAP_PASSWORD` (the server exchanges these for a token automatically and
  caches it), or set `ONEMAP_TOKEN` directly if you already have one.
- **LTA DataMall** — request a free `AccountKey` at
  <https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html> and
  set `LTA_ACCOUNT_KEY`. This powers station crowding, bus loading, service
  alerts and the nearest-stop lookup.

The locate button uses the browser's own geolocation, which needs no keys but
does require a secure context — it works on `localhost` and on the deployed
HTTPS URL, but not over a plain-HTTP LAN address.

The map's **From / To** planner can route between any two OneMap places. The
starting point can be searched directly, selected from a verified Home, Work or
School shortcut, or set to the device location with an explicit tap. A searched
starting point is kept only for the current session; it is not added to saved
places automatically.

### How position tracking behaves

Solvik does not request location during onboarding, when the map first opens, or
when the user searches for a destination. The map asks for a one-off fix only
when the user taps **My location** or its locate button, and the Report tab asks
only when the user chooses to find their nearest stop. Continuous tracking
starts only after the user begins turn-by-turn navigation. While a trip is under
way, progress along the route drives the countdown and the current step — and
only fixes worth believing move it:

- a fix vaguer than ~150 m is ignored;
- a fix more than ~250 m from the route line counts as off-route, and progress
  holds where it was instead of guessing;
- after the first one, a fix is only matched within reach of the last known
  progress, at up to 35 m/s, so a route that doubles back can't jump the reading;
- progress never runs backwards, so GPS wander can't rewind the ETA;
- distance is converted to time per leg, so half the metres of a trip isn't read
  as half its minutes when one leg walks and the next takes a train.

Until a fix has placed you on the route, the timetable drives the screen and
says so. Once your position leads, the clock never silently takes over again:
losing GPS holds the last reading and shows that instead.

Restart `npm run dev` after editing `.env`. **The OneMap and LTA keys are what
make the app useful**: without them, search, journey planning, crowding and
alerts all report that they're unavailable rather than showing stand-in data.
`.env.example` lists every variable, split into required and optional.

### What's live vs. sample

Everything that LTA DataMall or OneMap can supply is fetched live. When a key
is missing or a call fails, the app says so — it never quietly substitutes
invented data.

| Feature | Source |
| --- | --- |
| Place search (map, add-commute, places sheet) | OneMap search |
| Journey options: duration, arrival, fare, legs, transfers, walking | OneMap public-transport routing |
| Route line on the map | The chosen itinerary's own geometry |
| Turn-by-turn steps and stop sequences | The same itinerary's legs and intermediate stops |
| Step-by-step breakdown on a route card | The itinerary's own legs: walk distance and time, stop counts, boarding and alighting stops |
| Today tab: leave-by time, crowd outlook, alternatives | Your watched commute, planned by OneMap, joined to LTA's published crowd forecast for the stations it passes |
| Next bus times per bus leg | LTA bus arrivals, re-asked every 30 s while the route sheet is open |
| Crowding circles per MRT station + time scrubber | LTA platform crowd density, real-time and same-day forecast |
| "Less crowded" ranking | LTA crowd density (rail) and bus loading |
| Service alerts | LTA train service alerts |
| Nearest stop for reports | LTA bus stops, via `/api/nearest-stop` |
| Your position | Browser geolocation, only after an explicit location action or during navigation |
| Trip origin | A searched OneMap place, a verified saved place, or an already-authorised device position |
| Your places, watched commutes, recent destinations and read alerts | Your own input, saved in the browser |
| Nearby reports and their corroboration counts | Reports filed through the app by signed-in commuters, checked before they count |
| Your points | Reports you filed that a second commuter or LTA corroborated |
| **Vouchers** | **Sample data** — nothing issues a real EZ-Link top-up. Labelled as such in the UI. |

### The Today tab (leave-by and the crowd outlook)

A watched commute is planned as a real journey, and each rail station on the way
is looked up in LTA's **same-day** crowd forecast at the interval you would
actually be there — so "Busy at Bishan from 08:30" is a join, not a prediction.
Nothing here is modelled or estimated:

- the forecast is published in **30-minute intervals**, and the app never phrases
  a warning more precisely than that;
- a station LTA doesn't publish is reported as uncovered ("forecast for 2 of 4
  stations on the way"), never as quiet;
- a trip outside the published day says the forecast doesn't reach that far yet;
- bus legs aren't counted as gaps: buses have live vehicle loading instead of a
  stop forecast, which is what the route card shows.

Commutes can be anchored to **Leave at** or **Arrive by**; with an arrive-by, the
leave time comes from the journey's own duration plus a small buffer, and the
card says when leaving earlier or later lands you in a quieter interval.
"Alert me" schedules a real browser notification — but only while Solvik is open
in a tab, which is what the app tells you when you set it.

Your saved places are geocoded through OneMap when you type them, because a
commute with no coordinates can't be routed. A place that can't be found says so
in the Your places sheet instead of failing silently.

Trains have no arrival feed — DataMall publishes crowding for rail, not
timings — so a rail leg shows how busy the platform is rather than a countdown.
Where bus times are missing, the card says which kind of missing it is (no key,
unknown stop, nothing running) instead of leaving a gap.

### Reports, and why a photo alone earns nothing

The Report tab used to credit points the moment you tapped post, for any photo,
with no check — which pays for spam. It now runs a report past two stages before
it counts for anything.

**The photo has to be taken here, now.** `<input type="file" capture>` is only a
hint: desktop browsers ignore it and mobile often still offers the gallery.
`src/components/CameraCapture.jsx` uses `getUserMedia` and a canvas instead, so
there is no file input in the flow and no older image to choose. A device with no
camera says it cannot file a report, which is the honest cost of that rule.

**The photo is never stored.** It is posted to `/api/report`, checked, and
dropped — no bucket, no retention window, no archive of other people's faces.
When Gemini is configured, the server sends the image to Google's model for
that one consistency check. What persists in Solvik is the verdict, not the
image.

**Two stages of checking**, in this order because the first is free:

1. Deterministic gates — your fix is under a minute old, accurate to 100 m,
   within 150 m of the place you are reporting, the shutter fired in the last two
   minutes, and you are under three reports this hour. A failed gate names itself
   and says what to do.
2. Gemini, asked whether the photo is **consistent** with what was reported —
   and whether it is a photograph of a screen, which is the cheapest way to fake
   one. Without `GEMINI_API_KEY` this stage is skipped and the report says so.

Nothing here is ever called **verified**. A model can say an image is consistent
with a report; it cannot tell a broken lift from a working one with a sign taped
to it. That distinction is the whole reason the wording is what it is.

**Reports are local.** The server checks location freshness, accuracy, distance,
capture time and optionally whether the photo is consistent with the selected
issue. The result is returned to the browser, the photo is discarded, and only
the small report record is stored locally. It remains visible for 30 minutes and
does not become a community feed.

### What Solvik learns, and how to stop it

Start a route a few times and the commute appears on the Today tab on its own,
with the evidence that justified it and an **Undo**. The deterministic memory
rules remain in charge: journeys whose two ends are both within ~400 m group
together, and a group becomes a commute only when it passes every one of these —

- 4 or more journeys, at least 3 of them actually finished (tapping Go is not
  travelling);
- on 2 or more distinct dates of the same kind of day (weekday and weekend
  versions of a route stay separate);
- departure times within a 45-minute spread, measured so one late night out
  can't disqualify a routine;
- seen in the last 21 days.

With `GEMINI_API_KEY` configured, the server also asks Gemini for a compact
summary of repeated mode and completion choices. Solvik stores that returned
insight in the browser and supplies it when Gemini compares real OneMap route
options. Gemini can reorder those supplied options using the selected persona,
weather, crowding, lift or rail breakdowns and road incidents; it cannot invent
a route. If the model or quota is unavailable, the tested local rules continue
to rank the same options.

It un-learns too. A learned commute is retired once 35 days pass with none of
its trips being made — long enough that a holiday doesn't erase your commute,
well inside the 90 days the journeys themselves survive, so the evidence is
still there to judge it by. An inference should be no more durable than what
supports it: otherwise a job you left keeps its card on Today and keeps matching
disruption alerts to lines you no longer ride. The retirement is announced the
same way the promotion was, because a commute vanishing without a word is the
thing the evidence line exists to prevent. Commutes you created or edited
yourself are yours, and are never retired.

Patterns are matched by where they go, not by the string that names them. The
signature is anchored to the earliest trip in a group, so when that trip ages
out the string moves while the commute stays the same — comparing strings would
let a pattern you rejected come back, and a commute you already watch be added a
second time.

Only deliberate actions are recorded — a route you started, a destination you
chose — never a background trace of where the device has been. Everything stays
in the browser: no endpoint in `api/` receives any of it. Trips older than 90
days fall away on their own, **Undo** makes a pattern stay gone however many
more times it is seen, and **Forget everything** in the Today tab clears the
journeys, the patterns and the commutes learned from them in one tap.

What device-local does *not* mean: `localStorage` is plaintext, readable by
anything running on the same origin, and on a shared phone readable by whoever
picks it up. Nothing is transmitted — that is the claim, and it is the whole
claim.

It also learns **places**, on a much lower bar: somewhere you went twice, on two
different days, within the last three weeks. That is a far weaker claim than a
commute, and all it is used for is deciding whether a disruption is worth
mentioning — so protection starts after two trips instead of waiting for a
commute to be promoted. Each place carries the lines you used to reach it, which
is what lets an alert say *"You use this line to get to the Office"* rather than
only naming a line code. Places are derived from the journeys on demand, never
stored separately, so forgetting the journeys forgets them too.

### Planned works

Faults are only half of what disrupts a journey. `/api/planned` reads LTA's
`v2/FacilitiesMaintenance` — which, despite the name, is narrower than it
sounds: **adhoc lift maintenance**, one row per lift, carrying the line, the
station and a description of which lift is out. There is no public structured
feed for station closures, early closures or engineering works; those are
announced in prose. `src/lib/planned.js` is written as a source list so a real
closures feed slots in beside this one without the client changing.

So the feature is built around the event the data actually supports, and it is a
sharper one than it first appears:

- A lift is only raised when it is out at a station **you board, alight or
  change at**. A station the train merely runs through is not one you are in,
  and warning about it would be noise.
- If your commute is set to **Step-free**, the same fact is a blocked journey
  rather than an inconvenience, and the card says so in those words. This is the
  most literal form of "tailored to the commuter": the identical feed row is a
  footnote for one person and a blocker for another, and the app knows which.
- **Route around Bishan** avoids the *station*, not the line — a lift being out
  is no reason to write off every train on the NSL.
- It does not claim to know how long the lift will be out, because LTA publishes
  which lift, not for how long.

### When a line breaks

An alert that names a line you ride is turned into an alternative route rather
than left as bad news. OneMap has no banned-routes parameter, so Solvik asks for
six itineraries across transit and bus — bus-only being the answer when rail is
out — and drops every one still using the broken line.

Three things it will not do, because this is where a transit app would be
tempted to guess:

- The alternative's time is **OneMap's timetable**, which does not know a
  disruption is happening. The card says so, and warns the route will be busier
  than the number suggests. It is never presented as a live adjusted time.
- When every route still uses the broken line, it says *that* — which is a
  different claim from "no route found", and better than showing a route
  through the fault.
- LTA's own message often names the bridging buses. That text is shown
  verbatim, because it is better information than anything we could derive.

The Today card reroutes itself when the commute it is already showing is hit;
the Alerts sheet offers it on a tap, and only for lines you actually use.

Disruptions are matched against the lines those journeys actually used, so an
alert on a line you never take stays in the Alerts sheet instead of interrupting
you. On the first run the current alerts are noted as a baseline rather than
announced, and reopening the app shows what is new since you last looked. As
with the leave-time reminder, this only runs while Solvik is open.

To try it without waiting a week, seed the journeys from the browser console —
four weekday mornings between two points is enough:

```js
localStorage.setItem("solvik:journeys", JSON.stringify(
  [1, 2, 3, 4].map((n) => {
    const d = new Date(); d.setDate(d.getDate() - n); d.setHours(8, 5 + n, 0, 0);
    return { id: "s" + n, at: d.getTime(), fromLL: [1.4294, 103.835], fromName: "Yishun",
             toLL: [1.3009, 103.8559], toName: "Raffles Place", mode: "Comfort",
             legs: ["NSL"], started: true, completed: true };
  })
));
location.reload();
```

(Pick days that are actually weekdays — a Sunday trip forms a weekend pattern,
which is kept separate on purpose.)

### Demo mode

Live data is the point of this app, which makes it fragile in exactly one
situation: a stage, a short slot, and a network nobody controls. Demo mode
covers that, and nothing else:

```bash
VITE_DEMO_MODE=1 npm run dev
```

With it on, a live call that **fails** is answered from recorded data —
`api/_lib/recorded/`, including the same route recording the parser tests run
against — instead of an error. Search, route cards with their step breakdown,
bus arrivals, station crowding, the forecast and service alerts all keep
working with every upstream unreachable. It also offers a **week of sample
trips** button in the memory panel, so the learned-commute card can be shown
in seconds.

Two rules keep it honest:

- **It never pretends.** Every screen showing recorded data says so — *"Recorded
  routes and crowding — the live service didn't answer"* — and a successful live
  call is always preferred over the recording.
- **It is off unless asked for.** Without the flags the app behaves exactly as
  before: a failed call reports what failed, and nothing is substituted.

### Saved-place privacy

Home, Work, School, route preferences, watched commutes and recent destinations
are stored only in the current browser. OneMap receives search text while the
user searches and the coordinates needed for a route the user requests; searched
route origins are not persisted, and these private API responses are not
shared-cacheable. Choosing a destination never triggers location permission on
its own. The Plan screen lets the user hide saved-place markers, remove
individual places, or erase all Solvik data from the device. Solvik ships
without analytics or telemetry.

Ranking caveats worth knowing: "Step-free" prefers wheelchair-accessible
buses and short walks but cannot guarantee lift availability; "Bike + rail"
returns a cycling route end to end rather than a true multimodal one. Each
mode's blurb in the app states what it actually ranks on.

## Project layout

```
src/
  design-system/   Solvik design-system primitives (Button, Card, Tag, ...)
  screens/         One file per app screen (Intro, Map, Nav, Report, Points, Plan)
  state/appLogic.jsx  All app state + behavior, ported from the prototype's view-model
  components/      OneMapCanvas (Leaflet + OneMap tiles)
  api/             Client wrappers for /api/*
  lib/             Small helpers (geolocation, geometry, polyline, style text)
  tokens/          Design tokens (colors, type, spacing, radius, motion)
test/              Fixture-based tests for the API response parsers
api/               Serverless functions: journey options, live bus arrivals,
                   crowding, per-station forecast, coverage probe, nearest stop,
                   OneMap search/routing and the LTA DataMall proxy
api/_lib/          Shared server helpers (LTA fetch, OneMap calls, station
                   directory, itinerary → UI mapping)
```

## Deploying

Any static host that also runs the `api/` functions as serverless endpoints
works — this was built with Vercel in mind (`vercel deploy`, zero extra
config). Set the environment variables from `.env.example` in your host's
project settings before deploying.

## Diagnosing live-data problems

Two ways, both reporting the same thing: which credential path was used,
whether the token is valid and when it expires, the exact request sent to
OneMap, the HTTP status, how many itineraries survived parsing, and whether LTA
DataMall answers. Tokens, passwords and account keys are never included, so the
output is safe to paste into an issue.

**In the browser** — with the app running, open:

```
http://localhost:5173/api/diagnostics
```

(or `/api/diagnostics` on your deployed URL). Add `?from=1.43,103.83&to=1.30,103.85`
to test a specific pair. Each response ends with a `hint` field in plain
English saying what to fix.

**In a terminal** — from the `app/` directory, not the repo root:

```bash
cd app
npm run diagnose
npm run diagnose -- --from 1.4294,103.8350 --to 1.3009,103.8559
npm run diagnose -- --coverage
```

### Station coordinates

LTA's crowd feed identifies stations by code only (`NS17`), so each one needs a
position before it can be drawn. Those positions live in
`api/_lib/stations.json`, resolved once through OneMap by:

```bash
npm run stations
```

Run it from `app/` with your `.env` in place, then commit the file. It is
deliberately patient — one search at a time, with retries — because it runs on a
laptop rather than inside a request.

This matters: resolving ~224 codes live inside one request was both slow and
unreliable, and a probe against a real deployment found **218 of 224 stations
being dropped**, which showed on the map as six crowding circles instead of a
network. Station geography is stable reference data, so caching it is fair;
crowd levels never are, and are still read live on every request. Codes missing
from the file still fall back to a live search.

`--coverage` (also at `/api/coverage`) answers a different question: how many
stations LTA's crowd feed actually publishes, per line, and how many of those
*we* then fail to place on the map. `resolveStations()` drops any code it can't
match through OneMap search, so without this the two kinds of gap are
indistinguishable — and only one of them is fixable here.

The endpoint exposes only status information, never secret values, but it does
reveal which keys are configured — remove `api/diagnostics.js` before a public
launch if that bothers you.

## Tests

```bash
npm test
```

Covers the mapping from each upstream response shape to what the UI renders
(itinerary → option card, itinerary → turn-by-turn steps, crowd codes →
levels, position → progress along the route), using recorded fixtures so the
parsers can be checked without network access.

## Notes on the build

- The bottom tab bar is icon-only, per the mobile build spec (no text labels
  under Map / Plan / Report / Points).
- The JS bundle currently includes the full `lucide` icon set (~250KB
  gzipped) since icon names are chosen dynamically at runtime; swap to a
  fixed icon import map if bundle size becomes a concern.
