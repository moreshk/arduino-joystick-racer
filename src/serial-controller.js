/**
 * Serial Joystick Controller for the 3D Airplane Game
 * 
 * This module provides functionality to connect to an Arduino-based joystick
 * using the Web Serial API.
 */

class SerialController {
  constructor() {
    // Serial device properties
    this.port = null;
    this.reader = null;
    this.readLoopRunning = false;
    
    // Buffer for incoming data
    this.buffer = '';
    
    // Joystick values
    this.joystickX = 512;  // Roll (left/right banking)
    this.joystickY = 512;  // Pitch (up/down)
    this.buttonPressed = false; // Boost
    
    // Normalized values (-1 to 1)
    this.roll = 0;  // Banking left/right
    this.pitch = 0; // Up/down
    
    // Manual calibration offsets (can be adjusted if joystick has bias)
    this.manualOffsetX = 0;
    this.manualOffsetY = 0;
    
    // Callback function to process joystick data
    this.onJoystickData = null;
    
    // Connection status
    this.connected = false;
    
    // Manual mode flag for keyboard fallback
    this.manualMode = false;

    // Debug flags
    this.debugElement = null;
    this.showRawValues = true; // Shows raw values to help diagnose issues

    // Deadzone values
    this.deadzone = 0.15; // Reduced from 0.20 to allow more sensitivity

    // Exponential curve strength (higher = more fine control in center, more response at edges)
    this.exponentialFactor = 1.6; // Reduced from 1.8 for more linear response
    
    // Moving average values for smoother input - reduced for more responsiveness
    this.rollHistory = [0, 0, 0]; // Reduced from 4 values
    this.pitchHistory = [0, 0, 0]; // Reduced from 4 values
    this.historyIndex = 0;
    
    // Keyboard control enhanced sensitivity for testing
    this.keyboardSensitivity = 0.7; // Increased from 0.5
  }
  
  /**
   * Connect to the Serial joystick device
   * @returns {Promise} Resolves when connected, rejects on error
   */
  async connect() {
    this.debugElement = document.getElementById('joystick-debug');
    
    if (!navigator.serial) {
        const errorMsg = "Web Serial API is not available. Please use Chrome or Edge browser.";
        console.error(errorMsg);
        if (this.debugElement) {
            this.debugElement.textContent = errorMsg;
            this.debugElement.style.color = 'red';
        }
        throw new Error(errorMsg);
    }

    try {
        if (this.debugElement) {
            this.debugElement.textContent = 'Select your Arduino Serial port from the dialog...';
            this.debugElement.style.color = 'yellow';
        }
        
        console.log('Requesting Serial Device...');
        
        // Request a serial port
        this.port = await navigator.serial.requestPort();
        
        // Open the port with appropriate settings for Arduino (9600 baud)
        await this.port.open({ baudRate: 9600 });
        
        console.log('Serial port opened:', this.port);
        if (this.debugElement) {
            this.debugElement.textContent = 'Serial port connected. Starting data read...';
            this.debugElement.style.color = 'yellow';
        }
        
        // Start reading data from the port
        this.startReadingData();
        
        // Set connected flag
        this.connected = true;
        
        if (this.debugElement) {
            this.debugElement.textContent = 'Serial joystick connected and reading data';
            this.debugElement.style.color = 'lime';
            
            // Add calibration controls
            this.addCalibrateButton();
        }
        
        return true;
        
    } catch (error) {
        console.error('Serial connection error:', error);
        
        if (this.debugElement) {
            this.debugElement.textContent = `Serial connection error: ${error.message}`;
            this.debugElement.style.color = 'red';
        }
        
        // If connection failed, offer keyboard control as fallback
        this.setupKeyboardHandlers();
        
        // Rethrow the error
        throw error;
    }
  }
  
