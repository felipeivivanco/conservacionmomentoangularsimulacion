/** Presentation-only circular platform for scenario 1. */
class PlatformVisual {
  constructor(options = {}) {
    const THREE = options.three;
    if (!THREE || typeof THREE !== 'object') throw new TypeError('options.three must be the Three.js module');
    const { Group, Mesh, CylinderGeometry, CircleGeometry, MeshBasicMaterial } = THREE;
    if ([Group, Mesh, CylinderGeometry, CircleGeometry, MeshBasicMaterial].some(type => typeof type !== 'function')) {
      throw new TypeError('options.three does not provide the required visual constructors');
    }
    this.object = new Group();
    this.disposed = false;
    const radius = options.radius ?? 0.36;
    const height = options.height ?? 0.16;
    const geometry = new CylinderGeometry(radius, radius, height, 48);
    const topColor = options.color ?? 0x9a9a9a;
    const sideColor = options.sideColor ?? 0x858585;
    const topMaterial = new MeshBasicMaterial({ color: topColor });
    const sideMaterial = new MeshBasicMaterial({ color: sideColor });
    const bottomMaterial = new MeshBasicMaterial({ color: sideColor });
    // CylinderGeometry groups are side, top, bottom. The geometry itself is
    // unchanged; only the presentation materials distinguish the vertical side.
    this.mesh = new Mesh(geometry, [sideMaterial, topMaterial, bottomMaterial]);
    this.mesh.position.y = height / 2;

    // Purely visual support shadow. It never participates in physics.
    const shadowGeometry = new CircleGeometry(Math.min(radius * 0.58, 0.22), 48);
    const shadowMaterial = new MeshBasicMaterial({
      color: options.shadowColor ?? 0x4b5560,
      transparent: true,
      opacity: options.shadowOpacity ?? 0.12,
      depthWrite: false
    });
    this.shadow = new Mesh(shadowGeometry, shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale?.set?.(1.15, 0.72, 1);
    this.shadow.position.y = height + 0.006;

    this.object.add(this.mesh, this.shadow);
    this._resources = [geometry, topMaterial, sideMaterial, bottomMaterial, shadowGeometry, shadowMaterial];
    this.topMaterial = topMaterial;
    this.sideMaterial = sideMaterial;
  }

  setSupportShadowPosition(position) {
    if (this.disposed) throw new Error('PlatformVisual is disposed');
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new TypeError('position must contain finite x, y, z');
    }
    this.shadow.position.x = position.x;
    this.shadow.position.z = position.z;
  }

  setVisible(visible) {
    if (this.disposed) throw new Error('PlatformVisual is disposed');
    this.object.visible = Boolean(visible);
  }

  dispose() {
    if (this.disposed) return;
    for (const resource of this._resources) if (resource && typeof resource.dispose === 'function') resource.dispose();
    this.disposed = true;
  }
}

export { PlatformVisual };
export default PlatformVisual;
