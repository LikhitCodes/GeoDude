/**
 * Route Exporter/Importer — Feature 13
 * Export saved routes as GeoJSON or GPX. Import routes from files.
 */

/**
 * Export a route as GeoJSON
 * @param {object} route — route record from IndexedDB
 * @returns {string} GeoJSON string
 */
export function exportAsGeoJSON(route) {
  const coords = route.pathCoords.map(p => [p.lon, p.lat]);

  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: route.name || 'TrailSync Route',
          distance: route.distance,
          createdAt: route.createdAt,
          id: route.id,
          generator: 'TrailSync Navigator',
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    ],
  };

  return JSON.stringify(geojson, null, 2);
}

/**
 * Export a route as GPX
 * @param {object} route — route record from IndexedDB
 * @returns {string} GPX XML string
 */
export function exportAsGPX(route) {
  const trkpts = route.pathCoords
    .map(p => `      <trkpt lat="${p.lat}" lon="${p.lon}"></trkpt>`)
    .join('\n');

  const name = escapeXml(route.name || 'TrailSync Route');
  const time = route.createdAt || new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailSync Navigator"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${time}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Import a GeoJSON file and extract pathCoords + metadata
 * @param {string} content — file content string
 * @returns {object} { name, pathCoords, distance }
 */
export function importGeoJSON(content) {
  const data = JSON.parse(content);

  let coords = [];
  let name = 'Imported Route';

  if (data.type === 'FeatureCollection' && data.features?.length > 0) {
    const feature = data.features[0];
    if (feature.geometry?.type === 'LineString') {
      coords = feature.geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
    } else if (feature.geometry?.type === 'MultiLineString') {
      // Flatten multi-line
      coords = feature.geometry.coordinates.flat().map(c => ({ lat: c[1], lon: c[0] }));
    }
    name = feature.properties?.name || name;
  } else if (data.type === 'Feature') {
    if (data.geometry?.type === 'LineString') {
      coords = data.geometry.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
    }
    name = data.properties?.name || name;
  } else if (data.type === 'LineString') {
    coords = data.coordinates.map(c => ({ lat: c[1], lon: c[0] }));
  }

  if (coords.length < 2) {
    throw new Error('Could not extract route coordinates from GeoJSON.');
  }

  return { name, pathCoords: coords, distance: calculatePathDistance(coords) };
}

/**
 * Import a GPX file and extract pathCoords + metadata
 * @param {string} content — file content string
 * @returns {object} { name, pathCoords, distance }
 */
export function importGPX(content) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid GPX file: XML parsing failed.');
  }

  let name = 'Imported GPX Route';
  const nameEl = doc.querySelector('trk > name') || doc.querySelector('metadata > name');
  if (nameEl) name = nameEl.textContent;

  const trkpts = doc.querySelectorAll('trkpt');
  if (trkpts.length === 0) {
    // Try route points
    const rtepts = doc.querySelectorAll('rtept');
    if (rtepts.length === 0) {
      throw new Error('No track or route points found in GPX file.');
    }
    const coords = Array.from(rtepts).map(pt => ({
      lat: parseFloat(pt.getAttribute('lat')),
      lon: parseFloat(pt.getAttribute('lon')),
    }));
    return { name, pathCoords: coords, distance: calculatePathDistance(coords) };
  }

  const coords = Array.from(trkpts).map(pt => ({
    lat: parseFloat(pt.getAttribute('lat')),
    lon: parseFloat(pt.getAttribute('lon')),
  }));

  return { name, pathCoords: coords, distance: calculatePathDistance(coords) };
}

/**
 * Detect file type and import accordingly
 * @param {File} file — uploaded File object
 * @returns {Promise<object>} { name, pathCoords, distance }
 */
export async function importRouteFile(file) {
  const content = await file.text();
  const ext = file.name.toLowerCase();

  if (ext.endsWith('.gpx')) {
    return importGPX(content);
  } else if (ext.endsWith('.geojson') || ext.endsWith('.json')) {
    return importGeoJSON(content);
  } else {
    // Try JSON first, then GPX
    try {
      return importGeoJSON(content);
    } catch {
      return importGPX(content);
    }
  }
}

/**
 * Trigger a file download in the browser
 */
export function downloadFile(content, filename, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helpers

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function calculatePathDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDist(coords[i - 1].lat, coords[i - 1].lon, coords[i].lat, coords[i].lon);
  }
  return total;
}

function haversineDist(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
