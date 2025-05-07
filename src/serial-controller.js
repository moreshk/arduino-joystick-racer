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
    
    // Manual calibration offsets - initialize with defaults that work well
    this.manualOffsetX = 187;  // Default value that works for most joysticks
    this.manualOffsetY = 193;  // Default value that works for most joysticks
    
    // Callback function to process joystick data
    this.onJoystickData = null;
    
    // Connection status
    this.connected = false;
    
    // Variables to handle disconnections and auto-reconnection
    this.reconnecting = false;
    this.lastUsedPortInfo = null;
    
    // Try to load last used port information from local storage
    this.loadSavedPortInfo();
    
    // Manual mode flag for keyboard fallback
    this.manualMode = false;

    // Debug flags
    this.debugElement = null;
    this.showRawValues = true; // Shows raw values to help diagnose issues

    // Deadzone values - increased for better stability
    this.deadzone = 0.20; // Increased from 0.15 for better stability
    
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
   * Save the current port information to local storage
   * @param {object} portInfo - The port.getInfo() object
   */
  savePortInfo(portInfo) {
    if (portInfo) {
      // Store this for future use
      this.lastUsedPortInfo = portInfo;
      
      // Save to localStorage for persistence across page refreshes
      try {
        localStorage.setItem('lastUsedSerialPort', JSON.stringify({
          usbVendorId: portInfo.usbVendorId,
          usbProductId: portInfo.usbProductId
        }));
        console.log('Saved port info to local storage:', portInfo);
      } catch (err) {
        console.error('Failed to save port info to local storage:', err);
      }
    }
  }
  
  /**
   * Load saved port information from local storage
   */
  loadSavedPortInfo() {
    try {
      const savedPortInfo = localStorage.getItem('lastUsedSerialPort');
      if (savedPortInfo) {
        this.lastUsedPortInfo = JSON.parse(savedPortInfo);
        console.log('Loaded saved port info:', this.lastUsedPortInfo);
      }
    } catch (err) {
      console.error('Failed to load saved port info:', err);
      this.lastUsedPortInfo = null;
    }
  }
  
  /**
   * Try to connect to the last used serial port automatically
   * @returns {Promise} Resolves when connected, rejects on error
   */
  async autoConnect() {
    if (!this.lastUsedPortInfo) {
      console.log('No saved port info available for auto-connect');
      return false;
    }
    
    if (!navigator.serial) {
      console.error('Web Serial API is not available');
      return false;
    }
    
    try {
      console.log('Attempting to auto-connect to last used port');
      
      // Get list of available ports
      const ports = await navigator.serial.getPorts();
      console.log('Available ports:', ports);
      
      // Find a port that matches our saved criteria
      const matchingPort = ports.find(port => {
        const info = port.getInfo();
        return (
          info.usbVendorId === this.lastUsedPortInfo.usbVendorId &&
          info.usbProductId === this.lastUsedPortInfo.usbProductId
        );
      });
      
      if (matchingPort) {
        console.log('Found matching port:', matchingPort);
        await this.connectToPort(matchingPort);
        return true;
      } else {
        console.log('No matching port found for auto-connect');
        return false;
      }
    } catch (err) {
      console.error('Error during auto-connect:', err);
      return false;
    }
  }
  
  /**
   * Connect to a specific port directly
   * @param {SerialPort} port - The port to connect to
   * @returns {Promise} Resolves when connected, rejects on error
   */
  async connectToPort(port) {
    try {
      this.port = port;
      
      // Save the port info for future auto-connects
      this.savePortInfo(port.getInfo());
      
      // Configure the port
      await this.port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });
      
      console.log('Serial port opened successfully');
      
      this.connected = true;
      
      // Show and update the debug element
      this.debugElement = document.getElementById('joystick-debug');
      if (this.debugElement) {
        this.debugElement.style.display = 'block';
        this.updateDebugElement('Connected to joystick controller', 'lime');
      }
      
      // Create controls and start reading
      this.createControlUI();
      this.startReadLoop();
      
      // Remove any UI connection buttons when connected
      const connectBtn = document.getElementById('connect-controller-btn');
      if (connectBtn) connectBtn.remove();
      
      const startWithoutBtn = document.getElementById('start-without-btn');
      if (startWithoutBtn) startWithoutBtn.remove();
      
      // Dispatch event after successful connection
      document.dispatchEvent(new Event('controller-connected'));
      
      return true;
    } catch (err) {
      console.error('Failed to connect to port:', err);
      
      // Show failure in debug element
      this.debugElement = document.getElementById('joystick-debug');
      if (this.debugElement) {
        this.debugElement.style.display = 'block';
        this.updateDebugElement('Failed to connect: ' + err.message, 'red');
      }
      
      throw err;
    }
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
      this.updateDebugElement(errorMsg, 'red');
      throw new Error(errorMsg);
    }
    
    // Try to auto-connect first
    if (await this.autoConnect()) {
      console.log('Auto-connect successful');
      return true;
    }
    
    // If auto-connect fails, prompt user to select a port
    try {
      this.updateDebugElement('Select your Arduino Serial port from the dialog...', 'yellow');
      
      console.log('Requesting Serial Device...');
      this.port = await navigator.serial.requestPort();
      
      return await this.connectToPort(this.port);
    } catch (err) {
      console.error('Failed to connect:', err);
      this.updateDebugElement('Failed to connect: ' + err.message, 'red');
      throw err;
    }
  }
  
  /**
   * Process the buffer and extract complete lines of data
   */
  processBuffer() {
    // Split the buffer by newline characters
    const lines = this.buffer.split('\n');
    
    // If we don't have a complete line yet, return
    if (lines.length <= 1) return;
    
    // Keep the last (potentially incomplete) line in the buffer
    this.buffer = lines.pop();
    
    // Process all complete lines
    for (const line of lines) {
      // Skip empty lines
      if (line.trim() === '') continue;
      
      // Process this line of data
      this.processJoystickData(line);
    }
  }
  
  /**
   * Perform automatic calibration based on default values
   */
  autoCalibrate() {
    if (!this.connected) return;
    
    // Use default offsets that work well for most joysticks
    this.manualOffsetX = 187;  // Default X offset
    this.manualOffsetY = 193;  // Default Y offset
    
    // Reset history arrays to avoid lingering values
    this.rollHistory = [0, 0, 0];
    this.pitchHistory = [0, 0, 0];
    this.historyIndex = 0;
    
    this.updateDebugElement('Joystick automatically calibrated with default values', 'lime');
    
    // Also dispatch an event to notify game that calibration has changed
    document.dispatchEvent(new Event('joystick-calibrated'));
  }
  
  /**
   * Add a calibrate button to the UI
   */
  addCalibrateButton() {
    // Check if we already have a calibrate button
    if (document.getElementById('joystick-calibrate-btn') || document.getElementById('calibrate-btn')) {
      return;
    }
    
    // Create calibrate button
    const calibrateBtn = document.createElement('button');
    calibrateBtn.id = 'joystick-calibrate-btn';
    calibrateBtn.textContent = 'Recalibrate Joystick';
    calibrateBtn.style.position = 'fixed';
    calibrateBtn.style.bottom = '10px';
    calibrateBtn.style.right = '10px';
    calibrateBtn.style.padding = '8px 16px';
    calibrateBtn.style.backgroundColor = '#ff9800';
    calibrateBtn.style.color = 'white';
    calibrateBtn.style.border = 'none';
    calibrateBtn.style.borderRadius = '4px';
    calibrateBtn.style.zIndex = '100';
    calibrateBtn.style.cursor = 'pointer';
    
    // Add hover effect
    calibrateBtn.onmouseover = () => {
      calibrateBtn.style.backgroundColor = '#ff7300';
    };
    calibrateBtn.onmouseout = () => {
      calibrateBtn.style.backgroundColor = '#ff9800';
    };
    
    // Add click handler
    calibrateBtn.addEventListener('click', () => {
      this.calibrateJoystick();
    });
    
    // Add to the page directly instead of game container
    document.body.appendChild(calibrateBtn);
    
    // We don't need to add separate instructions
    // or deadzone controls, to keep UI clean
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
    this.historyIndex = 0; // Reset the history index too
    
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
   * Update the debug element text and color
   * @param {string} message - The message to display
   * @param {string} color - The color to use (e.g., 'red', 'lime', 'yellow')
   */
  updateDebugElement(message, color = 'white') {
    if (this.debugElement) {
      this.debugElement.textContent = message;
      this.debugElement.style.color = color;
    }
  }

  /**
   * Start reading data from the serial port
   */
  startReadLoop() {
    if (!this.port || this.readLoopRunning) return;
    
    this.readLoopRunning = true;
    
    // Create new TextDecoder
    const textDecoder = new TextDecoder();
    
    // Start the read loop
    this.reader = this.port.readable.getReader();
    
    // Add calibration controls
    this.addCalibrateButton();
    
    // Auto-calibrate with default values that work well after a short delay
    setTimeout(() => {
      this.autoCalibrate();
    }, 500);
    
    // Function to read from the port in a loop
    const readLoop = async () => {
      try {
        while (this.readLoopRunning) {
          const { value, done } = await this.reader.read();
          
          if (done) {
            // Reader has been canceled, port is closed
            console.log('Serial port reader closed');
            this.updateDebugElement('Serial connection closed', 'yellow');
            break;
          }
          
          // Convert the received data to text
          const text = textDecoder.decode(value);
          
          // Add to buffer
          this.buffer += text;
          
          // Process complete lines
          this.processBuffer();
        }
      } catch (error) {
        console.error('Error reading from serial port:', error);
        this.updateDebugElement('Error reading from serial port: ' + error.message, 'red');
        this.readLoopRunning = false;
        this.connected = false;
        
        // If reading fails, offer keyboard control as fallback
        this.setupKeyboardHandlers();
      } finally {
        // Release the reader
        if (this.reader) {
          this.reader.releaseLock();
        }
      }
    };
    
    // Start the read loop
    readLoop();
  }
  
  /**
   * Add a "Calibrate Joystick" button to the page
   */
  createControlUI() {
    // Create status indicator for bottom right
    const controlStatus = document.createElement('div');
    controlStatus.id = 'controller-status';
    controlStatus.style.position = 'fixed';
    controlStatus.style.bottom = '50px';
    controlStatus.style.right = '10px';
    controlStatus.style.padding = '5px 10px';
    controlStatus.style.background = 'rgba(0, 0, 0, 0.7)';
    controlStatus.style.color = 'lime';
    controlStatus.style.borderRadius = '4px';
    controlStatus.style.fontSize = '12px';
    controlStatus.style.zIndex = '100';
    controlStatus.textContent = 'Controller Connected';
    
    // Add to body
    document.body.appendChild(controlStatus);
    
    // Make sure calibrate button exists
    this.addCalibrateButton();
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
          
          // Calculate normalized values (-1 to 1) - ensure correct orientation
          // Using consistent formula regardless of calibration:
          // right = positive roll, left = negative roll
          let rawRoll = ((calibratedX - 512) / 512); // Remove negative sign
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
   * Alias for calibrateJoystick() for compatibility
   */
  recalibrate() {
    this.calibrateJoystick();
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