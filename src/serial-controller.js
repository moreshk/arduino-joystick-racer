/**
 * Serial Joystick Controller for the Pacman Game
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
    this.joystickX = 512;
    this.joystickY = 512;
    this.buttonPressed = false;
    
    // Callback function to process joystick data
    this.onJoystickData = null;
    
    // Connection status
    this.connected = false;
    
    // Manual mode flag for keyboard fallback
    this.manualMode = false;
  }
  
  /**
   * Connect to the Serial joystick device
   * @returns {Promise} Resolves when connected, rejects on error
   */
  async connect() {
    const debugElement = document.getElementById('joystick-debug');
    
    if (!navigator.serial) {
        const errorMsg = "Web Serial API is not available. Please use Chrome or Edge browser.";
        console.error(errorMsg);
        if (debugElement) {
            debugElement.textContent = errorMsg;
            debugElement.style.color = 'red';
        }
        throw new Error(errorMsg);
    }

    try {
        if (debugElement) {
            debugElement.textContent = 'Select your Arduino Serial port from the dialog...';
            debugElement.style.color = 'yellow';
        }
        
        console.log('Requesting Serial Device...');
        
        // Request a serial port
        this.port = await navigator.serial.requestPort();
        
        // Open the port with appropriate settings for Arduino (9600 baud)
        await this.port.open({ baudRate: 9600 });
        
        console.log('Serial port opened:', this.port);
        if (debugElement) {
            debugElement.textContent = 'Serial port connected. Starting data read...';
            debugElement.style.color = 'yellow';
        }
        
        // Start reading data from the port
        this.startReadingData();
        
        // Set connected flag
        this.connected = true;
        
        if (debugElement) {
            debugElement.textContent = 'Serial joystick connected and reading data';
            debugElement.style.color = 'lime';
        }
        
        return true;
        
    } catch (error) {
        console.error('Serial connection error:', error);
        
        if (debugElement) {
            debugElement.textContent = `Serial connection error: ${error.message}`;
            debugElement.style.color = 'red';
        }
        
        // If connection failed, offer keyboard control as fallback
        this.setupKeyboardHandlers();
        
        // Rethrow the error
        throw error;
    }
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
          this.processJoystickData(line);
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
          // Store the values
          this.joystickX = x;
          this.joystickY = y;
          this.buttonPressed = btn > 0;
          
          // Generate normalized values (between -1 and 1)
          const normalizedX = (x - 512) / 512;
          const normalizedY = -(y - 512) / 512; // Y axis is inverted
          
          // If we have a callback registered, send the data
          if (this.onJoystickData) {
            this.onJoystickData({
              x: normalizedX,
              y: normalizedY,
              button: this.buttonPressed,
              rawX: x,
              rawY: y,
              direction: this.getDirectionFromValues(normalizedX, normalizedY)
            });
          }
          
          // Log to console for debugging
          console.log(`Joystick data - X: ${normalizedX.toFixed(2)}, Y: ${normalizedY.toFixed(2)}, Button: ${this.buttonPressed ? 'Pressed' : 'Released'}`);
        }
      }
    } catch (e) {
      console.error('Error parsing joystick data:', e);
    }
  }
  
  /**
   * Determine the direction based on joystick values
   * @param {number} x - Normalized X value (-1 to 1)
   * @param {number} y - Normalized Y value (-1 to 1)
   * @returns {string} - Direction (UP, DOWN, LEFT, RIGHT, CENTER)
   */
  getDirectionFromValues(x, y) {
    // Use a small threshold to prevent unwanted movements
    const threshold = 0.1;
    
    if (Math.abs(x) <= threshold && Math.abs(y) <= threshold) {
      return 'CENTER';
    }
    
    // Determine primary direction based on which axis has larger value
    if (Math.abs(x) > Math.abs(y)) {
      return x > 0 ? 'RIGHT' : 'LEFT';
    } else {
      return y > 0 ? 'DOWN' : 'UP';
    }
  }
  
  /**
   * Set up keyboard handlers for manual control
   * @param {number} initialX - Initial X value (default 512)
   * @param {number} initialY - Initial Y value (default 512)
   * @param {number} initialButton - Initial button state (default 0)
   */
  setupKeyboardHandlers(initialX = 512, initialY = 512, initialButton = 0) {
    console.log('Setting up keyboard handlers for manual control');
    
    // Flag that we're in manual mode
    this.manualMode = true;
    
    // Current joystick state
    let simX = initialX;
    let simY = initialY;
    let simButton = initialButton;
    
    // Track which keys are pressed
    const keyState = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      ' ': false // Space for button
    };
    
    // Handler for key down events
    const keydownHandler = (event) => {
      // Check if this is a key we're handling
      if (event.key in keyState) {
        // Prevent default browser behavior for these keys
        event.preventDefault();
        
        // If state hasn't changed, don't process again
        if (keyState[event.key] === true) return;
        
        // Update key state
        keyState[event.key] = true;
        
        // Update simulated values based on key pressed
        switch (event.key) {
          case 'ArrowUp':
            simY = 312; // Lower value = up
            break;
          case 'ArrowDown':
            simY = 712; // Higher value = down
            break;
          case 'ArrowLeft':
            simX = 312; // Lower value = left
            break;
          case 'ArrowRight':
            simX = 712; // Higher value = right
            break;
          case ' ':  // Spacebar for button press
            simButton = 1;
            break;
        }
        
        // Handle diagonal movement for better control
        if (keyState['ArrowUp'] && keyState['ArrowLeft']) {
          simX = 312;
          simY = 312;
        } else if (keyState['ArrowUp'] && keyState['ArrowRight']) {
          simX = 712;
          simY = 312;
        } else if (keyState['ArrowDown'] && keyState['ArrowLeft']) {
          simX = 312;
          simY = 712;
        } else if (keyState['ArrowDown'] && keyState['ArrowRight']) {
          simX = 712;
          simY = 712;
        }
        
        // Process the simulated joystick data
        this.processJoystickData(`${simX},${simY},${simButton}`);
      }
    };
    
    // Handler for key up events
    const keyupHandler = (event) => {
      // Check if this is a key we're handling
      if (event.key in keyState) {
        // Prevent default browser behavior
        event.preventDefault();
        
        // Update key state
        keyState[event.key] = false;
        
        // Reset corresponding value based on key released
        switch (event.key) {
          case 'ArrowUp':
          case 'ArrowDown':
            // Only reset Y if both up and down are released
            if (!keyState['ArrowUp'] && !keyState['ArrowDown']) {
              simY = 512; // Center position
            } else if (keyState['ArrowUp']) {
              simY = 312; // Keep up direction
            } else if (keyState['ArrowDown']) {
              simY = 712; // Keep down direction
            }
            break;
          case 'ArrowLeft':
          case 'ArrowRight':
            // Only reset X if both left and right are released
            if (!keyState['ArrowLeft'] && !keyState['ArrowRight']) {
              simX = 512; // Center position
            } else if (keyState['ArrowLeft']) {
              simX = 312; // Keep left direction
            } else if (keyState['ArrowRight']) {
              simX = 712; // Keep right direction
            }
            break;
          case ' ':  // Spacebar release
            simButton = 0;
            break;
        }
        
        // Process the updated joystick data
        this.processJoystickData(`${simX},${simY},${simButton}`);
      }
    };
    
    // Register event handlers
    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);
    
    // Store the handlers as properties for later removal
    this.keydownHandler = keydownHandler;
    this.keyupHandler = keyupHandler;
    
    // Process initial center position
    this.processJoystickData('512,512,0');
    
    console.log('Keyboard handler set up. Use arrow keys and spacebar.');
  }
  
  /**
   * Disconnect from the serial port
   */
  async disconnect() {
    // Stop the read loop
    this.readLoopRunning = false;
    
    // Close the reader if it exists
    if (this.reader) {
      try {
        await this.reader.cancel();
        this.reader = null;
      } catch (error) {
        console.error('Error canceling reader:', error);
      }
    }
    
    // Close the port if it's open
    if (this.port && this.port.readable) {
      try {
        await this.port.close();
        this.port = null;
      } catch (error) {
        console.error('Error closing serial port:', error);
      }
    }
    
    // Remove keyboard handlers if active
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.keyupHandler) {
      document.removeEventListener('keyup', this.keyupHandler);
      this.keyupHandler = null;
    }
    
    // Reset connection state
    this.connected = false;
    this.manualMode = false;
    
    console.log('Serial connection closed');
  }
  
  /**
   * Set a callback function to receive joystick data
   * @param {Function} callback - Function to call with joystick data
   */
  setJoystickDataCallback(callback) {
    this.onJoystickData = callback;
  }
  
  /**
   * Check if Web Serial API is supported in this browser
   * @returns {boolean} - True if Web Serial API is supported
   */
  static isSupported() {
    return navigator.serial !== undefined;
  }
}

export default SerialController; 