/**
 * Presentation-only wheel: rim, spokes and axle.
 * Local wheel X axis is the physical wheel axis; the wheel plane is local Y-Z.
 */
class WheelVisual {
  constructor(options = {}) {
    if (options === null || typeof options !== 'object') throw new TypeError('options must be an object');
    const THREE = options.three;
    if (!THREE || typeof THREE !== 'object') throw new TypeError('options.three must be the Three.js module');
    const { Group, Mesh, TorusGeometry, CylinderGeometry, MeshBasicMaterial } = THREE;
    if ([Group, Mesh, TorusGeometry, CylinderGeometry, MeshBasicMaterial].some(type => typeof type !== 'function')) {
      throw new TypeError('options.three does not provide the required visual constructors');
    }

    this._three = THREE;
    this.object = new Group();
    this._baseRadius = options.radius ?? 0.34;
    this.radius = this._baseRadius;
    this.wheelAssembly = new Group();
    this.object.add(this.wheelAssembly);
    this.disposed = false;
    this._resources = [];

    const radius = this._baseRadius;
    const tubeRadius = options.tubeRadius ?? 0.045;
    const axleRadius = options.axleRadius ?? 0.035;
    const axleLength = options.axleLength ?? 1.05;
    const spokeRadius = options.spokeRadius ?? 0.009;
    const spokeCount = options.spokeCount ?? 12;
    this._tubeRadius = tubeRadius;
    this._axleRadius = axleRadius;
    this._spokeRadius = spokeRadius;
    this._spokeCount = spokeCount;

    const rimMaterial = new MeshBasicMaterial({ color: options.rimColor ?? 0x252a30 });
    const spokeMaterial = new MeshBasicMaterial({ color: options.spokeColor ?? 0xc5ccd4 });
    const axleMaterial = new MeshBasicMaterial({ color: options.axleColor ?? 0x8b5a2b });
    this._resources.push(rimMaterial, spokeMaterial, axleMaterial);

    const rim = new Mesh(new TorusGeometry(radius, tubeRadius, 12, 48), rimMaterial);
    rim.rotation.y = Math.PI / 2;

    const axle = new Mesh(new CylinderGeometry(axleRadius, axleRadius, axleLength, 16), axleMaterial);
    axle.rotation.z = Math.PI / 2;

    this.wheelAssembly.add(rim);
    this.object.add(axle);
    this.rim = rim;
    this.axle = axle;
    this.spokes = [];
    this._resources.push(rim.geometry, axle.geometry);

    for (let i = 0; i < spokeCount; i += 1) {
      const angle = (2 * Math.PI * i) / spokeCount;
      const spoke = new Mesh(new CylinderGeometry(spokeRadius, spokeRadius, radius * 0.92, 8), spokeMaterial);
      spoke.rotation.x = angle;
      spoke.position.y = Math.cos(angle) * radius * 0.46;
      spoke.position.z = Math.sin(angle) * radius * 0.46;
      this.wheelAssembly.add(spoke);
      this.spokes.push(spoke);
      this._resources.push(spoke.geometry);
    }

    const hub = new Mesh(new CylinderGeometry(axleRadius * 1.8, axleRadius * 1.8, axleRadius * 2.5, 16), axleMaterial);
    hub.rotation.z = Math.PI / 2;
    this.wheelAssembly.add(hub);
    this.hub = hub;
    this._resources.push(hub.geometry);
    this._rimMaterial = rimMaterial;
    this._spokeMaterial = spokeMaterial;
    this._axleMaterial = axleMaterial;
    this._axleLength = axleLength;
  }

  setOrientation(quaternion) {
    if (this.disposed) throw new Error('WheelVisual is disposed');
    this._setQuaternion(quaternion);
  }

  setPosition(position) {
    if (this.disposed) throw new Error('WheelVisual is disposed');
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new TypeError('position must contain finite x, y, z');
    }
    if (!this.object.position || typeof this.object.position.set !== 'function') {
      throw new TypeError('object does not provide position.set()');
    }
    this.object.position.set(position.x, position.y, position.z);
  }

  setDiameter(diameter) {
    if (this.disposed) throw new Error('WheelVisual is disposed');
    if (!(Number.isFinite(diameter) && diameter > 0)) throw new TypeError('diameter must be > 0');
    const radius = diameter / 2;
    this.radius = radius;
    // The wheel plane is local Y-Z and its physical axis is local X. Rebuild
    // only radial geometry instead of applying a non-uniform assembly scale.
    // This preserves axle depth/length and keeps the rim/spokes genuinely 3D.
    const oldRimGeometry = this.rim.geometry;
    this.rim.geometry = new this._three.TorusGeometry(radius, this._tubeRadius, 12, 48);
    oldRimGeometry?.dispose?.();
    for (const spoke of this.spokes) {
      const oldGeometry = spoke.geometry;
      spoke.geometry = new this._three.CylinderGeometry(this._spokeRadius, this._spokeRadius, radius * 0.92, 8);
      oldGeometry?.dispose?.();
      const angle = spoke.rotation.x;
      spoke.position.y = Math.cos(angle) * radius * 0.46;
      spoke.position.z = Math.sin(angle) * radius * 0.46;
    }
    if (this.wheelAssembly?.scale?.set) this.wheelAssembly.scale.set(1, 1, 1);
  }

  setSpinAngle(angle) {
    if (this.disposed) throw new Error('WheelVisual is disposed');
    if (!Number.isFinite(angle)) throw new TypeError('angle must be finite');
    this.wheelAssembly.rotation.x = angle;
  }

  setVisible(visible) {
    if (this.disposed) throw new Error('WheelVisual is disposed');
    this.object.visible = Boolean(visible);
  }

  dispose() {
    if (this.disposed) return;
    for (const resource of this._resources) if (resource && typeof resource.dispose === 'function') resource.dispose();
    const current = [this.rim?.geometry, ...this.spokes.map(spoke => spoke.geometry), this.axle?.geometry, this.hub?.geometry];
    for (const resource of current) if (resource && typeof resource.dispose === 'function') resource.dispose();
    this.disposed = true;
  }

  _setQuaternion(quaternion) {
    if (!quaternion || typeof quaternion !== 'object') throw new TypeError('quaternion must be an object');
    const { x, y, z, w } = quaternion;
    if (![x, y, z, w].every(Number.isFinite)) throw new TypeError('quaternion components must be finite numbers');
    if (!this.object.quaternion || typeof this.object.quaternion.set !== 'function') throw new TypeError('object does not provide quaternion.set()');
    this.object.quaternion.set(x, y, z, w);
  }
}

export { WheelVisual };
export default WheelVisual;
