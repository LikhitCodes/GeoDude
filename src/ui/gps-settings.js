/**
 * GPS Settings Panel — Modal for GPS source configuration
 * Fix 6: Replaces the invisible click-to-toggle with a full settings UI
 */

export class GPSSettingsPanel {
  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.id = 'gps-settings-overlay';
    
    this.overlay.innerHTML = `
      <div class="modal gps-settings-modal">
        <div class="gps-settings-header">
          <div class="gps-settings-title">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            GPS Source
          </div>
          <button class="gps-settings-close" id="gps-settings-close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        
        <div class="gps-settings-body">
          <!-- Simulator Option -->
          <div class="gps-option" id="gps-opt-sim">
            <div class="gps-option-radio">
              <div class="gps-radio" id="gps-radio-sim"></div>
            </div>
            <div class="gps-option-content">
              <div class="gps-option-label">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                GPS Simulator
              </div>
              <div class="gps-option-desc">
                Simulated NMEA data along a demo or planned route. No hardware needed.
              </div>
            </div>
            <div class="badge badge-olive" style="flex-shrink:0">Demo</div>
          </div>
          
          <!-- ESP32 WiFi Option -->
          <div class="gps-option" id="gps-opt-esp">
            <div class="gps-option-radio">
              <div class="gps-radio" id="gps-radio-esp"></div>
            </div>
            <div class="gps-option-content">
              <div class="gps-option-label">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>
                ESP32 (WiFi / WebSocket)
              </div>
              <div class="gps-option-desc">
                Connect to GPS module via WebSocket over a local WiFi network.
              </div>
            </div>
            <div class="badge badge-green" style="flex-shrink:0">Hardware</div>
          </div>

          <!-- Feature 17: Bluetooth Serial Option -->
          <div class="gps-option" id="gps-opt-bt">
            <div class="gps-option-radio">
              <div class="gps-radio" id="gps-radio-bt"></div>
            </div>
            <div class="gps-option-content">
              <div class="gps-option-label">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/></svg>
                Bluetooth Serial (BLE)
              </div>
              <div class="gps-option-desc">
                Direct Web Bluetooth connection to an ESP32 or serial GPS module.
              </div>
            </div>
            <div class="badge badge-green" style="flex-shrink:0">Hardware</div>
          </div>
          
          
          <!-- ESP32 Config (shown when ESP32 selected) -->
          <div class="gps-esp-config" id="gps-esp-config" style="display:none">
            <label class="gps-config-label">WebSocket URL</label>
            <div class="gps-config-row">
              <input type="text" class="input" id="gps-esp-url" placeholder="ws://192.168.4.1:81" autocomplete="off">
              <button class="btn btn-secondary btn-sm" id="gps-btn-test">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Test
              </button>
            </div>
            <div class="gps-test-result" id="gps-test-result"></div>

            <!-- Feature 16: Hardware Diagnostics Dashboard -->
            <div class="esp-diagnostics" id="esp-diagnostics" style="display:none; margin-top:12px; padding:12px; background:var(--bg-primary); border:1px solid var(--border-light); border-radius:var(--radius-sm);">
                <div style="font-size:10px; font-weight:700; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em;">Hardware Diagnostics</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">
                    <div><span style="color:var(--text-muted)">Battery:</span> <strong id="diag-batt">--%</strong></div>
                    <div><span style="color:var(--text-muted)">Signal:</span> <strong id="diag-sig">-- dBm</strong></div>
                    <div><span style="color:var(--text-muted)">Firmware:</span> <strong id="diag-fw">v--</strong></div>
                    <div><span style="color:var(--text-muted)">Uptime:</span> <strong id="diag-uptime">--s</strong></div>
                </div>
            </div>
          </div>

          <!-- BT Config (shown when BT selected) -->
          <div class="gps-esp-config" id="gps-bt-config" style="display:none">
            <div class="gps-test-result" style="color:var(--text-muted);">
              Bluetooth requires user interaction. Click "Connect Device" below to pair.
            </div>
          </div>
        </div>
        
        <div class="gps-settings-footer">
          <button class="btn btn-ghost" id="gps-btn-cancel">Cancel</button>
          <button class="btn btn-primary" id="gps-btn-apply">Apply</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    // DOM refs
    this.elOptSim = document.getElementById('gps-opt-sim');
    this.elOptEsp = document.getElementById('gps-opt-esp');
    this.elOptBt = document.getElementById('gps-opt-bt'); // Feature 17
    
    this.elRadioSim = document.getElementById('gps-radio-sim');
    this.elRadioEsp = document.getElementById('gps-radio-esp');
    this.elRadioBt = document.getElementById('gps-radio-bt');
    
    this.elEspConfig = document.getElementById('gps-esp-config');
    this.elBtConfig = document.getElementById('gps-bt-config');
    
    this.elEspUrl = document.getElementById('gps-esp-url');
    this.elTestResult = document.getElementById('gps-test-result');

    // Feature 16: Diagnostics DOM
    this.elDiagnostics = document.getElementById('esp-diagnostics');
    this.elDiagBatt = document.getElementById('diag-batt');
    this.elDiagSig = document.getElementById('diag-sig');
    this.elDiagFw = document.getElementById('diag-fw');
    this.elDiagUptime = document.getElementById('diag-uptime');

    // Callbacks
    this.onSwitchToSimulator = null;
    this.onSwitchToESP32 = null;
    this.onSwitchToBluetooth = null; // Feature 17
    this.onTestConnection = null;

    this.selectedSource = 'simulator'; // simulator, esp32, bluetooth
    this._lastDiagnostics = null; // Feature 16: persist last diagnostic data

    this.bindEvents();
  }

  bindEvents() {
    // Close
    document.getElementById('gps-settings-close').addEventListener('click', () => this.hide());
    document.getElementById('gps-btn-cancel').addEventListener('click', () => this.hide());
    
    // Click outside modal to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    // Select simulator
    this.elOptSim.addEventListener('click', () => {
      this.selectedSource = 'simulator';
      this.updateSelection();
    });

    // Select ESP32
    this.elOptEsp.addEventListener('click', () => {
      this.selectedSource = 'esp32';
      this.updateSelection();
    });

    // Select Bluetooth
    this.elOptBt.addEventListener('click', () => {
      this.selectedSource = 'bluetooth';
      this.updateSelection();
    });

    // Test connection
    document.getElementById('gps-btn-test').addEventListener('click', async () => {
      const url = this.elEspUrl.value.trim();
      if (!url) {
        this.elTestResult.textContent = 'Please enter a URL first.';
        this.elTestResult.className = 'gps-test-result gps-test-error';
        return;
      }
      
      this.elTestResult.textContent = 'Testing connection...';
      this.elTestResult.className = 'gps-test-result gps-test-pending';
      
      if (this.onTestConnection) {
        const success = await this.onTestConnection(url);
        if (success) {
          this.elTestResult.textContent = '✓ Connection successful!';
          this.elTestResult.className = 'gps-test-result gps-test-success';
        } else {
          this.elTestResult.textContent = '✗ Could not connect. Check IP and ensure ESP32 is powered on.';
          this.elTestResult.className = 'gps-test-result gps-test-error';
        }
      }
    });

    // Apply
    document.getElementById('gps-btn-apply').addEventListener('click', () => {
      if (this.selectedSource === 'simulator') {
        if (this.onSwitchToSimulator) this.onSwitchToSimulator();
      } else if (this.selectedSource === 'esp32') {
        const url = this.elEspUrl.value.trim() || 'ws://192.168.4.1:81';
        if (this.onSwitchToESP32) this.onSwitchToESP32(url);
      } else if (this.selectedSource === 'bluetooth') {
        if (this.onSwitchToBluetooth) this.onSwitchToBluetooth();
      }
      this.hide();
    });
  }

  updateSelection() {
    this.elRadioSim.classList.remove('active');
    this.elRadioEsp.classList.remove('active');
    this.elRadioBt.classList.remove('active');
    
    this.elOptSim.classList.remove('selected');
    this.elOptEsp.classList.remove('selected');
    this.elOptBt.classList.remove('selected');
    
    this.elEspConfig.style.display = 'none';
    this.elBtConfig.style.display = 'none';

    if (this.selectedSource === 'simulator') {
      this.elRadioSim.classList.add('active');
      this.elOptSim.classList.add('selected');
    } else if (this.selectedSource === 'esp32') {
      this.elRadioEsp.classList.add('active');
      this.elOptEsp.classList.add('selected');
      this.elEspConfig.style.display = 'block';
    } else if (this.selectedSource === 'bluetooth') {
      this.elRadioBt.classList.add('active');
      this.elOptBt.classList.add('selected');
      this.elBtConfig.style.display = 'block';
    }
  }

  show(sourceType = 'simulator', currentUrl = 'ws://192.168.4.1:81') {
    this.selectedSource = sourceType;
    this.elEspUrl.value = currentUrl;
    this.elTestResult.textContent = '';
    this.elTestResult.className = 'gps-test-result';
    this.updateSelection();
    // Feature 16: Show cached diagnostics if ESP32 is selected and we have data
    if (sourceType === 'esp32' && this._lastDiagnostics) {
      this._renderDiagnostics();
    }
    this.overlay.classList.add('active');
  }

  // Feature 16: Update diagnostics dashboard with JSON payload
  updateDiagnostics(data) {
    // Always store the latest data so it's available when the modal opens
    this._lastDiagnostics = { ...this._lastDiagnostics, ...data, lastUpdated: Date.now() };
    
    // If modal is open, update the UI immediately
    if (this.overlay.classList.contains('active')) {
      this._renderDiagnostics();
    }
  }

  _renderDiagnostics() {
    const data = this._lastDiagnostics;
    if (!data) return;
    this.elDiagnostics.style.display = 'block';
    if (data.battery !== undefined) this.elDiagBatt.textContent = `${data.battery}%`;
    if (data.signal !== undefined) this.elDiagSig.textContent = `${data.signal} dBm`;
    if (data.firmware) this.elDiagFw.textContent = `v${data.firmware}`;
    if (data.uptime) this.elDiagUptime.textContent = `${data.uptime}s`;
  }

  hide() {
    this.overlay.classList.remove('active');
  }
}
