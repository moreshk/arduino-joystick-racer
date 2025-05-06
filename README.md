# 3D Airplane Challenge Game

A ThreeJS-based flying game where you control an airplane using a USB joystick connected to an Arduino.

## Game Objective

Fly your aircraft through a series of circular hoops in a circuit and try to beat the benchmark lap time. Each time you complete a lap under the target time, the target time for the next lap decreases, making the challenge progressively harder.

The game ends when you complete all laps or when you fail to beat the target time.

## Controls

The game uses a physical joystick connected via Arduino:

- **Joystick Forward/Backward**: Pitch the aircraft nose down/up
- **Joystick Left/Right**: Bank and turn the aircraft left/right
- **Button Press**: Activate speed boost

Keyboard controls are provided as a fallback:

- **Arrow Keys**: Control the aircraft
- **Spacebar**: Activate speed boost

## Flight Mechanics

The game implements simplified flight physics:
- The aircraft moves in the direction its nose is pointing
- Pulling back on the joystick causes the plane to climb
- Pushing forward causes the plane to dive
- Banking left/right causes the plane to turn in that direction
- Gravity affects the aircraft, causing it to lose altitude if not compensated for
- Speed is affected by the aircraft's attitude (nose up = slower, nose down = faster)

## Hardware Requirements

1. Arduino board (Uno, Nano, etc.)
2. Analog joystick with button
3. USB cable to connect Arduino to computer
4. Modern web browser with WebSerial API support (Chrome, Edge)

## Arduino Setup

1. Connect the joystick to your Arduino:
   - VRx to Arduino A0 (Roll - left/right banking)
   - VRy to Arduino A1 (Pitch - up/down)
   - GND to Arduino GND
   - +5V to Arduino 5V
   - SW (button) to Arduino D4

2. Upload the provided Arduino sketch (`arduino/pacman_joystick_usb.ino`) to your Arduino board.

## Running the Game

1. Connect your Arduino to your computer via USB
2. Launch the game in your web browser
3. Click "Connect Controller" to connect to your Arduino
4. Try to fly through all the hoops within the time limit!

## Development

This project uses:
- Three.js for 3D graphics
- Web Serial API for USB communication
- Vite as the build tool

### Setup for Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Troubleshooting

- **Controller Not Connecting**: Make sure your Arduino is properly connected and the correct sketch is uploaded.
- **Permission Errors**: Some operating systems may require additional permissions for USB access.
- **Browser Compatibility**: The Web Serial API is only supported in Chromium-based browsers (Chrome, Edge). 