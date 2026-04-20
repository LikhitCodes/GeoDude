/**
 * Main application entry point
 */
import './styles/index.css';
import './styles/components.css';
import './styles/dashboard.css';
import './styles/navigation.css';
import './styles/animations.css';

import { AppShell } from './ui/app-shell.js';
import { MapView } from './ui/map-view.js';
import { DashboardPanel } from './ui/dashboard-panel.js';
import { RoutePlanner } from './ui/route-planner.js';
import { RouteList } from './ui/route-list.js';
import { DownloadManager } from './ui/download-manager.js';
import { NavigationHUD } from './ui/navigation-hud.js';
import { GPSSettingsPanel } from './ui/gps-settings.js';
import { TripHistory } from './ui/trip-history.js'; // Feature 22
import { toast } from './ui/toast.js';

import { WebSocketClient } from './gps/websocket-client.js';
import { BluetoothClient } from './gps/bluetooth-client.js'; // Feature 17
import { GPSSimulator } from './gps/gps-simulator.js';
import { NMEAParser } from './core/nmea-parser.js';
import { GPSKalmanSmoother } from './core/kalman-filter.js';
import { MapMatcher } from './core/map-matching.js';
import { Pathfinder } from './core/pathfinder.js';
import { VoiceAnnouncer } from './core/voice-announcer.js';
import { generateTurnInstructions, findCurrentInstruction, MANEUVER } from './core/bearing-engine.js';
import { fetchRoadsForRoute, fetchPOIsForRoute } from './data/overpass-client.js';
import { buildGraph, compactGraph, findNearestNode } from './data/graph-builder.js';
import { getTilesForRoute, downloadTiles, estimateDownloadSize, latLonToTile } from './data/tile-manager.js';
import { saveRoute, saveGraph, saveInstructions, savePOIs, getGraph, getInstructions, saveTrip } from './data/offline-store.js'; // Feature 22
import { CONFIG, formatDistance, formatTime } from './utils/helpers.js';
import { haversineDistance } from './core/haversine.js';
import { DEMO_ROUTE } from './data/demo-route.js';

class NavigationApp {
  constructor() {
    this.ui = {
      shell: new AppShell(),
      map: new MapView('map'),
      dashboard: new DashboardPanel(),
      planner: new RoutePlanner(),
      routeList: new RouteList(),
      download: new DownloadManager(),
      hud: new NavigationHUD(document.querySelector('.map-container')),
      gpsSettings: new GPSSettingsPanel(),
      tripHistory: new TripHistory(), // Feature 22
    };

    this.core = {
      parser: new NMEAParser(),
      smoother: new GPSKalmanSmoother(),
      matcher: new MapMatcher(),
      pathfinder: new Pathfinder(),
      simulator: new GPSSimulator(),
      websocket: new WebSocketClient(),
      bluetooth: new BluetoothClient(), // Feature 17
      voice: new VoiceAnnouncer(),   // Feature 7: Voice turn announcements
    };

    this.state = {
      mode: 'online', // 'online' or 'offline'
      navType: 'planning', // 'planning' or 'navigating'
      gpsProvider: 'simulator', // 'simulator' | 'websocket' | 'bluetooth'
      useSimulator: true,
      currentGPS: null, // Last smoothed reading
      activeRouteData: null,
      activeInstructions: null,
      instructionIndex: 0,
      hasArrived: false,
      offRouteCounter: 0,       // Fix 3: sustained off-route counter
      isRerouting: false,       // Fix 3: prevent concurrent reroutes
      routingProfile: 'driving', // Feature 8: 'driving' | 'cycling' | 'walking'
      speedLimitKmh: 0,         // Feature 10: 0 = disabled, >0 = active limit
      speedAlertActive: false,  // Feature 10: track alert state
    };

    // Bind UI -> App logic
    this.bindEvents();
    
    // Don't auto-start simulator — let user enable GPS when needed
    // This prevents demo Vellore coordinates from overriding real location
    
    // Show onboarding toast on first boot
    setTimeout(() => {
      toast.info('Welcome to TrailSync', 'Click the GPS indicator to connect a GPS source, or start planning a route!');
    }, 1500);
  }

