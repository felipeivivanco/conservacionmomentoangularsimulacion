/**
 * Presentation loop that connects the existing temporal controller to the
 * visual bridge and rendering layers.
 *
 * requestAnimationFrame is used only as a presentation clock. All physical
 * advancement remains inside SimulationController.advance().
 */
class SimulationLoop {
  constructor({ controller, visualAdapter, scene, renderer, requestAnimationFrame, cancelAnimationFrame, onPhysicsState } = {}) {
    if (!controller || typeof controller.advance !== 'function' || typeof controller.start !== 'function' ||
        typeof controller.pause !== 'function' || typeof controller.resume !== 'function' ||
        typeof controller.stop !== 'function' || typeof controller.reset !== 'function' ||
        typeof controller.getState !== 'function') {
      throw new TypeError('controller must expose the SimulationController lifecycle and advance API');
    }
    if (!visualAdapter || typeof visualAdapter.update !== 'function' || typeof visualAdapter.reset !== 'function') {
      throw new TypeError('visualAdapter must expose update() and reset()');
    }
    if (!scene || typeof scene.render !== 'function') {
      throw new TypeError('scene must expose render()');
    }
    if (!renderer || typeof renderer.render !== 'function') {
      throw new TypeError('renderer must expose render()');
    }
    if (typeof requestAnimationFrame !== 'function' || typeof cancelAnimationFrame !== 'function') {
      throw new TypeError('requestAnimationFrame and cancelAnimationFrame must be functions');
    }

    this.controller = controller;
    this.visualAdapter = visualAdapter;
    this.scene = scene;
    this.renderer = renderer;
    this.requestAnimationFrame = requestAnimationFrame;
    this.cancelAnimationFrame = cancelAnimationFrame;
    if (onPhysicsState !== undefined && typeof onPhysicsState !== 'function') {
      throw new TypeError('onPhysicsState must be a function when provided');
    }
    this.onPhysicsState = onPhysicsState ?? null;
    this.running = false;
    this._frameHandle = null;
    this._lastTimestamp = null;
    this._visualState = visualAdapter.getVisualState();
    this._presentationThetaOverride = null;
    this.presentationActive = true;
  }

  start() {
    if (this.running) return this.controller.getState();
    this.controller.start();
    this._presentationThetaOverride = null;
    this.running = true;
    this._lastTimestamp = null;
    this._schedule();
    return this.controller.getState();
  }

  setPresentationActive(active) {
    this.presentationActive = Boolean(active);
    if (!this.presentationActive) this._cancelScheduledFrame();
    else if (this.running && this.controller.getState().status === 'running') this._schedule();
    return this.presentationActive;
  }

  pause() {
    if (!this.running) return this.controller.getState();
    this.controller.pause();
    this._lastTimestamp = null;
    this._cancelScheduledFrame();
    return this.controller.getState();
  }

  resume() {
    if (!this.running) return this.controller.getState();
    this.controller.resume();
    this._presentationThetaOverride = null;
    this._lastTimestamp = null;
    this._schedule();
    return this.controller.getState();
  }

  toggleLifecycle() {
    const status = this.controller.getState().status;
    if (status === 'stopped') this.start();
    else if (status === 'running') this.pause();
    else if (status === 'paused') this.resume();
    return this.controller.getState();
  }

  setPresentationThetaOverride(theta) {
    if (!(Number.isFinite(theta))) throw new TypeError('theta must be finite');
    this._presentationThetaOverride = theta;
    return this.syncCurrentState();
  }

  isPaused() {
    return this.controller.getState().status === 'paused';
  }

  stop() {
    this.controller.stop();
    this._presentationThetaOverride = null;
    this.running = false;
    this._lastTimestamp = null;
    this._cancelScheduledFrame();
  }

  reset() {
    this.controller.reset();
    this.visualAdapter.reset();
    const resetPhysics = this.controller.getState().physics;
    if (this.onPhysicsState) this.onPhysicsState(resetPhysics);
    this._presentationThetaOverride = null;
    // Rebuild presentation from the same reset physics snapshot; reset() only
    // clears presentation accumulators and is not a second source of truth.
    this._visualState = this.visualAdapter.update(resetPhysics);
    if (typeof this.scene.updatePhysicsOverlays === 'function') this.scene.updatePhysicsOverlays(resetPhysics, this._visualState);
    this._applyVisualState();
    this.running = false;
    this._lastTimestamp = null;
    this._cancelScheduledFrame();
  }

  getVisualState() {
    return structuredClone(this._visualState);
  }

