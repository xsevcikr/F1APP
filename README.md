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

### Live-source assessments

Checked on 2026-10-23. None of these is used as a data source.

| Source | Finding | Decision |
| --- | --- | --- |
| formula1.com live timing | F1's own subscription product. No public API; its feed is not licensed for third-party apps. | Plain link only |
| f1livedata.com | A website, no API or developer access. Terms forbid scraping and extraction. Data comes from an unnamed third-party feed. | Plain link only |
| OutLap.live (tyron.sk) | A consumer app by Tyron s.r.o. Its page names the community-run OpenF1 API as its data source, lists no API, stream, source repository or terms, and says it is unaffiliated with F1. It is a client of OpenF1, not a separate feed. | Not integrated; use OpenF1 directly |
| julesr0y/f1-livetiming-api (Apache-2.0 code) | Inspected 2026-10-23: `npm install` and `npm start` work, but its client connects to F1's own `livetiming.formula1.com/signalrcore` endpoint presenting itself as an F1 app client (`User-Agent: BestHTTP`, `Origin: https://www.formula1.com`). F1 publishes no public API or licence for that feed, and the project's NOTICE says it is unofficial. The licence covers its code, not the data. It also subscribes to no position or car-data channel, so it could not drive a track map. The connection could not be tested from the cloud environment (host unreachable). | Not integrated: it reaches a restricted feed by imitating an official client |
| OpenF1 | Documented REST and MQTT API. Free tier is historical only; live needs a Sponsor account. | Integrated (live needs credentials) |

To add another live provider, implement `TimingProvider` (and a live source) in `server/src/providers/` and select it in `createDeps`. The UI only reads the shared session models.

### Jolpica integration details

- **Endpoints used** (Ergast-compatible, `https://api.jolpi.ca/ergast/f1/`): `seasons`, `{season}/races`, `{season}/{round}/results|sprint|qualifying|pitstops|laps`, `{season}/driverstandings|constructorstandings` (also per round), `{season}/drivers|constructors|circuits`, `circuits/{id}/results/1` and `fastest/1/results`, `drivers/{id}/results`.
- **Rate limits:** the published limits (4 requests per second burst, 500 per hour sustained) are enforced in the server by a two-window limiter (the hourly window is set to 450). Retries honour `Retry-After` on 429/5xx. Everything is cached: finished seasons permanently on disk, the current season for 30 minutes.
- **User-Agent:** every request sends `JOLPICA_USER_AGENT`. Jolpica's published rate-limit page asks for no particular format, so the default is `f1-control-room/0.1 (+repo URL; non-commercial)`. Add your contact address in `.env`.
- **Pagination:** the server requests 100 rows per page and follows `offset` until `total` is reached, merging rows of the same race (season results, pit stops, laps, drivers, constructors, circuits). The Historical Races list shows 12 races at a time with "Show more".
- **Validation:** a response must carry the Ergast `MRData` envelope (numeric `total`, `limit`, `offset` and the expected table) or it is rejected with an error and never rendered. Rows that do not identify a driver or constructor are dropped, never filled in. Rows are ordered by their own position because pages are not guaranteed to arrive in finishing order. A race without a published result shows as unavailable.
- **Refresh:** Refresh buttons (Historical Races, race pages, Championship) ask the server to reload entries older than one minute (`?refresh=1`); newer entries are kept so repeated clicks cannot exhaust the hourly limit.
- **Entry-list check:** the Drivers page compares the bundled 2026 list with Jolpica's `2026/drivers` and reports differences.
- Race classification (a session's order) and championship standings are separate pages and separate endpoints.

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

## Delayed mode (no OpenF1 credentials)

Without Sponsor credentials OpenF1 serves only archived data. OpenF1's documentation says historical data is free and real-time data needs a subscription; it does not state the exact free-tier window or the error it returns. This project's notes (from an earlier read of the OpenF1 docs) say live access runs from 30 minutes before a session's start to 30 minutes after its end, so the expected delay is about end + 30 minutes. That has not been tested against the real API from this environment.

The server therefore watches the current or just-ended session (up to two hours after it ends) and asks OpenF1 for one small channel (`drivers`) once a minute, well inside the free limits (3 per second, 30 per minute). It records the last time it asked, the last reply (for example "HTTP 403"), and whether data first appeared before the 30-minute mark (`releasedEarly`), which answers the question empirically on your machine. When data appears, the cached empty copy is dropped, the Race Centre shows "Delayed data is ready", and the session opens in Live Standings or the circuit map, always labelled DELAYED or HISTORICAL, never LIVE.

## Replaying old races on the map

Every past race page (2023 onward) has "Replay on the circuit map", and the Historical races list has one button per session. The map uses only archived OpenF1 location samples with play/pause, 0.5× to 10× speed and a timeline. If a session has no samples the map says so. Races from 1996 to 2022 have no car locations, so they get the lap-by-lap running-order replay (from archived lap times) and are labelled as such; before 1996 no replay is possible. Untested against the real OpenF1 API from this environment.

## Researched history snapshot

`web/src/data/historySnapshot.json` holds race podiums (winner, P2, P3 with times and gaps) and final driver and constructor standings for 2024, 2025 and 2026 (to round 17), read from the Jolpica F1 API on 2026-10-23. Wins in each standings table are checked against the podium winners. It is used only when the live archive cannot be reached, is labelled "Research snapshot" on every page that shows it, and does not include full classifications, qualifying, pit stops or fastest laps. Older seasons are not bundled; they need the archive. Licence: CC BY-NC-SA 4.0 (Jolpica), non-commercial.

## Known limitations

- The 2026 entry list (teams, numbers, colours) is a bundled snapshot dated 2026-10-23, in `shared/src/entries.ts`. Mid-season changes need an update there. Team colours are approximate, and OpenF1's per-session colours are used on live pages.
- The standalone page for Claude artifacts has no server and cannot reach external APIs, so it shows the entry list, the dated standings snapshot and the researched history snapshot (below). Pages that need the live archive say they are unavailable. (`npm run build:standalone -w web`.)
- This build was developed and tested against recorded OpenF1 and Jolpica response shapes and unit tests, because the build environment's network proxy blocks both APIs. The Jolpica archive was spot-checked separately through a summarizing web fetch (2025 Australian Grand Prix podium: Norris, Verstappen, Russell). The app's own requests have not run against either API. Run it once against real data (for example, a 2024 race) before relying on it.
- Live mode has not been exercised against a real Sponsor account yet. It needs `OPENF1_USERNAME` and `OPENF1_PASSWORD` in the server's `.env`.
- Recap links: only 12 are verified so far (see `web/src/data/recaps.json`). Official portraits, logos and car renders are still placeholders.
- The "Championship at this moment" panel uses the 2022-onward points tables and ignores any fastest-lap point; it is a derived estimate.
- Free-tier rate limits make the first load of a long session take a little while. Later loads come from the cache.
- Both data sources are for non-commercial use only.
