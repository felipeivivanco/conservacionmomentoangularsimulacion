"""Generate cross-language golden data exclusively from oracle.py."""
import json, math, sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import oracle
OUT = Path(__file__).resolve().parent / "golden.json"
P = oracle.Params()
q0 = np.array([1.,0.,0.,0.])
th0 = math.radians(90)
flip = lambda t: math.radians(-90)

def clean(x):
    if isinstance(x, np.ndarray): return x.tolist()
    if isinstance(x, (np.floating, np.integer)): return x.item()
    if isinstance(x, dict): return {k: clean(v) for k,v in x.items()}
    if isinstance(x, (list,tuple)): return [clean(v) for v in x]
    return x

def state_at(mode, th, thd, thdd, Om):
    n,_,h = oracle.frame(th)
    I = oracle.Ic(P, mode, th)
    L0 = I @ np.asarray(Om) + P.ps*n + P.It*thd*h
    d = oracle.diagnostics(P, mode, q0, th, thd, thdd, L0 if mode == 'Free' else (L0[2]))
    return {
      "mode": mode, "q": q0.tolist(), "th": th, "thd": thd, "thdd": thdd,
      "L0": clean(L0 if mode == "Free" else L0[2]),
      "diag": clean(d)
    }

# Deterministic instantaneous states, deliberately not derived from JS.
rng = np.random.default_rng(20260924)
states=[]
for mode in ("Free","VB"):
    for _ in range(12):
        th=float(rng.uniform(-math.pi/2,math.pi/2)); thd=float(rng.uniform(-1.5,1.5)); thdd=float(rng.uniform(-4,4)); Om=rng.normal(size=3)*2
        states.append(state_at(mode,th,thd,thdd,Om))

def run_golden(mode):
    out,L0 = oracle.simulate(P, mode, q0, th0, flip, 6.0, 1/240)
    samples=[]
    for o in out[::240]:
        samples.append({"t":o["t"],"q":clean(o["q"]),"th":o["th"],"thd":o["thd"],"thdd":o["thdd"],
                        "Om":clean(o["Om"]),"L_tot_w":clean(o["L_tot_w"]),"tau_h":o["tau_h"],
                        "tau_ext_w":clean(o["tau_ext_w"]),"tau_wheel_on_body_b":clean(o["tau_wheel_on_body_b"]),
                        "T":o["T"],"W":o["W"]})
    # Include endpoints and every 1/240 s implicitly through the full trajectory statistics.
    max_tau_h=max(abs(o["tau_h"]) for o in out)
    T0=out[0]["T"]
    max_dT=max(abs(o["T"]-T0) for o in out)
    d={"samples":samples,"stats":{"max_tau_h":max_tau_h,"max_dT":max_dT}}
    if mode=="Free": d["stats"]["max_tau_react_norm"]=max(np.linalg.norm(o["tau_wheel_on_body_b"]) for o in out)
    else: d["stats"]["max_tau_bearing_h"]=max(max(abs(o["tau_ext_w"][0]),abs(o["tau_ext_w"][1])) for o in out)
    return d

g={"defaults":{"ps":P.ps,"It":P.It,"mu":P.mu,"I_star_free":clean(oracle.I_star(P,'Free')),"I_star_vb":clean(oracle.I_star(P,'VB'))},
   "states":states,"run_free":run_golden('Free'),"run_vb":run_golden('VB')}
OUT.write_text(json.dumps(g,indent=2,allow_nan=False)+"\n")
print(f"wrote {OUT}")
