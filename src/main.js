import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SerialController from './serial-controller.js';

// Game constants
const MAX_SPEED = 15; // km/h - set to 15 as requested
const ACCELERATION = 10.0; // Increased from 4.0 for faster acceleration
const BRAKING = 6.0; // Unchanged
const FRICTION = 0.85; // Unchanged
const OFF_TRACK_FRICTION = 0.80; // Unchanged
const TURN_RATE = 0.03; // Unchanged - current turning speed is good
const STAR_COUNT = 150;
const MAX_LAPS = 3;
const TRACK_WIDTH = 40; // Unchanged
const TRACK_POINTS = [];
const CHECKPOINT_COUNT = 8;
const WRONG_WAY_RESET_DELAY = 3000; // 3 seconds
const COLLISION_BOUNCE = 0.5; // Bouncing factor for collisions
const COUNTDOWN_DURATION = 3000; // 3 seconds countdown
const JOYSTICK_DEADZONE = 0.15; // Deadzone to prevent drift when joystick is centered

// Game state
let gameRunning = false;
let gameOver = false;
let currentLap = 0;
let currentCheckpoint = 0;
let lapStartTime = 0;
let currentTime = 0;
let targetTime = 60000; // 1 minute in milliseconds
let isWrongWay = false;
let wrongWayTimestamp = 0;
let stars = [];
let checkpoints = [];
let levelIndex = 0;
let countdownActive = false;
let countdownStartTime = 0;

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

// Car state
const car = {
  model: null,
  speed: 0, // km/h
  velocity: new THREE.Vector3(0, 0, 0),
  position: new THREE.Vector3(0, 0.5, 0),
  rotation: new THREE.Euler(0, 0, 0),
  direction: new THREE.Vector3(0, 0, 1),
  isOffTrack: false
};

// Controls
let serialController = null;
let controls; // For development camera

// Track objects
let trackMesh;
let offTrackMesh;

// Audio elements
const audioElements = {
  engine: null,
  star_collect: null,
  lap_complete: null,
  fail: null,
  victory: null,
  brake: null,
  accelerate: null,
  offtrack: null,
  wrong_direction: null
};

// Track definitions for different levels - doubled in size
const trackLevels = [
  // Level 1 - Simple oval - increased size
  [
    new THREE.Vector3(0, 0, 200),
    new THREE.Vector3(200, 0, 200),
    new THREE.Vector3(300, 0, 100),
    new THREE.Vector3(300, 0, -100),
    new THREE.Vector3(200, 0, -200),
    new THREE.Vector3(0, 0, -200),
    new THREE.Vector3(-200, 0, -200),
    new THREE.Vector3(-300, 0, -100),
    new THREE.Vector3(-300, 0, 100),
    new THREE.Vector3(-200, 0, 200)
  ],
  // Level 2 - Figure 8 - increased size
  [
    new THREE.Vector3(0, 0, 200),
    new THREE.Vector3(200, 0, 200),
    new THREE.Vector3(300, 0, 100),
    new THREE.Vector3(200, 0, 0),
    new THREE.Vector3(300, 0, -100),
    new THREE.Vector3(200, 0, -200),
    new THREE.Vector3(0, 0, -200),
    new THREE.Vector3(-200, 0, -200),
    new THREE.Vector3(-300, 0, -100),
    new THREE.Vector3(-200, 0, 0),
    new THREE.Vector3(-300, 0, 100),
    new THREE.Vector3(-200, 0, 200)
  ],
  // Level 3 - Complex with hills - increased size
  [
    new THREE.Vector3(0, 0, 200),
    new THREE.Vector3(200, 0, 200),
    new THREE.Vector3(300, 5, 100),
    new THREE.Vector3(400, 10, 0),
    new THREE.Vector3(400, 5, -200),
    new THREE.Vector3(200, 0, -300),
    new THREE.Vector3(0, 0, -200),
    new THREE.Vector3(-200, 5, -300),
    new THREE.Vector3(-400, 10, -200),
    new THREE.Vector3(-300, 5, 0),
    new THREE.Vector3(-200, 0, 100)
  ]
];

// Scene objects
const obstacles = []; // Store all collidable objects
const treePositions = []; // Store tree positions for minimap
const mountainPositions = []; // Store mountain positions for minimap

// Initialize the game
async function init() {
  console.log("Initializing game...");
  
  // Create game container if it doesn't exist
  if (!document.getElementById('game-container')) {
    const gameContainer = document.createElement('div');
    gameContainer.id = 'game-container';
    gameContainer.style.width = '100%';
    gameContainer.style.height = '100%';
    gameContainer.style.position = 'absolute';
    gameContainer.style.top = '0';
    gameContainer.style.left = '0';
    gameContainer.style.overflow = 'hidden';
    document.body.appendChild(gameContainer);
  }
  
  // Load the car model
  loadCarModel();
  
  // Set up scene, camera, renderer, etc.
  setupScene();
  
  // Set up keyboard controls for development/fallback
  setupKeyboardControls();
  
  // Initialize serial controller and add event listeners for joystick data
  serialController = new SerialController();
  
  // Create a debug element but hide it initially
  const debugElement = document.createElement('div');
  debugElement.id = 'joystick-debug';
  debugElement.style.position = 'fixed';
  debugElement.style.top = '40px';
  debugElement.style.left = '10px';
  debugElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  debugElement.style.color = 'white';
  debugElement.style.padding = '10px';
  debugElement.style.borderRadius = '5px';
  debugElement.style.zIndex = '1000';
  debugElement.style.fontSize = '14px';
  debugElement.style.fontFamily = 'monospace';
  debugElement.style.display = 'none'; // Hide initially
  debugElement.textContent = 'Controller: Not connected';
  document.body.appendChild(debugElement);
  
  // Set up event listeners for window resize
  window.addEventListener('resize', onWindowResize, false);
  
  // Try to connect to the serial controller automatically at startup
  try {
    // Make sure any existing overlays are cleared
    forceRemoveAllOverlays();
    
    // Create the connect button that attempts auto-connect first
    createConnectButton();
    
    // Add debug button to help troubleshoot
    createDebugButton();
    
    // Set up joystick data callback
    serialController.setJoystickDataCallback(handleControllerInput);
    
    // Add controller connected event listener to start game automatically
    document.addEventListener('controller-connected', () => {
      // Remove any connection buttons
      const connectBtn = document.getElementById('connect-controller-btn');
      if (connectBtn) connectBtn.style.display = 'none';
      
      const startWithoutBtn = document.getElementById('start-without-btn');
      if (startWithoutBtn) startWithoutBtn.style.display = 'none';
      
      // Force clear all overlays
      forceRemoveAllOverlays();
      
      // Show the joystick debug element when connected
      const debugElement = document.getElementById('joystick-debug');
      if (debugElement) debugElement.style.display = 'block';
      
      // Start the game after a short delay
      setTimeout(() => {
        startCountdown();
      }, 500);
    });
    
    console.log("Serial controller initialized");
  } catch (error) {
    console.error("Failed to initialize serial controller:", error);
  }
  
  // Start animation loop
  animate();
}

// Create a connect button that attempts auto-connect first
function createConnectButton() {
  // Remove any existing buttons
  const existingButton = document.getElementById('connect-controller-btn');
  if (existingButton) existingButton.remove();
  const existingStartWithout = document.getElementById('start-without-btn');
  if (existingStartWithout) existingStartWithout.remove();
  
  // Make sure any overlays that might be interfering are removed
  const countdownOverlay = document.getElementById('countdown-overlay');
  if (countdownOverlay) countdownOverlay.style.display = 'none';
  
  const messageOverlay = document.getElementById('message-overlay');
  if (messageOverlay) messageOverlay.style.display = 'none';
  
  // Create new buttons
  const button = document.createElement('button');
  button.id = 'connect-controller-btn';
  button.innerText = 'Connect Controller';
  button.style.position = 'fixed';
  button.style.top = '50%';
  button.style.left = '50%';
  button.style.transform = 'translate(-50%, -50%)';
  button.style.padding = '15px 25px';
  button.style.background = 'rgba(0, 100, 255, 0.8)';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.borderRadius = '8px';
  button.style.fontSize = '18px';
  button.style.cursor = 'pointer';
  button.style.zIndex = '5000'; // Much higher z-index to ensure it's on top
  button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
  
  // Add hover effect
  button.onmouseover = () => {
    button.style.background = 'rgba(30, 130, 255, 0.9)';
    button.style.boxShadow = '0 6px 12px rgba(0,0,0,0.4)';
  };
  button.onmouseout = () => {
    button.style.background = 'rgba(0, 100, 255, 0.8)';
    button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
  };
  
  // Add a "Start Game without Controller" button 
  const startWithoutButton = document.createElement('button');
  startWithoutButton.id = 'start-without-btn';
  startWithoutButton.innerText = 'Start Without Controller';
  startWithoutButton.style.position = 'fixed';
  startWithoutButton.style.top = 'calc(50% + 60px)';
  startWithoutButton.style.left = '50%';
  startWithoutButton.style.transform = 'translate(-50%, -50%)';
  startWithoutButton.style.padding = '10px 20px';
  startWithoutButton.style.background = 'rgba(50, 150, 50, 0.8)';
  startWithoutButton.style.color = 'white';
  startWithoutButton.style.border = 'none';
  startWithoutButton.style.borderRadius = '8px';
  startWithoutButton.style.fontSize = '14px';
  startWithoutButton.style.cursor = 'pointer';
  startWithoutButton.style.zIndex = '1000';
  startWithoutButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
  
  // Add hover effect
  startWithoutButton.onmouseover = () => {
    startWithoutButton.style.background = 'rgba(70, 170, 70, 0.9)';
  };
  startWithoutButton.onmouseout = () => {
    startWithoutButton.style.background = 'rgba(50, 150, 50, 0.8)';
  };
  
  // When clicked, start the game without controller
  startWithoutButton.onclick = () => {
    // Hide both buttons
    button.style.display = 'none';
    startWithoutButton.style.display = 'none';
    
    // Update debug message and make it visible
    const debugElement = document.getElementById('joystick-debug');
    if (debugElement) {
      debugElement.textContent = 'Using keyboard controls. Arrow keys to drive, Space for boost.';
      debugElement.style.color = 'cyan';
      debugElement.style.display = 'block';
    }
    
    // Set up keyboard controls
    if (serialController) {
      serialController.setupKeyboardHandlers();
    }
    
    // Force clear all overlays
    forceRemoveAllOverlays();
    
    // Start the game
    startCountdown();
  };
  
  // When clicked, attempt to connect to the controller
  button.onclick = async () => {
    console.log("Connect button clicked"); // Debug log
    try {
      // Try to connect to the controller
      button.innerText = 'Connecting...';
      button.disabled = true;
      
      // Show debug element during connection
      const debugElement = document.getElementById('joystick-debug');
      if (debugElement) {
        debugElement.textContent = 'Connecting to controller...';
        debugElement.style.color = 'yellow';
        debugElement.style.display = 'block';
      }
      
      await serialController.connect();
      
      // Clear all overlays completely
      forceRemoveAllOverlays();
      
      // Show a success message
      const successMessage = document.createElement('div');
      successMessage.textContent = 'Controller connected!';
      successMessage.style.position = 'fixed';
      successMessage.style.top = '50%';
      successMessage.style.left = '50%';
      successMessage.style.transform = 'translate(-50%, -50%)';
      successMessage.style.padding = '15px 25px';
      successMessage.style.background = 'rgba(0, 180, 0, 0.8)';
      successMessage.style.color = 'white';
      successMessage.style.borderRadius = '8px';
      successMessage.style.fontSize = '18px';
      successMessage.style.zIndex = '5000';
      document.body.appendChild(successMessage);
      
      // Remove success message after 2 seconds
      setTimeout(() => {
        document.body.removeChild(successMessage);
        
        // Start the game
        startCountdown();
      }, 2000);
      
    } catch (error) {
      console.error("Failed to connect to controller:", error);
      
      // Show an error message on the button
      button.innerText = 'Connection Failed - Try Again';
      button.style.background = 'rgba(200, 30, 30, 0.8)';
      button.disabled = false;
      
      // Update debug element
      const debugElement = document.getElementById('joystick-debug');
      if (debugElement) {
        debugElement.textContent = 'Connection failed: ' + error.message;
        debugElement.style.color = 'red';
      }
      
      // Reset after 3 seconds
      setTimeout(() => {
        button.innerText = 'Connect Controller';
        button.style.background = 'rgba(0, 100, 255, 0.8)';
        
        // Hide debug element after error
        if (debugElement) debugElement.style.display = 'none';
      }, 3000);
    }
  };
  
  // Add buttons to the page
  document.body.appendChild(button);
  document.body.appendChild(startWithoutButton);
  
  // Try auto-connect when the page loads
  setTimeout(async () => {
    try {
      console.log("Attempting auto-connect...");
      const autoConnected = await serialController.autoConnect();
      
      if (autoConnected) {
        console.log("Auto-connect successful");
        // If auto-connect was successful, remove both buttons
        button.style.display = 'none';
        startWithoutButton.style.display = 'none';
        
        // Force remove all overlays before starting the game
        forceRemoveAllOverlays();
        
        // Start the game after a short delay
        setTimeout(() => {
          startCountdown();
        }, 1000);
      } else {
        console.log("Auto-connect did not connect to any device");
      }
    } catch (error) {
      console.log("Auto-connect failed with error:", error);
    }
  }, 500); // Wait a bit to ensure everything is loaded
}

