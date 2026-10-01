import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';

const base = {
  q: [1,0,0,0], theta: 0, n_w: [1,0,0], Omega_w: [40,0,0], t: 0
};
function state(D) { return {...base, params:{D}}; }
function distancePointToAxis(point, origin, direction) {
  const v = [point.x-origin.x, point.y-origin.y, point.z-origin.z];
  const d = direction;
  const proj = v[0]*d[0]+v[1]*d[1]+v[2]*d[2];
  return Math.hypot(v[0]-proj*d[0], v[1]-proj*d[1], v[2]-proj*d[2]);
}

test('3N.1-G1 — la persona permanece fija respecto de la plataforma al cambiar D', () => {
  const adapter = new PhysicsVisualAdapter({r_w:[0,0.60,0.40]});
  const small = adapter.update(state(0.20));
  const normal = adapter.update({...state(0.68), t:0.01});
  const large = adapter.update({...state(8.00), t:0.02});
  assert.deepEqual(small.personPosition, normal.personPosition);
  assert.deepEqual(normal.personPosition, large.personPosition);
  assert.deepEqual(large.personPosition, {x:0,y:0.90,z:0});
});

test('3N.1-G2 — el desplazamiento hacia delante se obtiene de una condición geométrica explícita', () => {
  const adapter = new PhysicsVisualAdapter({r_w:[0,0.60,0.40], bodyForwardRadius:0.20, wheelRimTubeRadius:0.045});
  const small = adapter.update(state(0.20));
  const normal = adapter.update({...state(0.68), t:0.01});
  const four = adapter.update({...state(4), t:0.02});
  const max = adapter.update({...state(8), t:0.03});
  assert.equal(small.wheelForwardOffset, 0);
  assert.equal(normal.wheelForwardOffset, 0);
  assert.ok(four.wheelForwardOffset > 0);
  assert.ok(max.wheelForwardOffset > four.wheelForwardOffset);
  assert.ok(Math.abs(max.wheelForwardOffset - (0.20 + 4 + 0.045 - 0.60)) < 1e-12);
  assert.ok(Math.abs(max.wheelPosition.x - (0.60 + max.wheelForwardOffset)) < 1e-12);
});

test('3N.1-G3 — manos siguen coincidiendo con la línea del eje desplazado', () => {
  const adapter = new PhysicsVisualAdapter({r_w:[0,0.60,0.40]});
  const visual = adapter.update(state(8));
  const axleDirection = [0,0,1]; // physical +X maps to visual +Z at theta=0
  const leftWorld = visual.gripPositions.left;
  const rightWorld = visual.gripPositions.right;
  const leftDistance = distancePointToAxis(leftWorld, visual.wheelPosition, axleDirection);
  const rightDistance = distancePointToAxis(rightWorld, visual.wheelPosition, axleDirection);
  assert.ok(leftDistance < 1e-12);
  assert.ok(rightDistance < 1e-12);
  assert.ok(Math.abs(visual.gripPositions.left.x - visual.wheelPosition.x) < 1e-12);
  assert.ok(Math.abs(visual.gripPositions.right.x - visual.wheelPosition.x) < 1e-12);
});

test('3N.1-G4 — D=8 queda fuera del envolvente frontal del torso', () => {
  const adapter = new PhysicsVisualAdapter({r_w:[0,0.60,0.40], bodyForwardRadius:0.20, wheelRimTubeRadius:0.045});
  const visual = adapter.update(state(8));
  const wheelRadiusEnvelope = 4 + 0.045;
  const forwardGap = visual.wheelPosition.x - wheelRadiusEnvelope;
  assert.ok(forwardGap >= 0.20 - 1e-12);
});
