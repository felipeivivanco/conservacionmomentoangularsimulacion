import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('A — demo uses VerticalBearing and keeps the 3J initial condition', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/main.js'), 'utf8');
  assert.match(source, /mode: 'VerticalBearing'/);
  assert.match(source, /s0: 40/);
  assert.match(source, /theta0: 0/);
  assert.match(source, /Omega0: \[0, 0, 0\]/);
});

test('B — demo reset applies configured s0 before resetting the controller', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/main.js'), 'utf8');
  assert.match(source, /setInitialSpin\(this\.controls\.getInitialSpin\(\)\)/);
  assert.match(source, /this\.loop\.reset\(\)/);
});

test('C — UI owns the s0 slider and reset action instead of main.js', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/SimulationControls.js'), 'utf8');
  assert.match(source, /Velocidad angular/);
  assert.match(source, /_range\('initial-spin-slider', 0, 80, 1, 40/);
  assert.match(source, /Reiniciar/);
});
