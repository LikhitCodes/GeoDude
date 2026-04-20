/**
 * A* Pathfinder — operates on OSM road graph (adjacency list)
 * Heuristic: Haversine distance to destination
 * Cost: actual road distance along edges
 */

import { haversineDistance } from './haversine.js';

export class Pathfinder {
  constructor() {
    this.graph = null;
  }

  /**
   * Load a road graph
   * @param {Object} graph - { nodes: { id: {lat, lon} }, edges: { nodeId: [{to, distance, roadType}] } }
   */
  loadGraph(graph) {
    this.graph = graph;
  }

  /**
   * Find shortest path from start node to end node using A*
   * @param {string} startId - Start node ID
   * @param {string} endId - End node ID
   * @returns {{ path: string[], distance: number, found: boolean }}
   */
  findPath(startId, endId) {
    if (!this.graph || !this.graph.nodes[startId] || !this.graph.nodes[endId]) {
      return { path: [], distance: 0, found: false };
    }

    const endNode = this.graph.nodes[endId];

    // Priority queue implemented as a sorted array (fine for graphs <50k nodes)
    const openSet = new MinHeap();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    const closed = new Set();

    gScore.set(startId, 0);
    fScore.set(startId, this._heuristic(startId, endNode));
    openSet.push({ id: startId, f: fScore.get(startId) });

    while (openSet.size > 0) {
      const current = openSet.pop();

      if (current.id === endId) {
        return {
          path: this._reconstructPath(cameFrom, endId),
          distance: gScore.get(endId),
          found: true,
        };
      }

      if (closed.has(current.id)) continue;
      closed.add(current.id);

      const edges = this.graph.edges[current.id] || [];
      for (const edge of edges) {
        if (closed.has(edge.to)) continue;

        const tentativeG = (gScore.get(current.id) || Infinity) + edge.distance;

        if (tentativeG < (gScore.get(edge.to) || Infinity)) {
          cameFrom.set(edge.to, current.id);
          gScore.set(edge.to, tentativeG);
          const f = tentativeG + this._heuristic(edge.to, endNode);
          fScore.set(edge.to, f);
          openSet.push({ id: edge.to, f });
        }
      }
    }

    return { path: [], distance: 0, found: false };
  }

  /**
   * Find path through multiple waypoints
   * @param {string[]} waypointIds - Array of node IDs to visit in order
   * @returns {{ path: string[], distance: number, found: boolean, segments: Array }}
   */
  findMultiWaypointPath(waypointIds) {
    if (waypointIds.length < 2) {
      return { path: waypointIds, distance: 0, found: true, segments: [] };
    }

    let fullPath = [];
    let totalDistance = 0;
    const segments = [];

    for (let i = 0; i < waypointIds.length - 1; i++) {
      const result = this.findPath(waypointIds[i], waypointIds[i + 1]);

      if (!result.found) {
        return {
          path: fullPath,
          distance: totalDistance,
          found: false,
          failedSegment: i,
          segments,
        };
      }

      // Avoid duplicate nodes at junctions
      if (i > 0 && result.path.length > 0) {
        result.path.shift();
      }

      fullPath = fullPath.concat(result.path);
      totalDistance += result.distance;
      segments.push({
        from: waypointIds[i],
        to: waypointIds[i + 1],
        distance: result.distance,
        nodeCount: result.path.length,
      });
    }

    return { path: fullPath, distance: totalDistance, found: true, segments };
  }

  /**
   * Get the path as an array of { lat, lon } coordinates
   */
  pathToCoordinates(path) {
    return path
      .map((nodeId) => {
        const node = this.graph.nodes[nodeId];
        return node ? { lat: node.lat, lon: node.lon, nodeId } : null;
      })
      .filter(Boolean);
  }

  /**
   * Heuristic function — Haversine distance
   */
  _heuristic(nodeId, endNode) {
    const node = this.graph.nodes[nodeId];
    if (!node) return Infinity;
    return haversineDistance(node.lat, node.lon, endNode.lat, endNode.lon);
  }

  /**
   * Reconstruct path from cameFrom map
   */
  _reconstructPath(cameFrom, current) {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.unshift(current);
    }
    return path;
  }
}

/**
 * Simple min-heap for A* priority queue
 */
class MinHeap {
  constructor() {
    this.data = [];
  }

  get size() {
    return this.data.length;
  }

  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.data[parent].f <= this.data[i].f) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const length = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;

      if (left < length && this.data[left].f < this.data[smallest].f) {
        smallest = left;
      }
      if (right < length && this.data[right].f < this.data[smallest].f) {
        smallest = right;
      }
      if (smallest === i) break;

      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}
