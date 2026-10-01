import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';

const DT_PARAMS = { s0: 40, Ia: 3 * (0.68 / 2) ** 2 };
const make = mode => EngineAdapter.create({ mode, params: createParams(DT_PARAMS), theta0: 0, Omega0: [0, 0, 0] });
const reach = (engine, target) => {
  engine.setThetaTarget(target);
  for (let i = 0; i < 1200; i += 1) {
    const state = engine.step(engine.getPhysicsDt());
    if (state.theta === target) return state;
  }
  throw new Error(`target ${target} was not reached`);
};
const vecError = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

test('3N.9-P1 — Free conserva L_total vectorial y mantiene Ly humano físico en ±90°', () => {
  const engine = make('Free');
  const initial = engine.getState().L_total_world;
  const plus = reach(engine, Math.PI / 2);
  const minus = reach(engine, -Math.PI / 2);
  assert.ok(Math.abs(plus.L_body_body[1]) > 1e-3);
  assert.ok(Math.abs(minus.L_body_body[1]) > 1e-3);
  assert.ok(vecError(plus.L_total_world, initial) < 1e-12);
  assert.ok(vecError(minus.L_total_world, initial) < 1e-12);
  assert.notEqual(Math.sign(plus.L_body_body[1]), Math.sign(minus.L_body_body[1]));
});

test('3N.9-P2 — VerticalBearing mantiene Ly físico y la componente conservada Lz', () => {
  const engine = make('VerticalBearing');
  const plus = reach(engine, Math.PI / 2);
  const minus = reach(engine, -Math.PI / 2);
  assert.ok(Math.abs(plus.L_body_body[1]) > 1e-3);
  assert.ok(Math.abs(minus.L_body_body[1]) > 1e-3);
  assert.ok(Math.abs(plus.L_total_world[2]) < 1e-12);
  assert.ok(Math.abs(minus.L_total_world[2]) < 1e-12);
  assert.notEqual(Math.sign(plus.L_body_body[1]), Math.sign(minus.L_body_body[1]));
});
