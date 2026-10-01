import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';

function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
function norm(v) { return Math.hypot(...v); }

function runAudit(mode) {
  const engine = EngineAdapter.create({
    mode,
    params: createParams({ s0: 40 }),
    theta0: Math.PI / 4,
    Omega0: [0, 0, 0]
  });

  let minSpin = Infinity;
  let maxSpin = -Infinity;
  let signChanges = 0;
  let previousSpin = null;
  let maxThetaDot = 0;
  let maxOmegaVector = 0;
  let maxLWheel = 0;
  const samples = [];

  for (let frame = 0; frame < 2400; frame += 1) {
    engine.step(1 / 240);
    const state = engine.getState();
    const omegaSpin = dot(state.Omega_w, state.n_w);
    minSpin = Math.min(minSpin, omegaSpin);
    maxSpin = Math.max(maxSpin, omegaSpin);
    maxThetaDot = Math.max(maxThetaDot, Math.abs(state.thetaDot));
    maxOmegaVector = Math.max(maxOmegaVector, norm(state.Omega_w));
    maxLWheel = Math.max(maxLWheel, norm(state.L_wheel_body));
    if (previousSpin !== null && previousSpin * omegaSpin < 0) signChanges += 1;
    previousSpin = omegaSpin;
    if (frame % 600 === 0) samples.push({
      frame,
      omegaSpin,
      omegaVector: [...state.Omega_w],
      n_w: [...state.n_w],
      theta: state.theta,
      thetaDot: state.thetaDot,
      Omega_body: [...state.Omega_b],
      L_wheel: [...state.L_wheel_body]
    });
  }

  return { minSpin, maxSpin, signChanges, maxThetaDot, maxOmegaVector, maxLWheel, samples };
}

test('3N.6-A1 — spin escalar permanece positivo a θ=45° durante 2400 frames en Free', () => {
  const result = runAudit('Free');
  assert.equal(result.signChanges, 0);
  assert.ok(result.minSpin > 0);
  assert.ok(Math.abs(result.minSpin - 40) < 1e-10);
  assert.ok(Math.abs(result.maxSpin - 40) < 1e-10);
  assert.ok(result.samples.length >= 4);
});

test('3N.6-A2 — spin escalar permanece positivo a θ=45° durante 2400 frames en VerticalBearing', () => {
  const result = runAudit('VerticalBearing');
  assert.equal(result.signChanges, 0);
  assert.ok(result.minSpin > 0);
  assert.ok(Math.abs(result.minSpin - 40) < 1e-10);
  assert.ok(Math.abs(result.maxSpin - 40) < 1e-10);
  assert.ok(result.samples.length >= 4);
});

test('3N.6-A3 — el diagnóstico usa Ω_w · n_w, no una componente cartesiana fija', () => {
  const engine = EngineAdapter.create({
    mode: 'VerticalBearing',
    params: createParams({ s0: 40 }),
    theta0: Math.PI / 4,
    Omega0: [0, 0, 0]
  });
  for (let i = 0; i < 1200; i += 1) engine.step(1 / 240);
  const state = engine.getState();
  const axial = dot(state.Omega_w, state.n_w);
  assert.ok(Math.abs(axial - 40) < 1e-10);
  assert.ok(Math.abs(state.Omega_w[0] - 40) > 1e-6 || Math.abs(state.Omega_w[2]) > 1e-6);
});
