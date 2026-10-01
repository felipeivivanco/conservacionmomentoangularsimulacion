import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createParams } from '../../src/index.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { PersonVisual } from '../../src/render/PersonVisual.js';

class FakeQuaternion {
  constructor(){this.x=0;this.y=0;this.z=0;this.w=1;}
  set(x,y,z,w){Object.assign(this,{x,y,z,w});return this;}
}
class FakeGroup {
  constructor(){this.children=[];this.visible=true;this.position={x:0,y:0,z:0,set:(x,y,z)=>Object.assign(this.position,{x,y,z})};this.quaternion=new FakeQuaternion();}
  add(...items){this.children.push(...items);}
}
class FakeMesh {
  constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={x:0,y:0,z:0,set:(x,y,z)=>Object.assign(this.position,{x,y,z})};this.rotation={x:0,y:0,z:0};this.scale={x:1,y:1,z:1,set:(x,y,z)=>Object.assign(this.scale,{x,y,z})};this.quaternion={setFromUnitVectors(){},set(){}};}
}
class FakeGeometry { constructor(...args){this.args=args;} dispose(){} }
class FakeMaterial { constructor(options){this.options=options;} dispose(){} }
const THREE={Vector3:undefined,Group:FakeGroup,Mesh:FakeMesh,SphereGeometry:class extends FakeGeometry{},CylinderGeometry:class extends FakeGeometry{},MeshBasicMaterial:FakeMaterial};

function distancePointToAxis(point, origin, direction){
  const norm=Math.hypot(...direction);
  const d=direction.map(value=>value/norm);
  const v=[point.x-origin.x,point.y-origin.y,point.z-origin.z];
  const projection=v[0]*d[0]+v[1]*d[1]+v[2]*d[2];
  return Math.hypot(v[0]-projection*d[0],v[1]-projection*d[1],v[2]-projection*d[2]);
}

function rotateVector(v,q){
  const [w,x,y,z]=q;
  const vx=v[0],vy=v[1],vz=v[2];
  const tx=2*(y*vz-z*vy), ty=2*(z*vx-x*vz), tz=2*(x*vy-y*vx);
  return [vx+w*tx+(y*tz-z*ty), vy+w*ty+(z*tx-x*tz), vz+w*tz+(x*ty-y*tx)];
}

function qMultiply(a,b){
  const [aw,ax,ay,az]=a,[bw,bx,by,bz]=b;
  return [aw*bw-ax*bx-ay*by-az*bz, aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw];
}

function qAxisAngle(axis,angle){
  const s=Math.sin(angle/2), c=Math.cos(angle/2);
  return [c,axis[0]*s,axis[1]*s,axis[2]*s];
}

function visualAxisDirection(nWorld){ return [nWorld[1],nWorld[2],nWorld[0]]; }

function assertHandsOnAxis(visual, epsilon=1e-12){
  const axis=visualAxisDirection(visual.n_w);
  const left=distancePointToAxis(visual.gripPositions.left,visual.wheelPosition,axis);
  const right=distancePointToAxis(visual.gripPositions.right,visual.wheelPosition,axis);
  assert.ok(left < epsilon, `left hand/eje = ${left}`);
  assert.ok(right < epsilon, `right hand/eje = ${right}`);
  return Math.max(left,right);
}

function makeEngine(mode, D=0.68){
  return EngineAdapter.create({mode,params:createParams({s0:40,D,Ia:3*D*D/8}),theta0:0,Omega0:[0,20,30]});
}

function applyPersonAndMeasureHandWorld(person, visual, side){
  person.setPosition(visual.personPosition);
  person.setOrientation(visual.personQuaternion);
  person.setGripPositions(visual.gripPositions);
  const local=person[side === 'left' ? 'leftHand' : 'rightHand'].position;
  const q=visual.personQuaternion;
  const rotated=rotateVector([local.x,local.y,local.z],[q.w,q.x,q.y,q.z]);
  return {x:rotated[0]+visual.personPosition.x,y:rotated[1]+visual.personPosition.y,z:rotated[2]+visual.personPosition.z};
}

test('3N.4-H1 — las dos manos quedan sobre el eje para theta/azimut extremos',()=>{
  const adapter=new PhysicsVisualAdapter({r_w:[0,0.60,0.40]});
  const cases=[
    [0,0],
    [Math.PI/2,0],
    [Math.PI/4,Math.PI/4],
    [Math.PI/2,Math.PI/4]
  ];
  for(const [theta,azimuth] of cases){
    const q=qAxisAngle([0,1,0],azimuth);
    const nBody=[Math.cos(theta),0,Math.sin(theta)];
    const nWorld=rotateVector(nBody,q);
    const visual=adapter.update({q,theta,n_w:nWorld,Omega_w:[40,0,0],t:0,params:{D:0.68}});
    assertHandsOnAxis(visual,1e-12);
  }
});

