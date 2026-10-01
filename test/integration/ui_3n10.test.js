import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationControls } from '../../src/app/SimulationControls.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { PersonVisual } from '../../src/render/PersonVisual.js';
import { SimulationLoop } from '../../src/render/SimulationLoop.js';
import { createParams } from '../../src/index.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = {};
    this.listeners = new Map();
    this.value = '';
    this.textContent = '';
    this.type = '';
    this.focused = false;
  }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); return item; }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  remove() { this.removed = true; }
  replaceChildren(...items) { this.children = [...items]; }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  getBoundingClientRect() { return { left: 20, bottom: 40 }; }
}
class FakeDocument {
  createElement(tag) { return new FakeElement(tag); }
  createTextNode(text) { const node = new FakeElement('#text'); node.textContent = text; return node; }
}

function makeControls(extra = {}) {
  const document = new FakeDocument();
  const mount = new FakeElement('main');
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const controls = new SimulationControls({ document, engine, mount, ...extra });
  return { controls, engine, document, mount };
}

function editor(readout) {
  readout.emit('dblclick', { button: 0 });
  return readout.children.find(child => child?.tagName === 'INPUT');
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossNorm = (a, b) => Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);

class FakeGroup {
  constructor() {
    this.children = [];
    this.visible = true;
    this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
    this.quaternion = { x: 0, y: 0, z: 0, w: 1, set: (x, y, z, w) => Object.assign(this.quaternion, { x, y, z, w }) };
  }
  add(...items) { this.children.push(...items); }
}
class FakeMesh {
  constructor(geometry, material) {
    this.geometry = geometry; this.material = material;
    this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1, set: (x, y, z) => Object.assign(this.scale, { x, y, z }) };
    this.quaternion = { setFromUnitVectors() {}, set() {} };
  }
}
class FakeGeometry { constructor(...args) { this.args = args; } dispose() {} }
class FakeMaterial { constructor(options) { this.options = options; } dispose() {} }
const THREE = {
  Group: FakeGroup,
  Mesh: FakeMesh,
  SphereGeometry: class extends FakeGeometry {},
  CylinderGeometry: class extends FakeGeometry {},
  MeshBasicMaterial: FakeMaterial
};

function assertHandsOnAxis(visual) {
  const origin = visual.wheelPosition;
  const direction = [visual.n_w[1], visual.n_w[2], visual.n_w[0]];
  for (const hand of [visual.gripPositions.left, visual.gripPositions.right]) {
    const delta = [hand.x - origin.x, hand.y - origin.y, hand.z - origin.z];
    assert.ok(crossNorm(delta, direction) < 1e-10);
  }
}

test('3N.10-A — doble clic crea un input real, le da foco y Enter sincroniza estado + slider', () => {
  const { controls, engine } = makeControls();
  const input = editor(controls.diameterReadout);
  assert.ok(input);
  assert.equal(input.type, 'number');
  assert.equal(input.focused, true);
  input.value = '1.25';
  input.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(engine.getState().params.D, 1.25);
  assert.equal(Number(controls.diameterSlider.value), 1.25);
  assert.match(controls.diameterReadout.textContent, /1\.25 m/);
});

test('3N.10-A2 — los cuatro parámetros editables abren un input enfocado', () => {
  const { controls } = makeControls();
  for (const readout of [controls.targetReadout, controls.initialSpinReadout, controls.diameterReadout, controls.massReadout]) {
    const input = editor(readout);
    assert.ok(input);
    assert.equal(input.focused, true);
    input.emit('keydown', { key: 'Escape', preventDefault() {} });
  }
});

test('3N.10-B — Escape cancela y conserva el valor anterior', () => {
  const { controls, engine } = makeControls();
  const before = engine.getState().params.m_w;
  const input = editor(controls.massReadout);
  input.value = '7.5';
  input.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(engine.getState().params.m_w, before);
  assert.equal(Number(controls.massSlider.value), before);
  assert.match(controls.massReadout.textContent, /3\.00 kg/);
});

test('3N.10-C — clamp numérico coincide con los límites del slider', () => {
  const { controls, engine } = makeControls();
  let input = editor(controls.targetReadout);
  input.value = '-999';
  input.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(Number(controls.thetaSlider.value), -90);
  assert.equal(engine.getState().theta_target, -Math.PI / 2);

  input = editor(controls.massReadout);
  input.value = '999';
  input.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(Number(controls.massSlider.value), 20);
  assert.equal(engine.getState().params.m_w, 20);
});

