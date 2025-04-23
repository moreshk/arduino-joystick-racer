# Arduino Joystick Three.js Demo

This project demonstrates using an Arduino joystick as an input device to control a 3D cube in the browser using Three.js.

## Features

- Real-time control of a 3D cube using an Arduino joystick
- Serial communication between Arduino and browser
- Smooth animation with Three.js
- Simple and intuitive interface

## Requirements

- Arduino board with joystick module
- Modern web browser with Web Serial API support (Chrome recommended)
- Arduino code that sends joystick X,Y values as CSV over serial

## How to Use

1. Connect your Arduino with the joystick module
2. Upload the appropriate Arduino sketch (sends X,Y as CSV)
3. Open the web page and click "Connect Joystick"
4. Select your Arduino from the serial port list
5. Control the cube by moving the joystick

## Technical Details

The project uses:
- Web Serial API for communication with Arduino
- Three.js for 3D rendering
- No additional libraries required 