test('3N.4-H2 — la cadena PersonVisual reconstruye exactamente la misma mano mundial entregada por el eje',()=>{
  const adapter=new PhysicsVisualAdapter({r_w:[0,0.60,0.40]});
  const person=new PersonVisual({three:THREE});
  const q=qMultiply(qAxisAngle([0,1,0],Math.PI/4),qAxisAngle([0,0,1],Math.PI/5));
  const theta=Math.PI/4;
  const nWorld=rotateVector([Math.cos(theta),0,Math.sin(theta)],q);
  const visual=adapter.update({q,theta,n_w:nWorld,Omega_w:[0,0,40],t:0,params:{D:8}});
  for(const side of ['left','right']){
    const world=applyPersonAndMeasureHandWorld(person,visual,side);
    const target=visual.gripPositions[side];
    assert.ok(Math.hypot(world.x-target.x,world.y-target.y,world.z-target.z)<1e-12);
  }
  assertHandsOnAxis(visual,1e-12);
});

test('3N.4-H3 — rotacion azimutal continua en Free y VerticalBearing no despega las manos',()=>{
  let globalMax=0;
  for(const mode of ['Free','VerticalBearing']){
    const engine=makeEngine(mode);
    const adapter=new PhysicsVisualAdapter({r_w:createParams().r_w});
    let previousAzimuth=null;
    for(let i=0;i<1800;i++){
      engine.setThetaTarget((Math.PI/2)*Math.sin(i/180));
      const state=engine.step(engine.getPhysicsDt());
      const visual=adapter.update(state);
      globalMax=Math.max(globalMax,assertHandsOnAxis(visual,1e-10));
      const azimuth=Math.atan2(state.n_w[2],state.n_w[0]);
      if(previousAzimuth !== null) assert.ok(Number.isFinite(azimuth));
      previousAzimuth=azimuth;
    }
  }
  assert.ok(globalMax < 1e-10, `max hand/eje distance = ${globalMax}`);
});

test('3N.4-H4 — cambios de theta y D=0.20/8.00 m mantienen las manos sobre el eje',()=>{
  for(const mode of ['Free','VerticalBearing']){
    for(const D of [0.20,8.00]){
      const engine=makeEngine(mode,D);
      const adapter=new PhysicsVisualAdapter({r_w:createParams().r_w});
      for(const target of [0,Math.PI/2,Math.PI/4,-Math.PI/2]){
        engine.setThetaTarget(target);
        for(let i=0;i<240;i++){
          const state=engine.step(engine.getPhysicsDt());
          const visual=adapter.update(state);
          assertHandsOnAxis(visual,1e-10);
          assert.equal(visual.wheelDiameter,D);
        }
      }
    }
  }
});

test('3N.4-H5 — los agarres se construyen directamente desde el centro y direccion FINAL del eje, no desde una segunda cadena angular',async()=>{
  const source=await readFile(new URL('../../src/render/PhysicsVisualAdapter.js',import.meta.url),'utf8');
  assert.match(source,/const leftGripWorld = this\._add\(wheelPositionWorld, this\._scale\(nWorld, gripHalfSpan\)\)/);
  assert.match(source,/const rightGripWorld = this\._add\(wheelPositionWorld, this\._scale\(nWorld, -gripHalfSpan\)\)/);
  assert.doesNotMatch(source,/nBodyFromPhysics/);
  assert.doesNotMatch(source,/leftGripBody|rightGripBody/);
  assert.doesNotMatch(source,/performance\.now|Date\.|setTimeout|setInterval|requestAnimationFrame/);
});


