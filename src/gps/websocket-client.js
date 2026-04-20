/**
 * WebSocket Client
 * Connects to ESP32 over WiFi to receive real NMEA sentences
 */

import { GPSProvider } from './gps-provider.js';

export class WebSocketClient extends GPSProvider {
  constructor(url = 'ws://192.168.4.1:81') {
    super();
    this.url = url;
    this.ws = null;
    this.reconnectTimeout = null;
    this.shouldReconnect = true;
  }

  start() {
    this.shouldReconnect = true;
    this.connect();
  }

  stop() {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('[WebSocket] Connected to ESP32');
        this.setStatus('connected');
      };

      this.ws.onmessage = (event) => {
        // Expected to receive raw NMEA strings from ESP32
        this.emit(event.data);
      };

      this.ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
        // Error will result in close event, where reconn logic is handled
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.setStatus('disconnected');
        this.ws = null;
        
        if (this.shouldReconnect) {
          console.log('[WebSocket] Reconnecting in 3s...');
          this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
        }
      };
    } catch (e) {
      console.error('[WebSocket] Setup exception:', e);
      if (this.shouldReconnect) {
          this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
      }
    }
  }
}
