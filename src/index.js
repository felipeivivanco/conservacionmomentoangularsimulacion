// Motor v1 — SPEC_MOTOR.md
// Convención: q=(w,x,y,z), Hamilton; R(q): cuerpo -> mundo.

const EZ = [0, 0, 1];
const EPS = 1e-14;

const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.sqrt(dot(a,a));
const matVec=(A,v)=>A.map(r=>dot(r,v));
const matAdd=(A,B)=>A.map((r,i)=>r.map((v,j)=>v+B[i][j]));
const matScale=(A,s)=>A.map(r=>r.map(v=>v*s));
const outer=(a,b)=>a.map(x=>b.map(y=>x*y));
const eye=()=>[[1,0,0],[0,1,0],[0,0,1]];
const transpose=A=>A[0].map((_,j)=>A.map(r=>r[j]));
const matMul=(A,B)=>A.map(r=>B[0].map((_,j)=>r.reduce((s,v,k)=>s+v*B[k][j],0)));
const clone=v=>Array.isArray(v)?v.map(clone):v;

function solve3(A,b){
  const M=A.map((r,i)=>[...r,b[i]]);
  for(let k=0;k<3;k++){
    let p=k; for(let i=k+1;i<3;i++) if(Math.abs(M[i][k])>Math.abs(M[p][k])) p=i;
    if(Math.abs(M[p][k])<EPS) throw new Error('Singular 3x3 solve');
    [M[k],M[p]]=[M[p],M[k]];
    for(let i=k+1;i<3;i++){
      const f=M[i][k]/M[k][k];
      for(let j=k;j<4;j++) M[i][j]-=f*M[k][j];
    }
  }
  const x=[0,0,0];
  for(let i=2;i>=0;i--){ let s=M[i][3]; for(let j=i+1;j<3;j++) s-=M[i][j]*x[j]; x[i]=s/M[i][i]; }
  return x;
}

