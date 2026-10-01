import test from 'node:test';
import assert from 'node:assert/strict';
import {createParams, makeContext, evaluate, run, Plan, Ic, Istar, frame, math, qAngle} from '../src/index.js';

const pi=Math.PI, near=(a,b,t=1e-9,msg='')=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${msg}: ${a} vs ${b}`);
const vecNear=(a,b,t=1e-9,msg='')=>a.forEach((x,i)=>near(x,b[i],t,`${msg}[${i}]`));
const P=createParams(); const q0=[1,0,0,0];

function brute(P,th,thd,Om,N=720){
  const {n,t,h}=frame(th), y=[0,1,0], R=P.D/2, s=P.ps/P.Ia, wrel=s-math.dot(n,Om);
  const [Ixx,Iyy,Izz]=P.Ip; const A=(Iyy+Izz-Ixx)/2,B=(Ixx+Izz-Iyy)/2,C=(Ixx+Iyy-Izz)/2, mm=P.m_p/6;
  const ax=Math.sqrt(A/(2*mm)),ay=Math.sqrt(B/(2*mm)),az=Math.sqrt(C/(2*mm));
  const pts=[],ms=[]; for(const sg of [1,-1]){pts.push([sg*ax,0,0],[0,sg*ay,0],[0,0,sg*az]);ms.push(mm,mm,mm);}
  for(let k=0;k<N;k++){const ph=2*pi*k/N;pts.push(P.r_w.map((v,i)=>v+R*(Math.cos(ph)*y[i]+Math.sin(ph)*t[i])));ms.push(P.m_w/N);}
  const M=ms.reduce((a,b)=>a+b,0),cm=[0,0,0]; for(let k=0;k<ms.length;k++)for(let i=0;i<3;i++)cm[i]+=ms[k]*pts[k][i]/M;
  let L=[0,0,0],T=0; for(let k=0;k<ms.length;k++){const r=pts[k].map((v,i)=>v-cm[i]);let v=math.cross(Om,r);if(k>=6)v=math.add(v,math.cross(math.add(math.scale(h,thd),math.scale(n,wrel)),pts[k].map((x,i)=>x-P.r_w[i])));L=math.add(L,math.scale(math.cross(r,v),ms[k]));T+=0.5*ms[k]*math.dot(v,v);} return {L,T};
}

test('T1 — oráculo de partículas',()=>{
  const P1=createParams({Ia:3*0.34**2});
  for(let k=0;k<8;k++){const th=-pi/2+(pi*k/7),thd=-1.2+0.3*k,Om=[0.7*Math.sin(k),-0.5+0.2*k,1.1];const b=brute(P1,th,thd,Om);const ctx=makeContext(P1,'Free'), n=frame(th).n,L=math.add(math.matVec(Ic(P1,'Free',th),Om),math.add(math.scale(n,P1.ps),math.scale(frame(th).h,P1.It*thd)));const e=evaluate(ctx,q0,th,thd,0,L);near(Math.max(...b.L.map((v,i)=>Math.abs(v-e.L_tot_b[i]))),0,1e-12,'L');near(b.T,e.T,1e-12,'T');}
});

test('T2 — VerticalBearing forma cerrada y simetría de signo',()=>{const r=run({mode:'VerticalBearing',target:-pi/2,tEnd:6});const Izz=Istar(P,'VerticalBearing')[2][2];for(const s of r.rec){const expected=(r.L0-P.ps*Math.sin(s.theta))/(Izz+P.It*Math.cos(s.theta)**2);near(s.Om_b[2],expected,1e-10,'Omega_z');}const rm=run({mode:'VerticalBearing',params:createParams({s0:-40}),target:0,tEnd:4});near(rm.rec.at(-1).Om_b[2],-P.ps/(Izz+P.It),1e-10,'sign');});

test('T3 — normas, coherencia y conservación',()=>{const r=run({mode:'Free',target:-pi/2,tEnd:6});for(const s of r.rec){near(Math.hypot(...s.q),1,1e-12,'q');vecNear(s.L_tot_b,math.add(s.L_wheel_b,s.L_body_b),1e-12,'L split');vecNear(s.L_tot_w,r.L0,1e-12,'L conserved');}});

test('T4 — giróstato y eje intermedio',()=>{const r=run({mode:'Free',target:pi/6,theta0:pi/6,Omega0:[0.3,-0.2,2],tEnd:20});const T0=r.rec[0].T;for(const s of r.rec){near(s.T,T0,1e-9,'T gyrostat');vecNear(s.L_tot_w,r.L0,1e-9,'L gyrostat');}
  const Pi=createParams(); Object.assign(Pi,{Ip:[1,2,3],m_w:1e-9,Ia:1e-9,kt:0,s0:0,r_w:[0,0,0],It:0,ps:0,mu:1e-9});const ri=run({mode:'Free',params:Pi,theta0:0,target:0,Omega0:[1e-6,1,-0.5773502691896257e-6],tEnd:5});const xs=ri.rec.filter(s=>s.t<4.5).map(s=>[s.t,Math.log(Math.abs(s.Om_b[0]))]);const n=xs.length;const mx=xs.reduce((a,b)=>a+b[0],0)/n,my=xs.reduce((a,b)=>a+b[1],0)/n;const lam=xs.reduce((a,b)=>a+(b[0]-mx)*(b[1]-my),0)/xs.reduce((a,b)=>a+(b[0]-mx)**2,0);near(lam,Math.sqrt(1/3),1e-3,'intermediate-axis growth');
});

test('T5 — balance de energía y trabajo del actuador',()=>{for(const mode of ['Free','VerticalBearing']){const r=run({mode,target:-pi/2,tEnd:6});let max=0;for(const s of r.rec)max=Math.max(max,Math.abs(s.T-s.T0-s.W_act));assert.ok(max<1e-6,`${mode} energy balance ${max}`);}});

test('T6 — torque externo: Free cero, VB horizontal y z=0',()=>{const rf=run({mode:'Free',target:-pi/2,tEnd:6});let mf=0;for(const s of rf.rec)mf=Math.max(mf,...s.tau_ext_w.map(Math.abs));assert.ok(mf<1e-9,`Free tau_ext ${mf}`);const rv=run({mode:'VerticalBearing',target:-pi/2,tEnd:6});let mz=0,mh=0;for(const s of rv.rec){mz=Math.max(mz,Math.abs(s.tau_ext_w[2]));mh=Math.max(mh,Math.hypot(s.tau_ext_w[0],s.tau_ext_w[1]));}assert.ok(mz<1e-9,`VB tau_z ${mz}`);assert.ok(mh>1,'VB horizontal reaction missing');});

test('T7 — reacción sobre el cuerpo y derivada numérica',()=>{const r=run({mode:'Free',target:-pi/2,tEnd:6});const dt=P.dt;let err=0;for(let i=1;i<r.rec.length-1;i++){const a=r.rec[i-1],b=r.rec[i+1];if(Math.abs(r.rec[i].t-.25)<3*dt||Math.abs(r.rec[i].t-2.0)<3*dt||Math.abs(r.rec[i].t-2.25)<3*dt)continue;
  const Rb=(q)=>{const [w,x,y,z]=q;return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]};
  const La=math.matVec(Rb(a.q),a.L_body_b),Lb=math.matVec(Rb(b.q),b.L_body_b),num=Lb.map((v,j)=>(v-La[j])/(2*dt)),react=math.matVec(Rb(r.rec[i].q),r.rec[i].tau_react_b);err=Math.max(err,...num.map((v,j)=>Math.abs(v-react[j])));
}assert.ok(err<6e-2,`reaction derivative ${err}`);});

test('T8 — integración RK4 converge con theta analítico',()=>{function sim(dt){const ctx=makeContext(P,'Free');const st= {q:[1,0,0,0],W_act:0,L0:null}; const A=80*pi/180,w=.8*pi; // lightweight direct stepping through prescribed path
  const th0=0,L=math.add(math.matVec(Ic(P,'Free',0),[0,0,0]),math.scale(frame(0).n,P.ps)); st.L0=L;let q=[1,0,0,0],W=0; const N=Math.round(4/dt); for(let k=0;k<N;k++){const t=k*dt; const evalAt=(qq,tt)=>{const th=A*Math.sin(w*tt),thd=A*w*Math.cos(w*tt),thdd=-A*w*w*Math.sin(w*tt);const e=evaluate(ctx,qq,th,thd,thdd,L);return {dq:[...e.Om_b],e};}; /* q RK4, W omitted */
    const f=(qq,tt)=>{const {e}=evalAt(qq,tt);return [e.Om_b.map((v,j)=>0.5*math.qdummy?.[j]??0),e]};
    // use small fixed RK4 helper inline
    const F=(qq,tt)=>{const th=A*Math.sin(w*tt),thd=A*w*Math.cos(w*tt),thdd=-A*w*w*Math.sin(w*tt),e=evaluate(ctx,qq,th,thd,thdd,L);const qd=[0,0,0,0];const [qw,qx,qy,qz]=qq,[ox,oy,oz]=e.Om_b;qd[0]=-.5*(qx*ox+qy*oy+qz*oz);qd[1]=.5*(qw*ox+qy*oz-qz*oy);qd[2]=.5*(qw*oy-qx*oz+qz*ox);qd[3]=.5*(qw*oz+qx*oy-qy*ox);return qd;};
    const k1=F(q,t),k2=F(math.add(q,math.scale(k1,dt/2)),t+dt/2),k3=F(math.add(q,math.scale(k2,dt/2)),t+dt/2),k4=F(math.add(q,math.scale(k3,dt)),t+dt);q=math.add(q,math.scale(math.add(math.add(k1,math.scale(k2,2)),math.add(math.scale(k3,2),k4)),dt/6));q=q.map(v=>v/Math.hypot(...q));}
  return q;}const ref=sim(1/960);const e=sim(1/240);assert.ok(qAngle(e,ref)<1e-6,`RK4 error ${qAngle(e,ref)}`);});

test('T9 — plan trapezoidal, límites, C1 y exactitud',()=>{const p=new Plan(0,pi/2,0,-pi/2,P);near(p.tEnd,2.25,1e-12,'duration');let prev=p.eval(0)[1],maxW=0,maxA=0;for(let k=0;k<=1000;k++){const t=p.tEnd*k/1000,[th,w,a]=p.eval(t);assert.ok(Math.abs(th)<=pi/2+1e-12);assert.ok(Math.abs(w)<=P.th_dot_max+1e-12);assert.ok(Math.abs(a)<=P.th_ddot_max+1e-12);maxW=Math.max(maxW,Math.abs(w));maxA=Math.max(maxA,Math.abs(a));prev=w;}const end=p.eval(p.tEnd);near(end[0],-pi/2,1e-12);near(end[1],0,1e-12);near(maxW,P.th_dot_max,1e-12);near(maxA,P.th_ddot_max,1e-12);});

test('T10 — convenciones de signo',()=>{const r=run({mode:'VerticalBearing',target:0,tEnd:4});near(r.rec.at(-1).Om_b[2],P.ps/(Istar(P,'VerticalBearing')[2][2]+P.It),1e-10);const rm=run({mode:'VerticalBearing',params:createParams({s0:-40}),target:0,tEnd:4});near(rm.rec.at(-1).Om_b[2],-P.ps/(Istar(P,'VerticalBearing')[2][2]+P.It),1e-10);});

test('T11 — límite It -> 0',()=>{const P0=createParams({kt:0.5,Ia:0.30});const ctx=makeContext(P0,'Free');const th=.37,thd=.8,thdd=-.4,Om=[.2,-.3,1.1],n=frame(th).n;const L=math.add(math.matVec(Istar(P0,'Free'),Om),math.scale(n,P0.ps));const Pz=createParams({kt:0.5,Ia:0.30});Pz.It=0;const ctxz=makeContext(Pz,'Free');const ez=evaluate(ctxz,q0,th,thd,thdd,L);const expected=math.solve3(Istar(Pz,'Free'),math.sub(L,math.scale(n,Pz.ps)));vecNear(ez.Om_b,expected,1e-12,'It=0 omega');vecNear(ez.L_wheel_b,math.scale(n,Pz.ps),1e-12,'It=0 wheel L');});

test('T12 — validación de parámetros',()=>{assert.throws(()=>createParams({Ia:0.4}),/Ia > m_w R\^2/);assert.throws(()=>createParams({kt:0.49}),/kt/);assert.throws(()=>createParams({m_p:0}),/m_p/);assert.throws(()=>createParams({m_w:0}),/m_w/);assert.throws(()=>createParams({Ip:[1,2,3]}),/triangle/);createParams({Ip:[1,2,2.5]});});
