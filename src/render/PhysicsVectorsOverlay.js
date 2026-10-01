/** Presentation-only physical vector overlay. */
class PhysicsVectorsOverlay {
  constructor({ three, document: doc = globalThis.document, vectorScale = 0.055, humanVectorVisualScale = 0.30, minLength = 0.35, maxLength = 2.0, contrast = false } = {}) {
    if (!three || typeof three !== 'object') throw new TypeError('three is required');
    const { Group, ArrowHelper, Vector3 } = three;
    if ([Group, ArrowHelper, Vector3].some(type => typeof type !== 'function')) throw new TypeError('three lacks vector constructors');
    this.three = three;
    this.document = doc;
    this.vectorScale = vectorScale;
    this.humanVectorVisualScale = humanVectorVisualScale;
    this.minLength = minLength;
    this.maxLength = maxLength;
    this.contrast = Boolean(contrast);
    this.object = new Group();
    this.arrows = new Map();
    this.labels = new Map();
    this.visible = false;
    for (const [key, label] of [
      ['wheelOmega', 'ω — rueda'],
      ['wheelL', '𝑳 — rueda'],
      ['bodyOmega', 'ω — humano'],
      ['bodyL', '𝑳 — humano']
    ]) this._addArrow(key, label, this.contrast ? 0xffffff : 0x222222);

    for (const owner of ['wheelL', 'bodyL']) {
      for (const axis of ['x','y','z']) this._addArrow(`${owner}${axis.toUpperCase()}`, '', this._axisColor(axis));
    }
    this.setVisible(false);
  }

  _axisColor(axis) {
    return { x: 0xe53935, y: 0x43a047, z: 0x1e88e5 }[axis];
  }

  _addArrow(key, label, color) {
    const arrow = new this.three.ArrowHelper(
      new this.three.Vector3(1,0,0),
      new this.three.Vector3(0,0,0),
      this.minLength,
      color,
      0.16,
      0.10
    );
    arrow.visible = false;
    this.object.add(arrow);
    this.arrows.set(key, arrow);
    this._addLabel(key, label, color);
  }

  update(state, visualState) {
    if (!state || !visualState) return;
    const q = state.q;
    const wheelOrigin = visualState.wheelPosition ?? {x:0,y:0,z:0};
    const bodyOrigin = visualState.personPosition ?? {x:0,y:0.9,z:0};

    const omegaWheelWorld = state.Omega_w;
    const omegaBodyWorld = this._rotateByQ(state.Omega_b, q);
    const LwheelBody = state.L_wheel_body ?? state.L_wheel;
    const LbodyBody = state.L_body_body ?? state.L_body;
    const LwheelWorld = this._rotateByQ(LwheelBody, q);
    const LbodyWorld = this._rotateByQ(LbodyBody, q);

    const entries = [
      ['wheelOmega', this._toVisual(omegaWheelWorld), wheelOrigin, true, this.vectorScale, this._signedOmegaLabel(omegaWheelWorld, state.n_w)],
      ['wheelL', this._toVisual(LwheelWorld), wheelOrigin, true, this.vectorScale, this._signedVectorLabel('𝑳', LwheelWorld)],
      ['bodyOmega', this._toVisual(omegaBodyWorld), bodyOrigin, this._norm(omegaBodyWorld) > 1e-12, this.humanVectorVisualScale, this._signedScalarLabel('ω', omegaBodyWorld)],
      ['bodyL', this._toVisual(LbodyWorld), bodyOrigin, this._norm(LbodyWorld) > 1e-12, this.humanVectorVisualScale, this._signedVectorLabel('𝑳', LbodyWorld)]
    ];
    for (const [key, vector, origin, visible, scale, labelText] of entries) {
      this._updateArrow(key, vector, origin, visible, scale);
      this._setLabelText(key, labelText);
    }

    this._updateComponents('wheelL', LwheelWorld, wheelOrigin, this.vectorScale);
    this._updateComponents('bodyL', LbodyWorld, bodyOrigin, this.humanVectorVisualScale);
  }

