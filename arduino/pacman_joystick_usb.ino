/*
 * Arduino Joystick Controller for 3D Airplane Game over USB
 * 
 * This sketch reads analog joystick values and sends them
 * via serial USB as CSV data to be used with the Three.js airplane game.
 * 
 * Connection:
 * - Joystick VRx to Arduino A0 (Roll - left/right banking)
 * - Joystick VRy to Arduino A1 (Pitch - up/down)
 * - Joystick GND to Arduino GND
 * - Joystick +5V to Arduino 5V
 * - Optional: Joystick SW (button) to Arduino D4 (Boost)
 */

// Define analog pins
#define JOY_X A0  // Roll control (left/right banking)
#define JOY_Y A1  // Pitch control (up/down)
#define JOY_BTN 4 // Button pin (optional - for boost)

// Variables for joystick readings
int joystickX = 0;
int joystickY = 0;
int buttonState = 0;

// Variables for smoothing
const int numReadings = 2; // Reduced from 3 for even more responsive controls
int readingsX[numReadings];
int readingsY[numReadings];
int readIndex = 0;
int totalX = 0;
int totalY = 0;

// Calibration values - will be set during setup
int centerX = 512;
int centerY = 512;

// Offset correction for joystick bias
int offsetX = 0;
int offsetY = 0;

// Deadzone for joystick (to prevent drift)
const int deadZone = 25; // Reduced from 30 to allow more sensitivity

// Response curve enhancement
const float responseCurve = 1.3; // Power value for enhanced response (higher = sharper response)

// Debug settings
bool printDebug = true;     // Set to true to print debugging information
unsigned long lastDebugTime = 0;
const unsigned long debugInterval = 2000; // Debug print interval in ms

// Startup flag for initial calibration warning
bool startupMessageSent = false;

// EEPROM usage for storing calibration
#include <EEPROM.h>
const int eepromCenterXAddr = 0;
const int eepromCenterYAddr = 2;
const int eepromValidFlag = 4; // Address to store validation flag
const int eepromValidValue = 123; // Magic value that indicates valid calibration data

void setup() {
  // Initialize serial communication at 9600 baud
  Serial.begin(9600);
  
  // Configure button pin with pull-up resistor
  pinMode(JOY_BTN, INPUT_PULLUP);
  
  // Set up LED for visual feedback
  pinMode(LED_BUILTIN, OUTPUT);
  
  // Wait for serial port to connect (max 3 seconds)
  unsigned long startTime = millis();
  while (!Serial && (millis() - startTime < 3000)) {
    ; // wait for serial port to connect
  }
  
  Serial.println("USB Flight Controller Ready");
  
  // Try to read calibration from EEPROM first
  if (loadCalibrationFromEEPROM()) {
    Serial.println("Loaded calibration from memory:");
    Serial.print("Center X: "); Serial.print(centerX);
    Serial.print(", Center Y: "); Serial.println(centerY);
  } else {
    // No valid saved calibration, perform fresh calibration
    Serial.println("No saved calibration found.");
    calibrateJoystick();
    saveCalibrationToEEPROM();
  }
  
  // Calculate offset from ideal center (512)
  offsetX = 512 - centerX;
  offsetY = 512 - centerY;
  
  // Initialize smoothing arrays with calibrated center values
  for (int i = 0; i < numReadings; i++) {
    readingsX[i] = centerX;
    readingsY[i] = centerY;
    totalX += readingsX[i];
    totalY += readingsY[i];
  }

  // Print initial calibration values
  Serial.println("Current calibration values:");
  Serial.print("Center X: "); Serial.print(centerX);
  Serial.print(", Center Y: "); Serial.println(centerY);
  Serial.print("Offset X: "); Serial.print(offsetX);
  Serial.print(", Offset Y: "); Serial.println(offsetY);
  Serial.println("Deadzone: "); Serial.println(deadZone);
  Serial.println("Response curve: "); Serial.println(responseCurve);
}

// Save calibration to EEPROM
void saveCalibrationToEEPROM() {
  // Store the magic validation value
  EEPROM.write(eepromValidFlag, eepromValidValue);
  
  // Store centerX value (2 bytes)
  EEPROM.write(eepromCenterXAddr, lowByte(centerX));
  EEPROM.write(eepromCenterXAddr + 1, highByte(centerX));
  
  // Store centerY value (2 bytes)
  EEPROM.write(eepromCenterYAddr, lowByte(centerY));
  EEPROM.write(eepromCenterYAddr + 1, highByte(centerY));
  
  Serial.println("Calibration saved to memory");
}

// Load calibration from EEPROM
bool loadCalibrationFromEEPROM() {
  // Check if we have valid calibration data
  if (EEPROM.read(eepromValidFlag) != eepromValidValue) {
    return false;
  }
  
  // Read centerX (2 bytes)
  byte lowX = EEPROM.read(eepromCenterXAddr);
  byte highX = EEPROM.read(eepromCenterXAddr + 1);
  centerX = word(highX, lowX);
  
  // Read centerY (2 bytes)
  byte lowY = EEPROM.read(eepromCenterYAddr);
  byte highY = EEPROM.read(eepromCenterYAddr + 1);
  centerY = word(highY, lowY);
  
  // Validate values are in reasonable range
  if (centerX < 200 || centerX > 800 || centerY < 200 || centerY > 800) {
    // Values seem wrong, recalibrate
    return false;
  }
  
  return true;
}

