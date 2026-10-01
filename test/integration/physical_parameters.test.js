import test from 'node:test';
import assert from 'node:assert/strict';
import { createParams } from '../../src/index.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { WheelVisual } from '../../src/render/WheelVisual.js';
import { PersonVisual } from '../../src/render/PersonVisual.js';


class FakeVector3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} }
class FakeGroup {
  constructor(){this.children=[];this.visible=true;this.scale={x:1,y:1,z:1,set:(x,y,z)=>{this.scale.x=x;this.scale.y=y;this.scale.z=z;}};this.position={x:0,y:0,z:0,set:(x,y,z)=>{this.position.x=x;this.position.y=y;this.position.z=z;}};this.quaternion={x:0,y:0,z:0,w:1,set:(x,y,z,w)=>{this.quaternion.x=x;this.quaternion.y=y;this.quaternion.z=z;this.quaternion.w=w;}};this.rotation={x:0,y:0,z:0};}
  add(...objects){this.children.push(...objects);}
}
class FakeMesh {
  constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={x:0,y:0,z:0,set:(x,y,z)=>{this.position.x=x;this.position.y=y;this.position.z=z;}};this.rotation={x:0,y:0,z:0};this.scale={x:1,y:1,z:1,set:(x,y,z)=>{this.scale.x=x;this.scale.y=y;this.scale.z=z;}};this.quaternion={setFromUnitVectors(){},set(){}};}
}
class FakeGeometry { constructor(...args){this.args=args;} dispose(){} }
class FakeMaterial { constructor(options){this.options=options;} dispose(){} }
const THREE = {
  Vector3: FakeVector3, Group: FakeGroup, Mesh: FakeMesh, SphereGeometry: class extends FakeGeometry {},
  CylinderGeometry: class extends FakeGeometry {}, TorusGeometry: class extends FakeGeometry {},
  MeshBasicMaterial: FakeMaterial
};

const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const finiteVec = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const near = (a,b,t=1e-10) => assert.ok(Math.abs(a-b) <= t*Math.max(1,Math.abs(b)), `${a} != ${b}`);

function makeEngine(params = createParams({s0:40})) {
  return EngineAdapter.create({mode:'VerticalBearing', params, theta0:0, Omega0:[0,0,0]});
}

test('3M-1 — D e Ia son parámetros físicos válidos y respetan Ia <= m_w R²', () => {
  const engine = makeEngine();
  let s = engine.getState();
  assert.equal(s.params.D, 0.68);
  assert.equal(s.params.Ia, 0.30);
  assert.ok(s.params.Ia <= s.params.m_w * s.params.R ** 2 + 1e-14);
  assert.throws(() => engine.setWheelInertia(0), /Ia/);
  assert.throws(() => engine.setWheelDiameter(0), /D/);
  s = engine.setWheelDiameter(0.2);
  assert.ok(s.params.Ia <= s.params.m_w * s.params.R ** 2 + 1e-14);
  assert.equal(s.params.Ia, s.params.m_w * s.params.R ** 2);
});

test('3M-2 — cambiar D actualiza R y geometría visual, conservando el centro', () => {
  const engine = makeEngine();
  const before = engine.getState();
  const after = engine.setWheelDiameter(1.40);
  assert.equal(after.params.D, 1.40);
  assert.equal(after.params.R, 0.70);
  assert.notDeepEqual(after.L_total, before.L_total);
  assert.ok(Math.abs(after.L_wheel[0]) > Math.abs(before.L_wheel[0]));
  const wheel = new WheelVisual({three: THREE, radius: before.params.R});
  const centerBefore = {x:0,y:0,z:0};
  wheel.setPosition(centerBefore);
  wheel.setDiameter(after.params.D);
  assert.equal(wheel.radius, 0.70);
  assert.equal(wheel.object.position.x, 0);
  assert.equal(wheel.object.position.y, 0);
  assert.equal(wheel.object.position.z, 0);
  assert.equal(wheel.wheelAssembly.scale.x, 1);
  assert.equal(wheel.wheelAssembly.scale.y, 1);
  assert.equal(wheel.wheelAssembly.scale.z, 1);
  assert.equal(wheel.rim.geometry.args[0], 0.70);
});

