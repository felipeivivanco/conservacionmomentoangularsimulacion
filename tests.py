import numpy as np, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from oracle import *
from scipy.integrate import solve_ivp
np.set_printoptions(precision=6, suppress=True, linewidth=140)
rng = np.random.default_rng(7)
R2D = 180/np.pi
res = {}
def qerr(a, b):
    ac = np.array([a[0], -a[1], -a[2], -a[3]]); d = qmul(ac, b)
    return 2*np.arctan2(np.linalg.norm(d[1:]), abs(d[0]))

# ============ T1: brute-force particle oracle for L_total and T (Free), ring-consistent wheel
def bruteforce(P, th, thd, Om, N=720):
    n, t, h = frame(th); y = np.array([0, 1.0, 0])
    assert abs(P.m_w*(P.D/2)**2 - P.Ia) < 1e-12 and abs(P.kt - 0.5) < 1e-12
    s = P.ps/P.Ia; w_rel = s - n@Om
    Ixx, Iyy, Izz = P.Ip
    A = (Iyy + Izz - Ixx)/2; B = (Ixx + Izz - Iyy)/2; C = (Ixx + Iyy - Izz)/2
    mm = P.m_p/6
    ax, ay, az = np.sqrt(A/(2*mm)), np.sqrt(B/(2*mm)), np.sqrt(C/(2*mm))
    pts = []; ms = []
    for sgn in (+1, -1):
        pts += [np.array([sgn*ax, 0, 0]), np.array([0, sgn*ay, 0]), np.array([0, 0, sgn*az])]; ms += [mm]*3
    ring = [P.r_w + (P.D/2)*(np.cos(p)*y + np.sin(p)*t) for p in 2*np.pi*np.arange(N)/N]
    allp = pts + ring; allm = np.array(ms + [P.m_w/N]*N)
    cm = sum(m*p for m, p in zip(allm, allp))/allm.sum()
    Ltot = np.zeros(3); T = 0.0
    for k, (m, p) in enumerate(zip(allm, allp)):
        r = p - cm; v = np.cross(Om, r)
        if k >= 6: v = v + np.cross(thd*h + w_rel*n, p - P.r_w)
        Ltot += m*np.cross(r, v); T += 0.5*m*v@v
    return Ltot, T
P1 = Params(Ia=3.0*0.34**2)
errL = errT = 0
for _ in range(8):
    th = rng.uniform(-np.pi/2, np.pi/2); thd = rng.uniform(-1.5, 1.5); Om = rng.normal(size=3)*2
    Lb, T = bruteforce(P1, th, thd, Om)
    n, t, h = frame(th)
    Lb_engine_in = Ic(P1, "Free", th)@Om + P1.ps*n + P1.It*thd*h
    d = diagnostics(P1, "Free", np.array([1.0, 0, 0, 0]), th, thd, 0.0, Lb_engine_in)
    errL = max(errL, np.abs(d["L_tot_b"] - Lb).max()/np.abs(Lb).max()); errT = max(errT, abs(d["T"] - T)/T)
res["T1 brute-force (Free, 8 random states): L_total max rel err"] = errL
res["T1 brute-force (Free, 8 random states): T max rel err"] = errT

# ============ common runs
P = Params(); q0 = np.array([1.0, 0, 0, 0]); th0 = np.radians(90)
flip = lambda t: np.radians(-90)
dt = 1/240
outF, L0F = simulate(P, "Free", q0, th0, flip, 6.0, dt)
outV, L0V = simulate(P, "VB",   q0, th0, flip, 6.0, dt)
ts = np.array([o["t"] for o in outF]); th = np.array([o["th"] for o in outF]); thd = np.array([o["thd"] for o in outF]); tdd = np.array([o["thdd"] for o in outF])
res["T9 flip 180deg: plan duration [s] (analytic 2.25)"] = Plan(0, th0, 0, -th0, P).t_end
res["T9 max |theta_dot| [deg/s]"] = np.abs(thd).max()*R2D
res["T9 max |theta_ddot| [deg/s^2]"] = np.abs(tdd).max()*R2D
res["T9 theta range reached [deg]"] = (th.min()*R2D, th.max()*R2D)
res["T9 final theta - target [rad]"] = th[-1] + np.pi/2

