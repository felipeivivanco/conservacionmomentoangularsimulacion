import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OrbitalCameraController } from '../../src/render/OrbitalCameraController.js';
import { CameraInputController } from '../../src/render/CameraInputController.js';

class FakeCamera {
  constructor() {
    this.position = {
      x: 0, y: 0, z: 0,
      set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; }
    };
    this.aspect = 1;
    this.projectionUpdates = 0;
    this.lookAtTarget = null;
  }
  lookAt(x, y, z) { this.lookAtTarget = { x, y, z }; }
  updateProjectionMatrix() { this.projectionUpdates += 1; }
}

class FakeElement {
  constructor() { this.listeners = new Map(); this.capture = new Set(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  setPointerCapture(id) { this.capture.add(id); }
  releasePointerCapture(id) { this.capture.delete(id); }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  count(type) { return this.listeners.get(type)?.size ?? 0; }
  total() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}

function makeCamera(options = {}) {
  return new OrbitalCameraController({ camera: new FakeCamera(), ...options });
}

test('A — orbital camera construction produces a valid non-degenerate position', () => {
  const controller = makeCamera();
  const state = controller.getState();
  assert.ok(state.distance > 0);
  assert.ok(Number.isFinite(controller.camera.position.x));
  assert.ok(Number.isFinite(controller.camera.position.y));
  assert.ok(Number.isFinite(controller.camera.position.z));
  assert.deepEqual(controller.camera.lookAtTarget, state.target);
});

test('B — horizontal and vertical orbit change camera orientation', () => {
  const controller = makeCamera();
  const before = { ...controller.camera.position };
  controller.orbit(100, 30);
  assert.notDeepEqual(controller.camera.position, before);
  assert.notEqual(controller.getState().azimuth, 0);
});

test('C — pitch is clamped away from vertical degeneracy', () => {
  const controller = makeCamera({ pitchLimit: Math.PI / 3 });
  controller.orbit(0, 100000);
  assert.ok(Math.abs(controller.getState().pitch) <= Math.PI / 3);
});

test('D — zoom changes distance and respects bounds', () => {
  const controller = makeCamera({ distance: 5, minDistance: 2, maxDistance: 8 });
  controller.zoom(-100);
  assert.ok(controller.getState().distance < 5);
  controller.zoom(-100000);
  assert.equal(controller.getState().distance, 2);
  controller.zoom(100000);
  assert.equal(controller.getState().distance, 8);
});

test('E — target remains the visual point of interest', () => {
  const controller = makeCamera({ target: { x: 1, y: 2, z: 3 } });
  controller.orbit(50, -20);
  assert.deepEqual(controller.camera.lookAtTarget, { x: 1, y: 2, z: 3 });
});

test('F — resize updates camera aspect and projection', () => {
  const camera = new FakeCamera();
  const controller = new OrbitalCameraController({ camera });
  controller.resize(1280, 720);
  assert.equal(camera.aspect, 1280 / 720);
  assert.equal(camera.projectionUpdates, 1);
});

test('G — input attaches each listener exactly once', () => {
  const element = new FakeElement();
  const camera = makeCamera();
  const input = new CameraInputController({ element, cameraController: camera });
  input.attach();
  assert.equal(element.count('pointerdown'), 1);
  assert.equal(element.count('pointermove'), 1);
  assert.equal(element.count('pointerup'), 1);
  assert.equal(element.count('pointercancel'), 1);
  assert.equal(element.count('wheel'), 1);
  assert.equal(element.total(), 5);
});

test('H — pointer drag changes camera orientation and pointerup stops dragging', () => {
  const element = new FakeElement();
  const camera = makeCamera();
  const input = new CameraInputController({ element, cameraController: camera });
  const before = camera.getState();
  element.dispatch('pointerdown', { button: 0, pointerId: 7, clientX: 10, clientY: 20 });
  element.dispatch('pointermove', { pointerId: 7, clientX: 60, clientY: 40 });
  const after = camera.getState();
  assert.notEqual(after.azimuth, before.azimuth);
  assert.notEqual(after.pitch, before.pitch);
  element.dispatch('pointerup', { pointerId: 7 });
  const stopped = camera.getState();
  element.dispatch('pointermove', { pointerId: 7, clientX: 160, clientY: 140 });
  assert.deepEqual(camera.getState(), stopped);
});

test('I — pointercancel ends an active drag', () => {
  const element = new FakeElement();
  const camera = makeCamera();
  new CameraInputController({ element, cameraController: camera });
  element.dispatch('pointerdown', { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
  element.dispatch('pointercancel', { pointerId: 2 });
  const before = camera.getState();
  element.dispatch('pointermove', { pointerId: 2, clientX: 100, clientY: 100 });
  assert.deepEqual(camera.getState(), before);
});

test('J — wheel changes zoom and prevents default scrolling', () => {
  const element = new FakeElement();
  const camera = makeCamera();
  new CameraInputController({ element, cameraController: camera });
  const before = camera.getState().distance;
  let prevented = false;
  element.dispatch('wheel', { deltaY: 100, preventDefault() { prevented = true; } });
  assert.notEqual(camera.getState().distance, before);
  assert.equal(prevented, true);
});

test('K — detach/dispose removes every listener', () => {
  const element = new FakeElement();
  const camera = makeCamera();
  const input = new CameraInputController({ element, cameraController: camera });
  input.detach();
  assert.equal(element.total(), 0);
  input.attach();
  input.dispose();
  assert.equal(element.total(), 0);
});

test('L — input affects presentation camera only', () => {
  const element = new FakeElement();
  const camera = makeCamera();
  const physicalState = { theta: 1.2, q: [0.1, 0.2, 0.3, 0.4], t: 2 };
  const before = structuredClone(physicalState);
  new CameraInputController({ element, cameraController: camera });
  element.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  element.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 20 });
  element.dispatch('wheel', { deltaY: -50, preventDefault() {} });
  assert.deepEqual(physicalState, before);
});

test('M — camera/input code has no simulation dependencies', async () => {
  const cameraSource = await readFile(new URL('../../src/render/OrbitalCameraController.js', import.meta.url), 'utf8');
  const inputSource = await readFile(new URL('../../src/render/CameraInputController.js', import.meta.url), 'utf8');
  for (const source of [cameraSource, inputSource]) {
    assert.doesNotMatch(source, /EngineAdapter|SimulationController|AngularMomentumEngine/);
    assert.doesNotMatch(source, /\.step\s*\(|\.advance\s*\(/);
  }
});

test('N — orbital camera can be used with the existing Scene3D camera contract without changing Scene3D', async () => {
  const sceneSource = await readFile(new URL('../../src/render/Scene3D.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sceneSource, /OrbitalCameraController|CameraInputController/);
});

test('O — CameraPresentation binds input to the existing Scene3D camera and delegates resize', async () => {
  const { CameraPresentation } = await import('../../src/render/CameraPresentation.js');
  const element = new FakeElement();
  const camera = new FakeCamera();
  const scene = {
    camera,
    resizeCalls: [],
    resize(width, height) { this.resizeCalls.push([width, height]); camera.aspect = width / height; }
  };
  const presentation = new CameraPresentation({ scene, element });
  const before = presentation.getState();
  element.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  element.dispatch('pointermove', { pointerId: 1, clientX: 20, clientY: 10 });
  assert.notEqual(presentation.getState().azimuth, before.azimuth);
  presentation.resize(1280, 720);
  assert.deepEqual(scene.resizeCalls, [[1280, 720]]);
  presentation.dispose();
  assert.equal(element.total(), 0);
});
