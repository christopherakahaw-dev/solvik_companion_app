# Solvik — Solution Write-Up

## Solution and Personas

**Solvik** is a Singapore public-transport companion built for the three personas in the brief.

- **Rachel** values reliability, so Solvik watches her regular commute and surfaces only meaningful disruptions or route changes.
- **Arjun** values comfort and flexibility, so Solvik uses crowd forecasts, bus load, weather, and alternative departure times to help him choose when and how to travel.
- **Mdm Lim** needs accessibility, so Solvik highlights lift outages, walking segments, wheelchair-accessible buses, and supports larger interface text.

The goal is not just to find a route from A to B, but to answer: **when should I leave, what may go wrong, and is the journey still comfortable and accessible?**

## What Makes Solvik Different

Solvik is designed as a **proactive travel companion**, not just a route planner. It combines routing, disruptions, crowd forecasts, accessibility information, traffic, and weather to help users react before a problem affects their journey.

It is also **local-first**. Onboarding, preferences, watched commutes, reports, and learned journeys are stored in the browser and are not tied to an account. Repeated journeys are learned locally instead of sending travel history to an AI model.

## Architecture and Tech Stack

Solvik is built with **React and Next.js** and deployed on **Vercel**.

Key data sources include:

| Source | Purpose |
|---|---|
| **OneMap** | Door-to-door routing and walking legs |
| **TrainServiceAlerts** | Rail disruptions and free bus/shuttle information |
| **PCDRealTime / PCDForecast** | Current and forecast crowd levels |
| **v3/BusArrival** | Bus arrival, load, and wheelchair accessibility |
| **FacilitiesMaintenance** | Lift outages |
| **TrafficSpeedBands / TrafficIncidents** | Road conditions |
| **data.gov.sg Weather** | Rain affecting walking legs |
| **OpenStreetMap via MapTiler** | Base map |

We intentionally exclude data that does not meaningfully affect the three personas instead of integrating APIs only for breadth.

## Assumptions and Verifiable Claims

Solvik avoids unsupported numerical claims.

A message such as **“Busy at Bishan from 08:30”** comes directly from `PCDForecast` at the interval when the commuter is expected to reach the station.

When Solvik suggests leaving earlier or later, it re-checks the same forecast at shifted departure times of **10, 20, and 30 minutes**.

Route-duration comparisons are calculated from separate **OneMap itineraries**.

For rain, walking duration is adjusted by **1.15× for showers** and **1.35× for heavy rain**. These are our own assumptions, not measured values, so they are shown as estimated adjustments rather than official ETAs.

## Known Limitations

Solvik depends on external APIs, so unavailable or delayed data can affect results.

It currently has **no alerts while the app is closed**, because that would require push-notification infrastructure and an additional backend.

There are also **no train arrival countdowns**, as the available rail data provides crowd information rather than train timings.

Lift warnings are based on current FacilitiesMaintenance data, so Solvik cannot reliably provide a full day-before warning for Mdm Lim.

Local reports are stored only on the device, so they cannot yet form a shared community-wide signal.

## Use of AI

AI is used only for **photo-assisted report triage**. A submitted photo can be checked for whether it is consistent with the report and whether it appears to be a photo of another screen.

This runs only after deterministic checks such as location, timing, and report limits.

Commute learning deliberately does **not** use AI. Repeated journeys are grouped and counted locally because this is simpler, testable, and keeps travel history on the user's device.

## Reproducibility

Solvik includes a demo mode so judges can test disruption scenarios without waiting for a real incident:

```bash
cd app
VITE_DEMO_MODE=1 npm run dev
```

Recorded fixtures include examples such as an NSL disruption, free-bus boarding locations, lift outages, road works, crowd forecasts, and rain.

All recorded information is clearly labelled as **Recorded** and is never presented as live data.

Automated tests can be run using:

```bash
npm test
npx playwright test
```

Any performance, accuracy, or comparison claim in the submission is either directly traceable to its source or supported by a reproducible calculation or test.