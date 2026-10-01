/**
 * Physics -> presentation bridge.
 *
 * Physics uses X=lateral, Y=forward, Z=up. Three.js presentation uses
 * X=forward, Y=up, Z=lateral. The fixed basis rotation below converts between
 * those coordinate conventions without changing the physical state.
 *
 * The motor's r_w remains the physical center used by the dynamics. For the
 * presentation only, an explicit wheelForwardOffset moves the represented
 * wheel/eje forward when the wheel envelope would intersect the torso. The
 * person stays at a fixed platform-relative position; the offset is therefore
 * a geometric presentation parameter, not a change to the conservation model.
 */
class PhysicsVisualAdapter {
  constructor(options = {}) {
    if (options === null || typeof options !== 'object') throw new TypeError('options must be an object');

    const r_w = options.r_w ?? [0, 0.60, 0.40];
    if (!Array.isArray(r_w) || r_w.length !== 3 || r_w.some(value => !Number.isFinite(value))) {
      throw new TypeError('r_w must be an array of three finite numbers');
    }
    this.r_w = [...r_w];
    this.bodyOriginY = options.bodyOriginY ?? 0.90;
    this.bodyForwardRadius = options.bodyForwardRadius ?? 0.20;
    this.wheelRimTubeRadius = options.wheelRimTubeRadius ?? 0.045;
    if (!Number.isFinite(this.bodyOriginY)) throw new TypeError('bodyOriginY must be finite');
    if (!(Number.isFinite(this.bodyForwardRadius) && this.bodyForwardRadius > 0)) throw new TypeError('bodyForwardRadius must be > 0');
    if (!(Number.isFinite(this.wheelRimTubeRadius) && this.wheelRimTubeRadius >= 0)) throw new TypeError('wheelRimTubeRadius must be >= 0');
    this.reset();
  }

