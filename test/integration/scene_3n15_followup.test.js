import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { SimulationLoop } from '../../src/render/SimulationLoop.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { SimulationControls } from '../../src/app/SimulationControls.js';
import { PhysicsDiagnostics } from '../../src/app/PhysicsDiagnostics.js';

class RafMock {
  constructor() { this.nextId = 1; this.pending = new Map(); }
  requestAnimationFrame = cb => { const id = this.nextId++; this.pending.set(id, cb); return id; };
  cancelAnimationFrame = id => this.pending.delete(id);
  frame(t) { assert.equal(this.pending.size, 1); const [id, cb] = this.pending.entries().next().value; this.pending.delete(id); cb(t); }
}
class FakeElement {
  constructor(tag='div') { this.tagName=tag.toUpperCase(); this.children=[]; this.style={}; this.listeners=new Map(); this.value=''; this.parentNode=null; }
  append(...xs){xs.forEach(x=>this.appendChild(x));}
  appendChild(x){this.children.push(x); if(x&&typeof x==='object')x.parentNode=this; return x;}
  replaceChildren(...xs){this.children=[...xs]; xs.forEach(x=>{if(x&&typeof x==='object')x.parentNode=this;});}
  setAttribute(k,v){this[k]=String(v);}
  addEventListener(k,fn){this.listeners.set(k,fn);}
  removeEventListener(k){this.listeners.delete(k);}
  emit(k,e={}){this.listeners.get(k)?.(e);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}
  focus(){} select(){}
}
class FakeDocument { createElement(tag){return new FakeElement(tag);} createTextNode(text){const n=new FakeElement('#text');n.textContent=text;return n;} }

function harness({mode='VerticalBearing', theta0=0, s0=40}={}) {
  const engine=EngineAdapter.create({mode,params:createParams({s0}),theta0,Omega0:[0,0,0]});
  const controller=new SimulationController({engine});
  const visualAdapter=new PhysicsVisualAdapter({r_w:createParams().r_w,bodyOriginY:0});
  const scene={renders:0,render(){this.renders++;},updatePhysicsOverlays(){},person:null,wheel:null,platform:null};
  const renderer={renders:0,render(){this.renders++;}};
  const raf=new RafMock();
  const loop=new SimulationLoop({controller,visualAdapter,scene,renderer,requestAnimationFrame:raf.requestAnimationFrame,cancelAnimationFrame:raf.cancelAnimationFrame});
  const document=new FakeDocument();
  const mount=new FakeElement('main');
  const controls=new SimulationControls({document,engine,mount,onTogglePause:()=>loop.toggleLifecycle(),onParameterChange:()=>loop.refreshCurrentState(),onThetaTargetChange:state=>{
    const c=controller.getState();
    if(c.status==='stopped'){engine.reset({theta0:state.theta_target});loop.refreshCurrentState();}
    else if(c.status==='paused')loop.setPresentationThetaOverride(state.theta_target);
    else if(c.status==='running'){
      const freshRunning=c.steps===0&&Math.abs(c.physics.t)<=1e-15;
      if(freshRunning) engine.reset({theta0:state.theta_target});
      loop.refreshCurrentState();
    }
  }});
  const diagnostics=new PhysicsDiagnostics({document,mount});
  controls.update(engine.getState());
  loop.reset();
  return {engine,controller,loop,raf,controls,diagnostics,scene,renderer};
}


test('3N.15-THETA-90 — +90°/-90° stopped → Play → change angle never stalls the running presentation',()=>{
  for(const mode of ['VerticalBearing','Free']) for(const initialDegrees of [90,-90]) for(const targetDegrees of [0,45,-45,90,-90]){
    const h=harness({mode,theta0:0,s0:40});
    h.controls.setTargetDegrees(initialDegrees);
    assert.equal(h.controller.getState().status,'stopped');
    assert.ok(Math.abs(h.controller.getState().physics.theta-initialDegrees*Math.PI/180)<1e-14);

    h.loop.start();
    h.raf.frame(0);
    assert.equal(h.controller.getState().status,'running');
    assert.equal(h.raf.pending.size,1);

    const beforeChange=h.controller.getState();
    h.controls.setTargetDegrees(targetDegrees);
    const commanded=h.controller.getState();
    assert.equal(commanded.status,'running');
    assert.equal(commanded.physics.theta_target,targetDegrees*Math.PI/180);
    assert.equal(h.raf.pending.size,1,'el cambio de ángulo no debe cancelar el RAF');

    h.raf.frame(1000/60);
    const afterOne=h.controller.getState();
    assert.ok(afterOne.physics.t>=beforeChange.physics.t,'la simulación debe seguir avanzando');
    assert.equal(afterOne.status,'running');
    assert.equal(h.raf.pending.size,1,'debe quedar exactamente un RAF pendiente');

    h.raf.frame(2000/60);
    const afterTwo=h.controller.getState();
    assert.ok(afterTwo.physics.t>afterOne.physics.t,'el tiempo físico debe continuar actualizándose');
    assert.equal(afterTwo.status,'running');
    assert.equal(h.raf.pending.size,1);
  }
});

