/*
 * Arduino Joystick Serial Output with Auto-Calibration
 * 
 * This sketch reads analog joystick values with auto-calibration
 * and sends them via serial as CSV data to be used with the Three.js demo.
 * 
 * Connection:
 * - Joystick VRx to Arduino A0
 * - Joystick VRy to Arduino A1
 * - Joystick SW (button) to Arduino D2 (optional)
 * - Joystick GND to Arduino GND
 * - Joystick +5V to Arduino 5V
 */

// Define analog pins
#define JOY_X A0
#define JOY_Y A1
#define JOY_BTN 2  // Button pin (optional)

// Variables for joystick readings
int joystickX = 0;
int joystickY = 0;
int buttonState = 0;

// Variables for calibration
int centerX = 512;
int centerY = 512;
int deadzone = 20;  // Increased deadzone for stability
bool calibrated = false;

void setup() {
  // Initialize serial communication
  Serial.begin(9600);
  
  // Initialize button pin if used
  pinMode(JOY_BTN, INPUT_PULLUP);
  
  // Wait for serial connection to establish
  delay(1000);
  
  // Perform initial calibration
  calibrateJoystick();
}

void calibrateJoystick() {
  Serial.println("Calibrating joystick...");
  
  // Take multiple readings to get a stable center value
  long sumX = 0;
  long sumY = 0;
  const int samples = 20;
  
  for (int i = 0; i < samples; i++) {
    sumX += analogRead(JOY_X);
    sumY += analogRead(JOY_Y);
    delay(20);
  }
  
  // Calculate average center position
  centerX = sumX / samples;
  centerY = sumY / samples;
  
  Serial.print("Calibrated center: X=");
  Serial.print(centerX);
  Serial.print(", Y=");
  Serial.println(centerY);
  
  calibrated = true;
}

void loop() {
  // Read raw joystick values
  joystickX = analogRead(JOY_X);
  joystickY = analogRead(JOY_Y);
  
  // Read button state if connected (active low)
  buttonState = digitalRead(JOY_BTN) == LOW ? 1 : 0;
  
  // Apply calibration and filtering
  int calibratedX = joystickX - centerX + 512;
  int calibratedY = joystickY - centerY + 512;
  
  // Apply deadzone
  if (abs(calibratedX - 512) < deadzone) calibratedX = 512;
  if (abs(calibratedY - 512) < deadzone) calibratedY = 512;
  
  // Send values as CSV string (format: "X,Y,BUTTON")
  Serial.print(calibratedX);
  Serial.print(",");
  Serial.print(calibratedY);
  Serial.print(",");
  Serial.println(buttonState);
  
  // Small delay to prevent flooding the serial port
  delay(50);
} 