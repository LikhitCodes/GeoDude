/**
 * Tile Manager — Download, cache, and serve OSM tiles
 * Includes custom Leaflet TileLayer for offline rendering
 */

import L from 'leaflet';
import { saveTile, saveTileBatch, getTileBlob } from './offline-store.js';

/**
 * Convert lat/lon to tile coordinates at a given zoom level (slippy map math)
 */
export function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, z: zoom };
}

/**
 * Get all tile coordinates that cover a bounding box at a given zoom level
 */
export function getTilesForBounds(south, west, north, east, zoom) {
  const topLeft = latLonToTile(north, west, zoom);
  const bottomRight = latLonToTile(south, east, zoom);

  const tiles = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

/**
 * Get all tiles needed for a route corridor at specified zoom levels
 * @param {Object} bounds - { south, west, north, east }
 * @param {number[]} zoomLevels - Array of zoom levels (e.g., [14, 15, 16, 17])
 * @returns {Array} Array of { x, y, z }
 */
export function getTilesForRoute(bounds, zoomLevels = [14, 15, 16, 17]) {
  const allTiles = [];
  for (const zoom of zoomLevels) {
    const tiles = getTilesForBounds(bounds.south, bounds.west, bounds.north, bounds.east, zoom);
    allTiles.push(...tiles);
  }
  return allTiles;
}

/**
 * Download and cache tiles with progress reporting
 * @param {Array} tiles - Array of { x, y, z }
 * @param {string} routeId - Route ID for association
 * @param {Function} onProgress - Callback (downloaded, total)
 * @param {number} concurrency - Max parallel downloads
 * @returns {Promise<{ downloaded: number, failed: number }>}
 */
export async function downloadTiles(tiles, routeId, onProgress, concurrency = 4) {
  let downloaded = 0;
  let failed = 0;
  const total = tiles.length;
  const batch = [];

  const queue = [...tiles];

  async function worker() {
    while (queue.length > 0) {
      const tile = queue.shift();
      if (!tile) break;

      try {
        const url = `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'TrailSync GPS Navigator (educational project)',
          },
        });

        if (response.ok) {
          const blob = await response.blob();
          batch.push({ z: tile.z, x: tile.x, y: tile.y, blob, routeId });

          // Batch save every 20 tiles
          if (batch.length >= 20) {
            await saveTileBatch(batch.splice(0, batch.length));
          }

          downloaded++;
        } else {
          failed++;
        }
      } catch (err) {
        console.warn(`[TileManager] Failed to download tile ${tile.z}/${tile.x}/${tile.y}:`, err);
        failed++;
      }

      if (onProgress) onProgress(downloaded + failed, total);
    }
  }

  // Run workers
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Save remaining batch
  if (batch.length > 0) {
    await saveTileBatch(batch);
  }

  return { downloaded, failed };
}

/**
 * Create a custom Leaflet TileLayer that reads from IndexedDB (offline mode)
 */
export function createOfflineTileLayer() {
  const OfflineTileLayer = L.TileLayer.extend({
    createTile: function (coords, done) {
      const tile = document.createElement('img');
      tile.alt = '';
      tile.setAttribute('role', 'presentation');

      const { x, y } = coords;
      const z = this._getZoomForUrl();

      getTileBlob(z, x, y)
        .then((blob) => {
          if (blob) {
            tile.src = URL.createObjectURL(blob);
          } else {
            // Fallback to online if tile not cached
            tile.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
          }
          done(null, tile);
        })
        .catch((err) => {
          console.warn('[OfflineTileLayer] Error loading tile:', err);
          tile.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
          done(null, tile);
        });

      return tile;
    },
  });

  return new OfflineTileLayer('', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
}

/**
 * Estimate the total download size for a set of tiles (rough estimate)
 * Average OSM tile ≈ 20KB
 */
export function estimateDownloadSize(tileCount) {
  const avgTileSizeKB = 20;
  const totalKB = tileCount * avgTileSizeKB;
  if (totalKB > 1024) {
    return `${(totalKB / 1024).toFixed(1)} MB`;
  }
  return `${totalKB} KB`;
}
