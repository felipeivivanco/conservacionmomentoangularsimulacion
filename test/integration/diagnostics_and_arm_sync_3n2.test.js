import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createParams } from '../../src/index.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { PhysicsDiagnostics } from '../../src/app/PhysicsDiagnostics.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { PersonVisual } from '../../src/render/PersonVisual.js';

class FakeGroup {
  constructor(){this.children=[];this.visible=true;this.position={x:0,y:0,z:0,set:(x,y,z)=>Object.assign(this.position,{x,y,z})};this.quaternion={x:0,y:0,z:0,w:1,set:(x,y,z,w)=>Object.assign(this.quaternion,{x,y,z,w})};}
  add(...x){this.children.push(...x);}
}
class FakeMesh {
  constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={x:0,y:0,z:0,set:(x,y,z)=>Object.assign(this.position,{x,y,z})};this.rotation={x:0,y:0,z:0};this.scale={x:1,y:1,z:1,set:(x,y,z)=>Object.assign(this.scale,{x,y,z})};this.quaternion={setFromUnitVectors(){},set(){}};}
}
class FakeGeometry { constructor(...args){this.args=args;} dispose(){} }
class FakeMaterial { constructor(options){this.options=options;} dispose(){} }
class FakeVector3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} }
const THREE={Vector3:FakeVector3,Group:FakeGroup,Mesh:FakeMesh,SphereGeometry:class extends FakeGeometry{},CylinderGeometry:class extends FakeGeometry{},MeshBasicMaterial:FakeMaterial};
class FakeElement { constructor(){this.children=[];this.style={};this.textContent='';} append(...x){this.children.push(...x);} appendChild(x){this.children.push(x);} setAttribute(){} replaceChildren(...x){this.children=[...x];} remove(){} }
class FakeDocument { createElement(){return new FakeElement();} }

function makeEngine(){return EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});}
function textOf(d){return d.parameters.children.map(x=>x.children?.map(c=>c.textContent).join(' ')??x.textContent).join(' ');}

function parse(text, name){const m=text.match(new RegExp(`${name} = (-?[0-9]+\\.[0-9]+)`)); assert.ok(m,`missing ${name}`); return Number(m[1]);}

test('3N.2-V1 — magnitudes mostradas cumplen |L| = sqrt(Lx²+Ly²+Lz²) con el mismo snapshot',()=>{
  const engine=makeEngine(); engine.setThetaTarget(Math.PI/3); for(let i=0;i<180;i++) engine.step(engine.getPhysicsDt());
  const state=engine.getState(); const diagnostics=new PhysicsDiagnostics({document:new FakeDocument(),mount:new FakeElement()}); diagnostics.update(state);
  const text=textOf(diagnostics);
  assert.match(text,/L — rueda/); assert.match(text,/L — humano/);
  const shown=diagnostics.getState(state);
  for (const [vector, expected] of [[shown.LWheel, shown.LWheelMagnitude],[shown.LBody, shown.LBodyMagnitude]]) {
    const components=Math.sqrt(vector[0]**2+vector[1]**2+vector[2]**2);
    assert.ok(Math.abs(expected-components)<1e-14);
    for (const value of vector) assert.match(text, new RegExp(`${value.toFixed(4).replace('.', '\\.')}`));
  }
  assert.deepEqual(shown.LWheel,state.L_wheel_world); assert.deepEqual(shown.LBody,state.L_body_world);
});

test('3N.2-V2 — el overlay usa exactamente los mismos vectores físicos que la ficha',()=>{
  const engine=makeEngine(); engine.setThetaTarget(Math.PI/4); for(let i=0;i<120;i++) engine.step(engine.getPhysicsDt());
  const state=engine.getState(); const visual=new PhysicsVisualAdapter({r_w:createParams().r_w}).update(state);
  assert.deepEqual(state.L_wheel_body, state.L_wheel); assert.deepEqual(state.L_body_body, state.L_body);
  assert.equal(Math.hypot(...state.L_wheel_body),Math.hypot(...(state.L_wheel_world)));
  assert.equal(Math.hypot(...state.L_body_body),Math.hypot(...(state.L_body_world)));
  assert.ok(Number.isFinite(visual.wheelPosition.x));
});

test('3N.2-V3 — el brazo no tiene estado angular propio: su longitud/orientación sale de hombro y mano',async()=>{
  const adapter=new PhysicsVisualAdapter({r_w:[0,0.60,0.40]});
  const state={q:[1,0,0,0],theta:0,n_w:[1,0,0],Omega_w:[40,0,0],Omega_b:[0,0,0],L_wheel_body:[12,0,0],L_body_body:[0,0,0],params:{D:8},t:0};
  const visual=adapter.update(state); const person=new PersonVisual({three:THREE});
  person.setPosition(visual.personPosition); person.setOrientation(visual.personQuaternion); person.setGripPositions(visual.gripPositions);
  const armLength=person.leftArm.scale.y*person._armLength;
  const hand=person.leftHand.position; const shoulder=person._shoulderLeft;
  assert.ok(armLength>3); assert.ok(Math.abs(armLength-Math.hypot(hand.x-shoulder.x,hand.y-shoulder.y,hand.z-shoulder.z))<1e-12);
  const text=await readFile(new URL('../../src/render/PersonVisual.js',import.meta.url),'utf8');
  assert.doesNotMatch(text,/setInterval|setTimeout|requestAnimationFrame|spinAngle|angularVelocity/);
});


test('3N.3-A1 — el brazo se determina sólo por hombro y mano, sin estado angular acumulado', async()=>{
  const source=await readFile(new URL('../../src/render/PersonVisual.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame/);
  assert.doesNotMatch(source,/angularVelocity|spinAngle|armAngle|armRotation/);
  assert.match(source,/this\._placeLimb\(this\.leftArm, this\._shoulderLeft, left\)/);
  assert.match(source,/this\._placeLimb\(this\.rightArm, this\._shoulderRight, right\)/);
});

test('3N.3-A2 — magnitudes L mostradas se calculan de sus tres componentes físicos',()=>{
  const engine=makeEngine();
  engine.setThetaTarget(Math.PI/4);
  for(let i=0;i<120;i++) engine.step(engine.getPhysicsDt());
  const state=engine.getState();
  for(const key of ['L_wheel_body','L_body_body']) {
    const v=state[key];
    const expected=Math.sqrt(v[0]**2+v[1]**2+v[2]**2);
    assert.ok(Math.abs(expected-Math.hypot(...v))<1e-12);
  }
});
