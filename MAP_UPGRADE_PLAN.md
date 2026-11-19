# Pit Stop v2.1: Zero-Key MapLibre Vector Map, Live GPS & Offline Routing Plan

## Overview
Upgrade the trackside wayfinding, interactive vector map, and GPS experience in `https://github.com/egor-zvyagin/Pit-Stop-Food-And-Merch-Drop` to work reliably out-of-the-box with zero API keys, real browser GPS geolocation, Dijkstra lake-perimeter pedestrian routing, and polished off-site demo controls.

---

## Swarm Roster & Boundaries

| Worker | Role | Owned Paths | Key Responsibilities |
|---|---|---|---|
| `@coordinator` | Swarm Coordinator | Repo Root, Swarm Board | Phase 0 setup, track orchestration, integration gate, deployment |
| `@geo-core` | Geospatial Engineer | `frontend/src/lib/geo/**`, `frontend/src/data/albertParkGeo.ts`, `frontend/src/data/mapConstantData.tsx`, `frontend/src/data/pitStopConstantData.tsx` | Albert Park GeoJSON circuit, lake-perimeter Dijkstra router, `useTracksideLocation` hook |
| `@map-ui` | Map UI Specialist | `frontend/src/components/PitStopMap.tsx`, `frontend/src/components/map/**`, `frontend/package.json`, `frontend/next.config.mjs` | MapLibre GL v5 migration, OpenFreeMap vector styles, GeoJSON layers, fallback upgrade |
| `@fan-flow` | UX & Wayfinding Engineer | `frontend/src/components/home/**`, `frontend/src/components/pitstop/**`, `frontend/src/components/collect/**`, `frontend/src/app/pass/page.tsx` | Live distance cards, GPS demo control bar, `/collect` & `/pass` wayfinding |
| `@qa-docs` | QA & Documentation | `frontend/src/__tests__/geo.test.ts`, `frontend/src/scripts/seed.ts`, `frontend/src/scripts/smokeLive.ts`, `README.md` | Vitest geo suite, DynamoDB seed calibration, live smoke test verification |

---

## Track Progress Checklist

### Track 0: Coordinator Setup
- [x] Create branch `feat/map-gps-upgrade` from `main`
- [x] Inspect existing map and pit stop constants
- [x] Create `frontend/src/lib/geo/types.ts`
- [x] Initialize `MAP_UPGRADE_PLAN.md`

### Track 1: `@geo-core` (Albert Park GeoJSON, Pedestrian Router & GPS Hook)
- [x] Create `frontend/src/data/albertParkGeo.ts` with accurate 5.278 km circuit LineString & calibrated pod coordinates (M1–M4)
- [x] Implement `frontend/src/lib/geo/geoEngine.ts`:
  - `haversineDistanceMeters(a, b)`
  - `isWithinAlbertParkGeofence(pos, radiusKm = 2.5)`
  - Undirected pedestrian walkway graph around lake perimeter
  - Dijkstra shortest path `computePedestrianRoute(from, to)`
  - `createAccuracyCircleGeoJSON(center, radiusMeters)`
  - `rankStationsByTotalTime(userPos, stations)`
- [x] Implement `frontend/src/lib/geo/useTracksideLocation.ts`:
  - Browser `navigator.geolocation.watchPosition` with high accuracy and cleanup
  - Smart geofence switching (`live_trackside` vs `live_offsite` vs `simulated`)
  - Grandstand simulation presets & `startWalkSimulation` step demo

### Track 2: `@map-ui` (MapLibre GL v5, Interactive Layers & Fallback)
- [x] Install `maplibre-gl@^5.0.0` (strictly v5, NOT v6)
- [x] Configure `transpilePackages: ['maplibre-gl']` in `frontend/next.config.mjs`
- [x] Rebuild `frontend/src/components/PitStopMap.tsx` on `react-map-gl/maplibre`:
  - OpenFreeMap vector styles (Positron light default, Liberty street, Dark)
  - Circuit racing line and Start/Finish line GeoJSON layers
  - Animated/dashed pedestrian route line with midpoint distance pill
  - Status color-coded markers (M1–M4) with live queue pills
  - Pulsing blue GPS beacon with accuracy circle
  - Expand/collapse camera controls, locate me, style switcher
- [x] Upgrade `frontend/src/components/map/OfflineCircuitMapFallback.tsx`:
  - Fix light-mode visibility bug (`text-[var(--color-text-primary)]`)
  - Color-code pins and render route line if location active

### Track 3: `@fan-flow` (Live Distances, Off-Site Demo Bar & Wayfinding)
- [x] Upgrade `HomeContent.tsx` & `SelectedPitStopCard.tsx`:
  - Dynamically display live computed distance & walk minutes
  - Highlight fastest total pod with badge
  - Add compact GPS & Trackside Control Bar beneath map
  - Fix `PitStopInfo.tsx` selected state bug in list
- [x] Add collapsible wayfinding mini-map panel to `CollectReadyState.tsx` and `/pass/page.tsx` with Google Maps external link

### Track 4: `@qa-docs` (Unit Tests, Seed Sync & Docs)
- [x] Create `frontend/src/__tests__/geo.test.ts` (Haversine, geofence, lake avoidance, Dijkstra, ranking)
- [x] Update `frontend/src/scripts/seed.ts` with calibrated pod coordinates
- [x] Update `README.md` documenting zero-key vector map and offline wayfinding architecture

### Track 5: Final Integration & Deployment
- [x] Type check: `npx tsc --noEmit` (0 errors)
- [x] Lint: `npm run lint` (0 errors)
- [x] Unit tests: `npm test` (54/54 tests passing)
- [x] Build test: `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="" npm run build` (clean build)
- [x] Re-seed DynamoDB in Sydney (`pitstop_data`)
- [x] Merge `feat/map-gps-upgrade` to `main`, push to `origin`
- [x] Amplify Deployment verification (Job #15 SUCCEED)
- [x] Real HTTPS live smoke test execution via `smokeLive.ts` (6/6 passed in 1239ms)
