/**
 * ============================================================
 *  TrailSync ESP32 Firmware
 * ============================================================
 *  Reads NMEA sentences from a NEO-6M GPS module on Serial2
 *  and broadcasts them to the TrailSync PWA via:
 *    1. WiFi Access Point  →  WebSocket server on port 81
 *    2. Bluetooth Low Energy  →  Nordic UART Service (NUS)
 *
 *  Also sends periodic JSON diagnostics that the app renders
 *  in the GPS Settings → Hardware Diagnostics panel.
 *
 *  Wiring (ESP32 ↔ NEO-6M):
 *    ESP32 3.3V   → VCC
 *    ESP32 GND    → GND
 *    ESP32 GPIO16 → TX  (GPS transmits, ESP receives)
 *    ESP32 GPIO17 → RX  (GPS receives, ESP transmits)
 *
 *  Required Arduino Libraries (install via Library Manager or CLI):
 *    1. WebSockets by Markus Sattler  (arduinoWebSockets)
 *    2. TinyGPSPlus by Mikal Hart
 *    3. ArduinoBLE                    (for BLE support)
 *
 *  Board: ESP32 Dev Module (via "esp32 by Espressif" board package)
 *
 *  Arduino CLI install commands:
 *    arduino-cli core install esp32:esp32
 *    arduino-cli lib install "WebSockets"
 *    arduino-cli lib install "TinyGPSPlus"
 *    arduino-cli lib install "ArduinoBLE"
 * ============================================================
 */

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <TinyGPSPlus.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ─────────────────────────── CONFIG ───────────────────────────

// WiFi Access Point credentials
const char* AP_SSID     = "TrailSync_GPS";
const char* AP_PASSWORD = "trailsync123";   // min 8 chars; set "" for open network

// GPS serial pins (Hardware Serial2)
#define GPS_RX_PIN 16   // ESP32 RX ← GPS TX
#define GPS_TX_PIN 17   // ESP32 TX → GPS RX
#define GPS_BAUD   9600 // NEO-6M default baud rate

// WebSocket server port (must match ws://192.168.4.1:81 in the app)
#define WS_PORT 81

// How often to send diagnostics JSON (milliseconds)
#define DIAG_INTERVAL_MS 5000

// Firmware version string shown in the app
#define FIRMWARE_VERSION "1.0.0"

// BLE Nordic UART Service UUIDs (must match bluetooth-client.js)
#define NUS_SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX_CHARACTERISTIC   "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // App writes here
#define NUS_TX_CHARACTERISTIC   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // App reads from here

// ─────────────────────────── GLOBALS ──────────────────────────

WebSocketsServer webSocket(WS_PORT);
TinyGPSPlus     gps;

// BLE globals
BLEServer*         pBLEServer         = nullptr;
BLECharacteristic* pTxCharacteristic  = nullptr;
bool               bleDeviceConnected = false;
bool               bleOldConnected    = false;

// NMEA line buffer (max NMEA sentence is ~82 chars, use 256 for safety)
char nmeaBuffer[256];
int  nmeaIdx = 0;

// Timing
unsigned long lastDiagMillis   = 0;
unsigned long bootMillis       = 0;

// Track connected WebSocket clients
uint8_t wsClientCount = 0;

// ─────────────────── BLE CALLBACKS ────────────────────────────

class BLEServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    bleDeviceConnected = true;
    Serial.println("[BLE] Client connected");
  }
  void onDisconnect(BLEServer* pServer) override {
    bleDeviceConnected = false;
    Serial.println("[BLE] Client disconnected");
  }
};

// Optional: handle writes from the app (not currently used by TrailSync)
class BLERxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pChar) override {
    std::string rx = pChar->getValue();
    if (rx.length() > 0) {
      Serial.printf("[BLE] Received: %s\n", rx.c_str());
    }
  }
};

// ─────────────────── WebSocket CALLBACKS ──────────────────────

void onWebSocketEvent(uint8_t clientNum, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      wsClientCount++;
      Serial.printf("[WS] Client #%u connected. Total: %u\n", clientNum, wsClientCount);
      break;

    case WStype_DISCONNECTED:
      if (wsClientCount > 0) wsClientCount--;
      Serial.printf("[WS] Client #%u disconnected. Total: %u\n", clientNum, wsClientCount);
      break;

    case WStype_TEXT:
      // The app doesn't send commands, but log if it does
      Serial.printf("[WS] Received from #%u: %s\n", clientNum, payload);
      break;

    default:
      break;
  }
}

// ─────────────────────── SETUP ────────────────────────────────

void setup() {
  // Debug serial
  Serial.begin(115200);
  Serial.println();
  Serial.println("================================");
  Serial.println("  TrailSync ESP32 GPS Firmware");
  Serial.println("================================");

  bootMillis = millis();

  // ---- GPS Serial ----
  Serial2.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.printf("[GPS] Serial2 started on RX=%d TX=%d @ %d baud\n", GPS_RX_PIN, GPS_TX_PIN, GPS_BAUD);

  // ---- WiFi Access Point ----
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  delay(100);
  Serial.printf("[WiFi] AP started: SSID=\"%s\"  IP=%s\n", AP_SSID, WiFi.softAPIP().toString().c_str());

  // ---- WebSocket Server ----
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
  Serial.printf("[WS] WebSocket server started on port %d\n", WS_PORT);
  Serial.printf("[WS] Connect from app: ws://%s:%d\n", WiFi.softAPIP().toString().c_str(), WS_PORT);

  // ---- BLE Setup ----
  setupBLE();

  Serial.println("[READY] Waiting for GPS fix and client connections...");
  Serial.println();
}

