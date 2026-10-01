import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EngineAdapter } from '../../src/simulation/EngineAdapter.js';
import { SimulationController } from '../../src/simulation/SimulationController.js';
import { PhysicsVisualAdapter } from '../../src/render/PhysicsVisualAdapter.js';
import { PhysicsDiagnostics } from '../../src/app/PhysicsDiagnostics.js';
import { createParams } from '../../src/index.js';

const norm = v => Math.hypot(...v);
const diff = (a,b) => Math.hypot(...a.map((x,i)=>x-b[i]));
const dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
const near = (a,b,tol=1e-10) => assert.ok(Math.abs(a-b) <= tol, `${a} != ${b} ± ${tol}`);

function advance(controller, dt, count=1) {
  for (let i=0;i<count;i++) controller.advance(dt);
}

function makeController(mode, thetaDeg, s0=0) {
  const engine = EngineAdapter.create({
    mode,
    params: createParams({s0}),
    theta0: thetaDeg*Math.PI/180,
    Omega0: [0,0,0]
  });
  const controller = new SimulationController({engine});
  controller.start();
  return {engine, controller};
}

const spinSequence = [0,10,20,40,60,30,0];

for (const thetaDeg of [45,-45,0,80]) {
  test(`3N.17-A/B/C/D — VerticalBearing RUNNING theta=${thetaDeg}°: cada cambio de spin modifica el estado físico`, () => {
    const {engine, controller} = makeController('VerticalBearing', thetaDeg, 0);
    const theta = thetaDeg*Math.PI/180;
    let previous = engine.getState();
    let sawBodyReaction = false;
    let sawWheelIntervention = false;

    for (const spin of spinSequence) {
      advance(controller, engine.getPhysicsDt());
      const before = engine.getState();
      const oldPs = before.params.Ia*before.params.s0;
      const deltaPs = before.params.Ia*(spin-before.params.s0);
      const changed = engine.setSpinRate(spin);
      const after = engine.getState();

      near(after.params.Ia*after.params.s0, before.params.Ia*spin, 1e-12);
      near(dot(after.L_wheel_world, after.n_w), after.params.Ia*spin, 1e-10);
      near(after.L_control[0]-before.L_control[0], before.n_w[0]*deltaPs, 1e-10);
      near(after.L_control[1]-before.L_control[1], before.n_w[1]*deltaPs, 1e-10);
      near(after.L_control[2]-before.L_control[2], before.n_w[2]*deltaPs, 1e-10);
      if (Math.abs(deltaPs) > 1e-12) {
        assert.equal(changed.external_control?.external, false);
        assert.equal(changed.external_control?.internal, true);
        assert.equal(changed.external_control?.type, 'spin-rate');
        assert.equal(changed.external_control?.spinRate, spin);
        assert.ok(Number.isFinite(changed.external_control?.deltaW));
        sawWheelIntervention = true;
        const bodyDelta = diff(after.Omega_b, before.Omega_b);
        if (Math.abs(Math.sin(theta)) > 1e-10) {
          assert.ok(bodyDelta > 1e-10, `sin(theta) coupling lost at ${thetaDeg}°`);
          sawBodyReaction = true;
        } else {
          // At theta=0 the wheel-drive torque is horizontal and the bearing can
          // supply it without changing body yaw. The wheel state still changes.
          assert.ok(diff(after.L_wheel_world, before.L_wheel_world) > 1e-10);
          assert.ok(bodyDelta < 1e-12);
        }
      }
      previous = after;
    }

    assert.ok(sawWheelIntervention);
    if (thetaDeg !== 0) assert.ok(sawBodyReaction);
    assert.equal(controller.getState().status, 'running');
    assert.ok(controller.getState().steps > 0);
    assert.ok(previous.params.s0 === 0);
  });
}

test('3N.17-E — Free RUNNING theta=45°: spin 0→10→20→40→60→30→0 conserva L_total_world y reacciona el cuerpo', () => {
  const {engine, controller} = makeController('Free',45,0);
  let previous = engine.getState();
  let sawReaction = false;

  for (const spin of spinSequence) {
    advance(controller, engine.getPhysicsDt());
    const before = engine.getState();
    const deltaPs = before.params.Ia*(spin-before.params.s0);
    const after = engine.setSpinRate(spin);
    if (Math.abs(deltaPs) > 1e-12) {
      assert.ok(diff(after.Omega_b,before.Omega_b) > 1e-10);
      sawReaction = true;
      assert.ok(diff(after.L_body_world,before.L_body_world) > 1e-10);
      const dLWheel = after.L_wheel_world.map((v,i)=>v-before.L_wheel_world[i]);
      const dLBody = after.L_body_world.map((v,i)=>v-before.L_body_world[i]);
      near(norm(dLWheel.map((v,i)=>v+dLBody[i])),0,1e-10);
    }
    near(norm(after.L_total_world.map((v,i)=>v-previous.L_total_world[i])),0,1e-10);
    near(dot(after.Omega_w,after.n_w),spin,1e-10);
    previous = after;
  }
  assert.ok(sawReaction);
  assert.equal(previous.params.s0,0);
});

