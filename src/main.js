import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import * as d3 from 'd3-scale-chromatic';
import GUI from 'lil-gui';

/**
 * Vector field: function (x, y, z) => THREE.Vector3.
 * The returned vector is the direction (and optionally magnitude) at that position.
 * Visualization scales it by vectorScale for display.
 */
function defineVectorFields() {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  return {
    'Constant +X': () => v(1, 0, 0),
    'Constant +Y': () => v(0, 1, 0),
    'Constant +Z': () => v(0, 0, 1),
    'Radial (outward)': (x, y, z) => v(x, y, z).normalize(),
    'Radial (inward)': (x, y, z) => v(-x, -y, -z).normalize(),
    'Circular (XZ, around Y)': (x, y, z) => v(-z, 0, x).normalize(),
    'Circular (XY, around Z)': (x, y, z) => v(-y, x, 0).normalize(),
    'Curl-like (XZ)': (x, y, z) => v(-z * 0.1, 0, x * 0.1),
    'Noise (simplex-style)': (x, y, z) => {
      const s = 0.1;
      const nx = Math.sin(x * s) * Math.cos(y * s) + Math.sin(z * s);
      const ny = Math.cos(x * s) * Math.sin(z * s) + Math.cos(y * s);
      const nz = Math.sin(y * s) * Math.cos(z * s) + Math.cos(x * s);
      return v(nx, ny, nz).normalize();
    },
    'Gradient (x²+y²+z²)': (x, y, z) => v(2 * x, 2 * y, 2 * z).normalize(),
    'Zero': () => v(0, 0, 0),

    // Variable magnitude fields (arrows/lines have different lengths)
    'Radial (magnitude ∝ r)': (x, y, z) => v(x * 0.02, y * 0.02, z * 0.02),
    'Radial (magnitude ∝ 1/r)': (x, y, z) => {
      const r = Math.sqrt(x * x + y * y + z * z) + 1;
      return v(x / r, y / r, z / r).multiplyScalar(50 / r);
    },
    'Radial (magnitude ∝ 1/r²)': (x, y, z) => {
      const r2 = x * x + y * y + z * z + 100;
      const r = Math.sqrt(r2);
      return v(x, y, z).normalize().multiplyScalar(5000 / r2);
    },
    'Strong at center (linear falloff)': (x, y, z) => {
      const r = Math.sqrt(x * x + y * y + z * z);
      const mag = Math.max(0, 1 - r / 120);
      return v(x, y, z).normalize().multiplyScalar(mag);
    },
    'Strong at edges (rim)': (x, y, z) => {
      const r = Math.sqrt(x * x + y * y + z * z);
      const mag = r < 1 ? 0 : Math.min(1, (r - 50) / 60);
      return v(x, y, z).normalize().multiplyScalar(mag);
    },
    'Gradient (raw magnitude)': (x, y, z) => v(x * 0.04, y * 0.04, z * 0.04),
    'Vortex (speed ∝ 1/r)': (x, y, z) => {
      const r = Math.sqrt(x * x + z * z) + 5;
      return v(-z, 0, x).normalize().multiplyScalar(80 / r);
    },
    'Noise (variable magnitude)': (x, y, z) => {
      const s = 0.1;
      const nx = Math.sin(x * s) * Math.cos(y * s) + Math.sin(z * s);
      const ny = Math.cos(x * s) * Math.sin(z * s) + Math.cos(y * s);
      const nz = Math.sin(y * s) * Math.cos(z * s) + Math.cos(x * s);
      const mag = 0.4 + 0.6 * (Math.sin(x * 0.03) * Math.cos(z * 0.03) + 1) / 2;
      return v(nx, ny, nz).normalize().multiplyScalar(mag);
    },

    // Chaotic / complex flows (plan: complex vector field equations)
    'ABC flow': (x, y, z) => {
      const A = 0.5, B = 0.5, C = 0.5;
      const vx = A * Math.sin(z) + C * Math.cos(y);
      const vy = B * Math.sin(x) + A * Math.cos(z);
      const vz = C * Math.sin(y) + B * Math.cos(x);
      return v(vx, vy, vz);
    },
    'Lorenz (attractor)': (x, y, z) => {
      const sigma = 10, rho = 28, beta = 8 / 3;
      const vx = sigma * (y - x);
      const vy = x * (rho - z) - y;
      const vz = x * y - beta * z;
      const vec = v(vx, vy, vz);
      const mag = vec.length();
      if (mag > 50) vec.multiplyScalar(50 / mag);
      return vec;
    },
    'Rössler': (x, y, z) => {
      const a = 0.2, b = 0.2, c = 5.7;
      const vx = -y - z;
      const vy = x + a * y;
      const vz = b + z * (x - c);
      const vec = v(vx, vy, vz);
      const mag = vec.length();
      if (mag > 30) vec.multiplyScalar(30 / mag);
      return vec;
    },
    'Thomas attractor': (x, y, z) => {
      const b = 0.208186;
      const vx = Math.sin(y) - b * x;
      const vy = Math.sin(z) - b * y;
      const vz = Math.sin(x) - b * z;
      const vec = v(vx, vy, vz);
      const mag = vec.length();
      if (mag > 2) vec.multiplyScalar(2 / mag);
      return vec;
    },
    'Double gyre (XY)': (x, y, z) => {
      const xp = (x / 100 + 1);
      const yp = (y / 100 + 1) * 0.5;
      const u = Math.PI * Math.sin(2 * Math.PI * xp) * Math.cos(Math.PI * yp);
      const vv = -2 * Math.PI * Math.cos(2 * Math.PI * xp) * Math.sin(Math.PI * yp);
      const w = 0.3 * Math.sin(x * 0.02) * Math.cos(z * 0.02);
      return v(u * 8, vv * 8, w);
    },
    'Noise (multi-scale)': (x, y, z) => {
      const f1 = 0.05, f2 = 0.1, f3 = 0.2;
      const nx = Math.sin(x * f1) * Math.cos(y * f2) + Math.sin(z * f3) * 0.7 +
        Math.sin(x * f3 + 1) * Math.cos(z * f1) * 0.5;
      const ny = Math.cos(x * f2) * Math.sin(z * f1) + Math.cos(y * f3) * 0.7 +
        Math.sin(y * f1 + 2) * Math.cos(x * f3) * 0.5;
      const nz = Math.sin(y * f3) * Math.cos(z * f2) + Math.cos(x * f1) * 0.7 +
        Math.sin(z * f2 + 3) * Math.cos(y * f1) * 0.5;
      return v(nx, ny, nz).normalize();
    },
    'Vortex lattice': (x, y, z) => {
      const eps = 80;
      const vortices = [
        [-60, 0, -60], [60, 0, -60], [-60, 0, 60], [60, 0, 60],
        [0, 0, -60], [0, 0, 60], [-60, 0, 0], [60, 0, 0]
      ];
      const strengths = [1, -1, 1, -1, -1, 1, -1, 1];
      let vx = 0, vz = 0;
      for (let i = 0; i < vortices.length; i++) {
        const [vx0, , vz0] = vortices[i];
        const dx = x - vx0, dz = z - vz0;
        const r2 = dx * dx + dz * dz + eps * eps;
        const k = (strengths[i] * 120) / r2;
        vx += -dz * k;
        vz += dx * k;
      }
      return v(vx, 0.2 * Math.sin(x * 0.03) * Math.cos(z * 0.03), vz);
    }
  };
}