  update(physicsState, presentation = {}) {
    this._validatePhysicsState(physicsState);

    const [w, x, y, z] = physicsState.q;
    const personQuaternion = this._toVisualQuaternion([w, x, y, z]);

    const theta = Number.isFinite(presentation.thetaOverride) ? presentation.thetaOverride : physicsState.theta;
    const nBody = [Math.cos(theta), 0, Math.sin(theta)];
    const tBody = [-Math.sin(theta), 0, Math.cos(theta)];
    const hBody = [0, -1, 0];

    // thetaEffective is the single presentation source of truth whenever a
    // paused/stopped theta target is being shown. Reconstruct the body axis
    // from that theta and rotate it with the physical body quaternion.
    const nWorld = this._rotateVectorByQuaternion(nBody, physicsState.q);
    const nVisual = this._toVisualVector(nWorld);
    const tWorld = this._rotateVectorByQuaternion(tBody, physicsState.q);
    const hWorld = this._rotateVectorByQuaternion(hBody, physicsState.q);
    const tVisual = this._toVisualVector(tWorld);
    const hVisual = this._toVisualVector(hWorld);

    const wheelQuaternion = this._basisToQuaternion(nVisual, tVisual, hVisual);
    const diameter = physicsState.params?.D ?? 0.68;
    const wheelEnvelopeRadius = diameter * 0.5 + this.wheelRimTubeRadius;

    // Body +Y is the person's forward direction (visual +X). The wheel disk
    // spans this direction by its full radius, so this is the explicit
    // non-intersection condition used for the presentation geometry:
    //   wheelCenterForward - wheelEnvelopeRadius >= bodyForwardRadius.
    // r_w[1] is the original physical forward separation. The offset is zero
    // until the condition is needed and then grows linearly with D.
    const wheelForwardOffset = Math.max(
      0,
      this.bodyForwardRadius + wheelEnvelopeRadius - this.r_w[1]
    );
    const wheelCenterBody = this._add(this.r_w, [0, wheelForwardOffset, 0]);
    const wheelPositionWorld = this._rotateVectorByQuaternion(wheelCenterBody, physicsState.q);

    // Presentation-only grip geometry.  The axle center and final world-space
    // axis above are the only inputs: each hand is placed directly on that
    // current axis, with a fixed offset along it.  There is no independent
    // body/arm angle, accumulated arm phase, previous-frame position, or time
    // interpolation in this calculation.
    const axleHalfSpan = 1.05 * 0.5;
    const gripHalfSpan = Math.max(0.30, Math.min(axleHalfSpan, diameter * 0.44));
    const leftGripWorld = this._add(wheelPositionWorld, this._scale(nWorld, gripHalfSpan));
    const rightGripWorld = this._add(wheelPositionWorld, this._scale(nWorld, -gripHalfSpan));
    const leftGripVisual = this._toVisualVector(leftGripWorld);
    const rightGripVisual = this._toVisualVector(rightGripWorld);
    const leftGripLocal = this._inverseRotateVectorByQuaternion(
      leftGripVisual,
      [personQuaternion.w, personQuaternion.x, personQuaternion.y, personQuaternion.z]
    );
    const rightGripLocal = this._inverseRotateVectorByQuaternion(
      rightGripVisual,
      [personQuaternion.w, personQuaternion.x, personQuaternion.y, personQuaternion.z]
    );

    const axialSpinRate = this._dot(physicsState.Omega_w, physicsState.n_w);
    if (this._lastPhysicsTime !== null) {
      const dt = physicsState.t - this._lastPhysicsTime;
      if (dt < -1e-12) throw new RangeError('physicsState.t must be monotonic for visual spin');
      this._spinAngle += 0.5 * (this._lastSpinRate + axialSpinRate) * Math.max(0, dt);
    }
    this._lastPhysicsTime = physicsState.t;
    this._lastSpinRate = axialSpinRate;

    const wheelPosition = this._toVisualVector(wheelPositionWorld);
    const bodyOrigin = { x: 0, y: this.bodyOriginY, z: 0 };

    this._visualState = {
      quaternion: { ...personQuaternion },
      personQuaternion: { ...personQuaternion },
      wheelQuaternion: { ...wheelQuaternion },
      personPosition: { ...bodyOrigin },
      wheelPosition: { x: wheelPosition[0], y: wheelPosition[1] + bodyOrigin.y, z: wheelPosition[2] },
      // Grip coordinates are visual-world coordinates, just like wheelPosition.
      // Include the fixed platform-relative body origin so hands and wheel share
      // exactly the same world frame before PersonVisual converts them to local.
      gripPositions: {
        left: { x: leftGripVisual[0], y: leftGripVisual[1] + bodyOrigin.y, z: leftGripVisual[2] },
        right: { x: rightGripVisual[0], y: rightGripVisual[1] + bodyOrigin.y, z: rightGripVisual[2] }
      },
      // These are body-local coordinates of the final world-space axle grips.
      // SimulationLoop passes them directly to PersonVisual, so Three.js applies
      // the body's quaternion exactly once through the person root.
      gripPositionsLocal: {
        left: { x: leftGripLocal[0], y: leftGripLocal[1], z: leftGripLocal[2] },
        right: { x: rightGripLocal[0], y: rightGripLocal[1], z: rightGripLocal[2] }
      },
      wheelForwardOffset,
      wheelSpinAngle: this._spinAngle,
      wheelDiameter: diameter,
      theta,
      n_w: [...physicsState.n_w]
    };

    return this.getVisualState();
  }

  getVisualState() {
    return structuredClone(this._visualState);
  }

