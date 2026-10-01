import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PersonVisual } from '../../src/render/PersonVisual.js';

class FakeGroup {
  constructor() { this.children = []; this.visible = true; this.quaternion = { x: 0, y: 0, z: 0, w: 1, set: (x, y, z, w) => { this.quaternion.x = x; this.quaternion.y = y; this.quaternion.z = z; this.quaternion.w = w; } }; this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; }
  add(...objects) { this.children.push(...objects); }
}
class FakeMesh {
  constructor(geometry, material) {
    this.geometry = geometry; this.material = material; this.visible = true;
    this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } };
    this.rotation = { x: 0, y: 0, z: 0 };
  }
}
class FakeGeometry { constructor(...args) { this.args = args; this.disposed = false; } dispose() { this.disposed = true; } }
class FakeMaterial { constructor(options) { this.options = options; this.disposed = false; } dispose() { this.disposed = true; } }
class FakeVector3 { constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; } }
const FakeTHREE = {
  Vector3: FakeVector3,
  Group: FakeGroup,
  Mesh: FakeMesh,
  SphereGeometry: class extends FakeGeometry {},
  CylinderGeometry: class extends FakeGeometry {},
  MeshBasicMaterial: FakeMaterial
};

function makePerson() { return new PersonVisual({ three: FakeTHREE }); }

test('A — PersonVisual can be constructed', () => {
  assert.doesNotThrow(() => makePerson());
});

test('B — PersonVisual exposes object', () => {
  const person = makePerson();
  assert.ok(person.object instanceof FakeGroup);
  assert.ok(person.object.children.length >= 8);
});

test('C — initial posture has forward arms and hands aligned with the axle', () => {
  const person = makePerson();
  assert.equal(person.object.position.y, 0.9);
  assert.equal(person.leftArm.position.x, 0.325);
  assert.equal(person.rightArm.position.x, 0.325);
  assert.equal(person.leftHand.position.x, 0.65);
  assert.equal(person.leftHand.position.y, 0.40);
  assert.equal(person.rightHand.position.y, 0.40);
  assert.equal(person.rightHand.position.x, 0.65);
  assert.equal(person.leftHand.position.z, 0.30);
  assert.equal(person.rightHand.position.z, -0.30);
  assert.ok(Math.abs(person._shoulderLeft.z) <= 0.17);
  assert.ok(Math.abs(person._shoulderRight.z) <= 0.17);
});

test('D — object can be added to a scene', () => {
  const person = makePerson();
  const scene = new FakeGroup();
  assert.doesNotThrow(() => scene.add(person.object));
  assert.equal(scene.children[0], person.object);
});

test('E — setVisible works', () => {
  const person = makePerson();
  person.setVisible(false);
  assert.equal(person.object.visible, false);
  person.setVisible(true);
  assert.equal(person.object.visible, true);
});

test('F — dispose works', () => {
  const person = makePerson();
  assert.doesNotThrow(() => person.dispose());
  assert.equal(person.disposed, true);
  assert.doesNotThrow(() => person.dispose());
  assert.throws(() => person.setVisible(true), /disposed/);
});