test('3N.10-D — reset + pausa + cambio de ángulo redefine la configuración inicial sin avanzar tiempo', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const controller = new SimulationController({ engine });
  const visualAdapter = new PhysicsVisualAdapter({ r_w: createParams().r_w });
  const scene = { person: null, wheel: null, render() {}, updatePhysicsOverlays() {} };
  const renderer = { render() {} };
  const raf = { requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} };
  const loop = new SimulationLoop({ controller, visualAdapter, scene, renderer, requestAnimationFrame: raf.requestAnimationFrame, cancelAnimationFrame: raf.cancelAnimationFrame });

  const controls = makeControls({
    engine,
    onThetaTargetChange: state => {
      const c = controller.getState();
      if (c.status === 'paused' && c.steps === 0 && Math.abs(state.t) < 1e-15) {
        engine.reset({ theta0: state.theta_target });
        loop.syncCurrentState();
      }
    }
  }).controls;

  for (const degrees of [45, -45, 90]) {
    engine.reset({ theta0: 0 });
    controller.reset();
    controller.start();
    controller.pause();
    assert.equal(controller.getState().physics.t, 0);
    assert.equal(controller.getState().steps, 0);

    controls.setTargetDegrees(degrees);
    const state = engine.getState();
    assert.ok(Math.abs(state.theta - degrees * Math.PI / 180) < 1e-14);
    assert.equal(state.t, 0);
    assert.equal(state.theta_target, degrees * Math.PI / 180);
    assert.equal(state.thetaDot, 0);
    assert.deepEqual(state.Omega_b, [0, 0, 0]);
    assert.equal(dot(state.Omega_w, state.n_w), 40);
    assert.equal(controller.getState().steps, 0);

    const visualBeforePlay = visualAdapter.update(state);
    const spinPhase = visualBeforePlay.wheelSpinAngle;
    assertHandsOnAxis(visualBeforePlay);
    assert.notDeepEqual(visualBeforePlay.wheelQuaternion, { x: 0, y: 0, z: 0, w: 1 });
    const visualAfterNoTime = visualAdapter.update(engine.getState());
    assert.equal(visualAfterNoTime.wheelSpinAngle, spinPhase);

    controller.resume();
    controller.advance(engine.getPhysicsDt());
    const started = controller.getState().physics;
    assert.ok(started.t > 0);
    assert.ok(Math.abs(started.theta - degrees * Math.PI / 180) < 1e-12);
  }
});

test('3N.10-E — 0, ±45 y ±90 mantienen mano izquierda → eje → mano derecha inmediatamente', () => {
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const adapter = new PhysicsVisualAdapter({ r_w: createParams().r_w });
  const person = new PersonVisual({ three: THREE });

  for (const degrees of [0, 45, 90, -45, -90]) {
    const state = engine.reset({ theta0: degrees * Math.PI / 180 });
    const visual = adapter.update(state);
    person.setPosition(visual.personPosition);
    person.setOrientation(visual.personQuaternion);
    person.setGripPositionsLocal(visual.gripPositionsLocal);
    assertHandsOnAxis(visual);

    const left = person.leftHand.position;
    const right = person.rightHand.position;
    const axis = visual.gripPositions.right;
    const leftShoulder = person._shoulderLeft;
    const rightShoulder = person._shoulderRight;
    assert.ok(Math.hypot(left.x - leftShoulder.x, left.y - leftShoulder.y, left.z - leftShoulder.z) > 0);
    assert.ok(Math.hypot(right.x - rightShoulder.x, right.y - rightShoulder.y, right.z - rightShoulder.z) > 0);
    assert.equal(visual.n_w.length, 3);
    assert.ok(Math.abs(dot(visual.n_w, visual.n_w) - 1) < 1e-12);
    assert.ok(Number.isFinite(axis.x) && Number.isFinite(axis.y) && Number.isFinite(axis.z));
  }
});

test('3N.10-F — la ruta de ángulo inicial no introduce estado paralelo ni animación artificial', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  assert.match(source, /onThetaTargetChange:/);
  assert.match(source, /if \(status === 'stopped'\)/);
  assert.match(source, /engine\.reset\(\{ theta0: physicsState\.theta_target \}\)/);
  assert.match(source, /if \(status === 'running'\) this\.loop\.refreshCurrentState\(\)/);
  assert.doesNotMatch(source, /status === 'running' && fresh/);
  assert.doesNotMatch(source, /setTimeout|setInterval/);
});
