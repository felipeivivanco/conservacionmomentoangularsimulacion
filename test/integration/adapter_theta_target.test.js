import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';

test('J: setThetaTarget exposes the existing motor target API without adding physics', () => {
  const engine = EngineAdapter.create({ theta0: 0, Omega0: [0, 0, 0] });
  const before = engine.getState();
  const state = engine.setThetaTarget(Math.PI / 4);
  assert.equal(state.theta_target, Math.PI / 4);
  assert.equal(state.t, before.t);
  assert.ok(state.q.every((value, i) => Math.abs(value - before.q[i]) < 1e-10));
  assert.ok(state.Omega_b.every((value, i) => Math.abs(value - before.Omega_b[i]) < 1e-10));
});

test('K: setThetaTarget clamps to the motor-supported target range', () => {
  const engine = EngineAdapter.create({ theta0: 0 });
  assert.equal(engine.setThetaTarget(99).theta_target, Math.PI / 2);
  assert.equal(engine.setThetaTarget(-99).theta_target, -Math.PI / 2);
});

test('L: setThetaTarget rejects non-finite input', () => {
  const engine = EngineAdapter.create({ theta0: 0 });
  assert.throws(() => engine.setThetaTarget(Number.NaN), /thetaTarget must be finite/);
  assert.throws(() => engine.setThetaTarget(Infinity), /thetaTarget must be finite/);
});
