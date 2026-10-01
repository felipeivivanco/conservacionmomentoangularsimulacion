/**
 * Three.js scene infrastructure. It owns presentation objects only.
 * `scenario: 1` shows the circular platform; `scenario: 2` hides it.
 */
import { PersonVisual } from './PersonVisual.js';
import { WheelVisual } from './WheelVisual.js';
import { PlatformVisual } from './PlatformVisual.js';
import { AxesOverlay } from './AxesOverlay.js';
import { PhysicsVectorsOverlay } from './PhysicsVectorsOverlay.js';

class Scene3D {
  constructor(options = {}) {
    if (options === null || typeof options !== 'object') throw new TypeError('options must be an object');
    const THREE = options.three;
    if (!THREE || typeof THREE !== 'object') throw new TypeError('options.three must be the Three.js module');
    const { Scene, PerspectiveCamera, WebGLRenderer } = THREE;
    if ([Scene, PerspectiveCamera, WebGLRenderer].some(type => typeof type !== 'function')) {
      throw new TypeError('options.three does not provide the required Three.js constructors');
    }

    const width = options.width ?? 800;
    const height = options.height ?? 600;
    this._validateDimension(width, 'width');
    this._validateDimension(height, 'height');
    if (width === 0 || height === 0) throw new RangeError('width and height must be greater than zero');

    this.scene = new Scene();
    const spaceBackground = Boolean(options.spaceBackground);
    if (THREE.Color) this.scene.background = new THREE.Color(options.backgroundColor ?? (spaceBackground ? 0x000000 : 0xdff2ff));
    this.camera = new PerspectiveCamera(options.fov ?? 55, width / height, options.near ?? 0.1, options.far ?? 1000);
    this.renderer = options.renderer ?? new WebGLRenderer({ antialias: options.antialias ?? true });
    if (!this.renderer || typeof this.renderer.setSize !== 'function' || typeof this.renderer.render !== 'function') {
      throw new TypeError('renderer must provide setSize() and render()');
    }

    this.width = width;
    this.height = height;
    this.disposed = false;
    this.renderer.setSize(width, height);
    if (typeof this.renderer.setPixelRatio === 'function') {
      const pixelRatio = Number.isFinite(options.pixelRatio) && options.pixelRatio > 0
        ? options.pixelRatio
        : (typeof globalThis !== 'undefined' && Number.isFinite(globalThis.devicePixelRatio) ? globalThis.devicePixelRatio : 1);
      this.renderer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)));
    }
    if (typeof this.renderer.setClearColor === 'function') {
      this.renderer.setClearColor(options.backgroundColor ?? (spaceBackground ? 0x000000 : 0xdff2ff), 1);
    }
    this.person = null;
    this.wheel = null;
    this.platform = null;
    this.axesOverlay = null;
    this.vectorsOverlay = null;
    this.scenario = 2;
    this.starField = null;
    this.grid = null;

    if (!spaceBackground && typeof THREE.GridHelper === 'function') {
      this.grid = new THREE.GridHelper(12, 24, 0xa9cbe2, 0xc9dfef);
      this.grid.name = 'presentation-grid';
      this.grid.position.y = 0.015;
      this.grid.material.transparent = true;
      this.grid.material.opacity = 0.38;
      this.scene.add(this.grid);
    }

    if (options.person) {
      this.person = options.person instanceof PersonVisual ? options.person : new PersonVisual({ three: THREE, ...(typeof options.person === 'object' ? options.person : {}) });
      this.scene.add(this.person.object);
    }
    if (options.wheel) {
      this.wheel = options.wheel instanceof WheelVisual ? options.wheel : new WheelVisual({ three: THREE, ...(typeof options.wheel === 'object' ? options.wheel : {}) });
      this.scene.add(this.wheel.object);
    }
    if (spaceBackground && typeof THREE.Points === 'function' && typeof THREE.PointsMaterial === 'function' &&
        typeof THREE.BufferGeometry === 'function' && typeof THREE.Float32BufferAttribute === 'function') {
      this.starField = this._createStarField(THREE, options.starCount ?? 700, options.starSpread ?? 28);
      this.scene.add(this.starField);
    }

    if (typeof THREE.ArrowHelper === 'function' && typeof THREE.Vector3 === 'function') {
      this.axesOverlay = new AxesOverlay({ three: THREE, document: options.document ?? globalThis.document });
      this.vectorsOverlay = new PhysicsVectorsOverlay({ three: THREE, document: options.document ?? globalThis.document, contrast: spaceBackground });
      this.scene.add(this.axesOverlay.object, this.vectorsOverlay.object);
    }

    if (options.platform !== false) {
      this.platform = options.platform instanceof PlatformVisual ? options.platform : new PlatformVisual({ three: THREE, ...(typeof options.platform === 'object' ? options.platform : {}) });
      this.scene.add(this.platform.object);
    }
    this.setScenario(options.scenario ?? 1);
  }


  _createStarField(THREE, count, spread) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    // Deterministic low-cost pseudo-random distribution; stars are presentation
    // only and never enter the physics state.
    let seed = 0x13579bdf;
    const next = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let i = 0; i < count; i += 1) {
      positions[3 * i] = (next() - 0.5) * spread;
      positions[3 * i + 1] = (next() - 0.5) * spread;
      positions[3 * i + 2] = (next() - 0.5) * spread;
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, sizeAttenuation: true });
    const points = new THREE.Points(geometry, material);
    points.name = 'space-stars';
    return points;
  }

  setScenario(scenario) {
    if (this.disposed) throw new Error('Scene3D is disposed');
    if (scenario !== 1 && scenario !== 2) throw new RangeError('scenario must be 1 or 2');
    this.scenario = scenario;
    if (this.platform) this.platform.setVisible(scenario === 1);
  }

  resize(width, height) {
    this._assertNotDisposed();
    this._validateDimension(width, 'width');
    this._validateDimension(height, 'height');
    if (width === 0 || height === 0) throw new RangeError('width and height must be greater than zero');
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    if (typeof this.camera.updateProjectionMatrix === 'function') this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }


  setOverlayVisible(name, visible) {
    this._assertNotDisposed();
    if (name === 'axes') this.axesOverlay?.setVisible(visible);
    else if (name === 'vectors') this.vectorsOverlay?.setVisible(visible);
    else throw new RangeError(`unknown overlay: ${name}`);
  }

  updatePhysicsOverlays(physicsState, visualState) {
    this._assertNotDisposed();
    this.axesOverlay?.update(physicsState, visualState);
    this.vectorsOverlay?.update(physicsState, visualState);
  }

  render() {
    this._assertNotDisposed();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    if (this.person?.dispose) this.person.dispose();
    if (this.wheel?.dispose) this.wheel.dispose();
    if (this.platform?.dispose) this.platform.dispose();
    if (this.starField) {
      this.starField.geometry?.dispose?.();
      this.starField.material?.dispose?.();
    }
    if (this.grid) {
      this.grid.geometry?.dispose?.();
      this.grid.material?.dispose?.();
    }
    if (this.axesOverlay?.dispose) this.axesOverlay.dispose();
    if (this.vectorsOverlay?.dispose) this.vectorsOverlay.dispose();
    if (this.renderer.dispose) this.renderer.dispose();
    this.disposed = true;
  }

  _assertNotDisposed() {
    if (this.disposed) throw new Error('Scene3D is disposed');
  }

  _validateDimension(value, name) {
    if (!(Number.isFinite(value) && value >= 0)) throw new TypeError(`${name} must be finite and >= 0`);
  }
}

export { Scene3D };
export default Scene3D;
