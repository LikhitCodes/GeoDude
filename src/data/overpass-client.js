/**
 * Overpass API Client
 * Fetches road network data from OpenStreetMap via Overpass API
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
];

/**
 * Fetch all roads within a bounding box
 * @param {number} south - Min latitude
 * @param {number} west - Min longitude
 * @param {number} north - Max latitude
 * @param {number} east - Max longitude
 * @returns {Object} Raw OSM JSON data
 */
export async function fetchRoads(south, west, north, east) {
  const query = `
    [out:json][timeout:30];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|pedestrian|track|path|footway|cycleway)$"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `;

  let lastError;

  for (const url of OVERPASS_ENDPOINTS) {
      try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`,
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
          }

          return await response.json();
      } catch (err) {
          lastError = err;
          console.warn(`Failed to fetch from ${url}:`, err.message);
          // Continue to the next URL in the array
      }
  }

  throw new Error(`All Overpass API endpoints failed. Last error: ${lastError.message}`);
}

/**
 * Fetch roads for a route corridor (bounding box with padding)
 * @param {Array} waypoints - Array of {lat, lon}
 * @param {number} padding - Padding in degrees (default: ~500m at equator)
 * @returns {Object} Raw OSM JSON data
 */
export async function fetchRoadsForRoute(waypoints, padding = 0.005) {
  if (waypoints.length === 0) throw new Error('No waypoints provided');

  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;

  for (const wp of waypoints) {
    south = Math.min(south, wp.lat);
    west = Math.min(west, wp.lon);
    north = Math.max(north, wp.lat);
    east = Math.max(east, wp.lon);
  }

  // Add padding
  south -= padding;
  west -= padding;
  north += padding;
  east += padding;

  return fetchRoads(south, west, north, east);
}

/**
 * Get bounding box for an array of waypoints with padding
 */
export function getBoundingBox(waypoints, padding = 0.005) {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;

  for (const wp of waypoints) {
    south = Math.min(south, wp.lat);
    west = Math.min(west, wp.lon);
    north = Math.max(north, wp.lat);
    east = Math.max(east, wp.lon);
  }

  return {
    south: south - padding,
    west: west - padding,
    north: north + padding,
    east: east + padding,
  };
}

/**
 * Feature 14: Fetch POIs (points of interest) within a route corridor
 * @param {Array} waypoints - Array of {lat, lon}
 * @param {number} padding - Padding in degrees
 * @returns {Promise<Array>} Array of { name, lat, lon, type, tags }
 */
export async function fetchPOIsForRoute(waypoints, padding = 0.003) {
  if (waypoints.length === 0) return [];

  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  for (const wp of waypoints) {
    south = Math.min(south, wp.lat);
    west = Math.min(west, wp.lon);
    north = Math.max(north, wp.lat);
    east = Math.max(east, wp.lon);
  }
  south -= padding; west -= padding; north += padding; east += padding;

  const query = `
    [out:json][timeout:15];
    (
      node["amenity"~"fuel|restaurant|cafe|hospital|pharmacy|bank|atm|toilet|parking"](${south},${west},${north},${east});
      node["shop"~"supermarket|convenience|bakery"](${south},${west},${north},${east});
      node["tourism"~"hotel|motel|guest_house|viewpoint|information"](${south},${west},${north},${east});
    );
    out body;
  `;

  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) continue;

      const data = await response.json();
      
      return (data.elements || [])
        .filter(el => el.lat && el.lon)
        .map(el => ({
          name: el.tags?.name || el.tags?.amenity || el.tags?.shop || el.tags?.tourism || 'Unknown',
          lat: el.lat,
          lon: el.lon,
          type: el.tags?.amenity || el.tags?.shop || el.tags?.tourism || 'poi',
          tags: el.tags || {},
        }));
    } catch (err) {
      console.warn(`POI fetch failed from ${url}:`, err.message);
    }
  }

  return []; // Return empty if all endpoints fail (non-critical)
}
