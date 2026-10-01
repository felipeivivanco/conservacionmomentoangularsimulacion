import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationControls } from '../../src/app/SimulationControls.js';
import { PhysicsDiagnostics } from '../../src/app/PhysicsDiagnostics.js';
import { PhysicsLawsOverlay } from '../../src/render/PhysicsLawsOverlay.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';

class FakeElement {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.listeners = new Map(); this.value = ''; this.textContent = ''; this.type = ''; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); return item; }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  remove() { this.removed = true; }
  replaceChildren(...items) { this.children = [...items]; }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
  focus() {}
  select() {}
}
class FakeDocument { createElement(tag) { return new FakeElement(tag); } }

function makeControls() {
  const document = new FakeDocument();
  const mount = new FakeElement('main');
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const controls = new SimulationControls({ document, engine, mount });
  return { controls, engine, document, mount };
}

function edit(readout, value, key = 'Enter') {
  readout.emit('dblclick');
  const input = readout.children.find?.(child => child?.tagName === 'INPUT') ?? readout.children[readout.children.length - 1];
  input.value = String(value);
  if (key === 'Escape') input.emit('keydown', { key: 'Escape' });
  else input.emit('keydown', { key: 'Enter' });
  return input;
}

test('3N.9-A — Definiciones Físicas reemplaza a Leyes Físicas', () => {
  const d = new FakeDocument(); const mount = new FakeElement('main');
  const overlay = new PhysicsLawsOverlay({ document: d, mount });
  assert.match(overlay.toggle.textContent, /Definiciones Físicas/);
  assert.doesNotMatch(overlay.toggle.textContent, /Leyes físicas/i);
});

test('3N.9-B — no existe presentación de Ángulo actual', () => {
  const { controls } = makeControls();
  assert.equal(controls.actualReadout, undefined);
  assert.doesNotMatch(controls.readout.children.map(x => x.textContent).join(' '), /Objetivo:|Velocidad angular|Diámetro:|Masa:/);
  assert.match(controls.targetReadout.textContent, /0\.0°/);
});

test('3N.9-C — doble clic + Enter usa el mismo camino del ángulo objetivo', () => {
  const { controls, engine } = makeControls();
  edit(controls.targetReadout, 37.5);
  assert.ok(Math.abs(engine.getState().theta_target - 37.5 * Math.PI / 180) < 1e-14);
  assert.equal(Number(controls.thetaSlider.value), 37.5);
  assert.match(controls.targetReadout.textContent, /37\.5°/);
});

test('3N.9-D — Escape cancela una edición numérica', () => {
  const { controls, engine } = makeControls();
  const before = engine.getState().params.D;
  edit(controls.diameterReadout, 2.5, 'Escape');
  assert.equal(engine.getState().params.D, before);
  assert.match(controls.diameterReadout.textContent, /0\.68 m/);
});

test('3N.9-E — blur confirma y limita al mínimo/máximo', () => {
  const { controls, engine } = makeControls();
  controls.diameterReadout.emit('dblclick');
  let input = controls.diameterReadout.children.find?.(child => child?.tagName === 'INPUT') ?? controls.diameterReadout.children.at(-1); input.value = '-10'; input.emit('blur');
  assert.equal(engine.getState().params.D, 0.20);
  assert.equal(Number(controls.diameterSlider.value), 0.20);

  controls.massReadout.emit('dblclick');
  input = controls.massReadout.children.find?.(child => child?.tagName === 'INPUT') ?? controls.massReadout.children.at(-1); input.value = '999'; input.emit('blur');
  assert.equal(engine.getState().params.m_w, 20.00);
  assert.equal(Number(controls.massSlider.value), 20.00);
});

test('3N.9-F — valores válidos de D y masa se aplican exactamente y sincronizan slider', () => {
  const { controls, engine } = makeControls();
  edit(controls.diameterReadout, 0.68);
  assert.equal(engine.getState().params.D, 0.68);
  assert.equal(Number(controls.diameterSlider.value), 0.68);
  edit(controls.massReadout, 4.25);
  assert.equal(engine.getState().params.m_w, 4.25);
  assert.equal(Number(controls.massSlider.value), 4.25);
});

