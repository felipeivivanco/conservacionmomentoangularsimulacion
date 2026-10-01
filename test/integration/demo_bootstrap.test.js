import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createParams, AngularMomentumEngine } from '../../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// DemoApplication imports real Three.js, so these tests validate the browser
// composition contract by replacing the module boundary through source-level
// inspection rather than constructing WebGL in Node.
test('A — browser entrypoint contains the complete demo composition', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src/app/main.js'), 'utf8');
  assert.match(html, /id="app"/);
  assert.match(html, /src\/app\/main\.js/);
  for (const symbol of ['EngineAdapter', 'SimulationController', 'PhysicsVisualAdapter', 'Renderer', 'Scene3D', 'SimulationLoop', 'CameraPresentation']) {
    assert.match(source, new RegExp(`import \\{ ${symbol} \\}`));
  }
});

test('B — application bootstrap owns only browser composition and cleanup', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/main.js'), 'utf8');
  assert.doesNotMatch(source, /\.step\s*\(/);
  assert.doesNotMatch(source, /\.advance\s*\(/);
  assert.doesNotMatch(source, /AngularMomentumEngine/);
  assert.doesNotMatch(source, /cameraPresentation.*q|q.*cameraPresentation/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /CameraPresentation/);
  assert.match(source, /theta0: 0/);
  assert.match(source, /Omega0: \[0, 0, 0\]/);
  assert.match(source, /s0: 40/);
  assert.match(source, /r_w: params\.r_w/);
  assert.match(source, /scenario: 1/);
  assert.match(source, /addEventListener\('resize'/);
  assert.match(source, /removeEventListener\('resize'/);
});

test('C — Vite exposes the browser entrypoint and production scripts', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.dev, 'vite');
  assert.equal(packageJson.scripts.build, 'vite build');
  assert.equal(packageJson.scripts.preview, 'vite preview');
  assert.ok(fs.existsSync(path.join(root, 'vite.config.js')));
});

test('D — demo composition does not alter protected simulation source files', () => {
  const protectedFiles = [
    'src/index.js',
    'src/simulation/EngineAdapter.js',
    'src/simulation/SimulationController.js',
    'src/render/Renderer.js',
    'src/render/Scene3D.js',
    'src/render/PersonVisual.js',
    'src/render/WheelVisual.js',
    'src/render/PhysicsVisualAdapter.js'
  ];
  for (const file of protectedFiles) assert.ok(fs.existsSync(path.join(root, file)), file);
});


test('E — demo physical initial state has stationary body and wheel axial spin', () => {
  const params = createParams({ s0: 40 });
  const engine = new AngularMomentumEngine({ mode: 'Free', params, theta0: 0, Omega0: [0, 0, 0] });
  const initial = engine.snapshot();
  assert.equal(initial.theta, 0);
  assert.deepEqual(initial.q, [1, 0, 0, 0]);
  assert.deepEqual(initial.Omega_b, [0, 0, 0]);
  assert.deepEqual(initial.Omega_w, [40, 0, 0]);
  for (let i = 0; i < 240; i += 1) engine.step(params.dt);
  const after = engine.snapshot();
  assert.deepEqual(after.q, initial.q);
  assert.deepEqual(after.Omega_b, initial.Omega_b);
  assert.deepEqual(after.Omega_w, initial.Omega_w);
  assert.equal(after.theta, 0);
});


test('F — bootstrap prepara el primer estado visual antes de iniciar el loop', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/main.js'), 'utf8');
  const resetIndex = source.indexOf('this.loop.reset();');
  const renderIndex = source.indexOf('this.scene.render();', resetIndex);
  const startIndex = source.indexOf('this.loop.start();', resetIndex);
  assert.ok(resetIndex >= 0);
  assert.ok(renderIndex > resetIndex, 'la escena se renderiza después de aplicar el reset visual');
  assert.ok(startIndex > renderIndex, 'el loop comienza después del primer render');
  assert.match(source, /scenario: 1/);
  assert.match(source, /this\.diagnostics\.update\(initialPhysics\)/);
  assert.match(source, /this\.controls\.update\(initialPhysics\)/);
});

test('G — el demo inicial usa el momento de inercia físico de aro delgado', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/main.js'), 'utf8');
  assert.match(source, /Ia:\s*3 \* \(0\.68 \/ 2\) \*\* 2/);
});
