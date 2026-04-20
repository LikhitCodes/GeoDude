/**
 * GPS Simulator
 * Generates synthetic NMEA sentences along a provided polyline
 */

import { GPSProvider } from './gps-provider.js';
import { interpolateAlongPath, haversineDistance, computeBearing } from '../core/haversine.js';
import { NMEAParser } from '../core/nmea-parser.js';

export class GPSSimulator extends GPSProvider {
  constructor() {
    super();
    this.route = []; // Array of {lat, lon}
    this.speed = 11.11; // Base speed in meters/second (approx 40km/h)
    this.speedMultiplier = 1;
    this.currentDistance = 0; // Total distance traveled along route in meters
    this.totalDistance = 0;
    this.intervalId = null;
    this.lastTime = 0;
    this.noiseLevel = 5; // GPS noise radius in meters
  }

  /**
   * Load a route for the simulator to follow
   */
  setRoute(routePoints) {
    this.route = routePoints;
    this.currentDistance = 0;
    this.totalDistance = 0;
    
    if (this.route.length > 1) {
      for (let i = 1; i < this.route.length; i++) {
        this.totalDistance += haversineDistance(
          this.route[i-1].lat, this.route[i-1].lon,
          this.route[i].lat, this.route[i].lon
        );
      }
    }
  }

  setSpeedMultiplier(mult) {
    this.speedMultiplier = mult;
  }

  start() {
    if (this.intervalId) return;
    if (this.route.length === 0) {
      console.warn("Simulator cannot start: no route provided");
      return;
    }

    this.setStatus('connected');
    this.lastTime = Date.now();
    
    // Generate one reading per second (standard GPS rate)
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.setStatus('disconnected');
  }

  tick() {
    const now = Date.now();
    // In actual simulation time, we always advance by 1s multiplied by speedMultiplier
    const dtSeconds = 1 * this.speedMultiplier;
    this.lastTime = now;

    // Advance position
    const distanceToMove = this.speed * dtSeconds;
    this.currentDistance += distanceToMove;

    if (this.currentDistance >= this.totalDistance) {
      // Reached the end, loop or stop? Let's stop.
      this.currentDistance = this.totalDistance;
      this.stop();
    }

    const fraction = this.currentDistance / this.totalDistance;
    let position = interpolateAlongPath(this.route, fraction);

    // Compute synthetic heading
    let heading = 0;
    if (this.currentDistance < this.totalDistance) {
        // Look slightly ahead for stable heading
        const aheadFraction = Math.min(1, (this.currentDistance + 10) / this.totalDistance);
        const aheadPosition = interpolateAlongPath(this.route, aheadFraction);
        heading = computeBearing(position.lat, position.lon, aheadPosition.lat, aheadPosition.lon);
    }

    // Add noise (random offset within a circle)
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * this.noiseLevel;
    // approx meters to degrees conversion
    const latNoise = (radius * Math.cos(angle)) / 111111;
    const lonNoise = (radius * Math.sin(angle)) / (111111 * Math.cos(position.lat * Math.PI / 180));
    
    const noisyLat = position.lat + latNoise;
    const noisyLon = position.lon + lonNoise;

    // Generate NMEA Sentences
    const data = {
      lat: noisyLat,
      lon: noisyLon,
      speedKnots: (this.speed * this.speedMultiplier) * 1.94384, // m/s to knots
      heading: heading,
      fix: 1,
      satellites: 9 + Math.floor(Math.random() * 3), // 9-11 satellites
      hdop: 0.8 + Math.random() * 0.4,
      altitude: 100 + Math.sin(Date.now() / 10000) * 10 // Slowly oscillating altitude
    };

    const gga = NMEAParser.generateGGA(data);
    const rmc = NMEAParser.generateRMC(data);

    // Emit the raw data as if it came from serial
    this.emit(gga + '\r\n' + rmc + '\r\n');
  }
}