  refreshCurrentState({ notifyPhysics = true } = {}) {
    const controllerState = this.controller.getState();
    const physicsState = controllerState.physics;
    if (notifyPhysics && this.onPhysicsState) this.onPhysicsState(physicsState);
    const thetaOverride = controllerState.status === 'paused' && this._presentationThetaOverride !== null
      ? { thetaOverride: this._presentationThetaOverride }
      : undefined;
    this._visualState = this.visualAdapter.update(physicsState, thetaOverride);
    if (typeof this.scene.updatePhysicsOverlays === 'function') {
      this.scene.updatePhysicsOverlays(physicsState, this._visualState);
    }
    this._applyVisualState();
    this.renderer.render(this._visualState);
    this.scene.render();
    return structuredClone(this._visualState);
  }

  syncCurrentState() {
    const controllerState = this.controller.getState();
    const freshRunningState = controllerState.status === 'running' &&
      controllerState.steps === 0 && Math.abs(controllerState.physics.t) <= 1e-15;
    if (controllerState.status === 'running' && !freshRunningState) {
      throw new Error('syncCurrentState() requires a paused/stopped simulation, except for the untouched t=0 state');
    }
    return this.refreshCurrentState();
  }

  _schedule() {
    if (!this.presentationActive || !this.running || this._frameHandle !== null) return;
    this._frameHandle = this.requestAnimationFrame(timestamp => this._onFrame(timestamp));
  }

  _onFrame(timestamp) {
    this._frameHandle = null;
    if (!this.presentationActive || !this.running) return;
    if (!Number.isFinite(timestamp)) {
      this._schedule();
      return;
    }

    // Physics advancement owns the simulation clock. Keep it outside the
    // presentation error boundary: a rendering problem must never roll back
    // or stop the physical simulation.
    let realDelta = 0;
    if (this._lastTimestamp !== null) {
      realDelta = Math.max(0, (timestamp - this._lastTimestamp) / 1000);
    }
    this._lastTimestamp = timestamp;
    this.controller.advance(realDelta);
    const controllerState = this.controller.getState();
    const physicsState = controllerState.physics;

    try {
      if (this.onPhysicsState) this.onPhysicsState(physicsState);
      const thetaOverride = controllerState.status === 'paused' ? this._presentationThetaOverride : null;
      this._visualState = this.visualAdapter.update(physicsState, thetaOverride === null ? undefined : { thetaOverride });
      if (typeof this.scene.updatePhysicsOverlays === 'function') this.scene.updatePhysicsOverlays(physicsState, this._visualState);
      this._applyVisualState();
      this.renderer.render(this._visualState);
      this.scene.render();
    } catch (error) {
      // A presentation-only exception must not terminate requestAnimationFrame.
      // The next frame retries the current physical state. Do not mutate or
      // reset physics here.
      this.lastPresentationError = error;
    } finally {
      if (this.controller.getState().status === 'running') this._schedule();
    }
  }

  _applyVisualState() {
    if (this.scene.person && typeof this.scene.person.setPosition === 'function') {
      this.scene.person.setPosition(this._visualState.personPosition);
    }
    // Apply the body transform before converting the world-space hand anchors
    // into body-local coordinates. Arms are purely geometric: shoulder -> hand.
    if (this.scene.person && typeof this.scene.person.setOrientation === 'function') {
      this.scene.person.setOrientation(this._visualState.personQuaternion);
    }
    if (this.scene.person && this._visualState.gripPositionsLocal) {
      if (typeof this.scene.person.setGripPositionsLocal === 'function') {
        this.scene.person.setGripPositionsLocal(this._visualState.gripPositionsLocal);
      } else if (typeof this.scene.person.setGripPositions === 'function' && this._visualState.gripPositions) {
        this.scene.person.setGripPositions(this._visualState.gripPositions);
      }
    }
    if (this.scene.wheel) {
      if (typeof this.scene.wheel.setOrientation === 'function') {
        this.scene.wheel.setOrientation(this._visualState.wheelQuaternion);
      }
      if (typeof this.scene.wheel.setPosition === 'function') {
        this.scene.wheel.setPosition(this._visualState.wheelPosition);
      }
      if (typeof this.scene.wheel.setDiameter === 'function' && Number.isFinite(this._visualState.wheelDiameter)) {
        this.scene.wheel.setDiameter(this._visualState.wheelDiameter);
      }
      if (typeof this.scene.wheel.setSpinAngle === 'function') {
        this.scene.wheel.setSpinAngle(this._visualState.wheelSpinAngle);
      }
    }
    if (this.scene.platform && typeof this.scene.platform.setSupportShadowPosition === 'function') {
      this.scene.platform.setSupportShadowPosition(this._visualState.personPosition);
    }
  }

  _cancelScheduledFrame() {
    if (this._frameHandle !== null) {
      this.cancelAnimationFrame(this._frameHandle);
      this._frameHandle = null;
    }
  }
}

export { SimulationLoop };
export default SimulationLoop;