  bindEvents() {
    // Mode Switching (Sidebar tabs)
    this.ui.shell.onModeChange = (mode) => {
      this.state.mode = mode;
      this.ui.map.setMode(mode === 'offline');
      
      if (mode === 'offline') {
        this.ui.routeList.render();
      } else {
        // Return to planning view, hide HUD
        this.stopNavigation(); // async but fire-and-forget is OK here (no trip to save when switching tabs)
      }
    };

    // Fix 6: GPS Source Settings Panel (replaces raw toggle)
    this.ui.shell.onToggleSimulator = () => {
      // Map internal gpsProvider names to the settings panel's naming convention
      const panelSource = this.state.gpsProvider === 'websocket' ? 'esp32' : this.state.gpsProvider;
      this.ui.gpsSettings.show(panelSource, this.core.websocket.url);
    };

    // GPS Settings Panel callbacks
    this.ui.gpsSettings.onSwitchToSimulator = () => {
      this.state.useSimulator = true;
      this.state.gpsProvider = 'simulator';
      // Restore demo route if no active route
      if (!this.state.activeRouteData) {
        this.core.simulator.setRoute(DEMO_ROUTE);
      }
      this.initGPS();
      this.ui.shell.updateConnectionStatus('connected', true);
      toast.info('GPS Mode', 'Switched to Simulator.');
    };

    this.ui.gpsSettings.onSwitchToESP32 = (url) => {
      this.state.useSimulator = false;
      this.state.gpsProvider = 'websocket';
      this.core.websocket.url = url;
      this.initGPS();
      toast.info('GPS Mode', `Connecting to ESP32 at ${url}...`);
    };

    // Feature 17: Bluetooth
    this.ui.gpsSettings.onSwitchToBluetooth = async () => {
        // Check for secure context (HTTPS) — required by Web Bluetooth API
        if (!window.isSecureContext) {
            toast.error("HTTPS Required", "Bluetooth requires a secure connection (HTTPS). Use localhost for development or deploy with HTTPS.");
            return;
        }
        if (!navigator.bluetooth) {
            toast.error("Not Supported", "Web Bluetooth is not available in this browser. Try Chrome or Edge.");
            return;
        }
        this.state.useSimulator = false;
        this.state.gpsProvider = 'bluetooth';
        try {
            await this.core.bluetooth.connect();
            this.initGPS();
            toast.success("GPS Mode", "Connected via Bluetooth BLE.");
            this.ui.shell.updateConnectionStatus('connected', false);
        } catch (err) {
            toast.error("Bluetooth Error", err.message || "Failed to connect to device.");
            // Fallback to simulator
            this.state.gpsProvider = 'simulator';
            this.state.useSimulator = true;
            this.initGPS();
            this.ui.gpsSettings.show('simulator');
        }
    };

    this.ui.gpsSettings.onTestConnection = async (url) => {
      // Quick test: try to open a WebSocket for 3 seconds
      return new Promise((resolve) => {
        try {
          const testWs = new WebSocket(url);
          const timer = setTimeout(() => {
            testWs.close();
            resolve(false);
          }, 3000);
          testWs.onopen = () => {
            clearTimeout(timer);
            testWs.close();
            resolve(true);
          };
          testWs.onerror = () => {
            clearTimeout(timer);
            resolve(false);
          };
        } catch {
          resolve(false);
        }
      });
    };

    // Feature 16: Diagnostics wiring
    this.core.websocket.onDiagnostic = (data) => {
        this.ui.gpsSettings.updateDiagnostics(data);
    };

    // Simulator Speed
    this.ui.shell.onSpeedChange = (speed) => {
      this.core.simulator.setSpeedMultiplier(speed);
      CONFIG.speedMultiplier = speed;
    };

    // Planning: Add Waypoints
    this.ui.map.onClick = (lat, lon) => {
      if (this.state.mode === 'online' && this.state.navType === 'planning') {
        this.ui.planner.addWaypoint(lat, lon);
      }
    };

    // Planning: Search Selection
    this.ui.planner.onSearchSelect = (lat, lon) => {
        this.ui.map.flyTo(lat, lon, 15);
    };

    // Planning: State/City auto-zoom
    this.ui.planner.onMapFlyTo = (lat, lon, zoom) => {
        this.ui.map.flyTo(lat, lon, zoom);
    };

    // Keep planner's mapCenter synced for distance-sorted search
    this.ui.map.map.on('moveend', () => {
        const c = this.ui.map.map.getCenter();
        this.ui.planner.mapCenter = { lat: c.lat, lon: c.lng };
        // Sync user's resolved location for accurate distance calc
        if (this.ui.map.userLocation) {
            this.ui.planner.userLocation = this.ui.map.userLocation;
        }
    });
    // Set initial center
    const initCenter = this.ui.map.map.getCenter();
    this.ui.planner.mapCenter = { lat: initCenter.lat, lon: initCenter.lng };

    // Planning: List updates
    this.ui.planner.onAddWaypoint = (lat, lon) => this.refreshMapWaypoints();
    this.ui.planner.onRemoveWaypoint = () => {
        this.refreshMapWaypoints();
        this.ui.map.clearRoute(); // Clear snapped route if waypoints change
    };

    // Feature 9: Waypoint drag-and-drop reorder
    this.ui.planner.onReorderWaypoints = () => {
        this.refreshMapWaypoints();
        this.ui.map.clearRoute(); // Clear snapped route on reorder
    };

    // Feature 8: Routing profile change
    this.ui.planner.onProfileChange = (profile) => {
        this.state.routingProfile = profile;
        // Auto re-snap if we already have a route
        if (this.ui.planner.routeData && this.ui.planner.waypoints.length >= 2) {
            this.ui.planner.setLoading(true);
            this.computeRouteOnline(this.ui.planner.waypoints).then(() => {
                this.ui.planner.setLoading(false);
            });
        }
    };

    // Overpass Routing
    this.ui.planner.onSnapToRoads = async (waypoints) => {
      if (waypoints.length < 2) {
          toast.warning("Not enough points", "Need at least 2 waypoints to create a route.");
          return;
      }
      this.ui.planner.setLoading(true);
      await this.computeRouteOnline(waypoints);
      this.ui.planner.setLoading(false);
    };

    // Offline Download
    this.ui.planner.onDownload = async (routeData, waypoints, routeName) => {
       await this.downloadForOffline(routeData, waypoints, routeName);
    };

    // Begin Navigation (from Offline List)
    this.ui.routeList.onNavigate = async (routeRecord) => {
        await this.startNavigation(routeRecord);
    };

    // Feature 13: Import route from file
    this.ui.routeList.onImportRoute = async (imported) => {
        // Switch to planning mode and load imported route
        this.ui.shell.switchMode('online');
        // Clear existing waypoints
        this.ui.planner.clearWaypoints();
        // Add start and end as waypoints
        const start = imported.pathCoords[0];
        const end = imported.pathCoords[imported.pathCoords.length - 1];
        this.ui.planner.addWaypoint(start.lat, start.lon);
        this.ui.planner.addWaypoint(end.lat, end.lon);
        // Set the route directly
        const instructions = generateTurnInstructions(imported.pathCoords, CONFIG.minTurnAngle);
        this.state.activeRouteData = {
            distance: imported.distance,
            pathCoords: imported.pathCoords,
            instructions: instructions,
            graph: null
        };
        this.ui.map.setRoute(imported.pathCoords);
        this.ui.planner.setSnappedRoute(this.state.activeRouteData);
        toast.info('Route Loaded', `"${imported.name}" ready for download or navigation.`);
    };

    // End Navigation
    this.ui.hud.onEndNavigation = () => {
        this.stopNavigation().then(() => {
            this.ui.shell.switchMode('online'); // Go back to dashboard
        });
    };

    // Feature 7: Voice toggle from HUD
    this.ui.hud.onToggleVoice = () => {
        const enabled = this.core.voice.toggle();
        this.ui.hud.setVoiceEnabled(enabled);
        toast.info('Voice Navigation', enabled ? 'Voice announcements enabled.' : 'Voice announcements muted.');
    };

    // Feature 10: Speed limit change from HUD
    this.ui.hud.onSpeedLimitChange = (limit) => {
        this.state.speedLimitKmh = limit;
    };
  }