/** Trail update interval (seconds) to avoid expensive per-frame line updates. */
const TRAIL_UPDATE_INTERVAL = 0.1;
const MAX_TRAIL_POINTS = 500;

/**
 * Single particle: intro animation, then field-driven motion with a trail line.
 */
class Particle {
  constructor(position, color) {
    this.position = position.clone();
    this.color = color.clone();
    this.introT = 0;
    this.line = null;
    this.linePointCount = 0;
    this.lineUpdateAccumulator = 0;
    this.linePositions = new Float32Array(MAX_TRAIL_POINTS * 3);
  }

  /**
   * Create the trail line when intro completes. Uses current position as first point (need 2 points to draw).
   */
  createLine(scene) {
    const p = this.position;
    this.linePositions[0] = p.x;
    this.linePositions[1] = p.y;
    this.linePositions[2] = p.z;
    this.linePositions[3] = p.x;
    this.linePositions[4] = p.y;
    this.linePositions[5] = p.z;
    this.linePointCount = 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    geometry.setDrawRange(0, 2);
    const material = new THREE.LineBasicMaterial({
      color: this.color.getStyle(),
      linewidth: 1
    });
    this.line = new THREE.Line(geometry, material);
    scene.add(this.line);
  }

  /**
   * Append current position to the trail at a reasonable interval.
   */
  maybeAddTrailPoint() {
    if (!this.line || this.linePointCount >= MAX_TRAIL_POINTS) return;
    const p = this.position;
    const i = this.linePointCount * 3;
    this.linePositions[i] = p.x;
    this.linePositions[i + 1] = p.y;
    this.linePositions[i + 2] = p.z;
    this.linePointCount++;
    if (this.linePointCount >= 2) {
      this.line.geometry.setDrawRange(0, this.linePointCount);
      this.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  /**
   * Detach from particle; trail line is left in the scene as a persistent path.
   * Returns the line (or null) so the app can track it for cleanup on reset.
   */
  dispose() {
    const line = this.line;
    this.line = null;
    return line;
  }

  /**
   * Update particle for one frame. Returns true if particle should be removed (exited field).
   * ctx: { introDuration, start, endFace, scale, fieldSpeed, field, isInsideField, getRandomPositionInFieldWorld, scene }
   */
  update(delta, ctx) {
    const { introDuration, start, endFace, scale, fieldSpeed, field, isInsideField, getRandomPositionInFieldWorld, scene } = ctx;

    if (this.introT < 1) {
      this.introT = Math.min(1, this.introT + delta / introDuration);
      this.position.lerpVectors(start, endFace, this.introT);
      if (this.introT >= 1) {
        this.position.copy(getRandomPositionInFieldWorld());
        this.createLine(scene);
        this.lineUpdateAccumulator = 0;
      }
      return false;
    }

    const lx = this.position.x / scale;
    const ly = this.position.y / scale;
    const lz = this.position.z / scale;
    const vec = field(lx, ly, lz);
    this.position.x += vec.x * delta * fieldSpeed * scale;
    this.position.y += vec.y * delta * fieldSpeed * scale;
    this.position.z += vec.z * delta * fieldSpeed * scale;
    const nx = this.position.x / scale;
    const ny = this.position.y / scale;
    const nz = this.position.z / scale;

    if (!isInsideField(nx, ny, nz)) return true;

    this.lineUpdateAccumulator += delta;
    if (this.lineUpdateAccumulator >= TRAIL_UPDATE_INTERVAL) {
      this.lineUpdateAccumulator = 0;
      this.maybeAddTrailPoint();
    }
    return false;
  }
}

class App {
  constructor() {
    this.vectorFields = defineVectorFields();
    this.params = {
      objectScale: 4,
      starRadius: 800,
      pointSize: 3,
      gridSize: 12,
      vectorField: 'Constant +X',
      vectorScale: 8,
      lineStartColor: '#ff0080',
      lineEndColor: '#00c0ff',
      particleStartPosition: 250,
      particleFieldSpeed: 30,
      reset: () => this.reset()
    };

    this.clock = new THREE.Clock();
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.particles = [];
    this.leftBehindTrails = [];

    this.init();
    this.setupLighting();
    this.addStars();
    this.setupGUI();
    this.setupKeyboardControls();
    this.createGrid();
    this.createBoundaryCube();
    this.createParticleStartPoint();
    this.createGradientLine();
    this.animate();
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("black");

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      50000
    );
    this.camera.position.set(0, 100, 500);
    this.params.starRadius = this.camera.position.length();

    // Renderer
    const canvas = document.getElementById('canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Controls (for non-animated viewing)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.25;
    this.controls.target.set(0, 0, 0);
    this.controls.maxDistance = 10000; // max zoom-out distance from target

    // Handle resize
    window.addEventListener('resize', () => this.onResize());
  }

  addStars() {
    if (this.starPoints) {
      this.scene.remove(this.starPoints);
      this.starPoints.geometry.dispose();
      this.starPoints.material.dispose();
      this.starPoints = null;
    }
    // Exclusion radius: no stars closer than this (e.g. camera distance) so they don't get in the way.
    const exclusionRadius = this.params.starRadius;
    const outerRadius = 10000;
    if (exclusionRadius >= outerRadius) {
      return;
    }
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const count = 500;
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = 2 * Math.PI * Math.random();
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);
      // Uniform in shell: r in [exclusionRadius, outerRadius] by volume (r^3)
      const rMin3 = exclusionRadius * exclusionRadius * exclusionRadius;
      const rMax3 = outerRadius * outerRadius * outerRadius;
      const r = Math.pow(rMin3 + (rMax3 - rMin3) * Math.random(), 1 / 3);
      vertices.push(x * r, y * r, z * r);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x888888 }));
    this.starPoints = particles;
    this.scene.add(particles);
  }

  setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambientLight);

    // Main directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 1000;
    directionalLight.shadow.camera.left = -200;
    directionalLight.shadow.camera.right = 200;
    directionalLight.shadow.camera.top = 200;
    directionalLight.shadow.camera.bottom = -200;
    this.scene.add(directionalLight);

    // Accent lights for atmosphere
    const cyanLight = new THREE.PointLight(0x00f0ff, 0.8, 500);
    cyanLight.position.set(-100, 50, 100);
    this.scene.add(cyanLight);

    const magentaLight = new THREE.PointLight(0xff00aa, 0.5, 400);
    magentaLight.position.set(100, 80, -100);
    this.scene.add(magentaLight);

    // Hemisphere light for natural feel
    const hemiLight = new THREE.HemisphereLight(0x0088ff, 0x002244, 0.4);
    this.scene.add(hemiLight);
  }

  setupGUI() {
    this.gui = new GUI({ title: '⟨ CONTROLS ⟩' });

    const viewFolder = this.gui.addFolder('Viewing');
    viewFolder.add(this.params, 'objectScale', 0.1, 10, 0.1).name('Grid Scale').onChange(() => this.updateGridScale());
    viewFolder.add(this.params, 'starRadius', 100, 10000, 50).name('Star Radius').onChange(() => this.addStars());
    viewFolder.open();

    const gridFolder = this.gui.addFolder('Grid');
    gridFolder.add(this.params, 'gridSize', 5, 200, 1).name('Grid Size').onChange(() => this.recreateGrid());
    gridFolder.add(this.params, 'pointSize', 0.5, 10, 0.1).name('Point Size').onChange(() => this.updatePointSize());
    gridFolder.open();

    const fieldFolder = this.gui.addFolder('Vector Field');
    const fieldNames = Object.keys(this.vectorFields);
    fieldFolder.add(this.params, 'vectorField', Object.fromEntries(fieldNames.map(k => [k, k]))).name('Formula').onChange(() => this.createGradientLine());
    fieldFolder.add(this.params, 'vectorScale', 0.5, 32, 0.5).name('Vector scale').onChange(() => this.createGradientLine());
    fieldFolder.open();

    const lineFolder = this.gui.addFolder('Gradient Line');
    lineFolder.addColor(this.params, 'lineStartColor').name('Start Color').onChange(() => this.updateGradientLineColors());
    lineFolder.addColor(this.params, 'lineEndColor').name('End Color').onChange(() => this.updateGradientLineColors());
    lineFolder.open();

    const particlesFolder = this.gui.addFolder('Particles');
    particlesFolder.add(this.params, 'particleStartPosition', 1, 200, 1).name('Start distance').onChange(() => this.updateParticleStartPosition());
    particlesFolder.add(this.params, 'particleFieldSpeed', 1, 200, 1).name('Field speed');

    const actionsFolder = this.gui.addFolder('Actions');
    actionsFolder.add(this.params, 'reset').name('🔄 Reset');
  }

  setupKeyboardControls() {
    this.fieldVisible = true;
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'r') {
        this.reset();
      } else if (key === 'h') {
        this.fieldVisible = !this.fieldVisible;
        if (this.gridPoints) this.gridPoints.visible = this.fieldVisible;
        if (this.gradientLine) this.gradientLine.visible = this.fieldVisible;
      }
    });
  }

  /**
   * Returns the current vector field function: (x, y, z) => THREE.Vector3.
   * Use setVectorField(name) or params.vectorField to switch formulas.
   */
  getVectorField() {
    const name = this.params.vectorField;
    const field = this.vectorFields[name];
    return typeof field === 'function' ? field : this.vectorFields['Constant +X'];
  }

  /**
   * Switch the active vector field by name. Rebuilds vectors if the field changes.
   */
  setVectorField(name) {
    if (this.vectorFields[name] !== undefined) {
      this.params.vectorField = name;
      this.createGradientLine();
    }
  }

  /**
   * Register a custom vector field formula. fn(x, y, z) should return a THREE.Vector3.
   * Call createGradientLine() after registering if you want to use the new field.
   */
  registerVectorField(name, fn) {
    if (typeof fn === 'function') {
      this.vectorFields[name] = fn;
    }
  }

  /**
   * Convert CSS rgb(r,g,b) string to THREE.Color (0–1).
   */
  rgbStringToColor(rgbString) {
    const parts = rgbString.replace('rgb(', '').replace(')', '').replace(/\s/g, '').split(',');
    return new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255);
  }

  /**
   * Field/cube extent in local space: ±FIELD_HALF on each axis (cube size = 200).
   */
  static get FIELD_HALF() {
    return 100;
  }

  /**
   * Particle start position in world space for the intro animation.
   * Uses the left face of the cube (x = -FIELD_HALF): center of that face, then outward
   * along the face normal (-1, 0, 0) by particleStartPosition (in field-local units).
   * Result is converted to world space using objectScale.
   */
  getParticleStartPositionWorld() {
    const half = App.FIELD_HALF;
    const d = this.params.particleStartPosition;
    const scale = this.params.objectScale;
    return new THREE.Vector3(
      -(half + d) * scale,
      0,
      0
    );
  }

  /**
   * Center of the left face of the field cube in world space.
   */
  getParticleLeftFaceCenterWorld() {
    const scale = this.params.objectScale;
    return new THREE.Vector3(-App.FIELD_HALF * scale, 0, 0);
  }

  /**
   * Returns a random color (full saturation).
   */
  getRandomBrightColor() {
    const color = new THREE.Color();
    color.setHSL(Math.random(), 1, 0.5);
    return color;
  }

  /**
   * Random position inside the field (cube) in world space.
   * Used when intro completes so particles start field motion away from the origin (avoids zero-magnitude at origin).
   */
  getRandomPositionInFieldWorld() {
    const h = App.FIELD_HALF;
    const scale = this.params.objectScale;
    const lx = -h + Math.random() * (2 * h);
    const ly = -h + Math.random() * (2 * h);
    const lz = -h + Math.random() * (2 * h);
    return new THREE.Vector3(lx * scale, ly * scale, lz * scale);
  }

  static get MAX_PARTICLES() {
    return 10000;
  }

  static get PARTICLE_INTRO_DURATION() {
    return 8;
  }

  /**
   * Create the particle system (max 10,000 particles). One particle spawns per second.
   */
  createParticleStartPoint() {
    if (this.particleStartPoint) {
      this.scene.remove(this.particleStartPoint);
      this.particleStartPoint.geometry.dispose();
      this.particleStartPoint.material.dispose();
      this.particleStartPoint = null;
    }
    this.leftBehindTrails.forEach((line) => {
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });
    this.leftBehindTrails = [];
    this.particles.forEach((p) => {
      const line = p.dispose();
      if (line) {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      }
    });
    this.particles = [];
    const n = App.MAX_PARTICLES;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 12,
      sizeAttenuation: true,
      vertexColors: true
    });
    this.particleStartPoint = new THREE.Points(geometry, material);
    this.scene.add(this.particleStartPoint);
    this.particleSpawnAccumulator = 0;
  }

  /**
   * Spawn one particle at the start position and begin its intro.
   */
  spawnParticle() {
    if (this.particles.length >= App.MAX_PARTICLES) return;
    const start = this.getParticleStartPositionWorld();
    const color = this.getRandomBrightColor();
    this.particles.push(new Particle(start, color));
  }

  /**
   * Remove particle at index i (dispose its trail, swap with last, pop).
   */
  removeParticle(i) {
    const n = this.particles.length;
    if (i < 0 || i >= n) return;
    const line = this.particles[i].dispose();
    if (line) this.leftBehindTrails.push(line);
    if (i < n - 1) {
      this.particles[i] = this.particles[n - 1];
    }
    this.particles.pop();
  }

  /**
   * Sync particle positions and colors to the Points geometry buffers.
   */
  syncParticlesToBuffers() {
    const n = this.particles.length;
    const posAttr = this.particleStartPoint?.geometry?.attributes?.position;
    const colAttr = this.particleStartPoint?.geometry?.attributes?.color;
    if (!posAttr || !colAttr) return;
    const posArr = posAttr.array;
    const colArr = colAttr.array;
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      const j = i * 3;
      posArr[j] = p.position.x;
      posArr[j + 1] = p.position.y;
      posArr[j + 2] = p.position.z;
      colArr[j] = p.color.r;
      colArr[j + 1] = p.color.g;
      colArr[j + 2] = p.color.b;
    }
    this.particleStartPoint.geometry.setDrawRange(0, n);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  /**
   * Check if a point in field-local space is inside the cube [-FIELD_HALF, FIELD_HALF].
   */
  isInsideField(lx, ly, lz) {
    const h = App.FIELD_HALF;
    return lx >= -h && lx <= h && ly >= -h && ly <= h && lz >= -h && lz <= h;
  }

  /**
   * Update all particles: spawn at 1/sec, run intro/field, remove if exited. Sync to Points mesh.
   */
  updateParticleIntro(delta) {
    if (!this.particleStartPoint?.geometry?.attributes?.position) return;

    this.particleSpawnAccumulator += delta;
    while (this.particleSpawnAccumulator >= 0.5 && this.particles.length < App.MAX_PARTICLES) {
      this.spawnParticle();
      this.particleSpawnAccumulator -= 0.5;
    }

    const ctx = {
      introDuration: App.PARTICLE_INTRO_DURATION,
      start: this.getParticleStartPositionWorld(),
      endFace: this.getParticleLeftFaceCenterWorld(),
      scale: this.params.objectScale,
      fieldSpeed: this.params.particleFieldSpeed,
      field: this.getVectorField(),
      isInsideField: (lx, ly, lz) => this.isInsideField(lx, ly, lz),
      getRandomPositionInFieldWorld: () => this.getRandomPositionInFieldWorld(),
      scene: this.scene
    };

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const remove = this.particles[i].update(delta, ctx);
      if (remove) this.removeParticle(i);
    }

    this.syncParticlesToBuffers();
  }

  /**
   * Sync particle positions with params (e.g. after Grid Scale or Start distance change).
   * Particles still animating are updated by updateParticleIntro; finished ones move to new face center.
   */
  /**
   * Sync particle positions when params change. Intro particles use current start/end each frame.
   * Field particles (t >= 1) are driven by the field and are not moved here.
   */
  updateParticleStartPosition() {
    if (!this.particleStartPoint?.geometry?.attributes?.position) return;
  }

  /**
   * Create a wireframe cube matching the visible vector field bounds.
   * Same extent as the grid: ±100 on each axis in local space, then scaled by objectScale.
   * Edges only, no faces.
   */
  createBoundaryCube() {
    if (this.boundaryCube) {
      this.scene.remove(this.boundaryCube);
      this.boundaryCube.geometry.dispose();
      this.boundaryCube.material.dispose();
      this.boundaryCube = null;
    }
    const size = 200; // grid runs -100..100 on each axis
    const boxGeom = new THREE.BoxGeometry(size, size, size);
    const edgesGeom = new THREE.EdgesGeometry(boxGeom);
    boxGeom.dispose();
    const material = new THREE.LineBasicMaterial({
      color: 0x6688aa,
      transparent: true,
      opacity: 0.7
    });
    this.boundaryCube = new THREE.LineSegments(edgesGeom, material);
    this.boundaryCube.scale.setScalar(this.params.objectScale);
    this.scene.add(this.boundaryCube);
  }

  /**
   * Create a vector at every grid point. Each segment starts at the grid point and
   * extends in the direction (and magnitude) given by the current vector field formula,
   * scaled by vectorScale. The field is sampled at the specified grid density.
   */
  createGradientLine() {
    if (this.gradientLine) {
      this.scene.remove(this.gradientLine);
      this.gradientLine.geometry.dispose();
      this.gradientLine.material.dispose();
      this.gradientLine = null;
    }

    const n = this.params.gridSize;
    const spacing = 200 / (n - 1 || 1);
    const half = (n - 1) * spacing * 0.5;
    const scale = this.params.vectorScale;
    const cStart = new THREE.Color(this.params.lineStartColor);
    const cEnd = new THREE.Color(this.params.lineEndColor);
    const field = this.getVectorField();

    const positions = [];
    const colors = [];

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          const x = i * spacing - half;
          const y = j * spacing - half;
          const z = k * spacing - half;
          const vec = field(x, y, z);
          const ex = x + vec.x * scale;
          const ey = y + vec.y * scale;
          const ez = z + vec.z * scale;
          positions.push(x, y, z, ex, ey, ez);
          colors.push(cStart.r, cStart.g, cStart.b, cEnd.r, cEnd.g, cEnd.b);
        }
      }
    }

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);

    const material = new LineMaterial({
      vertexColors: true,
      linewidth: 1,
      worldUnits: false,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
    });

    this.gradientLine = new LineSegments2(geometry, material);
    this.gradientLine.scale.setScalar(this.params.objectScale);
    this.scene.add(this.gradientLine);
  }

  updateGradientLineColors() {
    const geom = this.gradientLine?.geometry;
    const colorAttr = geom?.attributes?.instanceColorStart;
    if (!colorAttr?.data) return;
    const cStart = new THREE.Color(this.params.lineStartColor);
    const cEnd = new THREE.Color(this.params.lineEndColor);
    const colors = colorAttr.data.array;
    for (let i = 0; i < colors.length; i += 6) {
      colors[i] = cStart.r;
      colors[i + 1] = cStart.g;
      colors[i + 2] = cStart.b;
      colors[i + 3] = cEnd.r;
      colors[i + 4] = cEnd.g;
      colors[i + 5] = cEnd.b;
    }
    colorAttr.data.needsUpdate = true;
  }

  /**
   * Create a 3D grid of points (n × n × n in x, y, z) with PointsMaterial.
   */
  createGrid() {
    if (this.gridPoints) {
      this.scene.remove(this.gridPoints);
      this.gridPoints.geometry.dispose();
      this.gridPoints.material.dispose();
      this.gridPoints = null;
    }

    const n = this.params.gridSize;
    const spacing = 200 / (n - 1 || 1);
    const half = (n - 1) * spacing * 0.5;
    const positions = [];
    const colors = [];

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          const x = i * spacing - half;
          const y = j * spacing - half;
          const z = k * spacing - half;
          positions.push(x, y, z);
          const tx = (i / (n - 1 || 1));
          const ty = (j / (n - 1 || 1));
          const tz = (k / (n - 1 || 1));
          const t = (tx + ty + tz) / 3;
          const rgbString = d3.interpolateYlGnBu(t);
          const color = this.rgbStringToColor(rgbString);
          colors.push(color.r, color.g, color.b);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: this.params.pointSize,
      vertexColors: true,
      sizeAttenuation: true
    });

    this.gridPoints = new THREE.Points(geometry, material);
    this.gridPoints.userData.baseScale = 1;
    this.gridPoints.scale.setScalar(this.params.objectScale);
    this.scene.add(this.gridPoints);
    this.frameGridInView();
  }

  recreateGrid() {
    this.createGrid();
    this.createGradientLine();
  }

  updatePointSize() {
    if (this.gridPoints && this.gridPoints.material) {
      this.gridPoints.material.size = this.params.pointSize;
    }
  }

  updateGridScale() {
    if (this.gridPoints) {
      this.gridPoints.scale.setScalar(this.params.objectScale);
    }
    if (this.gradientLine) {
      this.gradientLine.scale.setScalar(this.params.objectScale);
    }
    if (this.boundaryCube) {
      this.boundaryCube.scale.setScalar(this.params.objectScale);
    }
    this.updateParticleStartPosition();
  }

  /**
   * Frame the grid in the viewport.
   */
  frameGridInView() {
    if (!this.gridPoints) return;
    const box = new THREE.Box3().setFromObject(this.gridPoints);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect;
    const fitVertical = size.y / (2 * Math.tan(fovRad / 2));
    const fitHorizontal = size.x / (2 * Math.tan(fovRad / 2) * aspect);
    const distance = Math.max(fitVertical, fitHorizontal, 1e-6) * 1.6;
    center.y -= size.y * 0.15;
    this.controls.target.copy(center);
    const direction = new THREE.Vector3(0, 0.2, 1).normalize();
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.params.starRadius = this.camera.position.length();
    this.addStars();
  }

  reset() {
    this.params.objectScale = 4;
    this.params.gridSize = 12;
    this.params.pointSize = 3;
    this.params.vectorField = 'Constant +X';
    this.params.vectorScale = 8;
    this.params.lineStartColor = '#ff0080';
    this.params.lineEndColor = '#00c0ff';
    this.params.particleStartPosition = 250;
    this.params.particleFieldSpeed = 30;
    this.createGrid();
    this.createBoundaryCube();
    this.createParticleStartPoint();
    this.createGradientLine();
    if (this.gridPoints) this.gridPoints.visible = this.fieldVisible;
    if (this.gradientLine) this.gradientLine.visible = this.fieldVisible;
    this.gui.controllersRecursive().forEach(c => c.updateDisplay());
  }

  updateCamera() {
    this.controls.enabled = true;
  }

  updateFPS(time) {
    // FPS tracking (display removed)
    this.frameCount++;
    if (time - this.lastFpsUpdate >= 1000) {
      this.frameCount = 0;
      this.lastFpsUpdate = time;
    }
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.gradientLine?.material?.resolution) {
      this.gradientLine.material.resolution.set(width, height);
    }
  }

  animate() {
    requestAnimationFrame((time) => {
      this.animate();
      this.updateFPS(time);
    });

    const delta = this.clock.getDelta();
    this.updateParticleIntro(delta);
    this.updateCamera();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Start the application
new App();

