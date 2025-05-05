/*
 * Arduino Joystick Controller for Pacman Game over USB
 * 
 * This sketch reads analog joystick values and sends them
 * via serial USB as CSV data to be used with the Three.js demo.
 * 
 * Connection:
 * - Joystick VRx to Arduino A0
 * - Joystick VRy to Arduino A1
 * - Joystick GND to Arduino GND
 * - Joystick +5V to Arduino 5V
 * - Optional: Joystick SW (button) to Arduino D4
 */

// Define analog pins
#define JOY_X A0
#define JOY_Y A1
#define JOY_BTN 4  // Button pin (optional)

// Variables for joystick readings
int joystickX = 0;
int joystickY = 0;
int buttonState = 0;

// Variables for smoothing (optional)
const int numReadings = 3;
int readingsX[numReadings];
int readingsY[numReadings];
int readIndex = 0;
int totalX = 0;
int totalY = 0;

void setup() {
  // Initialize serial communication at 9600 baud
  Serial.begin(9600);
  
  // Configure button pin with pull-up resistor
  pinMode(JOY_BTN, INPUT_PULLUP);
  
  // Initialize smoothing arrays
  for (int i = 0; i < numReadings; i++) {
    readingsX[i] = 512;
    readingsY[i] = 512;
    totalX += readingsX[i];
    totalY += readingsY[i];
  }
  
  // Wait for serial port to connect
  while (!Serial) {
    ; // wait for serial port to connect
  }
  
  Serial.println("USB Joystick Ready");
}

void loop() {
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
  
  // Read button state (LOW when pressed because of pull-up resistor)
  buttonState = digitalRead(JOY_BTN) == LOW ? 1 : 0;
  
  // Send values as CSV string (format: "X,Y,BUTTON")
  Serial.print(joystickX);
  Serial.print(",");
  Serial.print(joystickY);
  Serial.print(",");
  Serial.println(buttonState);
  
  // Small delay to prevent flooding the serial port
  delay(30);
} 