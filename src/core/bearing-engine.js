/**
 * Bearing & Maneuver Engine
 * Computes heading, classifies turns, generates turn-by-turn instructions
 */

import { computeBearing, haversineDistance } from './haversine.js';

/**
 * Maneuver types
 */
export const MANEUVER = {
  STRAIGHT: 'straight',
  SLIGHT_RIGHT: 'slight_right',
  RIGHT: 'right',
  SHARP_RIGHT: 'sharp_right',
  U_TURN: 'u_turn',
  SHARP_LEFT: 'sharp_left',
  LEFT: 'left',
  SLIGHT_LEFT: 'slight_left',
  ARRIVE: 'arrive',
  DEPART: 'depart',
};

/**
 * Classify a turn based on the angular difference between two bearings
 * @param {number} fromBearing - Current heading in degrees
 * @param {number} toBearing - Target heading in degrees
 * @returns {string} Maneuver type
 */
export function classifyManeuver(fromBearing, toBearing) {
  let diff = toBearing - fromBearing;
  // Normalize to [-180, 180]
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  const absDiff = Math.abs(diff);

  if (absDiff < 15) return MANEUVER.STRAIGHT;
  if (absDiff > 160) return MANEUVER.U_TURN;

  if (diff > 0) {
    // Right turns (positive = clockwise)
    if (absDiff < 45) return MANEUVER.SLIGHT_RIGHT;
    if (absDiff < 120) return MANEUVER.RIGHT;
    return MANEUVER.SHARP_RIGHT;
  } else {
    // Left turns (negative = counterclockwise)
    if (absDiff < 45) return MANEUVER.SLIGHT_LEFT;
    if (absDiff < 120) return MANEUVER.LEFT;
    return MANEUVER.SHARP_LEFT;
  }
}

/**
 * Get human-readable label for a maneuver
 */
export function maneuverLabel(maneuver) {
  const labels = {
    [MANEUVER.STRAIGHT]: 'Continue straight',
    [MANEUVER.SLIGHT_RIGHT]: 'Slight right',
    [MANEUVER.RIGHT]: 'Turn right',
    [MANEUVER.SHARP_RIGHT]: 'Sharp right',
    [MANEUVER.U_TURN]: 'Make a U-turn',
    [MANEUVER.SHARP_LEFT]: 'Sharp left',
    [MANEUVER.LEFT]: 'Turn left',
    [MANEUVER.SLIGHT_LEFT]: 'Slight left',
    [MANEUVER.ARRIVE]: 'You have arrived',
    [MANEUVER.DEPART]: 'Depart',
  };
  return labels[maneuver] || 'Continue';
}

/**
 * Get SVG path for maneuver arrow icon
 */
