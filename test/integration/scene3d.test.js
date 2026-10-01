import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene3D } from '../../src/render/Scene3D.js';
import { readFile } from 'node:fs/promises';

class FakeScene {
  constructor() { this.children = []; }
  add(...objects) { this.children.push(...objects); }
}

class FakePerspectiveCamera {
  constructor(fov, aspect, near, far) {
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.projectionUpdates = 0;
    this.position = { x: 0, y: 0, z: 0 };
  }

  updateProjectionMatrix() {
    this.projectionUpdates += 1;
  }
}

class FakeWebGLRenderer {
  constructor(options) {
    this.options = options;
    this.width = null;
    this.height = null;
    this.pixelRatio = null;
    this.clearColor = null;
    this.clearAlpha = null;
    this.renderCalls = 0;
    this.disposed = false;
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
  }

  setPixelRatio(value) {
    this.pixelRatio = value;
  }

  setClearColor(value, alpha) {
    this.clearColor = value;
    this.clearAlpha = alpha;
  }

  render(scene, camera) {
    assert.ok(scene instanceof FakeScene);
    assert.ok(camera instanceof FakePerspectiveCamera);
    this.renderCalls += 1;
  }

  dispose() {
    this.disposed = true;
  }
}

class FakeGroup {
  constructor() { this.children = []; this.visible = true; this.scale = { x: 1, y: 1, z: 1 }; this.position = { x: 0, y: 0, z: 0 }; this.quaternion = { x: 0, y: 0, z: 0, w: 1, set: (x, y, z, w) => { this.quaternion.x = x; this.quaternion.y = y; this.quaternion.z = z; this.quaternion.w = w; } }; }
  add(...objects) { this.children.push(...objects); }
}
class FakeMesh {
  constructor(geometry, material) {
    this.geometry = geometry; this.material = material;
    this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } };
    this.rotation = { x: 0, y: 0, z: 0 };
  }
}
class FakeGeometry { dispose() {} }
class FakeMaterial { dispose() {} }
const FakeTHREE = {
  Scene: FakeScene,
  PerspectiveCamera: FakePerspectiveCamera,
  WebGLRenderer: FakeWebGLRenderer,
  Group: FakeGroup,
  Mesh: FakeMesh,
  SphereGeometry: class extends FakeGeometry {},
  CylinderGeometry: class extends FakeGeometry {},
  TorusGeometry: class extends FakeGeometry {},
  CircleGeometry: class extends FakeGeometry {},
  Color: class { constructor(value) { this.value = value; } },
  MeshBasicMaterial: FakeMaterial
};

function makeScene(options = {}) {
  return new Scene3D({
    three: FakeTHREE,
    width: 800,
    height: 600,
    ...options
  });
}

test('A — Scene3D can be constructed', () => {
  const scene3d = makeScene();
  assert.equal(scene3d.disposed, false);
});

test('B — Scene3D exposes a scene', () => {
  const scene3d = makeScene();
  assert.ok(scene3d.scene instanceof FakeScene);
});

test('C — Scene3D exposes a perspective camera', () => {
  const scene3d = makeScene();
  assert.ok(scene3d.camera instanceof FakePerspectiveCamera);
  assert.equal(scene3d.camera.aspect, 800 / 600);
});

test('D — Scene3D exposes a WebGL renderer', () => {
  const scene3d = makeScene();
  assert.ok(scene3d.renderer instanceof FakeWebGLRenderer);
  assert.equal(scene3d.renderer.width, 800);
  assert.equal(scene3d.renderer.height, 600);
});

test('E — renderer receives an explicit visible clear state and bounded pixel ratio', () => {
  const scene3d = makeScene({ backgroundColor: 0x9ed8df, pixelRatio: 3 });
  assert.equal(scene3d.renderer.clearColor, 0x9ed8df);
  assert.equal(scene3d.renderer.clearAlpha, 1);
  assert.equal(scene3d.renderer.pixelRatio, 2);
});

