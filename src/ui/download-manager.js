/**
 * Download Manager UI
 */

export class DownloadManager {
  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    
    this.overlay.innerHTML = `
      <div class="modal download-panel">
        <div class="flex items-center justify-between mb-4">
            <div class="font-bold text-lg text-[var(--green-900)]">Optimizing Route</div>
            <div id="dl-spinner" class="spinner spinner-sm"></div>
        </div>
        
        <div id="dl-phase" class="download-phase">Processing...</div>
        
        <div class="progress-bar mt-2 mb-2">
            <div id="dl-progress-fill" class="progress-bar-fill" style="width: 0%"></div>
        </div>
        
        <div class="flex items-center justify-between">
            <div id="dl-detail" class="download-detail text-xs">Preparing</div>
            <div id="dl-percent" class="font-mono text-xs font-bold text-[var(--green-700)]">0%</div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.elPhase = document.getElementById('dl-phase');
    this.elDetail = document.getElementById('dl-detail');
    this.elProgress = document.getElementById('dl-progress-fill');
    this.elPercent = document.getElementById('dl-percent');
  }

  show() {
    this.overlay.classList.add('active');
    this.updateProgress('Initializing download...', '', 0);
  }

  hide() {
    this.overlay.classList.remove('active');
  }

  updateProgress(phase, detail, percent) {
    this.elPhase.textContent = phase;
    this.elDetail.textContent = detail;
    this.elProgress.style.width = `${percent}%`;
    this.elPercent.textContent = `${Math.round(percent)}%`;
  }
}
