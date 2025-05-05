# Three.js Joystick Controller

This project demonstrates how to use an Arduino with a joystick controller to interact with a Three.js application via USB Serial.

## Features

- USB Serial communication between Arduino and browser
- Real-time joystick input for controlling 3D objects
- Fallback keyboard controls for testing without hardware
- Simple demo showcasing interaction with Three.js
- Joystick visualization with live feedback

## Hardware Requirements

- Arduino board (Uno, Nano, Mega, etc.)
- Analog joystick module with button
- USB cable to connect Arduino to computer

## Connection Setup

Connect the joystick to Arduino using the following connections:

- Joystick VCC → Arduino 5V
- Joystick GND → Arduino GND
- Joystick VRx → Arduino A0
- Joystick VRy → Arduino A1
- Joystick SW (button) → Arduino D4 (optional)

## Arduino Code

Upload the provided Arduino sketch (`arduino/pacman_joystick_usb.ino`) to your Arduino board. This code reads the joystick values and sends them via USB Serial in CSV format.

## Web Application

The web application uses the Web Serial API to communicate with the Arduino and displays a Three.js scene that can be controlled with the joystick.

### How to Run

1. Connect your Arduino to your computer via USB
2. Open the web application in a compatible browser (Chrome or Edge)
3. Click the "Connect USB Serial" button and select your Arduino's port
4. Use the joystick to control the demo

### Browser Compatibility

The Web Serial API is supported in:
- Google Chrome (89+)
- Microsoft Edge (89+)
- Chrome for Android (89+)

It is NOT supported in:
- Firefox
- Safari
- Internet Explorer

## Demo Applications

This repository contains two main demos:

1. **usb-joystick-demo.html** - A simple visualization of joystick input
2. **index.html** - The main Three.js application with joystick control

## Keyboard Fallback

If you don't have the hardware or encounter connection issues, you can use keyboard controls:

- Arrow keys: Move in corresponding directions
- Space: Button press

## Troubleshooting

- **Port not appearing in the selection dialog**: Make sure your Arduino is properly connected and has the correct sketch uploaded.
- **No data received**: Verify the correct baud rate (9600) is set in both Arduino code and the web application.
- **Permission denied**: On macOS, you may need to grant Chrome permission to access the USB device.
- **Connection drops**: Try a different USB cable or port.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 