// ─────────────────────── BLE INIT ─────────────────────────────

void setupBLE() {
  BLEDevice::init("TrailSync_GPS");
  pBLEServer = BLEDevice::createServer();
  pBLEServer->setCallbacks(new BLEServerCB());

  // Create Nordic UART Service
  BLEService* pService = pBLEServer->createService(NUS_SERVICE_UUID);

  // TX Characteristic — the app subscribes to notifications on this
  pTxCharacteristic = pService->createCharacteristic(
    NUS_TX_CHARACTERISTIC,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  // RX Characteristic — the app could write here (unused by TrailSync)
  BLECharacteristic* pRxCharacteristic = pService->createCharacteristic(
    NUS_RX_CHARACTERISTIC,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pRxCharacteristic->setCallbacks(new BLERxCB());

  pService->start();

  // Start advertising
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(NUS_SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("[BLE] Nordic UART Service started, advertising as \"TrailSync_GPS\"");
}

// ─────────────────────── MAIN LOOP ────────────────────────────

void loop() {
  // 1. Service WebSocket events
  webSocket.loop();

  // 2. Handle BLE reconnection advertising
  if (!bleDeviceConnected && bleOldConnected) {
    delay(500);
    pBLEServer->startAdvertising();
    bleOldConnected = false;
  }
  if (bleDeviceConnected && !bleOldConnected) {
    bleOldConnected = true;
  }

  // 3. Read NMEA from GPS and broadcast
  while (Serial2.available()) {
    char c = Serial2.read();

    // Feed TinyGPS++ for satellite/fix info (used in diagnostics)
    gps.encode(c);

    // Build NMEA line
    if (c == '\n' || c == '\r') {
      if (nmeaIdx > 0) {
        nmeaBuffer[nmeaIdx] = '\0';

        // Only forward valid NMEA sentences (start with '$')
        if (nmeaBuffer[0] == '$') {
          broadcastNMEA(nmeaBuffer);
        }

        nmeaIdx = 0;
      }
    } else {
      if (nmeaIdx < (int)(sizeof(nmeaBuffer) - 1)) {
        nmeaBuffer[nmeaIdx++] = c;
      }
    }
  }

  // 4. Send periodic diagnostics
  if (millis() - lastDiagMillis >= DIAG_INTERVAL_MS) {
    lastDiagMillis = millis();
    sendDiagnostics();
  }
}

// ────────────────── BROADCAST NMEA ────────────────────────────

void broadcastNMEA(const char* sentence) {
  // --- WebSocket ---
  if (wsClientCount > 0) {
    webSocket.broadcastTXT(sentence);
  }

  // --- BLE ---
  if (bleDeviceConnected && pTxCharacteristic != nullptr) {
    // BLE MTU is typically 20 bytes; chunk the sentence if needed
    size_t len = strlen(sentence);
    size_t offset = 0;
    while (offset < len) {
      size_t chunk = min((size_t)20, len - offset);
      pTxCharacteristic->setValue((uint8_t*)(sentence + offset), chunk);
      pTxCharacteristic->notify();
      offset += chunk;
      delay(10); // Small delay between BLE chunks to prevent overflow
    }
    // Send newline delimiter so the app knows the sentence is complete
    pTxCharacteristic->setValue((uint8_t*)"\n", 1);
    pTxCharacteristic->notify();
  }

  // --- Debug serial ---
  Serial.println(sentence);
}

// ────────────────── DIAGNOSTICS JSON ──────────────────────────

void sendDiagnostics() {
  // Gather data
  unsigned long uptimeSec = (millis() - bootMillis) / 1000;
  int satellites = gps.satellites.isValid() ? gps.satellites.value() : 0;
  int wifiRSSI   = WiFi.RSSI(); // Signal strength (dBm), relevant when in STA mode

  // Simple battery estimation via ADC (optional: connect battery divider to GPIO 35)
  // If no battery circuit, this will just read noise — harmless placeholder
  int rawADC    = analogRead(35);
  int batteryPct = map(constrain(rawADC, 1800, 4095), 1800, 4095, 0, 100);

  // Build JSON matching what gps-settings.js expects:
  //   { type: "status", battery, signal, firmware, uptime, satellites }
  char json[256];
  snprintf(json, sizeof(json),
    "{\"type\":\"status\",\"battery\":%d,\"signal\":%d,\"firmware\":\"%s\",\"uptime\":%lu,\"satellites\":%d}",
    batteryPct,
    wifiRSSI,
    FIRMWARE_VERSION,
    uptimeSec,
    satellites
  );

  // Send only via WebSocket (BLE channel is reserved for NMEA)
  if (wsClientCount > 0) {
    webSocket.broadcastTXT(json);
  }

  // Debug
  Serial.printf("[DIAG] Sats=%d  Uptime=%lus  Clients(WS=%u BLE=%s)\n",
    satellites, uptimeSec, wsClientCount, bleDeviceConnected ? "yes" : "no");
}
