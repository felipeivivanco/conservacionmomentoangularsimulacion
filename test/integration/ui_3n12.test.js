import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { SimulationControls } from '../../src/app/SimulationControls.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { SimulationLoop } from '../../src/render/SimulationLoop.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { PersonVisual } from '../../src/render/PersonVisual.js';
import { AxesOverlay } from '../../src/render/AxesOverlay.js';
import { createParams } from '../../src/index.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.listeners = new Map();
    this.value = ''; this.type = ''; this._textContent = ''; this.parentNode = null; this.focused = false;
  }
  get textContent() { return this._textContent; }
  set textContent(value) { this.children = []; this._textContent = String(value ?? ''); }
  append(...items) { items.forEach(item => this.appendChild(item)); }
  appendChild(item) { this.children.push(item); if (item && typeof item === 'object') item.parentNode = this; return item; }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; this.removed = true; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
  get isConnected() { return Boolean(this.parentNode); }
}
class FakeDocument { createElement(tag) { return new FakeElement(tag); } createTextNode(text) { const n = new FakeElement('#text'); n.textContent = text; return n; } }

function makePhysicalHarness() {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const controller = new SimulationController({ engine });
  const visualAdapter = new PhysicsVisualAdapter({ r_w: createParams().r_w });
  const scene = { person: null, wheel: null, platform: null, render() {}, updatePhysicsOverlays() {} };
  const renderer = { render() {} };
  const raf = { requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} };
  const loop = new SimulationLoop({ controller, visualAdapter, scene, renderer, requestAnimationFrame: raf.requestAnimationFrame, cancelAnimationFrame: raf.cancelAnimationFrame });
  return { engine, controller, visualAdapter, loop };
}

function makeControls({ engine, controller, loop }) {
  const document = new FakeDocument(); const mount = new FakeElement('main');
  const controls = new SimulationControls({
    document, engine, mount,
    onThetaTargetChange: state => {
      const c = controller.getState();
      const fresh = c.steps === 0 && Math.abs(state.t) <= 1e-15;
      const stoppedOrPaused = c.status === 'stopped' || c.status === 'paused';
      const freshRunning = c.status === 'running' && fresh;
      if ((stoppedOrPaused || freshRunning) && fresh) {
        engine.reset({ theta0: state.theta_target });
        loop.syncCurrentState();
      }
    }
  });
  return { controls, mount };
}

const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const vecNorm = v => Math.hypot(...v);

// 3N.12-A / B: the zero -> positive live command is verified through the
// actual physics snapshot, not through a visual property.
test('3N.12-A — theta=90°, s0=0: live 0 → 40 rad/s gives the requested wheel speed and axial angular momentum', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 0 }), theta0: Math.PI/2, Omega0: [0, 0, 0] });
  const before = engine.getState();
  assert.equal(before.theta, Math.PI/2);
  assert.equal(dot(before.Omega_w, before.n_w), 0);
  assert.deepEqual(before.Omega_b, [0, 0, 0]);

  const after = engine.setSpinRate(40);
  assert.equal(after.theta, Math.PI/2);
  assert.equal(after.theta_target, Math.PI/2);
  assert.ok(Math.abs(dot(after.Omega_w, after.n_w) - 40) < 1e-12);
  assert.ok(Math.abs(dot(after.L_wheel_world, after.n_w) - after.params.Ia * 40) < 1e-10);
  assert.equal(after.external_control.type, 'spin-rate');
  assert.ok(after.W_control > 0);
});

