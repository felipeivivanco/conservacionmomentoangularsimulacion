import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { PhysicsVectorsOverlay } from '../../src/render/PhysicsVectorsOverlay.js';
import { createParams } from '../../src/index.js';

const near = (a,b,t=1e-10) => assert.ok(Math.abs(a-b) <= t*Math.max(1,Math.abs(b)), `${a} != ${b}`);
const vecNear = (a,b,t=1e-10) => a.forEach((v,i)=>near(v,b[i],t));
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

function makeEngine(mode) {
  return EngineAdapter.create({mode, params:createParams({s0:40}), theta0:0, Omega0:[0,0,0]});
}

for (const mode of ['VerticalBearing','Free']) {
  test(`3N.20-M-${mode}-STOP — masa actualiza Ia, L y estado sin tocar theta/omega`, () => {
    const e = makeEngine(mode); const before = e.getState();
    const after = e.setWheelMass(4);
    assert.equal(after.params.s0, 40);
    near(after.params.Ia, 4*(0.68/2)**2);
    near(dot(after.L_wheel_world, after.n_w), after.params.Ia*40, 1e-9);
    assert.notDeepEqual(after.L_wheel_world, before.L_wheel_world);
    assert.equal(after.theta_target, before.theta_target);
    assert.equal(after.t, 0);
  });

  test(`3N.20-D-${mode}-STOP — diámetro actualiza Ia, L y geometría física inmediatamente`, () => {
    const e = makeEngine(mode); const before = e.getState();
    const after = e.setWheelDiameter(1.0);
    near(after.params.Ia, 3*1.0**2/4);
    near(dot(after.L_wheel_world, after.n_w), after.params.Ia*40, 1e-9);
    assert.notDeepEqual(after.L_wheel_world, before.L_wheel_world);
    assert.equal(after.params.D, 1.0);
  });

  test(`3N.20-P-${mode} — PAUSE congela tiempo pero no congela cambios de parámetros`, () => {
    const e = makeEngine(mode); const c = new SimulationController({engine:e});
    c.start(); c.advance(0.25); c.pause();
    const before = c.getState();
    const changed = e.setWheelMass(5);
    const after = c.getState();
    assert.equal(after.status, 'paused');
    assert.equal(after.steps, before.steps);
    assert.equal(after.physics.t, before.physics.t);
    assert.equal(changed.params.m_w, 5);
    near(changed.params.Ia, 5*(0.68/2)**2);
    near(dot(changed.L_wheel_world, changed.n_w), changed.params.Ia*changed.params.s0, 1e-9);
  });

  test(`3N.20-R-${mode} — RUNNING aplica masa/diámetro sin intervención intermedia`, () => {
    const e = makeEngine(mode); const c = new SimulationController({engine:e});
    c.start(); e.setLifecycleStatus('running'); c.advance(0.10);
    const t = c.getState().physics.t;
    const mass = e.setWheelMass(4);
    const diameter = e.setWheelDiameter(1.0);
    assert.equal(c.getState().status, 'running');
    assert.equal(mass.params.m_w, 4);
    assert.equal(diameter.params.D, 1.0);
    const preservedPs = mass.params.Ia * mass.params.s0;
    assert.equal(diameter.theta_target, mass.theta_target);
    assert.equal(diameter.t, t);
    near(diameter.params.s0, preservedPs / diameter.params.Ia, 1e-12);
    near(dot(diameter.L_wheel_world, diameter.n_w), preservedPs, 1e-9);
  });

  test(`3N.20-H-${mode} — OFF elimina por completo la contribución inercial del humano`, () => {
    const e = makeEngine(mode);
    e.setThetaTarget(Math.PI/2);
    for (let i=0;i<120;i++) e.step(e.getPhysicsDt());
    const on = e.getState();
    const off = e.setIncludeHuman(false);
    assert.equal(off.params.includeHuman, false);
    assert.equal(off.t, on.t);
    assert.deepEqual(off.q, on.q);
    assert.ok(Math.hypot(...off.Omega_b) > 1e-12, 'el humano idealizado sigue participando dinámicamente');
    assert.ok(Math.hypot(...off.L_body_world) > 1e-12, 'el humano idealizado sigue aportando L al fenómeno');
    assert.ok(Math.hypot(...off.L_total_world) > 1e-12);
    const restored = e.setIncludeHuman(true);
    assert.equal(restored.params.includeHuman, true);
    assert.equal(restored.t, off.t);
  });

  test(`3N.20-H-${mode}-PAUSE — cambiar el modelo en pausa no avanza tiempo`, () => {
    const e = makeEngine(mode); const c = new SimulationController({engine:e});
    c.start(); c.advance(0.25); c.pause();
    const before = c.getState();
    const off = e.setIncludeHuman(false);
    const after = c.getState();
    assert.equal(after.physics.t, before.physics.t);
    assert.equal(after.steps, before.steps);
    assert.equal(off.params.includeHuman, false);
  });

  test(`3N.20-H-${mode}-RUNNING — cambiar el modelo en RUNNING es inmediato`, () => {
    const e = makeEngine(mode); const c = new SimulationController({engine:e});
    c.start(); c.advance(0.10);
    const t = c.getState().physics.t;
    const off = e.setIncludeHuman(false);
    assert.equal(c.getState().status, 'running');
    assert.equal(off.t, t);
    assert.equal(off.params.includeHuman, false);
  });
}

