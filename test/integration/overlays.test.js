import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { AxesOverlay } from '../../src/render/AxesOverlay.js';
import { PhysicsVectorsOverlay } from '../../src/render/PhysicsVectorsOverlay.js';
import { PhysicsLawsOverlay } from '../../src/render/PhysicsLawsOverlay.js';

class FakeVector3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} normalize(){const n=Math.hypot(this.x,this.y,this.z)||1;this.x/=n;this.y/=n;this.z/=n;return this;} }
class FakeArrow { constructor(dir,origin,length,color){this.direction=dir;this.position=origin;this.length=length;this.color=color;this.visible=true;} setDirection(v){this.direction=v;} setLength(v){this.length=v;} }
class FakeGroup { constructor(){this.children=[];this.visible=true;} add(...x){this.children.push(...x);} clear(){this.children=[];} }
const THREE={Group:FakeGroup,ArrowHelper:FakeArrow,Vector3:FakeVector3};
class FakeElement { constructor(){this.children=[];this.style={};this.textContent='';} appendChild(x){this.children.push(x);} append(...x){this.children.push(...x);} setAttribute(){} remove(){this.removed=true;} }
class FakeDocument { createElement(){return new FakeElement();} }

test('3N-O1 — ejes son independientes y pueden ocultarse',()=>{
  const a=new AxesOverlay({three:THREE,document:null});
  assert.equal(a.visible,false); a.setVisible(true); assert.equal(a.visible,true); assert.equal(a.object.visible,true); a.setVisible(false); assert.equal(a.object.visible,false);
  assert.equal(a._items.length,6); // ±X ±Y ±Z
  assert.equal(a.length,2.25);
});

test('3N-O2 — vectores físicos usan los vectores del snapshot y origen de rueda',()=>{
  const v=new PhysicsVectorsOverlay({three:THREE,document:null});
  const state={q:[1,0,0,0],n_w:[1,0,0],Omega_w:[40,0,0],Omega_b:[0,0,0],L_wheel_body:[12,0,0],L_body_body:[0,0,0]};
  const visual={wheelPosition:{x:2,y:3,z:4},personPosition:{x:0,y:0.9,z:0}};
  v.update(state,visual);
  const a=v.arrows.get('wheelL');
  assert.equal(a.position.x,2); assert.equal(a.position.y,3); assert.equal(a.position.z,4); assert.ok(a.length>0);
  assert.deepEqual([a.direction.x,a.direction.y,a.direction.z],[0,0,1]);
});

test('3N-O3 — leyes físicas son un overlay independiente',()=>{
  const d=new FakeDocument(); const mount=new FakeElement(); const laws=new PhysicsLawsOverlay({document:d,mount});
  assert.equal(laws.visible,true); const lawText=laws.content.children.map(section => section.children?.map(x=>x.textContent).join(' ') ?? section.textContent).join(' ');
  assert.match(lawText,/ω = dθ\/dt/);
  assert.match(lawText,/𝑳 = Iω/);
  assert.match(lawText,/I = Σ mᵢrᵢ²/);
  assert.match(lawText,/I = ∫ r² dm/);
  assert.match(lawText,/τ = d𝑳\/dt/);
  assert.match(lawText,/τ_ext = 0/);
  assert.doesNotMatch(lawText,/W_act|L_total|W_control|W_parameter/); laws.setVisible(false); assert.equal(laws.visible,true); assert.equal(laws.root.style.display,'block');
});

test('3N.1-O4 — vectores usan lenguaje de física y no nombres internos',()=>{
  const v=new PhysicsVectorsOverlay({three:THREE,document:null});
  assert.deepEqual([...v.arrows.keys()],['wheelOmega','wheelL','bodyOmega','bodyL','wheelLX','wheelLY','wheelLZ','bodyLX','bodyLY','bodyLZ']);
  assert.equal(v.arrows.has('L_total'),false);
  assert.equal(v.arrows.has('wheelOmega'),true); assert.equal(v.arrows.has('wheelL'),true);
  assert.equal(v.arrows.has('bodyOmega'),true); assert.equal(v.arrows.has('bodyL'),true);
  assert.equal(v.arrows.has('n_w'),false); assert.equal(v.arrows.has('omega_spin'),false);
  assert.equal(v.arrows.has('Omega_w'),false);
  assert.equal(v.arrows.has('Omega_spin'),false);
  assert.equal(v.arrows.has('n_w'),false);
});

test('3N.1-O5 — ejes no contienen Z corporal',()=>{
  const a=new AxesOverlay({three:THREE,document:null});
  assert.equal(a._items.length,6);
  assert.doesNotMatch(a._labels.map(item=>item.text).join(' '),/Z_body/);
});


test('3N.3-V1 — la escala visual de vectores humanos no modifica el estado físico',()=>{
  const v = new PhysicsVectorsOverlay({three:THREE, document:new FakeDocument(), humanVectorVisualScale:0.30});
  const state={q:[1,0,0,0],Omega_w:[2,0,0],Omega_b:[0,0,3],L_wheel_body:[4,0,0],L_body_body:[0,0,5]};
  const visual={wheelPosition:{x:0,y:0,z:0},personPosition:{x:0,y:0.9,z:0}};
  v.update(state,visual);
  assert.equal(v.humanVectorVisualScale,0.30);
  assert.deepEqual(state.L_body_body,[0,0,5]);
  assert.deepEqual(state.Omega_b,[0,0,3]);
});

test('3N.6-B1 — etiquetas de vectores usan textura de alta resolución y menor escala visual',async()=>{
  const source = await readFile(new URL('../../src/render/PhysicsVectorsOverlay.js', import.meta.url), 'utf8');
  assert.match(source, /resolutionScale = 3/);
  assert.match(source, /canvas\.width = 300 \* resolutionScale/);
  assert.match(source, /canvas\.height = 52 \* resolutionScale/);
  assert.match(source, /sprite\.scale\.set\(1\.15,0\.20,1\)/);
  assert.match(source, /LinearFilter/);
});
