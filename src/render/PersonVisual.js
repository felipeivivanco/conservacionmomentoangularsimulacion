/**
 * Minimal presentation model of a person.
 * The object's origin represents the physical body centre used by the motor;
 * physics orientation is supplied externally and this class does not calculate it.
 * All shading here is presentation-only and deliberately uses MeshBasicMaterial
 * so the model remains legible even when lighting is unavailable.
 */
class PersonVisual {
  constructor(options = {}) {
    if (options === null || typeof options !== 'object') throw new TypeError('options must be an object');
    const THREE = options.three;
    if (!THREE || typeof THREE !== 'object') throw new TypeError('options.three must be the Three.js module');
    const { Group, Mesh, SphereGeometry, CylinderGeometry, MeshBasicMaterial } = THREE;
    const astronaut = Boolean(options.astronaut);
    if ([Group, Mesh, SphereGeometry, CylinderGeometry, MeshBasicMaterial].some(type => typeof type !== 'function')) {
      throw new TypeError('options.three does not provide the required visual constructors');
    }

    this.object = new Group();
    this._three = THREE;
    this.disposed = false;
    this._resources = [];

    this.bodyOriginY = options.bodyOriginY ?? 0.90;
    if (this.object.position && typeof this.object.position.set === 'function') {
      this.object.position.set(0, this.bodyOriginY, 0);
    }

    const headRadius = options.headRadius ?? 0.20;
    const headY = options.headY ?? 0.72;
    const torsoRadius = options.torsoRadius ?? 0.17;
    const torsoHeight = options.torsoHeight ?? 0.78;
    const limbRadius = options.limbRadius ?? 0.065;
    const legLength = options.legLength ?? 0.63;
    const armLength = options.armLength ?? 0.65;
    const shoulderZ = options.shoulderZ ?? 0.16;
    const armY = options.armY ?? 0.40;
    const handRadius = options.handRadius ?? 0.075;
    const handX = options.handX ?? 0.65;
    const handZ = options.handZ ?? 0.30;
    // Presentation-only palette: torso and arms use a muted red; head, hands
    // and legs deliberately retain their existing blue family.
    const astronautBlue = options.faceColor ?? 0x4b78a8;
    const headMaterial = new MeshBasicMaterial({ color: options.headColor ?? (astronaut ? astronautBlue : 0x4b78a8) });
    const headShadeMaterial = astronaut ? null : new MeshBasicMaterial({ color: options.headShadeColor ?? 0x345777 });
    const torsoMaterial = new MeshBasicMaterial({ color: options.torsoColor ?? (astronaut ? 0x858b91 : 0x9a4a4a) });
    const torsoShadeMaterial = new MeshBasicMaterial({ color: options.torsoShadeColor ?? (astronaut ? 0x62686e : 0x733b3b) });
    const armMaterial = new MeshBasicMaterial({ color: options.armColor ?? (astronaut ? 0x858b91 : 0x9a4a4a) });
    const armShadeMaterial = new MeshBasicMaterial({ color: options.armShadeColor ?? (astronaut ? 0x62686e : 0x733b3b) });
    const legMaterial = new MeshBasicMaterial({ color: options.legColor ?? (astronaut ? 0x858b91 : 0x4b78a8) });
    const legShadeMaterial = new MeshBasicMaterial({ color: options.legShadeColor ?? (astronaut ? 0x62686e : 0x345777) });
    const handMaterial = new MeshBasicMaterial({ color: options.handColor ?? (astronaut ? 0x858b91 : 0x7f9fbd) });
    const eyeMaterial = new MeshBasicMaterial({ color: options.eyeColor ?? 0x17212b });
    const faceMaterial = astronaut ? new MeshBasicMaterial({ color: astronautBlue }) : null;
    this._resources.push(headMaterial, torsoMaterial, torsoShadeMaterial, armMaterial, armShadeMaterial, legMaterial, legShadeMaterial, handMaterial, eyeMaterial);
    if (headShadeMaterial) this._resources.push(headShadeMaterial);
    if (faceMaterial) this._resources.push(faceMaterial);

    const headGroup = new Group();
    headGroup.position.y = headY;
    const headGeometry = new SphereGeometry(headRadius, 16, 12);
    if (astronaut) this._configureAstronautHeadMaterials(headGeometry, headRadius);
    const head = new Mesh(headGeometry, astronaut ? [headMaterial, faceMaterial] : headMaterial);
    headGroup.add(head);

    // Eyes are children of the head, so they inherit exactly the same visual transform.
    const eyeRadius = options.eyeRadius ?? 0.025;
    const eyeForward = headRadius * (astronaut ? 1.03 : 0.92);
    const eyeSeparation = headRadius * 0.34;
    const leftEye = new Mesh(new SphereGeometry(eyeRadius, 10, 8), eyeMaterial);
    const rightEye = new Mesh(new SphereGeometry(eyeRadius, 10, 8), eyeMaterial);
    leftEye.position.set(eyeForward, 0.035, eyeSeparation);
    rightEye.position.set(eyeForward, 0.035, -eyeSeparation);
    headGroup.add(leftEye, rightEye);

    // The astronaut face is not a second surface. It is a material region of
    // the very same SphereGeometry used by the helmet. Keeping `face` as an
    // alias preserves the presentation API while guaranteeing one head mesh.
    const face = astronaut ? head : null;

    const torso = new Mesh(new CylinderGeometry(torsoRadius * 1.15, torsoRadius, torsoHeight, 12), torsoMaterial);
    torso.position.y = 0.13;
    const torsoShade = new Mesh(new CylinderGeometry(torsoRadius * 1.16, torsoRadius * 1.01, torsoHeight * 0.84, 12, 1, false, Math.PI, Math.PI), torsoShadeMaterial);
    torsoShade.position.y = torso.position.y;

    // In the visual convention X is forward and Z is lateral. The arms are
    // therefore aligned along +X so both hands meet the horizontal axle.
    const armCenterX = armLength / 2;
    const leftArm = this._createLimb(CylinderGeometry, Mesh, armMaterial, limbRadius, armLength, armCenterX, armY, shoulderZ);
    const rightArm = this._createLimb(CylinderGeometry, Mesh, armShadeMaterial, limbRadius, armLength, armCenterX, armY, -shoulderZ);

    const legCenterY = -0.425;
    const legLateralOffset = 0.09;
    const leftLeg = this._createLimb(CylinderGeometry, Mesh, legMaterial, limbRadius, legLength, 0, legCenterY, -legLateralOffset, 0);
    const rightLeg = this._createLimb(CylinderGeometry, Mesh, legShadeMaterial, limbRadius, legLength, 0, legCenterY, legLateralOffset, 0);

    const leftHand = new Mesh(new SphereGeometry(handRadius, 12, 8), handMaterial);
    leftHand.position.set(handX, armY, handZ);
    const rightHand = new Mesh(new SphereGeometry(handRadius, 12, 8), handMaterial);
    rightHand.position.set(handX, armY, -handZ);

    // Disable only the torso-specific shade mesh. Head, arms, hands and legs
    // keep their existing visual shading cues.
    torsoShade.visible = false;
    this.object.add(headGroup, torso, torsoShade, leftArm, rightArm, leftLeg, rightLeg, leftHand, rightHand);
    this._resources.push(
      head.geometry, leftEye.geometry, rightEye.geometry,
      torso.geometry, torsoShade.geometry,
      leftArm.geometry, rightArm.geometry,
      leftLeg.geometry, rightLeg.geometry,
      leftHand.geometry, rightHand.geometry
    );

    this.head = head;
    this.headGroup = headGroup;
    // Backward-compatible alias: the head shading is now a material region
    // of `head.geometry`, not a second mesh.
    this.headShade = head;
    this.leftEye = leftEye;
    this.rightEye = rightEye;
    this.face = face;
    this.torso = torso;
    this.torsoShade = torsoShade;
    this.leftArm = leftArm;
    this.rightArm = rightArm;
    this.leftLeg = leftLeg;
    this.rightLeg = rightLeg;
    this.leftHand = leftHand;
    this.rightHand = rightHand;
    this._armLength = armLength;
    this._shoulderLeft = { x: 0, y: armY, z: shoulderZ };
    this._shoulderRight = { x: 0, y: armY, z: -shoulderZ };
    this._legLateralOffset = legLateralOffset;
  }

