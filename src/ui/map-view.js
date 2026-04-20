/**
 * Leaflet Map View wrapper
 */
import L from 'leaflet';
import { createOfflineTileLayer } from '../data/tile-manager.js';

export class MapView {
  constructor(containerId) {
    this.map = L.map(containerId, {
      zoomControl: false,
      minZoom: 2
    });
    
    // Move zoom control to bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Default view (Global center)
    this.map.setView([20, 0], 3);

    // Online tile layer
    this.onlineLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      minZoom: 2,
      attribution: '© OpenStreetMap contributors',
      className: 'leaflet-green-tint'
    });

    // Offline tile layer (pulls from IndexedDB)
    this.offlineLayer = createOfflineTileLayer();

    // Layers groups
    this.layers = {
        route: L.polyline([], { color: 'var(--green-500)', weight: 6, opacity: 0.8, lineJoin: 'round' }),
        waypoints: L.layerGroup(),
        traveled: L.polyline([], { color: 'var(--stone)', weight: 6, opacity: 0.5, lineJoin: 'round' }),
    };

    // Add to map
    this.onlineLayer.addTo(this.map);
    this.layers.route.addTo(this.map);
    this.layers.traveled.addTo(this.map);
    this.layers.waypoints.addTo(this.map);

    // GPS Marker setup
    this.setupGpsMarker();

    this.onClick = null;
    this.map.on('click', (e) => {
        if(this.onClick) this.onClick(e.latlng.lat, e.latlng.lng);
    });
    
    this.isFollowing = false; // Don't auto-pan to simulator on startup; user location or flyTo enables it
    
    // Basic interaction stops auto-follow
    this.map.on('dragstart', () => { this.isFollowing = false; });

    // Add 'My Location' button
    this.addLocateButton();

    // Auto-detect user's location on startup
    this.locateUser();
  }

  /** Add a custom locate button to the map */
  addLocateButton() {
    const self = this; // Capture reference for Leaflet callback
    const LocateControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const btn = L.DomUtil.create('div', '', container);
        btn.title = 'My Location';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Center on my location');
        btn.style.cssText = `
          display:flex;align-items:center;justify-content:center;
          width:34px;height:34px;background:white;color:var(--green-600);
          border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:16px;
          user-select:none;
        `;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`;
        L.DomEvent.disableClickPropagation(container);
        btn.addEventListener('click', () => {
          self.locateUser(true);
        });
        return container;
      }
    });
    new LocateControl().addTo(this.map);
  }

  /** Locate user via browser Geolocation API with IP-based fallback */
  locateUser(flyToIt = false) {
    // Try browser geolocation first (precise, ~10m accuracy)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          this.userLocation = { lat: latitude, lon: longitude, precise: true };
          this._applyLocation(latitude, longitude, flyToIt);
        },
        () => {
          // Browser geolocation failed — use IP fallback
          this._ipGeolocate(flyToIt);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      this._ipGeolocate(flyToIt);
    }
  }

  /** IP-based geolocation fallback (works on HTTP, ~5-10km accuracy) */
  async _ipGeolocate(flyToIt = false) {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data.latitude && data.longitude) {
        this.userLocation = { lat: data.latitude, lon: data.longitude, precise: false };
        this._applyLocation(data.latitude, data.longitude, flyToIt);
      }
    } catch (err) {
      console.warn('[MapView] IP geolocation failed:', err);
    }
  }

  _applyLocation(lat, lon, flyToIt) {
    if (flyToIt) {
      this.map.flyTo([lat, lon], 14);
      this.isFollowing = true;
    } else {
      this.map.setView([lat, lon], 13);
    }
  }

  setMode(isOffline) {
      if (isOffline) {
          this.map.removeLayer(this.onlineLayer);
          this.offlineLayer.addTo(this.map);
      } else {
          this.map.removeLayer(this.offlineLayer);
          this.onlineLayer.addTo(this.map);
      }
  }

  flyTo(lat, lon, zoom = 14) {
      this.map.flyTo([lat, lon], zoom);
  }

  setupGpsMarker() {
      // Create a custom DOM element marker so we can easily rotate it with CSS
      const iconHtml = `
        <div class="gps-marker">
          <div class="gps-marker-pulse"></div>
          <div class="gps-marker-heading" id="marker-heading"></div>
          <div class="gps-marker-dot"></div>
        </div>
      `;

      const icon = L.divIcon({
          html: iconHtml,
          className: 'gps-marker-container',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
      });

      // Start hidden — don't add to map until first valid GPS fix
      this.gpsMarker = L.marker([0, 0], { icon: icon, zIndexOffset: 1000 });
      this.gpsHeadingElement = null;
      this._gpsMarkerVisible = false;

      // Feature 11: GPS Accuracy circle (also hidden initially)
      this.accuracyCircle = L.circle([0, 0], {
          radius: 10,
          color: 'var(--green-400)',
          fillColor: 'var(--green-300)',
          fillOpacity: 0.12,
          weight: 1.5,
          opacity: 0.4,
          interactive: false
      });
  }

  updateGpsPosition(lat, lon, heading = 0, hdop = null) {
      // Show marker on first valid GPS fix
      if (!this._gpsMarkerVisible) {
          this.gpsMarker.addTo(this.map);
          this.accuracyCircle.addTo(this.map);
          this._gpsMarkerVisible = true;
      }
      this.gpsMarker.setLatLng([lat, lon]);

      // Cache the heading element if not done
      if (!this.gpsHeadingElement) {
          const el = this.gpsMarker.getElement();
          if (el) this.gpsHeadingElement = el.querySelector('#marker-heading');
      }

      if (this.gpsHeadingElement) {
          this.gpsHeadingElement.style.transform = `translateX(-50%) rotate(${heading}deg)`;
      }

      // Feature 11: Update accuracy circle based on HDOP
      if (this.accuracyCircle) {
          this.accuracyCircle.setLatLng([lat, lon]);
          if (hdop !== null && hdop > 0) {
              // HDOP * ~5m gives approximate accuracy radius
              const radiusMeters = Math.max(5, Math.min(hdop * 5, 100));
              this.accuracyCircle.setRadius(radiusMeters);
              // Color changes with accuracy: green = good, yellow = ok, red = poor
              if (hdop <= 1.0) {
                  this.accuracyCircle.setStyle({ color: 'var(--green-400)', fillColor: 'var(--green-300)' });
              } else if (hdop <= 2.0) {
                  this.accuracyCircle.setStyle({ color: 'var(--olive-400)', fillColor: 'var(--olive-300)' });
              } else {
                  this.accuracyCircle.setStyle({ color: 'var(--warning)', fillColor: 'var(--warning-light)' });
              }
          }
      }

      if(this.isFollowing) {
          this.map.panTo([lat, lon], { animate: true, duration: 1 });
      }
  }

  setRoute(coordinates) {
      this.layers.route.setLatLngs(coordinates.map(c => [c.lat, c.lon]));
      if (coordinates.length > 0) {
          this.map.fitBounds(this.layers.route.getBounds(), { padding: [50, 50] });
      }
  }

  clearRoute() {
      this.layers.route.setLatLngs([]);
      this.layers.traveled.setLatLngs([]);
      this.isFollowing = true;
  }

  updateWaypoints(waypoints) {
      this.layers.waypoints.clearLayers();

      waypoints.forEach((wp, idx) => {
          const iconHtml = `
            <div class="map-waypoint-marker">
                <svg viewBox="0 0 32 32" class="map-waypoint-pin">
                   <path d="M16 2C10.48 2 6 6.48 6 12c0 7.5 10 18 10 18s10-10.5 10-18c0-5.52-4.48-10-10-10z" fill="var(--green-600)" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
                </svg>
                <div class="map-waypoint-number">${idx + 1}</div>
            </div>
          `;

          const icon = L.divIcon({
              html: iconHtml,
              className: 'custom-wp-icon',
              iconSize: [28, 36],
              iconAnchor: [14, 36]
          });

          L.marker([wp.lat, wp.lon], { icon }).addTo(this.layers.waypoints);
      });
  }

  // ============== Feature 12: Tile Download Preview ==============

  /**
   * Show tile grid preview on the map during download
   * @param {Array} tiles — array of { x, y, z }
   */
  showTilePreview(tiles) {
      // Clear previous preview
      this.clearTilePreview();

      if (!this._tilePreviewLayer) {
          this._tilePreviewLayer = L.layerGroup().addTo(this.map);
      }

      this._tilePreviewRects = [];

      // Only show preview for the lowest zoom level (largest tiles) to avoid clutter
      const minZoom = Math.min(...tiles.map(t => t.z));
      const previewTiles = tiles.filter(t => t.z === minZoom);

      previewTiles.forEach(tile => {
          const bounds = this.tileToBounds(tile.x, tile.y, tile.z);
          const rect = L.rectangle(bounds, {
              color: 'var(--green-500)',
              fillColor: 'var(--green-300)',
              fillOpacity: 0.08,
              weight: 1,
              opacity: 0.3,
              interactive: false,
              className: 'tile-preview-rect'
          });
          rect.addTo(this._tilePreviewLayer);
          this._tilePreviewRects.push(rect);
      });
  }

  /**
   * Update tile preview progress — darken downloaded tiles
   * @param {number} downloaded — tiles downloaded so far
   * @param {number} total — total tiles
   */
  updateTilePreviewProgress(downloaded, total) {
      if (!this._tilePreviewRects || this._tilePreviewRects.length === 0) return;

      // Map download progress to preview tiles
      const ratio = downloaded / total;
      const filledCount = Math.floor(ratio * this._tilePreviewRects.length);

      for (let i = 0; i < this._tilePreviewRects.length; i++) {
          if (i < filledCount) {
              this._tilePreviewRects[i].setStyle({
                  fillColor: 'var(--green-500)',
                  fillOpacity: 0.2,
                  color: 'var(--green-600)',
                  opacity: 0.5,
              });
          }
      }
  }

  /**
   * Remove tile preview from map
   */
  clearTilePreview() {
      if (this._tilePreviewLayer) {
          this._tilePreviewLayer.clearLayers();
      }
      this._tilePreviewRects = [];
  }

  /**
   * Convert tile coordinates to lat/lon bounds
   */
  tileToBounds(x, y, z) {
      const n = Math.pow(2, z);
      const lonLeft = (x / n) * 360 - 180;
      const lonRight = ((x + 1) / n) * 360 - 180;
      const latTop = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180 / Math.PI;
      const latBottom = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180 / Math.PI;
      return [[latBottom, lonLeft], [latTop, lonRight]];
  }
}