// Improved calibration function
void calibrateJoystick() {
  // Take multiple readings to find the actual center
  const int calSamples = 30;  // Increased from 20
  long sumX = 0;
  long sumY = 0;
  
  Serial.println("Calibrating joystick...");
  Serial.println("Please leave joystick centered!");
  
  // Wait a moment for the user to center the joystick
  delay(1000);
  
  // Take multiple samples
  for (int i = 0; i < calSamples; i++) {
    sumX += analogRead(JOY_X);
    sumY += analogRead(JOY_Y);
    Serial.print(".");
    
    // Visual feedback with LED
    digitalWrite(LED_BUILTIN, i % 2);
    
    delay(50);
  }
  
  // Calculate average center position
  centerX = sumX / calSamples;
  centerY = sumY / calSamples;
  
  // Turn off LED
  digitalWrite(LED_BUILTIN, LOW);
  
  Serial.println("\nCalibration complete!");
  Serial.print("Raw center X: "); Serial.print(centerX);
  Serial.print(", Y: "); Serial.println(centerY);
}

// Check if button was held down for calibration
boolean checkForCalibrationTrigger() {
  // If button is pressed for 2 seconds, trigger calibration
  if (digitalRead(JOY_BTN) == LOW) {
    // Wait to see if it's a long press
    unsigned long pressStartTime = millis();
    
    // Keep checking the button
    while (digitalRead(JOY_BTN) == LOW) {
      // Blink the built-in LED to indicate waiting
      digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
      delay(100);
      
      // If held for 2 seconds, trigger calibration
      if (millis() - pressStartTime > 2000) {
        Serial.println("Calibration triggered by button long press!");
        return true;
      }
    }
  }
  return false;
}

// Apply response curve to make controls more responsive
int applyResponseCurve(int input) {
  // Convert to -512 to 512 range
  float normalized = (input - 512) / 512.0;
  
  // Apply deadzone
  if (abs(normalized) < deadZone/512.0) {
    return 512;
  }
  
  // Apply exponential response curve for more sensitivity
  float sign = normalized < 0 ? -1.0 : 1.0;
  float response = sign * pow(abs(normalized), responseCurve);
  
  // Scale back to 0-1023 range and return
  return constrain(512 + (response * 512.0), 0, 1023);
}

void loop() {
  // Check for button-triggered calibration
  if (checkForCalibrationTrigger()) {
    calibrateJoystick();
    saveCalibrationToEEPROM();
    // Reinitialize the smoothing arrays
    for (int i = 0; i < numReadings; i++) {
      readingsX[i] = centerX;
      readingsY[i] = centerY;
    }
    totalX = centerX * numReadings;
    totalY = centerY * numReadings;
  }
  
  // Send a startup message once when the game connects
  if (!startupMessageSent && millis() > 5000) {
    Serial.println("IMPORTANT: Hold down the joystick button for 2 seconds to recalibrate if needed");
    startupMessageSent = true;
  }
  
  // Read raw joystick values (0-1023)
  int rawX = analogRead(JOY_X);
  int rawY = analogRead(JOY_Y);
  
  // Update smoothing arrays
  totalX = totalX - readingsX[readIndex] + rawX;
  totalY = totalY - readingsY[readIndex] + rawY;
  readingsX[readIndex] = rawX;
  readingsY[readIndex] = rawY;
  readIndex = (readIndex + 1) % numReadings;
  
  // Calculate smoothed values
  joystickX = totalX / numReadings;
  joystickY = totalY / numReadings;
  
  // Apply offset correction
  joystickX += offsetX;
  joystickY += offsetY;
  
  // Clamp values to valid range (0-1023)
  joystickX = constrain(joystickX, 0, 1023);
  joystickY = constrain(joystickY, 0, 1023);
  
  // Apply response curve for more sensitivity
  joystickX = applyResponseCurve(joystickX);
  joystickY = applyResponseCurve(joystickY);
  
  // Read button state (LOW when pressed because of pull-up resistor)
  buttonState = digitalRead(JOY_BTN) == LOW ? 1 : 0;
  
  // Send values as CSV string (format: "X,Y,BUTTON")
  Serial.print(joystickX);
  Serial.print(",");
  Serial.print(joystickY);
  Serial.print(",");
  Serial.println(buttonState);
  
  // Print debug information periodically
  if (printDebug && millis() - lastDebugTime > debugInterval) {
    lastDebugTime = millis();
    
    Serial.println("Debug Info:");
    Serial.print("Raw X: "); Serial.print(rawX);
    Serial.print(", Raw Y: "); Serial.println(rawY);
    Serial.print("Smoothed X: "); Serial.print(joystickX);
    Serial.print(", Smoothed Y: "); Serial.println(joystickY);
    Serial.print("Centered at: X="); Serial.print(centerX);
    Serial.print(", Y="); Serial.println(centerY);
    Serial.print("Offset X: "); Serial.print(offsetX);
    Serial.print(", Offset Y: "); Serial.println(offsetY);
    Serial.println("-------------------");
  }
  
  // Small delay to prevent flooding the serial port
  delay(8); // Further reduced from 10 for more responsive controls
} 