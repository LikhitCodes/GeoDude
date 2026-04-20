/**
 * Graph Builder — Converts raw OSM data into an adjacency list graph
 */

import { haversineDistance } from '../core/haversine.js';

/**
 * Build a road graph from raw Overpass API OSM data
 * @param {Object} osmData - Raw JSON from Overpass API
 * @returns {Object} { nodes: { id: {lat, lon} }, edges: { nodeId: [{to, distance, roadType}] } }
 */
export function buildGraph(osmData) {
  const nodes = {};
  const edges = {};
  const nodeRefs = new Set(); // Which node IDs are actually referenced by ways

  // First pass: collect node IDs that are used by ways
  const ways = osmData.elements.filter((el) => el.type === 'way');
  const nodeElements = osmData.elements.filter((el) => el.type === 'node');

  for (const way of ways) {
    if (way.nodes) {
      for (const nodeId of way.nodes) {
        nodeRefs.add(nodeId);
      }
    }
  }

  // Second pass: index only referenced nodes
  for (const node of nodeElements) {
    if (nodeRefs.has(node.id)) {
      nodes[node.id] = { lat: node.lat, lon: node.lon };
    }
  }

  // Third pass: create edges from ways
  for (const way of ways) {
    if (!way.nodes || way.nodes.length < 2) continue;

    const tags = way.tags || {};
    const roadType = tags.highway || 'road';
    const isOneway = tags.oneway === 'yes' || tags.oneway === '1';
    const isReversed = tags.oneway === '-1';
    const name = tags.name || '';

    for (let i = 0; i < way.nodes.length - 1; i++) {
      const fromId = String(way.nodes[i]);
      const toId = String(way.nodes[i + 1]);

      const fromNode = nodes[way.nodes[i]] || nodes[fromId];
      const toNode = nodes[way.nodes[i + 1]] || nodes[toId];

      if (!fromNode || !toNode) continue;

      const distance = haversineDistance(fromNode.lat, fromNode.lon, toNode.lat, toNode.lon);

      // Initialize edge arrays
      if (!edges[fromId]) edges[fromId] = [];
      if (!edges[toId]) edges[toId] = [];

      // Ensure nodes are indexed with string IDs
      nodes[fromId] = fromNode;
      nodes[toId] = toNode;

      if (isReversed) {
        // Reversed oneway: only toId → fromId
        edges[toId].push({ to: fromId, distance, roadType, name, wayId: way.id });
      } else if (isOneway) {
        // Normal oneway: only fromId → toId
        edges[fromId].push({ to: toId, distance, roadType, name, wayId: way.id });
      } else {
        // Bidirectional
        edges[fromId].push({ to: toId, distance, roadType, name, wayId: way.id });
        edges[toId].push({ to: fromId, distance, roadType, name, wayId: way.id });
      }
    }
  }

  // Find intersection nodes (nodes where >2 edges meet) for reduced graph
  const intersections = new Set();
  for (const [nodeId, nodeEdges] of Object.entries(edges)) {
    if (nodeEdges.length !== 2) {
      intersections.add(nodeId);
    }
  }

  const stats = {
    totalNodes: Object.keys(nodes).length,
    totalEdges: Object.values(edges).reduce((sum, e) => sum + e.length, 0),
    ways: ways.length,
    intersections: intersections.size,
  };

  console.log('[GraphBuilder] Graph built:', stats);

  return { nodes, edges, stats, intersections };
}

/**
 * Find the nearest node in the graph to a given coordinate
 * Simple linear scan — use SpatialIndex for performance
 */
export function findNearestNode(graph, lat, lon) {
  let nearestId = null;
  let nearestDist = Infinity;

  for (const [id, node] of Object.entries(graph.nodes)) {
    const dist = haversineDistance(lat, lon, node.lat, node.lon);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestId = id;
    }
  }

  return nearestId ? { id: nearestId, ...graph.nodes[nearestId], distance: nearestDist } : null;
}

/**
 * Compact the graph for storage (remove redundant data)
 */
export function compactGraph(graph) {
  const compact = {
    nodes: {},
    edges: {},
  };

  for (const [id, node] of Object.entries(graph.nodes)) {
    compact.nodes[id] = {
      lat: Math.round(node.lat * 1e6) / 1e6, // 6 decimal places ≈ 0.1m
      lon: Math.round(node.lon * 1e6) / 1e6,
    };
  }

  for (const [id, nodeEdges] of Object.entries(graph.edges)) {
    compact.edges[id] = nodeEdges.map((e) => ({
      to: e.to,
      distance: Math.round(e.distance * 10) / 10, // 0.1m precision
      roadType: e.roadType,
      name: e.name || undefined,
    }));
  }

  return compact;
}
