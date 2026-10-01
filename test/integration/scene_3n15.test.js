import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { SimulationLoop } from '../../src/render/SimulationLoop.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { PersonVisual } from '../../src/render/PersonVisual.js';
import { SimulationControls } from '../../src/app/SimulationControls.js';

class RafMock {
  constructor() { this.nextId = 1; this.pending = new Map(); }
  requestAnimationFrame = cb => { const id = this.nextId++; this.pending.set(id, cb); return id; };
  cancelAnimationFrame = id => { this.pending.delete(id); };
  frame(timestamp) {
    assert.equal(this.pending.size, 1);
    const [id, cb] = this.pending.entries().next().value;
    this.pending.delete(id);
    cb(timestamp);
  }
}

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.listeners = new Map(); this.value = ''; }
  append(...items) { items.forEach(item => this.appendChild(item)); }
  appendChild(item) { this.children.push(item); item.parentNode = this; return item; }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  removeEventListener(type) { this.listeners.delete(type); }
  remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
  focus() {}
  select() {}
}
class FakeDocument { createElement(tag) { return new FakeElement(tag); } createTextNode(text) { const e = new FakeElement('#text'); e.textContent = text; return e; } }

function makeHarness({ mode = 'VerticalBearing', theta0 = 0, s0 = 40, person = true } = {}) {
  const engine = EngineAdapter.create({ mode, params: createParams({ s0 }), theta0, Omega0: [0, 0, 0] });
  const controller = new SimulationController({ engine });
  const visualAdapter = new PhysicsVisualAdapter({ r_w: createParams().r_w, bodyOriginY: 0.9 });
  const scene = {
    renders: 0,
    wheel: null,
    platform: null,
    person: person ? {
      positions: [], orientations: [], grips: [],
      setPosition(v) { this.positions.push(structuredClone(v)); },
      setOrientation(v) { this.orientations.push(structuredClone(v)); },
      setGripPositionsLocal(v) { this.grips.push(structuredClone(v)); }
    } : null,
    render() { this.renders += 1; },
    updatePhysicsOverlays() {}
  };
  const renderer = { renders: 0, states: [], render(v) { this.renders += 1; this.states.push(structuredClone(v)); } };
  const raf = new RafMock();
  const loop = new SimulationLoop({ controller, visualAdapter, scene, renderer, requestAnimationFrame: raf.requestAnimationFrame, cancelAnimationFrame: raf.cancelAnimationFrame });
  return { engine, controller, visualAdapter, scene, renderer, raf, loop };
}