# ============ T2 VB closed form
I0 = I_star(P, "VB")[2, 2]
res["T2 VB closed-form max abs err [rad/s]"] = max(abs(o["Om"][2] - (L0V - P.ps*np.sin(o["th"]))/(I0 + P.It*np.cos(o["th"])**2)) for o in outV)
res["T2 VB Omega_z after 180deg flip [rad/s]"] = outV[-1]["Om"][2]
res["T2   = 2 ps / I_zz(-90deg) with I_zz=Izz+mu*dh^2+I_pl"] = 2*P.ps/I0
res["T2   I_zz composite (VB) [kg m^2]"] = I0
# Free with huge transverse inertia -> VB
Ph = Params(Ip=np.array([1e8, 1e8, 1.6 + 2.0]))
outH, _ = simulate(Ph, "Free", q0, th0, flip, 6.0, dt)
Ph_vb = Params(Ip=np.array([1e8, 1e8, 1.6]))
outHV, _ = simulate(Ph_vb, "VB", q0, th0, flip, 6.0, dt)
res["T4b Free with Ix,Iy->1e8 vs VB: max |Omega_z diff| [rad/s]"] = max(abs(a["Om"][2] - b["Om"][2]) for a, b in zip(outH, outHV))

# ============ T3 conservation
LW = np.array([o["L_tot_w"] for o in outF])
res["T3 Free max |L_tot_w - L0|/|L0|"] = np.abs(LW - L0F).max()/np.linalg.norm(L0F)
res["T3 Free max ||q|-1|"] = max(abs(np.linalg.norm(o["q"]) - 1) for o in outF)
res["T3 VB max |Lz - Lz0|/Lz0"] = max(abs(o["L_tot_w"][2] - L0V) for o in outV)/L0V

# ============ T5 energy
for nm, out in (("Free", outF), ("VB", outV)):
    res[f"T5 {nm} max |T-T0-W_act| [J]"] = max(abs(o["T"] - o["T0"] - o["W"]) for o in out)
    res[f"T5 {nm} max |T-T0| [J]"] = max(abs(o["T"] - o["T0"]) for o in out)
    res[f"T5 {nm} max |tau_h| [N m]"] = max(abs(o["tau_h"]) for o in out)
res["T5 max |ps*theta_dot| [N m]"] = P.ps*np.abs(thd).max()

# ============ T6 torque
tz = np.array([o["tau_ext_w"] for o in outV])
res["T6 VB max |tau_bearing_z| [N m]"] = np.abs(tz[:, 2]).max()
res["T6 VB max |tau_bearing_horizontal| [N m]"] = np.abs(tz[:, :2]).max()
res["T6 Free max |tau_ext| [N m]"] = max(np.abs(o["tau_ext_w"]).max() for o in outF)
def interior_mask(out, plan_knots, margin=3):
    ks = np.array([o["t"] for o in out]); ok = np.ones(len(out), bool)
    for kn in plan_knots: ok &= np.abs(ks - kn) > margin*dt
    return ok
knots = Plan(0, th0, 0, -th0, P).knots
tt = np.array([o["t"] for o in outV]); mk = interior_mask(outV, knots)[1:-1]
LV = np.array([o["L_tot_w"] for o in outV]); dLnum = (LV[2:] - LV[:-2])/(2*dt)
res["T6 VB analytic vs numeric d(L_tot)/dt (away from knots) max abs diff [N m]"] = np.abs(dLnum - tz[1:-1])[mk].max()
# T7 reaction on body
LbW = np.array([qR(o["q"])@o["L_body_b"] for o in outF]); dLbnum = (LbW[2:] - LbW[:-2])/(2*dt)
tob = np.array([qR(o["q"])@o["tau_wheel_on_body_b"] for o in outF])[1:-1]
mkF = interior_mask(outF, knots)[1:-1]
res["T7 Free: -dL_wheel/dt vs numeric dL_body/dt (away from knots) max diff [N m]"] = np.abs(dLbnum - tob)[mkF].max()
res["T7 Free: max |reaction torque on body| [N m]"] = np.abs(tob).max()

# ============ T7b generalized-Euler validator
outE, _ = simulate(P, "Free", q0, th0, flip, 6.0, dt, variant="euler")
res["T7b Euler-generalized validator vs primary: max |dOmega| [rad/s]"] = max(np.abs(a["Om"] - b["Om"]).max() for a, b in zip(outE, outF))
res["T7b Euler-generalized validator vs primary: max angle(q) diff [rad]"] = max(qerr(a["q"], b["q"]) for a, b in zip(outE, outF))

