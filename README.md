# TrailSync — Offline GPS Navigation System

> Plan routes online, navigate offline with turn-by-turn directions.  
> Built for the IoT course project — integrates with ESP32 + NEO-6M GPS hardware.

![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?logo=leaflet&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [How to Use — Step by Step](#how-to-use--step-by-step)
  - [Online Mode (Route Planning)](#online-mode-route-planning)
  - [Downloading for Offline](#downloading-for-offline)
  - [Offline Mode (Navigation)](#offline-mode-navigation)
  - [GPS Source Configuration](#gps-source-configuration)
- [Feature Status & Known Issues](#feature-status--known-issues)
- [Testing Guide](#testing-guide)
- [Deployment](#deployment)
- [ESP32 Hardware Setup (Optional)](#esp32-hardware-setup-optional)
- [Project Structure](#project-structure)

---

## Overview

TrailSync is a **Progressive Web App (PWA)** that enables offline-first GPS navigation. The workflow is:

1. **Online Mode**: Search for places, drop waypoints on the map, snap the route to real roads via OSRM, and review the route with distance/time/turn estimates.
2. **Download**: Save the route for offline use — downloads map tiles, road graph data, turn instructions, and nearby POIs to the browser's IndexedDB.
3. **Offline Mode**: Navigate the saved route with turn-by-turn directions, voice announcements, speed display, ETA, and off-route detection — all without an internet connection.

GPS data comes from one of three sources:
- **Simulator** (default): Synthetic NMEA data along the route — no hardware needed.
- **ESP32 WiFi**: Real GPS data from an ESP32 + NEO-6M module via WebSocket.
- **Bluetooth BLE**: Real GPS data via Web Bluetooth (requires compatible browser).

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     GPS Input Layer                     │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Simulator  │  │ WebSocket    │  │ Bluetooth BLE  │  │
│  │ (Demo GPS) │  │ (ESP32 WiFi) │  │ (Web Bluetooth)│  │
│  └─────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
└────────┼────────────────┼──────────────────┼────────────┘
         └────────────────┼──────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Core Processing                       │
│  NMEA Parser → Kalman Filter → Map Matcher → Pathfinder │
│                Bearing Engine ← Spatial Index            │
│                Voice Announcer (Web Speech API)          │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     Data Layer                          │
│  Overpass API → Graph Builder → IndexedDB (idb)         │
│  OSRM Router    Tile Manager    Route I/O (GPX/GeoJSON) │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      UI Layer                           │
│  App Shell │ Map (Leaflet) │ Dashboard │ Route Planner  │
│  Navigation HUD │ Route List │ Download Manager │ Toast │
│  GPS Settings │ Trip History                            │
└─────────────────────────────────────────────────────────┘
```

**Tech Stack**: Vanilla JS + Vite 8 + Leaflet 1.9 + IndexedDB (`idb` library)  
**External APIs**: OSRM (routing), Overpass (road graph), Nominatim (search), OpenStreetMap (tiles)

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A modern browser (Chrome/Edge/Firefox) — Chrome recommended for Web Bluetooth support
- Internet connection for initial development and online mode features

---

## Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/LikhitCodes/GeoDude.git
cd GeoDude

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The app will be available at **`http://localhost:5173`** (default Vite port).

> **Note**: The service worker (`sw.js`) only works when served over HTTPS or on `localhost`. During development, the SW registration will succeed on localhost but may behave differently than in production.

---

## How to Use — Step by Step

### Online Mode (Route Planning)

This is the default mode when the app loads. The left sidebar shows the **Dashboard** with live GPS telemetry and the **Route Planner**.

1. **Search for a Place**:
   - Optionally enter a **State** and **City** in the filter fields to narrow results.
   - Type a place name in the "Search places..." input (minimum 3 characters).
   - Click a search result — it will be added as a waypoint and the map will fly to it.

2. **Add Waypoints by Clicking the Map**:
   - Click anywhere on the map to drop a waypoint (shown as numbered pins).
   - You need at least **2 waypoints** to create a route.

3. **Choose a Routing Profile**:
   - Select **Car**, **Bike**, or **Walk** — this changes the OSRM routing engine profile.

4. **Snap to Roads**:
   - Click the **"Snap to Roads"** button. This sends the waypoints to OSRM and returns a road-following route.
   - The route is drawn on the map as a green polyline.
   - A summary appears showing **distance**, **estimated time**, and **number of turns**.

5. **Reorder Waypoints (Drag & Drop)**:
   - Drag waypoints by the grip handle (⠿) to reorder them.
   - The snapped route clears when you reorder — you need to re-snap.

6. **View GPS Telemetry**:
   - The dashboard shows live **speed**, **heading** (compass), **latitude/longitude**, **elevation**, and **satellite signal** from the active GPS source (simulator by default).

### Downloading for Offline

After snapping a route to roads:

1. Click **"Download for Offline"** in the route summary section.
2. A modal appears showing download progress through these phases:
   - **Fetching Offline Graph**: Downloads the road network from Overpass API for offline rerouting.
   - **Saving Turns**: Precomputes turn-by-turn instructions.
   - **Downloading Map Tiles**: Caches map tiles at zoom levels 14–16 for the route corridor.
   - **Caching POIs**: Downloads nearby points of interest (fuel, restaurants, hospitals, etc.).
   - **Naming Route**: Reverse-geocodes start and end points for a descriptive name.
3. When complete, the app auto-switches to the **Offline Routes** tab.

> **Tip**: The tile preview feature shows grid rectangles on the map during download so you can see coverage.

### Offline Mode (Navigation)

Switch to Offline Mode by clicking the **"Offline Routes"** tab in the sidebar.

1. **View Saved Routes**:
   - Each route card shows the name, distance, estimated time, storage used, and available offline data (Graph, POIs).

2. **Start Navigation**:
   - Click **"Navigate"** on a route card.
   - The Navigation HUD appears over the map with:
     - **Turn instruction** with maneuver icon (arrow direction) and distance to next turn
     - **Current speed** (km/h)
     - **Remaining distance**
     - **ETA** (calculated from current speed)
     - **Speed limit selector** — set a speed limit alert threshold
     - **Voice toggle** — enable/disable spoken turn announcements
   - The GPS simulator automatically starts following the downloaded route.

3. **During Navigation**:
   - The GPS marker (blue dot with heading indicator) moves along the route.
   - A grey "traveled path" line shows the portion already covered.
   - An accuracy circle shows GPS signal quality.
   - If you go off-route for 5+ seconds, the app attempts **automatic rerouting** using the cached A* graph.
   - Voice announcements play at 200m, 100m, and at each turn point.

4. **End Navigation**:
   - Click **"End Route"** or the app will automatically show an arrival screen when you reach the destination.
   - Trip stats (distance, duration) are saved to **Trip History**.

5. **Manage Routes**:
   - **Export**: Download as GeoJSON or GPX file.
   - **Import**: Upload a GeoJSON or GPX file from other apps.
   - **Purge Tiles**: Remove cached map tiles while keeping route data.
   - **Delete**: Remove the route and all associated data.

### GPS Source Configuration

Click the GPS status indicator (top-right of sidebar) to open the **GPS Settings** panel:

| Source | Description | When to Use |
|--------|-------------|-------------|
| **Simulator** | Generates synthetic NMEA data along the active route | Testing without hardware |
| **ESP32 (WiFi)** | Connects via WebSocket to an ESP32 running a NMEA server | Real GPS with WiFi link |
| **Bluetooth BLE** | Connects via Web Bluetooth to an ESP32 with Nordic UART | Real GPS with BLE link |

- For ESP32: Enter the WebSocket URL (default: `ws://192.168.4.1:81`) and use the **Test** button to verify connectivity.
- The simulator speed can be adjusted with the **1x / 2x / 5x / 10x** speed buttons.

---

## Feature Status & Known Issues

### ✅ Fully Working Features

| Feature | Description |
|---------|-------------|
| Route Planning | Search + click-to-add waypoints + OSRM snap-to-roads |
| Multi-mode Routing | Car / Bike / Walk via OSRM profiles |
| Waypoint Drag & Drop | Reorder waypoints in sidebar |
| Tile Download | Batched concurrent download with progress UI |
| Tile Preview | Grid overlay during download showing coverage |
| Offline Storage | IndexedDB-backed persistence (routes, tiles, graphs, instructions, POIs, trips) |
| Route Export/Import | GeoJSON and GPX format support |
| GPS Simulator | NMEA sentence generation along any route |
| NMEA Parser | Parses $GPGGA, $GPRMC, $GPGSV with checksum verification |
| Kalman Smoothing | 1D Kalman filter on lat/lon with velocity prediction |
| Bearing Engine | Turn classification, maneuver icons, instruction generation |
| Turn-by-Turn HUD | Live instruction display with maneuver arrows |
| Voice Navigation | Web Speech API announcements at 200m, 100m, and at turn |
| Traveled Path | Grey overlay showing completed portion of route |
| Off-Route Detection | Shows warning when GPS position deviates from route |
| Off-Route Rerouting | A* pathfinding to recalculate route after 5 consecutive off-route readings |
| ETA Display | Speed-based estimated time of arrival |
| Speed Alerts | Configurable speed limit with visual/flash warning |
| GPS Accuracy Circle | HDOP-based accuracy ring around GPS marker |
| Reverse Geocoded Names | Start → End naming for downloaded routes |
| Dark Mode | Toggle with localStorage persistence |
| Service Worker / PWA | Caches app shell for offline loading |
| Trip History | Records completed trips with distance, time, avg speed |
| Per-Route Storage Stats | Shows tile count, size, and data availability per route |
| Tile Purge | Selective tile deletion while keeping route metadata |
| POI Caching | Caches nearby amenities during download |
| ESP32 Diagnostics | Battery, signal, firmware, uptime display (when ESP32 sends JSON payloads) |
| WebSocket Reconnection | Auto-reconnects to ESP32 every 3 seconds |
| Bluetooth BLE GPS | Web Bluetooth with Nordic UART service support |
| GPS Settings Panel | Full modal UI for source selection, URL config, connection test |

### ⚠️ Known Limitations & Edge Cases

| Issue | Status | Details |
|-------|--------|---------|
| **OSRM cycling/walking profiles** | ✅ Handled | The public OSRM server may not support all profiles. The app now **auto-falls back to driving** with a toast notification if cycling/walking routing fails. |
| **Bluetooth requires HTTPS** | ✅ Handled | The app now **detects insecure contexts** and shows a clear error toast before attempting Bluetooth, instead of failing silently. |
| **Overpass API rate limits** | ✅ Handled | The client now adds **retry delays** between endpoints (500ms) and handles 429 responses with a 2s backoff before trying the next mirror. |
| **Large route tile downloads** | ✅ Handled | Routes requiring **500+ tiles** now show a **confirmation dialog** with estimated download size before proceeding. |
| **Service Worker + Vite HMR** | ✅ Fixed | The service worker is now **only registered in production** (when no port is present in the URL), avoiding all HMR cache conflicts during development. |
| **Vite config** | ✅ Fixed | `vite.config.js` has been created with sensible defaults, LAN server access, and a clear comment for GitHub Pages `base` path. |

---

## Testing Guide

### Quick Smoke Test (No Hardware)

```bash
# Start dev server
npm run dev
```

1. **Boot Check**: Open `http://localhost:5173`. Verify:
   - Map loads centered globally
   - Sidebar shows "Live Telemetry" with speed gauge, compass
   - GPS status shows "Simulated GPS" with olive dot
   - Toast: "Welcome to TrailSync"
   - Sim Speed buttons (1x/2x/5x/10x) are visible

2. **Search & Waypoints**:
   - Type "Vellore" in the search box → results appear → click one → waypoint added + map flies to location
   - Click two more points on the map → 3 waypoints in sidebar list
   - Drag a waypoint by its grip handle → order changes

3. **Route Snapping**:
   - Click "Snap to Roads" → loading spinner → route drawn on map (green line)
   - Summary shows: distance, time, turns, "Download for Offline" button
   - Switch profiles (Car/Bike/Walk) → route re-snaps if already snapped

4. **Offline Download**:
   - Click "Download for Offline" → download modal appears
   - Progress through: Graph → Turns → Tiles → POIs → Naming → Complete
   - App switches to "Offline Routes" tab
   - Route card visible with name, distance, storage stats

5. **Offline Navigation**:
   - Click "Navigate" on the route card
   - HUD appears: turn arrow, distance, speed, remaining, ETA
   - GPS dot moves along route (simulator auto-starts)
   - Voice announcements play (if browser supports Speech API)
   - Speed limit: select a limit → exceed it → red warning flash
   - Click "End Route" → trip saved to history

6. **Dark Mode**: Click moon icon → UI switches to dark theme

7. **Export/Import**:
   - In offline routes, click export icon → choose GeoJSON → file downloads
   - Click "Import Route" → upload the exported file → route loads in planner

### GPS Settings Test

1. Click the GPS status indicator → settings modal opens
2. Select "GPS Simulator" → Apply → status shows "Simulated GPS"
3. Select "ESP32 (WiFi)" → enter a URL → click "Test" → verify connection test
4. Select "Bluetooth BLE" → Apply → browser Bluetooth pairing dialog (requires HTTPS)

### Offline Behavior Test

1. Download a route as described above
2. Open Chrome DevTools → Application → Service Workers → check "Offline"
3. Switch to Offline Routes tab → route should still be visible
4. Click Navigate → tiles should load from IndexedDB cache
5. The map should display cached tiles for the route corridor

### Build Verification

```bash
# Build for production
npm run build

# Preview the production build locally
npm run preview
```

Verify:
- Build completes without errors
- `dist/` contains: `index.html`, `assets/` (JS + CSS bundles), `manifest.json`, `sw.js`, `favicon.svg`
- Preview at `http://localhost:4173` works identically to dev

---

## Deployment

### Option 1: Static Hosting (Recommended for Demo)

TrailSync is a static single-page app. After building, deploy the `dist/` folder to any static hosting service.

```bash
# Build the production bundle
npm run build
```

#### Vercel (Easiest)

```bash
# Install Vercel CLI globally
npm install -g vercel

# Deploy from the project root
vercel

# Or deploy just the dist folder
vercel dist/
```

#### Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

Or connect your GitHub repo to Netlify and set:
- **Build command**: `npm run build`
- **Publish directory**: `dist`

#### GitHub Pages

```bash
# Build
npm run build

# Deploy using gh-pages
npx gh-pages -d dist
```

Or configure GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

> **Important for GitHub Pages**: If deploying to a subdirectory (e.g., `username.github.io/GeoDude/`), create a `vite.config.js`:
> ```js
> import { defineConfig } from 'vite';
> export default defineConfig({
>   base: '/GeoDude/',
> });
> ```

#### Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting  # Select dist/ as public directory, configure as SPA
npm run build
firebase deploy
```

#### Any Static Server (Nginx, Apache, Caddy)

Just copy the `dist/` folder contents to your web server's root. Example Nginx config:

```nginx
server {
    listen 80;
    server_name trailsync.example.com;
    root /var/www/trailsync/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Option 2: Docker

```dockerfile
# Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
docker build -t trailsync .
docker run -p 8080:80 trailsync
```

### Deployment Checklist

- [ ] `npm run build` completes without errors
- [ ] Service Worker path is correct (should be at root `/sw.js`)
- [ ] `manifest.json` `start_url` matches your deployment path
- [ ] If using a subdirectory, set `base` in `vite.config.js`
- [ ] HTTPS is configured (required for Service Worker and Web Bluetooth)
- [ ] Test offline behavior after deployment

### Important: HTTPS Requirement

For full functionality, **deploy with HTTPS**:
- Service Workers require a secure context
- Web Bluetooth requires HTTPS
- Web Speech API works best over HTTPS
- Geolocation API (if used in future) requires HTTPS

All recommended platforms (Vercel, Netlify, GitHub Pages, Firebase) provide HTTPS by default.

---

## ESP32 Hardware Setup (Optional)

This section is for connecting real GPS hardware instead of using the simulator.

### Hardware Required
- ESP32 DevKit (any variant)
- NEO-6M GPS Module (or compatible NMEA GPS)
- Jumper wires

### Wiring

| ESP32 Pin | NEO-6M Pin |
|-----------|------------|
| 3.3V      | VCC        |
| GND       | GND        |
| GPIO16 (RX2) | TX      |
| GPIO17 (TX2) | RX      |

### ESP32 Firmware

The ESP32 should run firmware that:
1. Reads NMEA sentences from the NEO-6M over UART
2. Hosts a WiFi Access Point (default SSID: `TrailSync-GPS`)
3. Serves a WebSocket server on port 81
4. Forwards raw NMEA sentences to connected WebSocket clients

Optionally, it can also send JSON diagnostic payloads:
```json
{
  "type": "status",
  "battery": 87,
  "signal": -65,
  "firmware": "1.2.0",
  "uptime": 3600
}
```

### Connecting

1. Power on the ESP32 → it creates a WiFi AP
2. Connect your phone/laptop to the ESP32's WiFi network
3. Open TrailSync → GPS Settings → select "ESP32 (WiFi)"
4. Enter the WebSocket URL: `ws://192.168.4.1:81`
5. Click "Test" to verify connectivity
6. Click "Apply"

---

## Project Structure

```
Iot-CP/
├── index.html              # Entry HTML (PWA meta tags, font imports)
├── package.json            # Dependencies: vite, leaflet, idb
├── vite.config.js          # Vite build config (base path, server settings)
├── public/
│   ├── manifest.json       # PWA manifest
│   ├── sw.js              # Service Worker (app shell caching)
│   ├── favicon.svg        # App icon
│   └── icons.svg          # SVG sprite sheet
├── src/
│   ├── main.js            # App entry point — NavigationApp class
│   ├── core/              # Core algorithms
│   │   ├── bearing-engine.js   # Turn classification & instruction generation
│   │   ├── haversine.js        # Distance & bearing calculations
│   │   ├── kalman-filter.js    # GPS position smoothing + IMU fusion
│   │   ├── map-matching.js     # Snap GPS to nearest road node
│   │   ├── nmea-parser.js      # NMEA 0183 sentence parser + generator
│   │   ├── pathfinder.js       # A* shortest-path algorithm
│   │   ├── spatial-index.js    # Grid-based spatial index for fast lookup
│   │   └── voice-announcer.js  # Web Speech API voice navigation
│   ├── data/              # Data layer
│   │   ├── demo-route.js       # VIT Vellore campus loop (default simulator route)
│   │   ├── graph-builder.js    # Convert OSM data to adjacency list
│   │   ├── offline-store.js    # IndexedDB CRUD (routes, tiles, graphs, etc.)
│   │   ├── overpass-client.js  # Overpass API client (roads + POIs)
│   │   ├── route-io.js         # GeoJSON/GPX import/export
│   │   └── tile-manager.js     # Tile download, caching, offline Leaflet layer
│   ├── gps/               # GPS data sources
│   │   ├── gps-provider.js     # Abstract base class
│   │   ├── gps-simulator.js    # Synthetic NMEA along route
│   │   ├── websocket-client.js # ESP32 WiFi connection
│   │   └── bluetooth-client.js # Web Bluetooth BLE connection
│   ├── ui/                # UI components
│   │   ├── app-shell.js        # Layout, sidebar, mode switching
│   │   ├── dashboard-panel.js  # Live telemetry display
│   │   ├── download-manager.js # Download progress modal
│   │   ├── gps-settings.js     # GPS source configuration modal
│   │   ├── map-view.js         # Leaflet map wrapper
│   │   ├── navigation-hud.js   # Turn-by-turn navigation overlay
│   │   ├── route-list.js       # Offline route management
│   │   ├── route-planner.js    # Waypoint + search + snap UI
│   │   ├── toast.js            # Toast notification system
│   │   └── trip-history.js     # Completed trip log
│   ├── styles/            # CSS
│   │   ├── index.css           # Design tokens, global styles
│   │   ├── components.css      # Buttons, inputs, cards, modals
│   │   ├── dashboard.css       # Telemetry, compass, speed gauge
│   │   ├── navigation.css      # HUD, waypoints, route cards
│   │   └── animations.css      # Transitions, keyframes
│   ├── utils/
│   │   └── helpers.js          # CONFIG constants, formatDistance, formatTime
│   └── assets/
│       ├── hero.png            # Unused asset
│       └── vite.svg            # Vite logo
└── dist/                  # Production build output (generated)
```

---

## License

This project is part of an IoT course project at VIT Vellore. See the repository for license details.
