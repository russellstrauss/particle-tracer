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

/**
 * Deterministic seeded RNG (mulberry32). Used for all emission randomness so the
 * demo is reproducible: same seed => same particle stream. "Structured randomness".
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How often (seconds) a trail point is appended. */
const TRAIL_UPDATE_INTERVAL = 0.08;
/** Hard cap on trail points per particle (buffer size). GUI trailLength <= this. */
const MAX_TRAIL_POINTS = 240;
/** Particles older than this are recycled (prevents permanent capture in attractors). */
const MAX_PARTICLE_AGE = 40;

/**
 * Single wind-tunnel particle.
 *
 * Key idea vs. naive scatter: the particle is BORN OUTSIDE the field at the
 * emitter plane with a horizontal entry velocity. While outside, it flies
 * ballistically; once inside, its velocity relaxes toward the field vector
 * (exponential approach controlled by `coupling`). The lag between velocity
 * and field is what makes the integration visible, and the fading trail
 * records where it has been.
 */
class Particle {
  constructor(position, velocity, color, trailMax) {
    this.position = position.clone();
    this.velocity = velocity.clone();
    this.color = color.clone();
    this.age = 0;
    this.trailMax = Math.min(trailMax, MAX_TRAIL_POINTS);
    this.trailCount = 0;
    this.trailAccum = 0;
    this.line = null;
    this.linePositions = new Float32Array(MAX_TRAIL_POINTS * 3);
    this.lineColors = new Float32Array(MAX_TRAIL_POINTS * 3);
  }

