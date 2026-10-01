import test from 'node:test';
import assert from 'node:assert/strict';
import { PlatformVisual } from '../../src/render/PlatformVisual.js';

class FakeGroup { constructor(){this.visible=true;this.children=[];} add(...items){this.children.push(...items);} }
class FakeMesh { constructor(geometry, material){this.geometry=geometry;this.material=material;this.position={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}};this.rotation={x:0,y:0,z:0};} }
class FakeGeometry { constructor(...args){this.args=args;} dispose(){} }
class FakeMaterial { constructor(options){this.options=options;} dispose(){} }
const THREE={Group:FakeGroup,Mesh:FakeMesh,CylinderGeometry:class extends FakeGeometry{},CircleGeometry:class extends FakeGeometry{},MeshBasicMaterial:FakeMaterial};

test('A — platform remains circular', () => {
  const platform = new PlatformVisual({ three: THREE });
  assert.equal(platform.mesh.geometry.args[0], platform.mesh.geometry.args[1]);
  assert.equal(platform.mesh.geometry.args[2], 0.16);
});

test('B — platform radius is reduced and centered', () => {
  const platform = new PlatformVisual({ three: THREE });
  assert.equal(platform.mesh.geometry.args[0], 0.36);
  assert.equal(platform.mesh.position.x, 0);
  assert.equal(platform.mesh.position.z, 0);
});

test('C — both visual foot centers fit inside the reduced platform with margin', () => {
  const platformRadius = 0.36;
  const footLateralOffset = 0.14;
  const footRadius = 0.065;
  assert.ok(Math.hypot(0, footLateralOffset) + footRadius < platformRadius);
});


test('D — platform provides a presentation-only support shadow', () => {
  const THREE = {Group:FakeGroup,Mesh:FakeMesh,CylinderGeometry:class extends FakeGeometry{},CircleGeometry:class extends FakeGeometry{},MeshBasicMaterial:FakeMaterial};
  const platform = new PlatformVisual({ three: THREE });
  assert.ok(platform.shadow);
  assert.equal(platform.object.children.includes(platform.shadow), true);
  platform.setSupportShadowPosition({ x: 0.12, y: 0.9, z: -0.08 });
  assert.equal(platform.shadow.position.x, 0.12);
  assert.equal(platform.shadow.position.z, -0.08);
});

test('E — platform top keeps the original material while the vertical side gets a subtle darker material', () => {
  const platform = new PlatformVisual({ three: THREE });
  assert.ok(Array.isArray(platform.mesh.material));
  assert.equal(platform.mesh.material[1].options.color, 0x9a9a9a);
  assert.equal(platform.mesh.material[0].options.color, 0x858585);
  assert.equal(platform.topMaterial, platform.mesh.material[1]);
  assert.equal(platform.sideMaterial, platform.mesh.material[0]);
});
