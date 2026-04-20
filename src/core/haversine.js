/**
 * Haversine distance & bearing utilities
 * All angles in decimal degrees, distances in meters
 */

const R = 6371000; // Earth radius in meters

export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Haversine distance between two points in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  return R * c;
}

/**
 * Compute bearing from point 1 to point 2 in degrees [0, 360)
 */
export function computeBearing(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let bearing = toDeg(Math.atan2(y, x));
  return ((bearing % 360) + 360) % 360;
}

/**
 * Compute total path distance along an array of {lat, lon} points
 */
export function pathDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  return total;
}

/**
 * Interpolate position along a path at a given fraction (0–1)
 */
export function interpolateAlongPath(points, fraction) {
  if (fraction <= 0) return { lat: points[0].lat, lon: points[0].lon };
  if (fraction >= 1) {
    const last = points[points.length - 1];
    return { lat: last.lat, lon: last.lon };
  }

  const totalDist = pathDistance(points);
  const targetDist = totalDist * fraction;

  let accum = 0;
  for (let i = 1; i < points.length; i++) {
    const segDist = haversineDistance(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
    if (accum + segDist >= targetDist) {
      const segFraction = (targetDist - accum) / segDist;
      return {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * segFraction,
        lon: points[i - 1].lon + (points[i].lon - points[i - 1].lon) * segFraction,
      };
    }
    accum += segDist;
  }

  const last = points[points.length - 1];
  return { lat: last.lat, lon: last.lon };
}

/**
 * Find the distance from a point to the nearest position on a line segment
 */
export function distanceToSegment(px, py, ax, ay, bx, by) {
  const segLen = haversineDistance(ax, ay, bx, by);
  if (segLen === 0) return haversineDistance(px, py, ax, ay);

  // Project point onto line (approximate in lat/lon space for short segments)
  const dx = bx - ax;
  const dy = by - ay;
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));

  const projLat = ax + t * dx;
  const projLon = ay + t * dy;

  return haversineDistance(px, py, projLat, projLon);
}
