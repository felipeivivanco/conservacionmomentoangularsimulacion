"""
Reference oracle for the angular-momentum engine (validation of SPEC_MOTOR.md).
Pure NumPy. Not the production engine; it exists to check the math and to measure tolerances.
Conventions: see SPEC_MOTOR.md (Z_w up, right-handed; body: X_b lateral-right, Y_b forward, Z_b up).
"""
import numpy as np
from dataclasses import dataclass, field

E_Z = np.array([0.0, 0.0, 1.0])

# ---------------------------------------------------------------- quaternion (w,x,y,z), Hamilton
def qmul(a, b):
    aw, ax, ay, az = a; bw, bx, by, bz = b
    return np.array([aw*bw - ax*bx - ay*by - az*bz,
                     aw*bx + ax*bw + ay*bz - az*by,
                     aw*by - ax*bz + ay*bw + az*bx,
                     aw*bz + ax*by - ay*bx + az*bw])
def qnorm(q): return q/np.linalg.norm(q)
def qR(q):
    w,x,y,z = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w),   2*(x*z+y*w)],
                     [2*(x*y+z*w),   1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w),   2*(y*z+x*w),   1-2*(x*x+y*y)]])
def qdot(q, Om_b): return 0.5*qmul(q, np.array([0.0, *Om_b]))
def q_axis_angle(axis, ang):
    axis = np.asarray(axis, float); axis = axis/np.linalg.norm(axis)
    return np.array([np.cos(ang/2), *(np.sin(ang/2)*axis)])

# ---------------------------------------------------------------- parameters
@dataclass
class Params:
    m_p: float = 70.0                                   # person mass [kg]
    Ip: np.ndarray = field(default_factory=lambda: np.array([12.5, 13.5, 1.6]))  # person principal moments about own CM [kg m^2]
    m_w: float = 3.0                                    # wheel mass [kg]
    D: float = 0.68                                     # wheel diameter [m]
    Ia: float = 0.30                                    # wheel axial inertia [kg m^2]
    kt: float = 0.5                                     # I_t / I_a (planar wheel)
    r_w: np.ndarray = field(default_factory=lambda: np.array([0.0, 0.60, 0.40]))  # wheel CM rel. person CM, body axes [m]
    I_pl_z: float = 2.0                                 # platform axial inertia (VerticalBearing only) [kg m^2]
    s0: float = 40.0                                    # initial absolute wheel spin [rad/s]
    th_dot_max: float = np.radians(90.0)
    th_ddot_max: float = np.radians(360.0)
    @property
    def It(self): return self.kt*self.Ia
    @property
    def ps(self): return self.Ia*self.s0
    @property
    def mu(self): return self.m_p*self.m_w/(self.m_p+self.m_w)

def I_star(P, mode):
    d = P.r_w
    I = np.diag(P.Ip) + P.mu*(d@d*np.eye(3) - np.outer(d, d))
    if mode == "VB": I = I + P.I_pl_z*np.outer(E_Z, E_Z)
    return I

def frame(th):
    n = np.array([np.cos(th), 0.0, np.sin(th)])
    t = np.array([-np.sin(th), 0.0, np.cos(th)])
    h = np.array([0.0, -1.0, 0.0])
    return n, t, h

def Ic(P, mode, th):
    n, _, _ = frame(th)
    return I_star(P, mode) + P.It*(np.eye(3) - np.outer(n, n))

def dIc(P, th, thd):
    n, t, _ = frame(th)
    return -P.It*thd*(np.outer(t, n) + np.outer(n, t))