  _updateComponents(owner, vectorPhysics, origin, visualScale) {
    const eps = 1e-10;
    const components = [
      ['x', vectorPhysics[0]],
      ['y', vectorPhysics[1]],
      ['z', vectorPhysics[2]]
    ].filter(([, value]) => Math.abs(value) > eps);
    const keys = [`${owner}X`, `${owner}Y`, `${owner}Z`];
    const hasDecomposition = components.length >= 2;
    let current = [origin.x, origin.y, origin.z];
    const totalVisual = this._toVisual(vectorPhysics);
    const mag = this._norm(vectorPhysics);
    const totalLength = Math.max(this.minLength, Math.min(this.maxLength, mag * visualScale));
    const unitScale = mag > eps ? totalLength / mag : 0;

    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const entry = components.findIndex(([axis]) => axis === ['x','y','z'][i]);
      if (!hasDecomposition || entry < 0) {
        this._hideArrow(key);
        continue;
      }
      const axis = ['x','y','z'][i];
      const value = components[entry][1];
      const deltaPhysics = axis === 'x' ? [value,0,0] : axis === 'y' ? [0,value,0] : [0,0,value];
      const deltaVisual = this._toVisual(deltaPhysics).map(v => v * unitScale);
      const start = [...current];
      const end = [current[0] + deltaVisual[0], current[1] + deltaVisual[1], current[2] + deltaVisual[2]];
      this._updateSegmentArrow(key, start, end, this._axisColor(axis));
      current = end;
    }

