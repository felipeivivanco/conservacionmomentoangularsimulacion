import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';

const norm = v => Math.hypot(...v);
const diff = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

// 3N.13-A/B — the horizontal VerticalBearing spin intervention is continuous:
// every live command changes p_s and therefore the algebraic body state, while
// L_control/W_control continue to record the external intervention.
test('3N.13-A/B — 0 → 10 → 20 → 40 → 60 → 30 → 0 updates the physical body after every intervention', () => {
  const engine = EngineAdapter.create({
    mode: 'VerticalBearing',
    params: createParams({ s0: 0 }),
    theta0: Math.PI / 2,
    Omega0: [0, 0, 0]
  });
  const controller = new SimulationController({ engine });
  controller.start();
  const values = [10, 20, 40, 60, 30, 0];
  const records = [];
  let previous = engine.getState();

  for (const s of values) {
    controller.advance(engine.getPhysicsDt());
    const state = engine.setSpinRate(s);
    records.push({
      s,
      Omega_w: [...state.Omega_w],
      Omega_b: [...state.Omega_b],
      L_wheel: [...state.L_wheel_world],
      L_body: [...state.L_body_world],
      L_total: [...state.L_total_world],
      L_control: [...state.L_control],
      W_control: state.W_control
    });
    assert.ok(Math.abs(state.params.s0 - s) < 1e-12);
    assert.ok(Math.abs(state.Omega_w[2] - s) < 1e-10);
    assert.ok(norm(state.Omega_b) > 1e-12 || s === 0);
    assert.ok(diff(state.Omega_b, previous.Omega_b) > 1e-12, `body response did not update at s=${s}`);
    assert.ok(diff(state.L_wheel_world, previous.L_wheel_world) > 1e-12, `wheel L did not update at s=${s}`);
    assert.ok(diff(state.L_control, previous.L_control) > 1e-12, `L_control did not update at s=${s}`);
    assert.ok(Number.isFinite(state.W_control));
    assert.equal(state.theta, Math.PI / 2);
    assert.equal(state.theta_target, Math.PI / 2);
    previous = state;
  }

  assert.equal(controller.getState().status, 'running');
  assert.ok(controller.getState().steps >= values.length);
  assert.ok(Math.abs(records.at(-1).Omega_b[2]) < 1e-12);
  assert.ok(Math.abs(records.at(-1).Omega_w[2]) < 1e-12);
  assert.ok(Math.abs(records.at(-1).L_wheel[2]) < 1e-12);
  assert.ok(Math.abs(records.at(-1).L_body[2]) < 1e-12);
  assert.ok(Math.abs(records.at(-1).L_control[2]) < 1e-12);
});

test('3N.13-continuous — monotonic ramp up/down remains responsive without theta changes', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 0 }), theta0: Math.PI / 2, Omega0: [0, 0, 0] });
  const sequence = [0, 10, 20, 30, 40, 50, 60, 50, 40, 30, 20, 10, 0];
  const bodyZ = [];
  for (const s of sequence) {
    const state = engine.setSpinRate(s);
    bodyZ.push(state.Omega_b[2]);
    assert.equal(state.theta, Math.PI / 2);
    assert.equal(state.thetaDot, 0);
    assert.ok(Math.abs(state.Omega_w[2] - s) < 1e-10);
  }
  assert.ok(bodyZ.slice(1, 7).every(v => v < -1e-12));
  assert.ok(bodyZ.slice(7).every(v => v < 1e-12));
  assert.ok(Math.abs(bodyZ.at(-1)) < 1e-12);
});

test('3N.13-C — scene 1 remains VerticalBearing', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  assert.match(source, /label: 'Plataforma'[\s\S]*?mode: 'VerticalBearing'/);
});

test('3N.13-D — scene 2 uses the validated Free engine', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  assert.match(source, /const VACUUM_MODE = \['Free'\]\[0\];/);
  assert.match(source, /label: 'Vacío'[\s\S]*?mode: VACUUM_MODE/);
});

test('3N.13-E/P — scene 2 is created without a platform mesh', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  assert.match(source, /platform: !space/);
  assert.match(source, /space: true, start: false/);
});

