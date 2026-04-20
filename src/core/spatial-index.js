/**
 * Spatial Index — Grid-based bucketing for fast nearest-node lookup
 * Reduces O(n) nearest-neighbor search to O(1) average case
 */

import { haversineDistance } from './haversine.js';

export class SpatialIndex {
  /**
   * @param {number} cellSize - Cell size in degrees (approx 0.001 ≈ 111m)
   */
  constructor(cellSize = 0.001) {
    this.cellSize = cellSize;
    this.grid = new Map();
    this.nodes = new Map(); // nodeId → { lat, lon, ...data }
  }

  /**
   * Get grid cell key for a coordinate
   */
  _cellKey(lat, lon) {
    const row = Math.floor(lat / this.cellSize);
    const col = Math.floor(lon / this.cellSize);
    return `${row},${col}`;
  }

  /**
   * Insert a node into the index
   * @param {string|number} id - Node identifier
   * @param {number} lat
   * @param {number} lon
   * @param {object} data - Additional data to store
   */
  insert(id, lat, lon, data = {}) {
    const key = this._cellKey(lat, lon);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key).push(id);
    this.nodes.set(id, { lat, lon, ...data });
  }

  /**
   * Bulk insert nodes
   * @param {Object} nodesObj - { id: { lat, lon, ...data } }
   */
  bulkInsert(nodesObj) {
    for (const [id, node] of Object.entries(nodesObj)) {
      this.insert(id, node.lat, node.lon, node);
    }
  }

  /**
   * Get candidate nodes near a point
   * Searches the cell and its 8 neighbors
   * @param {number} lat
   * @param {number} lon
   * @param {number} radiusCells - How many cells to search in each direction (default 1)
   * @returns {Array} Array of { id, lat, lon, distance, ...data }
   */
  getNearby(lat, lon, radiusCells = 1) {
    const centerRow = Math.floor(lat / this.cellSize);
    const centerCol = Math.floor(lon / this.cellSize);
    const candidates = [];

    for (let dr = -radiusCells; dr <= radiusCells; dr++) {
      for (let dc = -radiusCells; dc <= radiusCells; dc++) {
        const key = `${centerRow + dr},${centerCol + dc}`;
        const cellNodes = this.grid.get(key);
        if (cellNodes) {
          for (const nodeId of cellNodes) {
            const node = this.nodes.get(nodeId);
            if (node) {
              const dist = haversineDistance(lat, lon, node.lat, node.lon);
              candidates.push({ id: nodeId, distance: dist, ...node });
            }
          }
        }
      }
    }

    return candidates.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Find the single nearest node to a point
   * @param {number} lat
   * @param {number} lon
   * @returns {{ id, lat, lon, distance, ...data } | null}
   */
  findNearest(lat, lon) {
    // Start with immediate neighbors
    let candidates = this.getNearby(lat, lon, 1);

    // If no candidates, expand search
    if (candidates.length === 0) {
      candidates = this.getNearby(lat, lon, 3);
    }
    if (candidates.length === 0) {
      candidates = this.getNearby(lat, lon, 10);
    }

    return candidates.length > 0 ? candidates[0] : null;
  }

  /**
   * Clear the index
   */
  clear() {
    this.grid.clear();
    this.nodes.clear();
  }

  /**
   * Get the total count of indexed nodes
   */
  get size() {
    return this.nodes.size;
  }
}