// Setup keyboard controls for testing
function setupKeyboardControls() {
  // Track key down events
  window.addEventListener('keydown', (event) => {
    // Store the key state
    window.keyStates[event.key] = true;
    
    // Respond to keyboard input even if game isn't running
    switch(event.key) {
      case 'ArrowUp':
        // Accelerate
        car.speed += ACCELERATION * 0.1; // Reduced for smoother acceleration
        if (car.speed > MAX_SPEED) car.speed = MAX_SPEED;
        break;
      case 'ArrowDown':
        // Brake
        car.speed -= BRAKING * 0.1; // Reduced for smoother deceleration
        if (car.speed < 0) car.speed = 0;
        break;
      case 'ArrowLeft':
        // Turn left - smoother turning even at low speeds
        car.rotation.y += TURN_RATE;
        break;
      case 'ArrowRight':
        // Turn right - smoother turning even at low speeds
        car.rotation.y -= TURN_RATE;
        break;
      case ' ': // Space bar
        // Force start game
        startGame();
        break;
      case 'd':
        // Debug dump of state
        console.log('Car state:', {
          position: car.position.clone(),
          rotation: car.rotation.clone(),
          direction: car.direction.clone(),
          speed: car.speed,
          velocity: car.velocity.clone(),
          isOffTrack: car.isOffTrack,
          gameRunning: gameRunning,
          gameOver: gameOver
        });
        break;
    }
  });
  
  // Track key up events
  window.addEventListener('keyup', (event) => {
    // Clear the key state when released
    window.keyStates[event.key] = false;
  });
}

// Create base terrain
function createBaseTerrain() {
  // Ground plane (green field)
  const groundGeometry = new THREE.PlaneGeometry(2000, 2000, 20, 20);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x228B22,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);
}

// Create race track based on the current level
function createRaceTrack() {
  // Remove existing track if any
  if (trackMesh) scene.remove(trackMesh);
  if (offTrackMesh) scene.remove(offTrackMesh);
  
  // Get track points for current level
  const trackPoints = trackLevels[levelIndex];
  
  // Create a closed loop by adding the first point at the end
  const closedTrack = [...trackPoints, trackPoints[0]];
  
  // Create track curve
  const trackCurve = new THREE.CatmullRomCurve3(closedTrack);
  trackCurve.closed = true;
  
  // Store track points for collision detection and checkpoints
  const points = trackCurve.getPoints(200);
  TRACK_POINTS.length = 0; // Clear array
  points.forEach(p => TRACK_POINTS.push(p));
  
  // Create track geometry
  const trackGeometry = new THREE.TubeGeometry(trackCurve, 200, TRACK_WIDTH, 16, true);
  const trackMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x333333, 
    roughness: 0.8
  });
  
  trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);
  
  // Create off-track area (sand/dirt) with more contrast
  const offTrackGeometry = new THREE.TubeGeometry(trackCurve, 200, TRACK_WIDTH + 20, 16, true); // Wider off-track
  const offTrackMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8B4513, // Darker brown for more contrast
    roughness: 1.0
  });
  
  offTrackMesh = new THREE.Mesh(offTrackGeometry, offTrackMaterial);
  offTrackMesh.position.y = -0.1; // Slightly lower
  offTrackMesh.receiveShadow = true;
  scene.add(offTrackMesh);
  
  // Add visible track edges for better visibility
  const innerEdgeGeometry = new THREE.TubeGeometry(trackCurve, 200, TRACK_WIDTH - 2, 16, true);
  const edgeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFFFFF, // White edge lines
    roughness: 0.5,
    metalness: 0.2
  });
  
  const innerEdge = new THREE.Mesh(innerEdgeGeometry, edgeMaterial);
  innerEdge.position.y = 0.02; // Slightly above track
  innerEdge.receiveShadow = true;
  scene.add(innerEdge);
  
  // Add track markings
  addTrackMarkings(trackCurve);
  
  // Set car position at the starting line - make sure this works 
  if (TRACK_POINTS.length > 0) {
    car.position.copy(TRACK_POINTS[0]);
    car.position.y = 0.5; // Car height off ground
    
    console.log("Set car position to:", car.position);
    
    // Calculate initial direction to face along the track
    if (TRACK_POINTS.length > 1) {
      const nextPoint = TRACK_POINTS[1];
      const direction = new THREE.Vector3().subVectors(nextPoint, TRACK_POINTS[0]).normalize();
      car.direction.copy(direction);
      
      // Set rotation to face direction
      const angle = Math.atan2(direction.x, direction.z);
      car.rotation.y = angle;
      
      console.log("Set car direction:", direction, "and rotation:", car.rotation);
    }
  } else {
    console.error("TRACK_POINTS is empty, can't position car!");
  }
}

// Add track markings (start/finish line, lane markings)
function addTrackMarkings(trackCurve) {
  // Start/finish line - make it larger and more visible
  const startLineGeometry = new THREE.PlaneGeometry(TRACK_WIDTH * 0.9, 5);
  const startLineMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xFFFFFF,
    side: THREE.DoubleSide
  });
  const startLine = new THREE.Mesh(startLineGeometry, startLineMaterial);
  
  const startPos = TRACK_POINTS[0];
  const direction = new THREE.Vector3().subVectors(TRACK_POINTS[1], startPos).normalize();
  const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);
  
  startLine.position.copy(startPos);
  startLine.position.y += 0.05; // Slightly above track
  startLine.rotation.x = Math.PI / 2;
  startLine.rotation.y = Math.atan2(perpendicular.x, perpendicular.z);
  
  scene.add(startLine);
  
  // Create checkered pattern for start/finish line
  const checkerSize = 2.5; // Size of each checker square
  const checkerRows = 2;
  const checkerCols = Math.floor(TRACK_WIDTH * 0.9 / checkerSize);
  
  for (let row = 0; row < checkerRows; row++) {
    for (let col = 0; col < checkerCols; col++) {
      // Only create checkers for alternating squares
      if ((row + col) % 2 === 0) continue;
      
      const checkerGeometry = new THREE.PlaneGeometry(checkerSize, checkerSize);
      const checkerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000, // Black checkers
        side: THREE.DoubleSide
      });
      const checker = new THREE.Mesh(checkerGeometry, checkerMaterial);
      
      // Position each checker within the start line
      const xOffset = (col - checkerCols / 2 + 0.5) * checkerSize;
      const zOffset = (row - checkerRows / 2 + 0.5) * checkerSize;
      
      // Apply rotation and offset to position correctly
      checker.position.copy(startPos);
      checker.position.y += 0.06; // Slightly above start line
      
      // Use the perpendicular and direction vectors to place correctly
      checker.position.add(
        perpendicular.clone().multiplyScalar(xOffset)
      );
      checker.position.add(
        direction.clone().multiplyScalar(zOffset)
      );
      
      checker.rotation.x = Math.PI / 2;
      checker.rotation.y = Math.atan2(perpendicular.x, perpendicular.z);
      
      scene.add(checker);
    }
  }
  
  // Add dashed lane markings along the center of the track - more of them
  const dashedLineCount = 200; // More lane markings
  const trackLength = trackCurve.getLength();
  const dashLength = 3; // Longer dashes
  const gapLength = 3;
  
  for (let i = 0; i < dashedLineCount; i++) {
    const t = (i * (dashLength + gapLength)) / trackLength;
    if (t > 1) break;
    
    const lineGeometry = new THREE.PlaneGeometry(1.0, dashLength); // Wider line
    const lineMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xFFFFFF, // White
      side: THREE.DoubleSide
    });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    
    const pointOnCurve = trackCurve.getPointAt(t);
    const tangent = trackCurve.getTangentAt(t);
    
    line.position.copy(pointOnCurve);
    line.position.y += 0.05; // Slightly above track
    line.rotation.x = Math.PI / 2;
    line.rotation.y = Math.atan2(tangent.x, tangent.z);
    
    scene.add(line);
  }
}

// Create environment elements (completely simplified - no scenery)
function createEnvironment() {
  // Clear previous obstacles and positions
  obstacles.length = 0;
  treePositions.length = 0;
  mountainPositions.length = 0;
  
  // No scenery is added - track and stars only
}