# ============ T4 Poinsot (theta fixed) + independent scipy Euler
th_fix = np.radians(30); Om0 = np.array([0.3, -0.2, 2.0])
outP, LP = simulate(P, "Free", q0, th_fix, lambda t: th_fix, 20.0, dt, Om0=Om0)
Tt = np.array([o["T"] for o in outP]); LWp = np.array([o["L_tot_w"] for o in outP])
res["T4 gyrostat (theta fixed) 20 s: max |dT|/T"] = np.abs(Tt - Tt[0]).max()/Tt[0]
res["T4 gyrostat 20 s: max |dL_w|/|L|"] = np.abs(LWp - LP).max()/np.linalg.norm(LP)
# independent scipy: gyrostat Euler  I w' + w x (I w + h) = 0 with I=Ic(th_fix), h = ps*n
I = Ic(P, "Free", th_fix); n, _, _ = frame(th_fix); hh = P.ps*n
def gyro(t, w): return np.linalg.solve(I, -np.cross(w, I@w + hh))
sol = solve_ivp(gyro, [0, 20], Om0, rtol=1e-13, atol=1e-14, dense_output=True)
res["T4 gyrostat vs scipy(DOP853-like) independent Euler: max |dOmega| [rad/s]"] = max(np.abs(sol.sol(o["t"]) - o["Om"]).max() for o in outP[::10])
# intermediate axis, purely unstable eigenvector
Pi = Params(Ip=np.array([1.0, 2.0, 3.0]), m_w=1e-9, Ia=1e-9, kt=0.0, s0=0.0, r_w=np.zeros(3))
lam_th = np.sqrt((2-1)*(3-2)/(1*3)); eps = 1e-6
Om0 = np.array([eps, 1.0, -lam_th*eps])   # I1 w1' = (I2-I3) w2 w3 -> w3 = lam*I1*w1/((I2-I3)*Omega)
outI, _ = simulate(Pi, "Free", q0, 0.0, lambda t: 0.0, 6.0, dt, Om0=Om0)
tI = np.array([o["t"] for o in outI]); ox = np.abs([o["Om"][0] for o in outI])
res["T4 intermediate axis: fitted growth rate [1/s] (theory 0.577350)"] = np.polyfit(tI[tI < 5], np.log(ox[tI < 5]), 1)[0]
Ie = np.array([1., 2., 3.])
fE = lambda t, w: [(Ie[1]-Ie[2])*w[1]*w[2]/Ie[0], (Ie[2]-Ie[0])*w[2]*w[0]/Ie[1], (Ie[0]-Ie[1])*w[0]*w[1]/Ie[2]]
s2 = solve_ivp(fE, [0, 6], [eps, 1.0, 1e-6], rtol=1e-13, atol=1e-18, dense_output=True)
outI2, _ = simulate(Pi, "Free", q0, 0.0, lambda t: 0.0, 6.0, dt, Om0=np.array([eps, 1.0, 1e-6]))
res["T4 rigid body Euler vs scipy independent: max rel |dOmega_x|"] = max(abs(o["Om"][0] - s2.sol(o["t"])[0]) for o in outI2)/1e-5

# ============ T8 integrator convergence (analytic theta(t), Free)
A = np.radians(80); wf = 2*np.pi*0.4
pres = lambda t: (A*np.sin(wf*t), A*wf*np.cos(wf*t), -A*wf*wf*np.sin(wf*t))
def endS(dtx):
    o, _ = simulate(P, "Free", q0, 0.0, None, 4.0, dtx, prescribed=pres); return o[-1]
ref = endS(1/3840)
for dtx in [1/60, 1/120, 1/240, 1/480]:
    e = endS(dtx)
    res[f"T8 analytic theta(t), dt=1/{round(1/dtx)}: angle err [rad] | |W-Wref| [J]"] = (qerr(e["q"], ref["q"]), abs(e["W"] - ref["W"]))

# ============ T9b real plan: dt independence (sub-steps split at knots)
def endq(dtx, tgt=flip, mode="Free", T=6.0):
    o, _ = simulate(P, mode, q0, th0, tgt, T, dtx); return o[-1]
qa = endq(1/1920)
for dtx in [1/60, 1/120, 1/240, 1/480]:
    e = endq(dtx)
    res[f"T9b Free 180deg flip end state vs dt=1/1920, dt=1/{round(1/dtx)}: angle [rad] | |dOmega|"] = (qerr(e["q"], qa["q"]), np.abs(e["Om"] - qa["Om"]).max())