function textOf(el){return el.children.map(x=>x.children?.map(y=>y.textContent).join(' ')??x.textContent).join(' ');}
function omega(state){return state.Omega_w[0]*state.n_w[0]+state.Omega_w[1]*state.n_w[1]+state.Omega_w[2]*state.n_w[2];}

test('3N.15-F2 — diámetro refresca visualmente de inmediato en stopped, paused, running y después de reset sin advance',()=>{
  const h=harness();
  let advances=0; const original=h.controller.advance.bind(h.controller); h.controller.advance=d=>{advances++;return original(d);};
  const apply=(D)=>{const before=h.controller.getState();h.controls.diameterSlider.value=String(D);h.controls.diameterSlider.emit('input');const after=h.controller.getState();assert.equal(after.physics.params.D,D);assert.equal(after.physics.t,before.physics.t);assert.equal(after.steps,before.steps);assert.equal(h.loop.getVisualState().wheelDiameter,D);};
  apply(1.2); assert.equal(advances,0);
  h.loop.start(); h.raf.frame(0); h.loop.pause(); const tPaused=h.controller.getState().physics.t; apply(1.6); assert.equal(h.controller.getState().physics.t,tPaused);
  h.loop.resume(); h.raf.frame(1000/60); apply(2.0); assert.ok(advances>0); const tRunning=h.controller.getState().physics.t; assert.equal(h.loop.getVisualState().wheelDiameter,2.0);
  h.loop.reset(); assert.equal(h.controller.getState().status,'stopped'); assert.equal(h.controller.getState().physics.t,0); apply(2.4); assert.equal(h.loop.getVisualState().wheelDiameter,2.4);
});

test('3N.15-G2 — cada cambio de spin running llega al snapshot y refresca sin depender de una modificación previa',()=>{
  const h=harness({mode:'VerticalBearing',theta0:Math.PI/2,s0:0});
  h.loop.start(); h.raf.frame(0);
  const values=[0,10,20,40,60,30,0];
  for(const s of values){h.controls.spinSlider.value=String(s);h.controls.spinSlider.emit('input');const state=h.controller.getState().physics;assert.equal(state.params.s0,s);assert.ok(Math.abs(omega(state)-s)<1e-10);assert.equal(h.loop.getVisualState().wheelDiameter,state.params.D);}
  assert.equal(h.controller.getState().status,'running');
  assert.ok(h.raf.pending.size===1);
});

test('3N.15-H2 — panel izquierdo y Parámetros usan exactamente params.s0 para la velocidad mostrada',()=>{
  const h=harness({s0:0});
  for(const s of [10,20,40,60,30,0]){
    h.controls.spinSlider.value=String(s);h.controls.spinSlider.emit('input');
    const state=h.controller.getState().physics;
    h.diagnostics.update(state);
    assert.equal(h.controls.initialSpinReadout.textContent,`${s.toFixed(2)} rad/s`);
    assert.match(textOf(h.diagnostics.parameters),new RegExp(`Velocidad angular de la rueda.*${s.toFixed(2)} rad/s`));
    assert.equal(h.diagnostics.getState(state).omegaWheel,state.params.s0);
    assert.equal(h.diagnostics.getState(state).physicalOmegaWheel,omega(state));
  }
});