  createLine(scene, visible) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.lineColors, 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.line = new THREE.Line(geometry, material);
    this.line.visible = visible;
    this.line.frustumCulled = false;
    // Seed with current position (needs 2 points to render, so duplicate).
    this.pushTrailPoint(true);
    this.pushTrailPoint(true);
    scene.add(this.line);
  }

  /** Rewrite the whole trail color gradient: dim tail -> bright head. */
  refreshTrailColors() {
    const n = this.trailCount;
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 1 : i / (n - 1); // 0 = oldest, 1 = newest
      const f = 0.08 + 0.92 * t * t;
      const j = i * 3;
      this.lineColors[j] = this.color.r * f;
      this.lineColors[j + 1] = this.color.g * f;
      this.lineColors[j + 2] = this.color.b * f;
    }
    if (this.line) this.line.geometry.attributes.color.needsUpdate = true;
  }

  pushTrailPoint(force = false) {
    const p = this.position;
    if (!force && this.trailCount >= this.trailMax) {
      // Sliding window: drop oldest point.
      this.linePositions.copyWithin(0, 3);
      const j = (this.trailMax - 1) * 3;
      this.linePositions[j] = p.x;
      this.linePositions[j + 1] = p.y;
      this.linePositions[j + 2] = p.z;
      this.refreshTrailColors();
    } else {
      if (this.trailCount >= MAX_TRAIL_POINTS) return;
      const j = this.trailCount * 3;
      this.linePositions[j] = p.x;
      this.linePositions[j + 1] = p.y;
      this.linePositions[j + 2] = p.z;
      this.trailCount++;
      this.refreshTrailColors();
    }
    if (this.line) {
      this.line.geometry.setDrawRange(0, this.trailCount);
      this.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  setTrailLength(n) {
    this.trailMax = Math.min(Math.max(2, Math.round(n)), MAX_TRAIL_POINTS);
    if (this.trailCount > this.trailMax) {
      // Keep the newest points.
      const excess = this.trailCount - this.trailMax;
      this.linePositions.copyWithin(0, excess * 3, this.trailCount * 3);
      this.trailCount = this.trailMax;
      this.refreshTrailColors();
      if (this.line) {
        this.line.geometry.setDrawRange(0, this.trailCount);
        this.line.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  dispose(scene) {
    if (this.line) {
      scene.remove(this.line);
      this.line.geometry.dispose();
      this.line.material.dispose();
      this.line = null;
    }
  }

  /**
   * Advance one frame. Returns 'dead' when the particle left the domain or
   * expired, otherwise 'alive'.
   * ctx: { field, scale, fieldSpeed, coupling, cursorForce, half, killMargin, trailInterval }
   */
  update(delta, ctx) {
    this.age += delta;
    const { field, scale, fieldSpeed, coupling, cursorForce, half } = ctx;

    const lx = this.position.x / scale;
    const ly = this.position.y / scale;
    const lz = this.position.z / scale;
    const inside =
      lx >= -half && lx <= half && ly >= -half && ly <= half && lz >= -half && lz <= half;

    if (inside) {
      // Relax velocity toward the field vector (visible inertia / lag).
      const target = field(lx, ly, lz).multiplyScalar(fieldSpeed * scale);
      // Guard against NaN from normalize-at-origin fields.
      if (!Number.isFinite(target.x + target.y + target.z)) target.set(0, 0, 0);
      // Clamp absurd magnitudes from 1/r-style fields so particles stay visible.
      const maxV = 400 * scale;
      if (target.length() > maxV) target.setLength(maxV);
      const alpha = 1 - Math.exp(-coupling * delta);
      this.velocity.lerp(target, alpha);

      // Optional interactive cursor force (drag with right mouse button).
      if (cursorForce && cursorForce.active) {
        const c = cursorForce.center; // world space
        const dx = this.position.x - c.x;
        const dy = this.position.y - c.y;
        const dz = this.position.z - c.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-3;
        const radius = Math.max(1, cursorForce.radius * scale);
        if (dist < radius * 3) {
          const fall = Math.exp(-(dist * dist) / (radius * radius));
          const s = cursorForce.strength * scale * fall * delta;
          if (cursorForce.mode === 'Attractor') {
            this.velocity.x -= (dx / dist) * s * 8;
            this.velocity.y -= (dy / dist) * s * 8;
            this.velocity.z -= (dz / dist) * s * 8;
          } else if (cursorForce.mode === 'Repeller') {
            this.velocity.x += (dx / dist) * s * 8;
            this.velocity.y += (dy / dist) * s * 8;
            this.velocity.z += (dz / dist) * s * 8;
          } else {
            // Vortex: swirl around Y through the cursor point + slight inward pull.
            this.velocity.x += (-dz / dist) * s * 10 - (dx / dist) * s * 2;
            this.velocity.z += (dx / dist) * s * 10 - (dz / dist) * s * 2;
          }
        }
      }
    }
    // Outside the cube: ballistic flight (emitter -> field entry, or field -> exit).

    this.position.x += this.velocity.x * delta;
    this.position.y += this.velocity.y * delta;
    this.position.z += this.velocity.z * delta;

    this.trailAccum += delta;
    if (this.trailAccum >= TRAIL_UPDATE_INTERVAL) {
      this.trailAccum = 0;
      this.pushTrailPoint();
    }

    // Kill when far outside the extended domain or when too old.
    const m = ctx.killMargin;
    const px = this.position.x / scale;
    const py = this.position.y / scale;
    const pz = this.position.z / scale;
    if (
      this.age > MAX_PARTICLE_AGE ||
      px > half + m || px < -half - m * 2 ||
      py > half + m || py < -half - m ||
      pz > half + m || pz < -half - m
    ) {
      return 'dead';
    }
    return 'alive';
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
      vectorField: 'Vortex (speed ∝ 1/r)',
      vectorScale: 8,
      lineStartColor: '#3a5a78',
      lineEndColor: '#7fb3d5',

      // Wind-tunnel emission (the core of the demo format)
      emissionMode: 'Stream',
      particleCount: 240,
      emitRate: 70,
      entrySpeed: 26,
      emitterWidth: 130,
      emitterDepth: 130,
      emitterGap: 36,
      velocityJitter: 3.5,
      coupling: 1.4,
      particleFieldSpeed: 30,

      // Trails
      trailLength: 90,
      showTrails: true,
      headSize: 11,

      // Burst mode
      burstInterval: 3.0,
      burstCount: 90,
      burstRadius: 42,

      // Probe + cursor force
      showEmitter: true,
      cursorForceMode: 'Vortex',
      cursorForceStrength: 26,
      cursorForceRadius: 46,

      // Reproducibility
      seed: 1337,

      reset: () => this.reset(),
      reseed: () => this.reseed()
    };

    this.clock = new THREE.Clock();
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.particles = [];
    this.rng = mulberry32(this.params.seed);
    this.emitAccum = 0;
    this.burstAccum = 0;

    this.cursorForce = {
      active: false,
      center: new THREE.Vector3(0, 0, 0),
      strength: this.params.cursorForceStrength,
      radius: this.params.cursorForceRadius,
      mode: this.params.cursorForceMode
    };

    this.init();
    this.setupLighting();
    this.addStars();
    this.setupGUI();
    this.setupKeyboardControls();
    this.setupPointerControls();
    this.createGrid();
    this.createBoundaryCube();
    this.createPickProxy();
    this.createParticleHeads();
    this.createGradientLine();
    this.createEmitterViz();
    this.createCursorViz();
    this.setMessage(this.describeMode());
    this.animate();
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('black');

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
    // Right-drag is reserved for the interactive cursor force (see setupPointerControls).
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: -1
    };

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
    this.gui = new GUI({ title: '⟨ WIND TUNNEL ⟩' });

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

    // --- Wind-tunnel emission ---
    const emitFolder = this.gui.addFolder('Emission (wind tunnel)');
    emitFolder.add(this.params, 'emissionMode', ['Stream', 'Burst', 'Stream + Burst', 'Probe (click)']).name('Injection mode').onChange(() => this.onEmissionModeChange());
    emitFolder.add(this.params, 'particleCount', 10, 800, 1).name('Max particles');
    emitFolder.add(this.params, 'emitRate', 1, 300, 1).name('Emit rate /s');
    emitFolder.add(this.params, 'entrySpeed', 1, 120, 1).name('Entry speed');
    emitFolder.add(this.params, 'emitterWidth', 4, 200, 1).name('Nozzle width (Y)').onChange(() => this.createEmitterViz());
    emitFolder.add(this.params, 'emitterDepth', 4, 200, 1).name('Nozzle depth (Z)').onChange(() => this.createEmitterViz());
    emitFolder.add(this.params, 'emitterGap', 4, 120, 1).name('Emitter gap').onChange(() => this.createEmitterViz());
    emitFolder.add(this.params, 'velocityJitter', 0, 20, 0.1).name('Velocity jitter');
    emitFolder.add(this.params, 'coupling', 0.1, 8, 0.05).name('Field coupling');
    emitFolder.add(this.params, 'particleFieldSpeed', 1, 200, 1).name('Field speed');
    emitFolder.add(this.params, 'showEmitter').name('Show emitter').onChange(() => this.updateEmitterVisibility());
    emitFolder.open();

    const trailFolder = this.gui.addFolder('Particles & Trails');
    trailFolder.add(this.params, 'trailLength', 2, MAX_TRAIL_POINTS, 1).name('Trail length').onChange(() => this.updateTrailLengths());
    trailFolder.add(this.params, 'showTrails').name('Show trails').onChange(() => this.updateTrailVisibility());
    trailFolder.add(this.params, 'headSize', 1, 30, 0.5).name('Head size').onChange(() => this.updateHeadSize());
    trailFolder.add(this.params, 'burstInterval', 0.5, 10, 0.1).name('Burst every (s)');
    trailFolder.add(this.params, 'burstCount', 4, 300, 1).name('Burst count');
    trailFolder.add(this.params, 'burstRadius', 4, 120, 1).name('Burst radius');
    trailFolder.open();

    const cursorFolder = this.gui.addFolder('Cursor force (right-drag)');
    cursorFolder.add(this.params, 'cursorForceMode', ['Vortex', 'Attractor', 'Repeller']).name('Force mode').onChange(() => { this.cursorForce.mode = this.params.cursorForceMode; });
    cursorFolder.add(this.params, 'cursorForceStrength', 1, 100, 1).name('Strength').onChange(() => { this.cursorForce.strength = this.params.cursorForceStrength; });
    cursorFolder.add(this.params, 'cursorForceRadius', 8, 120, 1).name('Radius').onChange(() => { this.cursorForce.radius = this.params.cursorForceRadius; this.updateCursorViz(); });
    cursorFolder.open();

    const seedFolder = this.gui.addFolder('Reproducibility');
    seedFolder.add(this.params, 'seed', 1, 99999, 1).name('Seed').onChange(() => this.reseed());
    seedFolder.add(this.params, 'reseed').name('🎲 Reseed + clear');
    seedFolder.open();

    const lineFolder = this.gui.addFolder('Field colors');
    lineFolder.addColor(this.params, 'lineStartColor').name('Start Color').onChange(() => this.updateGradientLineColors());
    lineFolder.addColor(this.params, 'lineEndColor').name('End Color').onChange(() => this.updateGradientLineColors());
    lineFolder.open();

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
      } else if (key === 't') {
        this.params.showTrails = !this.params.showTrails;
        this.updateTrailVisibility();
        this.gui.controllersRecursive().forEach(c => c.updateDisplay());
      } else if (key === 'e') {
        this.params.showEmitter = !this.params.showEmitter;
        this.updateEmitterVisibility();
        this.gui.controllersRecursive().forEach(c => c.updateDisplay());
      } else if (key === 'b') {
        this.fireBurst();
      }
    });
  }

  /**
   * Pointer controls:
   * - Left click (no drag) in Probe mode: launch a probe particle at the clicked point.
   * - Right-drag: temporary cursor force (vortex / attractor / repeller) inside the field.
   * Left-drag orbit is preserved.
   */
  setupPointerControls() {
    const el = this.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();
    this.downPos = null;
    this.downButton = 0;
    this.forceDragging = false;

    // Right-click drag would open the context menu; suppress it on the canvas.
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('pointerdown', (e) => {
      this.downPos = { x: e.clientX, y: e.clientY, onCanvas: true };
      this.downButton = e.button;
      if (e.button === 2) {
        // Note: OrbitControls is configured with RIGHT: -1 (no-op), so the
        // camera is unaffected and controls stay enabled throughout the drag.
        // There is deliberately no controls.enabled=false here: if the
        // matching pointerup were ever missed, that would wedge rotation off.
        this.forceDragging = true;
        this.moveCursorForce(e);
        this.cursorForce.active = true;
        this.updateCursorViz();
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (this.forceDragging) this.moveCursorForce(e);
    });

    // A single window-level pointerup (releases on- or off-canvas end the
    // force drag; canvas releases bubble up here exactly once).
    // pointercancel/blur are also handled: a force drag must never get stuck on.
    const endForceDrag = () => {
      if (!this.forceDragging) return;
      this.forceDragging = false;
      this.cursorForce.active = false;
      this.updateCursorViz();
      this.downPos = null;
    };
    window.addEventListener('pointerup', (e) => {
      if (this.forceDragging && e.button === 2) {
        endForceDrag();
      } else if (e.button === 0) {
        const moved = this.downPos
          ? Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y)
          : 99;
        // Only treat it as a probe click if the press started on the canvas.
        if (moved < 6 && this.downPos?.onCanvas && this.params.emissionMode === 'Probe (click)') {
          this.spawnProbeAtPointer(e);
        }
        this.downPos = null;
      }
    });
    window.addEventListener('pointercancel', endForceDrag);
    window.addEventListener('blur', endForceDrag);
  }

  setPointerNdc(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  moveCursorForce(e) {
    this.setPointerNdc(e);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    // Intersect the y=0 plane through the field center; fall back to a camera-facing plane.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let ok = this.raycaster.ray.intersectPlane(plane, hit);
    if (!ok) {
      const n = new THREE.Vector3();
      this.camera.getWorldDirection(n);
      const fallback = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, 0, 0));
      ok = this.raycaster.ray.intersectPlane(fallback, hit);
    }
    if (ok) {
      const scale = this.params.objectScale;
      const h = App.FIELD_HALF * scale;
      hit.x = THREE.MathUtils.clamp(hit.x, -h, h);
      hit.y = THREE.MathUtils.clamp(hit.y, -h, h);
      hit.z = THREE.MathUtils.clamp(hit.z, -h, h);
      this.cursorForce.center.copy(hit);
      this.updateCursorViz();
    }
  }

  spawnProbeAtPointer(e) {
    this.setPointerNdc(e);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.pickProxy, false);
    let point;
    if (hits.length > 0) {
      point = hits[0].point.clone();
    } else {
      // Clicked outside the cube: project onto the left face center plane instead.
      const scale = this.params.objectScale;
      point = new THREE.Vector3(-App.FIELD_HALF * scale, 0, 0);
    }
    this.spawnProbe(point);
    this.setMessage(`Probe launched at (${point.x.toFixed(0)}, ${point.y.toFixed(0)}, ${point.z.toFixed(0)})`);
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
   * World X of the emitter plane (outside the left face of the cube).
   */
  getEmitterXWorld() {
    const scale = this.params.objectScale;
    return -(App.FIELD_HALF + this.params.emitterGap) * scale;
  }

  /**
   * Random color (full saturation). Uses the seeded RNG for reproducibility.
   */
  getSeededBrightColor() {
    const color = new THREE.Color();
    color.setHSL(this.rng(), 1, 0.55);
    return color;
  }

  /** Clear all live particles and their trails. Keeps heads buffer allocated. */
  clearParticles() {
    this.particles.forEach((p) => p.dispose(this.scene));
    this.particles = [];
    this.emitAccum = 0;
    this.burstAccum = 0;
    this.syncParticlesToBuffers();
  }

  reseed() {
    this.rng = mulberry32(Math.round(this.params.seed));
    this.clearParticles();
    this.setMessage(`Seed ${Math.round(this.params.seed)} — stream restarted deterministically`);
  }

  onEmissionModeChange() {
    this.clearParticles();
    this.setMessage(this.describeMode());
  }

  describeMode() {
    switch (this.params.emissionMode) {
      case 'Stream':
        return 'Stream mode — particles enter from the left nozzle and the field bends them';
      case 'Burst':
        return 'Burst mode — press B or wait for a ring release, watch the field deform it';
      case 'Stream + Burst':
        return 'Stream + Burst — continuous flow with periodic ring bursts';
      default:
        return 'Probe mode — click anywhere inside the cube to launch a particle';
    }
  }

  setMessage(text) {
    const el = document.getElementById('message');
    if (el) {
      el.textContent = text;
      el.classList.add('visible');
    }
  }

  /**
   * Spawn one stream particle at the emitter plane with a horizontal entry
   * velocity. Y/Z are drawn from the seeded RNG across the nozzle aperture,
   * and emission times are staggered by the emit-rate scheduler — so neighbors
   * trace different trajectories instead of all doing the same thing.
   */
  spawnStreamParticle() {
    if (this.particles.length >= this.params.particleCount) return;
    const scale = this.params.objectScale;
    const y = (this.rng() - 0.5) * this.params.emitterWidth * scale;
    const z = (this.rng() - 0.5) * this.params.emitterDepth * scale;
    const pos = new THREE.Vector3(this.getEmitterXWorld(), y, z);
    const j = this.params.velocityJitter * scale;
    const vel = new THREE.Vector3(
      this.params.entrySpeed * scale,
      (this.rng() - 0.5) * 2 * j,
      (this.rng() - 0.5) * 2 * j
    );
    const p = new Particle(pos, vel, this.getSeededBrightColor(), this.params.trailLength);
    p.createLine(this.scene, this.params.showTrails);
    this.particles.push(p);
  }

  /**
   * Burst mode: release a ring of particles around the field center and watch
   * the field deform it. Great for vortices, attractors, shear.
   */
  fireBurst() {
    const scale = this.params.objectScale;
    const n = Math.min(
      Math.round(this.params.burstCount),
      Math.max(0, this.params.particleCount - this.particles.length)
    );
    if (n <= 0) return;
    const radius = this.params.burstRadius * scale;
    const baseAngle = this.rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = baseAngle + (i / n) * Math.PI * 2;
      const wobble = (this.rng() - 0.5) * 6 * scale;
      const pos = new THREE.Vector3(
        Math.cos(a) * radius,
        wobble,
        Math.sin(a) * radius
      );
      // Gentle tangential + outward push so the ring starts coherent, then deforms.
      const vel = new THREE.Vector3(
        -Math.sin(a) * 6 * scale + Math.cos(a) * 3 * scale,
        (this.rng() - 0.5) * 2 * scale,
        Math.cos(a) * 6 * scale + Math.sin(a) * 3 * scale
      );
      const p = new Particle(pos, vel, this.getSeededBrightColor(), this.params.trailLength);
      p.createLine(this.scene, this.params.showTrails);
      this.particles.push(p);
    }
  }

  /** Probe mode: launch one particle from the clicked point, initially at rest. */
  spawnProbe(point) {
    if (this.particles.length >= Math.max(this.params.particleCount, 1)) {
      // Make room: recycle the oldest particle.
      const oldest = this.particles.shift();
      if (oldest) oldest.dispose(this.scene);
    }
    const startVel = new THREE.Vector3(this.params.entrySpeed * this.params.objectScale * 0.25, 0, 0);
    const p = new Particle(point, startVel, this.getSeededBrightColor(), this.params.trailLength);
    p.createLine(this.scene, this.params.showTrails);
    this.particles.push(p);
  }

  /**
   * Create the particle head Points cloud (bright heads; trails are per-particle Lines).
   */
  createParticleHeads() {
    if (this.particleHeads) {
      this.scene.remove(this.particleHeads);
      this.particleHeads.geometry.dispose();
      this.particleHeads.material.dispose();
      this.particleHeads = null;
    }
    this.particles.forEach((p) => p.dispose(this.scene));
    this.particles = [];
    const n = 800; // buffer capacity; active count governed by params.particleCount
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: this.params.headSize,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.particleHeads = new THREE.Points(geometry, material);
    this.particleHeads.frustumCulled = false;
    this.scene.add(this.particleHeads);
    this.emitAccum = 0;
    this.burstAccum = 0;
  }

  /**
   * Remove particle at index i (dispose its trail line, swap with last, pop).
   */
  removeParticle(i) {
    const n = this.particles.length;
    if (i < 0 || i >= n) return;
    this.particles[i].dispose(this.scene);
    if (i < n - 1) {
      this.particles[i] = this.particles[n - 1];
    }
    this.particles.pop();
  }

  /**
   * Sync particle head positions and colors to the Points geometry buffers.
   */
  syncParticlesToBuffers() {
    const n = this.particles.length;
    const posAttr = this.particleHeads?.geometry?.attributes?.position;
    const colAttr = this.particleHeads?.geometry?.attributes?.color;
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
    this.particleHeads.geometry.setDrawRange(0, n);
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
   * Per-frame particle driver: staggered emission per the injection mode,
   * velocity-relaxation integration, recycle-on-exit, buffer sync.
   */
  updateParticles(delta) {
    if (!this.particleHeads?.geometry?.attributes?.position) return;
    const mode = this.params.emissionMode;

    // Trim excess if the user lowered Max particles.
    while (this.particles.length > this.params.particleCount) {
      this.removeParticle(this.particles.length - 1);
    }

    if (mode === 'Stream' || mode === 'Stream + Burst') {
      this.emitAccum += delta * this.params.emitRate;
      let guard = 0;
      while (this.emitAccum >= 1 && this.particles.length < this.params.particleCount && guard < 40) {
        this.spawnStreamParticle();
        this.emitAccum -= 1;
        guard++;
      }
      if (this.emitAccum > 8) this.emitAccum = 8; // don't backlog a burst after stalls
    }

    if (mode === 'Burst' || mode === 'Stream + Burst') {
      this.burstAccum += delta;
      if (this.burstAccum >= this.params.burstInterval) {
        this.burstAccum = 0;
        this.fireBurst();
      }
    }

    const ctx = {
      field: this.getVectorField(),
      scale: this.params.objectScale,
      fieldSpeed: this.params.particleFieldSpeed,
      coupling: this.params.coupling,
      cursorForce: this.cursorForce,
      half: App.FIELD_HALF,
      killMargin: 60
    };

    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i].update(delta, ctx) === 'dead') this.removeParticle(i);
    }

    this.syncParticlesToBuffers();
  }

  updateTrailLengths() {
    this.particles.forEach((p) => p.setTrailLength(this.params.trailLength));
  }

  updateTrailVisibility() {
    this.particles.forEach((p) => {
      if (p.line) p.line.visible = this.params.showTrails;
    });
  }

  updateHeadSize() {
    if (this.particleHeads) this.particleHeads.material.size = this.params.headSize;
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

  /** Invisible box used to raycast probe clicks to an exact 3D point in the field. */
  createPickProxy() {
    if (this.pickProxy) {
      this.scene.remove(this.pickProxy);
      this.pickProxy.geometry.dispose();
      this.pickProxy = null;
    }
    const size = 200;
    const geom = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    this.pickProxy = new THREE.Mesh(geom, mat);
    this.pickProxy.scale.setScalar(this.params.objectScale);
    this.scene.add(this.pickProxy);
  }

  /**
   * Emitter visualization: a source plane outside the cube + aperture outline
   * on the left face + streaks showing the +X entry direction. Makes the
   * "particles enter the field here" idea explicit.
   */
  createEmitterViz() {
    if (this.emitterGroup) {
      this.scene.remove(this.emitterGroup);
      this.emitterGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose?.();
      });
      this.emitterGroup = null;
    }
    const scale = this.params.objectScale;
    const half = App.FIELD_HALF * scale;
    const group = new THREE.Group();
    const ex = this.getEmitterXWorld();
    const w = this.params.emitterWidth * scale;
    const d = this.params.emitterDepth * scale;

    // Source plane (translucent cyan).
    const planeGeom = new THREE.PlaneGeometry(d, w);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false
    });
    const plane = new THREE.Mesh(planeGeom, planeMat);
    plane.rotation.y = Math.PI / 2;
    plane.position.set(ex, 0, 0);
    group.add(plane);

    // Source frame (bright outline).
    const frameGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ex, -w / 2, -d / 2),
      new THREE.Vector3(ex, w / 2, -d / 2),
      new THREE.Vector3(ex, w / 2, d / 2),
      new THREE.Vector3(ex, -w / 2, d / 2),
      new THREE.Vector3(ex, -w / 2, -d / 2)
    ]);
    group.add(new THREE.Line(frameGeom, new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9 })));

    // Aperture outline on the entry (left) face — same size as the nozzle.
    const faceGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, -w / 2, -d / 2),
      new THREE.Vector3(-half, w / 2, -d / 2),
      new THREE.Vector3(-half, w / 2, d / 2),
      new THREE.Vector3(-half, -w / 2, d / 2),
      new THREE.Vector3(-half, -w / 2, -d / 2)
    ]);
    group.add(new THREE.Line(faceGeom, new THREE.LineBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.8 })));

    // Entry streaks: emitter plane -> entry face at a few aperture rows.
    const streakMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.28 });
    const rows = [-0.4, -0.2, 0, 0.2, 0.4];
    rows.forEach((f) => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ex, f * w, 0),
        new THREE.Vector3(-half, f * w, 0)
      ]);
      group.add(new THREE.Line(g, streakMat));
    });

    group.visible = this.params.showEmitter;
    this.emitterGroup = group;
    this.scene.add(group);
  }

  updateEmitterVisibility() {
    if (this.emitterGroup) this.emitterGroup.visible = this.params.showEmitter;
  }

  /** Ring + dot marking the interactive cursor force while right-dragging. */
  createCursorViz() {
    if (this.cursorViz) {
      this.scene.remove(this.cursorViz);
      this.cursorViz.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose?.();
      });
      this.cursorViz = null;
    }
    const group = new THREE.Group();
    const ringGeom = new THREE.TorusGeometry(1, 0.03, 8, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const dotGeom = new THREE.SphereGeometry(0.06, 12, 12);
    const dot = new THREE.Mesh(dotGeom, new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
    group.add(dot);
    group.visible = false;
    this.cursorViz = group;
    this.cursorRing = ring;
    this.scene.add(group);
    this.updateCursorViz();
  }

  updateCursorViz() {
    if (!this.cursorViz) return;
    const r = Math.max(1, this.cursorForce.radius * this.params.objectScale);
    this.cursorViz.position.copy(this.cursorForce.center);
    if (this.cursorRing) this.cursorRing.scale.setScalar(r);
    this.cursorViz.visible = this.cursorForce.active;
  }

  /**
   * Create a vector at every grid point. Each segment starts at the grid point and
   * extends in the direction (and magnitude) given by the current vector field formula,
   * scaled by vectorScale. The field is sampled at the specified grid density.
   * Kept subtle (muted colors) so it reads as layer 1 under the bright particles.
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
      transparent: true,
      opacity: 0.55,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
    });

    this.gradientLine = new LineSegments2(geometry, material);
    this.gradientLine.scale.setScalar(this.params.objectScale);
    this.gradientLine.visible = this.fieldVisible !== false;
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
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5
    });

    this.gridPoints = new THREE.Points(geometry, material);
    this.gridPoints.userData.baseScale = 1;
    this.gridPoints.scale.setScalar(this.params.objectScale);
    this.gridPoints.visible = this.fieldVisible !== false;
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
    if (this.pickProxy) {
      this.pickProxy.scale.setScalar(this.params.objectScale);
    }
    this.createEmitterViz();
    this.updateCursorViz();
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
    this.params.vectorField = 'Vortex (speed ∝ 1/r)';
    this.params.vectorScale = 8;
    this.params.lineStartColor = '#3a5a78';
    this.params.lineEndColor = '#7fb3d5';
    this.params.emissionMode = 'Stream';
    this.params.particleCount = 240;
    this.params.emitRate = 70;
    this.params.entrySpeed = 26;
    this.params.emitterWidth = 130;
    this.params.emitterDepth = 130;
    this.params.emitterGap = 36;
    this.params.velocityJitter = 3.5;
    this.params.coupling = 1.4;
    this.params.particleFieldSpeed = 30;
    this.params.trailLength = 90;
    this.params.showTrails = true;
    this.params.headSize = 11;
    this.params.burstInterval = 3.0;
    this.params.burstCount = 90;
    this.params.burstRadius = 42;
    this.params.showEmitter = true;
    this.params.cursorForceMode = 'Vortex';
    this.params.cursorForceStrength = 26;
    this.params.cursorForceRadius = 46;
    this.params.seed = 1337;
    this.cursorForce.mode = 'Vortex';
    this.cursorForce.strength = 26;
    this.cursorForce.radius = 46;
    this.cursorForce.active = false;
    this.rng = mulberry32(1337);
    this.createGrid();
    this.createBoundaryCube();
    this.createPickProxy();
    this.createParticleHeads();
    this.createGradientLine();
    this.createEmitterViz();
    this.updateCursorViz();
    if (this.gridPoints) this.gridPoints.visible = this.fieldVisible;
    if (this.gradientLine) this.gradientLine.visible = this.fieldVisible;
    this.gui.controllersRecursive().forEach(c => c.updateDisplay());
    this.setMessage(this.describeMode());
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

    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.updateParticles(delta);
    this.updateCamera();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Start the application (exposed for console debugging / automated smoke tests)
window.flowApp = new App();