test('G — PersonVisual has no dependency on EngineAdapter or SimulationController', async () => {
  const source = await readFile(new URL('../../src/render/PersonVisual.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /EngineAdapter|SimulationController/);
});

test('H — grip positions can follow a changing physical axle without rebuilding the character', () => {
  const person = makePerson();
  person.setGripPositions({ left: { x: 0.6, y: 0.4, z: 0.3 }, right: { x: 0.6, y: 0.4, z: -0.3 } });
  assert.equal(person.leftHand.position.x, 0.6);
  assert.equal(person.rightHand.position.z, -0.3);
  assert.equal(person.leftArm.position.x, 0.3);
  assert.equal(person.rightArm.position.x, 0.3);
});


test('I — shoulders start inside the torso envelope so the arms have continuous visual contact', () => {
  const person = makePerson();
  const torsoRadius = person.torso.geometry.args[0];
  assert.ok(Math.abs(person._shoulderLeft.z) <= torsoRadius);
  assert.ok(Math.abs(person._shoulderRight.z) <= torsoRadius);
  assert.ok(person._armLength > 0);
});

test('J — grip update keeps the shoulder-to-hand chain continuous', () => {
  const person = makePerson();
  const hand = { x: 0.65, y: 0.4, z: 0.30 };
  person.setGripPositions({ left: hand, right: { x: hand.x, y: hand.y, z: -hand.z } });
  assert.ok(Math.hypot(person.leftArm.position.x - hand.x, person.leftArm.position.y - hand.y, person.leftArm.position.z - hand.z) > 0);
  assert.equal(person.leftHand.position.x, hand.x);
});


test('K — grip update uses Three.js-compatible Vector3 inputs when available', () => {
  const person = makePerson();
  let received = null;
  person.leftArm.quaternion = {
    setFromUnitVectors(from, to) { received = { from, to }; }
  };
  person.rightArm.quaternion = {
    setFromUnitVectors() {}
  };
  person.setGripPositions({ left: { x: 0.65, y: 0.4, z: 0.3 }, right: { x: 0.65, y: 0.4, z: -0.3 } });
  assert.ok(received.from instanceof FakeVector3);
  assert.ok(received.to instanceof FakeVector3);
  assert.deepEqual([received.from.x, received.from.y, received.from.z], [0, 1, 0]);
});


test('L — head carries two linked visual eyes and deterministic shading pieces', () => {
  const person = makePerson();
  assert.ok(person.headGroup);
  assert.equal(person.headGroup.children.includes(person.head), true);
  assert.equal(person.headGroup.children.includes(person.leftEye), true);
  assert.equal(person.headGroup.children.includes(person.rightEye), true);
  assert.ok(person.torsoShade);
  assert.ok(person.leftEye.geometry.args[0] > 0);
  assert.ok(person.rightEye.geometry.args[0] > 0);
});

test('M — eyes follow the head because they share its presentation group', () => {
  const person = makePerson();
  const before = { x: person.leftEye.position.x, y: person.leftEye.position.y, z: person.leftEye.position.z };
  person.setOrientation({ x: 0, y: 0.1, z: 0, w: 0.995 });
  assert.deepEqual({ x: person.leftEye.position.x, y: person.leftEye.position.y, z: person.leftEye.position.z }, before);
  assert.notEqual(person.headGroup, person.object);
  assert.ok(person.headGroup.children.includes(person.leftEye));
});

test('N — torso and arms use muted red presentation materials while head, hands and legs retain the blue palette', () => {
  const person = makePerson();
  assert.equal(person.torso.material.options.color, 0x9a4a4a);
  assert.equal(person.leftArm.material.options.color, 0x9a4a4a);
  assert.equal(person.rightArm.material.options.color, 0x733b3b);
  assert.equal(person.head.material.options.color, 0x4b78a8);
  assert.equal(person.leftHand.material.options.color, 0x7f9fbd);
  assert.equal(person.leftLeg.material.options.color, 0x4b78a8);
  assert.equal(person.rightLeg.material.options.color, 0x345777);
});

test('3N.12-H-body — only the torso shade is disabled while other body-part shading remains active', () => {
  const person = makePerson();
  assert.equal(person.torso.visible, true);
  assert.equal(person.torsoShade.visible, false);
  assert.equal(person.headShade.visible, true);
  assert.equal(person.leftArm.material.options.color, 0x9a4a4a);
  assert.equal(person.leftLeg.visible, true);
  assert.equal(person.rightLeg.visible, true);
});

test('O — legs move slightly toward the body center without changing their height', () => {
  const person = makePerson();
  assert.equal(Math.abs(person.leftLeg.position.z), 0.09);
  assert.equal(Math.abs(person.rightLeg.position.z), 0.09);
  assert.equal(person.leftLeg.position.y, person.rightLeg.position.y);
});
