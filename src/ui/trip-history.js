/**
 * Feature 22: Trip History UI
 * Displays recently completed trips in the dashboard
 */

import { getTrips, deleteTrip } from '../data/offline-store.js';
import { formatDistance, formatTime } from '../utils/helpers.js';

export class TripHistory {
  constructor() {
    this.container = document.getElementById('trip-history-container');
    this.render();
  }

  async render() {
    try {
      const trips = await getTrips();
      // Sort newest first
      trips.sort((a, b) => b.date - a.date);

      if (trips.length === 0) {
        this.container.innerHTML = `
          <div class="sidebar-section" style="margin-top:20px;">
            <div class="sidebar-section-title">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Recent Trips
            </div>
            <div style="padding: 12px; font-size: 11px; color: var(--text-muted); text-align: center; background: var(--bg-primary); border-radius: var(--radius-sm);">
              No completed trips yet.
            </div>
          </div>
        `;
        return;
      }

      let html = `
        <div class="sidebar-section" style="margin-top:20px;">
          <div class="sidebar-section-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Recent Trips
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
      `;

      trips.forEach(trip => {
        const dateStr = new Date(trip.date).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
        });
        
        // Calculate average speed
        const hours = trip.durationSeconds / 3600;
        const km = trip.distanceMeters / 1000;
        const avgSpeed = hours > 0 ? (km / hours).toFixed(1) : 0;

        html += `
          <div class="trip-card" style="padding: 10px; background: var(--bg-primary); border: 1px solid var(--border-light); border-radius: var(--radius-sm); position: relative;">
            <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
              ${trip.routeName || 'Unknown Route'}
            </div>
            <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 6px;">
              ${dateStr}
            </div>
            <div style="display: flex; gap: 12px; font-size: 11px; color: var(--text-secondary);">
              <div style="display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/></svg>
                ${formatDistance(trip.distanceMeters)}
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                ${formatTime(trip.durationSeconds)}
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                ${avgSpeed} km/h
              </div>
            </div>
            <button class="btn-delete-trip" data-id="${trip.id}" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: var(--text-muted); cursor: pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        `;
      });

      html += `</div></div>`;
      this.container.innerHTML = html;

      // Bind delete buttons
      this.container.querySelectorAll('.btn-delete-trip').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = Number(e.currentTarget.dataset.id);
          await deleteTrip(id);
          this.render();
        });
      });

    } catch (e) {
      console.error('Failed to render trip history', e);
    }
  }
}