  /**
   * Add a calibrate button to the UI
   */
  addCalibrateButton() {
    // Check if we already have a calibrate button
    if (document.getElementById('calibrate-btn')) {
      return;
    }
    
    // Create calibrate button
    const calibrateBtn = document.createElement('button');
    calibrateBtn.id = 'calibrate-btn';
    calibrateBtn.textContent = 'Recalibrate Joystick';
    calibrateBtn.style.position = 'absolute';
    calibrateBtn.style.bottom = '80px';
    calibrateBtn.style.right = '20px';
    calibrateBtn.style.padding = '8px 16px';
    calibrateBtn.style.backgroundColor = '#ff9800';
    calibrateBtn.style.color = 'white';
    calibrateBtn.style.border = 'none';
    calibrateBtn.style.borderRadius = '4px';
    calibrateBtn.style.zIndex = '100';
    
    // Add click handler
    calibrateBtn.addEventListener('click', () => {
      this.calibrateJoystick();
    });
    
    // Add to the game container
    document.getElementById('game-container').appendChild(calibrateBtn);
    
    // Add calibration instructions
    const instructions = document.createElement('div');
    instructions.id = 'calibration-instructions';
    instructions.textContent = 'You can also hold the joystick button for 2 seconds to recalibrate';
    instructions.style.position = 'absolute';
    instructions.style.bottom = '50px';
    instructions.style.right = '20px';
    instructions.style.padding = '5px';
    instructions.style.backgroundColor = 'rgba(0,0,0,0.5)';
    instructions.style.color = 'white';
    instructions.style.fontSize = '12px';
    instructions.style.borderRadius = '4px';
    instructions.style.zIndex = '100';
    
    // Add to the game container
    document.getElementById('game-container').appendChild(instructions);
    
    // Add deadzone adjustment buttons
    this.addDeadzoneControls();
  }
  
  /**
   * Add deadzone adjustment controls
   */
  addDeadzoneControls() {
    // Create container for deadzone controls
    const container = document.createElement('div');
    container.id = 'deadzone-controls';
    container.style.position = 'absolute';
    container.style.bottom = '120px';
    container.style.right = '20px';
    container.style.backgroundColor = 'rgba(0,0,0,0.5)';
    container.style.padding = '8px';
    container.style.borderRadius = '4px';
    container.style.zIndex = '100';
    
    // Create label
    const label = document.createElement('div');
    label.textContent = `Deadzone: ${this.deadzone.toFixed(2)}`;
    label.id = 'deadzone-label';
    label.style.marginBottom = '8px';
    label.style.color = 'white';
    
    // Create increase button
    const increaseBtn = document.createElement('button');
    increaseBtn.textContent = '+';
    increaseBtn.style.marginRight = '8px';
    increaseBtn.style.width = '30px';
    increaseBtn.style.height = '30px';
    
    // Create decrease button
    const decreaseBtn = document.createElement('button');
    decreaseBtn.textContent = '-';
    decreaseBtn.style.width = '30px';
    decreaseBtn.style.height = '30px';
    
    // Add click handlers
    increaseBtn.addEventListener('click', () => {
      this.deadzone = Math.min(0.5, this.deadzone + 0.05);
      document.getElementById('deadzone-label').textContent = `Deadzone: ${this.deadzone.toFixed(2)}`;
    });
    
    decreaseBtn.addEventListener('click', () => {
      this.deadzone = Math.max(0.05, this.deadzone - 0.05);
      document.getElementById('deadzone-label').textContent = `Deadzone: ${this.deadzone.toFixed(2)}`;
    });
    
    // Assemble controls
    container.appendChild(label);
    container.appendChild(decreaseBtn);
    container.appendChild(increaseBtn);
    
    // Add to game container
    document.getElementById('game-container').appendChild(container);
  }
  
  /**
   * Manually calibrate the joystick
   */
  calibrateJoystick() {
    if (!this.connected) return;
    
    // Get current values
    const currentX = this.joystickX;
    const currentY = this.joystickY;
    
    // Calculate how far off center these values are
    const offsetX = 512 - currentX;
    const offsetY = 512 - currentY;
    
    // Store these as manual offsets
    this.manualOffsetX = offsetX;
    this.manualOffsetY = offsetY;
    
    // Reset history arrays to avoid lingering values
    this.rollHistory = [0, 0, 0];
    this.pitchHistory = [0, 0, 0];
    
    if (this.debugElement) {
      this.debugElement.textContent = `Joystick calibrated! Offsets: X=${offsetX}, Y=${offsetY}`;
      this.debugElement.style.color = 'lime';
      
      // Reset to normal display after 3 seconds
      setTimeout(() => {
        if (this.connected) {
          this.debugElement.textContent = `Roll: 0.00 | Pitch: 0.00 | Boost: OFF`;
          this.debugElement.style.color = 'white';
        }
      }, 3000);
    }
    
    console.log(`Joystick manually calibrated. Offsets: X=${offsetX}, Y=${offsetY}`);
  }
  
