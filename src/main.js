import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SerialController from './serial-controller.js';

// Game constants
const GRAVITY = 0.05;
const MAX_SPEED = 2.0;
const MIN_SPEED = 0.5;
const BOOST_MULTIPLIER = 1.5;
const TURN_RATE = 0.03;
const PITCH_RATE = 0.08; // Increased significantly from 0.05 for much stronger pitch effect
const ROLL_RATE = 0.05;
const HOOP_COUNT = 15;
const HOOP_RADIUS = 30;
const MAX_LAPS = 3;
const TURN_EFFECTIVENESS = 1.5; // Increased from 1.2 for more pronounced turning
const STABILIZATION_SPEED = 0.015; // Further reduced for even less auto-leveling
const ROTATION_DAMPING = 0.98; // Less damping for more responsive controls
const VERTICAL_SENSITIVITY = 3.5; // Significantly increased from 2.0 for even stronger vertical movement
const CIRCUIT_RADIUS = 400; // Increased from 250 for bigger flight path
const HEIGHT_VARIATION = 80; // Increased from 40 for more vertical challenge

// Game state
let gameRunning = false;
let gameOver = false;
let currentLap = 0;
let currentHoop = 0;
let lapStartTime = 0;
let currentTime = 0;
let targetTime = 60000; // 1 minute in milliseconds

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

// Aircraft state
const aircraft = {
  model: null,
  speed: 1.0,
  velocity: new THREE.Vector3(0, 0, 1),
  position: new THREE.Vector3(0, 100, 0),
  rotation: new THREE.Euler(0, 0, 0),
  boosting: false
};

// Hoops array
const hoops = [];

// Controls
let serialController = null;
let controls; // For development camera

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

  // Ground plane
  const groundGeometry = new THREE.PlaneGeometry(2000, 2000, 20, 20);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x228B22,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = Math.PI / 2;
  ground.position.y = -10;
  ground.receiveShadow = true;
  scene.add(ground);

  // Add some mountains/hills
  addTerrain();

  // Load aircraft model
  loadAircraft();

  // Create hoops
  createHoops();

  // Position camera behind aircraft
  camera.position.set(0, 105, -20);
  camera.lookAt(new THREE.Vector3(0, 100, 0));

  // Add orbit controls for development/debugging
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.update();
  
  // Initially disable orbit controls - we'll use them just for debugging
  controls.enabled = false;

  // Set up event listeners
  window.addEventListener('resize', onWindowResize);
  document.getElementById('connect-btn').addEventListener('click', connectController);
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  // Start the game loop
  gameLoop();
}

// Create terrain with mountains
function addTerrain() {
  for (let i = 0; i < 20; i++) {
    const mountainGeometry = new THREE.ConeGeometry(
      50 + Math.random() * 100, // random radius
      100 + Math.random() * 200, // random height
      6 + Math.floor(Math.random() * 8) // random segment count
    );
    
    const mountainMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.3 + Math.random() * 0.2, 0.2 + Math.random() * 0.2, 0.1 + Math.random() * 0.1),
      flatShading: true,
      roughness: 0.8
    });
    
    const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
    mountain.position.set(
      (Math.random() - 0.5) * 1500, 
      -10, 
      (Math.random() - 0.5) * 1500
    );
    mountain.castShadow = true;
    mountain.receiveShadow = true;
    scene.add(mountain);
  }
}

