#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_Fingerprint.h>
#include <HardwareSerial.h>

// ---------- WIFI / BACKEND ----------
const char* SSID = "YOUR_WIFI_SSID";
const char* PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND = "http://192.168.1.100:5000";  // backend PC IP

// ---------- PINS ----------
#define FP_RX 16
#define FP_TX 17
#define RELAY_PIN 25

// ---------- RELAY LOGIC (for active-low relay module) ----------
#define RELAY_ON LOW    // Power ON -> Unlock
#define RELAY_OFF HIGH  // Power OFF -> Lock

// ---------- TIMING ----------
#define POLL_INTERVAL_MS 2000
#define UNLOCK_MS 3000
#define FINGERPRINT_COOLDOWN_MS 2000

HardwareSerial FingerSerial(2);
Adafruit_Fingerprint finger(&FingerSerial);

// ---------- STATE ----------
bool isUnlocked = false;
bool waitingForFinger = false;
unsigned long unlockStartTime = 0;
unsigned long lastPollTime = 0;
unsigned long lastFpMatchTime = 0;
String activeSessionId = "";

void lockDoor() {
  digitalWrite(RELAY_PIN, RELAY_OFF);
  isUnlocked = false;
  Serial.println("LOCKED");
}

void unlockDoor() {
  digitalWrite(RELAY_PIN, RELAY_ON);
  isUnlocked = true;
  unlockStartTime = millis();
  Serial.println("UNLOCKED");
}

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

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Failed to connect.");
    return false;
  }

  Serial.printf("[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

bool checkBackendHealth() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  String url = String(BACKEND) + "/health";
  http.begin(url);
  http.setTimeout(3000);

  int code = http.GET();
  if (code != 200) {
    Serial.printf("[Health] /health HTTP %d\n", code);
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    Serial.println("[Health] Invalid JSON from backend health endpoint");
    return false;
  }

  const char* status = doc["status"];
  if (!status || strcmp(status, "ok") != 0) {
    Serial.println("[Health] Backend responded but status is not ok");
    return false;
  }

  Serial.println("[Health] Backend is reachable and healthy");
  return true;
}

bool fetchActiveSession() {
  if (WiFi.status() != WL_CONNECTED) {
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
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    return false;
  }

  if (doc["session_id"].isNull()) {
    return false;
  }

  const char* sid = doc["session_id"];
  if (!sid || sid[0] == '\0') {
    return false;
  }

  activeSessionId = String(sid);
  return true;
}

int getFingerprint() {
  if (finger.getImage() != FINGERPRINT_OK) return -1;
  if (finger.image2Tz() != FINGERPRINT_OK) return -1;
  if (finger.fingerFastSearch() != FINGERPRINT_OK) return -1;
  return finger.fingerID;
}

bool sendFingerprintToBackend(const String& sid, int fingerId) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  String url = String(BACKEND) + "/finger-auth";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  String body = "{\"session_id\":\"" + sid + "\",\"fingerprint_id\":" + String(fingerId) + "}";
  int code = http.POST(body);

  if (code != 200) {
    Serial.printf("[HTTP] /finger-auth HTTP %d\n", code);
    http.end();
    return false;
  }

  String resp = http.getString();
  http.end();

  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, resp) != DeserializationError::Ok) {
    return false;
  }

  const char* status = doc["status"];
  Serial.printf("[Backend] finger-auth status: %s\n", status ? status : "(null)");
  return status && strcmp(status, "granted") == 0;
}

void handleSerial() {
  if (!Serial.available()) {
    return;
  }

  char c = Serial.read();
  if (c == 'u') unlockDoor();
  if (c == 'l') lockDoor();
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("Fingerprint Door Lock Starting");

  pinMode(RELAY_PIN, OUTPUT);
  lockDoor();

  // Relay self-test
  Serial.println("Testing Relay...");
  unlockDoor();
  delay(2000);
  lockDoor();
  Serial.println("Relay Test Done");

  FingerSerial.begin(57600, SERIAL_8N1, FP_RX, FP_TX);
  delay(1000);
  finger.begin(57600);

  while (!finger.verifyPassword()) {
    Serial.println("Fingerprint sensor not found");
    delay(2000);
  }

  Serial.println("Fingerprint sensor ready");

  if (!connectWiFi()) {
    Serial.println("[WiFi] Could not connect at startup. Will retry in loop.");
  } else {
    bool backendHealthy = false;
    for (int i = 0; i < 3 && !backendHealthy; i++) {
      backendHealthy = checkBackendHealth();
      if (!backendHealthy) {
        Serial.println("[Health] Backend not reachable. Retrying...");
        delay(1000);
      }
    }

    if (!backendHealthy) {
      Serial.println("[Health] Startup backend check failed. Device will keep running and retry during polling.");
    }
  }

  Serial.println("System Ready");
}

void loop() {
  handleSerial();

  // Auto-lock after unlock window
  if (isUnlocked && millis() - unlockStartTime > UNLOCK_MS) {
    lockDoor();
  }

  // Poll backend only when not already handling a session
  if (!waitingForFinger && millis() - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = millis();

    if (fetchActiveSession()) {
      waitingForFinger = true;
      Serial.print("[Main] Active session: ");
      Serial.println(activeSessionId);
      Serial.println("[Main] Place finger on sensor");
    }
  }

  if (!waitingForFinger) {
    return;
  }

  // Fingerprint cooldown to avoid duplicate triggers
  if (millis() - lastFpMatchTime < FINGERPRINT_COOLDOWN_MS) {
    return;
  }

  int id = getFingerprint();
  if (id == -1) {
    return;
  }

  lastFpMatchTime = millis();

  Serial.print("Matched ID: ");
  Serial.println(id);

  bool granted = sendFingerprintToBackend(activeSessionId, id);
  if (granted) {
    unlockDoor();
  } else {
    Serial.println("Access denied by backend");
    lockDoor();
  }

  waitingForFinger = false;
  activeSessionId = "";
}
