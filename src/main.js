import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SerialController from './serial-controller.js';

// Game constants
const MAX_SPEED = 240; // km/h - increased from 50
const ACCELERATION = 10.0; // Increased from 4.0 for faster acceleration
const BRAKING = 6.0; // Unchanged
const FRICTION = 0.85; // Unchanged
const OFF_TRACK_FRICTION = 0.80; // Unchanged
const TURN_RATE = 0.03; // Unchanged - current turning speed is good
const STAR_COUNT = 100;
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
function init() {
  // Set up renderer
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-container').appendChild(renderer.domElement);

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

  // Load car model
  loadCarModel();

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

  // Set up event listeners
  window.addEventListener('resize', onWindowResize);
  document.getElementById('connect-btn').addEventListener('click', connectController);
  document.getElementById('restart-btn').addEventListener('click', restartGame);
  
  // Add keyboard controls for testing
  setupKeyboardControls();

  // Start the game
  gameLoop();
  
  // Auto start the game
  startGame();
}

// Setup keyboard controls for testing
function setupKeyboardControls() {
  window.addEventListener('keydown', (event) => {
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
  
  // Create off-track area (sand/dirt)
  const offTrackGeometry = new THREE.TubeGeometry(trackCurve, 200, TRACK_WIDTH + 10, 16, true);
  const offTrackMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xD2B48C, // Tan color for dirt/sand
    roughness: 1.0
  });
  
  offTrackMesh = new THREE.Mesh(offTrackGeometry, offTrackMaterial);
  offTrackMesh.position.y = -0.05; // Slightly below track
  offTrackMesh.receiveShadow = true;
  scene.add(offTrackMesh);
  
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
  // Start/finish line
  const startLineGeometry = new THREE.PlaneGeometry(TRACK_WIDTH * 0.8, 2);
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
  
  // Add dashed lane markings along the center of the track
  const dashedLineCount = 100;
  const trackLength = trackCurve.getLength();
  const dashLength = 2;
  const gapLength = 2;
  
  for (let i = 0; i < dashedLineCount; i++) {
    const t = (i * (dashLength + gapLength)) / trackLength;
    if (t > 1) break;
    
    const lineGeometry = new THREE.PlaneGeometry(0.5, dashLength);
    const lineMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xFFFFFF,
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

// Load car model with further improved appearance
function loadCarModel() {
  // Create a detailed car made of multiple shapes
  const carGroup = new THREE.Group();
  
  // Car body - main chassis with more aerodynamic shape
  const bodyGeometry = new THREE.BoxGeometry(4, 1.2, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xE74C3C, // Bright red for main color
    metalness: 0.9,
    roughness: 0.1
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 1.0;
  body.castShadow = true;
  carGroup.add(body);
  
  // Car top/cabin with improved aerodynamic shape
  const cabinPoints = [];
  cabinPoints.push(new THREE.Vector2(0, 0));
  cabinPoints.push(new THREE.Vector2(1.75, 0));
  cabinPoints.push(new THREE.Vector2(1.5, 0.8));
  cabinPoints.push(new THREE.Vector2(0.5, 1));
  cabinPoints.push(new THREE.Vector2(0, 1));
  
  const cabinShape = new THREE.Shape(cabinPoints);
  const extrudeSettings = {
    steps: 1,
    depth: 4,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.1,
    bevelOffset: 0,
    bevelSegments: 3
  };
  
  const cabinGeometry = new THREE.ExtrudeGeometry(cabinShape, extrudeSettings);
  const cabinMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2c3e50, // Dark blue-gray
    metalness: 0.8,
    roughness: 0.2
  });
  
  const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
  cabin.position.set(-1.75, 1.6, -2);
  cabin.castShadow = true;
  carGroup.add(cabin);
  
  // Windshield with improved shape
  const windshieldGeometry = new THREE.PlaneGeometry(3.3, 1);
  const windshieldMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3498db,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    metalness: 0.9,
    roughness: 0.1
  });
  const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
  windshield.position.set(0, 2.1, 1.5);
  windshield.rotation.x = Math.PI / 4;
  carGroup.add(windshield);
  
  // Improved car hood with racing stripe and air intake
  const hoodGeometry = new THREE.BoxGeometry(3.8, 0.1, 3);
  const hoodMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xE74C3C, // Match body color
    metalness: 0.8,
    roughness: 0.2
  });
  const hood = new THREE.Mesh(hoodGeometry, hoodMaterial);
  hood.position.set(0, 1.7, 2.5);
  hood.castShadow = true;
  carGroup.add(hood);
  
  // Air intake on hood
  const intakeGeometry = new THREE.BoxGeometry(1.5, 0.2, 1.5);
  const intakeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1a1a1a, // Black
    metalness: 0.5,
    roughness: 0.8
  });
  const intake = new THREE.Mesh(intakeGeometry, intakeMaterial);
  intake.position.set(0, 1.8, 2.5);
  carGroup.add(intake);
  
  // Racing stripes
  const stripeGeometry = new THREE.BoxGeometry(0.5, 0.11, 7.5);
  const stripeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff, // White
    metalness: 0.8,
    roughness: 0.2
  });
  const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
  stripe.position.set(0, 1.76, 0);
  carGroup.add(stripe);
  
  // Add a second racing stripe
  const stripe2 = new THREE.Mesh(stripeGeometry, stripeMaterial);
  stripe2.position.set(1.2, 1.76, 0);
  carGroup.add(stripe2);
  
  const stripe3 = new THREE.Mesh(stripeGeometry, stripeMaterial);
  stripe3.position.set(-1.2, 1.76, 0);
  carGroup.add(stripe3);
  
  // Add spoiler
  const spoilerStandGeometry = new THREE.BoxGeometry(0.2, 1, 0.2);
  const spoilerMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1a1a1a, // Black
    metalness: 0.8,
    roughness: 0.2
  });
  
  const spoilerStandLeft = new THREE.Mesh(spoilerStandGeometry, spoilerMaterial);
  spoilerStandLeft.position.set(1.5, 2.0, -3.8);
  carGroup.add(spoilerStandLeft);
  
  const spoilerStandRight = new THREE.Mesh(spoilerStandGeometry, spoilerMaterial);
  spoilerStandRight.position.set(-1.5, 2.0, -3.8);
  carGroup.add(spoilerStandRight);
  
  const spoilerWingGeometry = new THREE.BoxGeometry(4, 0.2, 1);
  const spoilerWingMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xE74C3C, // Match body
    metalness: 0.8,
    roughness: 0.2
  });
  const spoilerWing = new THREE.Mesh(spoilerWingGeometry, spoilerWingMaterial);
  spoilerWing.position.set(0, 2.6, -3.8);
  carGroup.add(spoilerWing);
  
  // Improved wheels with rims and details
  const createWheel = (x, z) => {
    const wheelGroup = new THREE.Group();
    
    // Tire with better tread pattern
    const tireGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 16);
    const tireMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1a1a1a, // Nearly black
      roughness: 0.9
    });
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);
    
    // Add tire tread pattern
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const treadGeometry = new THREE.BoxGeometry(0.1, 0.52, 0.2);
      const treadMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        roughness: 0.9
      });
      const tread = new THREE.Mesh(treadGeometry, treadMaterial);
      tread.position.set(0, 0, 0);
      tread.rotation.z = Math.PI / 2;
      tread.rotation.y = angle;
      tread.translateZ(0.8);
      wheelGroup.add(tread);
    }
    
    // Improved rim with spokes
    const rimGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.52, 16);
    const rimMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xCCCCCC, // Lighter silver
      metalness: 1.0,
      roughness: 0.1
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);
    
    // Wheel spokes
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const spokeGeometry = new THREE.BoxGeometry(0.05, 0.54, 0.4);
      const spokeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xd3d3d3, // Silver
        metalness: 1.0,
        roughness: 0.1
      });
      const spoke = new THREE.Mesh(spokeGeometry, spokeMaterial);
      spoke.position.set(0, 0, 0);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = angle;
      spoke.translateZ(0.25);
      wheelGroup.add(spoke);
    }
    
    // Hub cap
    const hubGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.53, 16);
    const hubMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xE74C3C, // Match body color
      metalness: 0.9,
      roughness: 0.1
    });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    hub.rotation.z = Math.PI / 2;
    wheelGroup.add(hub);
    
    // Position wheel
    wheelGroup.position.set(x, 0.8, z);
    
    return wheelGroup;
  };
  
  // Add all wheels
  const wheelFL = createWheel(-2, 2.5);
  carGroup.add(wheelFL);
  
  const wheelFR = createWheel(2, 2.5);
  carGroup.add(wheelFR);
  
  const wheelRL = createWheel(-2, -2.5);
  carGroup.add(wheelRL);
  
  const wheelRR = createWheel(2, -2.5);
  carGroup.add(wheelRR);
  
  // Brighter headlights
  const headlightGeometry = new THREE.SphereGeometry(0.4, 16, 16);
  const headlightMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFFFFF,
    emissive: 0xFFFF00,
    emissiveIntensity: 0.8
  });
  
  // Left headlight
  const headlightL = new THREE.Mesh(headlightGeometry, headlightMaterial);
  headlightL.position.set(-1.5, 1.0, 4);
  carGroup.add(headlightL);
  
  // Right headlight
  const headlightR = new THREE.Mesh(headlightGeometry, headlightMaterial);
  headlightR.position.set(1.5, 1.0, 4);
  carGroup.add(headlightR);
  
  // Add headlight glow
  const headlightGlowGeometry = new THREE.SphereGeometry(0.5, 16, 16);
  const headlightGlowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xFFFF99,
    transparent: true,
    opacity: 0.5
  });
  
  const headlightGlowL = new THREE.Mesh(headlightGlowGeometry, headlightGlowMaterial);
  headlightGlowL.position.set(-1.5, 1.0, 4.1);
  carGroup.add(headlightGlowL);
  
  const headlightGlowR = new THREE.Mesh(headlightGlowGeometry, headlightGlowMaterial);
  headlightGlowR.position.set(1.5, 1.0, 4.1);
  carGroup.add(headlightGlowR);
  
  // Taillights
  const taillightGeometry = new THREE.SphereGeometry(0.3, 16, 16);
  const taillightMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFF0000,
    emissive: 0xFF0000,
    emissiveIntensity: 0.8
  });
  
  // Left taillight
  const taillightL = new THREE.Mesh(taillightGeometry, taillightMaterial);
  taillightL.position.set(-1.5, 1.0, -4);
  carGroup.add(taillightL);
  
  // Right taillight
  const taillightR = new THREE.Mesh(taillightGeometry, taillightMaterial);
  taillightR.position.set(1.5, 1.0, -4);
  carGroup.add(taillightR);
  
  // License plate
  const plateGeometry = new THREE.BoxGeometry(2, 0.5, 0.05);
  const plateMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFFFFF,
    roughness: 0.5
  });
  const plate = new THREE.Mesh(plateGeometry, plateMaterial);
  plate.position.set(0, 0.8, -4.03);
  carGroup.add(plate);
  
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
    audioElements[soundName].currentTime = 0;
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
    
    // Create star center
    const coreGeometry = new THREE.SphereGeometry(0.8, 16, 16);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFF00,
      emissive: 0xFFFF00,
      emissiveIntensity: 1.0,
      metalness: 1.0,
      roughness: 0.3
    });
    
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    starGroup.add(core);
    
    // Create star points/spikes
    const spikeCount = 5;
    for (let j = 0; j < spikeCount; j++) {
      const angle = (j / spikeCount) * Math.PI * 2;
      
      const spikeGeometry = new THREE.ConeGeometry(0.4, 2.0, 4);
      const spikeMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFF00,
        emissive: 0xFFFF00,
        emissiveIntensity: 0.8,
        metalness: 0.8,
        roughness: 0.2
      });
      
      const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
      spike.position.set(
        Math.sin(angle) * 1.0,
        Math.cos(angle) * 1.0,
        0
      );
      spike.rotation.z = angle;
      spike.rotation.y = Math.PI / 2;
      
      starGroup.add(spike);
    }
    
    // Add glow effect (sprite)
    const glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: null, // No texture needed
        color: 0xFFFF99,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      })
    );
    glowSprite.scale.set(5, 5, 1);
    starGroup.add(glowSprite);
    
    // Add star to scene and stars array
    scene.add(starGroup);
    starGroup.rotation.y = Math.random() * Math.PI * 2; // Random rotation
    
    // Store reference
    stars.push({
      object: starGroup,
      position: position.clone(),
      collected: false
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

// Connect to the controller and start countdown when connected
function connectController() {
  if (!serialController) {
    serialController = new SerialController();
    serialController.connect()
      .then(() => {
        document.getElementById('connect-btn').textContent = 'Connected';
        document.getElementById('connect-btn').disabled = true;
        document.getElementById('joystick-debug').textContent = 'Controller connected';
        
        // Set up controller input handler using the correct method
        serialController.setJoystickDataCallback(handleControllerInput);
        
        console.log("Controller connected and callback set up");
        
        // Show countdown and start the game after countdown
        startCountdown();
      })
      .catch(error => {
        console.error('Failed to connect:', error);
        document.getElementById('joystick-debug').textContent = 'Connection failed';
      });
  }
}

// Start the countdown before starting the game
function startCountdown() {
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
    
    // Play beep sound for each number
    if (secondsRemaining < 4 && Math.ceil((COUNTDOWN_DURATION - (elapsedTime - 50)) / 1000) > secondsRemaining) {
      playSound('star_collect'); // Reuse star sound for beep
    }
  } else {
    // Countdown complete, show GO and start the game
    countdownOverlay.textContent = 'GO!';
    
    // Play start sound
    playSound('lap_complete');
    
    // Remove countdown overlay after a short delay
    setTimeout(() => {
      countdownActive = false;
      countdownOverlay.style.display = 'none';
      
      // Actually start the game
      startGame();
    }, 1000);
  }
}

// Handle controller input with much less steering sensitivity
function handleControllerInput(data) {
  if (gameOver) return; // Only check for gameOver, not gameRunning
  
  // Log data for debugging
  console.log("Joystick data received:", data);
  
  // Start the game if not already running when joystick is used
  if (!gameRunning) {
    startGame();
  }
  
  // Display controller data for debugging - show raw values
  document.getElementById('joystick-debug').textContent = 
    `Roll: ${data.roll.toFixed(2)}, Pitch: ${data.pitch.toFixed(2)}, Boost: ${data.boost ? 'ON' : 'OFF'}`;
  
  // The problem is that the joystick orientation might be different than expected
  // Let's invert the controls to match the physical joystick orientation
  // This makes pushing away (positive pitch) accelerate and pulling back (negative pitch) brake/reverse
  // And makes pushing right (positive roll) turn right and pushing left (negative roll) turn left
  let adjustedPitch = -data.pitch; // Invert pitch so forward is positive, backward is negative
  let adjustedRoll = data.roll;    // Keep roll as is, but we'll handle directions explicitly
  
  // Apply deadzone to prevent drift
  const roll = Math.abs(adjustedRoll) > JOYSTICK_DEADZONE ? adjustedRoll : 0;
  const pitch = Math.abs(adjustedPitch) > JOYSTICK_DEADZONE ? adjustedPitch : 0;
  
  // Steering - handle left and right separately to debug which direction works
  if (roll > JOYSTICK_DEADZONE) {
    // Turn right (positive roll) - decrease y rotation
    car.rotation.y -= TURN_RATE * roll;
    console.log("Turning RIGHT, roll:", roll);
  } 
  else if (roll < -JOYSTICK_DEADZONE) {
    // Turn left (negative roll) - increase y rotation
    car.rotation.y += TURN_RATE * Math.abs(roll); // Use positive value for left turns
    console.log("Turning LEFT, roll:", roll);
  }
  
  // Debugging output for forward/backward movement
  if (pitch !== 0) {
    console.log("Pitch value being used:", pitch);
  }
  
  // Acceleration and braking/reversing - handle separately for clarity
  if (pitch > JOYSTICK_DEADZONE) {
    // Forward movement (positive adjusted pitch - pushing joystick forward, away from pins)
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
    // Negative adjusted pitch - pulling joystick back, toward pins
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
  
  // Add debug info to display
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
}

// Restart the game
function restartGame() {
  startGame();
}

// Update car physics with improved wheel rotation
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
  
  // Rotate wheels based on speed
  if (car.model) {
    // Wheels are now at indices 3, 4, 5, 6 in the improved car model
    const wheelRotationSpeed = car.speed / 10;
    
    // For the improved model, wheels are complete groups
    for (let i = 3; i <= 6; i++) {
      if (car.model.children[i]) {
        // Rotate all wheels correctly based on direction
        if (car.model.children[i].children.length > 0) {
          car.model.children[i].children.forEach(part => {
            // Only rotate around proper axis (z-axis of wheel group which is x in world)
            part.rotation.x += wheelRotationSpeed;
          });
        }
      }
    }
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
  
  // Update speed display
  document.getElementById('speed-display').textContent = `Speed: ${Math.round(Math.abs(car.speed))} km/h${car.speed < 0 ? ' (R)' : ''}`;
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
  
  // Update debug info
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
  ctx.fillStyle = 'rgba(230, 255, 230, 0.6)'; // Light green with transparency
  ctx.fillRect(0, 0, 200, 200);
  
  // Scale and center factors - increased scale for more zoom
  const scale = 0.18; // Reduced to fit larger track
  const offsetX = 100;
  const offsetY = 100;
  
  // Draw track with increased width and contrast
  ctx.beginPath();
  ctx.strokeStyle = '#111111'; // Very dark gray, almost black
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

// Initialize the game when the page loads
window.addEventListener('load', init);