// Load car model with simplified realistic appearance
function loadCarModel() {
  // Create a proper car with simple but recognizable components
  const carGroup = new THREE.Group();
  
  // Main body - simple race car shape
  const bodyGeometry = new THREE.BoxGeometry(2.5, 0.6, 5.5);
  const bodyMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xE30000, // Bright red
    metalness: 0.7,
    roughness: 0.2
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.6;
  body.castShadow = true;
  carGroup.add(body);
  
  // Upper body/cabin - low profile with single piece
  const cabinGeometry = new THREE.BoxGeometry(2.0, 0.5, 2.8);
  const cabinMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x111111, // Dark/black
    metalness: 0.5,
    roughness: 0.5
  });
  const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
  cabin.position.set(0, 1.1, 0); // Centered on car, slightly forward
  cabin.castShadow = true;
  carGroup.add(cabin);
  
  // Front hood - sloped
  const hoodGeometry = new THREE.BoxGeometry(2.4, 0.4, 1.8);
  const hood = new THREE.Mesh(hoodGeometry, bodyMaterial);
  hood.position.set(0, 0.85, 1.8); // In front of cabin
  hood.castShadow = true;
  carGroup.add(hood);
  
  // Rear section
  const rearGeometry = new THREE.BoxGeometry(2.4, 0.5, 1.2);
  const rear = new THREE.Mesh(rearGeometry, bodyMaterial);
  rear.position.set(0, 0.9, -2.0); // Behind cabin
  rear.castShadow = true;
  carGroup.add(rear);
  
  // Windshield - flat blue glass
  const windshieldGeometry = new THREE.PlaneGeometry(1.8, 0.8);
  const glassMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x84CFFF,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  const windshield = new THREE.Mesh(windshieldGeometry, glassMaterial);
  windshield.position.set(0, 1.3, 1.0);
  windshield.rotation.x = Math.PI / 6; // Angled windshield
  carGroup.add(windshield);
  
  // Front bumper
  const bumperGeometry = new THREE.BoxGeometry(2.4, 0.5, 0.4);
  const bumperMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x333333,
    metalness: 0.5,
    roughness: 0.5
  });
  const frontBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
  frontBumper.position.set(0, 0.4, 2.7);
  carGroup.add(frontBumper);
  
  // Rear bumper
  const rearBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
  rearBumper.position.set(0, 0.4, -2.7);
  carGroup.add(rearBumper);
  
  // Headlights - simple flat circles
  const headlightGeometry = new THREE.CircleGeometry(0.3, 16);
  const headlightMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFFFFF,
    emissive: 0xFFFF99,
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide
  });
  
  // Left headlight
  const headlightL = new THREE.Mesh(headlightGeometry, headlightMaterial);
  headlightL.position.set(-0.8, 0.7, 2.75);
  headlightL.rotation.y = Math.PI; // Face forward
  carGroup.add(headlightL);
  
  // Right headlight
  const headlightR = new THREE.Mesh(headlightGeometry, headlightMaterial);
  headlightR.position.set(0.8, 0.7, 2.75);
  headlightR.rotation.y = Math.PI; // Face forward
  carGroup.add(headlightR);
  
  // Taillights - simple red rectangles
  const taillightGeometry = new THREE.PlaneGeometry(0.5, 0.3);
  const taillightMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFF0000,
    emissive: 0xFF0000,
    emissiveIntensity: 0.8,
    side: THREE.DoubleSide
  });
  
  // Left taillight
  const taillightL = new THREE.Mesh(taillightGeometry, taillightMaterial);
  taillightL.position.set(-0.8, 0.7, -2.75);
  carGroup.add(taillightL);
  
  // Right taillight
  const taillightR = new THREE.Mesh(taillightGeometry, taillightMaterial);
  taillightR.position.set(0.8, 0.7, -2.75);
  carGroup.add(taillightR);
  
  // Simple spoiler on back
  const spoilerStandGeometry = new THREE.BoxGeometry(0.1, 0.4, 0.1);
  const spoilerMaterial = cabinMaterial;
  
  // Left spoiler stand
  const spoilerStandL = new THREE.Mesh(spoilerStandGeometry, spoilerMaterial);
  spoilerStandL.position.set(-1.0, 1.0, -2.3);
  carGroup.add(spoilerStandL);
  
  // Right spoiler stand
  const spoilerStandR = new THREE.Mesh(spoilerStandGeometry, spoilerMaterial);
  spoilerStandR.position.set(1.0, 1.0, -2.3);
  carGroup.add(spoilerStandR);
  
  // Spoiler wing
  const spoilerWingGeometry = new THREE.BoxGeometry(2.2, 0.1, 0.5);
  const spoilerWing = new THREE.Mesh(spoilerWingGeometry, spoilerMaterial);
  spoilerWing.position.set(0, 1.2, -2.3);
  carGroup.add(spoilerWing);
  
  // Create wheels with clearly visible rotation
  const createWheel = (x, z, isFront) => {
    const wheelGroup = new THREE.Group();
    
    // Tire - cylinder oriented for proper rotation along car's movement
    const tireGeometry = new THREE.CylinderGeometry(0.7, 0.7, 0.5, 24);
    const tireMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x222222, // Black tire
      roughness: 0.9
    });
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    
    // Rotate tire to align with car's X-axis (across the width of the car)
    tire.rotation.z = Math.PI / 2;
    wheelGroup.add(tire);
    
    // Create rim with same orientation
    const rimGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.51, 24);
    const rimMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xCCCCCC, // Silver
      metalness: 0.8,
      roughness: 0.2
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.z = Math.PI / 2; // Same orientation as tire
    wheelGroup.add(rim);
    
    // Add clearly visible spokes to show rotation
    const spokeCount = 5;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      
      // Create a spoke that goes from center to rim
      const spokeGeometry = new THREE.BoxGeometry(0.4, 0.08, 0.08);
      const spokeMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.7,
        roughness: 0.3
      });
      
      const spoke = new THREE.Mesh(spokeGeometry, spokeMaterial);
      
      // Position the spoke to connect center to rim
      spoke.position.set(0, 0, 0);
      spoke.rotation.z = Math.PI / 2; // Align with wheel orientation
      spoke.rotation.x = angle; // Distribute spokes evenly around wheel
      
      // Shift spoke to be halfway from center to edge
      spoke.translateY(0.25);
      
      rim.add(spoke); // Add to rim so it rotates with it
    }
    
    // Create center hub cap with contrasting color
    const hubCapGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.52, 16);
    const hubCapMaterial = new THREE.MeshStandardMaterial({
      color: 0xE60000, // Bright red to match car and be visible
      metalness: 0.9,
      roughness: 0.1
    });
    const hubCap = new THREE.Mesh(hubCapGeometry, hubCapMaterial);
    hubCap.rotation.z = Math.PI / 2; // Same orientation as wheel
    wheelGroup.add(hubCap);
    
    // Add a logo to the hub cap end for extra visibility when rotating
    const logoGeometry = new THREE.BoxGeometry(0.1, 0.02, 0.1);
    const logoMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      metalness: 0.9,
      roughness: 0.1
    });
    
    // Logo on left side
    const logoLeft = new THREE.Mesh(logoGeometry, logoMaterial);
    logoLeft.position.set(0.26, 0, 0);
    logoLeft.rotation.y = Math.PI / 2;
    wheelGroup.add(logoLeft);
    
    // Logo on right side
    const logoRight = new THREE.Mesh(logoGeometry, logoMaterial);
    logoRight.position.set(-0.26, 0, 0);
    logoRight.rotation.y = Math.PI / 2;
    wheelGroup.add(logoRight);
    
    // Position the wheel
    wheelGroup.position.set(x, 0.7, z);
    
    // Add user data for later identification
    wheelGroup.userData.isWheel = true;
    wheelGroup.userData.isFrontWheel = isFront;
    
    return wheelGroup;
  };
  
  // Add wheels with proper placement
  const wheelFL = createWheel(-1.3, 1.8, true);  // Front Left
  carGroup.add(wheelFL);
  
  const wheelFR = createWheel(1.3, 1.8, true);   // Front Right
  carGroup.add(wheelFR);
  
  const wheelRL = createWheel(-1.3, -1.8, false); // Rear Left
  carGroup.add(wheelRL);
  
  const wheelRR = createWheel(1.3, -1.8, false);  // Rear Right
  carGroup.add(wheelRR);
  
  // Set up car
  car.model = carGroup;
  car.model.position.copy(car.position);
  car.model.rotation.y = car.rotation.y;
  scene.add(car.model);
}

// Load audio elements
function loadAudio() {
  const sounds = [
    'engine', 'star_collect', 'lap_complete', 
    'fail', 'victory', 'brake', 'accelerate', 
    'offtrack', 'wrong_direction'
  ];
  
  sounds.forEach(sound => {
    audioElements[sound] = new Audio(`/sounds/car/${sound}.mp3`);
    if (sound === 'engine') {
      audioElements[sound].loop = true;
    }
  });
}

// Play sound
function playSound(soundName) {
  if (audioElements[soundName]) {
    audioElements.engine.currentTime = 0;
    audioElements[soundName].play().catch(e => console.log('Error playing sound:', e));
  }
}

// Create stars for collection with actual star appearance
function createStars() {
  // Clear existing stars
  stars.forEach(star => {
    if (star.object) {
      scene.remove(star.object);
    }
  });
  
  stars = [];
  
  // Calculate evenly spaced points along the track
  const trackCurve = new THREE.CatmullRomCurve3([...TRACK_POINTS, TRACK_POINTS[0]]);
  trackCurve.closed = true;
  
  for (let i = 0; i < STAR_COUNT; i++) {
    const t = i / STAR_COUNT;
    
    // Get position on track
    const position = trackCurve.getPointAt(t);
    position.y += 3; // Height above track
    
    // Create star group for a better star shape
    const starGroup = new THREE.Group();
    starGroup.position.copy(position);
    
    // Make stars face the player by always rotating towards camera (billboard effect)
    // This will be updated in the animation loop
    starGroup.lookAtCamera = true;
    
    // Create Mario Kart style 5-pointed star using a custom geometry
    const starShape = new THREE.Shape();
    
    // Parameters for a nice looking star
    const outerRadius = 1.2; // Slightly smaller
    const innerRadius = 0.5; // Slightly smaller
    const numPoints = 5;
    
    // Create a star shape with precise points
    for (let i = 0; i < numPoints * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i / (numPoints * 2)) * Math.PI * 2;
      
      const x = Math.sin(angle) * radius;
      const y = Math.cos(angle) * radius;
      
      if (i === 0) {
        starShape.moveTo(x, y);
      } else {
        starShape.lineTo(x, y);
      }
    }
    
    starShape.closePath();
    
    // Create geometry from the shape
    const starGeometry = new THREE.ShapeGeometry(starShape);
    
    // Create material with bright yellow color and glow
    const starMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFD700, // Gold color
      emissive: 0xFFAA00, // Orange-yellow glow
      emissiveIntensity: 0.8,
      metalness: 0.6,
      roughness: 0.2,
      side: THREE.DoubleSide
    });
    
    // Create the star mesh
    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    
    // Add rotation animation
    starMesh.rotationSpeed = 0.01 + Math.random() * 0.02; // Random rotation speed
    
    // Set initial rotation to make the star perpendicular to ground
    starMesh.rotation.x = Math.PI / 2; // This makes it perpendicular to ground
    
    // Add to group
    starGroup.add(starMesh);
    
    // Add star to scene and stars array
    scene.add(starGroup);
    
    // Create a small glow effect
    const glowSize = 0.5;
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFF00,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    
    // Create a small glowing ring around the star
    const glowRingGeometry = new THREE.RingGeometry(outerRadius + 0.1, outerRadius + 0.3, 16);
    const glowRing = new THREE.Mesh(glowRingGeometry, glowMaterial);
    glowRing.rotation.x = Math.PI / 2; // Match the star's orientation
    starGroup.add(glowRing);
    
    // Apply a small hover animation
    starGroup.hoverSpeed = 0.005 + Math.random() * 0.005;
    starGroup.hoverHeight = 0.3 + Math.random() * 0.2;
    starGroup.hoverOffset = Math.random() * Math.PI * 2;
    starGroup.baseY = position.y;
    
    // Store reference
    stars.push({
      object: starGroup,
      position: position.clone(),
      collected: false,
      rotationSpeed: starMesh.rotationSpeed,
      hoverSpeed: starGroup.hoverSpeed,
      hoverHeight: starGroup.hoverHeight,
      hoverOffset: starGroup.hoverOffset,
      baseY: starGroup.baseY,
      mesh: starMesh
    });
  }
}

