import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { WheelVisual } from '../../src/render/WheelVisual.js';
import { PersonVisual } from '../../src/render/PersonVisual.js';

class FakeQuaternion { constructor() { this.x=0;this.y=0;this.z=0;this.w=1; } set(x,y,z,w){this.x=x;this.y=y;this.z=z;this.w=w;return this;} }
class FakeGroup { constructor(){this.children=[];this.visible=true;this.quaternion=new FakeQuaternion();this.rotation={x:0,y:0,z:0};this.position={x:0,y:0,z:0,set:(x,y,z)=>Object.assign(this.position,{x,y,z})};} add(...o){this.children.push(...o);} }
class FakeMesh { constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={x:0,y:0,z:0,set:(x,y,z)=>Object.assign(this.position,{x,y,z})};this.rotation={x:0,y:0,z:0};} }
class FakeGeometry { constructor(...args){this.args=args;this.disposed=false;} dispose(){this.disposed=true;} }
class FakeMaterial { constructor(options){this.options=options;this.disposed=false;} dispose(){this.disposed=true;} }
const FakeTHREE={Group:FakeGroup,Mesh:FakeMesh,SphereGeometry:class extends FakeGeometry{},CylinderGeometry:class extends FakeGeometry{},TorusGeometry:class extends FakeGeometry{},MeshBasicMaterial:FakeMaterial};

const identity={q:[1,0,0,0],theta:0,n_w:[1,0,0],Omega_w:[0,0,0],t:0};
const arbitrary={q:[0.5,-0.25,0.75,-0.125],theta:0.37,n_w:[0.8,0,0.6],Omega_w:[1,2,3],t:0};
function makeAdapter(){return new PhysicsVisualAdapter({r_w:[0,0.6,0.4]});}
function assertFiniteQuaternion(q){for(const v of Object.values(q)) assert.ok(Number.isFinite(v));}

test('A — PhysicsVisualAdapter can be constructed',()=>assert.doesNotThrow(()=>makeAdapter()));
test('B — accepts a valid physics snapshot',()=>assert.doesNotThrow(()=>makeAdapter().update(arbitrary)));
test('C — preserves person orientation as a visual coordinate conversion of q',()=>{const v=makeAdapter().update(identity);assert.deepEqual(v.personQuaternion,{x:0,y:0,z:0,w:1});});
test('D — theta is preserved without redefining the physical angle',()=>{const v=makeAdapter().update(arbitrary);assert.equal(v.theta,arbitrary.theta);});
test('E — wheel does not receive the person quaternion indiscriminately',()=>{const v=makeAdapter().update(identity);assert.notDeepEqual(v.wheelQuaternion,v.personQuaternion);});
test('F — theta=0 with identity q produces a horizontal axle and vertical wheel basis',()=>{const v=makeAdapter().update(identity);assertFiniteQuaternion(v.wheelQuaternion);assert.deepEqual(v.wheelPosition,{x:0.6,y:1.3,z:0});
  assert.deepEqual(v.personPosition,{x:0,y:0.9,z:0});
  assert.equal(v.wheelSpinAngle,0);});
