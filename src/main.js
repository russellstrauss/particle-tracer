import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as d3 from 'd3-scale-chromatic';
import GUI from 'lil-gui';

class App {
  constructor() {
    this.params = {
      objectScale: 4,
      starRadius: 800,
      pointSize: 3,
      gridSize: 50,
      lineStartColor: '#ff0080',
      lineEndColor: '#00c0ff',
      reset: () => this.reset()
    };

    this.clock = new THREE.Clock();
    this.frameCount = 0;
    this.lastFpsUpdate = 0;

    this.init();
    this.setupLighting();
    this.addStars();
    this.setupGUI();
    this.setupKeyboardControls();
    this.createGrid();
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

    const lineFolder = this.gui.addFolder('Gradient Line');
    lineFolder.addColor(this.params, 'lineStartColor').name('Start Color').onChange(() => this.updateGradientLineColors());
    lineFolder.addColor(this.params, 'lineEndColor').name('End Color').onChange(() => this.updateGradientLineColors());
    lineFolder.open();

    const actionsFolder = this.gui.addFolder('Actions');
    actionsFolder.add(this.params, 'reset').name('🔄 Reset');

    // Hide the controls panel
    this.gui.domElement.style.display = 'none';
  }

  setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'r') {
        this.reset();
      }
    });
  }

  /**
   * Convert CSS rgb(r,g,b) string to THREE.Color (0–1).
   */
  rgbStringToColor(rgbString) {
    const parts = rgbString.replace('rgb(', '').replace(')', '').replace(/\s/g, '').split(',');
    return new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255);
  }

  /**
   * Create a unit-length gradient line at every grid point. Each segment starts at the grid
   * point and extends 1 unit along +X, with start color at the start vertex and end color
   * at the end vertex (interpolated along each segment). Uses LineSegments for one draw call.
   */
  createGradientLine() {
    if (this.gradientLine) {
      this.scene.remove(this.gradientLine);
      this.gradientLine.geometry.dispose();
      this.gradientLine.material.dispose();
      this.gradientLine = null;
    }

    const n = this.params.gridSize;
    const spacing = 100 / (n - 1 || 1);
    const half = (n - 1) * spacing * 0.5;
    const cStart = new THREE.Color(this.params.lineStartColor);
    const cEnd = new THREE.Color(this.params.lineEndColor);

    const positions = [];
    const colors = [];

    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const x = i * spacing - half;
        const z = k * spacing - half;
        // Segment start (grid point) and end (grid point + 1 unit along X)
        positions.push(x, 0, z, x + 1, 0, z);
        colors.push(cStart.r, cStart.g, cStart.b, cEnd.r, cEnd.g, cEnd.b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2
    });

    this.gradientLine = new THREE.LineSegments(geometry, material);
    this.gradientLine.scale.setScalar(this.params.objectScale);
    this.scene.add(this.gradientLine);
  }

  updateGradientLineColors() {
    if (!this.gradientLine || !this.gradientLine.geometry.attributes.color) return;
    const cStart = new THREE.Color(this.params.lineStartColor);
    const cEnd = new THREE.Color(this.params.lineEndColor);
    const colorAttr = this.gradientLine.geometry.attributes.color;
    const colors = colorAttr.array;
    for (let i = 0; i < colors.length; i += 6) {
      colors[i] = cStart.r;
      colors[i + 1] = cStart.g;
      colors[i + 2] = cStart.b;
      colors[i + 3] = cEnd.r;
      colors[i + 4] = cEnd.g;
      colors[i + 5] = cEnd.b;
    }
    colorAttr.needsUpdate = true;
  }

  /**
   * Create a grid of points in the XZ plane (y = 0) with PointsMaterial.
   */
  createGrid() {
    if (this.gridPoints) {
      this.scene.remove(this.gridPoints);
      this.gridPoints.geometry.dispose();
      this.gridPoints.material.dispose();
      this.gridPoints = null;
    }

    const n = this.params.gridSize;
    const spacing = 100 / (n - 1 || 1);
    const half = (n - 1) * spacing * 0.5;
    const positions = [];
    const colors = [];

    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const x = i * spacing - half;
        const z = k * spacing - half;
        positions.push(x, 0, z);
        const tx = (i / (n - 1 || 1));
        const tz = (k / (n - 1 || 1));
        const t = (tx + tz) * 0.5;
        const rgbString = d3.interpolateYlGnBu(t);
        const color = this.rgbStringToColor(rgbString);
        colors.push(color.r, color.g, color.b);
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
    this.params.gridSize = 50;
    this.params.pointSize = 3;
    this.params.lineStartColor = '#ff0080';
    this.params.lineEndColor = '#00c0ff';
    this.createGrid();
    this.createGradientLine();
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
  }

  animate() {
    requestAnimationFrame((time) => {
      this.animate();
      this.updateFPS(time);
    });

    this.updateCamera();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Start the application
new App();

