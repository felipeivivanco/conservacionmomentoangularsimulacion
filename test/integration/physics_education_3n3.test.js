import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsEducationOverlay } from '../../src/render/PhysicsEducationOverlay.js';

class FakeElement {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.textContent = ''; this.listeners = new Map(); }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); return item; }
  setAttribute() {}
  addEventListener(type, cb) { this.listeners.set(type, cb); }
  remove() { this.removed = true; }
  click() { this.listeners.get('click')?.(); }
}
class FakeDocument { createElement(tag) { return new FakeElement(tag); } }

test('3N.3-E1 — panel educativo siempre existe y es plegable', () => {
  const overlay = new PhysicsEducationOverlay({ document: new FakeDocument(), mount: new FakeElement('main') });
  assert.equal(overlay.expanded, false);
  overlay.toggle.click();
  assert.equal(overlay.expanded, true);
  assert.equal(overlay.content.style.display, 'block');
  overlay.toggle.click();
  assert.equal(overlay.expanded, false);
});

test('3N.3-E2 — contenido educativo usa lenguaje físico y no nombres internos', () => {
  const overlay = new PhysicsEducationOverlay({ document: new FakeDocument(), mount: new FakeElement('main') });
  const flatten = node => `${node.textContent || ''} ${node.children?.map(flatten).join(' ') || ''}`;
  const text = flatten(overlay.content);
  assert.match(text, /Masa|Modelo de la rueda|Velocidad angular|Momento angular y torque|Conservación/);
  assert.match(text, /I = Σ mᵢrᵢ²/);
  assert.match(text, /𝑳 = Iω/);
  assert.match(text, /I = mr²/);
  assert.match(text, /I = mD²\/4/);
  assert.match(text, /τ = d𝑳\/dt/);
  assert.match(text, /componente Y/);
  assert.match(text, /dirección de esa componente depende de la configuración/);
  assert.match(text, /𝑳_total = 𝑳_rueda \+ 𝑳_humano ≈ constante/);
  assert.match(text, /Suposiciones del modelo/);
  assert.doesNotMatch(text, /Ia|m_w|Omega_w|L_wheel|state|engine|adapter/);
});