test('3N.9-G — spin manual mantiene el setter físico y sincroniza slider', () => {
  const { controls, engine } = makeControls();
  edit(controls.initialSpinReadout, 63);
  assert.equal(engine.getState().params.s0, 63);
  assert.equal(Number(controls.spinSlider.value), 63);
  assert.match(controls.initialSpinReadout.textContent, /63\.00 rad\/s/);
});

test('3N.9-H — entrada no numérica conserva el valor anterior', () => {
  const { controls, engine } = makeControls();
  const before = engine.getState().params.m_w;
  controls.massReadout.emit('dblclick');
  const input = controls.massReadout.children.find?.(child => child?.tagName === 'INPUT') ?? controls.massReadout.children.at(-1); input.value = 'no-num'; input.emit('keydown', { key: 'Enter' });
  assert.equal(engine.getState().params.m_w, before);
  assert.match(controls.massReadout.textContent, /3\.00 kg/);
});

test('3N.9-I — Y de L humano tiene ayuda contextual específica', () => {
  const d = new FakeDocument(); const mount = new FakeElement('main');
  const diagnostics = new PhysicsDiagnostics({ document: d, mount });
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  engine.setThetaTarget(Math.PI / 2);
  for (let i = 0; i < 400; i += 1) { const s = engine.step(engine.getPhysicsDt()); if (s.theta === Math.PI / 2) break; }
  diagnostics.update(engine.getState());
  const body = diagnostics.parameters.children.find(x => x.children?.some(c => /L — humano/.test(c.textContent)));
  const yRow = body.children.find(c => /^y:/i.test(c.textContent));
  assert.ok(yRow);
  const help = yRow.children.find(c => c?.textContent === '?');
  assert.ok(help);
  assert.equal(help.title, undefined);
  assert.equal(help['aria-label'], 'Explicación de la componente Y de L humano');
  const tooltip = mount.children.find(c => c?.role === 'tooltip');
  assert.ok(tooltip);
  assert.equal(tooltip.textContent, 'Las componentes X, Y y Z de este panel usan el marco mundial, igual que las flechas de colores del overlay. El acoplamiento antropomórfico se origina en el marco corporal (Iᵧ𝓏 ≠ 0) y, al transformar el vector al mundo, sus componentes pueden redistribuirse entre X, Y y Z. No significa que exista un giro independiente alrededor de cada eje.');
  help.emit('mouseenter');
  assert.equal(tooltip.style.display, 'block');
  help.emit('mouseleave');
  assert.equal(tooltip.style.display, 'none');
  help.emit('focus');
  assert.equal(tooltip.style.display, 'block');
  help.emit('blur');
  assert.equal(tooltip.style.display, 'none');
});

test('3N.9-J — desaparece Referencia de componentes / Marco corporal de la UI', () => {
  const d = new FakeDocument(); const mount = new FakeElement('main');
  const diagnostics = new PhysicsDiagnostics({ document: d, mount });
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  diagnostics.update(engine.getState());
  const text = diagnostics.parameters.children.map(x => x.children?.map(c => c.textContent).join(' ') ?? x.textContent).join(' ');
  assert.doesNotMatch(text, /Referencia de componentes|Marco corporal/);
});

test('3N.9-K — botones de pausa y reinicio conservan la semántica y reciben el estilo solicitado', () => {
  const { controls } = makeControls();
  assert.match(controls.pauseButton.textContent, /▶ Iniciar simulación/);
  assert.equal(controls.pauseButton.style.background, '#2e7d32');
  assert.match(controls.resetButton.textContent, /↻ Reiniciar/);
  assert.equal(controls.resetButton.style.background, '#c62828');
  controls.setPaused(true);
  assert.match(controls.pauseButton.textContent, /▶ Reanudar simulación/);
  assert.equal(controls.pauseButton.style.background, '#2e7d32');
});
