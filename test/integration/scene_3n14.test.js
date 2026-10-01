import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { SimulationLoop } from '../../src/render/SimulationLoop.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { SimulationControls } from '../../src/app/SimulationControls.js';
import { CameraInputController } from '../../src/render/CameraInputController.js';


class RafMock {
  constructor() { this.nextId = 1; this.pending = new Map(); }
  requestAnimationFrame = callback => { const id = this.nextId++; this.pending.set(id, callback); return id; };
  cancelAnimationFrame = id => { this.pending.delete(id); };
  frame(timestamp) {
    assert.equal(this.pending.size, 1, 'debe existir exactamente un RAF físico pendiente');
    const [id, callback] = this.pending.entries().next().value;
    this.pending.delete(id);
    callback(timestamp);
  }
}

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.listeners = new Map(); this.value = ''; this.parentNode = null; }
  append(...items) { items.forEach(item => this.appendChild(item)); }
  appendChild(item) { this.children.push(item); if (item && typeof item === 'object') item.parentNode = this; return item; }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
  focus() {}
  select() {}
}
class FakeDocument {
  createElement(tag) { return new FakeElement(tag); }
  createTextNode(text) { const n = new FakeElement('#text'); n.textContent = text; return n; }
}

function makeLoop({ mode = 'Free', theta0 = 0, s0 = 40 } = {}) {
  const engine = EngineAdapter.create({ mode, params: createParams({ s0 }), theta0, Omega0: [0, 0, 0] });
  const controller = new SimulationController({ engine });
  const visualAdapter = new PhysicsVisualAdapter({ r_w: createParams().r_w, bodyOriginY: 0 });
  const scene = { renders: 0, wheel: null, person: null, platform: null, render() { this.renders += 1; }, updatePhysicsOverlays() {} };
  const renderer = { renders: 0, render() { this.renders += 1; } };
  const raf = new RafMock();
  const loop = new SimulationLoop({ controller, visualAdapter, scene, renderer, requestAnimationFrame: raf.requestAnimationFrame, cancelAnimationFrame: raf.cancelAnimationFrame });
  return { engine, controller, loop, scene, renderer, raf };
}

function makeControls(harness) {
  const document = new FakeDocument();
  const mount = new FakeElement('main');
  const controls = new SimulationControls({
    document,
    engine: harness.engine,
    mount,
    onTogglePause: () => harness.loop.toggleLifecycle(),
    onThetaTargetChange: state => {
      const c = harness.controller.getState();
      const fresh = c.steps === 0 && Math.abs(state.t) <= 1e-15;
      if (fresh && (c.status === 'stopped' || c.status === 'paused' || c.status === 'running')) {
        harness.engine.reset({ theta0: state.theta_target });
        harness.loop.syncCurrentState();
      } else if (c.status === 'paused') {
        harness.loop.setPresentationThetaOverride(state.theta_target);
      }
    }
  });
  controls.setLifecycleStatus(harness.controller.getState().status);
  return controls;
}

test('3N.14-A/B/C — STOPPED → RUNNING → PAUSED → RUNNING actualiza estado y botón', () => {
  const h = makeLoop();
  const controls = makeControls(h);
  assert.equal(h.controller.getState().status, 'stopped');
  assert.equal(controls.pauseButton.textContent, '▶ Iniciar simulación');
  controls.pauseButton.emit('click');
  assert.equal(h.controller.getState().status, 'running');
  assert.equal(controls.pauseButton.textContent, '⏸ Pausar simulación');
  controls.pauseButton.emit('click');
  assert.equal(h.controller.getState().status, 'paused');
  assert.equal(controls.pauseButton.textContent, '▶ Reanudar simulación');
  controls.pauseButton.emit('click');
  assert.equal(h.controller.getState().status, 'running');
  assert.equal(controls.pauseButton.textContent, '⏸ Pausar simulación');
});

test('3N.14-D — múltiples ciclos Play/Pause ejecutan la transición real en cada click', () => {
  const h = makeLoop();
  const controls = makeControls(h);
  for (const expected of ['running', 'paused', 'running', 'paused', 'running']) {
    controls.pauseButton.emit('click');
    assert.equal(h.controller.getState().status, expected);
    const label = expected === 'running' ? '⏸ Pausar simulación' : '▶ Reanudar simulación';
    assert.match(controls.pauseButton.textContent, new RegExp(expected === 'running' ? 'Pausar' : 'Reanudar'));
    assert.equal(controls.pauseButton.textContent, label);
  }
});

