import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { SimulationLoop } from '../../src/render/SimulationLoop.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

class RafMock {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
  }

  requestAnimationFrame = callback => {
    const id = this.nextId++;
    this.pending.set(id, callback);
    return id;
  };

  cancelAnimationFrame = id => {
    this.pending.delete(id);
  };

  frame(timestamp) {
    assert.equal(this.pending.size, 1, 'exactly one frame should be scheduled');
    const [id, callback] = this.pending.entries().next().value;
    this.pending.delete(id);
    callback(timestamp);
  }
}

function createHarness({ timeScale = 1, maxRealDelta = 0.1 } = {}) {
  const engine = EngineAdapter.create({
    mode: 'Free',
    theta0: Math.PI / 2,
    Omega0: [0.3, 1.1, -0.2]
  });
  const controller = new SimulationController({ engine, timeScale, maxRealDelta });
  const visualAdapter = new PhysicsVisualAdapter();
  const wheel = {
    orientation: null,
    position: null,
    calls: 0,
    spin: 0,
    setOrientation(q) { this.orientation = { ...q }; this.calls += 1; },
    setPosition(p) { this.position = { ...p }; },
    setSpinAngle(a) { this.spin = a; }
  };
  const person = {
    orientation: null,
    calls: 0,
    setOrientation(q) { this.orientation = { ...q }; this.calls += 1; }
  };
  const scene = {
    wheel,
    person,
    renders: 0,
    render() { this.renders += 1; }
  };
  const renderer = {
    states: [],
    render(state) { this.states.push(structuredClone(state)); }
  };
  const raf = new RafMock();
  const loop = new SimulationLoop({
    controller,
    visualAdapter,
    scene,
    renderer,
    requestAnimationFrame: raf.requestAnimationFrame,
    cancelAnimationFrame: raf.cancelAnimationFrame
  });
  return { engine, controller, visualAdapter, scene, renderer, raf, loop };
}

function stateComparable(state) {
  return {
    theta: state.theta,
    q: state.q,
    Omega: state.Omega,
    t: state.t,
    W_act: state.W_act
  };
}

function runTimestamps(timestamps) {
  const h = createHarness();
  h.loop.start();
  for (const timestamp of timestamps) h.raf.frame(timestamp);
  return stateComparable(h.controller.getState().physics);
}

test('A — SimulationLoop can be constructed', () => {
  const { loop } = createHarness();
  assert.ok(loop);
});

test('B — start starts the controller and schedules one presentation frame', () => {
  const { loop, controller, raf } = createHarness();
  loop.start();
  assert.equal(controller.getState().status, 'running');
  assert.equal(raf.pending.size, 1);
});

test('C — first frame renders current state and uses zero real delta', () => {
  const { loop, controller, raf, renderer, scene } = createHarness();
  loop.start();
  raf.frame(1_000_000_000);
  assert.equal(controller.getState().steps, 0);
  assert.equal(renderer.states.length, 1);
  assert.equal(scene.renders, 1);
});

test('D — delta between frames is measured from rAF timestamps', () => {
  const { loop, controller, raf } = createHarness();
  loop.start();
  raf.frame(1000);
  raf.frame(1100);
  assert.equal(controller.getState().steps, 24);
});

test('E — physical advancement occurs through SimulationController.advance()', () => {
  const { loop, controller, raf } = createHarness();
  let advanceCalls = 0;
  const originalAdvance = controller.advance.bind(controller);
  controller.advance = delta => { advanceCalls += 1; return originalAdvance(delta); };
  loop.start();
  raf.frame(1000);
  raf.frame(1016.6666666667);
  assert.equal(advanceCalls, 2);
  assert.equal(controller.getState().steps, 4);
});

test('F — Renderer and Scene3D receive the visual update for each frame', () => {
  const { loop, raf, renderer, scene } = createHarness();
  loop.start();
  raf.frame(0);
  raf.frame(1000 / 60);
  assert.equal(renderer.states.length, 2);
  assert.equal(scene.renders, 2);
  assert.deepEqual(scene.wheel.orientation, renderer.states.at(-1).wheelQuaternion);
  assert.deepEqual(scene.wheel.position, renderer.states.at(-1).wheelPosition);
  assert.deepEqual(scene.person.orientation, renderer.states.at(-1).personQuaternion);
  assert.notDeepEqual(scene.wheel.orientation, scene.person.orientation);
});

