/**
 * Telemetry Dashboard Panel
 */

export class DashboardPanel {
  constructor() {
    this.container = document.getElementById('telemetry-container');
    this.render();
    
    // DOM references for fast updates
    this.elSpeed = document.getElementById('tlm-speed');
    this.elSpeedFill = document.getElementById('tlm-speed-fill');
    this.elLat = document.getElementById('tlm-lat');
    this.elLon = document.getElementById('tlm-lon');
    this.elAlt = document.getElementById('tlm-alt');
    this.elSat = document.getElementById('tlm-sat');
    this.elFix = document.getElementById('tlm-fix');
    this.elFixLabel = document.getElementById('tlm-fix-label');
    this.elHeadingLabel = document.getElementById('tlm-heading-label');
    this.elCompassNeedle = document.getElementById('tlm-compass-needle');
    this.bars = document.querySelectorAll('.sat-bar');

    // Smoothing state
    this.lastSpeed = 0;
  }

  render() {
    this.container.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Live Telemetry
        </div>
        
        <div class="telemetry-grid">
          
          <!-- Speed Card (Full Width) -->
          <div class="telemetry-card full-width">
            <div class="telemetry-label">Speed</div>
            <div class="speed-display">
              <div class="speed-arc-container">
                <svg class="speed-arc" viewBox="0 0 100 100">
                  <circle class="speed-arc-bg" cx="50" cy="50" r="45" stroke-dasharray="212 283"></circle>
                  <circle id="tlm-speed-fill" class="speed-arc-fill" cx="50" cy="50" r="45" stroke-dasharray="0 283"></circle>
                </svg>
                <div class="speed-value-center">
                  <div id="tlm-speed" class="speed-number">0.0</div>
                  <div class="speed-unit">km/h</div>
                </div>
              </div>
              <div class="flex-col gap-1 pl-4 border-l border-[var(--border-light)]" style="padding-left:15px; border-left:1px solid var(--border-light)">
                  <div class="flex items-center gap-2">
                       <div class="compass">
                          <div class="compass-label compass-n">N</div>
                          <div class="compass-label compass-s">S</div>
                          <div class="compass-label compass-e">E</div>
                          <div class="compass-label compass-w">W</div>
                          <div id="tlm-compass-needle" class="compass-needle"></div>
                      </div>
                      <div class="flex-col">
                          <span class="text-xs text-muted font-mono">HDG</span>
                          <span id="tlm-heading-label" class="font-mono font-bold text-lg">0°</span>
                      </div>
                  </div>
              </div>
            </div>
          </div>

          <!-- Position -->
          <div class="telemetry-card">
            <div class="telemetry-label">Latitude</div>
            <div id="tlm-lat" class="telemetry-value">--</div>
          </div>
          <div class="telemetry-card">
            <div class="telemetry-label">Longitude</div>
            <div id="tlm-lon" class="telemetry-value">--</div>
          </div>

          <!-- Elevation & Quality -->
          <div class="telemetry-card">
            <div class="telemetry-label">Elevation</div>
            <div class="flex items-end gap-1">
                <div id="tlm-alt" class="telemetry-value">--</div>
                <div class="card-unit">m</div>
            </div>
          </div>

          <div class="telemetry-card">
            <div class="telemetry-label">Signal</div>
            <div class="flex items-center justify-between">
                <div>
                    <div class="flex items-end gap-1">
                        <div id="tlm-sat" class="telemetry-value">0</div>
                        <div class="card-unit" style="font-family:var(--font-sans); font-size:var(--text-xs)">sats</div>
                    </div>
                    <div id="tlm-fix-label" class="text-xs text-muted font-semibold mt-1">NO FIX</div>
                </div>
                <div class="sat-bars">
                    <div class="sat-bar" style="height: 6px;"></div>
                    <div class="sat-bar" style="height: 10px;"></div>
                    <div class="sat-bar" style="height: 14px;"></div>
                    <div class="sat-bar" style="height: 18px;"></div>
                    <div class="sat-bar" style="height: 22px;"></div>
                </div>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  update(data) {
    if(!data) return;
    
    // Format coordinates
    this.elLat.textContent = data.lat ? data.lat.toFixed(6) : '--';
    this.elLon.textContent = data.lon ? data.lon.toFixed(6) : '--';
    this.elAlt.textContent = typeof data.altitude === 'number' ? data.altitude.toFixed(1) : '--';

    // Speed Animation (0 to ~120kmh mapped to dash array 0 to 212)
    const kmh = data.speedKmh || 0;
    this.elSpeed.textContent = kmh.toFixed(1);
    
    // Simple easing for visual
    this.lastSpeed += (kmh - this.lastSpeed) * 0.2;
    const maxSpeed = 100; 
    let dashOffset = 212 - (Math.min(this.lastSpeed, maxSpeed) / maxSpeed) * 212;
    this.elSpeedFill.style.strokeDasharray = `${212 - dashOffset} 283`;

    // Satellites
    const sats = data.satellites || 0;
    this.elSat.textContent = sats;
    
    // Update bars based on sats
    let activeBars = 0;
    if(sats > 0) activeBars = 1;
    if(sats > 3) activeBars = 2;
    if(sats > 5) activeBars = 3;
    if(sats > 8) activeBars = 4;
    if(sats > 10) activeBars = 5;

    this.bars.forEach((bar, idx) => {
        if(idx < activeBars) bar.classList.add('active');
        else bar.classList.remove('active');
    });

    // Fix
    const fix = data.fix || 0;
    if (fix === 0) {
        this.elFixLabel.textContent = "NO FIX";
        this.elFixLabel.style.color = "var(--danger)";
    } else if (fix === 1) {
        this.elFixLabel.textContent = "3D FIX";
        this.elFixLabel.style.color = "var(--green-600)";
    } else {
        this.elFixLabel.textContent = "DGPS";
        this.elFixLabel.style.color = "var(--green-500)";
    }

    // Heading
    const heading = data.heading || 0;
    this.elHeadingLabel.textContent = `${Math.round(heading)}°`;
    this.elCompassNeedle.style.transform = `rotate(${heading}deg)`;
  }
}
