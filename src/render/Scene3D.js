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
    this.spaceBackground = spaceBackground;
    if (THREE.Color && !options.transparentBackground) this.scene.background = new THREE.Color(options.backgroundColor ?? (spaceBackground ? 0x000000 : 0xdff2ff));
    this.camera = new PerspectiveCamera(options.fov ?? 55, width / height, options.near ?? 0.1, options.far ?? 1000);
    this.renderer = options.renderer ?? new WebGLRenderer({ antialias: options.antialias ?? true, alpha: Boolean(options.transparentBackground) });
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
      const clearColor = options.backgroundColor ?? (spaceBackground ? 0x000000 : 0xdff2ff);
      this.renderer.setClearColor(clearColor, options.transparentBackground ? 0 : 1);
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
      // Presentation-only floor grid. It is deliberately much larger than the
      // camera's useful area and fades continuously toward the perimeter, so
      // no visible square edge acts as a container for the simulation.
      this.grid = new THREE.GridHelper(60, 120, 0xa9cbe2, 0xc9dfef);
      this.grid.name = 'presentation-grid';
      this.grid.position.y = 0.015;
      this.grid.material.transparent = true;
      this.grid.material.opacity = 0.34;
      this.grid.material.depthWrite = false;
      this._gridBaseColors = this.grid.geometry.getAttribute('color')?.array
        ? Array.from(this.grid.geometry.getAttribute('color').array)
        : null;

      if (typeof this.grid.material.onBeforeCompile === 'function') {
        this.grid.material.onBeforeCompile = shader => {
          shader.vertexShader = shader.vertexShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vGridWorldPosition;'
            )
            .replace(
              '#include <project_vertex>',
              'vGridWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>'
            );

          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vGridWorldPosition;'
            )
            .replace(
              'vec4 diffuseColor = vec4( diffuse, opacity );',
              'float gridDistance = length(vGridWorldPosition.xz);\nfloat gridFade = clamp((28.0 - gridDistance) / 11.0, 0.0, 1.0);\nvec4 diffuseColor = vec4( diffuse, opacity * gridFade );'
            );
        };
        this.grid.material.needsUpdate = true;
      }

      this.scene.add(this.grid);
    }

    if (options.gridDarkMode) this.setGridDarkMode(true);

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
      this.axesOverlay = new AxesOverlay({ three: THREE, document: options.document ?? globalThis.document, contrast: spaceBackground });
      this.vectorsOverlay = new PhysicsVectorsOverlay({ three: THREE, document: options.document ?? globalThis.document, contrast: spaceBackground });
      this.scene.add(this.axesOverlay.object, this.vectorsOverlay.object);
      if (options.labelContrast !== undefined && Boolean(options.labelContrast) !== spaceBackground) {
        this.setOverlayLabelContrast(Boolean(options.labelContrast));
      }
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


  setGridDarkMode(dark) {
    if (!this.grid) return;
    const colorAttribute = this.grid.geometry?.getAttribute?.('color');
    if (!colorAttribute || !this._gridBaseColors) return;

    // In dark mode the platform grid should remain readable against the blue
    // simulation background without becoming a high-contrast visual focus.
    // Keep the light theme untouched and only mute the grid presentation.
    const factor = dark ? 0.42 : 1;
    for (let i = 0; i < colorAttribute.array.length; i++) {
      colorAttribute.array[i] = this._gridBaseColors[i] * factor;
    }
    colorAttribute.needsUpdate = true;
    this.grid.material.opacity = dark ? 0.26 : 0.34;
  }

  setOverlayLabelContrast(contrast) {
    this._assertNotDisposed();
    this.axesOverlay?.setContrast?.(contrast);
    this.vectorsOverlay?.setContrast?.(contrast);
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
