import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { SimulationControls } from '../../src/app/SimulationControls.js';
import { createParams } from '../../src/index.js';

class FakeElement {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.listeners = new Map(); this.value = ''; this.textContent = ''; this.type = ''; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); return item; }
  setAttribute() {}
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  remove() { this.removed = true; }
  emit(type) { this.listeners.get(type)?.(); }
}
class FakeDocument { createElement(tag) { return new FakeElement(tag); } }

function makeControls() {
  const document = new FakeDocument();
  const mount = new FakeElement('main');
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const controls = new SimulationControls({ document, engine, mount });
  return { controls, engine };
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

 test('A — initial configured spin is 40 rad/s', () => {
  const { controls, engine } = makeControls();
  assert.equal(controls.getInitialSpin(), 40);
  assert.equal(dot(engine.getState().Omega_w, engine.getState().n_w), 40);
});

test('B — changing the live velocity control changes the physical wheel spin and records the internal drive impulse', () => {
  const { controls, engine } = makeControls();
  const before = engine.getState();
  controls.spinSlider.value = '60';
  controls.spinSlider.emit('input');
  const after = engine.getState();
  assert.equal(controls.getInitialSpin(), 60);
  assert.equal(dot(after.Omega_w, after.n_w), 60);
  assert.equal(after.external_control.type, 'spin-rate');
  assert.deepEqual(after.external_control.deltaL, [6, 0, 0]);
  assert.ok(after.W_control > 0);
  assert.equal(after.external_control.external, false);
  assert.equal(after.external_control.internal, true);
  assert.equal(after.t, before.t);
});

test('C — EngineAdapter setInitialSpin rebuilds the initial condition', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  engine.step(engine.getPhysicsDt());
  const state = engine.setInitialSpin(60);
  assert.equal(state.t, 0);
  assert.equal(state.theta, 0);
  assert.deepEqual(state.q, [1, 0, 0, 0]);
  assert.deepEqual(state.Omega_b, [0, 0, 0]);
  assert.deepEqual(state.Omega_w, [60, 0, 0]);
  assert.equal(dot(state.Omega_w, state.n_w), 60);
});

test('D — s0=0 starts without axial wheel spin', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const state = engine.setInitialSpin(0);
  assert.deepEqual(state.Omega_w, [0, 0, 0]);
  assert.equal(dot(state.Omega_w, state.n_w), 0);
});

test('E — s0=80 starts with the corresponding axial spin', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const state = engine.setInitialSpin(80);
  assert.deepEqual(state.Omega_w, [80, 0, 0]);
});

test('F — changing s0 and resetting preserves theta0, q0 and Omega_b0', () => {
  const { controls, engine } = makeControls();
  controls.setInitialSpin(60);
  const state = engine.setInitialSpin(controls.getInitialSpin());
  assert.equal(state.theta, 0);
  assert.deepEqual(state.q, [1, 0, 0, 0]);
  assert.deepEqual(state.Omega_b, [0, 0, 0]);
});

test('G — initial spin does not become a continuous applied torque', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 60 }), theta0: 0, Omega0: [0, 0, 0] });
  const initial = engine.getState();
  for (let i = 0; i < 240; i += 1) engine.step(engine.getPhysicsDt());
  const after = engine.getState();
  assert.equal(dot(initial.Omega_w, initial.n_w), 60);
  assert.equal(after.theta, 0);
  assert.deepEqual(after.q, initial.q);
  assert.deepEqual(after.Omega_b, initial.Omega_b);
});

test('H — theta_target remains dynamic after changing initial spin', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  engine.setInitialSpin(60);
  engine.setThetaTarget(Math.PI / 2);
  const initial = engine.getState();
  assert.ok(Math.abs(initial.theta) < 1e-12);
  assert.equal(initial.theta_target, Math.PI / 2);
  for (let i = 0; i < 240; i += 1) engine.step(engine.getPhysicsDt());
  assert.ok(engine.getState().theta > 0);
});