test('3M-3 — Ia cambia realmente el parámetro y conserva el momento angular axial', () => {
  const engine = makeEngine();
  const before = engine.getState();
  const after = engine.setWheelInertia(0.15);
  assert.equal(after.params.Ia, 0.15);
  assert.equal(dot(after.Omega_w, after.n_w), 80);
  assert.equal(after.params.ps, undefined);
  assert.deepEqual(after.L_total, before.L_total);
  assert.ok(Number.isFinite(after.T));
  assert.ok(Number.isFinite(after.W_parameter));
});

test('3M-4 — cambiar D recalcula Ia según el modelo de aro delgado', () => {
  const engine = makeEngine();
  const larger = engine.setWheelDiameter(1.2);
  assert.equal(larger.params.Ia, larger.params.m_w * larger.params.R ** 2);
  const smaller = engine.setWheelDiameter(0.5);
  assert.ok(smaller.params.Ia <= smaller.params.m_w * smaller.params.R ** 2 + 1e-14);
  assert.equal(smaller.params.Ia, smaller.params.m_w * smaller.params.R ** 2);
  assert.ok(smaller.L_total.every(Number.isFinite));
});

test('3M-4b — masa de rueda recalcula Ia según el modelo de aro delgado', () => {
  const engine = makeEngine();
  const before = engine.getState();
  const after = engine.setWheelMass(1.0);
  assert.equal(after.params.m_w, 1.0);
  assert.equal(after.params.Ia, after.params.m_w * after.params.R ** 2);
  assert.notEqual(after.params.mu, before.params.mu);
  assert.ok(Number.isFinite(after.Omega_w[0]));
  assert.notEqual(after.L_total[0], before.L_total[0]);
  assert.equal(after.params.s0, before.params.s0);
  assert.equal(after.params.Ia * after.params.s0, after.L_wheel[0]);
  assert.match(after.external_control.parameter, /m_w/);
});

test('3N.5-P1 — el modelo interactivo usa exclusivamente el aro delgado I = mD²/4', () => {
  const engine = makeEngine();
  for (const [m, D] of [[3, 0.68], [1, 0.2], [5, 4], [20, 8]]) {
    engine.setWheelMass(m);
    const state = engine.setWheelDiameter(D);
    assert.equal(state.params.Ia, state.params.m_w * state.params.D ** 2 / 4);
  }
});

test('3N.5-P2 — el momento axial de la rueda usa el mismo Ia que L = Iω', () => {
  const engine = makeEngine();
  engine.setWheelMass(5);
  engine.setWheelDiameter(1.2);
  engine.setSpinRate(60);
  const state = engine.getState();
  const wheelSpin = state.Omega_w[0] * state.n_w[0] + state.Omega_w[1] * state.n_w[1] + state.Omega_w[2] * state.n_w[2];
  const axialL = state.L_wheel_world[0] * state.n_w[0] + state.L_wheel_world[1] * state.n_w[1] + state.L_wheel_world[2] * state.n_w[2];
  assert.ok(Math.abs(axialL - state.params.Ia * wheelSpin) < 1e-10);
});

test('3M-5/3N.17 — velocidad angular live modifica Omega_w y reacciona el cuerpo mediante una intervención interna', () => {
  const engine = makeEngine();
  const before = engine.getState();
  const after = engine.setSpinRate(60);
  assert.equal(dot(after.Omega_w, after.n_w), 60);
  assert.equal(after.params.s0, 60);
  assert.deepEqual(after.external_control.deltaL, [6,0,0]);
  assert.ok(after.W_control > 0);
  // theta=0 in VerticalBearing has no yaw coupling: the bearing absorbs the
  // horizontal spin-drive torque. The wheel state still changes physically.
  assert.notDeepEqual(after.L_total, before.L_total);
  assert.ok(Math.hypot(...after.L_wheel.map((v,i)=>v-before.L_wheel[i])) > 1e-12);
  assert.ok(Math.abs(after.L_total[2]-before.L_total[2]) < 1e-12);
  assert.equal(after.theta_target, before.theta_target);
});