test('3N.17-F — Free RUNNING theta=-45°: sucesivos cambios de spin producen reacción con conservación de L_total_world', () => {
  const {engine, controller} = makeController('Free',-45,0);
  const initial = engine.getState();
  let maxL = 0;
  let sawReaction = false;
  for (const spin of spinSequence) {
    advance(controller, engine.getPhysicsDt());
    const before = engine.getState();
    const after = engine.setSpinRate(spin);
    if (Math.abs(spin-before.params.s0)>1e-12) sawReaction ||= diff(after.Omega_b,before.Omega_b)>1e-10;
    maxL = Math.max(maxL, diff(after.L_total_world,initial.L_total_world));
  }
  assert.ok(sawReaction);
  assert.ok(maxL < 1e-10, `max |ΔL_total_world|=${maxL}`);
});

test('3N.17-G — Free RUNNING theta 0→30→60→90° con spin=40 atraviesa theta, thetaDot, Omega_b, q y conserva L_total_world', () => {
  const {engine, controller} = makeController('Free',0,40);
  const initial = engine.getState();
  let maxL = 0;
  let sawThetaDot = false;
  let sawBody = false;
  let sawQ = false;
  for (const targetDeg of [30,60,90]) {
    engine.setThetaTarget(targetDeg*Math.PI/180);
    const before = engine.getState();
    controller.advance(0.05);
    const after = engine.getState();
    assert.ok(Math.abs(after.theta-before.theta)>1e-8 || targetDeg===30);
    sawThetaDot ||= Math.abs(after.thetaDot)>1e-8;
    sawBody ||= norm(after.Omega_b)>1e-8;
    sawQ ||= diff(after.q,[1,0,0,0])>1e-8;
    maxL = Math.max(maxL, diff(after.L_total_world,initial.L_total_world));
  }
  assert.ok(sawThetaDot && sawBody && sawQ);
  assert.ok(maxL < 1e-10, `max |ΔL_total_world|=${maxL}`);
});

test('3N.17-H — Free RUNNING theta=45°, spin 40→10→60→20→0 conserva L_total_world y registra cada intervención', () => {
  const {engine, controller} = makeController('Free',45,40);
  const initial = engine.getState();
  for (const spin of [10,60,20,0]) {
    advance(controller, engine.getPhysicsDt(), 2);
    const before = engine.getState();
    const after = engine.setSpinRate(spin);
    assert.equal(after.params.s0,spin);
    assert.equal(after.external_control?.internal,true);
    assert.ok(diff(after.Omega_b,before.Omega_b)>1e-10);
    assert.ok(diff(after.L_control,before.L_control)>1e-10);
    assert.ok(diff(after.L_total_world,initial.L_total_world)<1e-10);
  }
});

test('3N.17-I/J — STOP/PAUSE/RESET mantienen semántica temporal mientras spin sigue siendo físico', () => {
  const {engine, controller} = makeController('Free',45,0);
  advance(controller,engine.getPhysicsDt(),4);
  controller.pause();
  const pausedBefore = controller.getState();
  const changed = engine.setSpinRate(40);
  const pausedAfter = controller.getState();
  assert.equal(pausedAfter.status,'paused');
  assert.equal(pausedAfter.steps,pausedBefore.steps);
  near(pausedAfter.physics.t,pausedBefore.physics.t,1e-15);
  assert.ok(diff(changed.Omega_b,pausedBefore.physics.Omega_b)>1e-10);
  controller.advance(1);
  const stillPaused = controller.getState();
  assert.equal(stillPaused.steps,pausedBefore.steps);
  near(stillPaused.physics.t,pausedBefore.physics.t,1e-15);
  controller.reset();
  const reset=controller.getState();
  assert.equal(reset.status,'stopped');
  assert.equal(reset.steps,0);
  near(reset.physics.t,0,1e-15);
});