  // ============== GPS HANDLING ==============

  initGPS() {
    // Stop active
    this.core.simulator.stop();
    this.core.websocket.stop();
    this.core.bluetooth.stop(); // Feature 17
    this.core.smoother.reset();
    
    // Setup listeners
    const onData = (rawData) => {
      const parsed = this.core.parser.feed(rawData);
      parsed.forEach(fix => this.processGPSFix(fix));
    };

    let provider;
    if (this.state.gpsProvider === 'simulator') provider = this.core.simulator;
    else if (this.state.gpsProvider === 'websocket') provider = this.core.websocket;
    else if (this.state.gpsProvider === 'bluetooth') provider = this.core.bluetooth;
    
    // Clean old listeners... simplistic approach for demo rebuild
    if(this._gpsDataUnsub) this._gpsDataUnsub();
    if(this._gpsStatusUnsub) this._gpsStatusUnsub();
    
    this._gpsDataUnsub = provider.onData(onData);
    this._gpsStatusUnsub = provider.onStatusChange(status => {
        this.ui.shell.updateConnectionStatus(status, this.state.gpsProvider === 'simulator');
    });

    provider.start();
    
    // If simulator and we have a route, set it
    if (this.state.useSimulator && this.state.activeRouteData) {
       this.core.simulator.setRoute(this.state.activeRouteData.pathCoords);
    }
  }