class WorldQuaternion extends FakeQuaternion {
  clone(){ const q=new WorldQuaternion(); q.set(this.x,this.y,this.z,this.w); return q; }
  invert(){ const n=this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w; this.x=-this.x/n; this.y=-this.y/n; this.z=-this.z/n; this.w=this.w/n; return this; }
  setFromUnitVectors(from,to){
    const fx=from.x,fy=from.y,fz=from.z, tx=to.x,ty=to.y,tz=to.z;
    const dot=fx*tx+fy*ty+fz*tz;
    if(dot < -0.999999999){
      let ax=Math.abs(fx)<Math.abs(fy)?[0,-fz,fy]:[-fz,0,fx];
      const len=Math.hypot(...ax); ax=ax.map(v=>v/len); this.set(ax[0],ax[1],ax[2],0); return this;
    }
    const cx=fy*tz-fz*ty, cy=fz*tx-fx*tz, cz=fx*ty-fy*tx;
    const w=Math.sqrt((1+dot)*2); const inv=1/w;
    this.set(cx*inv,cy*inv,cz*inv,w*0.5); return this.normalize();
  }
  normalize(){const n=Math.hypot(this.x,this.y,this.z,this.w);this.x/=n;this.y/=n;this.z/=n;this.w/=n;return this;}
}
class FakeVector3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} }
class WorldVector3 extends FakeVector3 {
  applyQuaternion(q){
    const t=[2*(q.y*this.z-q.z*this.y),2*(q.z*this.x-q.x*this.z),2*(q.x*this.y-q.y*this.x)];
    this.x += q.w*t[0] + (q.y*t[2]-q.z*t[1]);
    this.y += q.w*t[1] + (q.z*t[0]-q.x*t[2]);
    this.z += q.w*t[2] + (q.x*t[1]-q.y*t[0]);
    return this;
  }
}
class WorldGroup extends FakeGroup {
  constructor(){super();this.parent=null;this.scale={x:1,y:1,z:1,set:(x,y,z)=>Object.assign(this.scale,{x,y,z})};this.quaternion=new WorldQuaternion();this.matrixWorld={position:{x:0,y:0,z:0},quaternion:new WorldQuaternion(),scale:{x:1,y:1,z:1}};}
  add(...items){for(const item of items){item.parent=this;this.children.push(item);} }
  updateMatrixWorld(){
    const p=this.parent;
    if(p){
      const rotated=rotateVector([this.position.x*this.scale.x,this.position.y*this.scale.y,this.position.z*this.scale.z],[p.quaternion.w,p.quaternion.x,p.quaternion.y,p.quaternion.z]);
      this.matrixWorld.position={x:p.matrixWorld.position.x+rotated[0],y:p.matrixWorld.position.y+rotated[1],z:p.matrixWorld.position.z+rotated[2]};
      const pq=[p.quaternion.w,p.quaternion.x,p.quaternion.y,p.quaternion.z], cq=[this.quaternion.w,this.quaternion.x,this.quaternion.y,this.quaternion.z];
      const w=qMultiply(pq,cq); this.matrixWorld.quaternion=new WorldQuaternion(); this.matrixWorld.quaternion.set(w[1],w[2],w[3],w[0]);
    } else {
      this.matrixWorld.position={...this.position}; this.matrixWorld.quaternion=this.quaternion.clone();
    }
    for(const child of this.children) child.updateMatrixWorld?.();
  }
}
class WorldMesh extends FakeMesh {
  constructor(geometry,material){super(geometry,material);this.parent=null;this.quaternion=new WorldQuaternion();this.scale={x:1,y:1,z:1,set:(x,y,z)=>Object.assign(this.scale,{x,y,z})};this.matrixWorld={position:{x:0,y:0,z:0},quaternion:new WorldQuaternion(),scale:{x:1,y:1,z:1}};}
  updateMatrixWorld(){
    const p=this.parent;
    if(!p) { this.matrixWorld.position={...this.position}; this.matrixWorld.quaternion=this.quaternion.clone(); return; }
    const rotated=rotateVector([this.position.x*this.scale.x,this.position.y*this.scale.y,this.position.z*this.scale.z],[p.quaternion.w,p.quaternion.x,p.quaternion.y,p.quaternion.z]);
    this.matrixWorld.position={x:p.matrixWorld.position.x+rotated[0],y:p.matrixWorld.position.y+rotated[1],z:p.matrixWorld.position.z+rotated[2]};
    const pq=[p.quaternion.w,p.quaternion.x,p.quaternion.y,p.quaternion.z], cq=[this.quaternion.w,this.quaternion.x,this.quaternion.y,this.quaternion.z];
    const w=qMultiply(pq,cq); this.matrixWorld.quaternion=new WorldQuaternion(); this.matrixWorld.quaternion.set(w[1],w[2],w[3],w[0]);
  }
}
const WORLD_THREE={Vector3:WorldVector3,Group:WorldGroup,Mesh:WorldMesh,SphereGeometry:class extends FakeGeometry{},CylinderGeometry:class extends FakeGeometry{},MeshBasicMaterial:FakeMaterial};

function worldPointFromMatrixWorld(node){ return node.matrixWorld.position; }
function axisDistanceFromWorld(point,origin,direction){ return distancePointToAxis(point,origin,direction); }
function worldAxisFromQuaternion(q){ return rotateVector([1,0,0],[q.w,q.x,q.y,q.z]); }

function finalHierarchyFrame(visual){
  const person=new PersonVisual({three:WORLD_THREE});
  person.setPosition(visual.personPosition);
  person.setOrientation(visual.personQuaternion);
  person.setGripPositionsLocal(visual.gripPositionsLocal);
  person.object.updateMatrixWorld();
  return person;
}