test('3M-6 — L_total del snapshot tiene tres componentes finitas y su magnitud coincide con el panel', () => {
  const engine = makeEngine();
  engine.setThetaTarget(Math.PI/2);
  for (let i=0;i<240;i++) engine.step(engine.getPhysicsDt());
  const s = engine.getState();
  assert.ok(finiteVec(s.L_total));
  const mag = Math.hypot(...s.L_total);
  near(mag, Math.hypot(s.L_total[0],s.L_total[1],s.L_total[2]));
  assert.equal(s.L_total.length, 3);
});

test('3M-7 — pausa congela theta, Omega, L y parámetros; reanudar continúa', () => {
  const engine = makeEngine();
  const controller = new SimulationController({engine});
  controller.start();
  controller.advance(0.25);
  const before = controller.getState().physics;
  controller.pause();
  controller.advance(0.25);
  const paused = controller.getState().physics;
  assert.equal(paused.t, before.t);
  assert.deepEqual(paused.L_total, before.L_total);
  assert.deepEqual(paused.Omega_w, before.Omega_w);
  assert.deepEqual(paused.params, before.params);
  controller.resume();
  controller.advance(0.25);
  assert.ok(controller.getState().physics.t > before.t);
});

test('3M-8 — Reset reaplica los parámetros seleccionados y restablece el estado físico', () => {
  const engine = makeEngine();
  engine.setWheelDiameter(1.2);
  engine.setWheelInertia(0.5);
  engine.setSpinRate(60);
  engine.setThetaTarget(Math.PI/2);
  for (let i=0;i<120;i++) engine.step(engine.getPhysicsDt());
  const reset = engine.reset();
  assert.equal(reset.t, 0);
  assert.equal(reset.theta, 0);
  assert.equal(reset.theta_target, 0);
  assert.equal(reset.params.D, 1.2);
  assert.equal(reset.params.Ia, 0.5);
  assert.equal(reset.params.s0, 60);
  assert.deepEqual(reset.q, [1,0,0,0]);
  assert.deepEqual(reset.Omega_b, [0,0,0]);
  assert.equal(dot(reset.Omega_w, reset.n_w), 60);
});

test('3M-9 — diámetro extremo alarga brazos visuales sin desconectarlos del hombro', () => {
  const engine = makeEngine();
  engine.setWheelDiameter(4.0);
  const state = engine.getState();
  const visual = new PhysicsVisualAdapter({r_w: createParams().r_w});
  const v = visual.update(state);
  const person = new PersonVisual({three: THREE});
  person.setGripPositions(v.gripPositions);
  const leftShoulder = person._shoulderLeft;
  const rightShoulder = person._shoulderRight;
  person.setPosition(v.personPosition);
  person.setOrientation(v.personQuaternion);
  person.setGripPositions(v.gripPositions);
  const leftLength = Math.hypot(person.leftArm.position.x-leftShoulder.x, person.leftArm.position.y-leftShoulder.y, person.leftArm.position.z-leftShoulder.z);
  const rightLength = Math.hypot(person.rightArm.position.x-rightShoulder.x, person.rightArm.position.y-rightShoulder.y, person.rightArm.position.z-rightShoulder.z);
  assert.ok(leftLength > person._armLength);
  assert.ok(rightLength > person._armLength);
  assert.ok(Number.isFinite(person.leftArm.position.x) && Number.isFinite(person.rightArm.position.x));
});

