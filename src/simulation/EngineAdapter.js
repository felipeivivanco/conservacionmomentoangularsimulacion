import { createParams, validateParams, AngularMomentumEngine } from '../index.js';

const MODES = new Set(['Free', 'VerticalBearing']);

function clone(value) {
  return structuredClone(value);
}

function normalizeMode(mode) {
  if (!MODES.has(mode)) throw new Error(`Invalid mode: ${mode}`);
  return mode;
}

class EngineAdapter {
  constructor({ mode = 'Free', params = createParams(), theta0 = Math.PI / 2, Omega0 = [0, 0, 0] } = {}) {
    this._config = {
      mode: normalizeMode(mode),
      params: createParams(params),
      theta0,
      Omega0: [...Omega0],
      includeHuman: params.includeHuman !== false
    };
    validateParams(this._config.params);
    this._engine = new AngularMomentumEngine(this._config);
  }

  static create(options = {}) {
    return new EngineAdapter(options);
  }

  getPhysicsDt() {
    return this._config.params.dt;
  }

  step(dt) {
    if (!(Number.isFinite(dt) && dt >= 0)) throw new Error('dt must be finite and >= 0');
    if (dt === 0) return this.getState();
    const physicsDt = this.getPhysicsDt();
    if (Math.abs(dt - physicsDt) > Math.max(1e-15, physicsDt * 1e-12)) {
      throw new Error(`dt must equal physicsDt (${physicsDt})`);
    }
    this._engine.step(physicsDt);
    return this.getState();
  }

  reset({ theta0 = this._config.theta0, Omega0 = this._config.Omega0 } = {}) {
    this._config.theta0 = theta0;
    this._config.Omega0 = [...Omega0];
    this._engine.reset(theta0, Omega0);
    return this.getState();
  }

  getState() {
    return clone(this._engine.snapshot());
  }

  setThetaTarget(thetaTarget) {
    if (!(Number.isFinite(thetaTarget))) throw new TypeError('thetaTarget must be finite');
    const clamped = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, thetaTarget));
    this._engine.setTarget(clamped);
    return this.getState();
  }

  setInitialSpin(s0) {
    if (!(Number.isFinite(s0))) throw new TypeError('s0 must be finite');
    const nextParams = createParams({ ...this._config.params, s0, includeHuman: this._config.includeHuman });
    validateParams(nextParams);
    this._config.params = nextParams;
    this._config.includeHuman = nextParams.includeHuman !== false;
    this._engine = new AngularMomentumEngine(this._config);
    return this.getState();
  }

  setLifecycleStatus(status) {
    if (!['stopped','running','paused'].includes(status)) throw new RangeError('status must be stopped, running or paused');
    return this._engine.setLifecycleStatus(status);
  }

  setSpinRate(spinRate) {
    if (!Number.isFinite(spinRate)) throw new TypeError('spinRate must be finite');
    const state = this._engine.setSpinRate(spinRate);
    this._config.params = createParams({ ...this._config.params, s0: state.params.s0, Ia: state.params.Ia, D: state.params.D });
    return state;
  }

  setWheelInertia(Ia) {
    if (!(Number.isFinite(Ia) && Ia > 0)) throw new TypeError('Ia must be > 0');
    const state = this._engine.setWheelInertia(Ia);
    this._config.params = createParams({ ...this._config.params, Ia: state.params.Ia, D: state.params.D, s0: state.params.s0 });
    return state;
  }

  setWheelMass(m_w) {
    if (!(Number.isFinite(m_w) && m_w > 0)) throw new TypeError('m_w must be > 0');
    const state = this._engine.setWheelMass(m_w);
    this._config.params = createParams({ ...this._config.params, m_w: state.params.m_w, Ia: state.params.Ia, D: state.params.D, s0: state.params.s0, includeHuman: state.params.includeHuman });
    return state;
  }

  setWheelDiameter(D) {
    if (!(Number.isFinite(D) && D > 0)) throw new TypeError('D must be > 0');
    const state = this._engine.setWheelDiameter(D);
    this._config.params = createParams({ ...this._config.params, D: state.params.D, Ia: state.params.Ia, s0: state.params.s0, includeHuman: state.params.includeHuman });
    return state;
  }

  setIncludeHuman(includeHuman) {
    if (typeof includeHuman !== 'boolean') throw new TypeError('includeHuman must be boolean');
    const state = this._engine.setIncludeHuman(includeHuman);
    this._config.includeHuman = includeHuman;
    this._config.params = createParams({ ...this._config.params, includeHuman });
    return state;
  }

  getParameters() {
    return clone(this._engine.getParameters());
  }

  setMode(mode) {
    const nextMode = normalizeMode(mode);
    if (nextMode === this._config.mode) return this.getState();
    this._config.mode = nextMode;
    this._engine = new AngularMomentumEngine(this._config);
    return this.getState();
  }

  setParams(params) {
    const nextParams = createParams(params);
    validateParams(nextParams);
    this._config.params = nextParams;
    this._config.includeHuman = nextParams.includeHuman !== false;
    this._engine = new AngularMomentumEngine(this._config);
    return this.getState();
  }
}

export { EngineAdapter };
export default EngineAdapter;