test('3N.15-I2 — spin running en Free produce respuesta cuando el estado físico la predice, sin animación visual artificial',()=>{
  const h=harness({mode:'Free',theta0:0,s0:0});
  h.engine.setSpinRate(40); h.engine.setThetaTarget(Math.PI/3);
  for(let i=0;i<300;i++)h.engine.step(h.engine.getPhysicsDt());
  h.loop.refreshCurrentState();
  const before=h.controller.getState().physics;
  h.loop.start(); h.raf.frame(0);
  for(const s of [10,20,40,60,30,0]){
    h.controls.spinSlider.value=String(s);h.controls.spinSlider.emit('input');
    const commanded=h.controller.getState().physics;
    assert.equal(commanded.params.s0,s);
    assert.ok(Math.abs(omega(commanded)-s)<1e-10);
    h.raf.frame((h.raf.nextId+1)*1000/60);
  }
  const after=h.controller.getState().physics;
  assert.ok(after.t>before.t);
  assert.notDeepEqual(after.q,[1,0,0,0]);
  // The final command is spin=0, so Omega_b may return to zero; q must not.
});

test('3N.15-J2/K2 — theta running en Free cambia target y produce respuesta física con spin no nulo',()=>{
  const h=harness({mode:'Free',theta0:0,s0:40});
  h.loop.start();h.raf.frame(0);h.raf.frame(1000/60);const before=h.controller.getState().physics;
  h.controls.setTargetDegrees(90);const commanded=h.controller.getState().physics;
  assert.equal(commanded.theta_target,Math.PI/2); assert.equal(commanded.t,before.t);
  h.raf.frame(1000/60); const after=h.controller.getState().physics;
  assert.ok(after.theta!==before.theta); assert.ok(after.thetaDot!==before.thetaDot); assert.notDeepEqual(after.Omega_b,[0,0,0]);
});

test('3N.15-K2/L2 — theta y spin en paused no avanzan t/steps ni ejecutan advance',()=>{
  const h=harness({mode:'Free',theta0:0,s0:40});
  h.loop.start();h.raf.frame(0);h.raf.frame(1000/60);h.loop.pause();
  const before=h.controller.getState();let advances=0;h.controller.advance=()=>{advances++;throw new Error('advance no debe ejecutarse en paused');};
  h.controls.setTargetDegrees(60);h.controls.spinSlider.value='20';h.controls.spinSlider.emit('input');
  const after=h.controller.getState();
  assert.equal(after.status,'paused');assert.equal(after.steps,before.steps);assert.equal(after.physics.t,before.physics.t);assert.equal(advances,0);
});

test('3N.15-J3 — en Free, spin=0 no implica L_rueda=0 durante una maniobra theta: thetaDot puede generar reacción física',()=>{
  const engine=EngineAdapter.create({mode:'Free',params:createParams({s0:0}),theta0:0,Omega0:[0,0,0]});
  engine.setThetaTarget(Math.PI/2);
  for(let i=0;i<240;i++)engine.step(engine.getPhysicsDt());
  const state=engine.getState();
  assert.equal(state.params.s0,0);
  assert.ok(Math.abs(state.thetaDot)>1e-6);
  assert.ok(Math.hypot(...state.L_wheel)>1e-6);
  assert.ok(Math.hypot(...state.Omega_b)>1e-6);
  assert.ok(Math.hypot(...state.q.slice(1))>1e-8);
});

test('3N.15-N2 — Free conserva L_total_world durante maniobra theta sin torque externo',()=>{
  const h=harness({mode:'Free',theta0:0,s0:40});
  h.engine.setThetaTarget(Math.PI/2); let first=null; let maxErr=0;
  for(let i=0;i<480;i++){h.engine.step(h.engine.getPhysicsDt());const s=h.engine.getState();if(!first)first=[...s.L_total_world];const err=Math.hypot(...s.L_total_world.map((v,j)=>v-first[j]));maxErr=Math.max(maxErr,err);}
  assert.ok(maxErr<1e-10,`max L error ${maxErr}`);
});

test('3N.15-Q2/R2 — cara cuadrada usa límites independientes de ny/nz sobre la misma SphereGeometry',async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/render/PersonVisual.js',import.meta.url),'utf8'));
  assert.match(source,/const faceRegion = nx >= 0\.68 && Math\.abs\(ny\) <= 0\.38 && Math\.abs\(nz\) <= 0\.38/);
  assert.doesNotMatch(source,/CircleGeometry|PlaneGeometry/);
  assert.match(source,/new Mesh\(headGeometry, astronaut \? \[headMaterial, faceMaterial\]/);
});
