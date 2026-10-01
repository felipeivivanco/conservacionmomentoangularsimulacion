import test from 'node:test';
import assert from 'node:assert/strict';
import { createParams } from '../../src/index.js';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';

function make(mode='Free', overrides={}) {
  const engine = EngineAdapter.create({ mode, params: createParams(overrides) });
  return { engine, controller: new SimulationController({ engine }) };
}

function advanceFor(controller, seconds, frames) {
  controller.start();
  const d = seconds / frames;
  for (let i=0; i<frames; i++) controller.advance(d);
}

function assertClose(a,b,tol=1e-12) {
  assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++) assert.ok(Math.abs(a[i]-b[i]) <= tol, `${a[i]} != ${b[i]}`);
}

test('A: initial state is stopped at physical time zero', () => {
  const { controller } = make();
  const s = controller.getState();
  assert.equal(s.status,'stopped'); assert.equal(s.physics.t,0); assert.equal(s.steps,0);
});

test('B: start allows advancement', () => {
  const { controller } = make(); controller.start(); controller.advance(0.1);
  assert.ok(controller.getState().physics.t > 0);
});

test('C: pause prevents physical advancement', () => {
  const { controller } = make(); controller.start(); controller.advance(0.1); controller.pause();
  const before=controller.getState().physics; controller.advance(1); const after=controller.getState().physics;
  assert.equal(after.t,before.t); assertClose(after.q,before.q);
});

test('D: resume continues advancement', () => {
  const { controller } = make(); controller.start(); controller.advance(0.1); controller.pause(); const t=controller.getState().physics.t;
  controller.resume(); controller.advance(0.1); assert.ok(controller.getState().physics.t > t);
});

test('E: reset restores initial state', () => {
  const { controller } = make(); controller.start(); controller.advance(0.1); controller.reset();
  assert.equal(controller.getState().status,'stopped'); assert.equal(controller.getState().physics.t,0); assert.equal(controller.getState().steps,0);
});

test('F: timeScale controls accumulated physical time', () => {
  for (const scale of [0.5,1,2]) {
    const { controller } = make(); controller.setTimeScale(scale); controller.start(); controller.advance(0.1);
    const expected = Math.floor((0.1*scale)/controller.getState().physicsDt)*controller.getState().physicsDt;
    assert.ok(Math.abs(controller.getState().physics.t-expected)<1e-12);
  }
});

test('G: frame-rate independence', () => {
  const runs=[];
  for (const frames of [60,120,30]) { const x=make(); advanceFor(x.controller,1,frames); runs.push(x.engine.getState()); }
  for (let i=1;i<runs.length;i++) { assert.equal(runs[i].t,runs[0].t); assertClose(runs[i].q,runs[0].q,1e-11); assert.ok(Math.abs(runs[i].W_act-runs[0].W_act)<1e-11); }
});

test('H: invalid real deltas do not corrupt simulation', () => {
  const { controller }=make(); controller.start(); const before=controller.getState();
  for (const d of [-1,NaN,Infinity]) controller.advance(d);
  const after=controller.getState(); assert.equal(after.physics.t,before.physics.t); assert.equal(after.accumulator,before.accumulator);
});

test('I: large delta is clamped', () => {
  const { controller }=make(); controller.start(); const r=controller.advance(30);
  assert.equal(r.clamped,true); assert.ok(r.steps <= Math.ceil(0.1/controller.getState().physicsDt)+1); assert.ok(controller.getState().physics.t <= 0.1 + 1e-12);
});

test('J: deterministic temporal input produces deterministic state', () => {
  const a=make(), b=make(); a.controller.start(); b.controller.start();
  for(const d of [0.01,0.02,0.03,0.04]) { a.controller.advance(d); b.controller.advance(d); }
  const sa=a.engine.getState(), sb=b.engine.getState(); assert.equal(sa.t,sb.t); assertClose(sa.q,sb.q); assert.equal(sa.W_act,sb.W_act);
});

test('K: Free advances through controller', () => {
  const { controller }=make('Free'); controller.start(); controller.advance(0.05); assert.ok(controller.getState().physics.t>0);
});

test('L: VerticalBearing advances through controller', () => {
  const { controller }=make('VerticalBearing'); controller.start(); controller.advance(0.05); assert.ok(controller.getState().physics.t>0);
});

test('M: controller depends only on public EngineAdapter API', () => {
  const engine=EngineAdapter.create();
  const publicEngine={step: engine.step.bind(engine), getPhysicsDt: engine.getPhysicsDt.bind(engine), getState: engine.getState.bind(engine), reset: engine.reset.bind(engine)};
  const controller=new SimulationController({engine:publicEngine}); controller.start(); controller.advance(0.05);
  assert.ok(controller.getState().physics.t>0);
});