test('3N.12-B — live 0 → 40 produces a physical body response without changing theta or adding a visual animation', () => {
  const runCase = () => {
    const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 0 }), theta0: Math.PI/2, Omega0: [0, 0, 0] });
    const visual = new PhysicsVisualAdapter({ r_w: createParams().r_w });
    const initial = engine.getState();
    engine.setSpinRate(40);
    const commanded = engine.getState();
    assert.ok(vecNorm(commanded.Omega_b) > 1e-12, 'the body must react physically to the live spin intervention');
    assert.equal(commanded.theta, Math.PI/2);
    assert.equal(commanded.theta_target, Math.PI/2);
    const qBefore = [...commanded.q];
    for (let i = 0; i < 60; i += 1) engine.step(engine.getPhysicsDt());
    const after = engine.getState();
    assert.equal(after.theta, Math.PI/2);
    assert.ok(vecNorm(after.Omega_b) > 1e-12);
    assert.notDeepEqual(after.q, qBefore);
    const presentation = visual.update(after);
    assert.ok(Number.isFinite(presentation.personQuaternion.x));
    assert.ok(Number.isFinite(presentation.personQuaternion.y));
    assert.ok(Number.isFinite(presentation.personQuaternion.z));
    assert.ok(Number.isFinite(presentation.personQuaternion.w));
    assert.notDeepEqual(presentation.personQuaternion, { x: 0, y: 0, z: 0, w: 1 });
    assert.equal(initial.theta, after.theta);
    return after;
  };
  const a = runCase();
  const b = runCase();
  assert.deepEqual(a.q, b.q);
  assert.deepEqual(a.Omega_b, b.Omega_b);
});

test('3N.12-C — STOP: reset + 0 → +45° changes the physical initial theta without advancing time or steps', () => {
  const h = makePhysicalHarness(); const { controls } = makeControls(h);
  h.controller.reset();
  assert.equal(h.controller.getState().status, 'stopped');
  const before = h.controller.getState();
  controls.setTargetDegrees(45);
  const after = h.controller.getState();
  assert.ok(Math.abs(after.physics.theta - Math.PI/4) < 1e-14);
  assert.equal(after.physics.theta_target, Math.PI/4);
  assert.equal(after.physics.thetaDot, 0);
  assert.equal(after.physics.t, 0);
  assert.equal(after.steps, 0);
  assert.equal(after.physics.params.s0, before.physics.params.s0);
});

test('3N.12-C2 — before the first physical step, a running loop can still redefine the initial theta', () => {
  const h = makePhysicalHarness(); const { controls } = makeControls(h);
  h.controller.start();
  assert.equal(h.controller.getState().steps, 0);
  controls.setTargetDegrees(45);
  const after = h.controller.getState();
  assert.ok(Math.abs(after.physics.theta - Math.PI/4) < 1e-14);
  assert.equal(after.physics.t, 0);
  assert.equal(after.steps, 0);
});

test('3N.12-D — STOP: +45° → -90° updates the physical initial orientation immediately', () => {
  const h = makePhysicalHarness(); const { controls } = makeControls(h);
  h.controller.reset(); controls.setTargetDegrees(45);
  const mid = h.controller.getState();
  controls.setTargetDegrees(-90);
  const after = h.controller.getState();
  assert.ok(Math.abs(after.physics.theta + Math.PI/2) < 1e-14);
  assert.equal(after.physics.theta_target, -Math.PI/2);
  assert.equal(after.physics.thetaDot, 0);
  assert.equal(after.physics.t, 0);
  assert.equal(after.steps, 0);
  assert.notEqual(after.physics.n_w[2], mid.physics.n_w[2]);
});

test('3N.12-E — Play starts from the newly selected -90° physical initial theta', () => {
  const h = makePhysicalHarness(); const { controls } = makeControls(h);
  h.controller.reset(); controls.setTargetDegrees(-90);
  h.controller.start();
  h.controller.advance(h.engine.getPhysicsDt());
  const started = h.controller.getState();
  assert.ok(started.steps > 0);
  assert.ok(started.physics.t > 0);
  assert.ok(Math.abs(started.physics.theta + Math.PI/2) < 1e-12);
  assert.equal(started.physics.theta_target, -Math.PI/2);
});

