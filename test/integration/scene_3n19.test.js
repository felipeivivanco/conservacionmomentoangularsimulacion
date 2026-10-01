import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PhysicsEducationOverlay } from '../../src/render/PhysicsEducationOverlay.js';
import { PhysicsDiagnostics } from '../../src/app/PhysicsDiagnostics.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';

class FakeElement {
  constructor(tag='div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.listeners = new Map();
    this.textContent = ''; this.type = ''; this.id = '';
  }
  append(...xs) { this.children.push(...xs); }
  appendChild(x) { this.children.push(x); return x; }
  replaceChildren(...xs) { this.children = [...xs]; }
  setAttribute(k,v) { this[k] = String(v); }
  addEventListener(k,fn) { this.listeners.set(k,fn); }
  removeEventListener(k) { this.listeners.delete(k); }
  remove() { this.removed = true; }
  click() { this.listeners.get('click')?.(); }
}
class FakeDocument { createElement(tag) { return new FakeElement(tag); } }

function flattenText(node) {
  if (!node) return '';
  return `${node.textContent || ''} ${node.children?.map(flattenText).join(' ') || ''}`;
}

test('3N.19-A — el ? de Ly usa exactamente la nueva explicación física', () => {
  const document = new FakeDocument();
  const mount = new FakeElement('main');
  const diagnostics = new PhysicsDiagnostics({document, mount, mode:'VerticalBearing'});
  diagnostics.update(EngineAdapter.create({mode:'VerticalBearing'}).getState());
  assert.equal(diagnostics._humanYTooltips.length, 1);
  const tooltip = diagnostics._humanYTooltips[0];
  const expected = 'Las componentes X, Y y Z de este panel usan el marco mundial, igual que las flechas de colores del overlay. El acoplamiento antropomórfico se origina en el marco corporal (Iᵧ𝓏 ≠ 0) y, al transformar el vector al mundo, sus componentes pueden redistribuirse entre X, Y y Z. No significa que exista un giro independiente alrededor de cada eje.';
  assert.equal(tooltip.textContent, expected);
  assert.doesNotMatch(tooltip.textContent, /L = I·ω/);
  assert.doesNotMatch(tooltip.textContent, /acumulando momento angular/);
});

test('3N.19-B — ¿Qué está pasando? y Salvedades técnicas existen en ambas escenas', () => {
  for (const scenario of [1, 2]) {
    const overlay = new PhysicsEducationOverlay({document:new FakeDocument(), mount:new FakeElement('main'), scenario});
    assert.equal(overlay.toggle.textContent, '💡 ¿Qué está pasando?');
    assert.equal(overlay.technicalToggle.textContent, 'Salvedades técnicas');
    overlay.technicalToggle.click();
    assert.equal(overlay.expanded, true);
    assert.equal(overlay.activeSection, 'technical');
    assert.equal(overlay.technicalContent.style.display, 'block');
    assert.match(flattenText(overlay.technicalContent), /Marco teórico/);
    assert.match(flattenText(overlay.technicalContent), /Fuera del alcance del modelo/);
    assert.match(flattenText(overlay.technicalContent), /conservación del momento angular/);
    if (scenario === 2) assert.match(flattenText(overlay.whatContent), /Experimento en vacío/);
  }
});

test('3N.19-C — salvedades técnicas evitan nombres internos del código', () => {
  const overlay = new PhysicsEducationOverlay({document:new FakeDocument(), mount:new FakeElement('main'), scenario:2});
  const text = flattenText(overlay.technicalContent);
  for (const internal of ['EngineAdapter','Omega_b','L_body','L_total','theta_target','p_s']) {
    assert.doesNotMatch(text, new RegExp(`\\b${internal}\\b`));
  }
});

test('3N.19-D — el texto académico documenta las hipótesis y el alcance solicitados', () => {
  const overlay = new PhysicsEducationOverlay({document:new FakeDocument(), mount:new FakeElement('main'), scenario:1});
  const text = flattenText(overlay.technicalContent);
  for (const phrase of [
    'I = mD²/4',
    'No se modela la anatomía real segmento por segmento',
    'Los brazos tienen una función principalmente representativa',
    'Para diámetros muy grandes',
    'En la Escena 1 el cuerpo está vinculado a una plataforma',
    'La Escena 2 representa un sistema libre de torque externo neto',
    'La representación de vacío no significa que el sistema quede inmóvil',
    'La conservación del momento angular no implica necesariamente conservación de la energía mecánica',
    'El centro de masa se mantiene sin una dinámica traslacional independiente',
    'Las componentes del momento angular no deben interpretarse directamente como componentes independientes de la velocidad angular',
    'La velocidad angular indica cómo está rotando el cuerpo',
    'Ninguno de estos controles debe describirse como un simple efecto visual',
    'No forman parte del modelo considerado en esta simulación',
    'La animación 3D no calcula la física de manera independiente',
    'fenómeno físico e idealización del modelo'
  ]) assert.match(text, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('3N.19-E — la nueva UI no introduce cambios en los módulos físicos protegidos', async () => {
  const files = [
    ['src/simulation/SimulationController.js','36e9dd173d87f38ed7abc8e127fc2ddffc9e47683d96d74b5e68cf7fe60058ec'],
    ['oracle.py','fbe2c3b494e925275bbf4603864f21fda07c032503e7507ea031f4096c3ac33b'],
    ['oracle/make_golden.py','b9d7e9e3f465e6357284ebc543370d842d7b828854b9eac7953d38c8c6e178b7'],
    ['oracle/golden.json','2fa61cfb5c9a60c2686d2a3d7fbfb6c915de973090d240b6aa7defdf9fcd4d9f']
  ];
  const { createHash } = await import('node:crypto');
  for (const [relative, expected] of files) {
    const data = await readFile(new URL(`../../${relative}`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), expected, relative);
  }
});