// Create checkpoints for tracking progress around the track
function createCheckpoints() {
  // Clear existing checkpoints
  checkpoints.forEach(checkpoint => {
    if (checkpoint.object) {
      scene.remove(checkpoint.object);
    }
  });
  
  checkpoints = [];
  
  // Calculate evenly spaced checkpoints around the track
  for (let i = 0; i < CHECKPOINT_COUNT; i++) {
    const index = Math.floor(i * (TRACK_POINTS.length / CHECKPOINT_COUNT));
    const position = TRACK_POINTS[index].clone();
    
    // Create invisible checkpoint
    const checkpointGeometry = new THREE.SphereGeometry(TRACK_WIDTH, 8, 8);
    const checkpointMaterial = new THREE.MeshBasicMaterial({
      color: 0x00FF00,
      transparent: true,
      opacity: 0.0, // Invisible
      wireframe: true
    });
    
    const checkpointMesh = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
    checkpointMesh.position.copy(position);
    scene.add(checkpointMesh);
    
    // Add checkpoint to array
    checkpoints.push({
      object: checkpointMesh,
      position: position.clone(),
      index: i
    });
  }
}

// Start the game
function startGame() {
  console.log("Starting game...");
  
  // Reset game state
  gameRunning = true;
  gameOver = false;
  currentLap = 0;
  currentCheckpoint = 0;
  car.speed = 0;
  lapStartTime = Date.now();
  
  // Make sure to clear all particles at the start
  clearAllParticles();
  
  console.log("Game state:", { gameRunning, gameOver });
  
  // Reset car position to start line
  car.position.copy(TRACK_POINTS[0]);
  car.position.y = 0.5;
  
  // Calculate initial direction to face along the track
  const nextPoint = TRACK_POINTS[1];
  const direction = new THREE.Vector3().subVectors(nextPoint, TRACK_POINTS[0]).normalize();
  car.direction.copy(direction);
  
  // Set rotation to face direction
  const angle = Math.atan2(direction.x, direction.z);
  car.rotation.y = angle;
  
  // Recreate track and collectibles
  createRaceTrack();
  createStars();
  createCheckpoints();
  
  // Start engine sound
  if (audioElements.engine) {
    audioElements.engine.currentTime = 0;
    audioElements.engine.play().catch(e => console.log('Error playing engine sound:', e));
  }
  
  // Add debug info to display but hide it
  const debugDiv = document.createElement('div');
  debugDiv.id = 'debug-info';
  debugDiv.style.position = 'absolute';
  debugDiv.style.top = '80px';
  debugDiv.style.left = '20px';
  debugDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  debugDiv.style.color = 'white';
  debugDiv.style.padding = '10px';
  debugDiv.style.borderRadius = '5px';
  debugDiv.style.fontFamily = 'monospace';
  debugDiv.style.zIndex = '1000';
  debugDiv.style.display = 'none'; // Hide debug info
  debugDiv.textContent = 'Game running: ' + gameRunning;
  
  // Remove any existing debug div
  const existingDebug = document.getElementById('debug-info');
  if (existingDebug) {
    existingDebug.remove();
  }
  
  document.getElementById('game-container').appendChild(debugDiv);
  
  // Update HUD
  document.getElementById('lap-counter').textContent = `Lap: ${currentLap}/${MAX_LAPS}`;
  document.getElementById('time-display').textContent = '00:00.000';
  document.getElementById('target-time').textContent = `Target: ${formatTime(targetTime)}`;
  
  // Hide any messages
  document.getElementById('message-overlay').style.display = 'none';
  
  // Start the timer
  lapStartTime = Date.now();
  
  // Clear all particles
  clearAllParticles();
}

// Restart the game
function restartGame() {
  startGame();
}

// Store values for tracking car movement
let previousRotationY = 0;
let isTurningLeft = false;
let isTurningRight = false;

// Update car physics with improved wheel rotation and steering
function updateCarPhysics() {
  // Don't check gameRunning here - we want physics to work for testing
  if (gameOver) return;
  
  // Apply very gentle friction when not actively driving
  if (car.isOffTrack) {
    car.speed *= OFF_TRACK_FRICTION;
  } else {
    car.speed *= FRICTION; 
  }
  
  // Stop the car completely when speed is very low to prevent drift
  if (Math.abs(car.speed) < 0.1) {
    car.speed = 0;
  }
  
  // Update direction vector from rotation
  car.direction.set(
    Math.sin(car.rotation.y),
    0,
    Math.cos(car.rotation.y)
  );
  
  // Ensure direction vector is normalized
  car.direction.normalize();
  
  // Calculate new velocity
  const velocityScale = car.speed / 2; 
  car.velocity.copy(car.direction).multiplyScalar(velocityScale);
  
  // Store current position before moving
  const previousPosition = car.position.clone();
  
  // Update position
  car.position.add(car.velocity);
  
  // Keep car on the ground
  car.position.y = 0.5;
  
  // Check collision with obstacles
  if (checkCollisions()) {
    // If collision detected, revert to previous position with a small bounce back
    const bounceVector = new THREE.Vector3().subVectors(previousPosition, car.position).multiplyScalar(COLLISION_BOUNCE);
    car.position.copy(previousPosition).add(bounceVector);
    
    // Reduce speed on collision
    car.speed *= 0.7;
    
    // Play collision sound
    playSound('offtrack');
  }
  
  // Check if car is on track
  checkIfOnTrack();
  
  // Update car model position and rotation
  car.model.position.copy(car.position);
  car.model.rotation.y = car.rotation.y;
  
  // Enhanced wheel rotation with increased speed for visibility
  if (car.model) {
    // Find and update each wheel
    car.model.traverse((child) => {
      if (child.userData && child.userData.isWheel) {
        // Calculate wheel rotation speed for forward/backward motion
        const wheelRadius = 0.7;
        const wheelCircumference = 2 * Math.PI * wheelRadius;
        const rotationPerUnit = (1 / wheelCircumference) * (2 * Math.PI);
        const rotationAmount = car.speed * rotationPerUnit * 0.2;
        
        // Rotate wheel around X-axis for forward/backward motion
        if (car.speed > 0) {
          child.rotation.x += rotationAmount;
        } else if (car.speed < 0) {
          child.rotation.x -= rotationAmount;
        }
        
        // IMPROVED FRONT WHEEL STEERING - more natural and stable
        if (child.userData.isFrontWheel) {
          // Determine the steering input from keyboard or controller
          let steeringInput = 0;
          
          // Check keyboard input
          if (window.keyStates && window.keyStates['ArrowLeft']) {
            steeringInput = 1; // Left
          } else if (window.keyStates && window.keyStates['ArrowRight']) {
            steeringInput = -1; // Right (negative for correct turning direction)
          }
          
          // Check controller input if available (overrides keyboard)
          if (serialController && serialController.inputState) {
            if (serialController.inputState.turnAmount !== undefined) {
              // Use the raw turn amount for proportional steering
              steeringInput = -serialController.inputState.turnAmount;
            }
          }
          
          // Apply gentle damping to wheel rotation to prevent wobbling
          // This adds "stiffness" to the steering
          if (!child.userData.currentSteerAngle) {
            child.userData.currentSteerAngle = 0;
          }
          
          // Calculate target angle - max 0.4 radians (about 23 degrees)
          const maxSteeringAngle = 0.4;
          const targetAngle = steeringInput * maxSteeringAngle;
          
          // Apply smooth damping for natural steering feel
          // This gradually moves the wheels toward the target angle
          const steeringSpeed = 0.15; // Lower is smoother but slower response
          child.userData.currentSteerAngle += (targetAngle - child.userData.currentSteerAngle) * steeringSpeed;
          
          // Apply the calculated steering angle
          child.rotation.y = child.userData.currentSteerAngle;
        }
      }
    });
  }
  
  // Update camera position to follow car
  updateCamera();
  
  // Only check for gameplay events if game is running
  if (gameRunning) {
    // Check for star collisions
    checkStarCollisions();
    
    // Check for checkpoint crossings
    checkCheckpointCrossings();
    
    // Check if going wrong way
    checkWrongWay();
  }
  
  // Update engine sound pitch based on speed
  if (audioElements.engine) {
    const minPitch = 0.5;
    const maxPitch = 2.0;
    const pitch = minPitch + (Math.abs(car.speed) / MAX_SPEED) * (maxPitch - minPitch);
    audioElements.engine.playbackRate = pitch;
  }
  
  // Update speedometer
  updateSpeedometer(car.speed);
}

// Update speedometer gauge
function updateSpeedometer(speed) {
  const speedValue = Math.abs(speed);
  const dial = document.getElementById('speedometer-dial');
  const value = document.getElementById('speedometer-value');
  
  if (dial && value) {
    // Calculate width percentage
    const percentage = (speedValue / MAX_SPEED) * 100;
    
    // Update dial width
    dial.style.width = `${percentage}%`;
    
    // Update speed value
    value.textContent = Math.round(speedValue).toString();
    
    // Add '(R)' indicator for reverse
    if (speed < 0) {
      value.textContent += ' (R)';
    }
  }
}

// Check if car is on track
function checkIfOnTrack() {
  // Find nearest point on track
  let minDistance = Infinity;
  let nearestPoint = null;
  
  for (const point of TRACK_POINTS) {
    const distance = car.position.distanceTo(point);
    if (distance < minDistance) {
      minDistance = distance;
      nearestPoint = point;
    }
  }
  
  // Check if distance is within track width
  const wasOffTrack = car.isOffTrack;
  car.isOffTrack = minDistance > TRACK_WIDTH;
  
  // Play off-track sound when going off track
  if (!wasOffTrack && car.isOffTrack) {
    playSound('offtrack');
  }
}

// Check if car is going the wrong way
function checkWrongWay() {
  if (!gameRunning || gameOver) return;
  
  // Find current and next checkpoint
  const currentCP = checkpoints[currentCheckpoint];
  const nextCPIndex = (currentCheckpoint + 1) % checkpoints.length;
  const nextCP = checkpoints[nextCPIndex];
  
  // Vector from car to next checkpoint
  const toNextCP = new THREE.Vector3().subVectors(nextCP.position, car.position).normalize();
  
  // Check if car direction is opposite to next checkpoint (dot product < 0)
  const dotProduct = car.direction.dot(toNextCP);
  
  // Update wrong way state
  const wasWrongWay = isWrongWay;
  isWrongWay = dotProduct < -0.5 && car.speed > 5;
  
  if (isWrongWay) {
    // Show wrong way message
    document.getElementById('wrong-way').style.display = 'block';
    
    // Play wrong direction sound if just started going wrong way
    if (!wasWrongWay) {
      playSound('wrong_direction');
      wrongWayTimestamp = Date.now();
    }
    
    // Reset car if going wrong way for too long
    if (Date.now() - wrongWayTimestamp > WRONG_WAY_RESET_DELAY) {
      resetCarToTrack();
    }
  } else {
    // Hide wrong way message
    document.getElementById('wrong-way').style.display = 'none';
  }
}