export function maneuverIcon(maneuver) {
  switch (maneuver) {
    case MANEUVER.STRAIGHT:
      return '<path d="M12 4l0 16M12 4l-4 4M12 4l4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case MANEUVER.RIGHT:
    case MANEUVER.SLIGHT_RIGHT:
      return '<path d="M12 20v-8a4 4 0 014-4h4M20 8l-4-4M20 8l-4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case MANEUVER.SHARP_RIGHT:
      return '<path d="M6 4v12l14-8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case MANEUVER.LEFT:
    case MANEUVER.SLIGHT_LEFT:
      return '<path d="M12 20v-8a4 4 0 00-4-4H4M4 8l4-4M4 8l4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case MANEUVER.SHARP_LEFT:
      return '<path d="M18 4v12L4 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case MANEUVER.U_TURN:
      return '<path d="M6 20v-8a6 6 0 0112 0v2M18 14l-4-4M18 14l4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case MANEUVER.ARRIVE:
      return '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/>';
    default:
      return '<path d="M12 4l0 16M12 4l-4 4M12 4l4 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  }
}

/**
 * Generate turn-by-turn instructions from a path of coordinate points
 * @param {Array} pathCoords - Array of { lat, lon, nodeId }
 * @param {number} minTurnAngle - Minimum angle change to register as a turn (degrees)
 * @returns {Array} Array of instruction objects
 */
export function generateTurnInstructions(pathCoords, minTurnAngle = 20) {
  if (pathCoords.length < 2) return [];

  const instructions = [];

  // First instruction: depart
  const startBearing = computeBearing(
    pathCoords[0].lat, pathCoords[0].lon,
    pathCoords[1].lat, pathCoords[1].lon
  );

  instructions.push({
    maneuver: MANEUVER.DEPART,
    label: 'Start navigation',
    bearing: startBearing,
    lat: pathCoords[0].lat,
    lon: pathCoords[0].lon,
    nodeId: pathCoords[0].nodeId,
    distanceToNext: 0,
    pathIndex: 0,
  });

  // Scan for turns along the path
  let lastBearing = startBearing;
  let accumDistance = 0;

  for (let i = 1; i < pathCoords.length - 1; i++) {
    const segDistance = haversineDistance(
      pathCoords[i - 1].lat, pathCoords[i - 1].lon,
      pathCoords[i].lat, pathCoords[i].lon
    );
    accumDistance += segDistance;

    const nextBearing = computeBearing(
      pathCoords[i].lat, pathCoords[i].lon,
      pathCoords[i + 1].lat, pathCoords[i + 1].lon
    );

    let angleDiff = nextBearing - lastBearing;
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    if (Math.abs(angleDiff) >= minTurnAngle) {
      const maneuver = classifyManeuver(lastBearing, nextBearing);
      const label = maneuverLabel(maneuver);

      // Update the previous instruction's distance-to-next
      if (instructions.length > 0) {
        instructions[instructions.length - 1].distanceToNext = accumDistance;
      }

      instructions.push({
        maneuver,
        label,
        bearing: nextBearing,
        lat: pathCoords[i].lat,
        lon: pathCoords[i].lon,
        nodeId: pathCoords[i].nodeId,
        distanceToNext: 0,
        pathIndex: i,
      });

      accumDistance = 0;
    }

    lastBearing = nextBearing;
  }

  // Final distance for last instruction
  if (pathCoords.length >= 2) {
    const lastSegDist = haversineDistance(
      pathCoords[pathCoords.length - 2].lat, pathCoords[pathCoords.length - 2].lon,
      pathCoords[pathCoords.length - 1].lat, pathCoords[pathCoords.length - 1].lon
    );
    accumDistance += lastSegDist;
  }

  if (instructions.length > 0) {
    instructions[instructions.length - 1].distanceToNext = accumDistance;
  }

  // Arrival instruction
  const lastCoord = pathCoords[pathCoords.length - 1];
  instructions.push({
    maneuver: MANEUVER.ARRIVE,
    label: 'You have arrived',
    bearing: lastBearing,
    lat: lastCoord.lat,
    lon: lastCoord.lon,
    nodeId: lastCoord.nodeId,
    distanceToNext: 0,
    pathIndex: pathCoords.length - 1,
  });

  return instructions;
}

/**
 * Compute current heading from two consecutive GPS fixes
 */
export function computeHeadingFromFixes(lat1, lon1, lat2, lon2) {
  return computeBearing(lat1, lon1, lat2, lon2);
}

/**
 * Find the current instruction index based on GPS position
 * @param {Array} instructions - Turn instructions
 * @param {number} lat - Current latitude
 * @param {number} lon - Current longitude
 * @param {number} currentIndex - Previous instruction index
 * @returns {number} Updated instruction index
 */
export function findCurrentInstruction(instructions, lat, lon, currentIndex = 0) {
  if (!instructions || instructions.length === 0) return 0;

  // Look ahead from current index
  for (let i = Math.max(0, currentIndex); i < instructions.length - 1; i++) {
    const instruction = instructions[i + 1];
    const distToNext = haversineDistance(lat, lon, instruction.lat, instruction.lon);

    // If we're past the current instruction's turn point, advance
    if (i > currentIndex && distToNext < 30) {
      return i + 1;
    }
  }

  // Check if we've passed the current turn point
  if (currentIndex < instructions.length - 1) {
    const next = instructions[currentIndex + 1];
    const dist = haversineDistance(lat, lon, next.lat, next.lon);
    if (dist < 15) {
      return currentIndex + 1;
    }
  }

  return currentIndex;
}