test('3M-9b — D=8 m mantiene rueda 3D y brazos conectados al eje sin límite artificial', () => {
  const engine = makeEngine();
  const state = engine.setWheelDiameter(8.0);
  const visual = new PhysicsVisualAdapter({r_w:createParams().r_w});
  const v = visual.update(state);
  assert.equal(v.wheelDiameter, 8.0);
  assert.ok(Math.abs(v.gripPositions.left.z - v.gripPositions.right.z) > 0.9);
  assert.deepEqual(v.personPosition, {x:0,y:0.9,z:0}, 'la persona permanece sobre la plataforma');
  const worldLeft=v.gripPositions.left;
  assert.ok(Math.abs(worldLeft.x-v.wheelPosition.x)<1e-12);
  assert.ok(Math.abs(worldLeft.y-v.wheelPosition.y)<1e-12);
  assert.ok(Math.abs(worldLeft.z-(v.wheelPosition.z+0.525))<1e-12);
  const person = new PersonVisual({three: THREE});
  person.setPosition(v.personPosition);
  person.setOrientation(v.personQuaternion);
  person.setGripPositions(v.gripPositions);
  assert.ok(person.leftArm.scale.y * person._armLength > 3);
  assert.ok(Math.hypot(person.leftHand.position.x-person._shoulderLeft.x, person.leftHand.position.y-person._shoulderLeft.y, person.leftHand.position.z-person._shoulderLeft.z) > 3);
  const wheel = new WheelVisual({three: THREE, radius:0.34});
  wheel.setDiameter(8);
  assert.equal(wheel.wheelAssembly.scale.x,1); assert.equal(wheel.wheelAssembly.scale.y,1); assert.equal(wheel.wheelAssembly.scale.z,1);
  assert.equal(wheel.rim.geometry.args[0],4);
});

test('3M-10 — no hay NaN/Infinity en estado ni transformaciones tras cambios extremos', () => {
  const engine = makeEngine();
  const visual = new PhysicsVisualAdapter({r_w:createParams().r_w});
  for (const [D,Ia,s] of [[4,0.3,80],[0.2,0.03,0],[3,2,60],[0.68,0.3,40]]) {
    engine.setWheelDiameter(D);
    engine.setWheelInertia(Ia);
    engine.setSpinRate(s);
    const state = engine.getState();
    for (const v of [...state.q,...state.Omega_b,...state.Omega_w,...state.n_w,...state.L_total]) assert.ok(Number.isFinite(v));
    const presentation = visual.update(state);
    for (const v of [presentation.personPosition,presentation.wheelPosition,presentation.gripPositions.left,presentation.gripPositions.right]) {
      for (const n of Object.values(v)) assert.ok(Number.isFinite(n));
    }
  }
});

test('3M-11 — tras cambios de D/Ia, la dinámica Free conserva L_total cuando no hay nueva intervención', () => {
  const engine = EngineAdapter.create({mode:'Free', params:createParams({s0:40}), theta0:0, Omega0:[0,0,0]});
  engine.setWheelDiameter(1.2);
  engine.setWheelInertia(0.5);
  const L0 = engine.getState().L_total;
  engine.setThetaTarget(Math.PI/2);
  for (let i=0;i<240;i++) engine.step(engine.getPhysicsDt());
  const after = engine.getState();
  for (let i=0;i<3;i++) near(after.L_total[i], L0[i], 1e-9);
});

test('3M-12 — después de una intervención de spin, la conservación vuelve a operar con el nuevo L0', () => {
  const engine = EngineAdapter.create({mode:'Free', params:createParams({s0:40}), theta0:0, Omega0:[0,0,0]});
  const changed = engine.setSpinRate(60);
  const L0 = changed.L_total;
  engine.setThetaTarget(Math.PI/2);
  for (let i=0;i<240;i++) engine.step(engine.getPhysicsDt());
  const after = engine.getState();
  for (let i=0;i<3;i++) near(after.L_total[i], L0[i], 1e-9);
});
