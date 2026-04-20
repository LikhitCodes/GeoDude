/**
 * Feature 17: Bluetooth Serial Fallback
 * Connects to an ESP32 or compatible BLE module providing a serial characteristic.
 * Expects NMEA sentences over BLE.
 */

import { GPSProvider } from './gps-provider.js';

// Common UART over BLE UUIDs (e.g. Nordic UART Service - NUS)
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Characteristic the module transmits on

export class BluetoothClient extends GPSProvider {
  constructor() {
    super();
    this.device = null;
    this.characteristic = null;
    this.buffer = '';

    // Pre-bind event handlers so addEventListener/removeEventListener use the same reference
    this._boundHandleData = this._handleData.bind(this);
    this._boundOnDisconnected = this._onDisconnected.bind(this);
  }

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth API is not available in this browser.");
    }

    try {
      this.setStatus('connecting');
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID]
      });

      this.device.addEventListener('gattserverdisconnected', this._boundOnDisconnected);

      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      this.characteristic = await service.getCharacteristic(TX_CHAR_UUID);
      
      this.characteristic.addEventListener('characteristicvaluechanged', this._boundHandleData);
      await this.characteristic.startNotifications();
      
      console.log('[Bluetooth] Connected to', this.device.name);
      this.setStatus('connected');
      return true;
    } catch (err) {
      console.error('[Bluetooth] Connection failed:', err);
      this.setStatus('disconnected');
      throw err;
    }
  }

  start() {
    // Bluetooth requires a user gesture to pair, so we don't auto-start.
    // The UI must call connect() directly in response to a click.
    if (this.device && this.device.gatt.connected) {
        this.setStatus('connected');
    }
  }

  stop() {
    if (this.characteristic) {
      this.characteristic.removeEventListener('characteristicvaluechanged', this._boundHandleData);
      this.characteristic.stopNotifications().catch(console.error);
      this.characteristic = null;
    }
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this._boundOnDisconnected);
      if (this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
    }
    this.buffer = ''; // Clear stale data from previous session
    this.setStatus('disconnected');
  }

  _onDisconnected() {
    console.log('[Bluetooth] Device disconnected');
    this.setStatus('disconnected');
    this.characteristic = null;
    // Don't null out device — allows reconnection attempts
  }

  _handleData(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(value);
    
    this.buffer += text;
    
    // Process complete NMEA sentences (delimited by newline)
    let newlineIdx;
    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      let sentence = this.buffer.substring(0, newlineIdx).trim();
      this.buffer = this.buffer.substring(newlineIdx + 1);
      
      if (sentence) {
        this.emit(sentence);
      }
    }
  }
}
