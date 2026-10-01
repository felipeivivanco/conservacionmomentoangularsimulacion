/**
 * Abstract rendering contract for the simulation.
 *
 * This class deliberately knows nothing about the physics engine or the
 * simulation controller. It receives immutable-by-convention snapshots and
 * keeps only renderer-owned presentation state.
 */
class Renderer {
  constructor(options = {}) {
    if (options === null || typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    const width = options.width ?? 0;
    const height = options.height ?? 0;
    this._validateDimension(width, 'width');
    this._validateDimension(height, 'height');

    this.width = width;
    this.height = height;
    this.disposed = false;
    this._lastSnapshot = null;
  }

  render(state) {
    if (this.disposed) throw new Error('renderer is disposed');
    if (state === null || typeof state !== 'object') {
      throw new TypeError('state must be an object');
    }

    // Keep a renderer-owned copy. No physics is calculated or advanced here.
    this._lastSnapshot = structuredClone(state);
  }

  resize(width, height) {
    if (this.disposed) throw new Error('renderer is disposed');
    this._validateDimension(width, 'width');
    this._validateDimension(height, 'height');
    this.width = width;
    this.height = height;
  }

  dispose() {
    this._lastSnapshot = null;
    this.disposed = true;
  }

  _validateDimension(value, name) {
    if (!(Number.isFinite(value) && value >= 0)) {
      throw new TypeError(`${name} must be finite and >= 0`);
    }
  }
}

export { Renderer };
export default Renderer;
