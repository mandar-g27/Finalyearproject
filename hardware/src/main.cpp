#include <Arduino.h>
#include <Adafruit_Fingerprint.h>

HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

void enrollFingerprint();
void printMenu();

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("\nFingerprint System Ready");

  mySerial.begin(57600, SERIAL_8N1, 16, 17);
  finger.begin(57600);

  if (!finger.verifyPassword()) {
    Serial.println("Sensor NOT found!");
    while (1);
  }

  printMenu();
}

void loop() {

  if (!Serial.available()) return;

  char choice = Serial.read();
  Serial.readStringUntil('\n');

  if (choice == '1') {
    enrollFingerprint();
  }
  else if (choice == '2') {

    Serial.println("Enter ID to delete:");
    while (!Serial.available());
    int id = Serial.parseInt();
    Serial.readStringUntil('\n');

    if (finger.deleteModel(id) == FINGERPRINT_OK)
      Serial.println("Deleted successfully.");
    else
      Serial.println("Delete failed.");
  }
  else if (choice == '3') {

    if (finger.emptyDatabase() == FINGERPRINT_OK)
      Serial.println("All fingerprints deleted.");
    else
      Serial.println("Failed to delete all.");
  }
  else if (choice == '4') {

    finger.getTemplateCount();
    Serial.print("Stored templates: ");
    Serial.println(finger.templateCount);
  }
  else {
    Serial.println("Invalid choice.");
  }

  printMenu();
}

void enrollFingerprint() {

  Serial.println("Place finger...");

  while (finger.getImage() != FINGERPRINT_OK);

  if (finger.image2Tz(1) != FINGERPRINT_OK) {
    Serial.println("Image conversion failed.");
    return;
  }

  if (finger.fingerSearch() == FINGERPRINT_OK) {
    Serial.print("Fingerprint already exists at ID: ");
    Serial.println(finger.fingerID);
    return;
  }

  Serial.println("Remove finger...");
  delay(2000);
  while (finger.getImage() != FINGERPRINT_NOFINGER);

  Serial.println("Place same finger again...");

  while (finger.getImage() != FINGERPRINT_OK);

  if (finger.image2Tz(2) != FINGERPRINT_OK) {
    Serial.println("Second conversion failed.");
    return;
  }

  if (finger.createModel() != FINGERPRINT_OK) {
    Serial.println("Fingerprints did not match.");
    return;
  }

  int id = finger.templateCount + 1;

  if (finger.storeModel(id) == FINGERPRINT_OK) {
    Serial.print("Stored at ID: ");
    Serial.println(id);
  } else {
    Serial.println("Store failed.");
  }
}

void printMenu() {
  Serial.println("\nSelect:");
  Serial.println("1 - Enroll");
  Serial.println("2 - Delete ID");
  Serial.println("3 - Delete All");
  Serial.println("4 - Count");
}