test('3N.17-K — la UI RUNNING entrega spin al motor y el refresh no sustituye advance()', async () => {
  const controls = await fs.readFile(new URL('../../src/app/SimulationControls.js',import.meta.url),'utf8');
  const loop = await fs.readFile(new URL('../../src/render/SimulationLoop.js',import.meta.url),'utf8');
  assert.match(controls,/engine\.setSpinRate\(this\._effectiveSpin\(value\)\)/);
  assert.match(controls,/onParameterChange\?\.\(state, 'spin'\)/);
  assert.match(loop,/refreshCurrentState\(\)/);
  assert.match(loop,/this\.controller\.advance\(realDelta\)/);
  assert.match(loop,/refreshCurrentState\(\)[\s\S]*this\.renderer\.render/);
  assert.match(loop,/this\.controller\.advance\(realDelta\)[\s\S]*this\.renderer\.render/);
});

test('3N.17-L — no existe animación artificial del humano: PersonVisual no crea su propio reloj de movimiento', async () => {
  const source=await fs.readFile(new URL('../../src/render/PersonVisual.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/requestAnimationFrame|setInterval|setTimeout|performance\.now/);
});

test('3N.17-M — quaternion visual usa el q físico del mismo snapshot', async () => {
  const adapter=await fs.readFile(new URL('../../src/render/PhysicsVisualAdapter.js',import.meta.url),'utf8');
  assert.match(adapter,/const \[w, x, y, z\] = physicsState\.q/);
  assert.match(adapter,/this\._toVisualQuaternion\(\[w, x, y, z\]\)/);
});

test('3N.17-N — torque de reorientación ya existente: tau_react coincide con dL_body/dt durante Free theta', () => {
  const engine=EngineAdapter.create({mode:'Free',params:createParams({s0:40}),theta0:0,Omega0:[0,0,0]});
  engine.step(engine.getPhysicsDt());
  engine.setThetaTarget(Math.PI/2);
  const dt=engine.getPhysicsDt();
  const Rb=q=>{const[w,x,y,z]=q;return[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];};
  const mv=(A,v)=>A.map(r=>r[0]*v[0]+r[1]*v[1]+r[2]*v[2]);
  const samples=[];
  for(let i=0;i<90;i++){ samples.push(engine.getState()); engine.step(dt); }
  samples.push(engine.getState());
  let maxErr=0;
  for(let i=1;i<samples.length-1;i++){
    const m=samples[i];
    if(Math.abs(m.t-0.25)<3*dt) continue;
    const La=mv(Rb(samples[i-1].q),samples[i-1].L_body);
    const Lb=mv(Rb(samples[i+1].q),samples[i+1].L_body);
    const num=Lb.map((v,j)=>(v-La[j])/(2*dt));
    const tauW=mv(Rb(m.q),m.tau_react);
    maxErr=Math.max(maxErr,Math.hypot(...num.map((v,j)=>v-tauW[j])));
  }
  assert.ok(maxErr<6e-2,`max |dL_body/dt-R*tau_react|=${maxErr}`);
});

test('3N.17-O — Free spin intervention no viola la conservación de L_total_world y registra Δp_s explícito', () => {
  const engine=EngineAdapter.create({mode:'Free',params:createParams({s0:0}),theta0:45*Math.PI/180,Omega0:[0,0,0]});
  const before=engine.getState();
  const after=engine.setSpinRate(40);
  const deltaPs=after.params.Ia*40-before.params.Ia*0;
  const deltaL=after.n_w.map(v=>v*deltaPs);
  assert.ok(diff(after.L_wheel_world,before.L_wheel_world)>1e-10);
  assert.ok(diff(after.L_body_world,before.L_body_world)>1e-10);
  assert.ok(diff(after.L_total_world,before.L_total_world)<1e-10);
  assert.ok(diff(after.L_control,deltaL)<1e-10);
  assert.ok(after.W_control>0);
});

test('3N.17-P — VerticalBearing conserva Lz durante spin y permite torque horizontal del bearing', () => {
  const engine=EngineAdapter.create({mode:'VerticalBearing',params:createParams({s0:0}),theta0:45*Math.PI/180,Omega0:[0,0,0]});
  const before=engine.getState();
  const after=engine.setSpinRate(40);
  near(after.L_total_world[2],before.L_total_world[2],1e-10);
  assert.ok(diff(after.Omega_b,before.Omega_b)>1e-10);
  // The total horizontal L is not a conserved quantity in VerticalBearing;
  // the support may supply horizontal torque. The engine keeps tau_bearing,z=0.
  assert.ok(Math.abs(after.tau_bearing[2])<1e-10);
});
