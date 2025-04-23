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
const int numReadings = 5;
int xReadings[numReadings];
int yReadings[numReadings];
int readIndex = 0;
int xTotal = 0;
int yTotal = 0;

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
  
  // Read button state (LOW when pressed due to pull-up resistor)
  int currentButtonState = digitalRead(JOY_BTN);
  
  // Detect button press (not just hold)
  if (currentButtonState == LOW && buttonState == HIGH) {
    buttonPressed = true;
  } else {
    buttonPressed = false;
  }
  
  // Save current button state for next comparison
  buttonState = currentButtonState;
  
  // Send values as CSV string (format: "X,Y,BUTTON")
  // X and Y are analog values 0-1023
  // BUTTON is 1 when pressed, 0 when not pressed
  Serial.print(joystickX);
  Serial.print(",");
  Serial.print(joystickY);
  Serial.print(",");
  Serial.println(buttonPressed ? 1 : 0);
  
  // Small delay to prevent flooding the serial port
  delay(20); // 50Hz update rate
} 