  reset() {
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    const resetWheelPosition = this._toVisualVector(this.r_w);
    this._spinAngle = 0;
    this._lastPhysicsTime = null;
    this._lastSpinRate = 0;
    this._visualState = {
      quaternion: { ...identity },
      personQuaternion: { ...identity },
      personPosition: { x: 0, y: this.bodyOriginY, z: 0 },
      wheelQuaternion: { ...identity },
      wheelPosition: { x: resetWheelPosition[0], y: resetWheelPosition[1] + this.bodyOriginY, z: resetWheelPosition[2] },
      gripPositions: { left: { x: 0.65, y: 0.4, z: 0.3 }, right: { x: 0.65, y: 0.4, z: -0.3 } },
      gripPositionsLocal: { left: { x: 0.65, y: 0.4, z: 0.3 }, right: { x: 0.65, y: 0.4, z: -0.3 } },
      wheelForwardOffset: 0,
      wheelSpinAngle: this._spinAngle,
      wheelDiameter: 0.68,
      theta: 0,
      n_w: [1, 0, 0]
    };
    return this.getVisualState();
  }

  _toVisualQuaternion(qPhysics) {
    // Fixed coordinate-basis rotation: Xp->Zv, Yp->Xv, Zp->Yv.
    const s = [0.5, -0.5, -0.5, -0.5];
    const sInv = [s[0], -s[1], -s[2], -s[3]];
    return this._qToObject(this._qMultiply(this._qMultiply(s, qPhysics), sInv));
  }

  _toVisualVector(vector) {
    return [vector[1], vector[2], vector[0]];
  }

  _subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  _inverseRotateVectorByQuaternion(vector, quaternion) {
    const [w, x, y, z] = quaternion;
    return this._rotateVectorByQuaternion(vector, [w, -x, -y, -z]);
  }

  _rotateVectorByQuaternion(vector, quaternion) {
    const vq = [0, vector[0], vector[1], vector[2]];
    const qc = [quaternion[0], -quaternion[1], -quaternion[2], -quaternion[3]];
    const rotated = this._qMultiply(this._qMultiply(quaternion, vq), qc);
    return rotated.slice(1);
  }

  _basisToQuaternion(xAxis, yAxis, zAxis) {
    const m00 = xAxis[0], m01 = yAxis[0], m02 = zAxis[0];
    const m10 = xAxis[1], m11 = yAxis[1], m12 = zAxis[1];
    const m20 = xAxis[2], m21 = yAxis[2], m22 = zAxis[2];
    const trace = m00 + m11 + m22;
    let q;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      q = [0.25 / s, (m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s];
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      q = [(m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s];
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      q = [(m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s];
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s];
    }

    const length = Math.hypot(...q);
    return this._qToObject(q.map(value => value / length));
  }

  _dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  _add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  _scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }

  _qMultiply(a, b) {
    const [aw, ax, ay, az] = a;
    const [bw, bx, by, bz] = b;
    return [
      aw * bw - ax * bx - ay * by - az * bz,
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw
    ];
  }

  _qToObject([w, x, y, z]) { return { x, y, z, w }; }

  _validatePhysicsState(physicsState) {
    if (!physicsState || typeof physicsState !== 'object') throw new TypeError('physicsState must be an object');
    if (!Array.isArray(physicsState.q) || physicsState.q.length !== 4 || physicsState.q.some(value => !Number.isFinite(value))) {
      throw new TypeError('q must be an array of four finite numbers');
    }
    if (!Number.isFinite(physicsState.t)) throw new TypeError('physicsState.t must be a finite number');
    if (!Array.isArray(physicsState.Omega_w) || physicsState.Omega_w.length !== 3 || physicsState.Omega_w.some(value => !Number.isFinite(value))) {
      throw new TypeError('physicsState.Omega_w must be an array of three finite numbers');
    }
    if (physicsState.params && (!Number.isFinite(physicsState.params.D) || physicsState.params.D <= 0)) {
      throw new TypeError('physicsState.params.D must be > 0');
    }
    if (!Number.isFinite(physicsState.theta)) throw new TypeError('theta must be a finite number');
    if (!Array.isArray(physicsState.n_w) || physicsState.n_w.length !== 3 || physicsState.n_w.some(value => !Number.isFinite(value))) {
      throw new TypeError('n_w must be an array of three finite numbers');
    }
  }
}

export { PhysicsVisualAdapter };
export default PhysicsVisualAdapter;
