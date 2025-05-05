@echo off
echo Starting Three.js USB Joystick project...

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: npm is not installed. Please install Node.js and npm.
    pause
    exit /b 1
)

REM Install dependencies
echo Installing dependencies...
npm install

REM Start the development server
echo Starting development server...
npm run dev

REM Open instructions in browser
echo Project started! Open the displayed URL in your browser.
echo Connect your Arduino with the joystick and upload the 'arduino/pacman_joystick_usb.ino' sketch.
pause 