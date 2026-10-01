import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationControls } from '../../src/app/SimulationControls.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
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
  }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); return item; }
  setAttribute() {}
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  remove() { this.removed = true; }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
}

class FakeDocument {
  createElement(tag) { return new FakeElement(tag); }
}

function makeControls() {
  const document = new FakeDocument();
  const mount = new FakeElement('main');
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const controls = new SimulationControls({ document, engine, mount });
  return { controls, engine, mount };
}

test('A — UI 90° converts to Math.PI/2', () => {
  const { controls, engine } = makeControls();
  controls.setTargetDegrees(90);
  assert.equal(engine.getState().theta_target, Math.PI / 2);
  assert.equal(controls.getState().targetDegrees, 90);
});

test('B — UI -90° converts to -Math.PI/2', () => {
  const { controls, engine } = makeControls();
  controls.setTargetDegrees(-90);
  assert.equal(engine.getState().theta_target, -Math.PI / 2);
  assert.equal(controls.getState().targetDegrees, -90);
});

test('C — slider input delegates theta_target through EngineAdapter', () => {
  const { controls, engine } = makeControls();
  controls.slider.value = '45';
  controls.slider.emit('input');
  assert.equal(engine.getState().theta_target, Math.PI / 4);
});

test('D — el ángulo actual ya no se presenta y el objetivo sigue siendo visible', () => {
  const { controls } = makeControls();
  controls.setTargetDegrees(90);
  assert.equal(controls.actualReadout, undefined);
  assert.match(controls.targetReadout.textContent, /90\.0°/);
});

test('E — 0° target does not force theta when the motor is already elsewhere', () => {
  const { controls, engine } = makeControls();
  engine.setThetaTarget(Math.PI / 2);
  for (let i = 0; i < 120; i += 1) engine.step(engine.getPhysicsDt());
  const before = engine.getState().theta;
  controls.setTargetDegrees(0);
  const after = engine.getState();
  assert.ok(Math.abs(after.theta - before) < 1e-10);
  assert.equal(after.theta_target, 0);
});

test('F — reset returns target, actual indicator and slider to 0°', () => {
  const { controls, engine } = makeControls();
  controls.setTargetDegrees(90);
  for (let i = 0; i < 120; i += 1) engine.step(engine.getPhysicsDt());
  engine.reset();
  controls.reset(engine.getState());
  assert.equal(engine.getState().theta_target, 0);
  assert.equal(controls.getState().targetDegrees, 0);
  assert.match(controls.targetReadout.textContent, /0\.0°/);
});


test('G — pause button toggles its label through the application callback', () => {
  const document = new FakeDocument();
  const mount = new FakeElement('main');
  let lifecycle = 'stopped';
  const controls = new SimulationControls({ document, engine: EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] }), mount, onTogglePause: () => {
    lifecycle = lifecycle === 'stopped' ? 'running' : lifecycle === 'running' ? 'paused' : 'running';
    return lifecycle;
  } });
  assert.match(controls.pauseButton.textContent, /▶ Iniciar simulación/);
  controls.pauseButton.emit('click');
  assert.match(controls.pauseButton.textContent, /⏸ Pausar simulación/);
  assert.equal(lifecycle, 'running');
  controls.pauseButton.emit('click');
  assert.match(controls.pauseButton.textContent, /▶ Reanudar simulación/);
  assert.equal(lifecycle, 'paused');
  controls.pauseButton.emit('click');
  assert.match(controls.pauseButton.textContent, /⏸ Pausar simulación/);
  assert.equal(lifecycle, 'running');
});


test('H — spin control uses the physical UI nomenclature and keeps rad/s', () => {
  const { controls } = makeControls();
  assert.equal(controls.spinLabel.textContent, 'Velocidad angular de la rueda');
  assert.equal(controls.spinSlider.getAttribute?.('aria-label') ?? 'Velocidad angular de la rueda', 'Velocidad angular de la rueda');
  assert.equal(controls.initialSpinReadout.textContent, '40.00 rad/s');
  assert.equal(controls.wheelSpinReadout, undefined);
  assert.equal(controls.readout.children.filter?.(child => /Velocidad angular/.test(child.textContent)).length ?? 0, 0);
  assert.equal(controls.spinSlider.min, '0');
  assert.equal(controls.spinSlider.max, '80');
  assert.equal(controls.spinSlider.step, '1');
});