test('3N.14-E/F/S — Vacío empieza stopped y Play realmente hace avanzar t y steps', () => {
  const h = makeLoop({ mode: 'Free' });
  assert.equal(h.controller.getState().status, 'stopped');
  assert.equal(h.controller.getState().steps, 0);
  h.loop.toggleLifecycle();
  assert.equal(h.controller.getState().status, 'running');
  h.raf.frame(0);
  h.raf.frame(1000 / 60);
  const state = h.controller.getState();
  assert.equal(state.status, 'running');
  assert.ok(state.steps > 0);
  assert.ok(state.physics.t > 0);
  assert.ok(h.scene.renders >= 2);
});

test('3N.14-G/H/I/T — la cámara solicita render estando stopped/paused sin tocar t, steps ni advance()', () => {
  const events = new Map();
  const element = {
    addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {}
  };
  const camera = {
    azimuth: 0, distance: 5,
    orbit(dx, dy) { this.azimuth += dx; this.pitch = dy; },
    zoom(delta) { this.distance += delta; }
  };
  let renders = 0;
  const input = new CameraInputController({ element, cameraController: camera, onCameraChange: () => { renders += 1; } });
  const h = makeLoop();
  let advances = 0;
  const originalAdvance = h.controller.advance.bind(h.controller);
  h.controller.advance = delta => { advances += 1; return originalAdvance(delta); };
  const beforeStopped = h.controller.getState();
  events.get('pointerdown')({ button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  events.get('pointermove')({ pointerId: 1, clientX: 30, clientY: 10 });
  events.get('wheel')({ deltaY: -10, preventDefault() {} });
  const afterStopped = h.controller.getState();
  assert.equal(renders, 2);
  assert.equal(advances, 0);
  assert.equal(afterStopped.steps, beforeStopped.steps);
  assert.equal(afterStopped.physics.t, beforeStopped.physics.t);

  h.loop.start();
  h.raf.frame(0);
  h.loop.pause();
  const beforePaused = h.controller.getState();
  events.get('pointermove')({ pointerId: 1, clientX: 60, clientY: 20 });
  events.get('wheel')({ deltaY: 10, preventDefault() {} });
  const afterPaused = h.controller.getState();
  assert.ok(renders >= 4);
  assert.equal(afterPaused.steps, beforePaused.steps);
  assert.equal(afterPaused.physics.t, beforePaused.physics.t);
  assert.equal(advances, 1);
  input.dispose();
});

test('3N.14-J — STOPPED theta cambia físicamente de inmediato sin avanzar t/steps', () => {
  const h = makeLoop({ mode: 'VerticalBearing', theta0: 0 });
  const controls = makeControls(h);
  controls.setTargetDegrees(45);
  const state = h.controller.getState();
  assert.ok(Math.abs(state.physics.theta - Math.PI / 4) < 1e-14);
  assert.equal(state.physics.t, 0);
  assert.equal(state.steps, 0);
});

test('3N.14-K — PAUSED theta solicitado cambia la presentación inmediatamente sin avanzar física', () => {
  const h = makeLoop({ mode: 'VerticalBearing', theta0: 0 });
  const controls = makeControls(h);
  h.loop.start();
  h.raf.frame(0);
  h.raf.frame(1000 / 60);
  h.loop.pause();
  const before = h.controller.getState();
  controls.setTargetDegrees(60);
  const after = h.controller.getState();
  const visual = h.loop.getVisualState();
  assert.equal(after.status, 'paused');
  assert.equal(after.steps, before.steps);
  assert.equal(after.physics.t, before.physics.t);
  assert.equal(after.physics.theta_target, Math.PI / 3);
  assert.equal(visual.theta, Math.PI / 3);
});

test('3N.14-L — RUNNING theta cambia el target inmediatamente y la siguiente presentación avanza físicamente', () => {
  const h = makeLoop({ mode: 'VerticalBearing', theta0: 0 });
  const controls = makeControls(h);
  h.loop.start();
  h.raf.frame(0);
  const before = h.controller.getState();
  controls.setTargetDegrees(45);
  const commanded = h.controller.getState();
  assert.equal(commanded.status, 'running');
  assert.equal(commanded.steps, before.steps);
  assert.equal(commanded.physics.theta_target, Math.PI / 4);
  h.raf.frame(1000 / 60);
  const after = h.controller.getState();
  assert.ok(after.steps > before.steps);
  assert.ok(after.physics.theta !== before.physics.theta);
});

test('3N.14-M/N/O/P — astronauta usa una sola esfera, sin CircleGeometry/PlaneGeometry, con región azul y ojos ligados al headGroup', async () => {
  const source = await fs.readFile(new URL('../../src/render/PersonVisual.js', import.meta.url), 'utf8');
  assert.match(source, /const headGeometry = new SphereGeometry\(headRadius, 16, 12\)/);
  assert.match(source, /new Mesh\(headGeometry, astronaut \? \[headMaterial, faceMaterial\]/);
  assert.match(source, /_configureAstronautHeadMaterials\(headGeometry, headRadius\)/);
  assert.doesNotMatch(source, /CircleGeometry/);
  assert.doesNotMatch(source, /PlaneGeometry/);
  assert.doesNotMatch(source, /new Mesh\([^\n]*CircleGeometry/);
  assert.doesNotMatch(source, /new Mesh\([^\n]*PlaneGeometry/);
  assert.match(source, /const astronautBlue = options\.faceColor \?\? 0x4b78a8/);
  assert.match(source, /const face = astronaut \? head : null/);
  assert.match(source, /headGroup\.add\(leftEye, rightEye\)/);
  assert.match(source, /this\.face = face/);
});

test('3N.14-Q — escenas mantienen engines/controllers independientes', () => {
  const platform = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0 });
  const vacuum = EngineAdapter.create({ mode: 'Free', params: createParams({ s0: 40 }), theta0: 0 });
  platform.setThetaTarget(Math.PI / 4);
  platform.step(platform.getPhysicsDt());
  const vacuumState = vacuum.getState();
  assert.equal(vacuumState.t, 0);
  assert.equal(vacuumState.theta_target, 0);
  assert.deepEqual(vacuumState.q, [1, 0, 0, 0]);
});

test('3N.14-R — cambiar de escena no deja dos loops físicos corriendo', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  assert.match(source, /setActive\(active\)/);
  assert.match(source, /if \(!active && this\.controller\.getState\(\)\.status === 'running'\)/);
  assert.match(source, /this\.loop\.pause\(\)/);
  assert.match(source, /runtime\.setActive\(id === this\._activeScene\)/);
  assert.match(source, /platform:[\s\S]*start: false/);
  assert.match(source, /space: true, start: false/);
});

test('3N.14-R2 — desactivar la escena cancela su RAF de presentación y reactivarla no crea duplicados', () => {
  const h = makeLoop();
  h.loop.start();
  assert.equal(h.raf.pending.size, 1);
  h.loop.pause();
  h.loop.setPresentationActive(false);
  assert.equal(h.raf.pending.size, 0);
  h.loop.setPresentationActive(true);
  assert.equal(h.raf.pending.size, 0, 'una escena pausada no debe conservar un RAF físico/presentación');
  h.loop.resume();
  assert.equal(h.raf.pending.size, 1);
  h.loop.pause();
  h.loop.stop();
  assert.equal(h.raf.pending.size, 0);
});

test('3N.14-S — la lógica de Vacío no depende de un Play alternativo y usa el mismo ciclo de vida', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  assert.equal((source.match(/onTogglePause:/g) || []).length, 1);
  assert.match(source, /onTogglePause: \(\) => this\.togglePause\(\)/);
  assert.match(source, /this\.loop\.toggleLifecycle\(\)/);
  assert.doesNotMatch(source, /vacuum.*play|play.*vacuum/i);
});

test('3N.14-T — el callback de cámara no llama advance ni toca el controlador', async () => {
  const source = await fs.readFile(new URL('../../src/render/CameraInputController.js', import.meta.url), 'utf8');
  const presentation = await fs.readFile(new URL('../../src/render/CameraPresentation.js', import.meta.url), 'utf8');
  assert.match(source, /onCameraChange/);
  assert.doesNotMatch(source, /SimulationController|EngineAdapter|\.advance\s*\(|\.step\s*\(/);
  assert.match(presentation, /onCameraChange/);
  assert.match(presentation, /this\.scene\.render/);
});
