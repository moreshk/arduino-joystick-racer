# Arduino Joystick Pacman Game

This project demonstrates using an Arduino joystick as an input device to control a Pacman game in the browser.

![Pacman Game](https://via.placeholder.com/800x600.png?text=Arduino+Joystick+Pacman+Game)

## Features

- Classic Pacman gameplay with maze, dots, power pills, and ghosts
- Real-time control using an Arduino joystick
- Sound effects for enhanced gaming experience
- Responsive design that adapts to different screen sizes
- Pure JavaScript implementation with no dependencies
- Uses HTML5 Canvas for rendering

## Requirements

- Arduino board with analog joystick module (and optional button)
- Modern web browser with Web Serial API support (Chrome recommended)
- Sound files placed in the `sounds` directory (optional but recommended)

## How to Use

1. Connect your Arduino with the joystick module
2. Upload the `arduino/pacman_joystick.ino` sketch to your Arduino
3. Open the web page in a Chrome browser
4. Click "Connect Joystick" button
5. Select your Arduino from the serial port list
6. Control Pacman by moving the joystick:
   - Move joystick up: Pacman moves up
   - Move joystick down: Pacman moves down
   - Move joystick left: Pacman moves left
   - Move joystick right: Pacman moves right

## Game Rules

- Guide Pacman through the maze to eat all dots
- Avoid ghosts, as they will reduce your lives
- Eat power pills to temporarily make ghosts vulnerable
- Eat vulnerable ghosts for bonus points
- Complete the level by eating all dots and power pills

## Technical Details

The project uses:
- Web Serial API for communication with Arduino
- HTML5 Canvas for rendering the game
- No external libraries required
- Arduino code with analog smoothing for better control

## Customization

You can customize various aspects of the game:
- Modify the maze layout by changing the walls array in JavaScript
- Adjust game speed and difficulty
- Add additional sound effects or replace existing ones
- Change colors and visual appearance

## Credits

Created by Moresh Kokane
Inspired by the classic Pacman arcade game 