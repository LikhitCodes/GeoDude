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
 * Feature 19: Supports optional IMU Sensor Fusion (Accelerometer)
 */
export class GPSKalmanSmoother {
  constructor() {
    this.latFilter = new KalmanFilter(0.000001, 0.00003);
    this.lonFilter = new KalmanFilter(0.000001, 0.00003);
    this.lastTimestamp = null;
    this.lastLat = null;
    this.lastLon = null;
    // Estimated velocities
    this.velLat = 0;
    this.velLon = 0;
  }

  /**
   * Process a new GPS fix
   * @param {number} lat - Raw latitude
   * @param {number} lon - Raw longitude
   * @param {number} timestamp - Timestamp in ms (Date.now())
   * @param {Object} imu - Optional IMU data { accelLat, accelLon } in degrees/s² (converted from m/s²)
   * @returns {{lat: number, lon: number}} Smoothed position
   */
  process(lat, lon, timestamp = Date.now(), imu = null) {
    let dt = 1;

    if (this.lastTimestamp !== null) {
      dt = Math.max(0.01, (timestamp - this.lastTimestamp) / 1000);

      // Estimate velocity from previous readings if no IMU
      if (this.lastLat !== null) {
        // Base velocity from GPS
        let gpsVelLat = (lat - this.lastLat) / dt;
        let gpsVelLon = (lon - this.lastLon) / dt;
        
        // Feature 19: IMU Sensor Fusion
        // If we have IMU accelerometer data, we can blend the GPS velocity with the integrated IMU acceleration.
        // Assuming accelY is roughly forward/backward and accelX is lateral (simplified).
        // In a real system we'd project this using the heading, but for this demo we'll just demonstrate the fusion concept.
        if (imu && imu.accelLat !== undefined && imu.accelLon !== undefined) {
          // Integrate acceleration: v = v0 + a*t
          let imuVelLat = this.velLat + (imu.accelLat * dt);
          let imuVelLon = this.velLon + (imu.accelLon * dt);
          
          // Complementary filter: trust IMU short-term, GPS long-term
          const alpha = 0.8; 
          this.velLat = (alpha * imuVelLat) + ((1 - alpha) * gpsVelLat);
          this.velLon = (alpha * imuVelLon) + ((1 - alpha) * gpsVelLon);
        } else {
          this.velLat = gpsVelLat;
          this.velLon = gpsVelLon;
        }
      }
    }

    const smoothLat = this.latFilter.filter(lat, this.velLat, dt);
    const smoothLon = this.lonFilter.filter(lon, this.velLon, dt);

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
      lat: this.latFilter.x + (this.velLat * dt),
      lon: this.lonFilter.x + (this.velLon * dt),
    };
  }

  reset() {
    this.latFilter.reset();
    this.lonFilter.reset();
    this.lastTimestamp = null;
    this.lastLat = null;
    this.lastLon = null;
    this.velLat = 0;
    this.velLon = 0;
  }
}

