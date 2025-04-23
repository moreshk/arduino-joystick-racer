/*
 * Arduino Joystick Serial Output
 * 
 * This sketch reads analog joystick values and sends them
 * via serial as CSV data to be used with the Three.js demo.
 * 
 * Connection:
 * - Joystick VRx to Arduino A0
 * - Joystick VRy to Arduino A1
 * - Joystick GND to Arduino GND
 * - Joystick +5V to Arduino 5V
 */

// Define analog pins
#define JOY_X A0
#define JOY_Y A1

// Variable for reading joystick values
int joystickX = 0;
int joystickY = 0;

void setup() {
  // Initialize serial communication at 9600 baud
  Serial.begin(9600);
}

void loop() {
  // Read joystick values (0-1023)
  joystickX = analogRead(JOY_X);
  joystickY = analogRead(JOY_Y);
  
  // Send values as CSV string (format: "X,Y")
  Serial.print(joystickX);
  Serial.print(",");
  Serial.println(joystickY);
  
  // Small delay to prevent flooding the serial port
  delay(50);
} 