# retarget mid-flight (target changes at t=0.6 s from -90 to +30, sample times multiple of every dt)
tgt2 = lambda t: np.radians(-90) if t < 0.6 else np.radians(30)
oR, _ = simulate(P, "Free", q0, th0, tgt2, 6.0, dt)
thR = np.array([o["th"] for o in oR]); wR = np.array([o["thd"] for o in oR])
res["T9c retarget: final theta [deg] (target 30)"] = thR[-1]*R2D
res["T9c retarget: max |theta_dot| [deg/s]"] = np.abs(wR).max()*R2D
res["T9c retarget: theta range [deg]"] = (thR.min()*R2D, thR.max()*R2D)
res["T9c retarget: max |dtheta_dot| per step jump [deg/s] (C1 check)"] = np.abs(np.diff(wR)).max()*R2D
# dt-independence of retarget
res["T9c retarget end-orientation dt=1/240 vs 1/960 [rad]"] = qerr(endq(1/240, tgt2)["q"], endq(1/960, tgt2)["q"])
# randomized retarget invariant: |theta|<=90deg, |w|<=wmax, |a|<=amax, continuity, arrival
rs = np.random.default_rng(11); sched = [(0.0, np.radians(90))]
tcur = 0.0
for _ in range(60):
    tcur += rs.uniform(0.05, 0.9); sched.append((tcur, rs.uniform(-np.pi/2, np.pi/2)))
def tgtR(t):
    v = sched[0][1]
    for ts_, tg in sched:
        if t >= ts_: v = tg
    return v
oX, _ = simulate(P, "VB", q0, 0.0, tgtR, tcur + 4.0, dt); thX = np.array([o["th"] for o in oX]); wX = np.array([o["thd"] for o in oX]); aX = np.array([o["thdd"] for o in oX])
res["T9d random retargets (60): max |theta| [deg] (must be <= 90)"] = np.abs(thX).max()*R2D
res["T9d random retargets: max |theta_dot| [deg/s]"] = np.abs(wX).max()*R2D
res["T9d random retargets: max |theta_ddot| [deg/s^2]"] = np.abs(aX).max()*R2D
res["T9d random retargets: max |step change of theta_dot| [deg/s] (<= a_max*dt=1.5)"] = np.abs(np.diff(wX)).max()*R2D
res["T9d random retargets: final |theta-target| [rad]"] = abs(thX[-1] - tgtR(1e9))
# smoothness of Omega (no spikes)
OmF = np.array([o["Om"] for o in outF]); res["T9 Free max |dOmega/dt| [rad/s^2]"] = (np.abs(np.diff(OmF, axis=0)).max(axis=1)/dt).max()

# signs
outS, _ = simulate(P, "VB", q0, th0, lambda t: 0.0, 4.0, dt)
res["Sign VB +90->0, ps>0: Omega_z [rad/s] (=ps/(I0+It) = %.6f)" % (P.ps/(I0 + P.It))] = outS[-1]["Om"][2]
Pm = Params(s0=-40.0); outM, _ = simulate(Pm, "VB", q0, th0, lambda t: 0.0, 4.0, dt)
res["Sign VB, ps<0: Omega_z [rad/s]"] = outM[-1]["Om"][2]

# Free response summary
res["Free flip: max |Omega_x|,|Omega_y|,|Omega_z| [rad/s]"] = np.abs(OmF).max(axis=0)
res["Free flip: max angle Z_b vs world Z [deg]"] = max(np.degrees(np.arccos(np.clip(qR(o['q'])[2, 2], -1, 1))) for o in outF)
res["Free flip: wheel axis in world at t=6 s"] = outF[-1]["n_w"]
res["Free flip: angle between wheel axis at t=0 and t=6 s [deg]"] = np.degrees(np.arccos(np.clip(outF[0]["n_w"]@outF[-1]["n_w"], -1, 1)))

for k, v in res.items():
    print(f"{k:96s} {v}")
print("\nI_B* Free:\n", I_star(P, "Free")); print("I_B* VB:\n", I_star(P, "VB"))
print("mu =", P.mu, " It =", P.It, " ps =", P.ps, " Ia_max=m_w R^2 =", P.m_w*(P.D/2)**2)
