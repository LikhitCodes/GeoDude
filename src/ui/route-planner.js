/**
 * Route Planner UI logic
 */
import { formatDistance, formatTime } from '../utils/helpers.js';
import { toast } from './toast.js';

export class RoutePlanner {
  constructor() {
    this.container = document.getElementById('route-planner-container');
    this.waypoints = [];
    this.routeData = null; // Stored snapped route object

    this.onAddWaypoint = null;
    this.onRemoveWaypoint = null;
    this.onReorderWaypoints = null;  // Feature 9: drag-and-drop reorder
    this.onSnapToRoads = null;
    this.onDownload = null;
    this.onSearchSelect = null;
    this.onProfileChange = null;     // Feature 8: routing profile change

    // Feature 9: drag state
    this._dragSrcIndex = null;

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
          Route Planner
        </div>

        <div class="search-filters" style="display: flex; gap: 8px; margin-bottom: 8px;">
           <input type="text" id="rp-state" class="input" style="font-size: 12px;" placeholder="State (Optional)" autocomplete="off">
           <input type="text" id="rp-city" class="input" style="font-size: 12px;" placeholder="City (Optional)" autocomplete="off">
        </div>

        <div class="search-container">
            <input type="text" id="rp-search" class="input" placeholder="Search places..." autocomplete="off">
            <div id="rp-search-results" class="search-results"></div>
        </div>

        <!-- Feature 8: Routing profile selector -->
        <div class="route-profile-selector">
            <button class="route-profile-btn active" data-profile="driving" title="Driving">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h2m10 0h2M7 7h10l1.5 5H5.5L7 7zM5 12h14v5a1 1 0 01-1 1H6a1 1 0 01-1-1v-5z"/></svg>
                Car
            </button>
            <button class="route-profile-btn" data-profile="cycling" title="Cycling">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 100-2 1 1 0 000 2zM12 17.5V14l-3-3 4-3 2 3h3"/></svg>
                Bike
            </button>
            <button class="route-profile-btn" data-profile="walking" title="Walking">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="2"/><path d="M10 22l4-11m-2 5l-4-4 1-4 4 2 3-2"/></svg>
                Walk
            </button>
        </div>

        <div id="rp-empty" class="text-xs text-muted text-center py-4" style="padding: 20px 0; border: 1px dashed var(--border-medium); border-radius: var(--radius-md);">
          Search for a place or<br>click on the map.
        </div>

        <div id="rp-waypoint-list" class="waypoint-list" style="display:none;"></div>

        <div id="rp-controls" class="flex-col gap-2 mt-4" style="display:none; margin-top:16px;">
            <button id="rp-btn-snap" class="btn btn-secondary w-full" style="width: 100%;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                Snap to Roads
            </button>
            <button id="rp-btn-clear" class="btn btn-ghost w-full">Clear All</button>
        </div>

        <div id="rp-summary" class="route-summary" style="display:none;">
            <div class="route-summary-row">
                <span class="route-summary-label">Distance</span>
                <span id="rp-summary-dist" class="route-summary-value">0 km</span>
            </div>
            <div class="route-summary-row">
                <span class="route-summary-label">Est. Time</span>
                <span id="rp-summary-time" class="route-summary-value">0 min</span>
            </div>
            <div class="route-summary-row">
                <span class="route-summary-label">Turns</span>
                <span id="rp-summary-turns" class="route-summary-value">0</span>
            </div>

            <button id="rp-btn-download" class="btn btn-primary w-full mt-3" style="width: 100%; margin-top: 12px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                Download for Offline
            </button>
        </div>
      </div>
    `;

    this.elEmpty = document.getElementById('rp-empty');
    this.elList = document.getElementById('rp-waypoint-list');
    this.elControls = document.getElementById('rp-controls');
    this.elSummary = document.getElementById('rp-summary');
    this.btnSnap = document.getElementById('rp-btn-snap');
    this.btnClear = document.getElementById('rp-btn-clear');
    this.btnDownload = document.getElementById('rp-btn-download');
    this.elSearch = document.getElementById('rp-search');
    this.elSearchResults = document.getElementById('rp-search-results');
    this.elState = document.getElementById('rp-state');
    this.elCity = document.getElementById('rp-city');

    // Search Logic
    let searchTimeout;
    this.elSearch.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length < 3) {
            this.elSearchResults.style.display = 'none';
            return;
        }
        searchTimeout = setTimeout(() => this.performSearch(query), 500);
    });

    // Close search results on outside click
    document.addEventListener('click', (e) => {
        if (!this.elSearch.contains(e.target) && !this.elSearchResults.contains(e.target)) {
            this.elSearchResults.style.display = 'none';
        }
    });

    // Bind basic events
    this.btnClear.addEventListener('click', () => {
        this.clearWaypoints();
    });

    this.btnSnap.addEventListener('click', () => {
        if(this.onSnapToRoads) this.onSnapToRoads(this.waypoints);
    });

    this.btnDownload.addEventListener('click', () => {
        if(this.onDownload && this.routeData) {
            this.onDownload(this.routeData, this.waypoints); // Pass route and original waypoints
        } else {
             toast.info("No Route", "Please snap to roads first.");
        }
    });

    // Feature 8: Routing profile buttons
    const profileBtns = document.querySelectorAll('.route-profile-btn');
    profileBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            profileBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const profile = btn.dataset.profile;
            if (this.onProfileChange) this.onProfileChange(profile);
        });
    });
  }

  addWaypoint(lat, lon) {
    this.waypoints.push({ lat, lon });
    this.updateUI();
    if(this.onAddWaypoint) this.onAddWaypoint(lat, lon, this.waypoints.length - 1);
  }

  removeWaypoint(index) {
    this.waypoints.splice(index, 1);
    this.routeData = null; // Clear snapped route on modification
    this.updateUI();
    if(this.onRemoveWaypoint) this.onRemoveWaypoint(index);
  }

  clearWaypoints() {
      const count = this.waypoints.length;
      for (let i = count - 1; i >= 0; i--) {
          this.removeWaypoint(i);
      }
      this.routeData = null;
      this.elSearch.value = '';
  }

  async performSearch(query) {
      const state = this.elState.value.trim();
      const city = this.elCity.value.trim();

      if (!query) return;

      this.elSearch.parentElement.classList.add('loading');
      try {
          let fullQuery = query;
          if (city) fullQuery += `, ${city}`;
          if (state) fullQuery += `, ${state}`;

          const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullQuery)}&format=json&limit=5`;
          const res = await fetch(url, { headers: { 'Accept-Language': 'en' }});
          const results = await res.json();
          
          this.elSearchResults.innerHTML = '';
          if (results.length === 0) {
              this.elSearchResults.innerHTML = '<div style="padding: 8px; font-size: 11px; color: var(--text-muted)">No results found</div>';
          } else {
              results.forEach(r => {
                  const div = document.createElement('div');
                  div.className = 'search-result-item';
                  div.textContent = r.display_name;
                  div.addEventListener('click', () => {
                      this.elSearch.value = r.display_name.split(',')[0];
                      this.elSearchResults.style.display = 'none';
                      const lat = parseFloat(r.lat);
                      const lon = parseFloat(r.lon);
                      // Auto-add waypoint
                      this.addWaypoint(lat, lon);
                      if (this.onSearchSelect) {
                          this.onSearchSelect(lat, lon);
                      }
                  });
                  this.elSearchResults.appendChild(div);
              });
          }
          this.elSearchResults.style.display = 'block';
      } catch(e) {
          console.error('Search error', e);
      } finally {
          this.elSearch.parentElement.classList.remove('loading');
      }
  }

  setSnappedRoute(routeData) {
      this.routeData = routeData;
      
      // Update Summary UI
      document.getElementById('rp-summary-dist').textContent = formatDistance(routeData.distance);
      // Use OSRM duration if available, otherwise estimate from routing profile
      let timeSeconds;
      if (routeData.duration) {
          timeSeconds = routeData.duration;
      } else {
          const profileSpeeds = { driving: 40, cycling: 15, walking: 5 };
          const activeProfile = document.querySelector('.route-profile-btn.active')?.dataset?.profile || 'driving';
          const avgKmh = profileSpeeds[activeProfile] || 40;
          timeSeconds = (routeData.distance / 1000) / avgKmh * 3600;
      }
      document.getElementById('rp-summary-time').textContent = formatTime(timeSeconds);
      
      const turns = (routeData.instructions || []).length;
      document.getElementById('rp-summary-turns').textContent = Math.max(0, turns - 2); // Exclude depart/arrive

      this.elSummary.style.display = 'block';
  }

  updateUI() {
    if (this.waypoints.length === 0) {
      this.elEmpty.style.display = 'block';
      this.elList.style.display = 'none';
      this.elControls.style.display = 'none';
      this.elSummary.style.display = 'none';
      return;
    }

    this.elEmpty.style.display = 'none';
    this.elList.style.display = 'flex';
    this.elControls.style.display = 'flex';

    // Hide summary when adding new points, force re-snap
    if(!this.routeData) {
        this.elSummary.style.display = 'none';
    }

    this.elList.innerHTML = '';
    
    this.waypoints.forEach((wp, idx) => {
      // Connectors between points
      if (idx > 0) {
          const conn = document.createElement('div');
          conn.className = 'waypoint-connector';
          this.elList.appendChild(conn);
      }

      const item = document.createElement('div');
      item.className = 'waypoint-item';
      item.setAttribute('draggable', 'true');  // Feature 9: make draggable
      item.dataset.index = idx;
      
      item.innerHTML = `
        <div class="waypoint-drag-handle" title="Drag to reorder">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
        </div>
        <div class="waypoint-number">${idx + 1}</div>
        <div class="waypoint-coords">${wp.lat.toFixed(5)}, ${wp.lon.toFixed(5)}</div>
        <button class="waypoint-remove" data-index="${idx}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      `;

      item.querySelector('button').addEventListener('click', (e) => {
        const i = parseInt(e.currentTarget.getAttribute('data-index'));
        this.removeWaypoint(i);
      });

      // Feature 9: Drag-and-drop events
      item.addEventListener('dragstart', (e) => {
        this._dragSrcIndex = idx;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', idx.toString());
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        // Clear all drag-over states
        this.elList.querySelectorAll('.waypoint-item').forEach(el => el.classList.remove('drag-over'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const fromIdx = this._dragSrcIndex;
        const toIdx = idx;
        if (fromIdx !== null && fromIdx !== toIdx) {
          // Reorder the waypoints array
          const [moved] = this.waypoints.splice(fromIdx, 1);
          this.waypoints.splice(toIdx, 0, moved);
          this.routeData = null; // Clear snapped route
          this.updateUI();
          if (this.onReorderWaypoints) this.onReorderWaypoints();
        }
        this._dragSrcIndex = null;
      });

      this.elList.appendChild(item);
    });
  }

  setLoading(isLoading) {
      if (isLoading) {
          this.btnSnap.innerHTML = `<div class="spinner spinner-sm" style="border-top-color: white"></div> Snapping...`;
          this.btnSnap.disabled = true;
          this.btnClear.disabled = true;
      } else {
          this.btnSnap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Snap to Roads`;
          this.btnSnap.disabled = false;
          this.btnClear.disabled = false;
      }
  }
}
