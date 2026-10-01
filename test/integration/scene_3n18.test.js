import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { SimulationControls } from '../../src/app/SimulationControls.js';
import { PhysicsDiagnostics } from '../../src/app/PhysicsDiagnostics.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';

class FakeElement {
  constructor(tag='div') { this.tagName=tag.toUpperCase(); this.children=[]; this.style={}; this.listeners=new Map(); this.value=''; this.textContent=''; this.type=''; this.checked=false; }
  append(...xs){this.children.push(...xs);}
  appendChild(x){this.children.push(x); return x;}
  replaceChildren(...xs){this.children=[...xs];}
  setAttribute(k,v){this[k]=String(v);}
  addEventListener(k,fn){this.listeners.set(k,fn);}
  removeEventListener(k){this.listeners.delete(k);}
  emit(k,e={}){this.listeners.get(k)?.(e);}
  remove(){this.removed=true;}
}
class FakeDocument { createElement(tag){return new FakeElement(tag);} createTextNode(text){const n=new FakeElement('#text'); n.textContent=text; return n;} }

function makeControls(mode='VerticalBearing', theta0=0, s0=40) {
  const document=new FakeDocument();
  const mount=new FakeElement('main');
  const engine=EngineAdapter.create({mode,params:createParams({s0}),theta0,Omega0:[0,0,0]});
  const controller=new SimulationController({engine});
  const controls=new SimulationControls({document,engine,mount});
  return {document,mount,engine,controller,controls};
}
function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0);}
function diff(a,b){return Math.hypot(...a.map((v,i)=>v-b[i]));}
function near(a,b,tol=1e-10){assert.ok(Math.abs(a-b)<=tol,`${a} !~= ${b}`);}

for (const mode of ['VerticalBearing','Free']) {
  test(`3N.18-A — switch en ${mode} STOP invierte el signo físico sin cambiar la magnitud`, () => {
    const {engine,controls}=makeControls(mode,0,40);
    assert.equal(controls.spinSlider.value,'40');
    assert.equal(controls.directionState.textContent,'Antihorario (+)');
    controls.directionSwitch.checked=true;
    controls.directionSwitch.emit('change');
    const s=engine.getState();
    assert.equal(s.params.s0,-40);
    near(Math.abs(dot(s.Omega_w,s.n_w)),40,1e-10);
    assert.equal(controls.getInitialSpin(),-40);
    assert.equal(controls.directionState.textContent,'Horario (−)');
    controls.directionSwitch.checked=false;
    controls.directionSwitch.emit('change');
    assert.equal(engine.getState().params.s0,40);
  });

  test(`3N.18-B — omega=0 permanece 0 al invertir el switch en ${mode}`, () => {
    const {engine,controls}=makeControls(mode,0,0);
    const before=engine.getState();
    controls.directionSwitch.checked=true;
    controls.directionSwitch.emit('change');
    const after=engine.getState();
    assert.ok(Math.abs(after.params.s0) < 1e-15);
    near(dot(after.Omega_w,after.n_w),0,1e-12);
    assert.ok(diff(after.L_wheel_world,before.L_wheel_world)<1e-12);
    assert.ok(diff(after.Omega_b,before.Omega_b)<1e-12);
  });
}

test('3N.18-C — switch en PAUSE no avanza t/steps pero aplica la intervención física', () => {
  const {engine,controller,controls}=makeControls('Free',45,40);
  controller.start(); controller.advance(0.1); controller.pause();
  const before=controller.getState();
  controls.directionSwitch.checked=true; controls.directionSwitch.emit('change');
  const after=controller.getState();
  assert.equal(after.status,'paused');
  assert.equal(after.steps,before.steps);
  near(after.physics.t,before.physics.t,1e-15);
  assert.equal(after.physics.params.s0,-40);
  assert.ok(diff(after.physics.L_wheel_world,before.physics.L_wheel_world)>1e-10);
});

test('3N.18-D — switch RUNNING usa la misma intervención física que setSpinRate y conserva L_total en Free', () => {
  const {engine,controller,controls}=makeControls('Free',45,40);
  controller.start(); controller.advance(0.1);
  const before=engine.getState();
  controls.directionSwitch.checked=true; controls.directionSwitch.emit('change');
  const after=engine.getState();
  assert.equal(after.params.s0,-40);
  near(dot(after.Omega_w,after.n_w),-40,1e-10);
  assert.ok(diff(after.L_wheel_world,before.L_wheel_world)>1e-10);
  assert.ok(diff(after.L_body_world,before.L_body_world)>1e-10);
  near(diff(after.L_total_world,before.L_total_world),0,1e-10);
  assert.equal(after.external_control.internal,true);
  assert.equal(after.external_control.external,false);
});