// Load aircraft model
function loadAircraft() {
  // Use a more detailed airplane mesh with visible orientation features
  const fuselageGeometry = new THREE.CylinderGeometry(2, 1.5, 12, 8); // Tapered fuselage
  const fuselageMaterial = new THREE.MeshStandardMaterial({ color: 0x1E90FF });
  const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.y = 0;
  fuselage.castShadow = true;
  
  // Wings - made wider and with dihedral (upward angle) for better banking visibility
  const wingGroup = new THREE.Group();
  
  // Left wing with dihedral
  const leftWingGeometry = new THREE.BoxGeometry(12, 0.5, 4);
  const wingMaterial = new THREE.MeshStandardMaterial({ color: 0xDC143C });
  const leftWing = new THREE.Mesh(leftWingGeometry, wingMaterial);
  leftWing.position.set(-6, 0, 0);
  leftWing.rotation.z = Math.PI / 24; // Slight upward angle
  leftWing.castShadow = true;
  
  // Right wing with dihedral
  const rightWingGeometry = new THREE.BoxGeometry(12, 0.5, 4);
  const rightWing = new THREE.Mesh(rightWingGeometry, wingMaterial);
  rightWing.position.set(6, 0, 0);
  rightWing.rotation.z = -Math.PI / 24; // Slight upward angle
  rightWing.castShadow = true;
  
  // Wing stripes for better orientation visibility
  const leftStripeGeometry = new THREE.BoxGeometry(4, 0.6, 0.6);
  const stripesMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
  const leftStripe = new THREE.Mesh(leftStripeGeometry, stripesMaterial);
  leftStripe.position.set(-8, 0.1, 0);
  
  const rightStripeGeometry = new THREE.BoxGeometry(4, 0.6, 0.6);
  const rightStripe = new THREE.Mesh(rightStripeGeometry, stripesMaterial);
  rightStripe.position.set(8, 0.1, 0);
  
  // Add wings and stripes to wing group
  wingGroup.add(leftWing);
  wingGroup.add(rightWing);
  wingGroup.add(leftStripe);
  wingGroup.add(rightStripe);
  
  // Tail
  const tailGeometry = new THREE.BoxGeometry(6, 0.5, 3);
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xDC143C });
  const tail = new THREE.Mesh(tailGeometry, tailMaterial);
  tail.position.set(0, 0, -5.5);
  tail.castShadow = true;
  
  // Vertical stabilizer - made taller
  const vStabGeometry = new THREE.BoxGeometry(0.5, 4, 3);
  const vStabMaterial = new THREE.MeshStandardMaterial({ color: 0xDC143C });
  const vStab = new THREE.Mesh(vStabGeometry, vStabMaterial);
  vStab.position.set(0, 2, -5.5);
  vStab.castShadow = true;
  
  // Horizontal stabilizers (elevators)
  const hStabGroup = new THREE.Group();
  
  // Left stabilizer
  const leftHStabGeometry = new THREE.BoxGeometry(4, 0.3, 2);
  const hStabMaterial = new THREE.MeshStandardMaterial({ color: 0xDC143C });
  const leftHStab = new THREE.Mesh(leftHStabGeometry, hStabMaterial);
  leftHStab.position.set(-2, 0.5, -5.5);
  leftHStab.castShadow = true;
  
  // Right stabilizer
  const rightHStabGeometry = new THREE.BoxGeometry(4, 0.3, 2);
  const rightHStab = new THREE.Mesh(rightHStabGeometry, hStabMaterial);
  rightHStab.position.set(2, 0.5, -5.5);
  rightHStab.castShadow = true;
  
  // Add horizontal stabilizers to group
  hStabGroup.add(leftHStab);
  hStabGroup.add(rightHStab);
  
  // Propeller
  const propGeometry = new THREE.BoxGeometry(10, 0.5, 0.5);
  const propMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const propeller = new THREE.Mesh(propGeometry, propMaterial);
  propeller.position.set(0, 0, 6.5);
  propeller.castShadow = true;
  
  // Cockpit for better orientation reference
  const cockpitGeometry = new THREE.SphereGeometry(1.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const cockpitMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x87CEEB,
    transparent: true,
    opacity: 0.7,
    metalness: 0.8,
    roughness: 0.2
  });
  const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
  cockpit.rotation.x = Math.PI / 2;
  cockpit.position.set(0, 1, 2);
  cockpit.castShadow = true;
  
  // Group all parts
  aircraft.model = new THREE.Group();
  aircraft.model.add(fuselage);
  aircraft.model.add(wingGroup);
  aircraft.model.add(tail);
  aircraft.model.add(vStab);
  aircraft.model.add(hStabGroup);
  aircraft.model.add(propeller);
  aircraft.model.add(cockpit);
  
  aircraft.model.position.copy(aircraft.position);
  
  // Set initial orientation
  aircraft.model.rotation.set(
    aircraft.rotation.x,
    aircraft.rotation.y,
    aircraft.rotation.z
  );
  
  scene.add(aircraft.model);
  
  // Store reference to propeller for animation
  aircraft.propeller = propeller;
}