// Reset car to face the correct direction
function resetCarToTrack() {
  // Find current checkpoint
  const currentCP = checkpoints[currentCheckpoint];
  
  // Next checkpoint
  const nextCPIndex = (currentCheckpoint + 1) % checkpoints.length;
  const nextCP = checkpoints[nextCPIndex];
  
  // Place car at current checkpoint facing next checkpoint
  car.position.copy(currentCP.position);
  car.position.y = 0.5;
  
  // Calculate direction to next checkpoint
  const direction = new THREE.Vector3().subVectors(nextCP.position, currentCP.position).normalize();
  car.direction.copy(direction);
  
  // Set rotation to face direction
  const angle = Math.atan2(direction.x, direction.z);
  car.rotation.y = angle;
  
  // Reset speed
  car.speed = 0;
  
  // Reset wrong way flag
  isWrongWay = false;
  document.getElementById('wrong-way').style.display = 'none';
  
  // Show message
  showTempMessage("Reset", "Car positioned in correct direction.", 2000);
}

// Update camera to follow car
function updateCamera() {
  const cameraOffset = new THREE.Vector3();
  cameraOffset.copy(car.direction).multiplyScalar(-10); // Distance behind car
  cameraOffset.y = 5; // Height above car
  
  // Camera position follows car with offset
  camera.position.copy(car.position).add(cameraOffset);
  
  // Look at car
  camera.lookAt(car.position);
}

// Check for collisions with stars
function checkStarCollisions() {
  if (!gameRunning || gameOver) return;
  
  // Define collision radius (size of car + star)
  const collisionRadius = 5;
  
  // Check each star
  stars.forEach((star, index) => {
    if (!star.collected) {
      const distance = car.position.distanceTo(star.position);
      
      if (distance < collisionRadius) {
        // Collect star
        star.collected = true;
        star.object.visible = false;
        
        // Play sound
        playSound('star_collect');
        
        // Add visual effect
        addStarCollectEffect(star.position);
      }
    }
  });
}

// Add particle effect for star collection
function addStarCollectEffect(position) {
  const particleCount = 20;
  const particleGeometry = new THREE.SphereGeometry(0.2, 8, 8);
  const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0xFFD700,
    emissive: 0xFFD700
  });
  
  for (let i = 0; i < particleCount; i++) {
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    particle.position.copy(position);
    
    // Random spread
    particle.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      Math.random() * 0.5,
      (Math.random() - 0.5) * 0.3
    );
    
    // Add to scene
    scene.add(particle);
    
    // Store reference and remove after 1 second
    setTimeout(() => {
      scene.remove(particle);
    }, 1000);
    
    // Add to update list
    particlesToUpdate.push(particle);
  }
}

// Update particles
const particlesToUpdate = [];
function updateParticles() {
  for (let i = particlesToUpdate.length - 1; i >= 0; i--) {
    const particle = particlesToUpdate[i];
    particle.position.add(particle.velocity);
    particle.velocity.y -= 0.01; // Gravity
    
    // Remove if it falls below ground
    if (particle.position.y < 0) {
      scene.remove(particle);
      particlesToUpdate.splice(i, 1);
    }
  }
  
  // Update star animations
  stars.forEach(star => {
    if (!star.collected && star.object) {
      // Apply rotation to the star mesh
      if (star.mesh) {
        star.mesh.rotation.y += star.rotationSpeed; // Rotate on Y axis instead of Z
      }
      
      // Apply hovering effect to the star group
      const time = Date.now() * 0.001;
      const hoverY = Math.sin(time * star.hoverSpeed * 5 + star.hoverOffset) * star.hoverHeight;
      star.object.position.y = star.baseY + hoverY;
      
      // Simple approach to keep stars perpendicular to the ground
      // The initial rotation is already set correctly
    }
  });
}

// Helper function to clear all particles
function clearAllParticles() {
  // Remove all particles from scene
  for (let i = particlesToUpdate.length - 1; i >= 0; i--) {
    scene.remove(particlesToUpdate[i]);
    particlesToUpdate.splice(i, 1);
  }
}

// Check for checkpoint crossings
function checkCheckpointCrossings() {
  if (!gameRunning || gameOver) return;
  
  // Get current checkpoint
  const checkpoint = checkpoints[currentCheckpoint];
  
  // Distance to checkpoint
  const distance = car.position.distanceTo(checkpoint.position);
  
  // Check if passed through checkpoint
  if (distance < TRACK_WIDTH) {
    // Move to next checkpoint
    currentCheckpoint = (currentCheckpoint + 1) % checkpoints.length;
    
    // If crossed start/finish line
    if (currentCheckpoint === 0) {
      completeLap();
    }
  }
}

// Complete a lap
function completeLap() {
  currentLap++;
  
  // Update lap counter
  document.getElementById('lap-counter').textContent = `Lap: ${currentLap}/${MAX_LAPS}`;
  
  // Calculate lap time
  const lapTime = Date.now() - lapStartTime;
  
  // Display time
  document.getElementById('time-display').textContent = formatTime(lapTime);
  
  // Play sound
  playSound('lap_complete');
  
  // Check if final lap
  if (currentLap >= MAX_LAPS) {
    endRace(lapTime <= targetTime);
  } else {
    // Start new lap
    lapStartTime = Date.now();
    
    // Show lap message
    showTempMessage(`Lap ${currentLap} Complete!`, `Time: ${formatTime(lapTime)}`, 2000);
  }
}

// End the race
function endRace(success) {
  gameRunning = false;
  gameOver = true;
  
  // Stop engine sound
  if (audioElements.engine) {
    audioElements.engine.pause();
  }
  
  if (success) {
    // Victory
    playSound('victory');
    
    // Show message with option to advance to next level
    let message = "You beat the target time!";
    
    // Check if there's a next level
    if (levelIndex < trackLevels.length - 1) {
      message += " Ready for the next level?";
      document.getElementById('restart-btn').textContent = "Next Level";
      
      // Set up for next level
      levelIndex++;
    } else {
      message += " You've completed all levels!";
      document.getElementById('restart-btn').textContent = "Play Again";
      
      // Reset to first level
      levelIndex = 0;
    }
    
    showMessage("Victory!", message);
  } else {
    // Failed to beat target time
    playSound('fail');
    
    showMessage("Time's Up!", "You didn't beat the target time. Try again!");
    document.getElementById('restart-btn').textContent = "Retry";
  }
}

// Show a message overlay
function showMessage(title, message) {
  document.getElementById('message-title').textContent = title;
  document.getElementById('message-content').textContent = message;
  document.getElementById('message-overlay').style.display = 'block';
}

// Show a temporary message
function showTempMessage(title, message, duration) {
  showMessage(title, message);
  
  setTimeout(() => {
    document.getElementById('message-overlay').style.display = 'none';
  }, duration);
}

// Format time in minutes:seconds.milliseconds
function formatTime(timeMs) {
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const milliseconds = timeMs % 1000;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

// Handle window resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Main game loop
function gameLoop() {
  requestAnimationFrame(gameLoop);
  
  // Update debug info (still update it but it's hidden)
  const debugDiv = document.getElementById('debug-info');
  if (debugDiv) {
    debugDiv.textContent = `Game running: ${gameRunning}, Game over: ${gameOver}, Car speed: ${car.speed.toFixed(2)}`;
  }
  
  // Update countdown if active
  if (countdownActive) {
    updateCountdown();
  }
  
  if (gameRunning && !gameOver) {
    // Update game time
    currentTime = Date.now() - lapStartTime;
    document.getElementById('time-display').textContent = formatTime(currentTime);
    
    // Check if time exceeded target
    if (currentTime > targetTime && currentLap === MAX_LAPS - 1) {
      endRace(false);
    }
  }
  
  // Update car physics even if not running (for testing)
  updateCarPhysics();
  
  // Update particles
  updateParticles();
  
  // Update minimap
  updateMinimap();
  
  // Update controls if enabled (for debugging)
  if (controls.enabled) {
    controls.update();
  }
  
  // Render scene
  renderer.render(scene, camera);
}

// Check for collisions with any obstacle
function checkCollisions() {
  const carPosition = car.position;
  
  // Car collision radius
  const carRadius = 4; // Adjust based on car size
  
  // Check each obstacle
  for (const obstacle of obstacles) {
    // Get obstacle position
    const obstaclePosition = obstacle.position;
    
    // Get obstacle collision radius (based on obstacle type)
    let obstacleRadius = 5; // Default
    
    if (obstacle.userData && obstacle.userData.type === 'tree') {
      obstacleRadius = 2;
    } else if (obstacle.userData && obstacle.userData.type === 'mountain') {
      obstacleRadius = obstacle.userData.radius || 50;
    }
    
    // Calculate distance between car and obstacle (only in X-Z plane)
    const dx = carPosition.x - obstaclePosition.x;
    const dz = carPosition.z - obstaclePosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    // Check if collision occurred
    if (distance < (carRadius + obstacleRadius)) {
      return true;
    }
  }
  
  return false;
}

// Create a minimap with improved background and visibility
function createMinimap() {
  // Create minimap container
  const minimapContainer = document.createElement('div');
  minimapContainer.id = 'minimap';
  minimapContainer.style.position = 'absolute';
  minimapContainer.style.top = '20px';
  minimapContainer.style.right = '20px';
  minimapContainer.style.width = '200px';
  minimapContainer.style.height = '200px';
  minimapContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; // Translucent white background
  minimapContainer.style.border = '2px solid rgba(0, 0, 0, 0.8)'; // Darker border
  minimapContainer.style.borderRadius = '5px';
  minimapContainer.style.zIndex = '100';
  
  // Create canvas element for drawing
  const minimapCanvas = document.createElement('canvas');
  minimapCanvas.id = 'minimap-canvas';
  minimapCanvas.width = 200;
  minimapCanvas.height = 200;
  minimapCanvas.style.width = '100%';
  minimapCanvas.style.height = '100%';
  
  // Add canvas to container
  minimapContainer.appendChild(minimapCanvas);
  
  // Add container to document
  document.getElementById('game-container').appendChild(minimapContainer);
  
  // Store canvas context for later use
  window.minimapContext = minimapCanvas.getContext('2d');
  
  // Move HUD below the minimap
  const hud = document.getElementById('hud');
  hud.style.top = '230px';
  hud.style.right = '20px';
  hud.style.left = 'auto';
  
  // Auto-hide tutorial after 5 seconds
  const tutorial = document.getElementById('tutorial');
  setTimeout(() => {
    if (tutorial) {
      tutorial.style.opacity = '0';
      tutorial.style.transition = 'opacity 1s';
      
      // Remove from DOM after fade out
      setTimeout(() => {
        if (tutorial.parentNode) {
          tutorial.parentNode.removeChild(tutorial);
        }
      }, 1000);
    }
  }, 5000);
}

// Update minimap with improved track and car visibility
function updateMinimap() {
  const ctx = window.minimapContext;
  if (!ctx) return;
  
  // Clear minimap
  ctx.clearRect(0, 0, 200, 200);
  
  // Set translucent background
  ctx.fillStyle = 'rgba(120, 180, 120, 0.9)'; // Darker green with less transparency 
  ctx.fillRect(0, 0, 200, 200);
  
  // Scale and center factors - increased scale for more zoom
  const scale = 0.18; // Reduced to fit larger track
  const offsetX = 100;
  const offsetY = 100;
  
  // Draw off-track area first (wider than track)
  ctx.beginPath();
  ctx.strokeStyle = '#8B4513'; // Match the brown color of the off-track area
  ctx.lineWidth = (TRACK_WIDTH + 20) * scale; // Match the off-track width
  
  if (TRACK_POINTS.length > 1) {
    const startPoint = worldToMinimap(TRACK_POINTS[0], scale, offsetX, offsetY);
    ctx.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < TRACK_POINTS.length; i++) {
      const point = worldToMinimap(TRACK_POINTS[i], scale, offsetX, offsetY);
      ctx.lineTo(point.x, point.y);
    }
    
    // Close the track loop
    ctx.lineTo(startPoint.x, startPoint.y);
  }
  
  ctx.stroke();
  
  // Draw track with increased width and contrast
  ctx.beginPath();
  ctx.strokeStyle = '#222222'; // Nearly black
  ctx.lineWidth = TRACK_WIDTH * scale * 1.2; // Increased width by 20%
  
  if (TRACK_POINTS.length > 1) {
    const startPoint = worldToMinimap(TRACK_POINTS[0], scale, offsetX, offsetY);
    ctx.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < TRACK_POINTS.length; i++) {
      const point = worldToMinimap(TRACK_POINTS[i], scale, offsetX, offsetY);
      ctx.lineTo(point.x, point.y);
    }
    
    // Close the track loop
    ctx.lineTo(startPoint.x, startPoint.y);
  }
  
  ctx.stroke();
  
  // Draw edge lines (white borders)
  ctx.beginPath();
  ctx.strokeStyle = '#FFFFFF'; // White
  ctx.lineWidth = 1;
  
  // Inner edge
  if (TRACK_POINTS.length > 1) {
    const startPoint = worldToMinimap(TRACK_POINTS[0], scale, offsetX, offsetY);
    ctx.moveTo(startPoint.x, startPoint.y);
    
    for (let i = 1; i < TRACK_POINTS.length; i++) {
      const point = worldToMinimap(TRACK_POINTS[i], scale, offsetX, offsetY);
      ctx.lineTo(point.x, point.y);
    }
    
    // Close the track loop
    ctx.lineTo(startPoint.x, startPoint.y);
  }
  
  ctx.stroke();

  // Draw start/finish line more prominently
  if (TRACK_POINTS.length > 1) {
    const startPoint = worldToMinimap(TRACK_POINTS[0], scale, offsetX, offsetY);
    const nextPoint = worldToMinimap(TRACK_POINTS[1], scale, offsetX, offsetY);
    
    // Calculate perpendicular vector
    const dirX = nextPoint.x - startPoint.x;
    const dirY = nextPoint.y - startPoint.y;
    const length = Math.sqrt(dirX * dirX + dirY * dirY);
    const normX = dirX / length;
    const normY = dirY / length;
    const perpX = -normY;
    const perpY = normX;
    
    // Draw a more visible checkered line
    const lineLength = TRACK_WIDTH * scale * 1.5; // Wider than track
    const segmentCount = 8; // Number of checkered segments
    
    for (let i = 0; i < segmentCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#fff' : '#000';
      ctx.beginPath();
      
      const segmentLength = lineLength / segmentCount;
      const startOffset = (i - segmentCount / 2) * segmentLength;
      const endOffset = ((i + 1) - segmentCount / 2) * segmentLength;
      
      ctx.moveTo(startPoint.x + perpX * startOffset, startPoint.y + perpY * startOffset);
      ctx.lineTo(startPoint.x + perpX * endOffset, startPoint.y + perpY * endOffset);
      ctx.lineTo(startPoint.x + dirX * 0.2 + perpX * endOffset, startPoint.y + dirY * 0.2 + perpY * endOffset);
      ctx.lineTo(startPoint.x + dirX * 0.2 + perpX * startOffset, startPoint.y + dirY * 0.2 + perpY * startOffset);
      
      ctx.fill();
    }
  }
  
  // Draw car position (larger, brighter triangle)
  const carPos = worldToMinimap(car.position, scale, offsetX, offsetY);
  
  ctx.save();
  ctx.translate(carPos.x, carPos.y);
  ctx.rotate(car.rotation.y);
  
  // Larger, brighter car icon
  ctx.fillStyle = '#ffff00'; // Bright yellow for high visibility
  ctx.beginPath();
  ctx.moveTo(0, -6); // Front of car (longer)
  ctx.lineTo(-4, 4); // Back left (wider)
  ctx.lineTo(4, 4);  // Back right (wider)
  ctx.closePath();
  ctx.fill();
  
  // Add outline for even better visibility
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.restore();
  
  // Draw minimap border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 200, 200);
  
  // Add text label
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, 70, 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '12px Arial';
  ctx.fillText('Track Map', 10, 14);
}

