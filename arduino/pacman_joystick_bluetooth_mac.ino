/*
 * Arduino Joystick Controller for Pacman Game with Bluetooth (HC-06)
 * Mac-optimized version
 * 
 * This sketch reads analog joystick values and sends them
 * via Bluetooth (HC-06) as CSV data to be used with the Pacman web game.
 * It includes HC-06 setup commands specifically tuned for Mac compatibility.
 * 
 * Connection:
 * - Joystick VRx to Arduino A0
 * - Joystick VRy to Arduino A1
 * - Joystick GND to Arduino GND
 * - Joystick +5V to Arduino 5V
 * - Optional: Joystick SW (button) to Arduino D2
 * 
 * HC-06 Bluetooth Connection:
 * - HC-06 VCC to Arduino 5V
 * - HC-06 GND to Arduino GND
 * - HC-06 TXD to Arduino D10 (RX)
 * - HC-06 RXD to Arduino D11 (TX)
 */

#include <SoftwareSerial.h>

// Define pins
#define JOY_X A0    // Analog pin for X axis
#define JOY_Y A1    // Analog pin for Y axis
#define JOY_BTN 2   // Digital pin for joystick button (optional)

// Define Bluetooth module pins
#define BT_RX 10    // Arduino pin connected to HC-06 TX
#define BT_TX 11    // Arduino pin connected to HC-06 RX

// Initialize the Bluetooth serial connection
SoftwareSerial btSerial(BT_RX, BT_TX);

// Variables for joystick readings
int joystickX = 0;
int joystickY = 0;
int buttonState = 0;
bool buttonPressed = false;

// Variables for smoothing readings
const int numReadings = 3;  // Reduced from 5 to 3 for more responsive control
int xReadings[numReadings];
int yReadings[numReadings];
int readIndex = 0;
int xTotal = 0;
int yTotal = 0;

// Variables for joystick calibration
int xCenter = 512;
int yCenter = 512;
bool calibrated = false;
const int calibrationSamples = 10; // Reduced from 20 to 10 for faster startup

// Last sent values for change detection
int lastJoystickX = 0;
int lastJoystickY = 0;
bool valueChanged = false;

// Debug flag to print calibration values
bool debugCalibration = true;

// Flag to indicate HC-06 configuration is complete
bool hc06Configured = false;

void setup() {
  // Initialize regular serial for debug output
  Serial.begin(9600);
  
  // Initialize Bluetooth serial - first with 9600 baud which is the default for HC-06
  btSerial.begin(9600);
  
  // Initialize button pin as input with pull-up resistor
  pinMode(JOY_BTN, INPUT_PULLUP);
  
  // Initialize smoothing arrays
  for (int i = 0; i < numReadings; i++) {
    xReadings[i] = 0;
    yReadings[i] = 0;
  }
  
  // Wait for the joystick to stabilize
  delay(500);  // Increased to 500ms for HC-06 to initialize
  
  Serial.println("Configuring HC-06 for Mac compatibility...");
  
  // Configure the HC-06 module with AT commands for better Mac compatibility
  configureHC06();
  
  // Simple auto-calibration
  calibrateJoystick();
  
  // Show calibration values for debugging
  if (debugCalibration) {
    Serial.print("CALIBRATION: X=");
    Serial.print(xCenter);
    Serial.print(", Y=");
    Serial.println(yCenter);
    
    btSerial.print("CALIBRATION: X=");
    btSerial.print(xCenter);
    btSerial.print(", Y=");
    btSerial.println(yCenter);
  }
  
  Serial.println("Bluetooth joystick ready for Mac!");
}

void configureHC06() {
  // Send AT commands to HC-06 to ensure it's in slave mode and has proper settings
  // Note: These will only work if the HC-06 is not already connected to a device
  
  // Command mode check and setup
  Serial.println("Sending AT commands to HC-06...");
  
  // 1. Check if module is responding
  btSerial.print("AT");
  delay(1000);
  
  // 2. Set the name to make it easier to identify
  btSerial.print("AT+NAMEJoystick");
  delay(1000);
  
  // 3. Set the role to slave (0), which is the default but we set it explicitly
  btSerial.print("AT+ROLE=0");
  delay(1000);
  
  // 4. Set the module to use SPP (Serial Port Profile) explicitly
  btSerial.print("AT+CLASS=1101");
  delay(1000);
  
  // 5. Set default PIN code to 1234
  btSerial.print("AT+PIN1234");
  delay(1000);
  
  hc06Configured = true;
  Serial.println("HC-06 configuration completed");
}