// Create circular hoops for the race course
function createHoops() {
  // Clear any existing hoops
  hoops.forEach(hoop => scene.remove(hoop.mesh));
  hoops.length = 0;
  
  // Define a circular path with more height variation
  for (let i = 0; i < HOOP_COUNT; i++) {
    const angle = (i / HOOP_COUNT) * Math.PI * 2;
    // Add some variation to radius to make it more interesting
    const radius = CIRCUIT_RADIUS + Math.sin(i * 3) * 50; 
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // More dramatic height variation
    const y = 120 + Math.sin(angle * 2) * HEIGHT_VARIATION;
    
    // Create hoop geometry
    const torusGeometry = new THREE.TorusGeometry(HOOP_RADIUS, 2, 16, 32);
    const torusMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFD700,
      emissive: 0xFFD700,
      emissiveIntensity: 0.3,
      metalness: 0.8,
      roughness: 0.2
    });
    const torus = new THREE.Mesh(torusGeometry, torusMaterial);
    
    // Position the hoop
    torus.position.set(x, y, z);
    
    // Orient the hoop to face the center but with some variation
    const lookPoint = new THREE.Vector3(0, y, 0);
    // Add slight random variation to hoop orientation
    lookPoint.x += (Math.random() - 0.5) * 50;
    lookPoint.z += (Math.random() - 0.5) * 50;
    torus.lookAt(lookPoint);
    
    // Rotate to make the hoop vertical
    torus.rotation.y += Math.PI / 2;
    
    // Store hoop data
    const hoop = {
      mesh: torus,
      position: new THREE.Vector3(x, y, z),
      passed: false
    };
    
    hoops.push(hoop);
    scene.add(torus);
    
    // Add particle effect inside the hoop
    addHoopParticles(hoop);
  }
}

// Add particle effects inside hoops
function addHoopParticles(hoop) {
  const particleCount = 50;
  const particles = new THREE.Group();
  
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = HOOP_RADIUS * 0.8 * Math.random();
    
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    
    const particleGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const particleMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.7
    });
    
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    particle.position.set(x, y, 0);
    particle.userData = {
      angle: angle,
      radius: radius,
      speed: 0.01 + Math.random() * 0.03
    };
    
    particles.add(particle);
  }
  
  hoop.mesh.add(particles);
  hoop.particles = particles;
}

// Animate hoop particles
function updateHoopParticles() {
  hoops.forEach(hoop => {
    if (hoop.particles) {
      hoop.particles.children.forEach(particle => {
        const userData = particle.userData;
        userData.angle += userData.speed;
        
        particle.position.x = Math.cos(userData.angle) * userData.radius;
        particle.position.y = Math.sin(userData.angle) * userData.radius;
      });
    }
  });
}

// Connect to joystick controller
function connectController() {
  if (serialController && serialController.connected) {
    // Disconnect if already connected
    serialController.disconnect().then(() => {
      document.getElementById('connect-btn').textContent = 'Connect Controller';
      document.getElementById('joystick-debug').textContent = 'Controller disconnected';
    }).catch(error => {
      console.error('Error disconnecting controller:', error);
    });
    return;
  }

  // Create controller if it doesn't exist
  if (!serialController) {
    serialController = new SerialController();
  }

  // Set up data callback
  serialController.setJoystickDataCallback(handleControllerInput);

  // Attempt to connect
  document.getElementById('joystick-debug').textContent = 'Connecting to controller...';
  serialController.connect().then(() => {
    document.getElementById('connect-btn').textContent = 'Disconnect Controller';
    if (!gameRunning && !gameOver) {
      startGame();
    }
  }).catch(error => {
    console.error('Failed to connect to controller:', error);
    document.getElementById('joystick-debug').textContent = 'Connection failed: ' + error.message;
  });
}

