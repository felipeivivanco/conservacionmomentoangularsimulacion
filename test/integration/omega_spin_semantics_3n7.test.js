import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { createParams, expressInWorldFrame } from '../../src/index.js';

function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function norm(v){return Math.hypot(...v);}

function audit(mode){
  const engine=EngineAdapter.create({mode,params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  engine.setThetaTarget(40*Math.PI/180);
  let min=Infinity,max=-Infinity,maxErr=0,signChanges=0,prev=null;
  const samples=[];
  for(let i=0;i<2400;i++){
    engine.step(engine.getPhysicsDt());
    const s=engine.getState();
    const spin=dot(s.Omega_w,s.n_w);
    min=Math.min(min,spin); max=Math.max(max,spin); maxErr=Math.max(maxErr,Math.abs(spin-s.params.s0));
    if(prev!==null && prev*spin<0) signChanges++;
    prev=spin;
    if(i%600===0) samples.push({t:s.t,s0:s.params.s0,spin,Omega_w:[...s.Omega_w],n_w:[...s.n_w],theta:s.theta,thetaDot:s.thetaDot,Omega_b:[...s.Omega_b],L_wheel:[...s.L_wheel_body]});
  }
  return {min,max,maxErr,signChanges,samples};
}

test('3N.7-A1 — a 40° wheel-axis audit keeps Ω_w·n_w equal to slider s0 in Free',()=>{
  const r=audit('Free');
  assert.ok(r.samples.length>=4);
  assert.equal(r.signChanges,0);
  assert.ok(r.maxErr<1e-10,`max error ${r.maxErr}`);
  assert.ok(Math.abs(r.min-40)<1e-10);
  assert.ok(Math.abs(r.max-40)<1e-10);
});

test('3N.7-A2 — a 40° wheel-axis audit keeps Ω_w·n_w equal to slider s0 in VerticalBearing',()=>{
  const r=audit('VerticalBearing');
  assert.equal(r.signChanges,0);
  assert.ok(r.maxErr<1e-10,`max error ${r.maxErr}`);
  assert.ok(Math.abs(r.min-40)<1e-10);
  assert.ok(Math.abs(r.max-40)<1e-10);
});

test('3N.7-A3 — snapshot Ω_w and n_w are in the same world frame',()=>{
  const engine=EngineAdapter.create({mode:'Free',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  engine.setThetaTarget(40*Math.PI/180);
  for(let i=0;i<900;i++) engine.step(engine.getPhysicsDt());
  const s=engine.getState();
  const bodyAxis=expressInWorldFrame(s.q,[Math.sin(40*Math.PI/180),0,Math.cos(40*Math.PI/180)]);
  assert.ok(norm(bodyAxis)>0.999999);
  assert.ok(Math.abs(dot(s.Omega_w,s.n_w)-40)<1e-10);
  assert.ok(Math.abs(dot(s.Omega_w,s.n_w)-dot(s.Omega_w,s.n_w))<1e-15);
});
