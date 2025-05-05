/**
 * Bluetooth Joystick Controller for the Pacman Game
 * 
 * This module provides functionality to connect to an Arduino-based Bluetooth joystick
 * using the Web Bluetooth API.
 */

class BluetoothController {
  constructor() {
    // Bluetooth device properties
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
    
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
    
    // Manual mode flag
    this.manualMode = false;
  }
  
  /**
   * Connect to the Bluetooth joystick device
   * @returns {Promise} Resolves when connected, rejects on error
   */
  async connect() {
    const debugElement = document.getElementById('joystick-debug');
    
    if (!navigator.bluetooth) {
        const errorMsg = "Web Bluetooth API is not available. Please use Chrome or Edge browser.";
        console.error(errorMsg);
        if (debugElement) {
            debugElement.textContent = errorMsg;
            debugElement.style.color = 'red';
        }
        throw new Error(errorMsg);
    }

    let device;
    try {
        if (debugElement) {
            debugElement.textContent = 'Select your HC-06 device from the dialog (NOT "cu.HC-06" on Mac)...';
            debugElement.style.color = 'yellow';
        }
        
        console.log('Requesting Bluetooth Device...');
        
        // Try to explicitly find HC-06 or similar devices first
        // This is better for Mac users who might see both the serial port and the Bluetooth device
        const deviceOptions = {
            filters: [
                { namePrefix: 'HC' },           // Match HC-06, HC-05, etc.
                { namePrefix: 'JY' },           // Match JY-MCU Bluetooth modules
                { namePrefix: 'Joystick' },     // Match renamed device
                { namePrefix: 'RNBT' }          // Match other BT modules
            ],
            // Reduce the number of optional services to check - only include the most common ones
            // This significantly speeds up the scanning and connection process
            optionalServices: [
                '0000ffe0-0000-1000-8000-00805f9b34fb', // HC-06 common service
                '00001101-0000-1000-8000-00805f9b34fb'  // Serial Port Profile
            ]
        };
        
        try {
            // First attempt with filters
            device = await navigator.bluetooth.requestDevice(deviceOptions);
            console.log('Found device with filters:', device.name);
        } catch (filterError) {
            console.warn('Could not find specific devices, trying all devices:', filterError);
            
            if (debugElement) {
                debugElement.textContent = 'No HC-06 found. Please select your Bluetooth device...';
                debugElement.style.color = 'yellow';
            }
            
            // Fallback to accepting all devices but with limited services to check
            device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '0000ffe0-0000-1000-8000-00805f9b34fb', // HC-06 common service
                    '00001101-0000-1000-8000-00805f9b34fb'  // Serial Port Profile
                ]
            });
        }
        
        // Skip Apple audio devices
        if (device.name && (device.name.includes('AirPods') || device.name.includes('Beats') || device.name.startsWith('cu.'))) {
            const errorMsg = `Selected device "${device.name}" appears to be an audio device or serial port. Please select the HC-06 Bluetooth device directly.`;
            console.error(errorMsg);
            
            if (debugElement) {
                debugElement.textContent = errorMsg;
                debugElement.style.color = 'red';
            }
            
            alert(errorMsg);
            throw new Error(errorMsg);
        }
        
        console.log('Connecting to GATT Server...');
        if (debugElement) {
            debugElement.textContent = `Connecting to ${device.name || 'Bluetooth device'}...`;
            debugElement.style.color = 'yellow';
        }
        
        let server;
        try {
            // Add a promise race with timeout to prevent hanging on GATT connection
            const gattConnectPromise = device.gatt.connect();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('GATT connection timeout')), 3000);
            });
            
            server = await Promise.race([gattConnectPromise, timeoutPromise]);
            console.log('GATT server connected:', server);
        } catch (gattError) {
            console.warn('GATT connection error:', gattError);
            
            // Handle "Unsupported device" error for HC-06
            if ((gattError.message.includes('Unsupported device') || 
                 gattError.message.includes('timeout')) && 
                device.name && (device.name.includes('HC-') || device.name.includes('JY'))) {
                
                console.log('HC-06 device detected but reported as unsupported. This is expected for some HC-06 modules.');
                
                if (debugElement) {
                    debugElement.textContent = 'HC-06 detected but reported as unsupported. Will use keyboard control.';
                    debugElement.style.color = 'orange';
                }
                
                // For HC-06 devices, we'll now simulate data since GATT services are not available
                this.device = device;
                this.connected = true;
                
                // Check if we have a callback registered yet (if not, log a warning)
                if (!this.onJoystickData) {
                    console.warn('No joystick callback registered before HC-06 connection - game may not respond to input');
                }
                
                // Set up a simulated data interval to test the UI - with manual mode forced
                this.simulateJoystickData(debugElement, device.name, true);
                
                if (debugElement) {
                    debugElement.textContent = `Connected to ${device.name || 'HC-06'} (using keyboard control)`;
                    debugElement.style.color = 'lime';
                }
                
                return true;
            } else {
                // Rethrow other errors
                throw gattError;
            }
        }
        
        // Add event listener for disconnect
        device.addEventListener('gattserverdisconnected', () => {
            console.log('Device disconnected');
            if (debugElement) {
                debugElement.textContent = 'Bluetooth device disconnected. Refresh to reconnect.';
                debugElement.style.color = 'red';
            }
        });
        
        console.log('Getting primary services...');
        let services = [];
        try {
            services = await server.getPrimaryServices();
            console.log('Services found:', services);
        } catch (servicesError) {
            console.warn('Error getting services:', servicesError);
            
            if (device.name && (device.name.includes('HC-') || device.name.includes('JY'))) {
                // HC-06 detected, but can't get services. Use manual mode
                this.device = device;
                this.server = server;
                this.connected = true;
                
                this.simulateJoystickData(debugElement, device.name, true);
                
                if (debugElement) {
                    debugElement.textContent = `Connected to ${device.name} (services inaccessible, using keyboard)`;
                    debugElement.style.color = 'lime';
                }
                
                return true;
            } else {
                throw servicesError;
            }
        }
        
        if (services.length === 0) {
            console.warn('No Bluetooth services found. This device may not be compatible.');
            
            // Check if this is an HC-06
            if (device.name && (device.name.includes('HC-') || device.name.includes('JY'))) {
                console.log('HC-06 device detected with no services. Using manual keyboard control.');
                
                this.device = device;
                this.server = server;
                this.connected = true;
                
                this.simulateJoystickData(debugElement, device.name, true);
                
                if (debugElement) {
                    debugElement.textContent = `Connected to ${device.name} (no services, keyboard control)`;
                    debugElement.style.color = 'lime';
                }
                
                return true;
            } else {
                throw new Error('No Bluetooth services found. This device may not be compatible.');
            }
        }
        
        // On Mac with HC-06, we often need to try each service
        let connected = false;
        const serviceErrors = [];
        
        // First, fast-check if this is an HC-06 device - if so, we can skip to manual mode
        // This is especially important for Mac users where HC-06 devices often report as unsupported
        if (device.name && (device.name.includes('HC-') || device.name.includes('JY'))) {
            // For HC-06 devices, try a quick connect first before processing all services
            console.log('HC-06 device detected, checking if services are accessible...');
            
            try {
                // Try a quick test of the first service
                const service = services[0];
                if (service) {
                    const characteristics = await service.getCharacteristics();
                    console.log('Quick service check successful:', characteristics.length, 'characteristics found');
                    
                    if (characteristics.length === 0) {
                        // No characteristics available, likely need manual mode
                        throw new Error('No characteristics found');
                    }
                } else {
                    throw new Error('No services available');
                }
            } catch (quickCheckError) {
                console.log('Quick service check failed, falling back to manual mode:', quickCheckError);
                
                // Fast path to manual mode for HC-06 devices
                this.device = device;
                this.server = server;
                this.connected = true;
                
                // Set up manual joystick input immediately
                this.simulateJoystickData(debugElement, device.name, true);
                
                if (debugElement) {
                    debugElement.textContent = `Connected to ${device.name} (using keyboard control)`;
                    debugElement.style.color = 'lime';
                }
                
                return true;
            }
        }
        
        // If we reach here, either it's not an HC-06 or the services might be accessible
        // We'll try each service in order, but with a timeout to avoid hanging
        for (const service of services) {
            try {
                console.log('Trying service:', service.uuid);
                
                // Set a timeout for service connection to prevent hanging
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Service connection timeout')), 2000);
                });
                
                let characteristics = [];
                try {
                    // Race the characteristic fetch against the timeout
                    characteristics = await Promise.race([
                        service.getCharacteristics(),
                        timeoutPromise
                    ]);
                    
                    console.log('Characteristics for service', service.uuid, ':', characteristics);
                } catch (characteristicsError) {
                    console.warn('Error getting characteristics for service', service.uuid, ':', characteristicsError);
                    serviceErrors.push(`Error getting characteristics: ${characteristicsError.message}`);
                    continue;
                }
                
                if (characteristics.length === 0) {
                    serviceErrors.push(`No characteristics found for service ${service.uuid}`);
                    continue;
                }
                
                // Find a characteristic with notify capability
                let notifyCharacteristic = null;
                for (const characteristic of characteristics) {
                    console.log('Checking characteristic:', characteristic.uuid, 
                        'Properties:', 
                        'notify:', characteristic.properties.notify,
                        'read:', characteristic.properties.read,
                        'write:', characteristic.properties.write);
                    
                    if (characteristic.properties.notify) {
                        notifyCharacteristic = characteristic;
                        break;
                    }
                }
                
                if (notifyCharacteristic) {
                    console.log('Setting up notifications on characteristic:', notifyCharacteristic.uuid);
                    
                    try {
                        await notifyCharacteristic.startNotifications();
                        notifyCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                            const value = event.target.value;
                            const decoder = new TextDecoder('utf-8');
                            const data = decoder.decode(value);
                            
                            console.log('Received data from notification:', data);
                            
                            // Process joystick data
                            this.processJoystickData(data);
                            
                            if (debugElement) {
                                // Update debug with the data
                                debugElement.textContent = `Connected to ${device.name || 'device'}: ${data}`;
                                debugElement.style.color = 'white';
                            }
                        });
                        
                        console.log('Bluetooth notifications set up successfully for', device.name || 'device');
                        if (debugElement) {
                            debugElement.textContent = `Connected to ${device.name || 'Bluetooth device'} using notifications`;
                            debugElement.style.color = 'lime';
                        }
                        
                        // Try writing a wakeup message to the device
                        try {
                            if (notifyCharacteristic.properties.write) {
                                const encoder = new TextEncoder();
                                await notifyCharacteristic.writeValue(encoder.encode('AT\r\n'));
                                console.log('Sent wakeup message to HC-06');
                            }
                        } catch (writeError) {
                            console.warn('Could not write to characteristic:', writeError);
                        }
                        
                        connected = true;
                        this.characteristic = notifyCharacteristic;
                        break;
                    } catch (notifyError) {
                        console.warn('Error setting up notifications:', notifyError);
                        serviceErrors.push(`Error with notifications: ${notifyError.message}`);
                        // Continue to next attempt
                    }
                } else {
                    // If no notify characteristic, try polling with read characteristic
                    console.log('No notification characteristic found, trying polling with read');
                    
                    const readCharacteristic = characteristics.find(c => c.properties.read);
                    if (readCharacteristic) {
                        console.log('Setting up polling on read characteristic:', readCharacteristic.uuid);
                        
                        // Test reading once
                        try {
                            const value = await readCharacteristic.readValue();
                            const decoder = new TextDecoder('utf-8');
                            const data = decoder.decode(value);
                            console.log('Initial read value:', data);
                        } catch (readError) {
                            console.warn('Error reading initial value:', readError);
                        }
                        
                        // Setup polling
                        const pollInterval = setInterval(async () => {
                            try {
                                const value = await readCharacteristic.readValue();
                                const decoder = new TextDecoder('utf-8');
                                const data = decoder.decode(value);
                                
                                console.log('Received data from polling:', data);
                                
                                // Process joystick data
                                this.processJoystickData(data);
                                
                                if (debugElement) {
                                    // Update debug with the data
                                    debugElement.textContent = `Connected to ${device.name || 'device'}: ${data}`;
                                    debugElement.style.color = 'white';
                                }
                            } catch (error) {
                                console.error('Error during polling:', error);
                                clearInterval(pollInterval);
                                
                                if (debugElement) {
                                    debugElement.textContent = `Polling error: ${error.message}`;
                                    debugElement.style.color = 'red';
                                }
                            }
                        }, 100); // 100ms polling interval
                        
                        // Cleanup on disconnect
                        device.addEventListener('gattserverdisconnected', () => {
                            clearInterval(pollInterval);
                        });
                        
                        console.log('Bluetooth polling set up successfully for', device.name || 'device');
                        if (debugElement) {
                            debugElement.textContent = `Connected to ${device.name || 'Bluetooth device'} using polling`;
                            debugElement.style.color = 'lime';
                        }
                        
                        connected = true;
                        this.characteristic = readCharacteristic;
                        break;
                    } else {
                        serviceErrors.push(`No readable characteristic found for service ${service.uuid}`);
                    }
                }
            } catch (serviceError) {
                console.warn('Error with service', service.uuid, ':', serviceError);
                serviceErrors.push(`Error with service ${service.uuid}: ${serviceError.message}`);
            }
        }
        
        if (!connected) {
            // Special case for HC-06: sometimes we can't get proper services/characteristics
            // We'll simulate data for testing
            if (device.name && (device.name.includes('HC-') || device.name.includes('JY'))) {
                console.log('HC-06 detected but could not establish a data channel. Using manual keyboard control.');
                
                this.device = device;
                this.server = server;
                this.connected = true;
                
                this.simulateJoystickData(debugElement, device.name, true);
                
                if (debugElement) {
                    debugElement.textContent = `Connected to ${device.name} (no data channel, keyboard control)`;
                    debugElement.style.color = 'lime';
                }
                
                return true;
            } else {
                const errorMsg = `Could not establish data connection with the device. Errors: ${serviceErrors.join('; ')}`;
                console.error(errorMsg);
                
                if (debugElement) {
                    debugElement.textContent = 'Connection failed: Could not establish data channel';
                    debugElement.style.color = 'red';
                }
                
                throw new Error(errorMsg);
            }
        }
        
        this.device = device;
        this.server = server;
        this.service = services[0];
        this.connected = true;
        
        // Try writing a test message to wake up the HC-06
        try {
          if (this.characteristic && this.characteristic.properties.write) {
              const encoder = new TextEncoder();
              await this.characteristic.writeValue(encoder.encode('HELLO\r\n'));
              console.log('Sent wake up message to HC-06');
          }
        } catch (error) {
          console.warn('Could not write to characteristic - read only:', error);
        }
        
        return true;
    } catch (error) {
        console.error('Bluetooth connection error:', error);
        
        let errorMsg = `Bluetooth connection failed: ${error.message}`;
        
        // Add Mac-specific help
        if (navigator.platform.includes('Mac')) {
            errorMsg += '\n\nFor Mac users: Make sure you selected the actual HC-06 device (not "cu.HC-06") and that it\'s properly paired in System Settings > Bluetooth.';
        }
        
        if (debugElement) {
            debugElement.textContent = `Connection failed: ${error.message}`;
            debugElement.style.color = 'red';
        }
        
        throw new Error(errorMsg);
    }
  }
  
  /**
   * Simulate joystick data for testing when actual data can't be received
   * This is useful for HC-06 devices that don't properly expose their services/characteristics
   * @param {HTMLElement} debugElement - The debug element to update
   * @param {string} deviceName - The name of the device
   * @param {boolean} forceManualMode - If true, don't start automatic movement
   */
  simulateJoystickData(debugElement, deviceName, forceManualMode = false) {
    console.log('Setting up Bluetooth joystick data handling for HC-06');
    
    // Center position initially
    let simX = 512;
    let simY = 512;
    let simButton = 0;

    // Store manual mode flag and device info
    this.manualMode = forceManualMode;
    this.deviceName = deviceName || 'HC-06';
    this.debugElement = debugElement;

    // Update debug display immediately
    if (debugElement) {
      // Add a manual/auto mode toggle button if it doesn't exist
      const existingToggle = document.getElementById('toggle-mode-button');
      if (existingToggle) {
        // Update existing toggle button
        existingToggle.textContent = forceManualMode ? 'Enable Auto Mode' : 'Enable Manual Mode';
        existingToggle.style.backgroundColor = forceManualMode ? '#9E9E9E' : '#4CAF50';
        existingToggle.style.display = 'block'; // Make sure it's visible
        
        // Make sure the toggle has a click handler
        if (!existingToggle.hasClickListener) {
          existingToggle.addEventListener('click', () => {
            // Toggle between manual and auto mode
            this.manualMode = !this.manualMode;
            
            // Update button text and color
            existingToggle.textContent = this.manualMode ? 'Enable Auto Mode' : 'Enable Manual Mode';
            existingToggle.style.backgroundColor = this.manualMode ? '#9E9E9E' : '#4CAF50';
            
            // Clear existing interval if there is one
            if (this.simulateInterval) {
              clearInterval(this.simulateInterval);
              this.simulateInterval = null;
            }
            
            // Reset joystick values when switching modes
            simX = 512;
            simY = 512;
            simButton = 0;
            
            // Process initial center position
            this.processJoystickData(`${simX},${simY},${simButton}`);
            
            // Update display for the new mode
            if (this.manualMode) {
              debugElement.innerHTML = `<strong>Connected to ${this.deviceName}</strong><br>` +
                `<span style="color: #4CAF50">MANUAL MODE: Use keyboard arrows to control</span><br>` +
                `Ready for keyboard input<br>` +
                `<span style="color: #FFC107">Use arrow keys to move, spacebar for button</span>`;
            } else {
              debugElement.innerHTML = `<strong>Connected to ${this.deviceName}</strong><br>` +
                `<span style="color: #FF9800">AUTO MODE: Pacman moves in a circle</span><br>` +
                `<span style="color: #FFC107">Initial data: ${simX},${simY},${simButton}</span>`;
              
              // Set up simulation again with new mode
              this.setupAutoSimulation(debugElement, deviceName);
            }
          });
          existingToggle.hasClickListener = true;
        }
      } else {
        // Create toggle button if it doesn't exist
        const toggleButton = document.createElement('button');
        toggleButton.id = 'toggle-mode-button';
        toggleButton.textContent = forceManualMode ? 'Enable Auto Mode' : 'Enable Manual Mode';
        toggleButton.style.padding = '8px 16px';
        toggleButton.style.margin = '8px 0';
        toggleButton.style.backgroundColor = forceManualMode ? '#9E9E9E' : '#4CAF50';
        toggleButton.style.color = 'white';
        toggleButton.style.border = 'none';
        toggleButton.style.borderRadius = '4px';
        toggleButton.style.cursor = 'pointer';
        
        // Insert before the debug element
        debugElement.parentNode.insertBefore(toggleButton, debugElement);
        
        // Add click handler
        toggleButton.addEventListener('click', () => {
          this.manualMode = !this.manualMode;
          toggleButton.textContent = this.manualMode ? 'Enable Auto Mode' : 'Enable Manual Mode';
          toggleButton.style.backgroundColor = this.manualMode ? '#9E9E9E' : '#4CAF50';
          
          // Clear existing interval if there is one
          if (this.simulateInterval) {
            clearInterval(this.simulateInterval);
            this.simulateInterval = null;
          }
          
          // Reset joystick values when switching modes
          simX = 512;
          simY = 512;
          simButton = 0;
          
          // Process initial center position
          this.processJoystickData(`${simX},${simY},${simButton}`);
          
          // Update display for the new mode
          if (this.manualMode) {
            debugElement.innerHTML = `<strong>Connected to ${this.deviceName}</strong><br>` +
              `<span style="color: #4CAF50">MANUAL MODE: Use keyboard arrows to control</span><br>` +
              `Ready for keyboard input<br>` +
              `<span style="color: #FFC107">Use arrow keys to move, spacebar for button</span>`;
          } else {
            debugElement.innerHTML = `<strong>Connected to ${this.deviceName}</strong><br>` +
              `<span style="color: #FF9800">AUTO MODE: Pacman moves in a circle</span><br>` +
              `<span style="color: #FFC107">Initial data: ${simX},${simY},${simButton}</span>`;
            
            // Set up simulation again with new mode
            this.setupAutoSimulation(debugElement, deviceName);
          }
        });
        toggleButton.hasClickListener = true;
      }
      
      // Initial debug display
      if (forceManualMode) {
        debugElement.innerHTML = `<strong>Connected to ${deviceName}</strong><br>` +
            `<span style="color: #4CAF50">MANUAL MODE: Use keyboard arrows to control</span><br>` +
            `Ready for keyboard input<br>` +
            `<span style="color: #FFC107">Use arrow keys to move, spacebar for button</span>`;
      } else {
        debugElement.innerHTML = `<strong>Connected to ${deviceName}</strong><br>` +
            `<span style="color: #FF9800">AUTO MODE: Pacman moves in a circle</span><br>` +
            `<span style="color: #FFC107">Initial data: ${simX},${simY},${simButton}</span>`;
      }
      debugElement.style.color = 'white';
    }
    
    // Process initial center position (sends to the game)
    this.processJoystickData(`${simX},${simY},${simButton}`);
    
    // Set up keyboard listeners for manual mode
    this.setupKeyboardHandlers(simX, simY, simButton);
    
    // Only set up automatic simulation if not in manual mode
    if (!forceManualMode) {
      this.setupAutoSimulation(debugElement, deviceName);
    } else {
      console.log('Simulation disabled - using manual keyboard control');
    }
    
    return true;
  }
  
  /**
   * Set up keyboard event handlers for manual joystick control
   * @param {number} initialX - Initial X value (default 512)
   * @param {number} initialY - Initial Y value (default 512)
   * @param {number} initialButton - Initial button state (default 0)
   */
  setupKeyboardHandlers(initialX = 512, initialY = 512, initialButton = 0) {
    // Remove any existing handlers
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
    }
    if (this.keyupHandler) {
      window.removeEventListener('keyup', this.keyupHandler);
    }
    
    // Current joystick state
    let simX = initialX;
    let simY = initialY;
    let simButton = initialButton;
    
    // Key states
    const keyState = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      ' ': false
    };
    
    // Debug output once to confirm setup
    console.log('Keyboard handlers initialized for HC-06 manual control');
    
    // Setup keydown handler
    this.keydownHandler = (event) => {
      // Only process if in manual mode
      if (!this.manualMode) return;
      
      // Check if this key is one we care about
      if (event.key in keyState) {
        // Log key press for debugging
        console.log('Key down:', event.key);
        
        // Prevent default only for keys we're handling
        event.preventDefault();
        
        // If state hasn't changed, don't reprocess
        if (keyState[event.key] === true) return;
        
        // Update key state
        keyState[event.key] = true;
        
        // Adjust simulated values based on key
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
        
        // Combine directional inputs for diagonal movement
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
        
        // Process the simulated data with explicit values for debugging
        console.log('Simulating joystick with:', simX, simY, simButton);
        this.processJoystickData(`${simX},${simY},${simButton}`);
      }
    };
    
    // Create keyup handler
    this.keyupHandler = (event) => {
      // Only process if in manual mode
      if (!this.manualMode) return;
      
      // Check if this key is one we care about
      if (event.key in keyState) {
        // Log key release for debugging
        console.log('Key up:', event.key);
        
        // Prevent default only for keys we're handling
        event.preventDefault();
        
        // Update key state
        keyState[event.key] = false;
        
        // Reset corresponding value back to center
        switch (event.key) {
          case 'ArrowUp':
          case 'ArrowDown':
            // Only reset Y if both up and down are released
            if (!keyState['ArrowUp'] && !keyState['ArrowDown']) {
              simY = 512;
            } else if (keyState['ArrowUp']) {
              simY = 312;
            } else if (keyState['ArrowDown']) {
              simY = 712;
            }
            break;
          case 'ArrowLeft':
          case 'ArrowRight':
            // Only reset X if both left and right are released
            if (!keyState['ArrowLeft'] && !keyState['ArrowRight']) {
              simX = 512;
            } else if (keyState['ArrowLeft']) {
              simX = 312;
            } else if (keyState['ArrowRight']) {
              simX = 712;
            }
            break;
          case ' ':  // Spacebar for button release
            simButton = 0;
            break;
        }
        
        // Process the simulated data with explicit values for debugging
        console.log('Simulating joystick with:', simX, simY, simButton);
        this.processJoystickData(`${simX},${simY},${simButton}`);
      }
    };
    
    // Register the event handlers
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
    
    // Clean up event listeners on disconnect
    if (this.device) {
      this.device.addEventListener('gattserverdisconnected', () => {
        window.removeEventListener('keydown', this.keydownHandler);
        window.removeEventListener('keyup', this.keyupHandler);
        console.log('Removed keyboard handlers');
      });
    }
  }
  
  /**
   * Set up automatic simulation mode for joystick movement
   * @param {HTMLElement} debugElement - The debug element to update
   * @param {string} deviceName - The name of the device
   */
  setupAutoSimulation(debugElement, deviceName) {
    // Clear any existing simulation
    if (this.simulateInterval) {
      clearInterval(this.simulateInterval);
      this.simulateInterval = null;
    }
    
    // Center position initially
    let simX = 512;
    let simY = 512;
    let simButton = 0;
    
    // Set up interval to simulate data changes
    const simulateInterval = setInterval(() => {
      // Simulate joystick movement patterns
      // We'll create a circular motion pattern
      const time = Date.now() / 1000;
      const radius = 200; // Range of motion
      
      // Circular motion with sin/cos
      simX = 512 + Math.cos(time) * radius;
      simY = 512 + Math.sin(time) * radius;
      
      // Toggle button state occasionally
      if (Math.random() < 0.02) {
        simButton = simButton ? 0 : 1;
      }
      
      // Format as CSV like the actual device would send
      const data = `${Math.round(simX)},${Math.round(simY)},${simButton}`;
      
      // Process the simulated data
      this.processJoystickData(data);
      
      // Update debug display
      if (debugElement) {
        const normalizedX = ((simX - 512) / 512).toFixed(2);
        const normalizedY = (-(simY - 512) / 512).toFixed(2);
        const directionText = this.getDirectionFromValues(normalizedX, normalizedY);
        
        debugElement.innerHTML = `<strong>Connected to ${deviceName || 'HC-06'} (simulated)</strong><br>` +
            `Auto mode: X: ${normalizedX}, Y: ${normalizedY}, Button: ${simButton}<br>` +
            `Direction: <span style="color: lime">${directionText}</span><br>` +
            `<span style="color: yellow">Click 'Enable Manual Mode' to use keyboard</span>`;
        debugElement.style.color = simButton ? 'orange' : 'cyan';
      }
    }, 100); // Update every 100ms
    
    // Store the interval ID so we can clear it on disconnect
    this.simulateInterval = simulateInterval;
    
    // Clean up on disconnect
    if (this.device) {
      this.device.addEventListener('gattserverdisconnected', () => {
        if (this.simulateInterval) {
          clearInterval(this.simulateInterval);
          this.simulateInterval = null;
          console.log('Stopped simulated joystick data');
        }
      });
    }
  }
  
  /**
   * Helper to get direction text from joystick values
   * @param {number} x - Normalized X value (-1 to 1)
   * @param {number} y - Normalized Y value (-1 to 1)
   * @returns {string} Direction text
   */
  getDirectionFromValues(x, y) {
    // Threshold to determine if there's significant movement
    const threshold = 0.1;
    
    // Parse strings to numbers if needed
    x = parseFloat(x);
    y = parseFloat(y);
    
    if (Math.abs(x) < threshold && Math.abs(y) < threshold) {
      return "CENTER";
    }
    
    // Determine primary direction based on magnitude
    if (Math.abs(x) > Math.abs(y)) {
      // X-axis is dominant
      return x > 0 ? "RIGHT" : "LEFT";
    } else {
      // Y-axis is dominant
      return y > 0 ? "DOWN" : "UP";
    }
  }
  
  /**
   * Process incoming data from the characteristic
   * @param {Event} event - The characteristic value changed event
   */
  onCharacteristicValueChanged(event) {
    // Get the data value as a string
    const value = new TextDecoder().decode(event.target.value);
    console.log('Received data:', value);
    
    // Add to buffer
    this.buffer += value;
    
    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop(); // Keep the incomplete line in the buffer
    
    // Process each complete line
    for (const line of lines) {
      if (line.trim()) {
        this.processJoystickData(line);
      }
    }
  }
  
  /**
   * Process joystick data from a CSV line
   * @param {string} data - CSV formatted data from the joystick
   */
  processJoystickData(data) {
    console.log('Processing joystick data:', data);
    
    // Parse CSV format: "X,Y,BUTTON"
    const values = data.trim().split(',');
    if (values.length >= 3) {
      // Parse joystick values (0-1023 from Arduino)
      const rawX = parseInt(values[0]);
      const rawY = parseInt(values[1]);
      const buttonState = parseInt(values[2]);
      
      // Check if values are valid numbers
      if (!isNaN(rawX) && !isNaN(rawY) && !isNaN(buttonState)) {
        // Update joystick values
        this.joystickX = rawX;
        this.joystickY = rawY;
        this.buttonPressed = buttonState === 1;
        
        // Normalize joystick values to range -1 to 1
        let x = (rawX - 512) / 512;
        let y = (rawY - 512) / 512;
        
        // Flip Y axis if needed
        y = -y;
        
        // Apply smaller deadzone
        const deadzone = 0.08;
        if (Math.abs(x) < deadzone) x = 0;
        if (Math.abs(y) < deadzone) y = 0;
        
        // Apply non-linear scaling for better control
        x = Math.sign(x) * Math.pow(Math.abs(x), 0.8);
        y = Math.sign(y) * Math.pow(Math.abs(y), 0.8);
        
        // Always call joystick data callback regardless of mode
        // This ensures the game always receives input even in manual mode
        if (this.onJoystickData) {
          console.log('Sending to game:', x, y, this.buttonPressed);
          this.onJoystickData(x, y, this.buttonPressed);
        } else {
          console.warn('No joystick callback registered - game will not receive input!');
        }
        
        // Update debug element with the coordinates
        const debugElement = document.getElementById('joystick-debug');
        if (debugElement) {
          const directionText = this.getDirectionFromValues(x, y);
          debugElement.innerHTML = `<strong>Connected to ${this.device?.name || 'HC-06'}</strong><br>` +
              `<span style="color: #4CAF50">${this.manualMode ? 'MANUAL MODE: Use keyboard arrows' : 'AUTO MODE: Circle movement'}</span><br>` +
              `X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Button: ${this.buttonPressed ? 'PRESSED' : 'released'}<br>` +
              `<span style="color: ${Math.abs(x) > 0.1 || Math.abs(y) > 0.1 ? 'lime' : 'yellow'}">` +
              `Direction: ${directionText}</span>`;
          
          // Change color based on button press
          debugElement.style.color = this.buttonPressed ? 'orange' : 'white';
        }
        
        // Return processed values
        return { x, y, buttonPressed: this.buttonPressed };
      }
    }
    return null;
  }
  
  /**
   * Disconnect from the Bluetooth device
   */
  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      await this.device.gatt.disconnect();
    }
    this.connected = false;
    console.log('Bluetooth joystick disconnected');
  }
  
  /**
   * Register a callback function to receive joystick data
   * @param {function} callback - Function to call with joystick data
   */
  setJoystickDataCallback(callback) {
    this.onJoystickData = callback;
  }
  
  /**
   * Check if the browser supports Web Bluetooth API
   * @returns {boolean} True if supported, false otherwise
   */
  static isSupported() {
    return 'bluetooth' in navigator;
  }
  
  /**
   * Helper method to get more detailed debugging information for the device
   * Especially useful for Mac users who have trouble with HC-06 connections
   * @param {BluetoothDevice} device - The Bluetooth device to debug
   * @returns {Object} Object containing debug information
   */
  static getDeviceDebugInfo(device) {
    const info = {
      name: device.name || 'Unnamed device',
      id: device.id,
      connected: device.gatt ? device.gatt.connected : false,
      isMac: navigator.platform.includes('Mac'),
      isPotentialSerialPort: device.name && device.name.startsWith('cu.'),
      isAppleAudioDevice: device.name && (device.name.includes('AirPods') || device.name.includes('Beats')),
      isLikelyHC06: device.name && (device.name.includes('HC-06') || device.name.includes('HC-05') || device.name.includes('JY')),
      browser: navigator.userAgent,
      timestamp: new Date().toISOString()
    };
    
    // Add Mac-specific advice
    if (info.isMac) {
      if (info.isPotentialSerialPort) {
        info.advice = 'This appears to be a serial port device, not the actual Bluetooth device. On Mac, look for "HC-06" without the "cu." prefix in the selection dialog.';
      } else if (info.isAppleAudioDevice) {
        info.advice = 'This is an Apple audio device, not your joystick. Please select the HC-06 device instead.';
      } else if (info.isLikelyHC06) {
        info.advice = 'This looks like the correct HC-06 device. If connection fails, make sure it\'s properly paired in System Settings > Bluetooth.';
      }
    }
    
    return info;
  }
  
  /**
   * Print detailed connection troubleshooting steps, especially for Mac users
   * @param {HTMLElement} debugElement - Element to display debug information
   */
  static printConnectionHelp(debugElement) {
    console.log('Bluetooth connection troubleshooting guide:');
    const steps = [
      'Make sure Bluetooth is enabled on your device',
      'For HC-06 modules, make sure the LED is blinking (not solid)',
      'On Mac: Open System Settings > Bluetooth and make sure the HC-06 device is paired',
      'On Mac: Choose the device named "HC-06" (without any "cu." prefix) in the selection dialog',
      'Try refreshing the page and reconnecting',
      'Try using the "Test Bluetooth" button before connecting',
      'Some browsers may require you to use an HTTPS connection for Bluetooth access'
    ];
    
    steps.forEach((step, index) => console.log(`${index + 1}. ${step}`));
    
    if (debugElement) {
      debugElement.innerHTML = '<strong>Connection Help:</strong><br>' + 
        steps.map(step => `• ${step}`).join('<br>');
      debugElement.style.color = 'orange';
    }
  }
}

// Export the class
export default BluetoothController; 