test('3N.13-F/Q — each scene has its own runtime, engine, controller and loop; switching only changes visibility', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  assert.equal((source.match(/new SceneRuntime\(/g) || []).length, 2);
  assert.match(source, /this\.scenes = \{/);
  assert.match(source, /platform: new SceneRuntime/);
  assert.match(source, /vacuum: new SceneRuntime/);
  assert.match(source, /switchScene\(id\)/);
  assert.match(source, /runtime\.setActive\(id === this\._activeScene\)/);

  const platform = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const vacuum = EngineAdapter.create({ mode: 'Free', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const platformBefore = platform.getState();
  const vacuumBefore = vacuum.getState();
  platform.setThetaTarget(Math.PI / 4);
  platform.step(platform.getPhysicsDt());
  assert.deepEqual(vacuum.getState().q, vacuumBefore.q);
  assert.equal(vacuum.getState().t, vacuumBefore.t);
  assert.equal(vacuum.getState().theta_target, vacuumBefore.theta_target);
  assert.equal(platform.getState().theta_target, Math.PI / 4);
  assert.deepEqual(platformBefore.q, [1, 0, 0, 0]);
});

test('3N.13-G/H — scene 2 STOP theta reset is physical and Play can start from configured theta', () => {
  const engine = EngineAdapter.create({ mode: 'Free', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const before = engine.getState();
  assert.equal(before.t, 0);
  engine.setThetaTarget(Math.PI / 3);
  engine.reset({ theta0: Math.PI / 3 });
  const stopped = engine.getState();
  assert.ok(Math.abs(stopped.theta - Math.PI / 3) < 1e-14);
  assert.equal(stopped.t, 0);
  assert.equal(stopped.thetaDot, 0);
  assert.ok(Math.abs(stopped.params.s0 - 40) < 1e-12);
  engine.step(engine.getPhysicsDt());
  const started = engine.getState();
  assert.ok(started.t > 0);
  assert.ok(Math.abs(started.theta - Math.PI / 3) < 1e-12);
});

test('3N.13-I — Free scene conserves L_total_world during theta maneuver with no spin intervention', () => {
  const engine = EngineAdapter.create({ mode: 'Free', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const initial = engine.getState();
  engine.setThetaTarget(Math.PI / 2);
  let maxAbs = 0;
  for (let i = 0; i < 480; i += 1) {
    engine.step(engine.getPhysicsDt());
    const state = engine.getState();
    maxAbs = Math.max(maxAbs, diff(state.L_total_world, initial.L_total_world));
    assert.ok(Math.abs(norm(state.q) - 1) < 1e-12);
  }
  const scale = Math.max(1, norm(initial.L_total_world));
  assert.ok(maxAbs / scale < 1e-12, `relative L error ${maxAbs / scale}`);
});

test('3N.13-J — Free scene develops genuine 3D orientation and multi-axis angular velocity', () => {
  const engine = EngineAdapter.create({ mode: 'Free', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  engine.setThetaTarget(Math.PI / 2);
  for (let i = 0; i < 300; i += 1) engine.step(engine.getPhysicsDt());
  const state = engine.getState();
  assert.ok(Math.abs(state.q[1]) > 1e-4 || Math.abs(state.q[2]) > 1e-4);
  assert.ok(Math.abs(state.Omega_b[0]) > 1e-4 || Math.abs(state.Omega_b[1]) > 1e-4);
  assert.ok(Math.abs(state.Omega_b[2]) > 1e-4);
});

test('3N.13-K — Free spin intervention records L_control and W_control', () => {
  const engine = EngineAdapter.create({ mode: 'Free', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const before = engine.getState();
  const after = engine.setSpinRate(60);
  assert.ok(diff(after.L_control, before.L_control) > 1e-12);
  assert.equal(after.external_control?.external, false);
  assert.equal(after.external_control?.internal, true);
  assert.equal(after.external_control?.type, 'spin-rate');
  assert.ok(Number.isFinite(after.external_control.deltaW));
  assert.ok(Number.isFinite(after.W_control));
  assert.ok(diff(after.L_total_world, before.L_total_world) < 1e-12);
  assert.ok(diff(after.Omega_b, before.Omega_b) > 1e-12);
});

test('3N.13-L — scene 2 requests a black spatial background and one lightweight point field', async () => {
  const scene = await fs.readFile(new URL('../../src/render/Scene3D.js', import.meta.url), 'utf8');
  assert.match(scene, /spaceBackground \? 0x000000/);
  assert.match(scene, /new THREE\.Points\(/);
  assert.match(scene, /starCount \?\? 700/);
  assert.match(scene, /Float32Array\(count \* 3\)/);
});

test('3N.13-M/N — astronaut body is gray, face is a child of headGroup, and eyes remain linked', async () => {
  const source = await fs.readFile(new URL('../../src/render/PersonVisual.js', import.meta.url), 'utf8');
  assert.match(source, /astronaut \? 0x858b91/);
  assert.doesNotMatch(source, /CircleGeometry/);
  assert.match(source, /const headGeometry = new SphereGeometry/);
  assert.match(source, /const face = astronaut \? head : null/);
  assert.match(source, /headGroup\.add\(leftEye, rightEye\)/);
  assert.match(source, /const eyeForward = headRadius \* \(astronaut \? 1\.03/);
});

test('3N.13-O — astronaut limb shading cues remain enabled', async () => {
  const source = await fs.readFile(new URL('../../src/render/PersonVisual.js', import.meta.url), 'utf8');
  assert.match(source, /torsoShade\.visible = false;/);
  assert.doesNotMatch(source, /if \(astronaut\) torsoShade\.visible = true;/);
  assert.match(source, /headShadeMaterial/);
  assert.match(source, /armShadeMaterial/);
  assert.match(source, /legShadeMaterial/);
});
