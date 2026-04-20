/**
 * Route List UI — Offline routes management panel
 * Enhanced with: Export/Import (Feature 13), Storage stats (Feature 15), Tile purge
 */
import { getAllRoutes, deleteRoute, getStorageStats, getRouteStorageStats, purgeTilesForRoute, searchPOIs } from '../data/offline-store.js';
import { exportAsGeoJSON, exportAsGPX, importRouteFile, downloadFile } from '../data/route-io.js';
import { formatDistance } from '../utils/helpers.js';
import { toast } from './toast.js';

export class RouteList {
  constructor() {
    this.container = document.getElementById('route-list-container');
    this.onNavigate = null;
    this.onImportRoute = null;  // Feature 13: callback for imported route
  }

  async render() {
    try {
        const routes = await getAllRoutes();
        
        if (routes.length === 0) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <div class="empty-state-title">No offline routes</div>
                    <div class="empty-state-text">Plan a route on the map and click "Download" to save it for offline navigation.</div>
                    
                    <!-- Feature 13: Import button even when list is empty -->
                    <label class="btn btn-secondary btn-sm import-route-btn" style="margin-top:12px; cursor:pointer;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                        Import Route
                        <input type="file" accept=".geojson,.gpx,.json" style="display:none" class="import-file-input">
                    </label>
                </div>
            `;
            this.bindImportInput();
            return;
        }

        this.container.innerHTML = '';

        // Feature 13: Import button at top
        const importBar = document.createElement('div');
        importBar.className = 'route-import-bar';
        importBar.innerHTML = `
            <label class="btn btn-ghost btn-sm import-route-btn" style="cursor:pointer; width:100%;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                Import GeoJSON / GPX
                <input type="file" accept=".geojson,.gpx,.json" style="display:none" class="import-file-input">
            </label>
        `;
        this.container.appendChild(importBar);
        
        for (const route of routes) {
            const card = await this.createRouteCard(route);
            this.container.appendChild(card);
        }

        // Add storage stats at bottom
        getStorageStats().then(stats => {
            const el = document.createElement('div');
            el.className = 'storage-stats-bar';
            el.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                <b>${stats.estimatedSizeMB} MB</b> used &middot; ${stats.tileCount} tiles &middot; ${stats.routeCount} routes
            `;
            this.container.appendChild(el);
        }).catch(()=> { /* ignore */ });

        this.bindImportInput();

    } catch (e) {
        console.error("Failed to render route list", e);
        this.container.innerHTML = `<div class="p-4 text-xs text-[var(--danger)]">Failed to load offline routes.</div>`;
    }
  }

  async createRouteCard(route) {
    const card = document.createElement('div');
    card.className = 'route-card';
    
    const date = new Date(route.createdAt).toLocaleDateString(undefined, { 
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Feature 15: Get per-route storage stats
    let storageHtml = '';
    try {
        const stats = await getRouteStorageStats(route.id);
        storageHtml = `
            <div class="route-storage-info">
                <span title="${stats.tileCount} tiles">${stats.tileSizeMB} MB tiles</span>
                ${stats.hasGraph ? '<span class="storage-badge" title="Road graph cached">Graph</span>' : ''}
                ${stats.hasPOIs ? '<span class="storage-badge" title="POIs cached">POIs</span>' : ''}
            </div>
        `;
    } catch { /* ignore */ }

    card.innerHTML = `
        <div class="route-card-header">
            <div>
                <div class="route-card-name">${route.name || 'Saved Route'}</div>
                <div class="route-card-date">${date}</div>
            </div>
            <div class="badge badge-green">Ready</div>
        </div>
        <div class="route-card-stats">
            <div class="route-card-stat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/></svg>
                ${formatDistance(route.distance)}
            </div>
            <div class="route-card-stat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                ~${(route.distance / 1000 / 12 * 60).toFixed(0)} min
            </div>
        </div>
        ${storageHtml}
        <div class="route-card-actions">
            <button class="btn btn-primary btn-sm w-full btn-navigate">Navigate</button>
            
            <!-- Feature 13: Export dropdown -->
            <div class="route-export-dropdown">
                <button class="btn btn-secondary btn-sm btn-icon btn-export" title="Export route">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                </button>
                <div class="route-export-menu" style="display:none;">
                    <button class="route-export-option" data-format="geojson">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2"/></svg>
                        GeoJSON
                    </button>
                    <button class="route-export-option" data-format="gpx">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/></svg>
                        GPX
                    </button>
                </div>
            </div>

            <!-- Feature 15: Purge tiles button -->
            <button class="btn btn-secondary btn-sm btn-icon btn-purge" title="Purge cached tiles" style="color:var(--warning)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><line x1="3.27" y1="6.96" x2="12" y2="12.01"/><line x1="20.73" y1="6.96" x2="12" y2="12.01"/></svg>
            </button>

            <button class="btn btn-secondary btn-sm btn-icon btn-delete" style="color:var(--danger)" title="Delete route">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
            </button>
        </div>
    `;

    // Bind events

    // Navigate
    card.querySelector('.btn-navigate').addEventListener('click', (e) => {
        e.stopPropagation();
        if(this.onNavigate) this.onNavigate(route);
    });

    // Delete
    card.querySelector('.btn-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if(confirm("Delete this offline map? This will remove all downloaded tiles and road data.")) {
            await deleteRoute(route.id);
            toast.success("Deleted", "Offline map removed.");
            this.render();
        }
    });

    // Feature 13: Export dropdown toggle
    const exportBtn = card.querySelector('.btn-export');
    const exportMenu = card.querySelector('.route-export-menu');
    
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = exportMenu.style.display !== 'none';
        // Close all other menus
        document.querySelectorAll('.route-export-menu').forEach(m => m.style.display = 'none');
        exportMenu.style.display = isOpen ? 'none' : 'flex';
    });

    card.querySelectorAll('.route-export-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const format = opt.dataset.format;
            const safeName = (route.name || 'route').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            
            if (format === 'geojson') {
                const content = exportAsGeoJSON(route);
                downloadFile(content, `${safeName}.geojson`, 'application/geo+json');
                toast.success('Exported', `Route saved as ${safeName}.geojson`);
            } else if (format === 'gpx') {
                const content = exportAsGPX(route);
                downloadFile(content, `${safeName}.gpx`, 'application/gpx+xml');
                toast.success('Exported', `Route saved as ${safeName}.gpx`);
            }
            exportMenu.style.display = 'none';
        });
    });

    // Feature 15: Purge tiles
    card.querySelector('.btn-purge').addEventListener('click', async (e) => {
        e.stopPropagation();
        if(confirm("Purge cached tiles for this route? The route and navigation data will be kept, but you'll need to re-download tiles for offline map display.")) {
            await purgeTilesForRoute(route.id);
            toast.info("Tiles Purged", "Map tiles removed. Route metadata preserved.");
            this.render();
        }
    });

    return card;
  }

  bindImportInput() {
    // Feature 13: Import route from file
    const inputs = this.container.querySelectorAll('.import-file-input');
    inputs.forEach(input => {
        input.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const imported = await importRouteFile(file);
                toast.success('Route Imported', `"${imported.name}" — ${formatDistance(imported.distance)}`);
                if (this.onImportRoute) {
                    this.onImportRoute(imported);
                }
            } catch (err) {
                console.error('Import error:', err);
                toast.error('Import Failed', err.message);
            }

            // Reset input
            e.target.value = '';
        });
    });
  }
}