function qmul(a,b){
  const [aw,ax,ay,az]=a,[bw,bx,by,bz]=b;
  return [aw*bw-ax*bx-ay*by-az*bz,
          aw*bx+ax*bw+ay*bz-az*by,
          aw*by-ax*bz+ay*bw+az*bx,
          aw*bz+ax*by-ay*bx+az*bw];
}
function qnorm(q){const n=norm(q); if(n<EPS) throw new Error('Zero quaternion'); return q.map(v=>v/n);}
function qR(q){
  const [w,x,y,z]=q;
  return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
          [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
          [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];
}
function qdot(q,om){return scale(qmul(q,[0,...om]),0.5);}
function qAngle(a,b){
  const ac=[a[0],-a[1],-a[2],-a[3]], d=qmul(ac,b);
  return 2*Math.atan2(norm(d.slice(1)),Math.abs(d[0]));
}
function qAxisAngle(axis,ang){const n=norm(axis),s=Math.sin(ang/2)/n;return [Math.cos(ang/2),axis[0]*s,axis[1]*s,axis[2]*s];}

// Explicit frame transforms: q maps body -> world. These functions transform vectors,
// not origins; origin selection remains a separate visualization concern.
function expressInWorldFrame(q,vBody){ return matVec(qR(q),vBody); }
function expressInBodyFrame(q,vWorld){ return matVec(transpose(qR(q)),vWorld); }

const DEFAULTS=Object.freeze({
  m_p:70, Ip:[12.5,13.5,1.6], m_w:3, D:0.68, Ia:0.30, kt:0.5,
  r_w:[0,0.60,0.40], I_pl_z:2.0, s0:40,
  th_dot_max:Math.PI/2, th_ddot_max:2*Math.PI,
  tau_h_warn:50, dt:1/240, frame_dt_max:0.1
});

// Physical wheel model used by the interactive demo when mass/diameter are edited:
// thin hoop/ring about its symmetry axis, I = m R² = m D² / 4.
function wheelRingInertia(m_w,D){
  if(!(Number.isFinite(m_w)&&m_w>0&&Number.isFinite(D)&&D>0)) throw new Error('wheel mass and diameter must be positive');
  return m_w*(D/2)**2;
}

function validateParams(p){
  const errors=[];
  const reqPos=(name,x)=>{if(!(Number.isFinite(x)&&x>0)) errors.push(`${name} must be > 0`)};
  reqPos('m_p',p.m_p); reqPos('m_w',p.m_w); reqPos('D',p.D); reqPos('Ia',p.Ia); reqPos('I_pl_z',p.I_pl_z);
  if(!Array.isArray(p.Ip)||p.Ip.length!==3||p.Ip.some(x=>!Number.isFinite(x)||x<=0)) errors.push('Ip components must be > 0');
  else if(p.Ip.some((x,i)=>x>=p.Ip[(i+1)%3]+p.Ip[(i+2)%3])) errors.push('Ip violates triangle inequality');
  if(!Array.isArray(p.r_w)||p.r_w.length!==3||p.r_w.some(x=>!Number.isFinite(x))) errors.push('r_w must be a finite 3-vector');
  if(!(Number.isFinite(p.kt)&&p.kt>=0.5&&p.kt<=1)) errors.push('kt must be in [0.5, 1]');
  if(p.Ia>p.m_w*(p.D/2)**2 + 1e-14) errors.push('Ia > m_w R^2');
  if(!Number.isFinite(p.s0)) errors.push('s0 must be finite');
  reqPos('th_dot_max',p.th_dot_max); reqPos('th_ddot_max',p.th_ddot_max);
  reqPos('dt',p.dt); reqPos('frame_dt_max',p.frame_dt_max); reqPos('tau_h_warn',p.tau_h_warn);
  if(errors.length) throw new Error('Invalid parameters: '+errors.join('; '));
  return p;
}

function createParams(overrides={}){
  const p={...DEFAULTS,...overrides,Ip:[...(overrides.Ip??DEFAULTS.Ip)],r_w:[...(overrides.r_w??DEFAULTS.r_w)]};
  p.It=p.kt*p.Ia; p.ps=p.Ia*p.s0; p.mu=p.m_p*p.m_w/(p.m_p+p.m_w); p.R=p.D/2;
  validateParams(p); return p;
}

function frame(th){return {n:[Math.cos(th),0,Math.sin(th)],t:[-Math.sin(th),0,Math.cos(th)],h:[0,-1,0]};}
function Istar(P,mode,includeHuman=true){
  const human = includeHuman !== false;
  const d=P.r_w, dd=dot(d,d);
  // OFF keeps the human as an idealized dynamical body: its geometric mass
  // distribution is removed, but its symmetric principal inertias remain so
  // the human can still rotate and carry angular momentum in the phenomenon.
  const I = human
    ? matAdd([[P.Ip[0],0,0],[0,P.Ip[1],0],[0,0,P.Ip[2]]],matScale(matAdd(matScale(eye(),dd),matScale(outer(d,d),-1)),P.mu))
    : [[P.Ip[0],0,0],[0,P.Ip[1],0],[0,0,P.Ip[2]]];
  if(mode==='VerticalBearing'||mode==='VB') return matAdd(I,matScale(outer(EZ,EZ),P.I_pl_z));
  return I;
}
function Ic(P,mode,th,includeHuman=true){const {n}=frame(th);return matAdd(Istar(P,mode,includeHuman),matScale(matAdd(eye(),matScale(outer(n,n),-1)),P.It));}
function dIc(P,th,thd){const {n,t}=frame(th);return matScale(matAdd(outer(t,n),outer(n,t)),-P.It*thd);}
function modeName(mode){return mode==='VB'||mode==='VerticalBearing'?'VerticalBearing':'Free';}

class Plan{
  constructor(t0,th0,w0,target,P){
    const amax=P.th_ddot_max,vmax=P.th_dot_max;
    this.t0=t0; this.target=Math.max(-Math.PI/2,Math.min(Math.PI/2,target));
    w0=Math.max(-vmax,Math.min(vmax,w0)); const e=this.target-th0;
    const db=w0*Math.abs(w0)/(2*amax); const sg=(e-db)>=0?1:-1;
    const u0=sg*w0, et=sg*e; const up=Math.sqrt(Math.max(0,amax*et+0.5*u0*u0));
    let t1,t2,t3;
    if(up>vmax){t1=Math.max(0,(vmax-u0)/amax);const x1=(vmax*vmax-u0*u0)/(2*amax),x3=vmax*vmax/(2*amax);t2=Math.max(0,(et-x1-x3)/vmax);t3=vmax/amax;}
    else{t1=Math.max(0,(up-u0)/amax);t2=0;t3=up/amax;}
    this.knots=[t0];this.states=[[th0,w0]];this.acc=[];let th=th0,w=w0,t=t0;
    for(const [dur,a] of [[t1,sg*amax],[t2,0],[t3,-sg*amax]]){if(dur<=0)continue;th=th+w*dur+0.5*a*dur*dur;w+=a*dur;t+=dur;this.knots.push(t);this.states.push([th,w]);this.acc.push(a);}
    this.tEnd=t; this.thEnd=this.target;
  }
  eval(t){
    if(t>=this.tEnd-1e-14)return [this.target,0,0];
    for(let i=0;i<this.acc.length;i++) if(t<this.knots[i+1]||i===this.acc.length-1){const [th,w]=this.states[i],tau=t-this.knots[i],a=this.acc[i];return [th+w*tau+0.5*a*tau*tau,w+a*tau,a];}
    return [this.target,0,0];
  }
  breakpoints(ta,tb){return this.knots.slice(1,-1).filter(k=>ta<k&&k<tb);}
}

function makeContext(params=createParams(),mode='Free',includeHuman=params.includeHuman !== false){
  const P=params; const M=modeName(mode); const H=includeHuman !== false;
  return {P,mode:M,includeHuman:H,Istar:Istar(P,M,H),Iplz:P.I_pl_z};
}
function initL0(ctx,q0,th0,Om0=[0,0,0],thd0=0){
  const P=ctx.P,{n,h}=frame(th0),I=Ic(P,ctx.mode,th0,ctx.includeHuman);
  const Lb=add(add(matVec(I,Om0),scale(n,P.ps)),scale(h,P.It*thd0)),Rw=qR(q0),Lw=matVec(Rw,Lb);
  return ctx.mode==='Free'?Lw:Lw[2];
}
function omega(ctx,q,th,thd,L0){
  const P=ctx.P,{n,h}=frame(th),I=Ic(P,ctx.mode,th,ctx.includeHuman);
  if(ctx.mode==='Free') return solve3(I,sub(sub(matVec(transpose(qR(q)),L0),scale(n,P.ps)),scale(h,P.It*thd)));
  const rz=L0-P.ps*n[2]-P.It*thd*h[2]; return [0,0,rz/I[2][2]];
}

function evaluate(ctx,q,th,thd,thdd,L0){
  const P=ctx.P,{n,t,h}=frame(th),I=Ic(P,ctx.mode,th,ctx.includeHuman),Om=omega(ctx,q,th,thd,L0),R=qR(q),Pn=matAdd(eye(),matScale(outer(n,n),-1));
  const Lw=add(add(scale(n,P.ps),scale(matVec(Pn,Om),P.It)),scale(h,P.It*thd));
  const Lb=matVec(ctx.Istar,Om), Lt=add(Lw,Lb), Ltw=matVec(R,Lt);
  const T=0.5*dot(Om,matVec(I,Om))+P.It*thd*dot(h,Om)+0.5*P.It*thd*thd+P.ps*P.ps/(2*P.Ia);
  const dI=dIc(P,th,thd);
  let Omd;
  if(ctx.mode==='Free'){
    const Lbody=matVec(transpose(R),L0);
    Omd=solve3(I,sub(sub(sub(scale(cross(Om,Lbody),-1),scale(t,P.ps*thd)),scale(h,P.It*thdd)),matVec(dI,Om)));
  } else {
    const zd=(-P.ps*thd*Math.cos(th)-Om[2]*dI[2][2])/I[2][2]; Omd=[0,0,zd];
  }
  const dPn=matScale(matAdd(outer(t,n),outer(n,t)),-thd);
  const LwDot=add(add(scale(t,P.ps*thd),scale(add(matVec(dPn,Om),matVec(Pn,Omd)),P.It)),scale(h,P.It*thdd));
  const tauW=add(LwDot,cross(Om,Lw));
  const tauH=dot(h,tauW), tauReact=scale(tauW,-1);
  const LtotDot=add(add(matVec(dI,Om),matVec(I,Omd)),add(scale(t,P.ps*thd),scale(h,P.It*thdd)));
  const tauExt=add(LtotDot,cross(Om,Lt));
  const omegaRel=P.ps/P.Ia-dot(n,Om); const omegaW=add(add(Om,scale(h,thd)),scale(n,omegaRel));
  return {Om_b:Om,OmDot_b:Omd,L_wheel_b:Lw,L_body_b:Lb,L_tot_b:Lt,L_tot_w:Ltw,T,tau_h:tauH,P_act:tauH*thd,tau_ext_b:tauExt,tau_ext_w:matVec(R,tauExt),tau_react_b:tauReact,n_w:matVec(R,n),omega_w:omegaW,omega_rel:omegaRel};
}

function initialState(ctx,{q0=[1,0,0,0],theta0=Math.PI/2,Omega0=[0,0,0]}={}){
  const q=qnorm(q0), L0=initL0(ctx,q,theta0,Omega0); return {q,theta0,L0,W_act:0,W_control:0,W_parameter:0,L_control:[0,0,0],t:0,Omega0:[...Omega0],T0:null,lastControl:null};
}

function stepRK4(ctx,state,plan,h,tBase,aConst){
  const P=ctx.P,L0=state.L0;
  const deriv=(q,W,tau)=>{const [th,thd]=plan.eval(tBase+tau);const e=evaluate(ctx,q,th,thd,aConst,L0);return {dq:qdot(q,e.Om_b),dW:e.P_act};};
  const k1=deriv(state.q,state.W_act,0);
  const q2=add(state.q,scale(k1.dq,h/2));const k2=deriv(q2,state.W_act+k1.dW*h/2,h/2);
  const q3=add(state.q,scale(k2.dq,h/2));const k3=deriv(q3,state.W_act+k2.dW*h/2,h/2);
  const q4=add(state.q,scale(k3.dq,h));const k4=deriv(q4,state.W_act+k3.dW*h,h);
  state.q=qnorm(add(state.q,scale(add(add(k1.dq,scale(k2.dq,2)),add(scale(k3.dq,2),k4.dq)),h/6)));
  state.W_act += h*(k1.dW+2*k2.dW+2*k3.dW+k4.dW)/6;
}

function run({mode='Free',params=createParams(),target=Math.PI/2,theta0=Math.PI/2,Omega0=[0,0,0],tEnd=6,dt,targets=null}={}){
  const ctx=makeContext(params,mode), P=ctx.P; dt=dt??P.dt;
  const st=initialState(ctx,{theta0,Omega0}); let plan=new Plan(0,theta0,0,theta0,P); const rec=[]; let T0=null;
  const targetFn=targets??(()=>target);
  const N=Math.round(tEnd/dt);
  for(let k=0;k<=N;k++){
    const t=k*dt; const tg=Math.max(-Math.PI/2,Math.min(Math.PI/2,targetFn(t)));
    if(Math.abs(tg-plan.target)>0){const [th,w]=plan.eval(t+1e-12);plan=new Plan(t,th,w,tg,P);}
    const [th,thd,thdd]=plan.eval(t+1e-12); const e=evaluate(ctx,st.q,th,thd,thdd,st.L0); if(T0===null)T0=e.T;
    rec.push({t,q:[...st.q],theta:th,thetaDot:thd,thetaDdot:thdd,W_act:st.W_act,T0, ...e,L:{wheel:e.L_wheel_b,total_w:e.L_tot_w},_b:e});
    if(k===N)break;
    const pts=[t,...plan.breakpoints(t,t+dt),t+dt];
    for(let j=0;j<pts.length-1;j++){ const aConst=plan.eval((pts[j]+pts[j+1])/2)[2]; stepRK4(ctx,st,plan,pts[j+1]-pts[j],pts[j],aConst); }
    st.t=t+dt;
  }
  return {rec,L0:st.L0,ctx,plan};
}



class AngularMomentumEngine {
  constructor({mode='Free',params=createParams(),theta0=Math.PI/2,Omega0=[0,0,0]}={}){
    this.includeHuman = params.includeHuman !== false; this.ctx=makeContext(params,mode,this.includeHuman); this.P=this.ctx.P; this.P.includeHuman=this.includeHuman; this.mode=this.ctx.mode; this.lifecycleStatus='stopped'; this.reset(theta0,Omega0);
  }
  reset(theta0=Math.PI/2,Omega0=[0,0,0]){
    this.lifecycleStatus='stopped';
    this.P.ps=this.P.Ia*this.P.s0;
    this.P.It=this.P.kt*this.P.Ia;
    this.P.R=this.P.D/2;
    this.st=initialState(this.ctx,{theta0,Omega0}); this.plan=new Plan(0,theta0,0,theta0,this.P); this.target=theta0; this.acc=0; this.lastFrameDt=0; this.T0=null; this.warnings=[]; return this.snapshot();
  }
  setTarget(thetaTarget){
    const target=Math.max(-Math.PI/2,Math.min(Math.PI/2,thetaTarget));
    if(Math.abs(target-this.target)>0){const [th,w]=this.plan.eval(this.st.t+1e-12);this.plan=new Plan(this.st.t,th,w,target,this.P);this.target=target;}
  }

  setLifecycleStatus(status){
    if(!['stopped','running','paused'].includes(status)) throw new RangeError('status must be stopped, running or paused');
    this.lifecycleStatus=status;
    return status;
  }

  setSpinRate(spinRate){
    if(!Number.isFinite(spinRate)) throw new Error('spinRate must be finite');
    const before=this.snapshot();
    const oldPs=this.P.ps;
    const newPs=this.P.Ia*spinRate;
    const deltaPs=newPs-oldPs;
    if(Math.abs(deltaPs)<=1e-15){ this.P.s0=spinRate; return before; }
    const deltaL=scale(before.n_w,deltaPs);
    this.P.s0=spinRate;
    this.P.ps=newPs;
    // Live spin is an internal wheel/body actuation: the drive changes the
    // wheel's axial angular momentum by DeltaL_control, while the reaction on
    // the human is obtained from the same constrained angular-momentum
    // equations already used by evaluate().  Therefore the conserved system
    // state L0 is NOT changed by the spin command.
    //
    // Free: L0 is the complete world angular momentum, so changing p_s forces
    // an equal-and-opposite change in L_body at fixed theta/thetaDot.
    // VerticalBearing: L0 is the conserved Z component; the bearing absorbs
    // the horizontal part of the wheel-drive torque, while the Z component
    // changes the body's yaw rate through the existing closed-form equation.
    // At theta=0 the latter coupling is correctly zero: the bearing can take
    // the entire horizontal drive torque without changing body yaw.
    //
    // The control is still recorded in L_control/W_control for diagnostics,
    // but it is no longer marked as an external angular-momentum injection of
    // the whole person+wheel system.
    // Re-evaluate the instantaneous state without calling snapshot(), because
    // snapshot() also performs the energy-balance diagnostic.  The intervention
    // is not yet recorded in W_control at this point, so using snapshot() here
    // would create a false transient warning.
    const [thNow, thdNow, thddNow] = this.plan.eval(this.st.t + 1e-12);
    const afterEnergy = evaluate(this.ctx, this.st.q, thNow, thdNow, thddNow, this.st.L0).T;
    const deltaW=afterEnergy-before.T;
    this.st.W_control += deltaW;
    this.st.L_control=add(this.st.L_control,deltaL);
    this.st.lastControl={type:'spin-rate',spinRate,deltaL:[...deltaL],deltaW,external:false,internal:true};
    return this.snapshot();
  }

  setWheelInertia(Ia){
    if(!(Number.isFinite(Ia)&&Ia>0)) throw new Error('Ia must be > 0');
    const maxIa=this.P.m_w*(this.P.D/2)**2;
    const applied=Math.min(Ia,maxIa);
    const oldIa=this.P.Ia;
    if(Math.abs(applied-oldIa)<=1e-15) return this.snapshot();
    const before=this.snapshot();
    const ps=this.P.ps;
    this.P.Ia=applied;
    this.P.It=this.P.kt*applied;
    this.P.ps=ps;
    this.P.R=this.P.D/2;
    const after=this.snapshot();
    this.st.W_parameter += after.T-before.T;
    return this.snapshot();
  }

  setWheelMass(m_w){
    if(!(Number.isFinite(m_w)&&m_w>0)) throw new Error('m_w must be > 0');
    const before=this.snapshot();
    const oldMass=this.P.m_w;
    const targetIa=wheelRingInertia(m_w,this.P.D);
    if(Math.abs(m_w-oldMass)<=1e-15 && Math.abs(this.P.Ia-targetIa)<=1e-15) return before;
    // When the simulation is stopped/paused, parameter edits define the new
    // initial/control environment, so the configured spin stays fixed and
    // p_s = I_a * s0 changes with inertia. While running, preserve the wheel's
    // physical spin angular momentum p_s and adjust s0 accordingly.
    const preservedPs=this.P.ps;
    this.P.m_w=m_w;
    this.P.mu=this.P.m_p*this.P.m_w/(this.P.m_p+this.P.m_w);
    this.P.Ia=wheelRingInertia(this.P.m_w,this.P.D);
    this.P.It=this.P.kt*this.P.Ia;
    if(this.lifecycleStatus==='running'){
      this.P.ps=preservedPs;
      this.P.s0=this.P.Ia>0 ? preservedPs/this.P.Ia : 0;
    } else {
      this.P.ps=this.P.Ia*this.P.s0;
    }
    const [thNow, thdNow, thddNow] = this.plan.eval(this.st.t + 1e-12);
    const afterEnergy = evaluate(this.ctx, this.st.q, thNow, thdNow, thddNow, this.st.L0).T;
    this.st.W_parameter += afterEnergy-before.T;
    this.st.lastControl={type:'parameter-change',parameter:'m_w',m_w:this.P.m_w,Ia:this.P.Ia,external:true};
    return this.snapshot();
  }

  setWheelDiameter(D){
    if(!(Number.isFinite(D)&&D>0)) throw new Error('D must be > 0');
    const before=this.snapshot();
    const targetIa=wheelRingInertia(this.P.m_w,D);
    if(Math.abs(D-this.P.D)<=1e-15 && Math.abs(this.P.Ia-targetIa)<=1e-15) return before;
    const preservedPs=this.P.ps;
    this.P.D=D;
    this.P.R=D/2;
    this.P.Ia=wheelRingInertia(this.P.m_w,this.P.D);
    this.P.It=this.P.kt*this.P.Ia;
    if(this.lifecycleStatus==='running'){
      this.P.ps=preservedPs;
      this.P.s0=this.P.Ia>0 ? preservedPs/this.P.Ia : 0;
    } else {
      this.P.ps=this.P.Ia*this.P.s0;
    }
    const [thNow, thdNow, thddNow] = this.plan.eval(this.st.t + 1e-12);
    const afterEnergy = evaluate(this.ctx, this.st.q, thNow, thdNow, thddNow, this.st.L0).T;
    this.st.W_parameter += afterEnergy-before.T;
    this.st.lastControl={type:'parameter-change',parameter:'D',D:this.P.D,Ia:this.P.Ia,external:true};
    return this.snapshot();
  }

  setIncludeHuman(includeHuman){
    const next = Boolean(includeHuman);
    if (next === this.includeHuman) return this.snapshot();
    const before = this.snapshot();
    const [th, thd] = this.plan.eval(this.st.t + 1e-12);
    const oldOmega = [...before.Omega_b];
    this.includeHuman = next;
    this.P.includeHuman = next;
    this.ctx = makeContext(this.P, this.mode, next);
    // Keep the instantaneous kinematics (q, theta and Omega_b) while changing
    // only the physical idealization. Rebuild the conserved quantity from that
    // same instantaneous state so subsequent evolution uses the new model.
    this.st.L0 = initL0(this.ctx, this.st.q, th, oldOmega, thd);
    const [thNow, thdNow, thddNow] = this.plan.eval(this.st.t + 1e-12);
    const afterEnergy = evaluate(this.ctx, this.st.q, thNow, thdNow, thddNow, this.st.L0).T;
    this.st.W_parameter += afterEnergy - before.T;
    this.st.lastControl = { type:'parameter-change', parameter:'includeHuman', includeHuman:next, external:true };
    return this.snapshot();
  }

  getParameters(){
    return {D:this.P.D,R:this.P.R,Ia:this.P.Ia,m_w:this.P.m_w,s0:this.P.s0,kt:this.P.kt,ps:this.P.ps,It:this.P.It,includeHuman:this.includeHuman};
  }
  _stepFixed(){
    const t=this.st.t, dt=this.P.dt;
    const pts=[t,...this.plan.breakpoints(t,t+dt),t+dt];
    for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];const ac=this.plan.eval((a+b)/2)[2];stepRK4(this.ctx,this.st,this.plan,b-a,a,ac);}
    this.st.t=t+dt;
  }
  step(frameDt){
    if(!(Number.isFinite(frameDt)&&frameDt>=0)) throw new Error('frameDt must be finite and >= 0');
    const used=Math.min(frameDt,this.P.frame_dt_max); if(frameDt>this.P.frame_dt_max)this.warnings.push({type:'frame-clamped',frameDt,used});
    this.acc+=used; let steps=0;
    while(this.acc+1e-15>=this.P.dt){this._stepFixed();this.acc-=this.P.dt;steps++;}
    this.lastFrameDt=used; return {steps,alpha:this.acc/this.P.dt,...this.snapshot()};
  }
  snapshot(){
    const [th,thd,thdd]=this.plan.eval(this.st.t+1e-12);const e=evaluate(this.ctx,this.st.q,th,thd,thdd,this.st.L0);if(this.T0===null)this.T0=e.T;
    const balance=e.T-this.T0-this.st.W_act-this.st.W_control-this.st.W_parameter; if(Math.abs(balance)>1e-6*Math.max(1,Math.abs(e.T)))this.warnings.push({type:'energy-balance',value:balance});
    const torqueWarning=Math.abs(e.tau_h)>this.P.tau_h_warn;
    const R=qR(this.st.q);
    return {t:this.st.t,q:[...this.st.q],theta:th,theta_target:this.target,thetaDot:thd,thetaDdot:thdd,Omega_b:[...e.Om_b],Omega_w:expressInWorldFrame(this.st.q,e.omega_w),n_w:[...e.n_w],L_wheel:e.L_wheel_b,L_body:e.L_body_b,L_total:e.L_tot_w,L_wheel_body:e.L_wheel_b,L_body_body:e.L_body_b,L_total_body:e.L_tot_b,L_wheel_world:expressInWorldFrame(this.st.q,e.L_wheel_b),L_body_world:expressInWorldFrame(this.st.q,e.L_body_b),L_total_world:e.L_tot_w,T:e.T,W_act:this.st.W_act,W_control:this.st.W_control,W_parameter:this.st.W_parameter,L_control:[...this.st.L_control],external_control:this.st.lastControl ? {...this.st.lastControl, ...(this.st.lastControl.deltaL ? {deltaL:[...this.st.lastControl.deltaL]} : {})} : null,human:{mass:this.P.m_p,inertia:[...this.P.Ip]},inertiaMatrices:{Istar:Istar(this.P,this.mode,this.includeHuman),Ic:Ic(this.P,this.mode,th,this.includeHuman)},params:{D:this.P.D,R:this.P.R,Ia:this.P.Ia,m_w:this.P.m_w,s0:this.P.s0,mu:this.P.mu,includeHuman:this.includeHuman},tau_h:e.tau_h,tau_react:e.tau_react_b,tau_bearing:this.mode==='VerticalBearing'?e.tau_ext_w:[0,0,0],tau_h_warning:torqueWarning,warnings:[...this.warnings]};
  }
}

const math={dot,norm,cross,add,sub,scale,matVec,matMul,transpose,solve3};
export {createParams,validateParams,makeContext,frame,Istar,Ic,dIc,Plan,omega,evaluate,run,initialState,AngularMomentumEngine,qmul,qnorm,qR,qdot,qAngle,qAxisAngle,expressInWorldFrame,expressInBodyFrame,wheelRingInertia,math};
