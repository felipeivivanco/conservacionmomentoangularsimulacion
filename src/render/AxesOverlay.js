/** Presentation-only global coordinate axes overlay. */
class AxesOverlay {
  constructor({ three, document: doc = globalThis.document, length = 2.25 } = {}) {
    if (!three || typeof three !== 'object') throw new TypeError('three is required');
    const { Group, ArrowHelper, Vector3 } = three;
    if ([Group, ArrowHelper, Vector3].some(type => typeof type !== 'function')) throw new TypeError('three lacks axes constructors');
    this.three = three;
    this.document = doc;
    this.length = length;
    this.object = new Group();
    this.visible = false;
    this._items = [];
    this._labels = [];
    this._makeWorldAxes();
    this.setVisible(false);
  }

  _makeArrow(origin, direction, color, label) {
    const v = new this.three.Vector3(direction[0], direction[1], direction[2]);
    const arrow = new this.three.ArrowHelper(
      v,
      new this.three.Vector3(origin[0], origin[1], origin[2]),
      this.length,
      color,
      Math.min(0.16, this.length * 0.22),
      Math.min(0.09, this.length * 0.12)
    );
    this.object.add(arrow);
    this._items.push(arrow);
    this._addLabel(label, [origin[0] + direction[0] * this.length, origin[1] + direction[1] * this.length, origin[2] + direction[2] * this.length]);
    return arrow;
  }

  _makeWorldAxes() {
    // Physical X->visual +Z, Y->visual +X, Z->visual +Y.
    const axes = [
      [[0,0,0],[0,0,1],0xff0000,'+X'], [[0,0,0],[0,0,-1],0xff0000,'-X'],
      [[0,0,0],[1,0,0],0x00ff00,'+Y'], [[0,0,0],[-1,0,0],0x00ff00,'-Y'],
      [[0,0,0],[0,1,0],0x0000ff,'+Z'], [[0,0,0],[0,-1,0],0x0000ff,'-Z']
    ];
    for (const [origin, direction, color, label] of axes) this._makeArrow(origin, direction, color, label);
  }

  update() {
    // Global axes are fixed in the scene. No body axis is added here.
  }

  _addLabel(text, position) {
    if (!this.three.Sprite || !this.three.SpriteMaterial || !this.three.CanvasTexture || !this.document) return;
    // Render the same-size sprite from a 4x internal canvas so X/Y/Z labels
    // remain crisp without changing their world-space footprint.
    const resolutionScale = 4;
    const canvas = this.document.createElement('canvas');
    canvas.width = 128 * resolutionScale; canvas.height = 48 * resolutionScale;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    ctx.setTransform?.(resolutionScale, 0, 0, resolutionScale, 0, 0);
    ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#111'; ctx.fillText(text, 6, 30);
    const texture = new this.three.CanvasTexture(canvas);
    if ('minFilter' in texture && this.three.LinearFilter !== undefined) texture.minFilter = this.three.LinearFilter;
    if ('magFilter' in texture && this.three.LinearFilter !== undefined) texture.magFilter = this.three.LinearFilter;
    texture.needsUpdate = true;
    const sprite = new this.three.Sprite(new this.three.SpriteMaterial({map:texture, transparent:true}));
    sprite.position.set(position[0], position[1], position[2]);
    sprite.scale.set(0.65,0.25,1);
    this.object.add(sprite);
    this._labels.push({sprite, text, texture});
  }

  setVisible(visible) { this.visible = Boolean(visible); this.object.visible = this.visible; }

  dispose() {
    for (const item of this._labels) item.texture?.dispose?.();
    for (const item of this._items) item.dispose?.();
    this.object.clear?.();
  }
}

export { AxesOverlay };
export default AxesOverlay;
