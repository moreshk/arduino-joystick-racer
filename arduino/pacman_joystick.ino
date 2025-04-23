/*
 * Arduino Joystick Controller for Pacman Game
 * 
 * This sketch reads analog joystick values and sends them
 * via serial as CSV data to be used with the Pacman web game.
 * 
 * Connection:
 * - Joystick VRx to Arduino A0
 * - Joystick VRy to Arduino A1
 * - Joystick GND to Arduino GND
 * - Joystick +5V to Arduino 5V
 * - Optional: Joystick SW (button) to Arduino D2
 */

// Define pins
#define JOY_X A0    // Analog pin for X axis
#define JOY_Y A1    // Analog pin for Y axis
#define JOY_BTN 2   // Digital pin for joystick button (optional)

// Variables for joystick readings
int joystickX = 0;
int joystickY = 0;
int buttonState = 0;
bool buttonPressed = false;

// Variables for smoothing readings
const int numReadings = 5;  // Increased from 3 to 5 for smoother control
int xReadings[numReadings];
int yReadings[numReadings];
int readIndex = 0;
int xTotal = 0;
int yTotal = 0;

// Variables for joystick calibration
int xCenter = 512;
int yCenter = 512;
bool calibrated = false;
const int calibrationSamples = 20;  // Increased from 10 to 20 for better calibration

// Last sent values for change detection
int lastJoystickX = 0;
int lastJoystickY = 0;
bool valueChanged = false;

void setup() {
  // Initialize serial communication at 9600 baud
  Serial.begin(9600);
  
  // Initialize button pin as input with pull-up resistor
  pinMode(JOY_BTN, INPUT_PULLUP);
  
  // Initialize smoothing arrays
  for (int i = 0; i < numReadings; i++) {
    xReadings[i] = 0;
    yReadings[i] = 0;
  }
  
  // Wait for the joystick to stabilize
  delay(200);  // Increased from 100 to 200ms
  
  // Simple auto-calibration
  calibrateJoystick();
}

void calibrateJoystick() {
  // Take multiple readings to find the center position
  int xSum = 0;
  int ySum = 0;
  
  for (int i = 0; i < calibrationSamples; i++) {
    xSum += analogRead(JOY_X);
    ySum += analogRead(JOY_Y);
    delay(20);  // Increased from 10 to 20ms
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
    
    // Apply dampening to further smooth movement
    joystickX = (joystickX * 0.7) + (lastJoystickX * 0.3);
    joystickY = (joystickY * 0.7) + (lastJoystickY * 0.3);
  }
  
  // Check if values have changed enough to send
  if (abs(joystickX - lastJoystickX) > 10 || abs(joystickY - lastJoystickY) > 10) {
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
  if (valueChanged || sendCounter >= 5) {  // Send at least every 5 cycles
    // Send values as CSV string (format: "X,Y,BUTTON")
    // X and Y are analog values 0-1023
    // BUTTON is 1 when pressed, 0 when not pressed
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
  delay(50); // Changed from 30ms to 50ms (20Hz update rate) for even more controlled response
} 