test('E — resize updates viewport and camera aspect', () => {
  const scene3d = makeScene();
  scene3d.resize(1280, 720);
  assert.equal(scene3d.width, 1280);
  assert.equal(scene3d.height, 720);
  assert.equal(scene3d.camera.aspect, 1280 / 720);
  assert.equal(scene3d.camera.projectionUpdates, 1);
  assert.equal(scene3d.renderer.width, 1280);
  assert.equal(scene3d.renderer.height, 720);
});

test('G — render executes and dispose releases renderer resources', () => {
  const scene3d = makeScene();
  assert.doesNotThrow(() => scene3d.render());
  assert.equal(scene3d.renderer.renderCalls, 1);
  assert.doesNotThrow(() => scene3d.dispose());
  assert.equal(scene3d.renderer.disposed, true);
  assert.equal(scene3d.disposed, true);
  assert.doesNotThrow(() => scene3d.dispose());
});

test('H — Scene3D does not depend on EngineAdapter or SimulationController', async () => {
  const source = await readFile(new URL('../../src/render/Scene3D.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /EngineAdapter|SimulationController/);
});

test('I — Scene3D can optionally host person, wheel and platform visuals', () => {
  const scene3d = makeScene({ person: true, wheel: true });
  assert.ok(scene3d.person);
  assert.ok(scene3d.wheel);
  assert.ok(scene3d.platform);
  assert.equal(scene3d.platform.object.visible, true);
  assert.equal(scene3d.scene.children.includes(scene3d.person.object), true);
  assert.equal(scene3d.scene.children.includes(scene3d.wheel.object), true);
  assert.equal(scene3d.scene.children.includes(scene3d.platform.object), true);
  scene3d.setScenario(2);
  assert.equal(scene3d.platform.object.visible, false);
  scene3d.setScenario(1);
  assert.equal(scene3d.platform.object.visible, true);
});

test('J — Scene3D construction does not execute simulation stepping', () => {
  const scene3d = makeScene({ person: true, wheel: true });
  assert.equal(scene3d.renderer.renderCalls, 0);
});

test('K — Scene3D contains no physics equations or simulation stepping', async () => {
  const source = await readFile(new URL('../../src/render/Scene3D.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /theta\s*\+=|omega\s*\+=|thetaDot\s*\+=|tau\s*=|L\s*=|energy\s*=|step\s*\(/);
});


test('J — hosted presentation objects have finite initial transforms and remain visible', () => {
  const scene3d = makeScene({ person: true, wheel: true, platform: true, scenario: 1 });
  for (const [name, object] of [['person', scene3d.person.object], ['wheel', scene3d.wheel.object], ['platform', scene3d.platform.object]]) {
    assert.equal(object.visible, true, `${name} should be visible`);
    assert.ok([object.position.x, object.position.y, object.position.z].every(Number.isFinite), `${name} position`);
    assert.ok([object.scale.x, object.scale.y, object.scale.z].every(Number.isFinite), `${name} scale`);
    assert.ok(object.scale.x !== 0 && object.scale.y !== 0 && object.scale.z !== 0, `${name} scale must be non-zero`);
  }
  assert.equal(scene3d.scene.children.length, 3);
  assert.ok([scene3d.camera.position.x, scene3d.camera.position.y, scene3d.camera.position.z].every(Number.isFinite));
});

test('L — escenario 1 mantiene visibles persona, rueda y plataforma desde la construcción', () => {
  const scene3d = makeScene({ person: true, wheel: true, platform: true, scenario: 1 });
  assert.equal(scene3d.scenario, 1);
  assert.equal(scene3d.person.object.visible, true);
  assert.equal(scene3d.wheel.object.visible, true);
  assert.equal(scene3d.platform.object.visible, true);
  assert.ok(Number.isFinite(scene3d.camera.position.x));
  assert.ok(Number.isFinite(scene3d.camera.position.y));
  assert.ok(Number.isFinite(scene3d.camera.position.z));
});
