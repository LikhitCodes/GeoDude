/**
 * Map-Matching — Snap GPS coordinates to the nearest road node
 */

import { SpatialIndex } from './spatial-index.js';
import { haversineDistance } from './haversine.js';

export class MapMatcher {
  constructor() {
    this.spatialIndex = new SpatialIndex(0.0005); // ~55m cells
    this.graph = null;
    this.lastMatchedNode = null;
    this.offRouteThreshold = 25; // meters
  }

  /**
   * Load a road graph into the matcher
   * @param {Object} graph - { nodes: { id: {lat, lon} }, edges: { nodeId: [{to, distance}] } }
   */
  loadGraph(graph) {
    this.graph = graph;
    this.spatialIndex.clear();
    this.spatialIndex.bulkInsert(graph.nodes);
    this.lastMatchedNode = null;
  }

  /**
   * Snap a GPS position to the nearest road node
   * @param {number} lat - Raw GPS latitude
   * @param {number} lon - Raw GPS longitude
   * @returns {{ nodeId, lat, lon, distance, isOffRoute }}
   */
  match(lat, lon) {
    if (!this.graph) {
      return { nodeId: null, lat, lon, distance: Infinity, isOffRoute: true };
    }

    const nearest = this.spatialIndex.findNearest(lat, lon);
    if (!nearest) {
      return { nodeId: null, lat, lon, distance: Infinity, isOffRoute: true };
    }

    const isOffRoute = nearest.distance > this.offRouteThreshold;

    // If we have a previous match, prefer connected nodes (graph-aware matching)
    if (this.lastMatchedNode && !isOffRoute) {
      const edges = this.graph.edges[this.lastMatchedNode] || [];
      const connectedCandidates = edges
        .map((edge) => {
          const node = this.graph.nodes[edge.to];
          if (!node) return null;
          return {
            id: edge.to,
            distance: haversineDistance(lat, lon, node.lat, node.lon),
            ...node,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance);

      // If a connected node is close enough, prefer it over the absolute nearest
      if (connectedCandidates.length > 0 && connectedCandidates[0].distance < nearest.distance * 1.5) {
        const best = connectedCandidates[0];
        this.lastMatchedNode = best.id;
        return {
          nodeId: best.id,
          lat: best.lat,
          lon: best.lon,
          distance: best.distance,
          isOffRoute: best.distance > this.offRouteThreshold,
        };
      }
    }

    this.lastMatchedNode = nearest.id;
    return {
      nodeId: nearest.id,
      lat: nearest.lat,
      lon: nearest.lon,
      distance: nearest.distance,
      isOffRoute,
    };
  }

  /**
   * Set the off-route threshold
   */
  setThreshold(meters) {
    this.offRouteThreshold = meters;
  }

  /**
   * Reset matching state
   */
  reset() {
    this.lastMatchedNode = null;
  }
}
