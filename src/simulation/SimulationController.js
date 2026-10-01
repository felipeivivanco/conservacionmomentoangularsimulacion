class SimulationController {
  constructor({ engine, timeScale = 1, maxRealDelta = 0.1 } = {}) {
    if (!engine || typeof engine.step !== 'function' || typeof engine.getPhysicsDt !== 'function') {
      throw new Error('engine must expose step() and getPhysicsDt()');
    }
    if (!(Number.isFinite(timeScale) && timeScale >= 0)) throw new Error('timeScale must be finite and >= 0');
    if (!(Number.isFinite(maxRealDelta) && maxRealDelta > 0)) throw new Error('maxRealDelta must be finite and > 0');
    this.engine = engine;
    this.physicsDt = engine.getPhysicsDt();
    this.timeScale = timeScale;
    this.maxRealDelta = maxRealDelta;
    this.status = 'stopped';
    this.accumulator = 0;
    this.steps = 0;
  }

  start() { if (this.status === 'stopped') this.status = 'running'; return this.getState(); }
  pause() { if (this.status === 'running') this.status = 'paused'; return this.getState(); }
  resume() { if (this.status === 'paused') this.status = 'running'; return this.getState(); }
  stop() { this.status = 'stopped'; this.accumulator = 0; return this.getState(); }

  reset() {
    this.engine.reset();
    this.status = 'stopped';
    this.accumulator = 0;
    this.steps = 0;
    return this.getState();
  }

  setTimeScale(timeScale) {
    if (!(Number.isFinite(timeScale) && timeScale >= 0)) throw new Error('timeScale must be finite and >= 0');
    this.timeScale = timeScale;
    return this.getState();
  }

  advance(realDelta) {
    if (this.status !== 'running') return { steps: 0, clamped: false, ...this.getState() };
    if (!(Number.isFinite(realDelta) && realDelta >= 0)) return { steps: 0, clamped: false, ...this.getState() };
    const usedDelta = Math.min(realDelta, this.maxRealDelta);
    const clamped = realDelta > this.maxRealDelta;
    this.accumulator += usedDelta * this.timeScale;
    let steps = 0;
    while (this.accumulator + 1e-15 >= this.physicsDt) {
      this.engine.step(this.physicsDt);
      this.accumulator -= this.physicsDt;
      steps += 1;
      this.steps += 1;
    }
    return { steps, clamped, ...this.getState() };
  }

  getState() {
    return {
      status: this.status,
      timeScale: this.timeScale,
      physicsDt: this.physicsDt,
      accumulator: this.accumulator,
      steps: this.steps,
      physics: this.engine.getState()
    };
  }
}

export { SimulationController };
export default SimulationController;