  _configureAstronautHeadMaterials(geometry, radius) {
    if (!geometry || typeof geometry.clearGroups !== 'function' || typeof geometry.addGroup !== 'function' ||
        typeof geometry.getAttribute !== 'function') return;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex?.();
    if (!position || !index) return;

    geometry.clearGroups();
    const indices = index.array;
    let currentMaterial = null;
    let groupStart = 0;
    const flush = end => {
      if (currentMaterial === null || end <= groupStart) return;
      geometry.addGroup(groupStart, end - groupStart, currentMaterial);
    };
    const point = i => ({
      x: position.getX(i),
      y: position.getY(i),
      z: position.getZ(i)
    });

    for (let offset = 0; offset < indices.length; offset += 3) {
      const a = point(indices[offset]);
      const b = point(indices[offset + 1]);
      const c = point(indices[offset + 2]);
      const x = (a.x + b.x + c.x) / 3;
      const y = (a.y + b.y + c.y) / 3;
      const z = (a.z + b.z + c.z) / 3;
      const length = Math.hypot(x, y, z) || radius;
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;
      // The astronaut face is deliberately a square-ish UV-style patch on
      // the same sphere, not an angular/circular cap and not a second mesh.
      // Independent vertical/lateral bounds keep the silhouette approximately
      // square while nx > 0 rejects the rear hemisphere. The thresholds are
      // evaluated on the sphere's normalized surface coordinates, so the blue
      // material still follows the curvature of the original SphereGeometry.
      const faceRegion = nx >= 0.68 && Math.abs(ny) <= 0.38 && Math.abs(nz) <= 0.38;
      const materialIndex = faceRegion ? 1 : 0;
      if (currentMaterial === null) {
        currentMaterial = materialIndex;
        groupStart = offset;
      } else if (materialIndex !== currentMaterial) {
        flush(offset);
        currentMaterial = materialIndex;
        groupStart = offset;
      }
    }
    flush(indices.length);
  }

