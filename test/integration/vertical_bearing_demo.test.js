import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

test('A — demo is configured to use VerticalBearing', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/main.js'), 'utf8');
  assert.match(source, /mode: 'VerticalBearing'/);
  assert.doesNotMatch(source, /mode: 'Free'/);
});

test('B — 0° initial state is quiet body, spinning wheel, horizontal axle', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const state = engine.getState();
  assert.equal(state.theta, 0);
  assert.equal(state.theta_target, 0);
  assert.deepEqual(state.q, [1, 0, 0, 0]);
  assert.deepEqual(state.Omega_b, [0, 0, 0]);
  assert.deepEqual(state.Omega_w, [40, 0, 0]);
  assert.deepEqual(state.n_w, [1, 0, 0]);
});

test('C — 0° → +90° changes only theta_target immediately, then the motor evolves theta', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const initial = engine.getState();
  engine.setThetaTarget(Math.PI / 2);
  const immediate = engine.getState();
  assert.equal(immediate.theta_target, Math.PI / 2);
  assert.ok(Math.abs(immediate.theta - initial.theta) < 1e-12);
  for (let i = 0; i < 4; i += 1) assert.ok(Math.abs(immediate.q[i] - initial.q[i]) < 1e-12);
  for (let i = 0; i < 3; i += 1) assert.ok(Math.abs(immediate.Omega_b[i] - initial.Omega_b[i]) < 1e-10);

  for (let i = 0; i < 240; i += 1) engine.step(engine.getPhysicsDt());
  const after = engine.getState();
  assert.ok(after.theta > 0.5);
  assert.ok(after.theta < Math.PI / 2);
  assert.notDeepEqual(after.q, initial.q);
  assert.notDeepEqual(after.n_w, initial.n_w);
});

test('D — q and n_w remain physical outputs and wheel spin stays tied to Omega_w·n_w', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const visual = new PhysicsVisualAdapter({ r_w: createParams({ s0: 40 }).r_w });
  engine.setThetaTarget(Math.PI / 2);
  visual.update(engine.getState());
  for (let i = 0; i < 240; i += 1) engine.step(engine.getPhysicsDt());
  const state = engine.getState();
  const v = visual.update(state);
  const axial = dot(state.Omega_w, state.n_w);
  assert.ok(axial > 30);
  assert.ok(v.wheelSpinAngle > 30);
  for (let i = 0; i < 3; i += 1) assert.ok(Math.abs(v.n_w[i] - state.n_w[i]) < 1e-15);
  assert.notDeepEqual(v.personQuaternion, { x: 0, y: 0, z: 0, w: 1 });
});

test('E — reset returns target and physical state to the demo initial condition and resets visual spin phase', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const visual = new PhysicsVisualAdapter({ r_w: createParams({ s0: 40 }).r_w });
  engine.setThetaTarget(Math.PI / 2);
  visual.update(engine.getState());
  for (let i = 0; i < 240; i += 1) engine.step(engine.getPhysicsDt());
  visual.update(engine.getState());
  assert.ok(visual.getVisualState().wheelSpinAngle > 0);
  engine.reset();
  const resetState = engine.getState();
  const resetVisual = visual.reset();
  assert.equal(resetState.theta_target, 0);
  assert.equal(resetState.theta, 0);
  assert.deepEqual(resetState.q, [1, 0, 0, 0]);
  assert.deepEqual(resetState.Omega_b, [0, 0, 0]);
  assert.deepEqual(resetState.Omega_w, [40, 0, 0]);
  assert.equal(resetVisual.wheelSpinAngle, 0);
});
