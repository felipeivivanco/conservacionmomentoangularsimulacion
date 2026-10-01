import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationSpeedControl } from '../../src/app/SimulationSpeedControl.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';

class FakeElement {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.listeners = new Map(); this.value = ''; this.textContent = ''; this.type = ''; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); return item; }
  setAttribute() {}
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  remove() { this.removed = true; }
  focus() {}
  select() {}
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
}
class FakeDocument { createElement(tag) { return new FakeElement(tag); } }

function make() {
  const document = new FakeDocument();
  const mount = new FakeElement('main');
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0,0,0] });
  const controller = new SimulationController({ engine });
  const control = new SimulationSpeedControl({ document, controller, mount });
  return { control, controller, mount };
}

test('A — velocidad inicia en Normal (1.00)', () => {
  const { control, controller } = make();
  assert.equal(controller.getState().timeScale, 1);
  assert.equal(control.slider.min, '0.01');
  assert.equal(control.slider.max, '1');
  assert.equal(control.slider.step, '0.01');
  assert.equal(control.value.textContent, '1.00');
  assert.match(control.root.getAttribute?.('aria-label') ?? 'Velocidad de la Simulación', /Velocidad de la Simulación/);
});

test('B — slider modifica el timeScale del controlador sin tocar la física', () => {
  const { control, controller } = make();
  const before = controller.getState().physics;
  control.slider.value = '0.25';
  control.slider.emit('input');
  const after = controller.getState().physics;
  assert.equal(controller.getState().timeScale, 0.25);
  assert.equal(control.value.textContent, '0.25');
  assert.equal(after.t, before.t);
  assert.deepEqual(after.q, before.q);
});

test('C — 0.01 es el mínimo y 1.00 el máximo', () => {
  const { control, controller } = make();
  control.setValue(-4);
  assert.equal(controller.getState().timeScale, 0.01);
  control.setValue(8);
  assert.equal(controller.getState().timeScale, 1);
});

test('D — el timeScale ralentiza la reproducción sin cambiar el paso físico', () => {
  const fast = make().controller;
  const slow = make().controller;
  fast.setTimeScale(1); slow.setTimeScale(0.1);
  fast.start(); slow.start();
  fast.advance(0.1); slow.advance(0.1);
  assert.ok(fast.getState().physics.t > slow.getState().physics.t);
  assert.equal(fast.getState().physicsDt, slow.getState().physicsDt);
});