# ---------------------------------------------------------------- theta trajectory: analytic time-optimal plan
class Plan:
    """Rest-to-rest at `target` from (th0, w0) at time t0, |w|<=wmax, |a|<=amax. Piecewise constant a. Exact, dt-independent."""
    def __init__(self, t0, th0, w0, target, P):
        amax, wmax = P.th_ddot_max, P.th_dot_max
        self.target = float(np.clip(target, -np.pi/2, np.pi/2)); self.t0 = t0
        w0 = float(np.clip(w0, -wmax, wmax))
        e = self.target - th0
        d_b = w0*abs(w0)/(2*amax)
        sg = 1.0 if (e - d_b) >= 0 else -1.0
        u0, et = sg*w0, sg*e
        up = np.sqrt(max(0.0, amax*et + 0.5*u0*u0))
        if up > wmax:
            t1 = max(0.0, wmax - u0)/amax
            x1 = (wmax**2 - u0**2)/(2*amax); x3 = wmax**2/(2*amax)
            t2 = max(0.0, (et - x1 - x3)/wmax); t3 = wmax/amax
        else:
            t1 = max(0.0, up - u0)/amax; t2 = 0.0; t3 = up/amax
        segs = [(t1, sg*amax), (t2, 0.0), (t3, -sg*amax)]
        self.knots = [t0]; self.st = [(th0, w0)]; self.acc = []
        th, w, t = th0, w0, t0
        for dur, a in segs:
            if dur <= 0: continue
            th, w = th + w*dur + 0.5*a*dur*dur, w + a*dur; t += dur
            self.knots.append(t); self.st.append((th, w)); self.acc.append(a)
        self.t_end = t; self.th_end = self.target
    def eval(self, t):
        """(theta, theta_dot, theta_ddot) at absolute time t (a = right-limit)."""
        if t >= self.t_end: return self.target, 0.0, 0.0
        for i in range(len(self.acc)):
            if t < self.knots[i+1] or i == len(self.acc)-1:
                th0, w0 = self.st[i]; tau = t - self.knots[i]; a = self.acc[i]
                return th0 + w0*tau + 0.5*a*tau*tau, w0 + a*tau, a
        return self.target, 0.0, 0.0
    def breakpoints(self, ta, tb):
        return [k for k in self.knots[1:] if ta < k < tb]

# ---------------------------------------------------------------- solve Omega
def omega(P, mode, q, th, thd, L0):
    n, t, h = frame(th)
    I = Ic(P, mode, th)
    if mode == "Free":
        Lb = qR(q).T @ L0
        rhs = Lb - P.ps*n - P.It*thd*h
        return np.linalg.solve(I, rhs)
    else:  # VB: L0 is scalar Lz0
        rz = L0 - P.ps*n[2] - P.It*thd*h[2]
        return E_Z*(rz/I[2, 2])

def init_L0(P, mode, q0, th0, Om0=np.zeros(3)):
    n, t, h = frame(th0)
    I = Ic(P, mode, th0)
    Lb = I@Om0 + P.ps*n              # thd0 = 0
    if mode == "Free": return qR(q0)@Lb
    return (qR(q0)@Lb)[2]

# ---------------------------------------------------------------- one RK4 sub-step (q, W [, L_b for the Euler validator])
def rk4_sub(P, mode, q, W, Lb, ftheta, a_const, L0, h, variant):
    def Om_of(qs, Ls, ths, thds):
        if variant == "primary": return omega(P, mode, qs, ths, thds, L0)
        n, t, hh = frame(ths); return np.linalg.solve(Ic(P, mode, ths), Ls - P.ps*n - P.It*thds*hh)
    def f(qs, Ls, tau):
        ths, thds = ftheta(tau)
        Om = Om_of(qs, Ls, ths, thds)
        dW = diagnostics(P, mode, qs, ths, thds, a_const, L0)["P_act"] if variant == "primary" else 0.0
        dL = np.zeros(3) if variant == "primary" else -np.cross(Om, Ls)
        return qdot(qs, Om), dW, dL
    k1 = f(q, Lb, 0.0)
    k2 = f(q + 0.5*h*k1[0], Lb + 0.5*h*k1[2], 0.5*h)
    k3 = f(q + 0.5*h*k2[0], Lb + 0.5*h*k2[2], 0.5*h)
    k4 = f(q + h*k3[0], Lb + h*k3[2], h)
    qn = qnorm(q + h/6*(k1[0] + 2*k2[0] + 2*k3[0] + k4[0]))
    Wn = W + h/6*(k1[1] + 2*k2[1] + 2*k3[1] + k4[1])
    Ln = Lb + h/6*(k1[2] + 2*k2[2] + 2*k3[2] + k4[2])
    return qn, Wn, Ln