  /**
   * Start reading data from the serial port
   */
  async startReadingData() {
    if (!this.port || !this.port.readable) {
      console.error('Cannot start reading: port is not open or not readable');
      return;
    }
    
    // Flag to prevent multiple read loops
    this.readLoopRunning = true;
    
    // Create a reader from the port's readable stream
    this.reader = this.port.readable.getReader();
    
    try {
      // Loop to continuously read data
      while (this.readLoopRunning) {
        const { value, done } = await this.reader.read();
        
        // If the stream is done, break the loop
        if (done) {
          break;
        }
        
        // Process the received data
        if (value) {
          const text = new TextDecoder().decode(value);
          this.processSerialData(text);
        }
      }
    } catch (error) {
      console.error('Error reading serial data:', error);
    } finally {
      // Release the reader when done
      this.reader.releaseLock();
      this.reader = null;
      
      // If loop was aborted due to an error but we're still connected, try to restart
      if (this.connected && !this.readLoopRunning) {
        setTimeout(() => this.startReadingData(), 1000);
      }
    }
  }
  
  /**
   * Process incoming serial data
   * @param {string} data - Raw data from serial port
   */
  processSerialData(data) {
    // Add the new data to our buffer
    this.buffer += data;
    
    // Look for complete lines in the buffer
    const lines = this.buffer.split('\n');
    
    // If we have at least one complete line
    if (lines.length > 1) {
      // Process all complete lines
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          // Process Arduino's startup and calibration messages
          if (line.includes("IMPORTANT:") || 
              line.includes("Calibrating") || 
              line.includes("Calibration") || 
              line.includes("calibrated") ||
              line.includes("Ready")) {
            console.log('Arduino message:', line);
            
            // If this is a calibration message, update our UI
            if (line.includes("Calibration complete") || line.includes("calibrated")) {
              if (this.debugElement) {
                this.debugElement.textContent = 'Arduino joystick calibrated';
                this.debugElement.style.color = 'lime';
                
                // Reset manual offsets since the Arduino has calibrated
                this.manualOffsetX = 0;
                this.manualOffsetY = 0;
                
                // Reset history arrays
                this.rollHistory = [0, 0, 0];
                this.pitchHistory = [0, 0, 0];
                
                // Reset to normal display after 3 seconds
                setTimeout(() => {
                  if (this.connected) {
                    this.debugElement.textContent = `Roll: 0.00 | Pitch: 0.00 | Boost: OFF`;
                    this.debugElement.style.color = 'white';
                  }
                }, 3000);
              }
            }
            continue;
          }
          
          // Skip other debug lines from Arduino
          if (line.includes('Debug Info:') || 
              line.startsWith('Raw') || 
              line.includes('Center') || 
              line.includes('Offset')) {
            console.log('Arduino debug:', line);
            continue;
          }
          
          // Process data line (expected format: X,Y,BUTTON)
          if (line.includes(',')) {
            this.processJoystickData(line);
          }
        }
      }
      