  _createLimb(CylinderGeometry, Mesh, material, radius, length, x, y, z) {
    const limb = new Mesh(new CylinderGeometry(radius, radius, length, 10), material);
    limb.position.set(x, y, z);
    // Arms start with the identity local transform. Every subsequent arm
    // orientation is reconstructed from shoulder -> hand in the current
    // frame; there is deliberately no persistent angular state.
    return limb;
  }

  setPosition(position) {
    if (this.disposed) throw new Error('PersonVisual is disposed');
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new TypeError('position must contain finite x, y, z');
    }
    if (!this.object.position || typeof this.object.position.set !== 'function') {
      throw new TypeError('object does not provide position.set()');
    }
    this.object.position.set(position.x, position.y, position.z);
  }

  setOrientation(quaternion) {
    if (this.disposed) throw new Error('PersonVisual is disposed');
    if (!quaternion || typeof quaternion !== 'object') throw new TypeError('quaternion must be an object');
    const { x, y, z, w } = quaternion;
    if (![x, y, z, w].every(Number.isFinite)) throw new TypeError('quaternion components must be finite numbers');
    this.object.quaternion.set(x, y, z, w);
  }

  setGripPositions({ left, right }) {
    if (this.disposed) throw new Error('PersonVisual is disposed');
    for (const [name, point] of [['left', left], ['right', right]]) {
      if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
        throw new TypeError(`${name} grip position must contain finite x, y, z`);
      }
    }
    const leftLocal = this._worldToLocal(left);
    const rightLocal = this._worldToLocal(right);
    this.setGripPositionsLocal({ left: leftLocal, right: rightLocal });
  }

  setGripPositionsLocal({ left, right }) {
    if (this.disposed) throw new Error('PersonVisual is disposed');
    for (const [name, point] of [['left', left], ['right', right]]) {
      if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
        throw new TypeError(`${name} local grip position must contain finite x, y, z`);
      }
    }
    // These points are already in the body-local frame. No world/local
    // conversion and no additional physical quaternion are applied here.
    this.leftHand.position.set(left.x, left.y, left.z);
    this.rightHand.position.set(right.x, right.y, right.z);
    this._placeLimb(this.leftArm, this._shoulderLeft, left);
    this._placeLimb(this.rightArm, this._shoulderRight, right);
  }

  _worldToLocal(point) {
    const dx = point.x - this.object.position.x;
    const dy = point.y - this.object.position.y;
    const dz = point.z - this.object.position.z;
    const q = this.object.quaternion;
    if (typeof this._three.Vector3 === 'function' && typeof q?.clone === 'function') {
      const vector = new this._three.Vector3(dx, dy, dz);
      const inverse = q.clone();
      if (typeof inverse.invert === 'function') return vector.applyQuaternion(inverse);
      if (typeof inverse.conjugate === 'function') return vector.applyQuaternion(inverse.conjugate());
    }
    const { x, y, z, w } = q;
    const vq = { w: 0, x: dx, y: dy, z: dz };
    const qi = { w, x: -x, y: -y, z: -z };
    const mul = (a,b) => ({
      w: a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z,
      x: a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
      y: a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
      z: a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w
    });
    const r = mul(mul(qi, vq), { w, x, y, z });
    return { x: r.x, y: r.y, z: r.z };
  }

  _placeLimb(limb, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 1e-12)) return;
    limb.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    if (limb.scale && typeof limb.scale.set === 'function') {
      limb.scale.set(1, length / this._armLength, 1);
    }
    if (limb.quaternion && typeof limb.quaternion.setFromUnitVectors === 'function') {
      const direction = { x: dx / length, y: dy / length, z: dz / length };
      if (typeof this._three.Vector3 === 'function') {
        const from = new this._three.Vector3(0, 1, 0);
        const to = new this._three.Vector3(direction.x, direction.y, direction.z);
        limb.quaternion.setFromUnitVectors(from, to);
      } else {
        limb.quaternion.setFromUnitVectors({ x: 0, y: 1, z: 0 }, direction);
      }
      // Three.js keeps quaternion and Euler rotation representations in sync.
      // Do not apply a second Euler rotation after this geometric orientation.
    }
  }

  setVisible(visible) {
    if (this.disposed) throw new Error('PersonVisual is disposed');
    this.object.visible = Boolean(visible);
  }

  dispose() {
    if (this.disposed) return;
    for (const resource of this._resources) if (resource && typeof resource.dispose === 'function') resource.dispose();
    this.disposed = true;
  }
}

export { PersonVisual };
export default PersonVisual;
