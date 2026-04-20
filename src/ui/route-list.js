/**
 * Route List UI logic
 */
import { getAllRoutes, deleteRoute, getStorageStats } from '../data/offline-store.js';
import { formatDistance } from '../utils/helpers.js';
import { toast } from './toast.js';

export class RouteList {
  constructor() {
    this.container = document.getElementById('route-list-container');
    this.onNavigate = null;
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
                </div>
            `;
            return;
        }

        this.container.innerHTML = '';
        
        routes.forEach(route => {
            const card = document.createElement('div');
            card.className = 'route-card';
            
            const date = new Date(route.createdAt).toLocaleDateString(undefined, { 
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10s-4.5-8-11.8-8A8 8 0 001.8 10c7.3 0 11.8 8 11.8 8"/></svg>
                        ~${(route.distance / 1000 / 12 * 60).toFixed(0)} min
                    </div>
                </div>
                <div class="route-card-actions">
                    <button class="btn btn-primary btn-sm w-full btn-navigate">Navigate</button>
                    <button class="btn btn-secondary btn-sm btn-icon btn-delete" style="color:var(--danger)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
                    </button>
                </div>
            `;

            // Bind events
            card.querySelector('.btn-navigate').addEventListener('click', (e) => {
                e.stopPropagation();
                if(this.onNavigate) this.onNavigate(route);
            });

            card.querySelector('.btn-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                if(confirm("Delete this offline map? This will remove all downloaded tiles and road data.")) {
                    await deleteRoute(route.id);
                    toast.success("Deleted", "Offline map removed.");
                    this.render(); // Re-render list
                }
            });

            this.container.appendChild(card);
        });

        // Add storage stats at bottom
        getStorageStats().then(stats => {
            const el = document.createElement('div');
            el.className = 'text-xs text-muted text-center mt-4 pt-4 border-t border-[var(--border-light)]';
            el.innerHTML = `Storage: <b>${stats.estimatedSizeMB} MB</b> used for ${stats.tileCount} tiles`;
            this.container.appendChild(el);
        }).catch(()=> { /* ignore */ });

    } catch (e) {
        console.error("Failed to render route list", e);
        this.container.innerHTML = `<div class="p-4 text-xs text-[var(--danger)]">Failed to load offline routes.</div>`;
    }
  }
}
