export const CONFIG = {
  // GPS configuration
  speedMultiplier: 1, // for simulator
  
  // Navigation
  offRouteThreshold: 25, // meters
  arrivalThreshold: 15,  // meters
  minTurnAngle: 20,      // degrees
  
  // Map download
  offlineZoomLevels: [14, 15, 16], // Restrict to keep demo size small
  graphPadding: 0.005,   // Bounding box padding for Overpass (degrees)
};

export function formatDistance(meters) {
  if (meters < 1000) {
      return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatTime(seconds) {
  if (seconds < 60) return '< 1 min';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mRem = m % 60;
  return `${h}h ${mRem}m`;
}