test('3N.18-E — cambiar magnitud conserva el sentido seleccionado', () => {
  const {engine,controls}=makeControls('Free',45,40);
  controls.directionSwitch.checked=true; controls.directionSwitch.emit('change');
  controls.spinSlider.value='60'; controls.spinSlider.emit('input');
  assert.equal(engine.getState().params.s0,-60);
  assert.equal(controls.spinSlider.value,'60');
  assert.equal(controls.getInitialSpin(),-60);
  controls.directionSwitch.checked=false; controls.directionSwitch.emit('change');
  assert.equal(engine.getState().params.s0,60);
});

test('3N.18-F — RESET conserva la configuración de magnitud y sentido y deja STOP', () => {
  const {engine,controller,controls}=makeControls('VerticalBearing',0,40);
  controls.directionSwitch.checked=true; controls.directionSwitch.emit('change');
  controls.spinSlider.value='60'; controls.spinSlider.emit('input');
  controller.start(); controller.advance(0.1);
  const resetParams=controls.getInitialSpin();
  assert.equal(resetParams,-60);
  engine.setInitialSpin(resetParams);
  engine.reset();
  const s=engine.getState();
  assert.equal(s.params.s0,-60);
  near(dot(s.Omega_w,s.n_w),-60,1e-10);
  assert.equal(s.t,0);
});


test('3N.18-H — el signo físico también invierte el sentido visual de giro de la rueda, sin tocar q humano', () => {
  const engine=EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:20}),theta0:0,Omega0:[0,0,0]});
  const visual=new PhysicsVisualAdapter({r_w:createParams().r_w,bodyOriginY:0});
  visual.update(engine.getState());
  const start=visual.getVisualState().wheelSpinAngle;
  engine.step(engine.getPhysicsDt());
  visual.update(engine.getState());
  const positiveDelta=visual.getVisualState().wheelSpinAngle-start;
  engine.setSpinRate(-20);
  const beforeNegative=visual.getVisualState().wheelSpinAngle;
  engine.step(engine.getPhysicsDt());
  visual.update(engine.getState());
  engine.step(engine.getPhysicsDt());
  visual.update(engine.getState());
  const negativeDelta=visual.getVisualState().wheelSpinAngle-beforeNegative;
  assert.ok(positiveDelta>0);
  assert.ok(negativeDelta<0);
  assert.deepEqual(engine.getState().q,[1,0,0,0]);
});


for (const mode of ['VerticalBearing','Free']) {
  test(`3N.18-I — switch RUNNING ${mode}: +40 -> -40 modifica el estado físico con la misma intervención`, () => {
    const {engine,controller,controls}=makeControls(mode,45,40);
    controller.start(); controller.advance(0.1);
    const before=engine.getState();
    controls.directionSwitch.checked=true; controls.directionSwitch.emit('change');
    const after=engine.getState();
    assert.equal(after.params.s0,-40);
    near(dot(after.Omega_w,after.n_w),-40,1e-10);
    assert.ok(diff(after.L_wheel_world,before.L_wheel_world)>1e-10);
    assert.ok(diff(after.Omega_b,before.Omega_b)>1e-10);
    if(mode==='Free') near(diff(after.L_total_world,before.L_total_world),0,1e-10);
    assert.equal(after.external_control.internal,true);
  });
}

test('3N.18-G — PhysicsDiagnostics conserva ? y tooltip Y únicamente en Plataforma', () => {
  const doc=new FakeDocument();
  const mount=new FakeElement('main');
  const free=new PhysicsDiagnostics({document:doc,mount,mode:'Free'});
  const vb=new PhysicsDiagnostics({document:doc,mount,mode:'VerticalBearing'});
  const freeState=EngineAdapter.create({mode:'Free'}).getState();
  const vbState=EngineAdapter.create({mode:'VerticalBearing'}).getState();
  free.update(freeState);
  vb.update(vbState);
  assert.equal(free._humanYTooltips.length,0);
  assert.equal(vb._humanYTooltips.length,1);
});