test('3N.12-F — after physical time has advanced, changing theta while paused remains dynamic and does not reset time', () => {
  const h = makePhysicalHarness(); const { controls } = makeControls(h);
  h.controller.reset(); h.controller.start();
  for (let i = 0; i < 12; i += 1) h.controller.advance(h.engine.getPhysicsDt());
  h.controller.pause();
  const before = h.controller.getState();
  controls.setTargetDegrees(30);
  const after = h.controller.getState();
  assert.equal(after.status, 'paused');
  assert.equal(after.steps, before.steps);
  assert.equal(after.physics.t, before.physics.t);
  assert.ok(Math.abs(after.physics.theta - before.physics.theta) < 1e-20);
  assert.equal(after.physics.theta_target, Math.PI/6);
});

test('3N.12-G — legs use the reduced lateral separation introduced for the visual-only correction', async () => {
  const source = await fs.readFile(new URL('../../src/render/PersonVisual.js', import.meta.url), 'utf8');
  assert.match(source, /const legLateralOffset = 0\.09/);
  assert.doesNotMatch(source, /-0\.11|0\.11, 0\)/);
});

test('3N.12-H — torso shadow cue is disabled locally while other body shading remains enabled', async () => {
  const source = await fs.readFile(new URL('../../src/render/PersonVisual.js', import.meta.url), 'utf8');
  assert.match(source, /torsoShade\.visible = false/);
  assert.match(source, /headShade/);
  assert.match(source, /armShadeMaterial/);
  assert.match(source, /legShadeMaterial/);
  assert.doesNotMatch(source, /castShadow\s*=\s*false/);
  assert.doesNotMatch(source, /shadowMap\.enabled\s*=\s*false/);
});

class FakeCanvas extends FakeElement {
  constructor() { super('canvas'); this.width = 0; this.height = 0; this.ctx = { setTransform: (...args) => { this.transform = args; }, font: '', fillStyle: '', fillText: (...args) => { this.fillTextArgs = args; } }; }
  getContext() { return this.ctx; }
}
class CanvasDocument {
  createElement(tag) { return tag === 'canvas' ? new FakeCanvas() : new FakeElement(tag); }
}
class FakeSprite { constructor(material) { this.material = material; this.position = { set() {} }; this.scale = { set: (...v) => { this.scaleValues = v; } }; } }
class FakeSpriteMaterial { constructor(options) { Object.assign(this, options); } }
class FakeTexture { constructor(canvas) { this.canvas = canvas; this.needsUpdate = false; this.minFilter = null; this.magFilter = null; } dispose() {} }
class FakeAxesGroup { constructor() { this.children = []; this.visible = true; } add(item) { this.children.push(item); } clear() { this.children = []; } }
class FakeVector3 { constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; } }
class FakeArrow { constructor() {} }
const AXES_THREE = { Group: FakeAxesGroup, ArrowHelper: FakeArrow, Vector3: FakeVector3, Sprite: FakeSprite, SpriteMaterial: FakeSpriteMaterial, CanvasTexture: FakeTexture, LinearFilter: 'LinearFilter' };

test('3N.12-I — X/Y/Z labels render from a 4x internal canvas while keeping the same sprite scale', () => {
  const axes = new AxesOverlay({ three: AXES_THREE, document: new CanvasDocument(), length: 2.25 });
  assert.equal(axes._labels.length, 6);
  for (const label of axes._labels) {
    assert.equal(label.texture.canvas.width, 512);
    assert.equal(label.texture.canvas.height, 192);
    assert.deepEqual(label.sprite.scaleValues, [0.65, 0.25, 1]);
    assert.equal(label.texture.minFilter, 'LinearFilter');
    assert.equal(label.texture.magFilter, 'LinearFilter');
    assert.deepEqual(label.texture.canvas.transform, [4, 0, 0, 4, 0, 0]);
  }
});

test('3N.12-J — STOP angle route contains no frame timer or artificial animation', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  assert.match(source, /engine\.reset\(\{ theta0: physicsState\.theta_target \}\)/);
  assert.match(source, /loop\.syncCurrentState\(\)/);
  assert.match(source, /status === 'stopped'/);
  assert.match(source, /status === 'paused'/);
  assert.doesNotMatch(source, /setTimeout|setInterval/);
});