  processGPSFix(fixData) {
    if (fixData.lat === undefined || fixData.lon === undefined) return;
    if (isNaN(fixData.lat) || isNaN(fixData.lon)) return;

    // 1. Kalman Smoothing
    const smoothed = this.core.smoother.process(fixData.lat, fixData.lon, fixData.timestamp || Date.now());
    
    const displayData = {
        ...fixData,
        lat: smoothed.lat,
        lon: smoothed.lon,
        altitude: fixData.altitude || 0,
        speedKmh: fixData.speedMs ? fixData.speedMs * 3.6 : (fixData.speedKmh || 0),
        heading: fixData.heading || 0,
        satellites: fixData.satellites || 0,
        fix: fixData.fix || 1
    };

    this.state.currentGPS = displayData;

    // 2. Update Map & Dashboard
    this.ui.map.updateGpsPosition(displayData.lat, displayData.lon, displayData.heading, displayData.hdop);
    this.ui.dashboard.update(displayData);

    // 3. Navigation Engine (if active)
    if (this.state.navType === 'navigating' && this.state.activeRouteData) {
       this.updateNavigationPhase(displayData);
    }
  }

  // ============== ROUTING (ONLINE) ==============

  refreshMapWaypoints() {
    this.ui.map.updateWaypoints(this.ui.planner.waypoints);
  }

