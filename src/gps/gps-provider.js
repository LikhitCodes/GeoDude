/**
 * GPS Provider Interface
 * Abstract class for handling GPS data sources
 */

export class GPSProvider {
  constructor() {
    this.callbacks = [];
    this.statusCallbacks = [];
    this.status = 'disconnected';
  }

  /**
   * Listen for new GPS data
   */
  onData(cb) {
    this.callbacks.push(cb);
    return () => this.callbacks = this.callbacks.filter(c => c !== cb);
  }

  /**
   * Listen for connection status changes
   */
  onStatusChange(cb) {
    this.statusCallbacks.push(cb);
    return () => this.statusCallbacks = this.statusCallbacks.filter(c => c !== cb);
  }

  /**
   * Update status and notify listeners
   */
  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusCallbacks.forEach(cb => cb(this.status));
    }
  }

  /**
   * Emit new GPS data to listeners
   */
  emit(data) {
    this.callbacks.forEach(cb => cb(data));
  }

  start() { throw new Error('Not implemented'); }
  stop() { throw new Error('Not implemented'); }
}
