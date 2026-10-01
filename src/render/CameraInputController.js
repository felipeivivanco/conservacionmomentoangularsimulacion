/**
 * Pointer/wheel presentation input for an OrbitalCameraController.
 *
 * This class owns only DOM-style event listeners and camera input. It never
 * touches simulation state or simulation timing.
 */
class CameraInputController {
  constructor({ element, cameraController, onCameraChange } = {}) {
    if (!element || typeof element.addEventListener !== 'function' || typeof element.removeEventListener !== 'function') {
      throw new TypeError('element must provide addEventListener() and removeEventListener()');
    }
    if (!cameraController || typeof cameraController.orbit !== 'function' || typeof cameraController.zoom !== 'function') {
      throw new TypeError('cameraController must expose orbit() and zoom()');
    }

    this.element = element;
    this.cameraController = cameraController;
    if (onCameraChange !== undefined && typeof onCameraChange !== 'function') throw new TypeError('onCameraChange must be a function when provided');
    this.onCameraChange = onCameraChange ?? null;
    this.dragging = false;
    this.pointerId = null;
    this.lastX = 0;
    this.lastY = 0;
    this.attached = false;

    this._onPointerDown = event => this._handlePointerDown(event);
    this._onPointerMove = event => this._handlePointerMove(event);
    this._onPointerUp = event => this._handlePointerUp(event);
    this._onWheel = event => this._handleWheel(event);

    this.attach();
  }

  attach() {
    if (this.attached) return;
    this.element.addEventListener('pointerdown', this._onPointerDown);
    this.element.addEventListener('pointermove', this._onPointerMove);
    this.element.addEventListener('pointerup', this._onPointerUp);
    this.element.addEventListener('pointercancel', this._onPointerUp);
    this.element.addEventListener('wheel', this._onWheel, { passive: false });
    this.attached = true;
  }

  detach() {
    if (!this.attached) return;
    this.element.removeEventListener('pointerdown', this._onPointerDown);
    this.element.removeEventListener('pointermove', this._onPointerMove);
    this.element.removeEventListener('pointerup', this._onPointerUp);
    this.element.removeEventListener('pointercancel', this._onPointerUp);
    this.element.removeEventListener('wheel', this._onWheel, { passive: false });
    this.dragging = false;
    this.pointerId = null;
    this.attached = false;
  }

  dispose() {
    this.detach();
  }

  _handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (this.dragging) return;
    this.dragging = true;
    this.pointerId = event.pointerId ?? null;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (typeof this.element.setPointerCapture === 'function' && this.pointerId !== null) {
      try { this.element.setPointerCapture(this.pointerId); } catch { /* capture is optional */ }
    }
  }

  _handlePointerMove(event) {
    if (!this.dragging) return;
    if (this.pointerId !== null && event.pointerId !== undefined && event.pointerId !== this.pointerId) return;
    const x = event.clientX;
    const y = event.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.cameraController.orbit(x - this.lastX, y - this.lastY);
    this.onCameraChange?.();
    this.lastX = x;
    this.lastY = y;
  }

  _handlePointerUp(event) {
    if (this.pointerId !== null && event.pointerId !== undefined && event.pointerId !== this.pointerId) return;
    if (typeof this.element.releasePointerCapture === 'function' && this.pointerId !== null) {
      try { this.element.releasePointerCapture(this.pointerId); } catch { /* capture is optional */ }
    }
    this.dragging = false;
    this.pointerId = null;
  }

  _handleWheel(event) {
    if (Number.isFinite(event.deltaY)) {
      this.cameraController.zoom(event.deltaY);
      this.onCameraChange?.();
      if (typeof event.preventDefault === 'function') event.preventDefault();
    }
  }
}

export { CameraInputController };
export default CameraInputController;
