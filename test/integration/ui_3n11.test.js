import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { SimulationControls } from '../../src/app/SimulationControls.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.listeners = new Map(); this.value = ''; this._textContent = ''; this.type = ''; this.focused = false; this.parentNode = null; this.removed = false; }
  get textContent() { return this._textContent; }
  set textContent(value) { for (const child of this.children) if (child && typeof child === 'object') child.parentNode = null; this.children = []; this._textContent = String(value ?? ''); }
  append(...items) { items.forEach(item => this.appendChild(item)); }
  appendChild(item) { this.children.push(item); if (item && typeof item === 'object') item.parentNode = this; return item; }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  remove() { this.removed = true; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  emit(type, event = {}) { this.listeners.get(type)?.(event); }
  get isConnected() { return Boolean(this.parentNode?.isConnected || this.parentNode); }
}
class Document {
  constructor() { this.defaultView = null; }
  createElement(tag) { return new Element(tag); }
  createTextNode(text) { const e = new Element('#text'); e.textContent = text; return e; }
}

function makeControls() {
  const document = new Document();
  const mount = new Element('main');
  const engine = EngineAdapter.create({ mode: 'VerticalBearing', params: createParams({ s0: 40 }), theta0: 0, Omega0: [0, 0, 0] });
  const controls = new SimulationControls({ document, engine, mount });
  return { controls, engine, mount };
}

function openEditor(controls, readout) {
  readout.emit('dblclick', { button: 0 });
  const input = readout.children.find(child => child?.tagName === 'INPUT');
  assert.ok(input, 'double click must insert an input');
  assert.equal(input.parentNode, readout, 'input must be inserted into the visible readout');
  assert.equal(input.isConnected, true, 'input must remain connected to the mounted DOM tree');
  assert.equal(input.style.display, 'inline-block');
  assert.equal(input.style.visibility, 'visible');
  assert.equal(input.style.opacity, '1');
  assert.equal(input.style.pointerEvents, 'auto');
  assert.equal(input.focused, true, 'input must receive focus immediately');
  return input;
}

test('3N.11-A — double click creates a visible, connected and focused editor that survives update()', () => {
  const { controls, engine } = makeControls();
  const input = openEditor(controls, controls.diameterReadout);
  input.value = '2.50';
  controls.update(engine.getState());
  assert.equal(input.parentNode, controls.diameterReadout);
  assert.equal(controls.diameterValue._numericEditor, input);
  assert.equal(input.value, '2.50');
});

test('3N.11-B — Enter applies numeric text through the existing setter and synchronizes slider/readout', () => {
  const { controls, engine } = makeControls();
  const input = openEditor(controls, controls.diameterReadout);
  input.value = '2.50';
  input.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(engine.getState().params.D, 2.5);
  assert.equal(Number(controls.diameterSlider.value), 2.5);
  assert.match(controls.diameterReadout.textContent, /2\.50 m/);
  assert.equal(controls.diameterValue._numericEditor, null);
});

test('3N.11-C — Escape, invalid input and blur follow the required editing semantics', () => {
  const { controls, engine } = makeControls();
  let input = openEditor(controls, controls.massReadout);
  input.value = '7.50';
  input.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(engine.getState().params.m_w, 3);
  assert.match(controls.massReadout.textContent, /3\.00 kg/);

  input = openEditor(controls, controls.massReadout);
  input.value = 'not-a-number';
  input.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(engine.getState().params.m_w, 3);

  input = openEditor(controls, controls.massReadout);
  input.value = '7.50';
  input.emit('blur');
  assert.equal(engine.getState().params.m_w, 7.5);
  assert.equal(Number(controls.massSlider.value), 7.5);
});


test('3N.11-G — the real double-click event sequence reaches the readout and opens the editor', () => {
  const { controls } = makeControls();
  const readout = controls.targetReadout;
  readout.emit('mousedown', { button: 0 });
  readout.emit('mouseup', { button: 0 });
  readout.emit('click', { button: 0 });
  readout.emit('mousedown', { button: 0 });
  readout.emit('mouseup', { button: 0 });
  readout.emit('click', { button: 0 });
  readout.emit('dblclick', { button: 0 });
  const input = readout.children.find(child => child?.tagName === 'INPUT');
  assert.ok(input);
  assert.equal(input.focused, true);
  assert.equal(input.parentNode, readout);
});

test('3N.11-H — all four editable parameters accept typed values through Enter', () => {
  const { controls, engine } = makeControls();
  let input = openEditor(controls, controls.targetReadout);
  input.value = '30'; input.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(Number(controls.thetaSlider.value), 30);

  input = openEditor(controls, controls.initialSpinReadout);
  input.value = '55'; input.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(engine.getState().params.s0, 55);
  assert.equal(Number(controls.spinSlider.value), 55);

  input = openEditor(controls, controls.diameterReadout);
  input.value = '2.50'; input.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(engine.getState().params.D, 2.5);

  input = openEditor(controls, controls.massReadout);
  input.value = '7.50'; input.emit('keydown', { key: 'Enter', preventDefault() {} });
  assert.equal(engine.getState().params.m_w, 7.5);
});

test('3N.11-D — source-level guard prevents the application render loop from deleting an active editor', async () => {
  const source = await fs.readFile(new URL('../../src/app/SimulationControls.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!this\.thetaValue\._numericEditor\)/);
  assert.match(source, /if \(!this\.spinValue\._numericEditor\)/);
  assert.match(source, /if \(!this\.diameterValue\._numericEditor\)/);
  assert.match(source, /if \(!this\.massValue\._numericEditor\)/);
  assert.match(source, /input\.focus\?\.\(\)/);
  assert.match(source, /input\.select\?\.\(\)/);
  assert.match(source, /zIndex: '30'/);
});

test('3N.11-E — page identity and local bicycle-wheel favicon are wired in the real entrypoint', async () => {
  const html = await fs.readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>Momento Angular Simulación 3D<\/title>/);
  assert.match(html, /rel="icon"[^>]+wheel-favicon\.svg/);
  const svg = await fs.readFile(new URL('../../wheel-favicon.svg', import.meta.url), 'utf8');
  assert.match(svg, /<circle/);
  assert.match(svg, /<path/);
});

test('3N.11-F — author wheel icon is top-right and exposes the requested tooltip text', async () => {
  const source = await fs.readFile(new URL('../../src/app/main.js', import.meta.url), 'utf8');
  assert.match(source, /right: '14px'/);
  assert.match(source, /wheel-favicon\.svg/);
  assert.match(source, /Proyecto diseñado y auditado por Felipe Vivanco junto a un equipo de IA y con la asesoría física del Ing\. Sebastián Iván Benítez/);
  assert.match(source, /mouseenter/);
  assert.match(source, /focus/);
});
