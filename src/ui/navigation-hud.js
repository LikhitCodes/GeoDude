/**
 * Navigation HUD (Turn-by-turn overlay)
 */
import { formatDistance } from '../utils/helpers.js';
import { maneuverIcon } from '../core/bearing-engine.js';

export class NavigationHUD {
  constructor(mapContainer) {
    this.container = document.createElement('div');
    this.container.className = 'nav-hud';
    this.container.style.display = 'none';
    
    mapContainer.appendChild(this.container);
    this.onEndNavigation = null;
    
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
      </div>

      <!-- Warning Banner (Hidden by default) -->
      <div id="hud-warning" class="nav-warning" style="display:none; margin-top:-10px;">
         <svg class="nav-warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
         <div class="nav-warning-text flex items-center">
            Off route! <div class="recalculating"><span></span><span></span><span></span></div>
         </div>
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
    this.elWarning = document.getElementById('hud-warning');
    this.elArrival = document.getElementById('hud-arrival');

    document.getElementById('hud-btn-end').addEventListener('click', () => {
        if(this.onEndNavigation) this.onEndNavigation();
    });

    document.getElementById('hud-btn-done').addEventListener('click', () => {
        if(this.onEndNavigation) this.onEndNavigation();
    });
  }

  show() {
    this.container.style.display = 'flex';
    this.hideWarning();
    this.hideArrival();
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

  updateTelemetry(speedKmh, remainingDistance) {
      if(speedKmh !== undefined) {
        this.elSpeed.textContent = Math.round(speedKmh);
      }
      if(remainingDistance !== undefined) {
          this.elRemDist.textContent = formatDistance(remainingDistance);
      }
  }

  showWarning() {
      this.elWarning.style.display = 'flex';
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
}
