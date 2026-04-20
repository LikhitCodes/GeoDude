/**
 * Navigation HUD (Turn-by-turn overlay)
 * Enhanced with: ETA display, voice toggle, speed alerts, speed limit selector
 */
import { formatDistance, formatTime } from '../utils/helpers.js';
import { maneuverIcon } from '../core/bearing-engine.js';

export class NavigationHUD {
  constructor(mapContainer) {
    this.container = document.createElement('div');
    this.container.className = 'nav-hud';
    this.container.style.display = 'none';
    
    mapContainer.appendChild(this.container);
    this.onEndNavigation = null;
    this.onToggleVoice = null;       // Feature 7
    this.onSpeedLimitChange = null;  // Feature 10
    
    this.voiceEnabled = true;
    
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <!-- Top Instruction -->
      <div id="hud-top" class="nav-instruction">
        <div class="nav-maneuver-icon" id="hud-icon">
          <!-- SVG icon injected here -->
        </div>
        <div class="nav-instruction-text">
          <div id="hud-dist" class="nav-distance-to-turn">--</div>
          <div id="hud-label" class="nav-turn-label">Preparing route</div>
          <div id="hud-street" class="nav-street-name"></div>
        </div>
        <!-- Feature 7: Voice toggle button -->
        <button id="hud-btn-voice" class="nav-voice-btn active" title="Toggle voice">
          <svg id="hud-voice-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path id="hud-voice-waves" d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>
          </svg>
        </button>
      </div>

      <!-- Warning Banner (Hidden by default) -->
      <div id="hud-warning" class="nav-warning" style="display:none; margin-top:-10px;">
         <svg class="nav-warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
         <div class="nav-warning-text flex items-center">
            Off route! <div class="recalculating"><span></span><span></span><span></span></div>
         </div>
      </div>

      <!-- Feature 10: Speed Alert Banner (Hidden by default) -->
      <div id="hud-speed-alert" class="nav-speed-alert" style="display:none;">
         <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
         <span id="hud-speed-alert-text">Speed limit exceeded!</span>
      </div>

      <!-- Bottom Status Bar -->
      <div class="mt-auto">
          <div class="nav-bottom-bar">
            <div class="nav-stat">
              <div id="hud-speed" class="nav-stat-value">0</div>
              <div class="nav-stat-label">km/h</div>
            </div>
            
            <div class="nav-stat-divider"></div>
            
            <div class="nav-stat">
              <div id="hud-rem-dist" class="nav-stat-value">--</div>
              <div class="nav-stat-label">Remaining</div>
            </div>

            <div class="nav-stat-divider"></div>

            <div class="nav-stat">
              <div id="hud-eta" class="nav-stat-value">--</div>
              <div class="nav-stat-label">ETA</div>
            </div>

            <div class="nav-stat-divider"></div>

            <!-- Feature 10: Speed limit selector -->
            <div class="nav-stat nav-speed-limit-ctrl">
              <select id="hud-speed-limit" class="nav-speed-limit-select" title="Set speed limit alert">
                <option value="0">No Limit</option>
                <option value="30">30 km/h</option>
                <option value="40">40 km/h</option>
                <option value="50">50 km/h</option>
                <option value="60">60 km/h</option>
                <option value="80">80 km/h</option>
                <option value="100">100 km/h</option>
                <option value="120">120 km/h</option>
              </select>
              <div class="nav-stat-label">Limit</div>
            </div>

            <div class="nav-stat-divider"></div>

            <button id="hud-btn-end" class="nav-end-btn">End Route</button>
          </div>
      </div>

      <!-- Arrival Screen -->
      <div id="hud-arrival" class="arrival-screen" style="display:none;">
          <div class="arrival-icon">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
          </div>
          <div class="arrival-title">You Have Arrived</div>
          <div class="arrival-subtitle">Destination is on your right</div>
          <button id="hud-btn-done" class="btn btn-secondary btn-lg" style="color:var(--charcoal)">Done</button>
      </div>
    `;

    this.elTop = document.getElementById('hud-top');
    this.elIcon = document.getElementById('hud-icon');
    this.elDist = document.getElementById('hud-dist');
    this.elLabel = document.getElementById('hud-label');
    this.elSpeed = document.getElementById('hud-speed');
    this.elRemDist = document.getElementById('hud-rem-dist');
    this.elEta = document.getElementById('hud-eta');
    this.elWarning = document.getElementById('hud-warning');
    this.elArrival = document.getElementById('hud-arrival');
    this.elSpeedAlert = document.getElementById('hud-speed-alert');
    this.elSpeedAlertText = document.getElementById('hud-speed-alert-text');
    this.elVoiceBtn = document.getElementById('hud-btn-voice');
    this.elVoiceWaves = document.getElementById('hud-voice-waves');
    this.elSpeedLimit = document.getElementById('hud-speed-limit');

    document.getElementById('hud-btn-end').addEventListener('click', () => {
        if(this.onEndNavigation) this.onEndNavigation();
    });

    document.getElementById('hud-btn-done').addEventListener('click', () => {
        if(this.onEndNavigation) this.onEndNavigation();
    });

    // Feature 7: Voice toggle
    this.elVoiceBtn.addEventListener('click', () => {
        if(this.onToggleVoice) this.onToggleVoice();
    });

    // Feature 10: Speed limit change
    this.elSpeedLimit.addEventListener('change', (e) => {
        const limit = parseInt(e.target.value, 10);
        if(this.onSpeedLimitChange) this.onSpeedLimitChange(limit);
    });
  }

  show() {
    this.container.style.display = 'flex';
    this.hideWarning();
    this.hideArrival();
    this.hideSpeedAlert();
  }

  hide() {
    this.container.style.display = 'none';
  }

  updateInstruction(maneuver, distance) {
     this.elIcon.innerHTML = maneuverIcon(maneuver.maneuver);
     this.elDist.textContent = formatDistance(distance);
     this.elLabel.textContent = maneuver.label;
     // Street name could be pulled from graph if available
  }

  updateTelemetry(speedKmh, remainingDistance, etaSeconds) {
      if(speedKmh !== undefined) {
        this.elSpeed.textContent = Math.round(speedKmh);
      }
      if(remainingDistance !== undefined) {
          this.elRemDist.textContent = formatDistance(remainingDistance);
      }
      // Fix 4: ETA display
      if(etaSeconds !== undefined && etaSeconds > 0) {
          this.elEta.textContent = formatTime(etaSeconds);
      } else {
          this.elEta.textContent = '--';
      }
  }

  showWarning() {
      this.elWarning.style.display = 'flex';
      // Reset text to "Off route!"
      const textEl = this.elWarning.querySelector('.nav-warning-text');
      if (textEl) {
          textEl.innerHTML = 'Off route! <div class="recalculating"><span></span><span></span><span></span></div>';
      }
  }

  hideWarning() {
      this.elWarning.style.display = 'none';
  }

  showArrival() {
      this.elArrival.style.display = 'flex';
  }

  hideArrival() {
      this.elArrival.style.display = 'none';
  }

  // Fix 3: Show "Rerouting..." state on the warning banner
  showRerouting() {
      this.elWarning.style.display = 'flex';
      const textEl = this.elWarning.querySelector('.nav-warning-text');
      if (textEl) {
          textEl.innerHTML = 'Rerouting<div class="recalculating"><span></span><span></span><span></span></div>';
      }
  }

  // Feature 7: Update voice button visual state
  setVoiceEnabled(enabled) {
      this.voiceEnabled = enabled;
      if (enabled) {
          this.elVoiceBtn.classList.add('active');
          this.elVoiceWaves.style.display = '';
      } else {
          this.elVoiceBtn.classList.remove('active');
          this.elVoiceWaves.style.display = 'none';
      }
  }

  // Feature 10: Speed alert
  showSpeedAlert(currentSpeed, limit) {
      this.elSpeedAlert.style.display = 'flex';
      this.elSpeedAlertText.textContent = `${Math.round(currentSpeed)} km/h — Limit is ${limit} km/h`;
      // Flash the speed display
      this.elSpeed.classList.add('speed-over-limit');
  }

  hideSpeedAlert() {
      if (this.elSpeedAlert) {
          this.elSpeedAlert.style.display = 'none';
      }
      if (this.elSpeed) {
          this.elSpeed.classList.remove('speed-over-limit');
      }
  }
}