// Convert world coordinates to minimap coordinates
function worldToMinimap(pos, scale, offsetX, offsetY) {
  // For Vector3 or Vector2
  if (pos.z !== undefined) {
    return {
      x: offsetX + pos.x * scale,
      y: offsetY + pos.z * scale
    };
  } else {
    return {
      x: offsetX + pos.x * scale,
      y: offsetY + pos.y * scale // y in Vector2 corresponds to z in world
    };
  }
}

// Set up the scene, camera, renderer, and other core elements
function setupScene() {
  // Set up renderer
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Create game container if it doesn't exist
  let gameContainer = document.getElementById('game-container');
  if (!gameContainer) {
    gameContainer = document.createElement('div');
    gameContainer.id = 'game-container';
    gameContainer.style.width = '100%';
    gameContainer.style.height = '100%';
    gameContainer.style.position = 'absolute';
    gameContainer.style.top = '0';
    gameContainer.style.left = '0';
    document.body.appendChild(gameContainer);
  }
  
  gameContainer.appendChild(renderer.domElement);
  
  // Set up scene background - Sky gradient
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 500, 1500);
  
  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404040, 1);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(100, 300, 100);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 500;
  directionalLight.shadow.camera.right = 250;
  directionalLight.shadow.camera.left = -250;
  directionalLight.shadow.camera.top = 250;
  directionalLight.shadow.camera.bottom = -250;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);
  
  // Create base terrain
  createBaseTerrain();
  
  // Create track
  createRaceTrack();
  
  // Create environment
  createEnvironment();
  
  // Create stars
  createStars();
  
  // Create checkpoints
  createCheckpoints();
  
  // Create minimap
  createMinimap();
  
  // Position camera behind car
  camera.position.set(0, 5, -10);
  camera.lookAt(car.position);
  
  // Add orbit controls for development/debugging
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.update();
  
  // Initially disable orbit controls - we'll use them just for debugging
  controls.enabled = false;
  
  // Load audio
  loadAudio();
  
  // Create game UI with countdown overlay hidden
  createGameUI();
}

// Create game UI elements
function createGameUI() {
  // Create HUD elements if they don't exist
  if (!document.getElementById('hud')) {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.style.position = 'absolute';
    hud.style.top = '20px';
    hud.style.right = '240px'; // Position next to minimap
    hud.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    hud.style.color = 'white';
    hud.style.padding = '10px';
    hud.style.borderRadius = '5px';
    hud.style.fontFamily = 'Arial, sans-serif';
    hud.style.zIndex = '100';
    
    hud.innerHTML = `
      <div id="time-display" style="font-size: 24px; color: #FFCC00;">00:00.000</div>
      <div id="target-time" style="font-size: 16px; color: #FF6666;">Target: 01:00.000</div>
      <div id="lap-counter" style="font-size: 16px; color: #66FF66;">Lap: 0/3</div>
    `;
    
    document.getElementById('game-container').appendChild(hud);
  }
  
  // Create speedometer if it doesn't exist
  if (!document.getElementById('speedometer-container')) {
    const speedometer = document.createElement('div');
    speedometer.id = 'speedometer-container';
    speedometer.innerHTML = `
      <div id="speedometer-gauge">
        <div id="speedometer-dial"></div>
        <div id="speedometer-value">0</div>
        <div id="speedometer-max">MAX: 15</div>
      </div>
    `;
    document.getElementById('game-container').appendChild(speedometer);
  }
  
  // Create restart button
  if (!document.getElementById('restart-btn')) {
    const restartBtn = document.createElement('button');
    restartBtn.id = 'restart-btn';
    restartBtn.innerText = 'Restart Game';
    restartBtn.style.position = 'fixed';
    restartBtn.style.bottom = '10px';
    restartBtn.style.left = '10px';
    restartBtn.style.padding = '8px 12px';
    restartBtn.style.background = 'rgba(0, 0, 0, 0.7)';
    restartBtn.style.color = 'white';
    restartBtn.style.border = '1px solid white';
    restartBtn.style.borderRadius = '4px';
    restartBtn.style.cursor = 'pointer';
    restartBtn.style.zIndex = '1000';
    
    // Add hover effect
    restartBtn.onmouseover = () => {
      restartBtn.style.background = 'rgba(50, 50, 50, 0.7)';
    };
    restartBtn.onmouseout = () => {
      restartBtn.style.background = 'rgba(0, 0, 0, 0.7)';
    };
    
    // Add click event
    restartBtn.onclick = () => {
      restartGame();
    };
    
    document.body.appendChild(restartBtn);
  }
  
  // Add countdown overlay if it doesn't exist, but keep it hidden until needed
  if (!document.getElementById('countdown-overlay')) {
    const countdownOverlay = document.createElement('div');
    countdownOverlay.id = 'countdown-overlay';
    countdownOverlay.style.position = 'absolute';
    countdownOverlay.style.top = '0';
    countdownOverlay.style.left = '0';
    countdownOverlay.style.width = '100%';
    countdownOverlay.style.height = '100%';
    countdownOverlay.style.display = 'none'; // Initially hidden
    countdownOverlay.style.justifyContent = 'center';
    countdownOverlay.style.alignItems = 'center';
    countdownOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    countdownOverlay.style.zIndex = '1000';
    countdownOverlay.style.fontSize = '120px';
    countdownOverlay.style.fontWeight = 'bold';
    countdownOverlay.style.color = 'white';
    countdownOverlay.style.textShadow = '2px 2px 5px rgba(0, 0, 0, 0.5)';
    
    document.getElementById('game-container').appendChild(countdownOverlay);
  }
  
  // Create message overlay (for victory/defeat messages)
  if (!document.getElementById('message-overlay')) {
    const messageOverlay = document.createElement('div');
    messageOverlay.id = 'message-overlay';
    messageOverlay.style.position = 'absolute';
    messageOverlay.style.top = '0';
    messageOverlay.style.left = '0';
    messageOverlay.style.width = '100%';
    messageOverlay.style.height = '100%';
    messageOverlay.style.display = 'none'; // Initially hidden
    messageOverlay.style.justifyContent = 'center';
    messageOverlay.style.alignItems = 'center';
    messageOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    messageOverlay.style.zIndex = '1000';
    
    const messageBox = document.createElement('div');
    messageBox.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    messageBox.style.border = '2px solid #FFCC00';
    messageBox.style.borderRadius = '10px';
    messageBox.style.padding = '20px';
    messageBox.style.textAlign = 'center';
    messageBox.style.maxWidth = '500px';
    
    const messageTitle = document.createElement('h2');
    messageTitle.id = 'message-title';
    messageTitle.style.color = '#FFCC00';
    messageTitle.style.fontSize = '32px';
    messageTitle.style.margin = '0 0 20px 0';
    
    const messageContent = document.createElement('p');
    messageContent.id = 'message-content';
    messageContent.style.color = 'white';
    messageContent.style.fontSize = '18px';
    messageContent.style.marginBottom = '20px';
    
    messageBox.appendChild(messageTitle);
    messageBox.appendChild(messageContent);
    messageOverlay.appendChild(messageBox);
    
    document.getElementById('game-container').appendChild(messageOverlay);
  }
  
  // Add wrong way indicator
  if (!document.getElementById('wrong-way')) {
    const wrongWay = document.createElement('div');
    wrongWay.id = 'wrong-way';
    wrongWay.textContent = 'WRONG WAY!';
    wrongWay.style.position = 'absolute';
    wrongWay.style.top = '100px';
    wrongWay.style.left = '50%';
    wrongWay.style.transform = 'translateX(-50%)';
    wrongWay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
    wrongWay.style.color = 'white';
    wrongWay.style.padding = '10px 20px';
    wrongWay.style.borderRadius = '5px';
    wrongWay.style.fontSize = '24px';
    wrongWay.style.fontWeight = 'bold';
    wrongWay.style.zIndex = '100';
    wrongWay.style.display = 'none'; // Initially hidden
    
    document.getElementById('game-container').appendChild(wrongWay);
  }
}