test('3N.4-H6 — world-space final de la jerarquía: matrixWorld de las manos coincide con el eje renderizado',()=>{
  let maxDistance=0;
  for(const mode of ['Free','VerticalBearing']){
    const engine=makeEngine(mode);
    const adapter=new PhysicsVisualAdapter({r_w:createParams().r_w});
    for(let i=0;i<1800;i++){
      engine.setThetaTarget((Math.PI/2)*Math.sin(i/180));
      const state=engine.step(engine.getPhysicsDt());
      const visual=adapter.update(state);
      const person=finalHierarchyFrame(visual);
      const left=worldPointFromMatrixWorld(person.leftHand);
      const right=worldPointFromMatrixWorld(person.rightHand);
      const axisOrigin=visual.wheelPosition;
      const axisDirection=worldAxisFromQuaternion(visual.wheelQuaternion);
      const dl=axisDistanceFromWorld(left,axisOrigin,axisDirection);
      const dr=axisDistanceFromWorld(right,axisOrigin,axisDirection);
      maxDistance=Math.max(maxDistance,dl,dr);
      assert.ok(dl<1e-10,`left final world distance=${dl}`);
      assert.ok(dr<1e-10,`right final world distance=${dr}`);
    }
  }
  assert.ok(maxDistance<1e-10,`max final world hand/eje distance=${maxDistance}`);
});

test('3N.4-H7 — 1800 frames: rotación corporal continua no crea una segunda fase en eje/manos',()=>{
  let maxAxisIncrementMismatch=0;
  const adapter=new PhysicsVisualAdapter({r_w:createParams().r_w});
  let previousAxis=null, previousHand=null;
  const horizontal=(v)=>{const n=Math.hypot(v[0],v[2]); return [v[0]/n,v[2]/n];};
  const phaseStep=(now,prev)=>Math.atan2(now[1]*prev[0]-now[0]*prev[1],now[0]*prev[0]+now[1]*prev[1]);
  for(let i=0;i<1800;i++){
    const azimuth=(2*Math.PI*i)/1799;
    const q=qAxisAngle([0,1,0],azimuth);
    const nWorld=rotateVector([1,0,0],q);
    const visual=adapter.update({q,theta:0,n_w:nWorld,Omega_w:[0,0,0],t:i/60,params:{D:0.68}});
    const person=finalHierarchyFrame(visual);
    const axis=horizontal(worldAxisFromQuaternion(visual.wheelQuaternion));
    const left=[person.leftHand.matrixWorld.position.x-visual.wheelPosition.x,person.leftHand.matrixWorld.position.y-visual.wheelPosition.y,person.leftHand.matrixWorld.position.z-visual.wheelPosition.z];
    const hand=horizontal(left);
    if(previousAxis){ const dh=phaseStep(hand,previousHand), da=phaseStep(axis,previousAxis); maxAxisIncrementMismatch=Math.max(maxAxisIncrementMismatch,Math.abs(Math.atan2(Math.sin(dh-da),Math.cos(dh-da)))); }
    previousAxis=axis; previousHand=hand;
    assertHandsOnAxis(visual,1e-12);
  }
  assert.ok(maxAxisIncrementMismatch<1e-10,`max axis/hand phase increment mismatch=${maxAxisIncrementMismatch}`);
});

test('3N.4-H8 — cambio theta y extremos D=0.20/8.00 preservan la jerarquía final',()=>{
  let maxDistance=0;
  for(const mode of ['Free','VerticalBearing']) for(const D of [0.20,0.68,4,8]){
    const engine=makeEngine(mode,D); const adapter=new PhysicsVisualAdapter({r_w:createParams().r_w});
    for(const target of [0,Math.PI/4,Math.PI/2,Math.PI/4,0]){
      engine.setThetaTarget(target);
      for(let i=0;i<120;i++){
        const visual=adapter.update(engine.step(engine.getPhysicsDt()));
        const person=finalHierarchyFrame(visual);
        const axisOrigin=visual.wheelPosition, axis=worldAxisFromQuaternion(visual.wheelQuaternion);
        const dl=axisDistanceFromWorld(person.leftHand.matrixWorld.position,axisOrigin,axis);
        const dr=axisDistanceFromWorld(person.rightHand.matrixWorld.position,axisOrigin,axis);
        maxDistance=Math.max(maxDistance,dl,dr);
        assert.ok(dl<1e-10); assert.ok(dr<1e-10);
      }
    }
  }
  assert.ok(maxDistance<1e-10,`max theta/D final distance=${maxDistance}`);
});