// Handle input from controller
function handleControllerInput(data) {
  if (!gameRunning || gameOver) return;

  // Roll (banking left/right)
  if (Math.abs(data.roll) > 0.05) { // Only apply roll if input exceeds threshold
    // Apply roll rotation with increased effect for more visible banking
    aircraft.rotation.z = THREE.MathUtils.lerp(
      aircraft.rotation.z,
      -data.roll * ROLL_RATE * 15, // Significantly increased for very pronounced banking
      0.2  // Increased for faster response
    );
    
    // Turn based on bank angle - with increased effectiveness
    const bankAngle = aircraft.rotation.z;
    const turnAmount = -Math.sign(bankAngle) * Math.abs(bankAngle) * TURN_EFFECTIVENESS;
    aircraft.rotation.y += turnAmount;
  } else {
    // Return to level flight when no input - gradually reduce bank angle
    aircraft.rotation.z = THREE.MathUtils.lerp(aircraft.rotation.z, 0, STABILIZATION_SPEED);
  }

  // Pitch (up/down)
  if (Math.abs(data.pitch) > 0.05) { // Only apply pitch if input exceeds threshold
    // Apply pitch with extremely increased intensity
    aircraft.rotation.x = THREE.MathUtils.lerp(
      aircraft.rotation.x,
      -data.pitch * PITCH_RATE * 30, // Drastically increased for much more responsive pitch
      0.2  // Increased for faster response
    );
  } else {
    // Return to level flight when no input - gradually level pitch
    aircraft.rotation.x = THREE.MathUtils.lerp(aircraft.rotation.x, 0, STABILIZATION_SPEED);
  }

  // Boost
  aircraft.boosting = data.boost;
}

// Start the game
function startGame() {
  // Reset game state
  gameRunning = true;
  gameOver = false;
  currentLap = 0;
  currentHoop = 0;
  lapStartTime = Date.now();
  currentTime = 0;
  targetTime = 60000; // 1 minute to start
  
  // Reset hoops
  hoops.forEach(hoop => {
    hoop.passed = false;
    hoop.mesh.material.color.set(0xFFD700); // Reset to gold
    hoop.mesh.material.emissive.set(0xFFD700);
  });
  
  // Reset aircraft position
  aircraft.position.set(hoops[0].position.x, hoops[0].position.y, hoops[0].position.z - 100);
  aircraft.model.position.copy(aircraft.position);
  
  // Point aircraft toward first hoop
  aircraft.model.lookAt(hoops[0].position);
  aircraft.rotation.x = 0;
  aircraft.rotation.y = aircraft.model.rotation.y;
  aircraft.rotation.z = 0;
  
  // Reset aircraft speed
  aircraft.speed = 1.0;
  
  // Update velocity direction from rotation
  updateAircraftVelocity();
  
  // Update UI
  document.getElementById('lap-counter').textContent = `Lap: ${currentLap + 1}/${MAX_LAPS}`;
  document.getElementById('time-display').textContent = formatTime(0);
  document.getElementById('target-time').textContent = `Target: ${formatTime(targetTime)}`;
  
  // Hide message overlay
  document.getElementById('message-overlay').style.display = 'none';
}

// Restart the game
function restartGame() {
  if (gameOver) {
    startGame();
  }
}

// Update aircraft velocity based on its rotation
function updateAircraftVelocity() {
  // Create direction vector from aircraft rotation
  const direction = new THREE.Vector3(0, 0, 1);
  
  // Apply aircraft rotation to the direction vector
  direction.applyEuler(new THREE.Euler(
    aircraft.rotation.x,
    aircraft.rotation.y,
    aircraft.rotation.z,
    'XYZ'
  ));
  
  // Normalize the direction vector
  direction.normalize();
  
  // Enhanced pitch effect - significantly increase vertical movement based on pitch
  if (Math.abs(aircraft.rotation.x) > 0.05) { // Lower threshold for earlier vertical response
    direction.y *= VERTICAL_SENSITIVITY; // Amplify vertical direction component
    // Renormalize after amplifying vertical component
    direction.normalize();
  }
  
  // Calculate speed based on current speed, gravity, and boosting
  // Apply gravity with reduced effect
  aircraft.speed -= GRAVITY * 0.5 * Math.abs(Math.sin(aircraft.rotation.x));
  
  if (aircraft.rotation.x < 0) {
    // Nose up - lose speed (increased effect)
    aircraft.speed -= 0.02 * Math.abs(Math.sin(aircraft.rotation.x)); // Increased for more noticeable effect
  } else {
    // Nose down - gain speed (increased effect)
    aircraft.speed += 0.02 * Math.abs(Math.sin(aircraft.rotation.x)); // Increased for more noticeable effect
  }
  
  // Apply boost
  if (aircraft.boosting) {
    aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, MAX_SPEED * BOOST_MULTIPLIER, 0.05);
  } else {
    // Gradually settle to base speed when not boosting
    aircraft.speed = THREE.MathUtils.lerp(aircraft.speed, 1.0, 0.01);
  }
  
  // Clamp speed
  aircraft.speed = THREE.MathUtils.clamp(aircraft.speed, MIN_SPEED, MAX_SPEED);
  
  // Apply damping to velocity to prevent erratic movement
  aircraft.velocity.lerp(direction.multiplyScalar(aircraft.speed), 0.15); // Increased for more responsive movement
}

