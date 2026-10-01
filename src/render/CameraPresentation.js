import { OrbitalCameraController } from './OrbitalCameraController.js';
import { CameraInputController } from './CameraInputController.js';

/**
 * Small presentation-only composition layer that binds an existing Scene3D
 * camera to pointer/wheel input. It does not own rendering or simulation time.
 */
class CameraPresentation {
  constructor({ scene, element, camera = {}, input = {}, onCameraChange } = {}) {
    if (!scene || !scene.camera) {
      throw new TypeError('scene must expose a camera');
    }
    if (!element) {
      throw new TypeError('element is required');
    }

    this.scene = scene;
    if (onCameraChange !== undefined && typeof onCameraChange !== 'function') throw new TypeError('onCameraChange must be a function when provided');
    this.onCameraChange = onCameraChange ?? (() => this.scene.render?.());
    this.cameraController = new OrbitalCameraController({
      camera: scene.camera,
      ...camera
    });
    this.input = new CameraInputController({
      element,
      cameraController: this.cameraController,
      ...input,
      onCameraChange: this.onCameraChange
    });
    this.disposed = false;
  }

  resize(width, height) {
    this._assertActive();
    if (typeof this.scene.resize !== 'function') {
      throw new TypeError('scene must expose resize()');
    }
    this.scene.resize(width, height);
  }

  getState() {
    this._assertActive();
    return this.cameraController.getState();
  }

  dispose() {
    if (this.disposed) return;
    this.input.dispose();
    this.cameraController.dispose();
    this.disposed = true;
  }

  _assertActive() {
    if (this.disposed) throw new Error('CameraPresentation is disposed');
  }
}

export { CameraPresentation };
export default CameraPresentation;
