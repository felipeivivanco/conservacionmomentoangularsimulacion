import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../../src/render/Renderer.js';

function snapshot() {
  return {
    time: 0.25,
    theta: 1.2,
    thetaDot: -0.4,
    quaternion: [1, 0, 0, 0],
    diagnostics: { mode: 'Free' }
  };
}

test('A — Renderer can be constructed', () => {
  const renderer = new Renderer({ width: 800, height: 600 });
  assert.equal(renderer.width, 800);
  assert.equal(renderer.height, 600);
  assert.equal(renderer.disposed, false);
});

test('B — render accepts a valid snapshot', () => {
  const renderer = new Renderer();
  assert.doesNotThrow(() => renderer.render(snapshot()));
});

test('C — render does not modify the received snapshot', () => {
  const renderer = new Renderer();
  const state = snapshot();
  const before = structuredClone(state);
  renderer.render(state);
  assert.deepEqual(state, before);
});

test('D — render does not advance simulation', () => {
  const renderer = new Renderer();
  const state = snapshot();
  renderer.render(state);
  assert.deepEqual(state, snapshot());
});

test('E — resize changes only renderer-owned dimensions', () => {
  const renderer = new Renderer({ width: 100, height: 100 });
  const state = snapshot();
  renderer.render(state);
  renderer.resize(1280, 720);
  assert.equal(renderer.width, 1280);
  assert.equal(renderer.height, 720);
  assert.deepEqual(state, snapshot());
});

test('F — dispose can execute without error', () => {
  const renderer = new Renderer();
  assert.doesNotThrow(() => renderer.dispose());
  assert.equal(renderer.disposed, true);
});

test('G — Renderer depends on neither EngineAdapter nor SimulationController', async () => {
  const module = await import('../../src/render/Renderer.js');
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../src/render/Renderer.js', import.meta.url), 'utf8'));
  assert.equal(typeof module.Renderer, 'function');
  assert.doesNotMatch(source, /EngineAdapter|SimulationController/);
});

test('H — consecutive external states are treated as data', () => {
  const renderer = new Renderer();
  const first = snapshot();
  const second = { ...snapshot(), time: 0.5, theta: 0.9 };

  renderer.render(first);
  renderer.render(second);

  assert.deepEqual(first, snapshot());
  assert.equal(second.time, 0.5);
  assert.equal(second.theta, 0.9);
});