// Check for collision with hoops
function checkHoopCollisions() {
  if (currentHoop >= hoops.length) return;
  
  const hoop = hoops[currentHoop];
  const hoopPos = hoop.position;
  
  // Vector from aircraft to hoop center
  const toHoop = new THREE.Vector3().subVectors(hoopPos, aircraft.position);
  
  // Distance to hoop center
  const distance = toHoop.length();
  
  // Check if we're close enough to possibly pass through
  if (distance < HOOP_RADIUS * 2) {
    // Check if we're passing through the hoop
    // Create a plane at the hoop position that faces the hoop's orientation
    const hoopNormal = new THREE.Vector3(0, 0, 1).applyEuler(hoop.mesh.rotation);
    
    // Calculate dot product between aircraft velocity and hoop normal
    const dot = aircraft.velocity.clone().normalize().dot(hoopNormal);
    
    // If dot product is positive, we're moving through the hoop from front to back
    if (dot > 0 && distance < HOOP_RADIUS * 0.8) {
      // We passed through the hoop!
      hoop.passed = true;
      hoop.mesh.material.color.set(0x00FF00); // Change to green
      hoop.mesh.material.emissive.set(0x00FF00);
      
      // Play sound
      playSound('hoop');
      
      // Move to next hoop
      currentHoop++;
      
      // Check if we completed a lap
      if (currentHoop >= hoops.length) {
        completeLap();
      }
    }
  }
}

// Completing a lap
function completeLap() {
  currentLap++;
  
  // Check if we completed all laps
  if (currentLap >= MAX_LAPS) {
    // Game won!
    gameOver = true;
    showMessage('Victory!', 'You completed all laps!');
    playSound('victory');
    return;
  }
  
  // Calculate lap time
  const lapTime = Date.now() - lapStartTime;
  
  // Check if we beat the target time
  if (lapTime <= targetTime) {
    // Reduce target time for next lap
    targetTime = Math.max(targetTime * 0.85, 20000); // Min 20 seconds
    
    // Show success message
    showTempMessage('Lap Complete!', `Time: ${formatTime(lapTime)}\nNext target: ${formatTime(targetTime)}`, 3000);
    
    // Play success sound
    playSound('success');
  } else {
    // Failed to beat target time
    gameOver = true;
    showMessage('Game Over', `You didn't beat the target time!\nYour time: ${formatTime(lapTime)}\nTarget: ${formatTime(targetTime)}`);
    playSound('failure');
    return;
  }
  
  // Reset for next lap
  lapStartTime = Date.now();
  currentHoop = 0;
  
  // Reset hoops
  hoops.forEach(hoop => {
    hoop.passed = false;
    hoop.mesh.material.color.set(0xFFD700); // Reset to gold
    hoop.mesh.material.emissive.set(0xFFD700); 
  });
  
  // Update lap counter
  document.getElementById('lap-counter').textContent = `Lap: ${currentLap + 1}/${MAX_LAPS}`;
  document.getElementById('target-time').textContent = `Target: ${formatTime(targetTime)}`;
}

// Show message overlay
function showMessage(title, message) {
  const overlay = document.getElementById('message-overlay');
  document.getElementById('message-title').textContent = title;
  document.getElementById('message-content').textContent = message;
  overlay.style.display = 'block';
}

