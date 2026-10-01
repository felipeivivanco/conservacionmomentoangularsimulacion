/**
 * Presentation-only orbital camera controller.
 *
 * This class changes only the camera transform. It has no knowledge of the
 * simulation, physics state, or temporal controller.
 */
class OrbitalCameraController {
  constructor(options = {}) {
    if (options === null || typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }
    const { camera } = options;
    if (!camera || !camera.position) {
      throw new TypeError('camera must expose a position');
    }

    this.camera = camera;
    this.target = this._readVector(options.target ?? { x: 0, y: 0, z: 0 }, 'target');
    this.distance = this._finitePositive(options.distance ?? 6, 'distance');
    this.minDistance = this._finitePositive(options.minDistance ?? 1.5, 'minDistance');
    this.maxDistance = this._finitePositive(options.maxDistance ?? 30, 'maxDistance');
    if (this.minDistance > this.maxDistance) {
      throw new RangeError('minDistance must be <= maxDistance');
    }
    this.distance = this._clamp(this.distance, this.minDistance, this.maxDistance);

    this.azimuth = Number.isFinite(options.azimuth) ? options.azimuth : 0;
    this.pitch = Number.isFinite(options.pitch) ? options.pitch : 0.35;
    this.pitchLimit = options.pitchLimit ?? (Math.PI / 2 - 0.01);
    if (!(Number.isFinite(this.pitchLimit) && this.pitchLimit > 0 && this.pitchLimit < Math.PI / 2)) {
      throw new RangeError('pitchLimit must be finite and between 0 and PI/2');
    }
    this.pitch = this._clamp(this.pitch, -this.pitchLimit, this.pitchLimit);

    this.rotateSensitivity = this._finitePositive(options.rotateSensitivity ?? 0.005, 'rotateSensitivity');
    this.zoomSensitivity = this._finitePositive(options.zoomSensitivity ?? 0.001, 'zoomSensitivity');
    this.disposed = false;
    this.update();
  }

  orbit(deltaX, deltaY) {
    this._assertActive();
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      throw new TypeError('orbit deltas must be finite');
    }
    this.azimuth -= deltaX * this.rotateSensitivity;
    this.pitch = this._clamp(
      this.pitch - deltaY * this.rotateSensitivity,
      -this.pitchLimit,
      this.pitchLimit
    );
    this.update();
  }

  zoom(wheelDeltaY) {
    this._assertActive();
    if (!Number.isFinite(wheelDeltaY)) {
      throw new TypeError('wheel delta must be finite');
    }
    const scale = Math.exp(wheelDeltaY * this.zoomSensitivity);
    this.distance = this._clamp(this.distance * scale, this.minDistance, this.maxDistance);
    this.update();
  }

  setTarget(target) {
    this._assertActive();
    this.target = this._readVector(target, 'target');
    this.update();
  }

  setDistance(distance) {
    this._assertActive();
    this.distance = this._clamp(this._finitePositive(distance, 'distance'), this.minDistance, this.maxDistance);
    this.update();
  }

  resize(width, height) {
    this._assertActive();
    if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
      throw new TypeError('width and height must be finite and greater than zero');
    }
    this.camera.aspect = width / height;
    if (typeof this.camera.updateProjectionMatrix === 'function') {
      this.camera.updateProjectionMatrix();
    }
  }

  update() {
    this._assertActive();
    const cosPitch = Math.cos(this.pitch);
    const x = this.target.x + this.distance * cosPitch * Math.sin(this.azimuth);
    const y = this.target.y + this.distance * Math.sin(this.pitch);
    const z = this.target.z + this.distance * cosPitch * Math.cos(this.azimuth);

    if (typeof this.camera.position.set === 'function') {
      this.camera.position.set(x, y, z);
    } else {
      this.camera.position.x = x;
      this.camera.position.y = y;
      this.camera.position.z = z;
    }

    if (typeof this.camera.lookAt === 'function') {
      this.camera.lookAt(this.target.x, this.target.y, this.target.z);
    }
  }

  getState() {
    this._assertActive();
    return {
      target: { ...this.target },
      distance: this.distance,
      azimuth: this.azimuth,
      pitch: this.pitch,
      minDistance: this.minDistance,
      maxDistance: this.maxDistance
    };
  }

  dispose() {
    this.disposed = true;
  }

  _assertActive() {
    if (this.disposed) throw new Error('OrbitalCameraController is disposed');
  }

  _readVector(value, name) {
    if (!value || typeof value !== 'object' ||
        !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
      throw new TypeError(`${name} must contain finite x, y, z`);
    }
    return { x: value.x, y: value.y, z: value.z };
  }

  _finitePositive(value, name) {
    if (!(Number.isFinite(value) && value > 0)) {
      throw new TypeError(`${name} must be finite and greater than zero`);
    }
    return value;
  }

  _clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
}

export { OrbitalCameraController };
export default OrbitalCameraController;
