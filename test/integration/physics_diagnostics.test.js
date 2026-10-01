import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsDiagnostics } from '../../src/app/PhysicsDiagnostics.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';

class FakeElement {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.textContent='';}
  append(...items){this.children.push(...items);}
  appendChild(item){this.children.push(item);return item;}
  setAttribute(){}
  remove(){this.removed=true;}
  replaceChildren(...items){this.children=[...items];}
}
class FakeDocument { createElement(tag){return new FakeElement(tag);} }

test('3N.2-D1 — la ficha derecha muestra parámetros y diagnósticos L del estado físico', () => {
  const document = new FakeDocument(); const mount = new FakeElement('main');
  const diagnostics = new PhysicsDiagnostics({document,mount});
  const engine = EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  const state = engine.getState(); const shown = diagnostics.update(state);
  assert.equal(shown.Ia, state.params.Ia);
  assert.deepEqual(shown.LWheel, state.L_wheel_world);
  assert.deepEqual(shown.LBody, state.L_body_world);
  assert.ok(Math.abs(shown.LWheelMagnitude - Math.hypot(...state.L_wheel_world)) < 1e-12);
  assert.ok(Math.abs(shown.LBodyMagnitude - Math.hypot(...state.L_body_world)) < 1e-12);
  const text = diagnostics.parameters.children.map(x => x.children?.map(child => child.textContent).join(' ') ?? x.textContent).join(' ');
  assert.match(text,/Velocidad angular/); assert.match(text,/I =/); assert.match(text,/L — rueda/); assert.match(text,/L — humano/);
  assert.match(text,/x:/); assert.match(text,/y:/); assert.match(text,/z:/);
  assert.doesNotMatch(text,/\d{5,}/);
  assert.doesNotMatch(text,/L_total|Omega_w|n_w|omega_spin/);
});

test('3N.2-D2 — ω, I y L de la ficha salen directamente del snapshot físico', () => {
  const document = new FakeDocument(); const mount = new FakeElement('main');
  const diagnostics = new PhysicsDiagnostics({document,mount});
  const engine = EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  const state = engine.setSpinRate(63); const shown = diagnostics.update(state);
  assert.equal(shown.omegaWheel,63); assert.equal(shown.Ia,state.params.Ia);
  assert.deepEqual(shown.LWheel,state.L_wheel_world); assert.deepEqual(shown.LBody,state.L_body_world);
  const text = diagnostics.parameters.children.map(x => x.children?.map(child => child.textContent).join(' ') ?? x.textContent).join(' ');
  assert.match(text,/63\.00 rad\/s/); assert.match(text,new RegExp(`I = ${state.params.Ia.toFixed(4)}`));
  assert.match(text,new RegExp(`x: ${state.L_wheel_world[0].toFixed(4)}`));
});

test('3N.2-D3 — el panel mantiene la velocidad angular y L del humano también en modo simplificado', () => {
  const document = new FakeDocument(); const mount = new FakeElement('main');
  const diagnostics = new PhysicsDiagnostics({document,mount});
  const engine = EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  const state = engine.setIncludeHuman(false); diagnostics.update(state);
  const text = diagnostics.parameters.children.map(x => x.children?.map(child => child.textContent).join(' ') ?? x.textContent).join(' ');
  assert.match(text,/Velocidad angular del humano/);
  assert.match(text,/L — humano/);
});

test('3N.21-A — el panel de información muestra inercia humana, masa y matrices de cálculo', () => {
  const document = new FakeDocument(); const mount = new FakeElement('main');
  const diagnostics = new PhysicsDiagnostics({document,mount,mode:'VerticalBearing'});
  const engine = EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:40,m_w:2.4,D:0.70,Ia:2.4*(0.70/2)**2}),theta0:0,Omega0:[0,0,0]});
  const state = engine.getState();
  diagnostics.update(state);
  assert.equal(state.human.mass,70);
  assert.deepEqual(state.human.inertia,[12.5,13.5,1.6]);
  assert.equal(state.inertiaMatrices.Istar.length,3);
  assert.equal(state.inertiaMatrices.Ic.length,3);
  const text = diagnostics.inertiaInfo.children.map(x => x.children?.map(child => child.textContent).join(' ') ?? x.textContent).join(' ');
  const headings = diagnostics.inertiaInfo.children.filter(x => x.className === 'ui-inertia-matrix-title').map(x => x.textContent).join(' ');
  assert.doesNotMatch(text,/Momento de inercia del humano/);
  assert.match(text,/Iₓ = 12\.5 kg·m²/);
  assert.match(text,/Iᵧ = 13\.5 kg·m²/);
  assert.match(text,/I𝓏 = 1\.6 kg·m²/);
  assert.match(text,/Masa del humano/);
  assert.match(headings,/Matriz I\* — inercia base efectiva/);
  assert.match(headings,/Matriz I\(θ\) — inercia dinámica actual/);
});

test('3N.21-B — el signo de la velocidad angular humana se refleja en Parámetros', () => {
  const document = new FakeDocument(); const mount = new FakeElement('main');
  const diagnostics = new PhysicsDiagnostics({document,mount,mode:'VerticalBearing'});
  const engine = EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  engine.setThetaTarget(Math.PI/2);
  for(let i=0;i<120;i++) engine.step(engine.getPhysicsDt());
  diagnostics.update(engine.getState());
  const text = diagnostics.parameters.children.map(x => x.children?.map(child => child.textContent).join(' ') ?? x.textContent).join(' ');
  assert.match(text,/Velocidad angular del humano/);
  assert.match(text,/−|-/);
});

test('3N.21-C — + y − alternan el panel sin cambiar la información física', () => {
  const document = new FakeDocument(); const mount = new FakeElement('main');
  const diagnostics = new PhysicsDiagnostics({document,mount});
  const engine = EngineAdapter.create({mode:'Free',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  diagnostics.update(engine.getState());
  assert.equal(diagnostics.infoToggle.textContent,'+');
  diagnostics._toggleInfo();
  assert.equal(diagnostics.infoToggle.textContent,'−');
  assert.equal(diagnostics.parameters.style.display,'none');
  assert.notEqual(diagnostics.inertiaInfo.style.display,'none');
  diagnostics._toggleInfo();
  assert.equal(diagnostics.infoToggle.textContent,'+');
  assert.notEqual(diagnostics.parameters.style.display,'none');
  assert.equal(diagnostics.inertiaInfo.style.display,'none');
});