      // Keep the incomplete line in the buffer
      this.buffer = lines[lines.length - 1];
    }
  }
  
  /**
   * Process joystick data from CSV format
   * @param {string} data - CSV data from serial port (X,Y,BUTTON)
   */
  processJoystickData(data) {
    try {
      // Expected format: "X,Y,BUTTON" (e.g. "512,512,0")
      const parts = data.split(',');
      
      if (parts.length >= 2) {
        // Extract X and Y values
        const x = parseInt(parts[0]);
        const y = parseInt(parts[1]);
        
        // Extract button state if present (default to 0/false)
        const btn = parts.length > 2 ? parseInt(parts[2]) : 0;
        
        // Validate parsed values - must be numbers
        if (!isNaN(x) && !isNaN(y)) {
          // Store the raw values
          this.joystickX = x;
          this.joystickY = y;
          this.buttonPressed = btn > 0;
          
          // Apply manual calibration offsets
          let calibratedX = x + this.manualOffsetX;
          let calibratedY = y + this.manualOffsetY;
          
          // Clamp to valid range
          calibratedX = Math.max(0, Math.min(1023, calibratedX));
          calibratedY = Math.max(0, Math.min(1023, calibratedY));
          
          // Calculate normalized values (-1 to 1)
          let rawRoll = (calibratedX - 512) / 512;
          let rawPitch = (calibratedY - 512) / 512;
          
          // Apply deadzone - critical to eliminate drift
          if (Math.abs(rawRoll) < this.deadzone) rawRoll = 0;
          if (Math.abs(rawPitch) < this.deadzone) rawPitch = 0;
          
          // Apply input shaping - scale non-zero values to range properly from deadzone to 1.0
          // This ensures smooth control from deadzone edge to maximum
          if (rawRoll !== 0) {
            const sign = Math.sign(rawRoll);
            rawRoll = sign * (Math.abs(rawRoll) - this.deadzone) / (1 - this.deadzone);
          }
          
          if (rawPitch !== 0) {
            const sign = Math.sign(rawPitch);
            rawPitch = sign * (Math.abs(rawPitch) - this.deadzone) / (1 - this.deadzone);
          }
          
          // Add to the history array for moving average
          this.rollHistory[this.historyIndex] = rawRoll;
          this.pitchHistory[this.historyIndex] = rawPitch;
          this.historyIndex = (this.historyIndex + 1) % this.rollHistory.length;
          
          // Calculate moving average for smoother inputs
          let avgRoll = 0;
          let avgPitch = 0;
          for (let i = 0; i < this.rollHistory.length; i++) {
            avgRoll += this.rollHistory[i];
            avgPitch += this.pitchHistory[i];
          }
          avgRoll /= this.rollHistory.length;
          avgPitch /= this.pitchHistory.length;
          
          // Set final values
          this.roll = avgRoll;
          this.pitch = avgPitch;
          
          // Apply exponential curve for finer control near center
          if (this.roll !== 0) {
            this.roll = Math.sign(this.roll) * Math.pow(Math.abs(this.roll), this.exponentialFactor);
          }
          
          if (this.pitch !== 0) {
            this.pitch = Math.sign(this.pitch) * Math.pow(Math.abs(this.pitch), this.exponentialFactor);
          }
          
          // If we have a callback registered, send the data
          if (this.onJoystickData) {
            this.onJoystickData({
              roll: this.roll,
              pitch: this.pitch,
              boost: this.buttonPressed,
              rawX: x,
              rawY: y
            });
          }
          
          // Update debug element if it exists
          if (this.debugElement) {
            let debugText = `Roll: ${this.roll.toFixed(2)} | Pitch: ${this.pitch.toFixed(2)} | Boost: ${this.buttonPressed ? 'ON' : 'OFF'}`;
            
            // Add raw values if enabled
            if (this.showRawValues) {
              debugText += `\nRaw: X=${x}, Y=${y} | Calibrated: X=${calibratedX.toFixed(0)}, Y=${calibratedY.toFixed(0)}`;
              debugText += `\nDeadzone: ${this.deadzone.toFixed(2)} | Offsets: X=${this.manualOffsetX}, Y=${this.manualOffsetY}`;
            }
            
            this.debugElement.textContent = debugText;
            this.debugElement.style.color = this.buttonPressed ? '#ffcc00' : 'white';
          }
        }
      }
    } catch (error) {
      console.error('Error processing joystick data:', error);
    }
  }
  
  /**
   * Set up keyboard handlers for manual control
   */
  setupKeyboardHandlers() {
    // Set manual mode flag
    this.manualMode = true;
    
    // Initial values
    let roll = 0;
    let pitch = 0;
    let boost = false;
    
    // Track pressed keys
    const keysPressed = {
      ArrowLeft: false,
      ArrowRight: false,
      ArrowUp: false,
      ArrowDown: false,
      ' ': false // Space for boost
    };
    
    // Keydown handler
    const keydownHandler = (event) => {
      // Only process keys we care about
      if (keysPressed.hasOwnProperty(event.key)) {
        // Update key state
        keysPressed[event.key] = true;
        
        // Calculate roll and pitch values with enhanced sensitivity
        roll = 0;
        pitch = 0;
        
        if (keysPressed.ArrowLeft) roll = -this.keyboardSensitivity;
        if (keysPressed.ArrowRight) roll = this.keyboardSensitivity;
        if (keysPressed.ArrowUp) pitch = -this.keyboardSensitivity;
        if (keysPressed.ArrowDown) pitch = this.keyboardSensitivity;
        
        // Update boost state
        boost = keysPressed[' '];
        
        // Call the callback with the current values
        if (this.onJoystickData) {
          this.onJoystickData({
            roll: roll,
            pitch: pitch,
            boost: boost,
            rawX: 512 + Math.round(roll * 512),
            rawY: 512 + Math.round(pitch * 512)
          });
        }
        
        // Update debug element if it exists
        const debugElement = document.getElementById('joystick-debug');
        if (debugElement) {
          debugElement.textContent = `Keyboard Control | Roll: ${roll.toFixed(2)} | Pitch: ${pitch.toFixed(2)} | Boost: ${boost ? 'ON' : 'OFF'}`;
          debugElement.style.color = boost ? '#ffcc00' : 'white';
        }
        
        // Prevent default actions for these keys (like scrolling)
        event.preventDefault();
      }
    };
    
    // Keyup handler
    const keyupHandler = (event) => {
      // Only process keys we care about
      if (keysPressed.hasOwnProperty(event.key)) {
        // Update key state
        keysPressed[event.key] = false;
        
        // Calculate roll and pitch values with enhanced sensitivity
        roll = 0;
        pitch = 0;
        
        if (keysPressed.ArrowLeft) roll = -this.keyboardSensitivity;
        if (keysPressed.ArrowRight) roll = this.keyboardSensitivity;
        if (keysPressed.ArrowUp) pitch = -this.keyboardSensitivity;
        if (keysPressed.ArrowDown) pitch = this.keyboardSensitivity;
        
        // Update boost state
        boost = keysPressed[' '];
        
        // Call the callback with the current values
        if (this.onJoystickData) {
          this.onJoystickData({
            roll: roll,
            pitch: pitch,
            boost: boost,
            rawX: 512 + Math.round(roll * 512),
            rawY: 512 + Math.round(pitch * 512)
          });
        }
        
        // Update debug element if it exists
        const debugElement = document.getElementById('joystick-debug');
        if (debugElement) {
          debugElement.textContent = `Keyboard Control | Roll: ${roll.toFixed(2)} | Pitch: ${pitch.toFixed(2)} | Boost: ${boost ? 'ON' : 'OFF'}`;
          debugElement.style.color = boost ? '#ffcc00' : 'white';
        }
        
        // Prevent default actions for these keys
        event.preventDefault();
      }
    };
    
    // Register keyboard event listeners
    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);
    
    // Update debug element to show keyboard controls are active
    const debugElement = document.getElementById('joystick-debug');
    if (debugElement) {
      debugElement.textContent = 'Using keyboard controls. Arrow keys to fly, Space for boost.';
      debugElement.style.color = 'cyan';
    }
    
    // Store references to the handlers for potential cleanup
    this.keydownHandler = keydownHandler;
    this.keyupHandler = keyupHandler;
  }
  
  /**
   * Disconnect from the serial device
   */
  async disconnect() {
    // Flag to stop the read loop
    this.readLoopRunning = false;
    
    try {
      // Close the reader if it exists
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      
      // Close the port if it exists
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
      
      // Update connection status
      this.connected = false;
      
      // Update debug element if it exists
      const debugElement = document.getElementById('joystick-debug');
      if (debugElement) {
        debugElement.textContent = 'Serial device disconnected';
        debugElement.style.color = 'orange';
      }
      
      console.log('Serial device disconnected');
      
      return true;
    } catch (error) {
      console.error('Error disconnecting from serial device:', error);
      throw error;
    }
  }
  
  /**
   * Set the callback function for joystick data
   * @param {Function} callback - Function to call with joystick data
   */
  setJoystickDataCallback(callback) {
    this.onJoystickData = callback;
  }
  
  /**
   * Check if Web Serial API is supported in the current browser
   * @returns {boolean} True if Web Serial API is supported
   */
  static isSupported() {
    return 'serial' in navigator;
  }
}

export default SerialController; 