# ---------------------------------------------------------------- diagnostics
def diagnostics(P, mode, q, th, thd, thdd, L0):
    n, t, h = frame(th)
    I = Ic(P, mode, th)
    Om = omega(P, mode, q, th, thd, L0)
    Pn = np.eye(3) - np.outer(n, n)
    L_wheel = P.ps*n + P.It*(Pn@Om) + P.It*thd*h                 # about wheel CM
    L_body = I_star(P, mode)@Om                                  # person (+platform) + orbital term
    L_tot_b = L_wheel + L_body
    R = qR(q)
    T = 0.5*Om@I@Om + P.It*thd*(h@Om) + 0.5*P.It*thd**2 + P.ps**2/(2*P.Ia)
    # Omega_dot
    dI = dIc(P, th, thd)
    if mode == "Free":
        Lb = R.T@L0
        Om_dot = np.linalg.solve(I, -np.cross(Om, Lb) - P.ps*thd*t - P.It*thdd*h - dI@Om)
    else:
        Ozd = (-P.ps*thd*np.cos(th) - Om[2]*dI[2, 2])/I[2, 2]
        Om_dot = E_Z*Ozd
    # wheel torque about own CM (body-frame components of inertial derivative)
    dPn = -(np.outer(thd*t, n) + np.outer(n, thd*t))
    Lw_dot_b = P.ps*thd*t + P.It*(dPn@Om + Pn@Om_dot) + P.It*thdd*h
    tau_wheel_b = Lw_dot_b + np.cross(Om, L_wheel)               # = dL_wheel/dt, body comps
    tau_h = h@tau_wheel_b                                        # actuator torque on wheel about hinge axis
    # total torque on composite (bearing torque in VB)
    Lb_tot_dot = dI@Om + I@Om_dot + P.ps*thd*t + P.It*thdd*h
    tau_ext_b = Lb_tot_dot + np.cross(Om, L_tot_b)
    return dict(Om=Om, L_wheel_b=L_wheel, L_body_b=L_body, L_tot_b=L_tot_b, L_tot_w=R@L_tot_b,
                T=T, tau_h=tau_h, P_act=tau_h*thd, tau_ext_b=tau_ext_b, tau_ext_w=R@tau_ext_b,
                tau_wheel_on_body_b=-tau_wheel_b, Om_dot=Om_dot, n_w=R@n)

# ---------------------------------------------------------------- simulate (fixed step, sub-steps split at plan knots)
def simulate(P, mode, q0, th0, targets, T_end, dt, Om0=np.zeros(3), prescribed=None, variant="primary"):
    """targets: t->theta_target (analytic plan). prescribed: t->(th,thd,thdd) analytic trajectory (integrator tests)."""
    q = q0.copy(); W = 0.0
    L0 = init_L0(P, mode, q0, th0, Om0)
    Lb = qR(q0).T@L0 if mode == "Free" else np.zeros(3)
    plan = Plan(0.0, th0, 0.0, th0, P) if prescribed is None else None
    n_steps = int(round(T_end/dt)); out = []; T0 = None
    for k in range(n_steps + 1):
        t = k*dt
        if prescribed is None:
            if float(np.clip(targets(t), -np.pi/2, np.pi/2)) != plan.target:
                thn, wn, _ = plan.eval(t); plan = Plan(t, thn, wn, targets(t), P)
            th_now, w_now, a_now = plan.eval(t + 1e-12)
        else:
            th_now, w_now, a_now = prescribed(t)
        d = diagnostics(P, mode, q, th_now, w_now, a_now, L0)
        if T0 is None: T0 = d["T"]
        rec = dict(t=t, q=q.copy(), th=th_now, thd=w_now, thdd=a_now, W=W, T0=T0, **d)
        if variant != "primary":
            n, tt, hh = frame(th_now); rec["Om"] = np.linalg.solve(Ic(P, mode, th_now), Lb - P.ps*n - P.It*w_now*hh)
        out.append(rec)
        if k == n_steps: break
        if prescribed is None:
            pts = [t] + plan.breakpoints(t, t + dt) + [t + dt]
        else:
            pts = [t, t + dt]
        for ta, tb in zip(pts[:-1], pts[1:]):
            h = tb - ta
            if prescribed is None:
                ft = lambda tau, ta=ta: plan.eval(ta + tau)[:2]
                a_c = plan.eval(0.5*(ta + tb))[2]
            else:
                ft = lambda tau, ta=ta: prescribed(ta + tau)[:2]
                a_c = prescribed(0.5*(ta + tb))[2]
            q, W, Lb = rk4_sub(P, mode, q, W, Lb, ft, a_c, L0, h, variant)
    return out, L0
