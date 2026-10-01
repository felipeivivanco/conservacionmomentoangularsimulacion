import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams } from '../../src/index.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { SimulationLoop } from '../../src/render/SimulationLoop.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';

class RafMock {
  constructor(){ this.next=1; this.pending=new Map(); }
  requestAnimationFrame = cb => { const id=this.next++; this.pending.set(id,cb); return id; };
  cancelAnimationFrame = id => this.pending.delete(id);
  frame(t){ assert.equal(this.pending.size,1); const [id,cb]=this.pending.entries().next().value; this.pending.delete(id); cb(t); }
}

function harness(mode, includeHuman, theta0){
  const engine=EngineAdapter.create({mode,params:createParams({s0:40,includeHuman}),theta0,Omega0:[0,0,0]});
  const controller=new SimulationController({engine});
  const visualAdapter=new PhysicsVisualAdapter({r_w:createParams().r_w,bodyOriginY:0});
  const raf=new RafMock();
  let notifications=0;
  const scene={person:null,wheel:null,platform:null,updatePhysicsOverlays(){},render(){}};
  const renderer={render(){}};
  const loop=new SimulationLoop({controller,visualAdapter,scene,renderer,
    requestAnimationFrame:raf.requestAnimationFrame,cancelAnimationFrame:raf.cancelAnimationFrame,
    onPhysicsState:()=>{notifications++;}
  });
  return {engine,controller,loop,raf,get notifications(){return notifications;}};
}

test('angle change at ±90° keeps both scenes running with full and simplified human models',()=>{
  for(const mode of ['VerticalBearing','Free']) for(const includeHuman of [true,false]) for(const initial of [Math.PI/2,-Math.PI/2]){
    const h=harness(mode,includeHuman,initial);
    h.loop.start();
    h.raf.frame(0);
    const before=h.controller.getState().physics.t;
    h.engine.setThetaTarget(0);
    h.loop.refreshCurrentState({notifyPhysics:false});
    assert.equal(h.controller.getState().status,'running');
    h.raf.frame(1000/60);
    const after=h.controller.getState().physics;
    assert.ok(after.t>before);
    assert.ok(after.q.every(Number.isFinite));
    assert.ok(after.Omega_b.every(Number.isFinite));
    assert.ok(after.Omega_w.every(Number.isFinite));
    assert.equal(h.raf.pending.size,1);
  }
});

test('running visual refresh can skip duplicate physical-state notification',()=>{
  const h=harness('VerticalBearing',true,Math.PI/2);
  h.loop.start(); h.raf.frame(0);
  const n=h.notifications;
  h.loop.refreshCurrentState({notifyPhysics:false});
  assert.equal(h.notifications,n);
  h.loop.refreshCurrentState();
  assert.equal(h.notifications,n+1);
});
