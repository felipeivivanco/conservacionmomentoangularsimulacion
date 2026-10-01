import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WheelVisual } from '../../src/render/WheelVisual.js';

class FakeGroup {
  constructor() { this.children = []; this.visible = true; this.scale = { x: 1, y: 1, z: 1, set: (x, y, z) => { this.scale.x=x; this.scale.y=y; this.scale.z=z; } }; this.quaternion = { x: 0, y: 0, z: 0, w: 1, set: (x, y, z, w) => { this.quaternion.x = x; this.quaternion.y = y; this.quaternion.z = z; this.quaternion.w = w; } }; this.rotation = { x: 0, y: 0, z: 0 }; this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } }; }
  add(...objects) { this.children.push(...objects); }
}
class FakeMesh {
  constructor(geometry, material) {
    this.geometry = geometry; this.material = material;
    this.rotation = { x: 0, y: 0, z: 0 };
    this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } };
  }
}
class FakeCylinderGeometry {
  constructor(...args) { this.args = args; this.disposed = false; }
  dispose() { this.disposed = true; }
}
class FakeMaterial {
  constructor(options) { this.options = options; this.disposed = false; }
  dispose() { this.disposed = true; }
}
const FakeTHREE = {
  Group: FakeGroup,
  Mesh: FakeMesh,
  CylinderGeometry: FakeCylinderGeometry,
  TorusGeometry: class extends FakeCylinderGeometry {},
  MeshBasicMaterial: FakeMaterial
};

function makeWheel() { return new WheelVisual({ three: FakeTHREE }); }

test('A — WheelVisual can be constructed', () => {
  assert.doesNotThrow(() => makeWheel());
});

test('B — WheelVisual exposes object', () => {
  const wheel = makeWheel();
  assert.ok(wheel.object instanceof FakeGroup);
});

test('C — object can be added to a scene', () => {
  const wheel = makeWheel();
  const scene = new FakeGroup();
  assert.doesNotThrow(() => scene.add(wheel.object));
  assert.equal(scene.children[0], wheel.object);
});

test('D — visual wheel geometry exists', () => {
  const wheel = makeWheel();
  assert.ok(wheel.object.children.length >= 2);
  assert.ok(wheel.rim.geometry instanceof FakeCylinderGeometry);
  assert.ok(wheel.axle.geometry instanceof FakeCylinderGeometry);
  assert.ok(wheel.spokes.length >= 8);
  assert.notEqual(wheel.rim.geometry, wheel.axle.geometry);
});

test('E — setVisible works', () => {
  const wheel = makeWheel();
  wheel.setVisible(false);
  assert.equal(wheel.object.visible, false);
  wheel.setVisible(true);
  assert.equal(wheel.object.visible, true);
});

test('F — dispose works', () => {
  const wheel = makeWheel();
  assert.doesNotThrow(() => wheel.dispose());
  assert.equal(wheel.disposed, true);
  assert.equal(wheel.rim.geometry.disposed, true);
  assert.equal(wheel.axle.geometry.disposed, true);
  assert.doesNotThrow(() => wheel.dispose());
  assert.throws(() => wheel.setVisible(true), /disposed/);
});

test('G — WheelVisual exposes an independent spin transform', () => {
  const wheel = makeWheel();
  wheel.setSpinAngle(0);
  assert.equal(wheel.wheelAssembly.rotation.x, 0);
  wheel.setSpinAngle(0.75);
  assert.equal(wheel.wheelAssembly.rotation.x, 0.75);
});

test('H — WheelVisual has no dependency on EngineAdapter or SimulationController', async () => {
  const source = await readFile(new URL('../../src/render/WheelVisual.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /EngineAdapter|SimulationController/);
});


test('I — setDiameter changes the visual radius without moving the wheel center', () => {
  const wheel = makeWheel();
  wheel.setPosition({ x: 1, y: 2, z: 3 });
  wheel.setDiameter(1.4);
  assert.equal(wheel.radius, 0.7);
  assert.equal(wheel.object.position.x, 1);
  assert.equal(wheel.object.position.y, 2);
  assert.equal(wheel.object.position.z, 3);
  assert.equal(wheel.wheelAssembly.scale.x, 1);
  assert.equal(wheel.wheelAssembly.scale.y, 1);
  assert.equal(wheel.wheelAssembly.scale.z, 1);
  assert.equal(wheel.rim.geometry.args[0], 0.7);
});
