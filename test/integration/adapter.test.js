import test from 'node:test';
import assert from 'node:assert/strict';
import { createParams } from '../../src/index.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';

function close(a,b,t=1e-12){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<=t,`${a[i]} != ${b[i]}`)}

test('A: creates valid initial state',()=>{const e=EngineAdapter.create();const s=e.getState();assert.equal(s.t,0);assert.ok(Array.isArray(s.q));assert.equal(s.q.length,4);assert.equal(e.getPhysicsDt(),createParams().dt)});
test('B: Free advances',()=>{const e=EngineAdapter.create({mode:'Free'});const q=e.getState().q;e.step(e.getPhysicsDt());assert.equal(e.getState().t,e.getPhysicsDt());assert.notEqual(e.getState().t,0); assert.deepEqual(e.getState().q,q)});
test('C: VerticalBearing advances',()=>{const e=EngineAdapter.create({mode:'VerticalBearing'});e.step(e.getPhysicsDt());assert.equal(e.getState().t,e.getPhysicsDt())});
test('D: reset restores initial state',()=>{const e=EngineAdapter.create();const initial=e.getState();e.step(e.getPhysicsDt());e.reset();const s=e.getState();assert.equal(s.t,initial.t);close(s.q,initial.q);assert.equal(s.W_act,initial.W_act)});
test('E: deterministic',()=>{const a=EngineAdapter.create(),b=EngineAdapter.create();for(let i=0;i<10;i++){a.step(a.getPhysicsDt());b.step(b.getPhysicsDt())}const sa=a.getState(),sb=b.getState();assert.equal(sa.t,sb.t);close(sa.q,sb.q);assert.equal(sa.W_act,sb.W_act)});
test('F: invalid params rejected',()=>{assert.throws(()=>EngineAdapter.create({params:createParams({m_p:0})}));});
test('G: mode change rebuilds and resets',()=>{const e=EngineAdapter.create({mode:'Free'});e.step(e.getPhysicsDt());e.setMode('VerticalBearing');const s=e.getState();assert.equal(s.t,0);assert.equal(s.tau_bearing instanceof Array,true)});
test('H: state snapshot is isolated',()=>{const e=EngineAdapter.create();const s=e.getState();s.q[0]=999;s.Omega_b[0]=999;const now=e.getState();assert.notEqual(now.q[0],999);assert.notEqual(now.Omega_b[0],999)});
test('I: setParams validates, rebuilds and resets',()=>{const e=EngineAdapter.create();e.step(e.getPhysicsDt());const p=createParams({s0:10});e.setParams(p);assert.equal(e.getState().t,0);assert.equal(e.getPhysicsDt(),p.dt);assert.throws(()=>e.setParams({...p,m_p:-1}))});
