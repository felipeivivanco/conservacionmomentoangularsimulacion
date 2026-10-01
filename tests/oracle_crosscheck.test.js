// Verificación cruzada motor JS  <->  oracle Python (SPEC §4.3, §4.4/4.5, §4.7, §4.8).
// El golden.json lo genera oracle/make_golden.py con la referencia en Python (mismas ecuaciones, otra implementación).
import test from "node:test";
import assert from "node:assert/strict";
import { makeContext, evaluate, createParams, qAngle, math } from "../src/index.js";
import { golden, near, nearVec, run, FLIP } from "./helpers.js";

const G = golden();
const P = createParams();
const scale = (v) => Math.max(1, ...v.map(Math.abs));
const cmp = (name, a, b, tolRel = 1e-11) => {
  const A = Array.isArray(a) ? a : [a];
  const B = Array.isArray(b) ? b : [b];
  const tol = tolRel * scale(B);
  A.forEach((x, i) => near(x, B[i], tol, `${name}[${i}]`));
};

test("defaults del motor == defaults del oracle (I_B*, μ, I_t, p_s)", () => {
  near(P.ps, G.defaults.ps, 1e-15, "p_s");
  near(P.It, G.defaults.It, 1e-15, "I_t");
  near(P.mu, G.defaults.mu, 1e-13, "mu");
  nearVec(makeContext(P, "Free").Istar, G.defaults.I_star_free, 1e-12, "I_B*(Free)");
  nearVec(makeContext(P, "VerticalBearing").Istar, G.defaults.I_star_vb, 1e-12, "I_B*(VB)");
});

test("§4.3/4.4/4.5/4.7/4.8: 24 estados instantáneos aleatorios (Free y VB) — TODOS los campos", () => {
  let worst = 0;
  const fields = [];
  for (const s of G.states) {
    const ctx = makeContext(P, s.mode === "Free" ? "Free" : "VerticalBearing");
    const e = evaluate(ctx, s.q, s.th, s.thd, s.thdd, s.L0);
    const d = s.diag;
    const pairs = [
      ["Om", e.Om_b, d.Om], ["Om_dot", e.OmDot_b, d.Om_dot],
      ["L_wheel_b", e.L_wheel_b, d.L_wheel_b], ["L_body_b", e.L_body_b, d.L_body_b], ["L_tot_b", e.L_tot_b, d.L_tot_b],
      ["L_tot_w", e.L_tot_w, d.L_tot_w], ["T", e.T, d.T],
      ["tau_h", e.tau_h, d.tau_h], ["P_act", e.P_act, d.P_act],
      ["tau_ext_b", e.tau_ext_b, d.tau_ext_b], ["tau_ext_w", e.tau_ext_w, d.tau_ext_w],
      ["tau_react_b (= −tau_w)", e.tau_react_b, d.tau_wheel_on_body_b], ["n_w", e.n_w, d.n_w],
    ];
    for (const [name, a, b] of pairs) {
      const A = Array.isArray(a) ? a : [a]; const B = Array.isArray(b) ? b : [b];
      const err = Math.max(...A.map((x, i) => Math.abs(x - B[i]))) / scale(B);
      worst = Math.max(worst, err);
      cmp(`${s.mode} ${name}`, a, b);
    }
    fields.push(s.mode);
  }
  assert.equal(fields.length, 24);
  console.log(`  peor error relativo (24 estados × 13 campos): ${worst.toExponential(2)}`);
});

for (const [mode, key] of [["Free", "run_free"], ["VerticalBearing", "run_vb"]]) {
  test(`giro +90° → −90° (${mode}, 6 s, dt=1/240): trayectoria completa vs oracle, incl. W_act integrado`, () => {
    const { rec } = run({ mode, target: FLIP, tEnd: 6.0 });
    const samples = G[key].samples;
    let worstQ = 0, worst = 0;
    for (const o of samples) {
      const k = Math.round(o.t * 240);
      const s = rec[k];
      near(s.t, o.t, 1e-12, "t");
      near(s.theta, o.th, 1e-12, `theta t=${o.t}`);
      near(s.thetaDot, o.thd, 1e-12, `thetaDot t=${o.t}`);
      near(s.thetaDdot, o.thdd, 1e-12, `thetaDdot t=${o.t}`);
      worstQ = Math.max(worstQ, Math.min(qAngle(s.q, o.q), qAngle(s.q, o.q.map((v) => -v))));
      cmp(`Om t=${o.t}`, s._b.Om_b, o.Om, 1e-10);
      cmp(`L_tot_w t=${o.t}`, s.L.total_w, o.L_tot_w, 1e-10);
      cmp(`tau_h t=${o.t}`, s.tau_h, o.tau_h, 1e-9);
      cmp(`tau_ext_w t=${o.t}`, s.tau_ext_w, o.tau_ext_w, 1e-9);
      cmp(`tau_react_b t=${o.t}`, s._b.tau_react_b, o.tau_wheel_on_body_b, 1e-9);
      cmp(`T t=${o.t}`, s.T, o.T, 1e-10);
      cmp(`W_act t=${o.t}`, s.W_act, o.W, 1e-9);
      worst = Math.max(worst, Math.abs(s.W_act - o.W));
    }
    assert.ok(worstQ < 1e-9, `ángulo(q) vs oracle: ${worstQ}`);
    console.log(`  ${mode}: max ángulo(q) vs oracle = ${worstQ.toExponential(2)} rad ; max |W_act − W_oracle| = ${worst.toExponential(2)} J`);
    // Estadísticas globales de todos los pasos
    const st = G[key].stats;
    let maxTauH = 0, maxDT = 0;
    const T0 = rec[0].T;
    for (const s of rec) { maxTauH = Math.max(maxTauH, Math.abs(s.tau_h)); maxDT = Math.max(maxDT, Math.abs(s.T - T0)); }
    near(maxTauH, st.max_tau_h, 1e-8, "max|tau_h|");
    near(maxDT, st.max_dT, 1e-8, "max(T−T0)");
    if (mode === "Free") {
      let maxReact = 0;
      for (const s of rec) maxReact = Math.max(maxReact, math.norm(s._b.tau_react_b));
      near(maxReact, st.max_tau_react_norm, 1e-8, "max|tau_react|");
    } else {
      let mb = 0;
      for (const s of rec) mb = Math.max(mb, Math.abs(s.tau_ext_w[0]), Math.abs(s.tau_ext_w[1]));
      near(mb, st.max_tau_bearing_h, 1e-8, "max|tau_bearing horizontal|");
    }
  });
}
