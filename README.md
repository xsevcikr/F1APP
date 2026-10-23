# F1 Control Room

A real-time Formula 1 timing and telemetry dashboard: moving circuit map, live standings, gaps and battles, race control, telemetry comparison, full-session replay, a calendar and an archive back to 1950. Dark graphite with red accents by default, with a light theme.

Every number on screen comes from a data source and carries its quality state. Nothing is invented and nothing is simulated: when a source does not publish something, or cannot be reached, the app says so.

> Unofficial. This project is not associated with Formula 1 or the FIA. F1, FORMULA ONE and related marks belong to Formula One Licensing B.V.

## Quick start

Requires Node.js 22 or later.

```bash
npm install
cp .env.example .env        # optional, every variable has a default
npm run dev                 # API on :8787, web app on http://localhost:5173
```

The app never generates race data. With no network, or outside a session, pages say so and show only what a source returned. The standalone preview page (see below) has no server and therefore shows only the entry list and honest "unavailable" states.

### Production

```bash
npm run build
npm start                   # serves the API and web/dist from one port (8787)
```

### Tests

```bash
npm test                    # Vitest: shared domain logic, server, web components
npm run typecheck
```

## Data sources and API keys

| Source | Used for | Key | Notes |
| --- | --- | --- | --- |
| [OpenF1](https://openf1.org) | Sessions from 2023: timing, laps, sectors, positions, intervals, car location and telemetry, stints, pit stops, race control, weather, overtakes, results, grid | **None** for historical data. **OpenF1 Sponsor account** (paid) for live data | Free tier: 3 req/s, 30 req/min, historical only. Sponsor: live data over MQTT, about 3 s behind real time. Licence CC BY-NC-SA 4.0 |
| [Jolpica](https://github.com/jolpica/jolpica-f1) (Ergast successor) | Calendar, results, qualifying, sprints, pit stops, lap positions, standings, circuit and driver history since 1950 | None | 4 req/s, 500 req/hour. Non-commercial. Set `JOLPICA_USER_AGENT` |

The only secret is the optional OpenF1 Sponsor username and password. They live in the server's environment, are exchanged for a one-hour token on the server, and are never sent to the browser. The browser only ever talks to this app's own `/api`.

Without Sponsor credentials, a session that is running right now appears as soon as OpenF1 publishes it after the session, labelled HISTORICAL. The app never scrapes restricted endpoints or works around authentication.

All configuration is in [.env.example](.env.example).

## Data quality states

| State | Meaning |
| --- | --- |
| LIVE | Streaming from the source during the session (Sponsor tier), within the stale threshold |
| DELAYED | A live session whose latest data is older than expected, or a session you are watching behind real time |
| HISTORICAL | A finished session, or the free tier |
| UNAVAILABLE | The source does not publish this channel for this session |

Values are also tagged as **measured** (straight from the source), **derived** (calculated from measured data, such as distance from speed or a lap delta) or **estimated** (a model, such as slipstream likelihood).

## Supported features

**Race Centre.** `/race` decides which session is active from the OpenF1 calendar and the server's live status (a session is shown as live only when the server is receiving it). Otherwise it shows the next session with a countdown in your time zone and the circuit's, the most recent session, and whether a race result is official (the results archive has the classification) or provisional.

**Live Standings.** `/live-standings` is a full timing tower for the loaded session: position changes, driver and number, team, laps, gap to leader and to the car ahead, last and best lap, three sector times coloured purple/green/yellow (derived from completed laps), tyre and stint age, pit stops and pit-lane status, DRS (not applicable from 2026), speed when car telemetry is fresh, penalties and open investigations, retired/DSQ/DNS status, a PROVISIONAL or CLASSIFIED label, the last-update time and a Refresh button. It orders by the session, never by championship points.

**Historical races.** `/races` lists every Grand Prix of a season (1950 onward) with the winner, searchable by driver or team and filterable by circuit or Grand Prix name. `/races/:season/:round` is the race page: header, result status, recap links, classification, qualifying, sprint (separate), grid, pit stops, lap chart, replay, retirements, safety cars, steward decisions (2023 onward) and the championship before and after the race. Old `/history`, `/archive`, `/standings` and `/overview` links redirect.

**Race recaps.** `/recaps` and each race page list official recap videos from formula1.com. A link is added to `web/src/data/recaps.json` only after the page was opened and its title, date and duration read from it; IDs are never constructed. Races without a verified link show "Recap unavailable". Videos open on formula1.com (no embeds, no thumbnails, which are not licensed). FIA decision documents are linked as the official season index.

**Home.** A full-bleed racing-red landing page. The selected team's championship position fills the background, its car floats in the middle, and all eleven 2026 teams run along the bottom in championship order with their points. Choose a team with a click, a drag, touch, the trackpad or the arrow keys; the car, the drivers and the figures follow. A short top bar links to Schedule, Drivers and Teams, with Live Timing, Race Control, Standings and History under "More".

**Teams and drivers.** `/teams` and `/drivers` list the 2026 entry list: 11 teams, 22 race drivers with numbers and nationalities, and reserve and practice drivers in a separate section. Each team and driver has a profile with championship position, points and (when the results feed is reachable) wins, podiums, poles, fastest laps, recent results and points progression. Standings come from the Jolpica feed. If it cannot be reached, a dated snapshot is shown and labelled as such.

**Car images.** Each team has an illustrative 3D car in its colours with the driver's number, drawn at the same angle everywhere. You can drag it to turn it and zoom on the team page. It is a low-poly model, not a scan or an official render: it does not reproduce sponsors or exact bodywork. Official car renders, driver portraits and team logos are copyrighted, so none are bundled. Add licensed ones in `web/public/media` (see its README) and they replace the model, the placeholders and the text marks. A portrait is only shown when its driver code matches, and a failed image falls back to a marked placeholder.

**Circuit map.** (`/live`) Canvas circuit map built from car location data: smooth interpolation between samples (never extrapolated; a car whose data stops is held and marked stale), zoom, pan, fit, fullscreen and follow-driver. Start/finish, sector lines, pit lane and DRS zones (derived from where cars opened DRS). Standings with position, gap, interval, last and best lap, sectors, tyre and age, pit stops, DRS state and status, with sorting and filtering by team, tyre and favourites. Driver panel with live speed, gear, throttle, brake and RPM.

**Live Timing.** Lap telemetry comparison for up to four drivers (speed, throttle, brake, gear, RPM, DRS against distance), lap-time delta, section times, braking points, lap-time and position progression, tyre stints, weather and track temperature.

**Battles.** Cars within 1.5 s from official intervals, closing rate, DRS monitor, slipstream estimate (within 1.0 s at 200 km/h or more, labelled estimated), and a position-change log. A change is only **confirmed** when OpenF1's overtakes channel lists it. Changes during pit cycles are labelled pit-cycle, and changes under SC, VSC or red flag are labelled neutralized; neither is ever counted as an overtake.

**DRS (2023–2025).** ACTIVE (flap open), AVAILABLE (eligible), DISABLED (race control disabled it, or the session is neutralized), UNKNOWN (no telemetry in the last 5 s). Seasons from 2026 show DRS as not applicable, because the regulations removed it.

**Race Control.** The official message feed with filters, current track status, neutralization periods and penalties so far. It recognizes green, yellow, double yellow, red, blue, black, black and white, and black with orange disc flags, VSC, Safety Car and Safety Car in this lap, track limits, investigations, unsafe releases, and time, drive-through, stop-and-go and grid penalties, reprimands, fines and disqualifications. Each message shows its time, lap, car, marshalling sector, source and, where the messages allow it, a status: noted, under investigation, confirmed, served, cleared or withdrawn for stewards' matters, and active or cleared for flags. A status only comes from a message the source sent. App alerts are labelled "App alert, not an FIA message" and are kept apart from the official feed. OpenF1's feed carries what race control publishes; if a message is not in it, the app does not show one.

**Replay.** Any session from 2023 can be replayed at 0.5x, 1x, 2x, 5x or 10x with a draggable timeline, keyboard stepping, lap selection, and jumps to the previous or next race-control event. In a live session, Go live returns to real time.

**Calendar.** Season schedule in your time zone with session times, circuit outline and weekend status.

**History.** Archive since 1950: results, qualifying, grid, pit stops, lap-by-lap position chart (from 1996) and a lap replay. Sessions from 2023 link to the full timing replay.

**Drivers & Teams.** Standings, season statistics (wins, podiums, poles, fastest laps, DNFs, points progression), teammate head-to-head, career totals and constructor progression.

**Notifications.** In-app alerts and optional browser notifications for safety car, VSC, red flag, chequered flag, penalties and your favourite drivers' pit stops and retirements. Each event alerts once.

**Settings.** Theme, units (km/h or mph, °C or °F), live buffer, low-power mode, favourites, alert preferences and data-source status.

## Unsupported data channels

These are not published by OpenF1 or Jolpica, so the app shows them as UNAVAILABLE and never estimates them:

- Battery state of charge, ERS deployment and harvesting, and any energy or hybrid data.
- 2026 overtake mode (manual override) activation and active aero state.
- Tyre temperatures, tyre pressures and fuel load.
- Steering angle, lateral or longitudinal g-forces, and car setup.
- Official mini-sector timing beyond OpenF1's segment colours.
- Team radio audio (OpenF1 lists recordings, but this app does not play them).
- Exact circuit length, race distance and weather forecasts (the app shows only measured session weather).
- Live data on the free tier (needs an OpenF1 Sponsor account).
- Timing, telemetry, positions and race control before 2023 (the archive offers results and lap positions only).
- Official driver portraits, team logos and car renders (licensing). The app shows marked placeholders and an illustrative 3D car until you add licensed files. Driver headshots from the timing feed are off by default, since those images are third-party content. They can be turned on in Settings.
- An official machine-readable 2026 entry list. The list in the app comes from public reference tables and should be checked against the FIA entry list.

## Architecture

```
shared/   Domain types, normalizers for each source, SessionTimeline (point-in-time snapshots),
          interpolation, DRS rules, event and battle detection, replay clock, quality rules.
server/   Fastify API. Provider interface with OpenF1 and Jolpica providers, a rate limiter
          per source, a memory and disk cache with stale fallback, and a live hub (OpenF1 MQTT with a
          REST polling fallback) that pushes updates to browsers over Server-Sent Events.
web/      React, Vite and Tailwind. Canvas map and SVG charts. Zustand stores.
```

The browser loads a session's core data once, then receives updates over `/api/live/stream`. Location and telemetry are fetched in aligned one-minute windows around the time being shown, so a replay only loads what it needs. Responses are cached on disk by session phase: finished sessions are kept, and live sessions are refreshed.

### API

| Route | Purpose |
| --- | --- |
| `GET /api/health`, `GET /api/status` | Server health, mode, provider health, live session |
| `GET /api/sessions?year=` | Sessions in a season |
| `GET /api/sessions/:key/core` | Drivers, laps, stints, pits, positions, intervals, race control, weather, results, channel availability |
| `GET /api/sessions/:key/locations?from=&to=` | Car positions (window of 10 minutes at most) |
| `GET /api/sessions/:key/car-data?from=&to=&driver=` | Car telemetry |
| `GET /api/sessions/:key/circuit` | Circuit outline, sectors, pit lane, DRS zones |
| `GET /api/live/stream` | Server-Sent Events: live records and status |
| `GET /api/archive/...` | Schedule, results, sprint, qualifying, pit stops, laps, standings, circuit and driver history |

## Known limitations

- The 2026 entry list (teams, numbers, colours) is a bundled snapshot dated 2026-10-23, in `shared/src/entries.ts`. Mid-season changes need an update there. Team colours are approximate, and OpenF1's per-session colours are used on live pages.
- The standalone page for Claude artifacts has no server and cannot reach external APIs, so it shows only the entry list and the dated standings snapshot. Every data page there says it is unavailable. (`npm run build:standalone -w web`.)
- This build was developed and tested against recorded OpenF1 and Jolpica response shapes and unit tests, because the build environment's network proxy blocks both APIs. The Jolpica archive was spot-checked separately through a summarizing web fetch (2025 Australian Grand Prix podium: Norris, Verstappen, Russell). The app's own requests have not run against either API. Run it once against real data (for example, a 2024 race) before relying on it.
- Live mode has not been exercised against a real Sponsor account yet. It needs `OPENF1_USERNAME` and `OPENF1_PASSWORD` in the server's `.env`.
- Recap links: only 4 are verified so far (see `web/src/data/recaps.json`). Official portraits, logos and car renders are still placeholders.
- The "Championship at this moment" panel uses the 2022-onward points tables and ignores any fastest-lap point; it is a derived estimate.
- Free-tier rate limits make the first load of a long session take a little while. Later loads come from the cache.
- Both data sources are for non-commercial use only.