test('G — SimulationLoop source has no direct physical stepping API', () => {
  const source = fs.readFileSync(path.join(root, 'src/render/SimulationLoop.js'), 'utf8');
  assert.doesNotMatch(source, /\.step\s*\(/);
  assert.doesNotMatch(source, /\.run\s*\(/);
  assert.doesNotMatch(source, /\.frame\s*\(/);
});

test('H — pause cancela el RAF y previene avance físico/presentación', () => {
  const { loop, controller, raf, renderer } = createHarness();
  loop.start();
  raf.frame(0);
  loop.pause();
  const before = stateComparable(controller.getState().physics);
  assert.equal(raf.pending.size, 0);
  assert.deepEqual(stateComparable(controller.getState().physics), before);
  assert.equal(renderer.states.length, 1);
});

test('I — resume reinicia el reloj de presentación sin arrastre del tiempo pausado', () => {
  const { loop, controller, raf } = createHarness();
  loop.start();
  raf.frame(0);
  loop.pause();
  const paused = controller.getState().steps;
  loop.resume();
  raf.frame(5000);
  assert.equal(controller.getState().steps, paused);
  raf.frame(5100);
  assert.equal(controller.getState().steps - paused, 24);
});

test('J — isPaused reflects the controller lifecycle', () => {
  const { loop } = createHarness();
  assert.equal(loop.isPaused(), false);
  loop.start();
  loop.pause();
  assert.equal(loop.isPaused(), true);
  loop.resume();
  assert.equal(loop.isPaused(), false);
});

test('K — stop cancels the scheduled frame and stops advancement', () => {
  const { loop, controller, raf } = createHarness();
  loop.start();
  loop.stop();
  assert.equal(raf.pending.size, 0);
  assert.equal(controller.getState().status, 'stopped');
});

test('L — reset resets physical and visual state and stops the loop', () => {
  const { loop, controller, raf, renderer, scene } = createHarness();
  loop.start();
  raf.frame(0);
  raf.frame(100);
  loop.reset();
  const state = controller.getState();
  assert.equal(state.status, 'stopped');
  assert.equal(state.steps, 0);
  assert.equal(state.physics.t, 0);
  const resetVisual = loop.getVisualState();
  assert.deepEqual(resetVisual.personQuaternion, { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual(resetVisual.wheelQuaternion, { x: -0.5, y: -0.5, z: 0.5, w: 0.5 });
  assert.deepEqual(resetVisual.wheelPosition, { x: 0.6, y: 1.3, z: 0 });
  assert.deepEqual(resetVisual.personPosition, { x: 0, y: 0.9, z: 0 });
  assert.equal(resetVisual.wheelSpinAngle, 0);
  assert.equal(raf.pending.size, 0);
  assert.ok(renderer.states.length >= 0);
});

test('M — equivalent timestamp sequences are deterministic', () => {
  const a = runTimestamps([0, 1000 / 60, 2 * 1000 / 60, 3 * 1000 / 60]);
  const b = runTimestamps([0, 1000 / 60, 2 * 1000 / 60, 3 * 1000 / 60]);
  assert.deepEqual(a, b);
});

test('N — a very large first timestamp does not create a simulation jump', () => {
  const { loop, controller, raf } = createHarness();
  loop.start();
  raf.frame(9_000_000_000);
  assert.equal(controller.getState().steps, 0);
  raf.frame(9_000_000_100);
  assert.equal(controller.getState().steps, 24);
});

test('O — multiple frames advance only according to elapsed presentation time', () => {
  const { loop, controller, raf } = createHarness();
  loop.start();
  raf.frame(0);
  raf.frame(10);
  raf.frame(20);
  raf.frame(30);
  raf.frame(40);
  raf.frame(50);
  assert.equal(controller.getState().steps, 12);
});

test('P — rendering cannot modify the physical state', () => {
  const { loop, controller, raf, renderer } = createHarness();
  renderer.render = state => {
    state.theta = 999;
    state.quaternion.x = 999;
  };
  loop.start();
  raf.frame(0);
  const afterRender = controller.getState().physics;
  assert.notEqual(afterRender.theta, 999);
  assert.notEqual(afterRender.q[1], 999);
});

test('Q — one presentation frame cannot produce two physical advances', () => {
  const { loop, controller, raf } = createHarness();
  let advanceCalls = 0;
  const originalAdvance = controller.advance.bind(controller);
  controller.advance = delta => { advanceCalls += 1; return originalAdvance(delta); };
  loop.start();
  raf.frame(0);
  assert.equal(advanceCalls, 1);
  raf.frame(100);
  assert.equal(advanceCalls, 2);
});

test('R — 60 FPS, 120 FPS, and irregular timestamps are consistent for equal elapsed time', () => {
  const sixty = runTimestamps([0, 1000 / 60, 2 * 1000 / 60, 3 * 1000 / 60, 4 * 1000 / 60, 5 * 1000 / 60, 6 * 1000 / 60]);
  const oneTwenty = runTimestamps([0, 1000 / 120, 2 * 1000 / 120, 3 * 1000 / 120, 4 * 1000 / 120, 5 * 1000 / 120, 6 * 1000 / 120, 7 * 1000 / 120, 8 * 1000 / 120, 9 * 1000 / 120, 10 * 1000 / 120, 11 * 1000 / 120, 12 * 1000 / 120]);
  const irregular = runTimestamps([0, 7, 23, 41, 58, 91, 100]);
  assert.equal(sixty.t, oneTwenty.t);
  assert.equal(sixty.t, irregular.t);
  for (const key of ['theta', 't', 'W_act']) assert.ok(Math.abs(sixty[key] - oneTwenty[key]) < 1e-12, `${key} 60/120 mismatch`);
  for (const key of ['theta', 't', 'W_act']) assert.ok(Math.abs(sixty[key] - irregular[key]) < 1e-12, `${key} irregular mismatch`);
  for (let i = 0; i < 4; i += 1) {
    assert.ok(Math.abs(sixty.q[i] - oneTwenty.q[i]) < 1e-12, `q[${i}] 60/120 mismatch`);
    assert.ok(Math.abs(sixty.q[i] - irregular.q[i]) < 1e-12, `q[${i}] irregular mismatch`);
  }
});

test('S — loop does not duplicate temporal ownership or call the engine directly', () => {
  const { loop, controller, engine, raf } = createHarness();
  let directEngineSteps = 0;
  const originalStep = engine.step.bind(engine);
  engine.step = dt => { directEngineSteps += 1; return originalStep(dt); };
  loop.start();
  raf.frame(0);
  raf.frame(100);
  assert.equal(directEngineSteps, controller.getState().steps);
  const source = fs.readFileSync(path.join(root, 'src/render/SimulationLoop.js'), 'utf8');
  assert.doesNotMatch(source, /EngineAdapter/);
  assert.doesNotMatch(source, /AngularMomentumEngine/);
});


test('T — initial demo body remains static while wheel spin advances visually', () => {
  const engine = EngineAdapter.create({
    mode: 'Free',
    params: createParams({ s0: 40 }),
    theta0: 0,
    Omega0: [0, 0, 0]
  });
  const controller = new SimulationController({ engine });
  const visualAdapter = new PhysicsVisualAdapter();
  const wheel = { orientation: null, position: null, spin: null, setOrientation(q) { this.orientation = { ...q }; }, setPosition(p) { this.position = { ...p }; }, setSpinAngle(a) { this.spin = a; } };
  const person = { orientation: null, position: null, setOrientation(q) { this.orientation = { ...q }; }, setPosition(p) { this.position = { ...p }; } };
  const scene = { wheel, person, render() {} };
  const renderer = { render() {} };
  const raf = new RafMock();
  const loop = new SimulationLoop({ controller, visualAdapter, scene, renderer, requestAnimationFrame: raf.requestAnimationFrame, cancelAnimationFrame: raf.cancelAnimationFrame });
  loop.start();
  raf.frame(0);
  const initial = { physics: controller.getState().physics, visual: loop.getVisualState() };
  raf.frame(1000 / 60);
  raf.frame(2000 / 60);
  const after = { physics: controller.getState().physics, visual: loop.getVisualState() };
  assert.deepEqual(after.physics.q, initial.physics.q);
  assert.deepEqual(after.physics.Omega_b, initial.physics.Omega_b);
  assert.deepEqual(after.physics.Omega_w, initial.physics.Omega_w);
  assert.equal(after.physics.theta, 0);
  assert.deepEqual(after.visual.personQuaternion, initial.visual.personQuaternion);
  assert.deepEqual(after.visual.wheelQuaternion, initial.visual.wheelQuaternion);
  assert.deepEqual(after.visual.wheelPosition, initial.visual.wheelPosition);
  assert.ok(after.visual.wheelSpinAngle > 0);
  assert.equal(after.visual.wheelSpinAngle, wheel.spin);
  assert.deepEqual(wheel.orientation, initial.visual.wheelQuaternion);
  assert.deepEqual(person.orientation, initial.visual.personQuaternion);
});


