#!/bin/bash

# Start script for Three.js USB Joystick project
echo "Starting Three.js USB Joystick project..."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install Node.js and npm."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Start the development server
echo "Starting development server..."
npm run dev

# Open instructions in browser
echo "Project started! Open the displayed URL in your browser."
echo "Connect your Arduino with the joystick and upload the 'arduino/pacman_joystick_usb.ino' sketch." 