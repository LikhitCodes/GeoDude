/**
 * App Shell UI logic (sidebar, mode switching, etc.)
 */

export class AppShell {
  constructor() {
    this.container = document.getElementById('app');
    this.render();
    // UI Elements
    this.btnOnlineMode = document.getElementById('btn-online-mode');
    this.btnOfflineMode = document.getElementById('btn-offline-mode');
    this.panelDashboard = document.getElementById('panel-dashboard');
    this.panelRouteList = document.getElementById('panel-route-list');
    
    // Status Elements
    this.gpsIndicator = document.getElementById('gps-indicator');
    this.gpsStatusText = document.getElementById('gps-status-text');
    this.btnToggleSim = document.getElementById('btn-toggle-sim');
    this.simSpeedContainer = document.getElementById('sim-speed-container');

    // Callbacks
    this.onModeChange = null;
    this.onToggleSimulator = null;
    this.onSpeedChange = null;

    this.currentMode = 'online';

    // Feature 21: Restore dark mode preference from localStorage
    if (localStorage.getItem('trailsync-dark-mode') === 'true') {
      document.body.classList.add('theme-dark');
    }

    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-layout">
        <div class="sidebar">
          
          <div class="app-header">
            <div class="app-logo">
              <svg class="app-logo-icon" viewBox="0 0 32 32">
                <defs>
                  <linearGradient id="pin-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--green-400)"/>
                    <stop offset="100%" stop-color="var(--green-600)"/>
                  </linearGradient>
                </defs>
                <path d="M16 2C10.48 2 6 6.48 6 12c0 7.5 10 18 10 18s10-10.5 10-18c0-5.52-4.48-10-10-10z" fill="url(#pin-grad)"/>
                <circle cx="16" cy="12" r="4" fill="var(--bg-card)"/>
              </svg>
              <div class="app-logo-text">TrailSync <span class="app-logo-sub">Nav</span></div>
            </div>
            
            <div class="header-controls" style="display: flex; align-items: center; gap: 8px;">
              <div class="gps-source-selector" id="btn-toggle-sim" style="cursor:pointer">
                <div id="gps-indicator" class="gps-source-dot disconnected"></div>
                <div id="gps-status-text" class="gps-source-status text-muted">Waiting...</div>
              </div>
              <button class="btn btn-ghost btn-icon btn-sm" id="btn-dark-mode" title="Toggle Dark Mode">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              </button>
            </div>
          </div>

          <div class="sidebar-tabs">
            <button class="sidebar-tab active" id="btn-online-mode">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20"/><path d="M2 12h20"/></svg>
              Dashboard
            </button>
            <button class="sidebar-tab" id="btn-offline-mode">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.5 10.675a2 2 0 00-2.828-2.828M7.387 7.388a6 6 0 00-2.828 8.485M12 12l2.828 2.828M16.243 16.243a6 6 0 008.485-8.485"/></svg>
              Offline Routes
            </button>
          </div>

            <div class="sidebar-content" id="panel-dashboard">
            <!-- Telemetry Container -->
            <div id="telemetry-container"></div>
            
            <!-- Feature 22: Trip History Container -->
            <div id="trip-history-container"></div>

            <div class="divider"></div>

            <!-- Route Planner Container -->
            <div id="route-planner-container"></div>

            <!-- Simulation Controls (Hidden by default) -->
            <div id="sim-speed-container" class="sim-controls" style="display:none; margin-top:20px;">
                <span class="text-xs font-semibold text-muted" style="margin-right:auto">SIM SPEED</span>
                <button class="sim-speed-btn active" data-speed="1">1x</button>
                <button class="sim-speed-btn" data-speed="2">2x</button>
                <button class="sim-speed-btn" data-speed="5">5x</button>
                <button class="sim-speed-btn" data-speed="10">10x</button>
            </div>
          </div>

          <div class="sidebar-content" id="panel-route-list" style="display: none;">
             <div class="sidebar-section">
                <div class="sidebar-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Downloaded Maps
                </div>
                <div id="route-list-container"></div>
             </div>
          </div>

        </div>

        <div class="map-container">
          <div id="map"></div>
          <div id="nav-hud-container"></div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this.btnOnlineMode.addEventListener('click', () => this.switchMode('online'));
    this.btnOfflineMode.addEventListener('click', () => this.switchMode('offline'));

    this.btnToggleSim.addEventListener('click', () => {
      if (this.onToggleSimulator) this.onToggleSimulator();
    });

    document.getElementById('btn-dark-mode').addEventListener('click', () => {
      document.body.classList.toggle('theme-dark');
      const isDark = document.body.classList.contains('theme-dark');
      localStorage.setItem('trailsync-dark-mode', isDark.toString());
      if (this.onToggleDarkMode) this.onToggleDarkMode(isDark);
    });

    const simBtns = document.querySelectorAll('.sim-speed-btn');
    simBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            simBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            if (this.onSpeedChange) {
                this.onSpeedChange(parseInt(e.target.dataset.speed, 10));
            }
        });
    });
  }

  switchMode(mode) {
    if (this.currentMode === mode) return;
    this.currentMode = mode;

    if (mode === 'online') {
      this.btnOnlineMode.classList.add('active');
      this.btnOfflineMode.classList.remove('active');
      this.panelDashboard.style.display = 'block';
      this.panelRouteList.style.display = 'none';
    } else {
      this.btnOfflineMode.classList.add('active');
      this.btnOnlineMode.classList.remove('active');
      this.panelDashboard.style.display = 'none';
      this.panelRouteList.style.display = 'block';
    }

    if (this.onModeChange) this.onModeChange(mode);
  }

  updateConnectionStatus(status, isSimulator = false) {
    this.gpsIndicator.className = 'gps-source-dot'; // reset
    if (status === 'connected') {
        if(isSimulator) {
            this.gpsIndicator.classList.add('simulated');
            this.gpsStatusText.textContent = 'Simulated GPS';
            this.gpsStatusText.style.color = "var(--olive-300)";
            this.simSpeedContainer.style.display = 'flex';
        } else {
            this.gpsIndicator.classList.add('connected');
            this.gpsStatusText.textContent = 'ESP32 Connected';
            this.gpsStatusText.style.color = "var(--green-300)";
            this.simSpeedContainer.style.display = 'none';
        }
    } else {
        this.gpsIndicator.classList.add('disconnected');
        this.gpsStatusText.textContent = 'Disconnected';
        this.gpsStatusText.style.color = "var(--text-muted)";
        this.simSpeedContainer.style.display = 'none';
    }
  }
}
