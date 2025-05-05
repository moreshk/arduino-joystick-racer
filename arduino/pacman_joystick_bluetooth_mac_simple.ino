/*
 * Arduino Joystick Controller for Pacman Game with Bluetooth (HC-06)
 * Super simple Mac-optimized version
 * 
 * This is a simplified version for Mac compatibility with minimal code
 * to improve reliability of Bluetooth connections.
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
bool buttonPressed = false;

void setup() {
  // Initialize regular serial for debug output
  Serial.begin(9600);
  
  // Initialize Bluetooth serial
  btSerial.begin(9600);
  
  // Initialize button pin as input with pull-up resistor
  pinMode(JOY_BTN, INPUT_PULLUP);
  
  // Short delay to let everything initialize
  delay(500);
  
  Serial.println("Bluetooth joystick ready!");
  btSerial.println("MacBT,Ready,1");
}

void loop() {
  // Read joystick values directly (no smoothing for simplicity)
  joystickX = analogRead(JOY_X);
  joystickY = analogRead(JOY_Y);
  
  // Read button state (LOW when pressed due to pull-up resistor)
  buttonPressed = (digitalRead(JOY_BTN) == LOW);
  
  // Send joystick values via Bluetooth with simple protocol
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
  
  // Small delay between readings
  delay(50);
} 