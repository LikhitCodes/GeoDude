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
import { toast } from './ui/toast.js';

import { WebSocketClient } from './gps/websocket-client.js';
import { GPSSimulator } from './gps/gps-simulator.js';
import { NMEAParser } from './core/nmea-parser.js';
import { GPSKalmanSmoother } from './core/kalman-filter.js';
import { MapMatcher } from './core/map-matching.js';
import { Pathfinder } from './core/pathfinder.js';
import { generateTurnInstructions, findCurrentInstruction, MANEUVER } from './core/bearing-engine.js';
import { fetchRoadsForRoute } from './data/overpass-client.js';
import { buildGraph, compactGraph } from './data/graph-builder.js';
import { getTilesForRoute, downloadTiles, estimateDownloadSize } from './data/tile-manager.js';
import { saveRoute, saveGraph, saveInstructions, getGraph, getInstructions } from './data/offline-store.js';
import { CONFIG, formatDistance } from './utils/helpers.js';
import { haversineDistance } from './core/haversine.js';

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
    };

    this.core = {
      parser: new NMEAParser(),
      smoother: new GPSKalmanSmoother(),
      matcher: new MapMatcher(),
      pathfinder: new Pathfinder(),
      simulator: new GPSSimulator(),
      websocket: new WebSocketClient(),
    };

    this.state = {
      mode: 'online', // 'online' or 'offline'
      navType: 'planning', // 'planning' or 'navigating'
      useSimulator: true,
      currentGPS: null, // Last smoothed reading
      activeRouteData: null,
      activeInstructions: null,
      instructionIndex: 0,
      hasArrived: false
    };

    // Bind UI -> App logic
    this.bindEvents();
    
    // Start with simulator by default
    this.initGPS();
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
        this.stopNavigation();
      }
    };

    // Simulator Toggle
    this.ui.shell.onToggleSimulator = () => {
      this.state.useSimulator = !this.state.useSimulator;
      this.initGPS();
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

    // Planning: List updates
    this.ui.planner.onAddWaypoint = (lat, lon) => this.refreshMapWaypoints();
    this.ui.planner.onRemoveWaypoint = () => {
        this.refreshMapWaypoints();
        this.ui.map.clearRoute(); // Clear snapped route if waypoints change
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
    this.ui.planner.onDownload = async (routeData, waypoints) => {
       await this.downloadForOffline(routeData, waypoints);
    };

    // Begin Navigation (from Offline List)
    this.ui.routeList.onNavigate = async (routeRecord) => {
        await this.startNavigation(routeRecord);
    };

    // End Navigation
    this.ui.hud.onEndNavigation = () => {
        this.stopNavigation();
        this.ui.shell.switchMode('online'); // Go back to dashboard
    };
  }

  // ============== GPS HANDLING ==============

  initGPS() {
    // Stop active
    this.core.simulator.stop();
    this.core.websocket.stop();
    this.core.smoother.reset();
    
    // Setup listeners
    const onData = (rawData) => {
      const parsed = this.core.parser.feed(rawData);
      parsed.forEach(fix => this.processGPSFix(fix));
    };

    const provider = this.state.useSimulator ? this.core.simulator : this.core.websocket;
    
    // Clean old listeners... simplistic approach for demo rebuild
    if(this._gpsDataUnsub) this._gpsDataUnsub();
    if(this._gpsStatusUnsub) this._gpsStatusUnsub();
    
    this._gpsDataUnsub = provider.onData(onData);
    this._gpsStatusUnsub = provider.onStatusChange(status => {
        this.ui.shell.updateConnectionStatus(status, this.state.useSimulator);
    });

    provider.start();
    
    // If simulator and we have a route, set it
    if (this.state.useSimulator && this.state.activeRouteData) {
       this.core.simulator.setRoute(this.state.activeRouteData.pathCoords);
    }
  }

  processGPSFix(fixData) {
    if (fixData.lat === undefined || fixData.lon === undefined) return;

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
    this.ui.map.updateGpsPosition(displayData.lat, displayData.lon, displayData.heading);
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
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
        
        const res = await fetch(osrmUrl);
        const data = await res.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
            throw new Error(data.message || "Routing engine could not find a path between these points.");
        }

        const route = data.routes[0];
        
        // OSRM geojson returns coordinates as [lon, lat]
        const pathCoords = route.geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
        
        // 2. Generate Turns using our custom bearing engine for the demo
        const instructions = generateTurnInstructions(pathCoords, CONFIG.minTurnAngle);

        this.state.activeRouteData = {
            distance: route.distance,
            pathCoords: pathCoords,
            instructions: instructions,
            graph: null // Will be populated during offline download phase
        };

        // Render line
        this.ui.map.setRoute(pathCoords);
        this.ui.planner.setSnappedRoute(this.state.activeRouteData);
        
        toast.success("Route Found", `${formatDistance(route.distance)}`);

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

  async downloadForOffline(routeData, originalWaypoints) {
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
         
         await downloadTiles(tilesNeeded, routeId, (downloaded, total) => {
             const progress = 30 + (downloaded / total) * 60;
             this.ui.download.updateProgress(
                 'Downloading Map Tiles', 
                 `${downloaded} / ${total} tiles (${estimateDownloadSize(total)})`, 
                 progress
             );
         });

         // 4. Save Route Record
         this.ui.download.updateProgress('Finalizing', 'Saving metadata...', 95);
         
         await saveRoute({
             id: routeId,
             name: `Route via ${originalWaypoints.length} points`,
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
              distance: routeRecord.distance,
              pathCoords: routeRecord.pathCoords,
              instructions: instructions,
              graph: graph
          };

          this.state.instructionIndex = 0;
          
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

      } catch (e) {
          console.error(e);
          toast.error("Start Failed", "Could not load offline route data.");
          this.stopNavigation();
      }
  }

  stopNavigation() {
      this.state.navType = 'planning';
      this.state.activeRouteData = null;
      this.state.instructionIndex = 0;
      this.ui.hud.hide();
      this.ui.map.clearRoute();
      if(this.state.useSimulator && !this.ui.planner.waypoints.length) {
          this.core.simulator.stop();
      }
  }

  updateNavigationPhase(gpsData) {
      if (this.state.hasArrived) return;

      const { lat, lon, heading, speedKmh } = gpsData;
      const { pathCoords, instructions, graph } = this.state.activeRouteData;
      
      // 1. Map Matching
      const match = this.core.matcher.match(lat, lon);
      
      if (match.isOffRoute) {
          this.ui.hud.showWarning();
          // In a full implementation, we'd wait N seconds of sustained off-route
          // then trigger this.core.pathfinder.findPath(match.nodeId, finalDestId)
          // For the demo scope, we just show warning visually.
          return;
      } else {
          this.ui.hud.hideWarning();
      }

      // 2. Traveled path rendering (grey line behind)
      // We take the pathCoords from 0 up to match.nodeId (approx)
      let matchedIndex = pathCoords.findIndex(p => p.nodeId === match.nodeId);
      if (matchedIndex > 0) {
          this.ui.map.layers.traveled.setLatLngs(pathCoords.slice(0, matchedIndex+1).map(p=>[p.lat, p.lon]));
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
      
      // Calculate total remaining
      let remTotal = distToTurn;
      for (let i = this.state.instructionIndex + 1; i < instructions.length; i++) {
          remTotal += (instructions[i-1].distanceToNext || 0);
      }
      
      this.ui.hud.updateTelemetry(speedKmh, remTotal);
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
    window.app = new NavigationApp();
});
