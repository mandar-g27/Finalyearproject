/*
 * main.cpp — ESP32 Biometric Door Lock
 *
 * Full authentication flow:
 *   1. Connect to Wi-Fi
 *   2. Poll backend /active-session every 2 s until a session awaiting fingerprint appears
 *   3. Ask user to place finger on the R307/R503 sensor
 *   4. Read fingerprint and send the matched ID to /finger-auth
 *   5. If backend returns "granted" → pulse relay to open the lock for 5 s
 *      If backend returns "denied"  → flash red LED & beep (if connected)
 *
 * Wiring (adjust pins to your board):
 *   Fingerprint TX → GPIO 16 (ESP32 RX2)
 *   Fingerprint RX → GPIO 17 (ESP32 TX2)
 *   Relay IN       → GPIO 26  (HIGH = unlock)
 *   Green LED      → GPIO 25  (optional)
 *   Red LED        → GPIO 27  (optional)
 *   Buzzer         → GPIO 14  (optional, active-low or active-high)
 *
 * Libraries required (install via Arduino Library Manager):
 *   - Adafruit Fingerprint Sensor Library
 *   - ArduinoJson  (≥ 6.x)
 *   - WiFi         (built-in ESP32)
 *   - HTTPClient   (built-in ESP32)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_Fingerprint.h>

// ─── Wi-Fi credentials ────────────────────────────────────────────────────────
const char* SSID     = "YOUR_WIFI_SSID";
const char* PASSWORD = "YOUR_WIFI_PASSWORD";

// ─── Backend URL (change to your PC's local IP when running Flask) ────────────
const char* BACKEND = "http://192.168.1.100:5000"; // e.g. 192.168.x.x:5000

// ─── Hardware pins ────────────────────────────────────────────────────────────
#define FP_RX_PIN   16   // ESP32 RX ← Fingerprint TX
#define FP_TX_PIN   17   // ESP32 TX → Fingerprint RX
#define RELAY_PIN   26   // Relay control  (HIGH = unlock)
#define LED_GREEN   25   // Green LED (optional)
#define LED_RED     27   // Red LED   (optional)
#define BUZZER_PIN  14   // Buzzer    (optional)

// ─── Timing ───────────────────────────────────────────────────────────────────
#define POLL_INTERVAL_MS   2000   // How often to poll /active-session
#define LOCK_OPEN_MS       5000   // How long to keep relay open

// ─── Fingerprint sensor ───────────────────────────────────────────────────────
HardwareSerial fpSerial(2);
Adafruit_Fingerprint finger(&fpSerial);

// ─── Globals ──────────────────────────────────────────────────────────────────
String activeSessionId = "";
bool   waitingForFinger = false;

// ─── Forward declarations ─────────────────────────────────────────────────────
bool  connectWiFi();
bool  fetchActiveSession();
int   captureFingerprint();
bool  sendFingerprintToBackend(const String& sid, int fingerId);
void  openLock();
void  denyAccess();
void  setLEDs(bool green, bool red);
void  beep(int times);

// ──────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== SecureGate ESP32 Biometric Lock ===");

  // GPIO setup
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_GREEN,  OUTPUT);
  pinMode(LED_RED,    OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);   // lock closed
  setLEDs(false, false);

  // Fingerprint sensor
  fpSerial.begin(57600, SERIAL_8N1, FP_RX_PIN, FP_TX_PIN);
  finger.begin(57600);
  delay(500);

  if (finger.verifyPassword()) {
    Serial.println("[FP] Sensor found.");
    finger.getTemplateCount();
    Serial.printf("[FP] Stored templates: %d\n", finger.templateCount);
  } else {
    Serial.println("[FP] ERROR: Sensor not found! Check wiring.");
    // Don't halt — still try to connect and poll in case sensor is on different port
  }

  // Wi-Fi
  if (!connectWiFi()) {
    Serial.println("[WiFi] FATAL: Cannot connect. Halting.");
    while (1) delay(1000);
  }
}

// ──────────────────────────────────────────────────────────────────────────────

void loop() {
  // ── Idle state: poll for an active session ────────────────────────────────
  if (!waitingForFinger) {
    static unsigned long lastPoll = 0;
    if (millis() - lastPoll >= POLL_INTERVAL_MS) {
      lastPoll = millis();

      if (fetchActiveSession()) {
        Serial.printf("[Main] Active session: %s\n", activeSessionId.c_str());
        Serial.println("[Main] Place finger on sensor NOW…");
        setLEDs(false, false);
        beep(1);
        waitingForFinger = true;
      }
    }
    return;
  }

  // ── Waiting state: capture fingerprint ────────────────────────────────────
  int fingerId = captureFingerprint();

  if (fingerId < 0) {
    // No finger yet — keep waiting (no timeout here; session timeout is server-side)
    return;
  }

  if (fingerId == 0) {
    // Finger detected but not in database
    Serial.println("[FP] Fingerprint not recognised.");
    denyAccess();
    waitingForFinger = false;
    activeSessionId  = "";
    return;
  }

  // ── Submit fingerprint ID to backend ─────────────────────────────────────
  Serial.printf("[FP] Matched ID: %d — sending to backend.\n", fingerId);

  bool granted = sendFingerprintToBackend(activeSessionId, fingerId);

  if (granted) {
    openLock();
  } else {
    denyAccess();
  }

  waitingForFinger = false;
  activeSessionId  = "";
}

// ──────────────────────────────────────────────────────────────────────────────
// Wi-Fi helper
// ──────────────────────────────────────────────────────────────────────────────

bool connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s", SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(SSID, PASSWORD);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) return false;

  Serial.printf("[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Poll /active-session
// ──────────────────────────────────────────────────────────────────────────────

bool fetchActiveSession() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Wi-Fi lost — reconnecting…");
    connectWiFi();
    return false;
  }

  HTTPClient http;
  String url = String(BACKEND) + "/active-session";
  http.begin(url);
  http.setTimeout(3000);

  int code = http.GET();
  if (code != 200) {
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) return false;

  const char* sid = doc["session_id"];
  if (!sid || strlen(sid) == 0 || strcmp(sid, "null") == 0) return false;

  activeSessionId = String(sid);
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Capture + match fingerprint
// Returns:  -1 = no finger / in-progress
//            0 = finger detected but no match in sensor database
//           >0 = matched template ID
// ──────────────────────────────────────────────────────────────────────────────

int captureFingerprint() {
  uint8_t img = finger.getImage();

  if (img == FINGERPRINT_NOFINGER) return -1;
  if (img != FINGERPRINT_OK)       return -1; // noise / other error

  if (finger.image2Tz() != FINGERPRINT_OK) return -1;
  if (finger.fingerSearch() != FINGERPRINT_OK) return 0; // no match

  Serial.printf("[FP] Matched ID %d, confidence %d\n", finger.fingerID, finger.confidence);
  return finger.fingerID;
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /finger-auth
// ──────────────────────────────────────────────────────────────────────────────

bool sendFingerprintToBackend(const String& sid, int fingerId) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(BACKEND) + "/finger-auth";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // Build JSON body
  String body = "{\"session_id\":\"" + sid + "\",\"fingerprint_id\":" + String(fingerId) + "}";
  int code = http.POST(body);

  if (code != 200) {
    Serial.printf("[HTTP] /finger-auth returned HTTP %d\n", code);
    http.end();
    return false;
  }

  String resp = http.getString();
  http.end();

  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, resp) != DeserializationError::Ok) return false;

  const char* status = doc["status"];
  Serial.printf("[Backend] finger-auth status: %s\n", status ? status : "(null)");
  return status && strcmp(status, "granted") == 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Lock / LED / Buzzer helpers
// ──────────────────────────────────────────────────────────────────────────────

void openLock() {
  Serial.println("[Lock] ACCESS GRANTED — opening lock.");
  setLEDs(true, false);
  beep(2);
  digitalWrite(RELAY_PIN, HIGH);  // energise relay → unlock
  delay(LOCK_OPEN_MS);
  digitalWrite(RELAY_PIN, LOW);   // lock again
  setLEDs(false, false);
  Serial.println("[Lock] Lock closed.");
}

void denyAccess() {
  Serial.println("[Lock] ACCESS DENIED.");
  setLEDs(false, true);
  beep(3);
  delay(2000);
  setLEDs(false, false);
}

void setLEDs(bool green, bool red) {
  digitalWrite(LED_GREEN, green ? HIGH : LOW);
  digitalWrite(LED_RED,   red   ? HIGH : LOW);
}

void beep(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(120);
    digitalWrite(BUZZER_PIN, LOW);
    delay(100);
  }
}