test('I — el control de momento de inercia ya no aparece; D y masa siguen siendo físicos', () => {
  const { controls, engine } = makeControls();
  assert.equal(controls.inertiaSlider, undefined);
  assert.equal(controls.inertiaLabel, undefined);
  assert.ok(controls.inertiaReadout);
  assert.match(controls.inertiaReadout.textContent, /Momento de inercia:/);
  controls.diameterSlider.value = '1.20';
  controls.diameterSlider.emit('input');
  assert.equal(engine.getState().params.D, 1.20);
  assert.equal(controls.getState().D, 1.20);
});

test('J — live velocity control changes physical wheel speed, not theta_target', () => {
  const { controls, engine } = makeControls();
  controls.setTargetDegrees(45);
  controls.spinSlider.value = '60';
  controls.spinSlider.emit('input');
  const state = engine.getState();
  const axial = state.Omega_w[0]*state.n_w[0] + state.Omega_w[1]*state.n_w[1] + state.Omega_w[2]*state.n_w[2];
  assert.equal(axial, 60);
  assert.equal(state.theta_target, Math.PI/4);
  assert.equal(controls.initialSpinReadout.textContent, '60.00 rad/s');
  assert.equal(controls.getState().wheelSpin, 60);
});

test('K — cambiar D puede ajustar Ia internamente sin exponer un control manual', () => {
  const { controls, engine } = makeControls();
  controls.diameterSlider.value = '0.20';
  controls.diameterSlider.emit('input');
  const state = engine.getState();
  const maxIa = state.params.m_w * state.params.R ** 2;
  assert.ok(state.params.Ia <= maxIa + 1e-14);
  assert.equal(controls.inertiaSlider, undefined);
});


test('L — diámetro llega a 8 m y masa modifica el parámetro físico', () => {
  const { controls, engine } = makeControls();
  controls.diameterSlider.value='8.00'; controls.diameterSlider.emit('input');
  assert.equal(engine.getState().params.D,8);
  controls.massSlider.value='5.00'; controls.massSlider.emit('input');
  assert.equal(engine.getState().params.m_w,5);
  assert.equal(controls.getState().mass,5);
});

test('N — el resumen superior actualiza I con el estado físico en vivo', () => {
  const { controls, engine } = makeControls();
  const initial = engine.getState().params.Ia;
  controls.diameterSlider.value = '0.20';
  controls.diameterSlider.emit('input');
  const afterD = engine.getState().params.Ia;
  assert.equal(controls.getState().Ia, afterD);
  assert.match(controls.inertiaReadout.textContent, new RegExp(afterD.toFixed(4)));
  controls.massSlider.value = '5.00';
  controls.massSlider.emit('input');
  const afterM = engine.getState().params.Ia;
  assert.equal(controls.getState().Ia, afterM);
  assert.match(controls.inertiaReadout.textContent, new RegExp(afterM.toFixed(4)));
  assert.notEqual(initial, afterD);
});

test('3N.3-I — el cambio físico notifica inmediatamente el nuevo I al diagnóstico externo', () => {
  const document = new FakeDocument(); const mount = new FakeElement('main');
  let notified = null;
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const controls = new SimulationControls({ document, engine, mount, onPhysicalStateChange: state => { notified = state; } });
  controls.diameterSlider.value = '0.20'; controls.diameterSlider.emit('input');
  assert.ok(notified);
  assert.equal(notified.params.Ia, engine.getState().params.Ia);
  assert.match(controls.inertiaReadout.textContent, new RegExp(notified.params.Ia.toFixed(4)));
});

test('M — sólo ejes y vectores tienen controles de visibilidad; las leyes no tienen checkbox', () => {
  const document = new FakeDocument(); const mount = new FakeElement('main');
  const calls=[];
  const controls = new SimulationControls({document,engine:EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]}),mount,onOverlayToggle:(name,visible)=>calls.push([name,visible])});
  controls.overlayChecks.axes.checked=true; controls.overlayChecks.axes.emit('change');
  controls.overlayChecks.vectors.checked=true; controls.overlayChecks.vectors.emit('change');
  assert.equal(controls.overlayChecks.laws, undefined);
  assert.deepEqual(calls,[['axes',true],['vectors',true]]);
});