void calibrateJoystick() {
  // Take multiple readings to find the center position
  int xSum = 0;
  int ySum = 0;
  
  for (int i = 0; i < calibrationSamples; i++) {
    xSum += analogRead(JOY_X);
    ySum += analogRead(JOY_Y);
    delay(10);  // Reduced from 20 to 10ms
  }
  
  xCenter = xSum / calibrationSamples;
  yCenter = ySum / calibrationSamples;
  calibrated = true;
}

void loop() {
  // Subtract the last reading
  xTotal = xTotal - xReadings[readIndex];
  yTotal = yTotal - yReadings[readIndex];
  
  // Read joystick values (0-1023)
  xReadings[readIndex] = analogRead(JOY_X);
  yReadings[readIndex] = analogRead(JOY_Y);
  
  // Add the reading to the total
  xTotal = xTotal + xReadings[readIndex];
  yTotal = yTotal + yReadings[readIndex];
  
  // Advance to the next position in the array
  readIndex = (readIndex + 1) % numReadings;
  
  // Calculate the average
  joystickX = xTotal / numReadings;
  joystickY = yTotal / numReadings;
  
  // Apply calibration if available
  if (calibrated) {
    // Adjust readings based on calibrated center
    joystickX = map(joystickX, xCenter - 512, xCenter + 512, 0, 1023);
    joystickY = map(joystickY, yCenter - 512, yCenter + 512, 0, 1023);
    
    // Constrain to valid range
    joystickX = constrain(joystickX, 0, 1023);
    joystickY = constrain(joystickY, 0, 1023);
    
    // Apply dampening to further smooth movement (less smoothing)
    joystickX = (joystickX * 0.8) + (lastJoystickX * 0.2); // Changed from 0.7/0.3 to 0.8/0.2
    joystickY = (joystickY * 0.8) + (lastJoystickY * 0.2); // Changed from 0.7/0.3 to 0.8/0.2
  }
  
  // Check if values have changed enough to send
  if (abs(joystickX - lastJoystickX) > 5 || abs(joystickY - lastJoystickY) > 5) { // Lowered from 10 to 5
    valueChanged = true;
    lastJoystickX = joystickX;
    lastJoystickY = joystickY;
  } else {
    valueChanged = false;
  }
  
  // Read button state (LOW when pressed due to pull-up resistor)
  int currentButtonState = digitalRead(JOY_BTN);
  
  // Detect button press (not just hold)
  if (currentButtonState == LOW && buttonState == HIGH) {
    buttonPressed = true;
    valueChanged = true;  // Always send when button pressed
  } else {
    buttonPressed = false;
  }
  
  // Save current button state for next comparison
  buttonState = currentButtonState;
  
  // Only send data when values have changed or occasionally
  static int sendCounter = 0;
  if (valueChanged || sendCounter >= 1) {  // Send more frequently - changed from 3 to 1 for faster responses on Mac
    // Send values as CSV string (format: "X,Y,BUTTON")
    // X and Y are analog values 0-1023
    // BUTTON is 1 when pressed, 0 when not pressed
    
    // Send via Bluetooth
    btSerial.print(joystickX);
    btSerial.print(",");
    btSerial.print(joystickY);
    btSerial.print(",");
    btSerial.println(buttonPressed ? 1 : 0);
    
    // Also send via regular serial for debugging
    Serial.print(joystickX);
    Serial.print(",");
    Serial.print(joystickY);
    Serial.print(",");
    Serial.println(buttonPressed ? 1 : 0);
    
    sendCounter = 0;
  } else {
    sendCounter++;
  }
  
  // Small delay to prevent flooding the serial port
  delay(20); // Changed to 20ms for more responsive control on Mac
} 