test('G — physical axial spin becomes presentation-only wheel phase',()=>{const a=makeAdapter();a.update({q:[1,0,0,0],theta:0,n_w:[1,0,0],Omega_w:[40,0,0],t:0});const v=a.update({q:[1,0,0,0],theta:0,n_w:[1,0,0],Omega_w:[40,0,0],t:0.25});assert.ok(Math.abs(v.wheelSpinAngle-10)<1e-12);assert.deepEqual(v.personQuaternion,{x:0,y:0,z:0,w:1});});
test('H — r_w is transformed by the physical body orientation',()=>{const q=[Math.cos(Math.PI/4),0,0,Math.sin(Math.PI/4)];const v=makeAdapter().update({q,theta:0,n_w:[0,1,0],Omega_w:[0,40,0],t:0});assert.ok(Math.abs(v.wheelPosition.x)<1e-12);assert.ok(Math.abs(v.wheelPosition.y-1.3)<1e-12);assert.ok(Math.abs(v.wheelPosition.z+0.6)<1e-12);});
test('I — thetaEffective and q determine wheel orientation consistently',()=>{const a=makeAdapter();const a0=a.update(identity).wheelQuaternion;const a1=a.update({q:[1,0,0,0],theta:Math.PI/2,n_w:[1,0,0],Omega_w:[0,0,40],t:0}).wheelQuaternion;assert.notDeepEqual(a0,a1);});
test('J — update does not modify the original snapshot',()=>{const a=makeAdapter();const snapshot=structuredClone(arbitrary);a.update(snapshot);assert.deepEqual(snapshot,arbitrary);});
test('K — getVisualState returns an isolated copy',()=>{const a=makeAdapter();a.update(identity);const v=a.getVisualState();v.personQuaternion.x=99;v.wheelPosition.x=99;assert.equal(a.getVisualState().personQuaternion.x,0);assert.equal(a.getVisualState().wheelPosition.x,0.6);
  assert.equal(a.getVisualState().wheelPosition.y,1.3);});
test('L — adapter source contains no simulation stepping calls',async()=>{const source=await readFile(new URL('../../src/render/PhysicsVisualAdapter.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(step|advance|run|frame)\s*\(/);});
test('M — invalid values produce clear errors',()=>{const a=makeAdapter();assert.throws(()=>a.update(null),/physicsState must be an object/);assert.throws(()=>a.update({q:[1,2,3],theta:0,n_w:[1,0,0]}),/q must be an array of four/);assert.throws(()=>a.update({q:[1,0,0,0],theta:NaN,n_w:[1,0,0],Omega_w:[0,0,0],t:0}),/theta must be a finite number/);assert.throws(()=>a.update({q:[1,0,0,0],theta:0,n_w:[1,2],Omega_w:[0,0,0],t:0}),/n_w must be an array of three/);});
test('N — WheelVisual accepts separate orientation and position',()=>{const w=new WheelVisual({three:FakeTHREE});assert.doesNotThrow(()=>w.setOrientation({x:0,y:0,z:0,w:1}));assert.doesNotThrow(()=>w.setPosition({x:0.6,y:0.4,z:0}));assert.equal(w.object.position.x,0.6);assert.equal(w.object.position.y,0.4);assert.equal(w.object.position.z,0);});
test('O — WheelVisual reserves an independent local spin transform',()=>{const w=new WheelVisual({three:FakeTHREE});w.setSpinAngle(0.75);assert.equal(w.wheelAssembly.rotation.x,0.75);});
test('P — PersonVisual remains presentation-only',()=>{const p=new PersonVisual({three:FakeTHREE});p.setOrientation({x:0,y:0,z:0,w:1});assert.equal(p.object.quaternion.w,1);});

test('P — grip positions are derived from physical wheel position and n_w',()=>{
  const a=makeAdapter();
  const v=a.update({q:[1,0,0,0],theta:0,n_w:[1,0,0],Omega_w:[40,0,0],t:0});
  assert.deepEqual(v.gripPositions,{left:{x:0.6,y:1.3,z:0.3},right:{x:0.6,y:1.3,z:-0.3}});
  const turned=a.update({q:[1,0,0,0],theta:Math.PI/2,n_w:[0,0,1],Omega_w:[0,0,40],t:0});
  assert.ok(Math.abs(turned.gripPositions.left.x-0.6)<1e-12);
  assert.ok(Math.abs(turned.gripPositions.right.x-0.6)<1e-12);
  assert.ok(Math.abs(turned.gripPositions.left.y-1.6)<1e-12);
  assert.ok(Math.abs(turned.gripPositions.right.y-1.0)<1e-12);
  assert.ok(Math.abs(turned.gripPositions.left.z)<1e-12);
  assert.ok(Math.abs(turned.gripPositions.right.z)<1e-12);
});
