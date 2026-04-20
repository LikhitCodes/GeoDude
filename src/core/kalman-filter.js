/**
 * 1D Kalman Filter for GPS position smoothing
 * Applied independently to latitude and longitude
 */

export class KalmanFilter {
  /**
   * @param {number} processNoise - How much we expect position to change naturally per step (Q)
   * @param {number} measurementNoise - How noisy the GPS readings are (R)
   * @param {number} initialEstimate - Starting position estimate
   * @param {number} initialUncertainty - Starting uncertainty
   */
  constructor(processNoise = 0.00001, measurementNoise = 0.00005, initialEstimate = 0, initialUncertainty = 1) {
    this.Q = processNoise;       // Process noise covariance
    this.R = measurementNoise;   // Measurement noise covariance
    this.x = initialEstimate;    // State estimate
    this.P = initialUncertainty; // Estimate uncertainty
    this.initialized = false;
  }

  /**
   * Predict step — advance state based on velocity
   * @param {number} velocity - Estimated velocity (change per second in coordinate units)
   * @param {number} dt - Time step in seconds
   */
  predict(velocity = 0, dt = 1) {
    this.x = this.x + velocity * dt;
    this.P = this.P + this.Q * dt;
  }

  /**
   * Update step — incorporate a new GPS measurement
   * @param {number} measurement - New GPS reading
   * @param {number} measurementNoise - Optional override for measurement noise
   * @returns {number} Updated state estimate
   */
  update(measurement, measurementNoise = null) {
    const R = measurementNoise !== null ? measurementNoise : this.R;

    if (!this.initialized) {
      this.x = measurement;
      this.P = R;
      this.initialized = true;
      return this.x;
    }

    // Kalman gain
    const K = this.P / (this.P + R);

    // Update estimate
    this.x = this.x + K * (measurement - this.x);

    // Update uncertainty
    this.P = (1 - K) * this.P;

    return this.x;
  }

  /**
   * Full step: predict then update
   */
  filter(measurement, velocity = 0, dt = 1) {
    this.predict(velocity, dt);
    return this.update(measurement);
  }

  /**
   * Get current state estimate
   */
  getEstimate() {
    return this.x;
  }

  /**
   * Get current uncertainty
   */
  getUncertainty() {
    return this.P;
  }

  /**
   * Reset the filter
   */
  reset() {
    this.x = 0;
    this.P = 1;
    this.initialized = false;
  }
}

/**
 * GPS Position Smoother — wraps two Kalman filters (lat + lon)
 */
export class GPSKalmanSmoother {
  constructor() {
    this.latFilter = new KalmanFilter(0.000001, 0.00003);
    this.lonFilter = new KalmanFilter(0.000001, 0.00003);
    this.lastTimestamp = null;
    this.lastLat = null;
    this.lastLon = null;
  }

  /**
   * Process a new GPS fix
   * @param {number} lat - Raw latitude
   * @param {number} lon - Raw longitude
   * @param {number} timestamp - Timestamp in ms (Date.now())
   * @returns {{lat: number, lon: number}} Smoothed position
   */
  process(lat, lon, timestamp = Date.now()) {
    let dt = 1;
    let velLat = 0;
    let velLon = 0;

    if (this.lastTimestamp !== null) {
      dt = Math.max(0.01, (timestamp - this.lastTimestamp) / 1000);

      // Estimate velocity from previous readings
      if (this.lastLat !== null) {
        velLat = (lat - this.lastLat) / dt;
        velLon = (lon - this.lastLon) / dt;
      }
    }

    const smoothLat = this.latFilter.filter(lat, velLat, dt);
    const smoothLon = this.lonFilter.filter(lon, velLon, dt);

    this.lastTimestamp = timestamp;
    this.lastLat = lat;
    this.lastLon = lon;

    return { lat: smoothLat, lon: smoothLon };
  }

  /**
   * Predict position at a future time (for smooth animation between GPS fixes)
   * @param {number} dtMs - Milliseconds ahead to predict
   * @returns {{lat: number, lon: number}} Predicted position
   */
  predictAhead(dtMs) {
    const dt = dtMs / 1000;
    return {
      lat: this.latFilter.x + (this.lastLat !== null ? ((this.lastLat - this.latFilter.x) / 1) * dt : 0),
      lon: this.lonFilter.x + (this.lastLon !== null ? ((this.lastLon - this.lonFilter.x) / 1) * dt : 0),
    };
  }

  reset() {
    this.latFilter.reset();
    this.lonFilter.reset();
    this.lastTimestamp = null;
    this.lastLat = null;
    this.lastLon = null;
  }
}
