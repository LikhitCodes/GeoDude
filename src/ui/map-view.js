/**
 * Leaflet Map View wrapper
 */
import L from 'leaflet';
import { createOfflineTileLayer } from '../data/tile-manager.js';

export class MapView {
  constructor(containerId) {
    const indiaBounds = L.latLngBounds(
        L.latLng(6.4626999, 68.1097),
        L.latLng(35.513327, 97.3953587)
    );

    this.map = L.map(containerId, {
      zoomControl: false,
      maxBounds: indiaBounds,
      maxBoundsViscosity: 1.0,
      minZoom: 5
    });
    
    // Move zoom control to bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Default view (approx center of India)
    this.map.setView([20.5937, 78.9629], 5);

    // Online tile layer
    this.onlineLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      minZoom: 5,
      bounds: indiaBounds,
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
    
    this.isFollowing = true;
    
    // Basic interaction stops auto-follow
    this.map.on('dragstart', () => { this.isFollowing = false; });
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

      // Default hidden position
      this.gpsMarker = L.marker([0, 0], { icon: icon, zIndexOffset: 1000 }).addTo(this.map);
      this.gpsHeadingElement = null; // We cache this when first rendered
  }

  updateGpsPosition(lat, lon, heading = 0) {
      this.gpsMarker.setLatLng([lat, lon]);

      // Cache the heading element if not done
      if (!this.gpsHeadingElement) {
          const el = this.gpsMarker.getElement();
          if (el) this.gpsHeadingElement = el.querySelector('#marker-heading');
      }

      if (this.gpsHeadingElement) {
          this.gpsHeadingElement.style.transform = `translateX(-50%) rotate(${heading}deg)`;
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
}