// Show temporary message
function showTempMessage(title, message, duration) {
  const overlay = document.getElementById('message-overlay');
  document.getElementById('message-title').textContent = title;
  document.getElementById('message-content').textContent = message;
  document.getElementById('restart-btn').style.display = 'none';
  overlay.style.display = 'block';
  
  setTimeout(() => {
    overlay.style.display = 'none';
    document.getElementById('restart-btn').style.display = 'block';
  }, duration);
}

// Format time in MM:SS.mmm format
function formatTime(timeMs) {
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const milliseconds = timeMs % 1000;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

// Play a sound effect
function playSound(soundName) {
  // This would be implemented if we had sound files
  console.log(`Playing sound: ${soundName}`);
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
  
  if (gameRunning && !gameOver) {
    // Update current time
    currentTime = Date.now() - lapStartTime;
    document.getElementById('time-display').textContent = formatTime(currentTime);
    
    // Check if time ran out
    if (currentTime > targetTime) {
      gameOver = true;
      showMessage('Game Over', 'You ran out of time!');
      playSound('failure');
    }
    
    // Update aircraft
    updateAircraftVelocity();
    
    // Auto-stabilization when no input is detected
    if (!serialController || 
        (Math.abs(serialController.roll) < 0.05 && Math.abs(serialController.pitch) < 0.05)) {
      // Even less aggressive auto-stabilization for more realistic flight feel
      aircraft.rotation.x = THREE.MathUtils.lerp(aircraft.rotation.x, 0, STABILIZATION_SPEED);
      aircraft.rotation.z = THREE.MathUtils.lerp(aircraft.rotation.z, 0, STABILIZATION_SPEED);
    }
    
    // Move aircraft
    aircraft.position.add(aircraft.velocity);
    aircraft.model.position.copy(aircraft.position);
    
    // CRITICAL FIX: Apply rotation directly to the aircraft model with proper visualization
    // This ensures the aircraft model properly banks and pitches
    // Apply correct transformations in the right order for aircraft-like movement
    aircraft.model.rotation.set(0, 0, 0); // Reset rotation
    aircraft.model.rotateY(aircraft.rotation.y); // First yaw
    aircraft.model.rotateZ(aircraft.rotation.z); // Then roll/bank
    aircraft.model.rotateX(aircraft.rotation.x); // Finally pitch
    
    // Animate propeller
    if (aircraft.propeller) {
      aircraft.propeller.rotation.x += 0.5 + aircraft.speed * 0.2;
    }
    
    // Check for collisions with hoops
    checkHoopCollisions();
    
    // Update hoop particles
    updateHoopParticles();
    
    // Position camera behind aircraft - smoother camera follow
    const cameraOffset = new THREE.Vector3(0, 8, -30);
    
    // Apply some of the aircraft's banking and pitch to the camera
    // This makes the camera tilt slightly with the aircraft for a more immersive feel
    const bankInfluence = aircraft.rotation.z * 0.5; // Increased from 0.4 for more visible effect
    const pitchInfluence = aircraft.rotation.x * 0.5; // Increased from 0.3 for more visible effect
    
    // Create a rotated offset that follows aircraft banking and pitch partially
    const rotatedOffset = cameraOffset.clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), aircraft.rotation.y) // Follow yaw completely
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), pitchInfluence) // Follow pitch partially
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), bankInfluence); // Follow bank partially
    
    // Smoother camera movement
    camera.position.lerp(
      new THREE.Vector3().copy(aircraft.position).add(rotatedOffset),
      0.05
    );
    
    // Smoother look target - slightly ahead of the aircraft
    const lookTarget = new THREE.Vector3(
      aircraft.position.x + aircraft.velocity.x * 8,
      aircraft.position.y + aircraft.velocity.y * 8 + 2,
      aircraft.position.z + aircraft.velocity.z * 8
    );
    
    camera.lookAt(lookTarget);
  }
  
  // Only use orbit controls if specifically enabled for debugging
  if (controls.enabled) {
    controls.update();
  }
  
  // Render the scene
  renderer.render(scene, camera);
}

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', init);
