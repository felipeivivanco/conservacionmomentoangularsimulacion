import test from 'node:test';
import assert from 'node:assert/strict';
import { createParams, expressInBodyFrame, expressInWorldFrame } from '../../src/index.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';

const nearVec=(a,b,t=1e-12)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<t,`${v} != ${b[i]}`));

test('3N-F1 — theta=0: rueda vertical con eje +X_body y L rueda axial en X_body',()=>{
  const e=EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  const s=e.getState();
  nearVec(s.L_wheel_body,[12,0,0]);
  nearVec(s.L_total_body,[12,0,0]);
  nearVec(s.L_total,[12,0,0]);
});

test('3N-F2 — theta=+90°: eje +Z_body y L rueda principalmente en Z_body',()=>{
  const e=EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:40}),theta0:Math.PI/2,Omega0:[0,0,0]});
  const s=e.getState();
  nearVec(s.L_wheel_body,[0,0,12]);
  nearVec(s.L_total_body,[0,0,12]);
  nearVec(s.L_total,[0,0,12]);
});

test('3N-F3 — una rotación azimutal cambia coordenadas mundo pero no las componentes del mismo vector en marco corporal',()=>{
  const qz=[Math.cos(Math.PI/4),0,0,Math.sin(Math.PI/4)];
  const Lbody=[12,0,0];
  const Lworld=expressInWorldFrame(qz,Lbody);
  const recovered=expressInBodyFrame(qz,Lworld);
  nearVec(Lworld,[0,12,0]);
  nearVec(recovered,Lbody);
});

test('3N-F4 — snapshot separa L rueda, L humano y L total en body/world',()=>{
  const e=EngineAdapter.create({mode:'Free',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  const s=e.getState();
  nearVec(s.L_total_body,s.L_wheel_body.map((v,i)=>v+s.L_body_body[i]));
  nearVec(s.L_total,s.L_wheel_world.map((v,i)=>v+s.L_body_world[i]));
});