function qRotate(v, q) {
  const [w, x, y, z] = q;
  const [vx, vy, vz] = v;
  const t = [2 * (y * vz - z * vy), 2 * (z * vx - x * vz), 2 * (x * vy - y * vx)];
  return [vx + w * t[0] + (y * t[2] - z * t[1]), vy + w * t[1] + (z * t[0] - x * t[2]), vz + w * t[2] + (x * t[1] - y * t[0])];
}
function norm(v) { return Math.hypot(v[0], v[1], v[2]); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function sub(a, b) { return a.map((x, i) => x - b[i]); }
function maxAbs(v) { return Math.max(...v.map(Math.abs)); }

function assertGripAxis(v, theta, q) {
  const nBody = [Math.cos(theta), 0, Math.sin(theta)];
  const nWorld = qRotate(nBody, q);
  const nVisual = [nWorld[1], nWorld[2], nWorld[0]];
  const center = [v.wheelPosition.x, v.wheelPosition.y, v.wheelPosition.z];
  for (const grip of [v.gripPositions.left, v.gripPositions.right]) {
    const p = [grip.x, grip.y, grip.z];
    assert.ok(maxAbs(cross(sub(p, center), nVisual)) < 1e-12, `grip is not on effective axle: ${JSON.stringify({p, center, nVisual})}`);
  }
  const between = sub([v.gripPositions.left.x, v.gripPositions.left.y, v.gripPositions.left.z], [v.gripPositions.right.x, v.gripPositions.right.y, v.gripPositions.right.z]);
  const alignment = Math.abs((between[0] * nVisual[0] + between[1] * nVisual[1] + between[2] * nVisual[2]) / (norm(between) * norm(nVisual)));
  assert.ok(Math.abs(alignment - 1) < 1e-12);
}

test('3N.15-A — thetaOverride sincroniza rueda, eje y ambas manos con el mismo eje efectivo', () => {
  const q = [Math.cos(Math.PI / 8), 0, Math.sin(Math.PI / 8), 0];
  const adapter = new PhysicsVisualAdapter({ r_w: [0, 0.6, 0.4], bodyOriginY: 0 });
  const physics = { q, theta: 0, n_w: [1, 0, 0], Omega_w: [0, 0, 0], t: 0, params: createParams({ s0: 0 }) };
  for (const theta of [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4, -Math.PI / 2]) {
    const v = adapter.update(physics, { thetaOverride: theta });
    assert.equal(v.theta, theta);
    assertGripAxis(v, theta, q);
    assert.ok(Number.isFinite(v.wheelQuaternion.w));
  }
});

test('3N.15-B — cambiar de escena pausa la anterior, cancela su RAF y conserva estado', () => {
  const platform = makeHarness({ mode: 'VerticalBearing', s0: 40 });
  const vacuum = makeHarness({ mode: 'Free', s0: 40 });
  platform.loop.start(); platform.raf.frame(0); platform.raf.frame(1000 / 60);
  const beforeSwitch = platform.controller.getState();
  assert.equal(beforeSwitch.status, 'running');
  platform.loop.pause();
  platform.loop.setPresentationActive(false);
  assert.equal(platform.raf.pending.size, 0);
  const paused = platform.controller.getState();
  platform.raf.pending.clear();
  assert.equal(paused.steps, beforeSwitch.steps);
  assert.equal(paused.physics.t, beforeSwitch.physics.t);
  vacuum.loop.start(); vacuum.raf.frame(0); vacuum.raf.frame(1000 / 60);
  vacuum.loop.pause(); vacuum.loop.setPresentationActive(false);
  platform.loop.setPresentationActive(true);
  platform.loop.resume();
  assert.equal(platform.controller.getState().status, 'running');
  assert.equal(platform.raf.pending.size, 1);
  assert.equal(platform.controller.getState().physics.t, paused.physics.t);
});

for (const [label, theta] of [['C', Math.PI / 2], ['D', -Math.PI / 2]]) {
  test(`3N.15-${label} — omega rueda = 0 en theta=${theta > 0 ? '+90' : '-90'}° no produce giro físico espurio`, () => {
    const params = createParams({ s0: 0 });
    const engine = EngineAdapter.create({ mode: 'VerticalBearing', params, theta0: theta, Omega0: [0, 0, 0] });
    const controller = new SimulationController({ engine });
    controller.start();
    controller.advance(params.dt);
    const s = controller.getState();
    assert.equal(s.status, 'running');
    assert.deepEqual(s.physics.Omega_b, [0, 0, 0]);
    assert.deepEqual(s.physics.Omega_w, [0, 0, 0]);
    assert.equal(s.physics.theta, theta);
    assert.equal(s.physics.thetaDot, 0);
    assert.deepEqual(s.physics.L_wheel, [0, 0, 0]);
    assert.deepEqual(s.physics.L_body, [0, 0, 0]);
    assert.deepEqual(s.physics.L_total, [0, 0, 0]);
    assert.deepEqual(s.physics.q, [1, 0, 0, 0]);
  });
}

test('3N.15-E/F — render inicial detenido conecta brazos y manos con el eje en Vacío y Plataforma', () => {
  for (const mode of ['Free', 'VerticalBearing']) {
    const h = makeHarness({ mode, theta0: 0, s0: 40 });
    h.loop.reset();
    const v = h.loop.getVisualState();
    assertGripAxis(v, 0, [1, 0, 0, 0]);
    assert.equal(h.controller.getState().status, 'stopped');
    assert.equal(h.controller.getState().steps, 0);
    assert.equal(h.controller.getState().physics.t, 0);
    assert.ok(h.scene.person.grips.length > 0);
  }
});

test('3N.15-G — ambas escenas se configuran inicialmente stopped y sin auto-start', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  const starts = [...source.matchAll(/start:\s*(true|false)/g)].map(m => m[1]);
  assert.deepEqual(starts, ['false', 'false']);
});

test('3N.15-H — Play desde stopped inicia realmente el loop y el controller', () => {
  const h = makeHarness();
  assert.equal(h.controller.getState().status, 'stopped');
  h.loop.toggleLifecycle();
  assert.equal(h.controller.getState().status, 'running');
  assert.equal(h.raf.pending.size, 1);
  h.raf.frame(0); h.raf.frame(1000 / 60);
  assert.ok(h.controller.getState().steps > 0);
  assert.ok(h.controller.getState().physics.t > 0);
});