    // The construction is deliberately scaled by the same factor as the
    // original L arrow, so its last endpoint coincides with the original tip.
    // The decomposition is a presentation aid only. Floating-point roundoff
    // must never be allowed to abort the animation/physics loop. The physical
    // vector itself remains the authoritative value; the component arrows are
    // reconstructed from that same vector and therefore may differ only by
    // floating-point roundoff at the final tip.
  }

  _updateSegmentArrow(key, start, end, color) {
    const arrow = this.arrows.get(key);
    if (!arrow) return;
    const dx = end[0]-start[0], dy = end[1]-start[1], dz = end[2]-start[2];
    const length = Math.hypot(dx,dy,dz);
    if (length < 1e-12) { this._hideArrow(key); return; }
    arrow.position.set(start[0], start[1], start[2]);
    arrow.setDirection(new this.three.Vector3(dx/length, dy/length, dz/length));
    arrow.setLength(length, Math.min(0.18,length*0.24), Math.min(0.10,length*0.14));
    arrow.visible = true;
  }


  _updateArrow(key, vector, origin, shouldShow, visualScale = this.vectorScale) {
    const arrow = this.arrows.get(key);
    if (!arrow) return;
    const mag = this._norm(vector);
    arrow.position.set(origin.x, origin.y, origin.z);
    if (!shouldShow || mag < 1e-12) {
      this._hideArrow(key);
      return;
    }
    arrow.visible = true;
    const label = this.labels.get(key);
    if (label) label.visible = true;
    const dir = new this.three.Vector3(vector[0]/mag, vector[1]/mag, vector[2]/mag);
    const length = Math.max(this.minLength, Math.min(this.maxLength, mag * visualScale));
    arrow.setDirection(dir);
    arrow.setLength(length, Math.min(0.18,length*0.24), Math.min(0.10,length*0.14));
    if (label) {
      const tipOffset = Math.min(0.035, Math.max(0.008, length * 0.025));
      label.position.set(origin.x+dir.x*(length+tipOffset), origin.y+dir.y*(length+tipOffset), origin.z+dir.z*(length+tipOffset));
    }
  }

  _hideArrow(key) {
    const arrow = this.arrows.get(key);
    if (arrow) arrow.visible = false;
    const label = this.labels.get(key);
    if (label) label.visible = false;
  }

  _signedOmegaLabel(omegaWorld, nWorld) {
    const spin = Array.isArray(nWorld) ? this._dot(omegaWorld, nWorld) : omegaWorld[this._dominantIndex(omegaWorld)];
    return Math.abs(spin) < 1e-10 ? 'ω0' : spin > 0 ? 'ω+' : 'ω−';
  }

  _dominantIndex(vector) {
    let index = 0;
    for (let i=1;i<3;i++) if (Math.abs(vector[i]) > Math.abs(vector[index])) index = i;
    return index;
  }

  _signedScalarLabel(base, vectorWorld) {
    const mag = this._norm(vectorWorld);
    if (mag < 1e-10) return `${base}0`;
    return `${base}${vectorWorld[this._dominantIndex(vectorWorld)] > 0 ? '+' : '−'}`;
  }

  _signedVectorLabel(base, vectorWorld) {
    const eps = 1e-10;
    const axes = ['x', 'y', 'z'];
    const components = axes
      .map((axis, index) => ({ axis, value: vectorWorld[index] }))
      .filter(({ value }) => Math.abs(value) > eps)
      .map(({ axis, value }) => `${value > 0 ? '+' : '-'}${axis}`);
    return components.length ? `${base}(${components.join(',')})` : `${base}(0)`;
  }

  _setLabelText(key, text) {
    const label = this.labels.get(key);
    if (!label || !this.document || typeof this.document.createElement !== 'function') return;
    const canvas = label.material?.map?.image;
    if (!canvas || !canvas.getContext) return;
    const resolutionScale = 3;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.setTransform?.(resolutionScale,0,0,resolutionScale,0,0);
    ctx.font = 'bold 21px sans-serif';
    ctx.fillStyle = this.contrast ? '#fff' : '#111';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text,5,32);
    ctx.restore();
    if (label.material?.map) label.material.map.needsUpdate = true;
  }

  _addLabel(key, text) {
    if (!this.three.Sprite || !this.three.SpriteMaterial || !this.three.CanvasTexture || !this.document) return;
    const resolutionScale = 3;
    const canvas = this.document.createElement('canvas');
    canvas.width = 300 * resolutionScale;
    canvas.height = 52 * resolutionScale;
    const ctx = canvas.getContext?.('2d'); if (!ctx) return;
    ctx.setTransform?.(resolutionScale, 0, 0, resolutionScale, 0, 0);
    ctx.font = 'bold 21px sans-serif';
    ctx.fillStyle = this.contrast ? '#fff' : '#111';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, 5, 32);
    const texture = new this.three.CanvasTexture(canvas);
    if ('minFilter' in texture && this.three.LinearFilter !== undefined) texture.minFilter = this.three.LinearFilter;
    if ('magFilter' in texture && this.three.LinearFilter !== undefined) texture.magFilter = this.three.LinearFilter;
    texture.needsUpdate = true;
    const sprite = new this.three.Sprite(new this.three.SpriteMaterial({map:texture,transparent:true}));
    sprite.scale.set(1.15,0.20,1);
    sprite.visible=false;
    this.object.add(sprite);
    this.labels.set(key,sprite);
  }

  _rotateByQ(vector,q){
    const [w,x,y,z]=q; const v=[0,...vector]; const qc=[w,-x,-y,-z];
    const mul=(a,b)=>[a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
    return mul(mul(q,v),qc).slice(1);
  }
  _toVisual(v){return [v[1],v[2],v[0]];}
  _norm(v){return Math.hypot(v[0],v[1],v[2]);}
  _dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  setVisible(visible){this.visible=Boolean(visible);this.object.visible=this.visible;}
  dispose(){for(const sprite of this.labels.values()) sprite.material?.map?.dispose?.(); this.object.clear?.();}
}

export { PhysicsVectorsOverlay };
export default PhysicsVectorsOverlay;