// Function to recreate the HUD elements
function recreateHUD() {
  // Remove existing HUD if any
  const existingHud = document.getElementById('hud');
  if (existingHud) existingHud.remove();
  
  // Create a fresh HUD
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.position = 'absolute';
  hud.style.top = '20px';
  hud.style.right = '240px'; // Position next to minimap
  hud.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  hud.style.color = 'white';
  hud.style.padding = '10px';
  hud.style.borderRadius = '5px';
  hud.style.fontFamily = 'Arial, sans-serif';
  hud.style.zIndex = '100';
  
  hud.innerHTML = `
    <div id="time-display" style="font-size: 24px; color: #FFCC00;">00:00.000</div>
    <div id="target-time" style="font-size: 16px; color: #FF6666;">Target: 01:00.000</div>
    <div id="lap-counter" style="font-size: 16px; color: #66FF66;">Lap: 0/3</div>
  `;
  
  const gameContainer = document.getElementById('game-container');
  if (gameContainer) {
    gameContainer.appendChild(hud);
  } else {
    document.body.appendChild(hud);
  }
  
  // Recreate speedometer if needed
  if (!document.getElementById('speedometer-container')) {
    const speedometer = document.createElement('div');
    speedometer.id = 'speedometer-container';
    speedometer.innerHTML = `
      <div id="speedometer-gauge">
        <div id="speedometer-dial"></div>
        <div id="speedometer-value">0</div>
        <div id="speedometer-max">MAX: 15</div>
      </div>
    `;
    if (gameContainer) {
      gameContainer.appendChild(speedometer);
    } else {
      document.body.appendChild(speedometer);
    }
  }
}

// Function to completely reset the game
function resetGame() {
  // Clear all overlays
  clearAllOverlays();
  
  // Reset game state
  gameRunning = true;
  gameOver = false;
  currentLap = 0;
  currentCheckpoint = 0;
  car.speed = 0;
  lapStartTime = Date.now();
  
  // Reset car position to start line
  if (TRACK_POINTS.length > 0) {
    car.position.copy(TRACK_POINTS[0]);
    car.position.y = 0.5; // Car height off ground
    
    // Calculate initial direction to face along the track
    if (TRACK_POINTS.length > 1) {
      const nextPoint = TRACK_POINTS[1];
      const direction = new THREE.Vector3().subVectors(nextPoint, TRACK_POINTS[0]).normalize();
      car.direction.copy(direction);
      
      // Set rotation to face direction
      const angle = Math.atan2(direction.x, direction.z);
      car.rotation.y = angle;
    }
  }
  
  // Update car model position
  if (car.model) {
    car.model.position.copy(car.position);
    car.model.rotation.y = car.rotation.y;
  }
  
  // Update HUD
  const lapCounter = document.getElementById('lap-counter');
  if (lapCounter) lapCounter.textContent = `Lap: ${currentLap}/${MAX_LAPS}`;
  
  const timeDisplay = document.getElementById('time-display');
  if (timeDisplay) timeDisplay.textContent = '00:00.000';
  
  // Update speedometer
  updateSpeedometer(0);
  
  console.log("Game completely reset");
}

// Add a clear overlay button 
function createClearOverlayButton() {
  // Remove existing button if any
  const existingButton = document.getElementById('clear-overlays-btn');
  if (existingButton) existingButton.remove();
  
  // Create a button to clear all overlays
  const clearButton = document.createElement('button');
  clearButton.id = 'clear-overlays-btn';
  clearButton.innerText = 'FORCE RESET GAME';
  clearButton.style.position = 'fixed';
  clearButton.style.top = '10px';
  clearButton.style.left = '50%';
  clearButton.style.transform = 'translateX(-50%)';
  clearButton.style.padding = '5px 10px';
  clearButton.style.background = 'rgba(255, 0, 0, 0.8)';
  clearButton.style.color = 'white';
  clearButton.style.border = '2px solid white';
  clearButton.style.borderRadius = '4px';
  clearButton.style.fontSize = '14px';
  clearButton.style.fontWeight = 'bold';
  clearButton.style.cursor = 'pointer';
  clearButton.style.zIndex = '9999'; // Extremely high z-index
  
  // Add hover effect
  clearButton.onmouseover = () => {
    clearButton.style.background = 'rgba(255, 50, 50, 0.9)';
  };
  clearButton.onmouseout = () => {
    clearButton.style.background = 'rgba(255, 0, 0, 0.8)';
  };
  
  // Add click handler
  clearButton.onclick = () => {
    // Use the aggressive overlay removal
    forceRemoveAllOverlays();
    
    // Also restart the game
    resetGame();
    
    // Notify the user
    const notification = document.createElement('div');
    notification.textContent = 'Game Force Reset Complete!';
    notification.style.position = 'fixed';
    notification.style.top = '50%';
    notification.style.left = '50%';
    notification.style.transform = 'translate(-50%, -50%)';
    notification.style.padding = '15px 25px';
    notification.style.background = 'rgba(0, 180, 0, 0.8)';
    notification.style.color = 'white';
    notification.style.borderRadius = '8px';
    notification.style.fontSize = '18px';
    notification.style.zIndex = '9999';
    document.body.appendChild(notification);
    
    // Remove notification after 2 seconds
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 2000);
  };
  
  // Ensure it's added directly to the body to avoid container issues
  document.body.appendChild(clearButton);
}

// Add input state tracking to the joystick controller
function handleControllerInput(data) {
  if (gameOver) return; // Only check for gameOver, not gameRunning
  
  // Log data for debugging
  console.log("Joystick data received:", data);
  
  // Start the game if not already running when joystick is used
  if (!gameRunning) {
    startGame();
    return; // Don't process input until the game actually starts
  }
  
  // Display controller data for debugging - show raw values
  const debugElement = document.getElementById('joystick-debug');
  if (debugElement) {
    debugElement.textContent = `Roll: ${data.roll.toFixed(2)}, Pitch: ${data.pitch.toFixed(2)}, Boost: ${data.boost ? 'ON' : 'OFF'}`;
  }
  
  // Important: Invert pitch so pushing forward moves the car forward
  // This fixes the direction issue
  const adjustedPitch = -data.pitch;
  const adjustedRoll = data.roll;
  
  // Apply deadzone to prevent drift
  const roll = Math.abs(adjustedRoll) > JOYSTICK_DEADZONE ? adjustedRoll : 0;
  const pitch = Math.abs(adjustedPitch) > JOYSTICK_DEADZONE ? adjustedPitch : 0;
  
  // Track turning state for wheel steering
  if (!serialController.inputState) {
    serialController.inputState = { turnLeft: false, turnRight: false, turnAmount: 0 };
  }
  
  // Update turning state based on roll value
  serialController.inputState.turnLeft = roll < -JOYSTICK_DEADZONE;
  serialController.inputState.turnRight = roll > JOYSTICK_DEADZONE;
  serialController.inputState.turnAmount = roll; // Store the raw turn amount
  
  // Steering - ensure both left and right turning works properly
  if (Math.abs(roll) > JOYSTICK_DEADZONE) {
    // Right turn (positive roll): decrease rotation Y (negative change)
    // Left turn (negative roll): increase rotation Y (positive change)
    car.rotation.y -= TURN_RATE * roll * 1.5;
    console.log(`Turning ${roll > 0 ? 'RIGHT' : 'LEFT'}, roll:`, roll);
  }
  
  // Debugging output for forward/backward movement
  if (pitch !== 0) {
    console.log("Pitch value being used:", pitch);
  }
  
  // Acceleration and braking/reversing - handle separately for clarity
  if (pitch > JOYSTICK_DEADZONE) {
    // Forward movement (pushing joystick forward, away from pins)
    car.speed += ACCELERATION * pitch * 0.15; // Increased from 0.1 to 0.15 for faster acceleration
    
    if (car.speed > MAX_SPEED) {
      car.speed = MAX_SPEED;
    }
    
    // Play acceleration sound if speed increasing
    if (!audioElements.accelerate.playing && car.speed > 20) {
      playSound('accelerate');
    }
    
    console.log("FORWARD, pitch:", pitch, "speed:", car.speed);
  }
  else if (pitch < -JOYSTICK_DEADZONE) {
    // Negative pitch - pulling joystick back, toward pins
    if (car.speed > 0) {
      // Braking
      car.speed += BRAKING * pitch * 0.2; // Since pitch is negative, this reduces speed
      
      // Play braking sound
      if (!audioElements.brake.playing && car.speed > 10) {
        playSound('brake');
      }
      
      // Ensure we don't go below 0 when braking
      if (car.speed < 0) {
        car.speed = 0;
      }
      
      console.log("BRAKING, pitch:", pitch, "speed:", car.speed);
    }
    else {
      // Reversing
      car.speed = ACCELERATION * pitch * 0.15; // Since pitch is negative, this makes speed negative
      
      // Limit reverse speed
      if (car.speed < -MAX_SPEED * 0.4) {
        car.speed = -MAX_SPEED * 0.4;
      }
      
      console.log("REVERSING, pitch:", pitch, "speed:", car.speed);
    }
  }
  // Force the car to stop more quickly when joystick is centered
  else if (Math.abs(pitch) <= JOYSTICK_DEADZONE) {
    car.speed *= 0.95; // Additional friction when joystick is in neutral
    if (Math.abs(car.speed) < 0.1) car.speed = 0; // Stop completely below threshold
  }
  
  // Use boost button for an optional speed boost
  if (data.boost && car.speed !== 0) {
    if (car.speed > 0) {
      car.speed += 3; // Increased from 2 to 3 for stronger boost
      if (car.speed > MAX_SPEED * 1.3) { // Increased from 1.2 to 1.3 for higher top speed with boost
        car.speed = MAX_SPEED * 1.3;
      }
    } else {
      car.speed -= 1; // Reverse boost (unchanged)
      if (car.speed < -MAX_SPEED * 0.5) {
        car.speed = -MAX_SPEED * 0.5;
      }
    }
  }
}

