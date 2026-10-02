import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsDiagnostics } from '../../src/app/PhysicsDiagnostics.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';

class E {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.listeners=new Map();this.textContent='';}
  append(...xs){this.children.push(...xs);}
  appendChild(x){this.children.push(x);return x;}
  replaceChildren(...xs){this.children=[...xs];}
  setAttribute(k,v){this[k]=String(v);}
  addEventListener(k,f){this.listeners.set(k,f);}
  remove(){}
}
class D { createElement(tag){return new E(tag);} }
const textOf = node => `${node?.textContent||''} ${node?.children?.map(textOf).join(' ')||''}`;

function makeState(mode='VerticalBearing', includeHuman=true) {
  const document=new D(), mount=new E('main');
  const diagnostics=new PhysicsDiagnostics({document,mount,mode});
  const engine=EngineAdapter.create({
    mode,
    params:createParams({m_w:6.75,D:.68,Ia:6.75*(.68/2)**2,s0:17.78,includeHuman}),
    theta0:0,
    Omega0:[0,0,0]
  });
  if (mode === 'VerticalBearing') {
    engine.setThetaTarget(Math.PI/6);
    for(let i=0;i<1000;i++) engine.step(engine.getPhysicsDt());
  } else {
    engine.setThetaTarget(Math.PI/6);
    for(let i=0;i<1000;i++) engine.step(engine.getPhysicsDt());
  }
  const state=engine.getState();
  diagnostics.update(state);
  return {diagnostics,state,text:textOf(diagnostics.inertiaInfo)};
}

test('3N.21-D — el panel completo prioriza legibilidad y adapta el contenido al modelo completo', () => {
  const {text}=makeState('VerticalBearing',true);
  assert.doesNotMatch(text,/Masa reducida de acoplamiento/);
  assert.match(text,/r_w = \(0, 0\.60, 0\.40\) m/);
  assert.match(text,/I_z = 2\.0 kg·m²/);
  assert.doesNotMatch(text,/I_plataforma,z/);
  assert.match(text,/I\* — inercia base efectiva/);
  assert.match(text,/I\(θ\) — inercia dinámica actual/);
  assert.match(text,/Modelo completo del humano/);
  assert.match(text,/acoplamiento geométrico asociado a r/);
  assert.doesNotMatch(text,/I\(θ\) = I\* \+ \(I_a\/2\)/);
  assert.doesNotMatch(text,/Cómo se obtiene Ω y L humano/);
  assert.doesNotMatch(text,/Relación física/);
  assert.match(text,/Cálculo de Ω_z/);
  assert.match(text,/Momento angular vertical de la rueda/);
  assert.match(text,/Inercia dinámica en Z/);
  assert.match(text,/Resultado/);
  assert.doesNotMatch(text,/Signo de Ω/);
  assert.doesNotMatch(text,/Momento angular de la rueda: axial \+ transversal/);
  assert.doesNotMatch(text,/Parte axial/);
  assert.doesNotMatch(text,/Parte transversal/);
  assert.doesNotMatch(text,/Ω⊥ actual/);
  assert.doesNotMatch(text,/L_transversal actual/);
  assert.match(text,/Rueda \+ humano/);
  assert.match(text,/6\.10890/);
});

test('3N.21-E — el modelo simplificado elimina del texto el acoplamiento geométrico pero mantiene las matrices y el cálculo', () => {
  const {state,text}=makeState('VerticalBearing',false);
  assert.equal(state.params.includeHuman,false);
  assert.doesNotMatch(text,/Masa reducida de acoplamiento/);
  assert.match(text,/r_w = \(0, 0\.60, 0\.40\) m/);
  assert.match(text,/Modelo simplificado del humano/);
  assert.match(text,/Se omite el acoplamiento geométrico/);
  assert.match(text,/I\* — inercia base efectiva/);
  assert.match(text,/I\(θ\) — inercia dinámica actual/);
  assert.match(text,/Cálculo de Ω_z/);
  assert.match(text,/Rueda \+ humano/);
  assert.doesNotMatch(text,/Masa reducida/);
});

test('3N.21-F — Vacío adapta la explicación de Ω y de conservación y no presenta la cuenta escalar de Ω_z', () => {
  const {text}=makeState('Free',true);
  assert.doesNotMatch(text,/Modelo completo del humano/);
  assert.match(text,/Cálculo de Ω/);
  assert.match(text,/dinámica rotacional libre/);
  assert.match(text,/Conservación de L del sistema/);
  assert.match(text,/L_total =/);
  assert.doesNotMatch(text,/Cálculo de Ω_z/);
  assert.doesNotMatch(text,/Momento angular vertical de la rueda/);
  assert.doesNotMatch(text,/Signo de Ω/);
  assert.doesNotMatch(text,/Momento angular de la rueda: axial \+ transversal/);
});

test('3N.21-G — Vacío simplificado también identifica que no hay acoplamiento geométrico del humano', () => {
  const {text}=makeState('Free',false);
  assert.doesNotMatch(text,/Modelo simplificado del humano/);
  assert.match(text,/Cálculo de Ω/);
  assert.match(text,/Cálculo de Ω/);
  assert.match(text,/Conservación de L del sistema/);
});

test('3N.21-H — la matriz I(theta) cambia con el ángulo sin alterar I*', () => {
  const document=new D(), mount=new E('main');
  const diagnostics=new PhysicsDiagnostics({document,mount,mode:'VerticalBearing'});
  const engine=EngineAdapter.create({mode:'VerticalBearing',params:createParams({m_w:6.75,D:.68,Ia:6.75*(.68/2)**2,s0:17.78}),theta0:0,Omega0:[0,0,0]});
  const a=engine.getState(); diagnostics.update(a); const az=a.inertiaMatrices.Ic[2][2];
  engine.setThetaTarget(Math.PI/6); for(let i=0;i<1000;i++) engine.step(engine.getPhysicsDt());
  const b=engine.getState(); diagnostics.update(b); const bz=b.inertiaMatrices.Ic[2][2];
  assert.equal(a.inertiaMatrices.Istar[2][2],b.inertiaMatrices.Istar[2][2]);
  assert.notEqual(az,bz);
  assert.ok(Math.abs(bz-6.108899144951139)<1e-10);
});

test('3N.21-I — el panel de Plataforma conserva las expresiones solicitadas como fuente LaTeX', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../../src/app/PhysicsDiagnostics.js', import.meta.url), 'utf8');
  assert.match(source, /\\\\vec\{r\}_w/);
  assert.match(source, /\\\\mu=\\\\frac\{m_p m_w\}\{m_p\+m_w\}/);
  assert.match(source, /frac\{I_a/);
  assert.match(source, /data-latex/);
});