  async computeRouteOnline(waypoints) {
    try {
        toast.info("Fetching Route", "Querying routing engine...");
        
        // 1. Use OSRM public API for robust, global pathfinding
        const coordsStr = waypoints.map(wp => `${wp.lon},${wp.lat}`).join(';');
        // Feature 8: Multi-mode routing via OSRM profiles
        let profile = this.state.routingProfile || 'driving';
        let usedFallback = false;
        let data;

        // Try the selected profile first; if cycling/walking fails, fall back to driving
        const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${coordsStr}?overview=full&geometries=geojson`;
        const res = await fetch(osrmUrl);
        data = await res.json();

        if (data.code !== 'Ok' && profile !== 'driving') {
            // The public OSRM server may not support cycling/walking — fall back to driving
            toast.warning("Profile Unavailable", `${profile} routing not available on this server. Falling back to driving.`);
            const fallbackUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
            const fallbackRes = await fetch(fallbackUrl);
            data = await fallbackRes.json();
            usedFallback = true;
        }

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            throw new Error(data.message || "Routing engine could not find a path between these points.");
        }

        const route = data.routes[0];
        
        // OSRM geojson returns coordinates as [lon, lat]
        const pathCoords = route.geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
        
        // 2. Generate Turns using our custom bearing engine for the demo
        const instructions = generateTurnInstructions(pathCoords, CONFIG.minTurnAngle);

        // Feature 8: Calculate time estimate based on selected routing profile
        const profileSpeeds = { driving: 40, cycling: 15, walking: 5 };
        const effectiveProfile = usedFallback ? 'driving' : this.state.routingProfile;
        const avgKmh = profileSpeeds[effectiveProfile] || 40;
        const timeSeconds = (route.distance / 1000) / avgKmh * 3600;

        this.state.activeRouteData = {
            distance: route.distance,
            duration: route.duration || timeSeconds,
            pathCoords: pathCoords,
            instructions: instructions,
            graph: null // Will be populated during offline download phase
        };

        // Render line
        this.ui.map.setRoute(pathCoords);
        this.ui.planner.setSnappedRoute(this.state.activeRouteData);
        
        toast.success("Route Found", `${formatDistance(route.distance)}${usedFallback ? ' (driving fallback)' : ''}`);

        // Update Simulator if running
        if (this.state.useSimulator && this.core.simulator.intervalId) {
             this.core.simulator.setRoute(pathCoords);
        }

    } catch (e) {
        console.error(e);
        toast.error("Routing Error", e.message);
    }
  }

  // ============== OFFLINE DOWNLOAD ==============

  async downloadForOffline(routeData, originalWaypoints, userRouteName = null) {
     this.ui.download.show();
     
     try {
         const routeId = `route_${Date.now()}`;
         
         // 1. Fetch & Save Graph from Overpass
         this.ui.download.updateProgress('Fetching Offline Graph', 'Contacting Overpass API...', 5);
         // Grab a bounding box padded by ~300m for map-matching
         const osmData = await fetchRoadsForRoute(routeData.pathCoords, 0.003);
         const fullGraph = buildGraph(osmData);
         const compacted = compactGraph(fullGraph);

         this.ui.download.updateProgress('Saving Road Network', 'Deduplicating nodes...', 15);
         await saveGraph(routeId, compacted);

         // 2. Save Instructions
         this.ui.download.updateProgress('Saving Turns', 'Pre-computing maneuvers...', 20);
         await saveInstructions(routeId, routeData.instructions);

         // 3. Download Tiles
         this.ui.download.updateProgress('Preparing Tiles', 'Calculating bounding box...', 30);
         
         // Calculate bounds from coordinates
         let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
         routeData.pathCoords.forEach(c => {
             s = Math.min(s, c.lat); w = Math.min(w, c.lon);
             n = Math.max(n, c.lat); e = Math.max(e, c.lon);
         });
         
         // Add small padding to bounds (approx 200m)
         const pad = 0.002;
         const bounds = { south: s-pad, west: w-pad, north: n+pad, east: e+pad };
         
         const tilesNeeded = getTilesForRoute(bounds, CONFIG.offlineZoomLevels);

         // Warn user if download is very large (> 500 tiles)
         if (tilesNeeded.length > 500) {
             this.ui.download.hide();
             const sizeEstimate = estimateDownloadSize(tilesNeeded.length);
             const proceed = confirm(
                 `This route requires ${tilesNeeded.length} map tiles (~${sizeEstimate}).\n` +
                 `Large downloads may take a while and use significant storage.\n\n` +
                 `Continue with download?`
             );
             if (!proceed) {
                 toast.info('Download Cancelled', 'You can try a shorter route or reduce zoom levels.');
                 return;
             }
             this.ui.download.show();
             this.ui.download.updateProgress('Preparing Tiles', `${tilesNeeded.length} tiles to download...`, 30);
         }
         
         // Feature 12: Show tile preview grid on the map
         this.ui.map.showTilePreview(tilesNeeded);
         
         await downloadTiles(tilesNeeded, routeId, (downloaded, total) => {
             const progress = 30 + (downloaded / total) * 60;
             this.ui.download.updateProgress(
                 'Downloading Map Tiles', 
                 `${downloaded} / ${total} tiles (${estimateDownloadSize(total)})`, 
                 progress
             );
             // Feature 12: Update tile preview as tiles download
             this.ui.map.updateTilePreviewProgress(downloaded, total);
         });

         // Feature 12: Remove tile preview grid
         this.ui.map.clearTilePreview();

         // 4. Route name: use user-provided name, or reverse-geocode endpoints
         let routeName = userRouteName || `Route via ${originalWaypoints.length} points`;
         if (!userRouteName) {
             this.ui.download.updateProgress('Naming Route', 'Reverse-geocoding endpoints...', 92);
             try {
                 const startPt = originalWaypoints[0];
                 const endPt = originalWaypoints[originalWaypoints.length - 1];
                 const [startRes, endRes] = await Promise.all([
                     fetch(`https://nominatim.openstreetmap.org/reverse?lat=${startPt.lat}&lon=${startPt.lon}&format=json&zoom=16`, { headers: { 'Accept-Language': 'en', 'User-Agent': 'TrailSync/1.0' }}),
                     fetch(`https://nominatim.openstreetmap.org/reverse?lat=${endPt.lat}&lon=${endPt.lon}&format=json&zoom=16`, { headers: { 'Accept-Language': 'en', 'User-Agent': 'TrailSync/1.0' }}),
                 ]);
                 const [startData, endData] = await Promise.all([startRes.json(), endRes.json()]);
                 const startName = startData.address?.suburb || startData.address?.village || startData.address?.city || startData.display_name?.split(',')[0] || 'Start';
                 const endName = endData.address?.suburb || endData.address?.village || endData.address?.city || endData.display_name?.split(',')[0] || 'Destination';
                 if (startName !== endName) {
                     routeName = `${startName} → ${endName}`;
                 } else {
                     routeName = `Loop at ${startName}`;
                 }
             } catch (geocodeErr) {
                 console.warn('Reverse geocoding failed, using default name:', geocodeErr);
             }
         }

         // Feature 14: Fetch and cache POIs along the route corridor
         this.ui.download.updateProgress('Caching POIs', 'Downloading nearby places...', 94);
         try {
             const poiData = await fetchPOIsForRoute(routeData.pathCoords, 0.003);
             if (poiData && poiData.length > 0) {
                 await savePOIs(routeId, poiData);
             }
         } catch (poiErr) {
             console.warn('POI caching failed (non-critical):', poiErr);
         }

         // 5. Save Route Record
         this.ui.download.updateProgress('Finalizing', 'Saving metadata...', 95);
         
         await saveRoute({
             id: routeId,
             name: routeName,
             distance: routeData.distance,
             pathCoords: routeData.pathCoords,
             bounds: bounds
         });

         this.ui.download.updateProgress('Complete', 'Ready for offline use!', 100);
         setTimeout(() => {
             this.ui.download.hide();
             toast.success("Download Complete", "Route is ready for offline navigation.");
             // Switch to offline tab
             this.ui.shell.switchMode('offline');
         }, 1000);

     } catch (e) {
         console.error(e);
         this.ui.download.hide();
         toast.error("Download Failed", e.message);
     }
  }

  // ============== NAVIGATION ENGINE ==============

  async startNavigation(routeRecord) {
      this.ui.shell.switchMode('offline'); // Ensures map layer swaps
      this.state.navType = 'navigating';
      this.state.hasArrived = false;
      
      try {
          // Load dependencies from DB
          const graph = await getGraph(routeRecord.id);
          const instructions = await getInstructions(routeRecord.id);

          if (!graph || !instructions) throw new Error("Missing offline data for this route.");

          // Init routing engines
          this.core.pathfinder.loadGraph(graph);
          this.core.matcher.loadGraph(graph);

          this.state.activeRouteData = {
              id: routeRecord.id,
              name: routeRecord.name,
              distance: routeRecord.distance,
              pathCoords: routeRecord.pathCoords,
              instructions: instructions,
              graph: graph
          };

          this.state.instructionIndex = 0;
          this.state.tripStartTime = Date.now();
          this.state.tripDistanceMeters = 0;
          this.state.lastPosition = null;
          
          // UI Setup
          this.ui.map.setRoute(routeRecord.pathCoords);
          // Hide waypoints on nav view
          this.ui.map.layers.waypoints.clearLayers();
          
          this.ui.hud.show();
          this.ui.hud.updateInstruction(instructions[0], instructions[0].distanceToNext || 0);

          // Simulator hooks
          if (this.state.useSimulator) {
              this.core.simulator.stop();
              // In real scenario, ESP32 continues via local AP.
              // For demo simulator, jump to start.
              this.core.simulator.setRoute(routeRecord.pathCoords);
              this.core.simulator.start();
          }

          toast.info("Navigation Started", "Following offline route.");

          // Collapse sidebar on mobile to maximize map area during navigation
          this.ui.shell.collapseMobileSheet();

      } catch (e) {
          console.error(e);
          toast.error("Start Failed", "Could not load offline route data.");
          await this.stopNavigation();
      }
  }

  async stopNavigation() {
      // Feature 22: Record trip stats if we traveled some distance
      if (this.state.navType === 'navigating' && this.state.activeRouteData && this.state.tripStartTime) {
          const distance = this.state.tripDistanceMeters || 0;
          const duration = (Date.now() - this.state.tripStartTime) / 1000;
          if (distance > 100 || duration > 30) {
              try {
                  await saveTrip({
                      routeId: this.state.activeRouteData.id || 'unknown',
                      routeName: this.state.activeRouteData.name || 'Offline Route',
                      distanceMeters: distance,
                      durationSeconds: duration
                  });
                  this.ui.tripHistory.render();
                  toast.success("Trip Recorded", `Saved to your history log.`);
              } catch (e) {
                  console.error('Failed to save trip', e);
              }
          }
      }

      this.state.navType = 'planning';
      this.state.activeRouteData = null;
      this.state.instructionIndex = 0;
      this.state.offRouteCounter = 0;
      this.state.isRerouting = false;
      this.state.speedAlertActive = false;
      this.core.voice.reset(); // Feature 7: Reset voice state
      this.ui.hud.hide();
      this.ui.hud.hideSpeedAlert(); // Feature 10: Clear speed alert
      this.ui.map.clearRoute();
      if(this.state.useSimulator && !this.ui.planner.waypoints.length) {
          this.core.simulator.stop();
      }
  }

  updateNavigationPhase(gpsData) {
      if (this.state.hasArrived) return;

      const { lat, lon, heading, speedKmh } = gpsData;
      const { pathCoords, instructions, graph } = this.state.activeRouteData;
      
      // Feature 22: Update trip distance traveled
      if (this.state.lastPosition) {
          const d = haversineDistance(this.state.lastPosition.lat, this.state.lastPosition.lon, lat, lon);
          if (d > 1) { // Add some noise tolerance
              this.state.tripDistanceMeters += d;
          }
      }
      this.state.lastPosition = { lat, lon };

      // 1. Map Matching
      const match = this.core.matcher.match(lat, lon);
      
      // Fix 3: Implement real off-route rerouting with sustained-offroute counter
      if (match.isOffRoute) {
          this.state.offRouteCounter++;
          this.ui.hud.showWarning();
          
          // After 5 consecutive off-route ticks (~5 seconds), attempt reroute
          if (this.state.offRouteCounter >= 5 && !this.state.isRerouting && graph) {
              this.state.isRerouting = true;
              this.ui.hud.showRerouting();
              
              // Find the destination (last instruction point)
              const destInst = instructions[instructions.length - 1];
              const destNode = findNearestNode({ nodes: graph.nodes, edges: graph.edges }, destInst.lat, destInst.lon);
              const currentNode = findNearestNode({ nodes: graph.nodes, edges: graph.edges }, lat, lon);
              
              if (destNode && currentNode) {
                  const result = this.core.pathfinder.findPath(currentNode.id, destNode.id);
                  
                  if (result.found && result.path.length > 1) {
                      // Convert path back to coordinates
                      const newCoords = this.core.pathfinder.pathToCoordinates(result.path);
                      const newInstructions = generateTurnInstructions(newCoords, CONFIG.minTurnAngle);
                      
                      // Update active route
                      this.state.activeRouteData.pathCoords = newCoords;
                      this.state.activeRouteData.instructions = newInstructions;
                      this.state.activeRouteData.distance = result.distance;
                      this.state.instructionIndex = 0;
                      
                      // Update map
                      this.ui.map.setRoute(newCoords);
                      this.ui.map.layers.traveled.setLatLngs([]);
                      
                      // Update simulator if running
                      if (this.state.useSimulator) {
                          this.core.simulator.setRoute(newCoords);
                      }
                      
                      toast.success('Rerouted', 'New route calculated.');
                  } else {
                      toast.warning('Reroute Failed', 'Could not find an alternative path. Return to original route.');
                  }
              }
              
              this.state.offRouteCounter = 0;
              this.state.isRerouting = false;
              this.ui.hud.hideWarning();
              this.core.voice.announceReroute(); // Feature 7: Announce reroute
          }
          return;
      } else {
          this.state.offRouteCounter = 0;
          this.ui.hud.hideWarning();
      }

      // Fix 1: Traveled path rendering — find nearest point on polyline by proximity
      let minDist = Infinity;
      let matchedIndex = -1;
      for (let i = 0; i < pathCoords.length; i++) {
          const d = haversineDistance(lat, lon, pathCoords[i].lat, pathCoords[i].lon);
          if (d < minDist) {
              minDist = d;
              matchedIndex = i;
          }
      }
      if (matchedIndex > 0) {
          this.ui.map.layers.traveled.setLatLngs(pathCoords.slice(0, matchedIndex + 1).map(p => [p.lat, p.lon]));
      }

      // 3. Instruction tracking
      const nextIdx = findCurrentInstruction(instructions, lat, lon, this.state.instructionIndex);
      if (nextIdx !== this.state.instructionIndex) {
          this.state.instructionIndex = nextIdx;
      }

      const activeInst = instructions[this.state.instructionIndex];
      const distToTurn = haversineDistance(lat, lon, activeInst.lat, activeInst.lon);

      // Check arrival
      if (activeInst.maneuver === MANEUVER.ARRIVE && distToTurn < CONFIG.arrivalThreshold) {
          this.state.hasArrived = true;
          this.ui.hud.showArrival();
          if (this.state.useSimulator) this.core.simulator.stop();
          return;
      }

      // Update HUD
      this.ui.hud.updateInstruction(activeInst, distToTurn);
      
      // Calculate total remaining distance
      let remTotal = distToTurn;
      for (let i = this.state.instructionIndex + 1; i < instructions.length; i++) {
          remTotal += (instructions[i-1].distanceToNext || 0);
      }
      
      // Fix 4: Calculate ETA from remaining distance and current speed
      let etaSeconds = 0;
      if (speedKmh > 1) {
          etaSeconds = (remTotal / 1000) / speedKmh * 3600;
      }
      
      this.ui.hud.updateTelemetry(speedKmh, remTotal, etaSeconds);

      // Feature 7: Voice turn announcements
      this.core.voice.announce(activeInst, distToTurn, this.state.instructionIndex);

      // Feature 7: Announce arrival

      // Feature 10: Speed alerts
      if (this.state.speedLimitKmh > 0 && speedKmh > this.state.speedLimitKmh) {
          if (!this.state.speedAlertActive) {
              this.state.speedAlertActive = true;
              this.ui.hud.showSpeedAlert(speedKmh, this.state.speedLimitKmh);
          }
      } else {
          if (this.state.speedAlertActive) {
              this.state.speedAlertActive = false;
              this.ui.hud.hideSpeedAlert();
          }
      }
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
    try {
        window.app = new NavigationApp();
    } catch (err) {
        console.error('[TrailSync] Fatal initialization error:', err);
        document.getElementById('app').innerHTML = `
            <div style="padding:40px;text-align:center;font-family:Inter,sans-serif;">
                <h2>Failed to start TrailSync</h2>
                <p style="color:#666;">${err.message}</p>
                <button onclick="location.reload()" style="margin-top:16px;padding:8px 24px;cursor:pointer;">Reload</button>
            </div>`;
    }
});