test('3N.15-I/J — reset desde running y paused termina siempre stopped y en t=0', () => {
  for (const initial of ['running', 'paused']) {
    const h = makeHarness();
    h.loop.start(); h.raf.frame(0); h.raf.frame(1000 / 60);
    if (initial === 'paused') h.loop.pause();
    assert.equal(h.controller.getState().status, initial);
    h.loop.reset();
    const s = h.controller.getState();
    assert.equal(s.status, 'stopped');
    assert.equal(s.steps, 0);
    assert.equal(s.physics.t, 0);
    assert.equal(s.physics.W_act, 0);
    assert.equal(s.physics.W_control, 0);
    assert.equal(h.raf.pending.size, 0);
  }
});

test('3N.15-K — múltiples cambios de escena no crean RAF físicos duplicados', () => {
  const a = makeHarness();
  const b = makeHarness({ mode: 'Free' });
  for (let i = 0; i < 5; i += 1) {
    if (a.controller.getState().status === 'paused') a.loop.resume(); else a.loop.start();
    assert.equal(a.raf.pending.size, 1);
    a.loop.pause(); a.loop.setPresentationActive(false);
    assert.equal(a.raf.pending.size, 0);
    if (b.controller.getState().status === 'paused') b.loop.resume(); else b.loop.start();
    assert.equal(b.raf.pending.size, 1);
    b.loop.pause(); b.loop.setPresentationActive(false);
    assert.equal(b.raf.pending.size, 0);
    a.loop.setPresentationActive(true); b.loop.setPresentationActive(true);
    assert.equal(a.raf.pending.size, 0);
    assert.equal(b.raf.pending.size, 0);
  }
});

test('3N.15-L/M/N/O/P/R — astronauta: una esfera, sin geometría facial separada, azul, sin sombras de cabeza/torso y región cuadrada', async () => {
  const source = await fs.readFile(new URL('../../src/render/PersonVisual.js', import.meta.url), 'utf8');
  assert.match(source, /const headGeometry = new SphereGeometry\(headRadius, 16, 12\)/);
  assert.match(source, /new Mesh\(headGeometry, astronaut \? \[headMaterial, faceMaterial\] : headMaterial\)/);
  assert.doesNotMatch(source, /CircleGeometry/);
  assert.doesNotMatch(source, /PlaneGeometry/);
  assert.doesNotMatch(source, /new Mesh\([^\n]*(?:CircleGeometry|PlaneGeometry)/);
  assert.match(source, /const astronautBlue = options\.faceColor \?\? 0x4b78a8/);
  assert.match(source, /const face = astronaut \? head : null/);
  assert.match(source, /headGroup\.add\(leftEye, rightEye\)/);
  assert.match(source, /torsoShade\.visible = false/);
  assert.match(source, /const headShadeMaterial = astronaut \? null/);
  assert.match(source, /new Mesh\(headGeometry, astronaut \? \[headMaterial, faceMaterial\]/);
  assert.match(source, /const faceRegion = nx >= 0\.68 && Math\.abs\(ny\) <= 0\.38 && Math\.abs\(nz\) <= 0\.38/);
  assert.doesNotMatch(source, /Math\.cos\(40 \* Math\.PI \/ 180\)/);
  assert.match(source, /const materialIndex = faceRegion \? 1 : 0/);
});

test('3N.15-Q — panel visible y aria-label dicen exactamente Parámetros', async () => {
  const source = await fs.readFile(new URL('../../src/app/PhysicsDiagnostics.js', import.meta.url), 'utf8');
  assert.match(source, /aria-label', 'Parámetros'/);
  assert.match(source, /title\.textContent = 'Parámetros'/);
});

test('3N.15-S — reset de SceneRuntime no contiene auto-reanudación y ambas escenas arrancan stopped', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  const reset = source.slice(source.indexOf('  reset() {'), source.indexOf('\n  setVisible(visible)', source.indexOf('  reset() {')));
  assert.doesNotMatch(reset, /wasRunning|wasPaused|\.loop\.start\(\)/);
  assert.match(reset, /this\.loop\.stop\(\)/);
  assert.match(reset, /this\.loop\.reset\(\)/);
});