// Initialize the game when the page loads
window.addEventListener('load', init);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Update debug info but keep it hidden
  const debugDiv = document.getElementById('debug-info');
  if (debugDiv) {
    debugDiv.textContent = `Game running: ${gameRunning}, Game over: ${gameOver}, Car speed: ${car.speed.toFixed(2)}`;
    debugDiv.style.display = 'none'; // Keep it hidden
  }
  
  // Hide joystick debug if playing game (only show during setup)
  const joystickDebug = document.getElementById('joystick-debug');
  if (joystickDebug && gameRunning && !gameOver && car.speed > 0) {
    joystickDebug.style.opacity = '0.3'; // Fade it out when playing but leave visible for reference
  } else if (joystickDebug && !gameRunning) {
    joystickDebug.style.opacity = '1'; // Full opacity when not playing
  }
  
  // Update countdown if active
  if (countdownActive) {
    updateCountdown();
  }
  
  // Update car physics even if not running (for testing)
  updateCarPhysics();
  
  // Update particles
  updateParticles();
  
  // Update minimap
  updateMinimap();
  
  if (gameRunning && !gameOver) {
    // Update game time
    currentTime = Date.now() - lapStartTime;
    document.getElementById('time-display').textContent = formatTime(currentTime);
    
    // Check if time exceeded target
    if (currentTime > targetTime && currentLap === MAX_LAPS - 1) {
      endRace(false);
    }
  }
  
  // Update controls if enabled (for debugging)
  if (controls && controls.enabled) {
    controls.update();
  }
  
  // Render scene
  renderer.render(scene, camera);
}

// Start the countdown before starting the game
function startCountdown() {
  // Force remove any existing overlays first
  forceRemoveAllOverlays();
  
  // Create countdown overlay if it doesn't exist
  if (!document.getElementById('countdown-overlay')) {
    const countdownOverlay = document.createElement('div');
    countdownOverlay.id = 'countdown-overlay';
    countdownOverlay.style.position = 'absolute';
    countdownOverlay.style.top = '0';
    countdownOverlay.style.left = '0';
    countdownOverlay.style.width = '100%';
    countdownOverlay.style.height = '100%';
    countdownOverlay.style.display = 'flex';
    countdownOverlay.style.justifyContent = 'center';
    countdownOverlay.style.alignItems = 'center';
    countdownOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    countdownOverlay.style.zIndex = '1000';
    countdownOverlay.style.fontSize = '120px';
    countdownOverlay.style.fontWeight = 'bold';
    countdownOverlay.style.color = 'white';
    countdownOverlay.style.textShadow = '2px 2px 5px rgba(0, 0, 0, 0.5)';
    
    document.getElementById('game-container').appendChild(countdownOverlay);
  } else {
    document.getElementById('countdown-overlay').style.display = 'flex';
  }
  
  // Set countdown state
  countdownActive = true;
  countdownStartTime = Date.now();
  
  // Update countdown in the game loop
  updateCountdown();
}

// Update countdown
function updateCountdown() {
  if (!countdownActive) return;
  
  const elapsedTime = Date.now() - countdownStartTime;
  const countdownOverlay = document.getElementById('countdown-overlay');
  
  if (elapsedTime < COUNTDOWN_DURATION) {
    // Calculate seconds remaining (3, 2, 1)
    const secondsRemaining = Math.ceil((COUNTDOWN_DURATION - elapsedTime) / 1000);
    countdownOverlay.textContent = secondsRemaining.toString();
    
    // No sounds for countdown numbers
  } else {
    // Countdown complete, show GO and start the game
    countdownOverlay.textContent = 'GO!';
    
    // Ensure no particles or explosion effects
    clearAllParticles();
    
    // Remove countdown overlay after a short delay
    setTimeout(() => {
      countdownActive = false;
      countdownOverlay.style.display = 'none';
      
      // Actually start the game
      startGame();
    }, 1000);
  }
}

// Add a debug button to help troubleshoot joystick issues
function createDebugButton() {
  // Create a debug button
  const debugButton = document.createElement('button');
  debugButton.id = 'debug-button';
  debugButton.innerText = 'Show Serial Devices';
  debugButton.style.position = 'fixed';
  debugButton.style.top = '10px';
  debugButton.style.right = '10px';
  debugButton.style.padding = '5px 10px';
  debugButton.style.background = 'rgba(255, 0, 0, 0.7)';
  debugButton.style.color = 'white';
  debugButton.style.border = 'none';
  debugButton.style.borderRadius = '4px';
  debugButton.style.fontSize = '12px';
  debugButton.style.cursor = 'pointer';
  debugButton.style.zIndex = '5000';
  
  // Add hover effect
  debugButton.onmouseover = () => {
    debugButton.style.background = 'rgba(255, 50, 50, 0.9)';
  };
  debugButton.onmouseout = () => {
    debugButton.style.background = 'rgba(255, 0, 0, 0.7)';
  };
  
  // Add click handler
  debugButton.onclick = async () => {
    try {
      // Get a list of all available serial ports
      const ports = await navigator.serial.getPorts();
      console.log('Available serial ports:', ports);
      
      // Check if Web Serial API is supported
      const isSupported = 'serial' in navigator;
      console.log('Web Serial API supported:', isSupported);
      
      // Create a debug overlay
      const debugOverlay = document.createElement('div');
      debugOverlay.style.position = 'fixed';
      debugOverlay.style.top = '50%';
      debugOverlay.style.left = '50%';
      debugOverlay.style.transform = 'translate(-50%, -50%)';
      debugOverlay.style.padding = '20px';
      debugOverlay.style.background = 'rgba(0, 0, 0, 0.9)';
      debugOverlay.style.color = 'white';
      debugOverlay.style.borderRadius = '10px';
      debugOverlay.style.maxWidth = '80%';
      debugOverlay.style.maxHeight = '80%';
      debugOverlay.style.overflow = 'auto';
      debugOverlay.style.zIndex = '6000';
      
      // Add content
      let content = `<h2>Serial Debug Info</h2>
                     <p>Web Serial API supported: ${isSupported ? 'Yes' : 'No'}</p>
                     <p>Available ports: ${ports.length}</p>`;
      
      // Add details for each port
      if (ports.length > 0) {
        content += '<h3>Port Details:</h3><ul>';
        ports.forEach((port, index) => {
          const info = port.getInfo();
          content += `<li>Port ${index+1}: 
                        <ul>
                          <li>USB Vendor ID: ${info.usbVendorId || 'N/A'}</li>
                          <li>USB Product ID: ${info.usbProductId || 'N/A'}</li>
                        </ul>
                      </li>`;
        });
        content += '</ul>';
      }
      
      // Add close button
      content += '<button id="close-debug" style="padding: 5px 15px; background: #f00; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 15px;">Close</button>';
      
      debugOverlay.innerHTML = content;
      document.body.appendChild(debugOverlay);
      
      // Add close handler
      document.getElementById('close-debug').onclick = () => {
        document.body.removeChild(debugOverlay);
      };
      
    } catch (error) {
      console.error('Error getting serial ports:', error);
      alert('Error getting serial ports: ' + error.message);
    }
  };
  
  document.body.appendChild(debugButton);
}

// Function to clear all overlays and UI elements that might be interfering
function clearAllOverlays() {
  // Hide connection buttons
  const connectBtn = document.getElementById('connect-controller-btn');
  if (connectBtn) connectBtn.style.display = 'none';
  
  const startWithoutBtn = document.getElementById('start-without-btn');
  if (startWithoutBtn) startWithoutBtn.style.display = 'none';
  
  // Hide any overlays that might be blocking
  const countdownOverlay = document.getElementById('countdown-overlay');
  if (countdownOverlay) {
    countdownOverlay.style.display = 'none';
    countdownActive = false;
  }
  
  const messageOverlay = document.getElementById('message-overlay');
  if (messageOverlay) messageOverlay.style.display = 'none';
  
  // Hide other potential overlays or messages
  const wrongWay = document.getElementById('wrong-way');
  if (wrongWay) wrongWay.style.display = 'none';
  
  // Check for any other element with high z-index
  document.querySelectorAll('[style*="z-index"]').forEach(element => {
    // Skip buttons we want to keep
    if (element.id === 'debug-button' || 
        element.id === 'clear-overlays-btn' || 
        element.id === 'restart-btn' || 
        element.id === 'joystick-calibrate-btn') {
      return;
    }
    
    // Skip minimap and UI
    if (element.id === 'minimap' || 
        element.id === 'hud' || 
        element.id === 'joystick-debug' ||
        element.id === 'speedometer-container') {
      return;
    }
    
    // Check for high z-index elements that aren't buttons
    const style = window.getComputedStyle(element);
    const zIndex = parseInt(style.zIndex);
    if (zIndex > 900 && !element.tagName.toLowerCase().includes('button')) {
      console.log(`Found potential overlay: ${element.id || 'unnamed element'} with z-index ${zIndex}`);
      // If it's a blocking overlay, hide it
      if (style.position === 'fixed' || style.position === 'absolute') {
        element.style.display = 'none';
      }
    }
  });

  // Reset game state if it's stuck
  gameRunning = true;
  gameOver = false;
  
  // Reset potential time issues
  lapStartTime = Date.now();
  
  // Ensure the car can move
  car.speed = 0;
  
  // Update the debugging elements
  const debugDiv = document.getElementById('debug-info');
  if (debugDiv) {
    debugDiv.textContent = `Game running: ${gameRunning}, Game over: ${gameOver}, Car speed: ${car.speed.toFixed(2)}`;
  }
  
  console.log("All overlays cleared, game state reset");
}

// Function to aggressively remove all overlays by recreating the UI
function forceRemoveAllOverlays() {
  console.log("Force removing all overlays");
  
  // First, try normal clearing
  clearAllOverlays();
  
  // Find and remove ALL overlay-like elements
  const overlayElements = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"], div[style*="position: absolute"], div[style*="position:absolute"]');
  overlayElements.forEach(element => {
    // Skip essential UI elements
    if (element.id === 'debug-button' || 
        element.id === 'clear-overlays-btn' || 
        element.id === 'restart-btn' || 
        element.id === 'minimap' || 
        element.id === 'hud' || 
        element.id === 'joystick-debug' ||
        element.id === 'speedometer-container') {
      return;
    }
    
    console.log(`Removing overlay element: ${element.id || 'unnamed element'}`);
    element.remove();
  });
  
  // Clear all existing connect buttons
  const existingButtons = document.querySelectorAll('button');
  existingButtons.forEach(button => {
    if (button.id !== 'debug-button' && 
        button.id !== 'clear-overlays-btn' && 
        button.id !== 'restart-btn') {
      button.remove();
    }
  });
  
  // Reset critical game variables
  gameRunning = true;
  gameOver = false;
  countdownActive = false;
  
  // Update car state
  car.speed = 0;
  
  // Create clean HUD elements
  recreateHUD();
  
  // Create clean debug info
  const debugInfo = document.getElementById('debug-info');
  if (debugInfo) {
    debugInfo.textContent = `Game running: ${gameRunning}, Game over: ${gameOver}, Car speed: ${car.speed.toFixed(2)}`;
  }
  
  // Recreate essential UI
  // (We only keep minimal UI to avoid any conflicts)
  
  // Reset camera position
  camera.position.set(0, 5, -10);
  camera.lookAt(car.position);
  
  console.log("Aggressive overlay removal complete");
  
  // If controller is connected, make sure the game is ready to play
  if (serialController && serialController.connected) {
    console.log("Controller is connected, ensuring game is ready");
    
    // Reset game state
    resetGame();
  }
}