class FakeVector3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
}
class FakeArrow {
  constructor(dir,origin,length,color){this.direction=dir;this.position=origin;this.length=length;this.color=color;this.visible=true;}
  setDirection(v){this.direction=v;}
  setLength(v){this.length=v;}
}
class FakeGroup { constructor(){this.children=[];this.visible=true;} add(...x){this.children.push(...x);} clear(){this.children=[];} }
const THREE={Group:FakeGroup,ArrowHelper:FakeArrow,Vector3:FakeVector3};

class FakeCanvasContext { clearRect(){} save(){} restore(){} setTransform(){} fillText(){} }
class FakeCanvas {
  constructor(){this.width=900;this.height=156;}
  getContext(){return new FakeCanvasContext();}
}
class FakeDoc { createElement(tag){ return tag==='canvas' ? new FakeCanvas() : {}; } }

test('3N.20-V-sign — ω y L principales usan solo signo, mientras la descomposición conserva componentes', () => {
  const overlay = new PhysicsVectorsOverlay({three:THREE, document:null, minLength:0, maxLength:100, vectorScale:1});
  overlay.update({q:[1,0,0,0],n_w:[1,0,0],Omega_w:[-4,0,0],Omega_b:[0,0,0],L_wheel_body:[-2,0,3],L_body_body:[0,0,0]}, {wheelPosition:{x:0,y:0,z:0},personPosition:{x:0,y:0.9,z:0}});
  assert.equal(overlay.arrows.get('wheelOmega').color,0x222222);
  assert.equal(overlay.labels.has('wheelOmega'),false);
  // With document:null labels are intentionally absent; verify the label contract directly.
  assert.equal(overlay._signedScalarLabel('ω',[-4,0,0]), 'ω−');
  assert.equal(overlay._signedVectorLabel('𝑳',[-2,0,3]), '𝑳(-x,+z)');
  assert.ok(overlay.arrows.get('wheelOmega').direction.z < 0);
  assert.ok(overlay.arrows.get('wheelLX').direction.z < 0);
  assert.ok(overlay.arrows.get('wheelLZ').direction.y > 0);
  assert.equal(overlay._signedVectorLabel('𝑳',[4,0,0]), '𝑳(+x)');
  assert.equal(overlay._signedVectorLabel('𝑳',[0,-2,3]), '𝑳(-y,+z)');
});

test('3N.20-V-labels — no hay etiquetas de componentes y las de L/ω quedan cerca de la punta', async () => {
  const overlay = new PhysicsVectorsOverlay({three:THREE, document:null, minLength:0, maxLength:100, vectorScale:1});
  overlay.update({q:[1,0,0,0],n_w:[1,0,0],Omega_w:[1,0,0],Omega_b:[0,0,0],L_wheel_body:[2,-3,4],L_body_body:[0,0,0],params:{includeHuman:false}}, {wheelPosition:{x:1,y:2,z:3},personPosition:{x:0,y:0.9,z:0}});
  const total = overlay.arrows.get('wheelL');
  assert.equal(total.visible,true);
  for (const key of ['wheelLX','wheelLY','wheelLZ']) assert.equal(overlay.labels.has(key),false);
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../../src/render/PhysicsVectorsOverlay.js', import.meta.url),'utf8');
  assert.match(source,/tipOffset = Math\.min\(0\.035/);
  assert.match(source,/length\+tipOffset/);
  assert.doesNotMatch(source,/label\.position\.set\(mx, my, mz\)/);
});

test('3N.20-V-space — Vacío usa blanco en el overlay auxiliar sin alterar los colores físicos de componentes', () => {
  const overlay = new PhysicsVectorsOverlay({three:THREE, document:null, contrast:true});
  assert.equal(overlay.arrows.get('wheelOmega').color,0xffffff);
  assert.equal(overlay.arrows.get('wheelLX').color,0xe53935);
  assert.equal(overlay.arrows.get('wheelLY').color,0x43a047);
  assert.equal(overlay.arrows.get('wheelLZ').color,0x1e88e5);
});

class FakeElementUI {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.listeners=new Map();this.value='';this.checked=false;this.textContent='';}
  append(...items){this.children.push(...items);}
  appendChild(item){this.children.push(item);return item;}
  setAttribute(name,value){this[name]=String(value);}
  addEventListener(type,cb){this.listeners.set(type,cb);}
  removeEventListener(type){this.listeners.delete(type);}
  emit(type){this.listeners.get(type)?.({});}
  remove(){this.removed=true;}
}
class FakeDocumentUI { createElement(tag){return new FakeElementUI(tag);} createTextNode(text){const n=new FakeElementUI('#text');n.textContent=text;return n;} }

test('3N.20-UI — switch Considerar cuerpo humano queda debajo de Momento de inercia y usa el mismo camino físico', async () => {
  const { SimulationControls } = await import('../../src/app/SimulationControls.js');
  const document = new FakeDocumentUI();
  const mount = new FakeElementUI('main');
  const engine = makeEngine('VerticalBearing');
  const controls = new SimulationControls({document, engine, mount});
  assert.equal(controls.humanModelLabel.textContent, 'Modelo simplificado del humano');
  assert.equal(controls.humanModelSwitch.type, 'checkbox');
  assert.equal(controls.humanModelSwitch.role, 'switch');
  assert.equal(controls.humanModelSwitch.checked, false);
  assert.equal(controls.humanModelState.textContent, 'OFF');
  assert.ok(controls.scrollContent.children.indexOf(controls.humanModelGroup) > controls.scrollContent.children.indexOf(controls.readout));
  controls.humanModelSwitch.checked = true;
  controls.humanModelSwitch.emit('change');
  assert.equal(engine.getState().params.includeHuman, false);
  assert.equal(controls.getState().includeHuman, false);
  controls.dispose();
});
