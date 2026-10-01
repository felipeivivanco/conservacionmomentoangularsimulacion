/**
 * Presentation-only playback speed control. It scales simulated elapsed time
 * through SimulationController.timeScale; it does not modify the physical
 * engine, its equations, or its fixed physics step.
 */
class SimulationSpeedControl {
  constructor({ document, controller, mount, initialValue = 1 } = {}) {
    if (!document || typeof document.createElement !== 'function') throw new TypeError('document is required');
    if (!controller || typeof controller.setTimeScale !== 'function' || typeof controller.getState !== 'function') {
      throw new TypeError('controller must expose setTimeScale() and getState()');
    }
    if (!mount || typeof mount.appendChild !== 'function') throw new TypeError('mount must provide appendChild()');

    this.document = document;
    this.controller = controller;
    this.mount = mount;
    this.disposed = false;
    this.min = 0.01;
    this.max = 1;
    this.step = 0.01;

    this.root = document.createElement('section');
    this.root.className = 'ui-panel ui-speed-control';
    this.root.setAttribute?.('aria-label', 'Velocidad de la Simulación');

    const label = document.createElement('label');
    label.className = 'ui-control-label';
    label.textContent = 'Velocidad de la Simulación';

    const row = document.createElement('div');
    row.className = 'ui-speed-row';

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.id = 'simulation-speed-slider';
    this.slider.className = 'ui-range';
    this.slider.min = String(this.min);
    this.slider.max = String(this.max);
    this.slider.step = String(this.step);
    this.slider.setAttribute?.('aria-label', 'Velocidad de la Simulación');

    this.value = document.createElement('span');
    this.value.className = 'ui-control-value ui-speed-value';
    this.value.setAttribute?.('role', 'button');
    this.value.title = 'Doble clic para editar';

    row.append(this.slider, this.value);
    this.root.append(label, row);
    mount.appendChild(this.root);

    this._onInput = () => this.setValue(Number(this.slider.value));
    this.slider.addEventListener('input', this._onInput);

    this._installNumericEditing();
    const configured = Number.isFinite(initialValue) ? initialValue : this.controller.getState().timeScale;
    this.setValue(configured);
  }

  _clamp(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return this.min;
    return Math.max(this.min, Math.min(this.max, n));
  }

  _format(value) {
    return this._clamp(value).toFixed(2);
  }

  setValue(value) {
    if (this.disposed) throw new Error('SimulationSpeedControl is disposed');
    const clamped = this._clamp(value);
    const state = this.controller.setTimeScale(clamped);
    this.slider.value = String(clamped);
    this.value.textContent = this._format(clamped);
    return state;
  }

  getValue() {
    return Number(this.slider.value);
  }

  _installNumericEditing() {
    this.value.addEventListener('dblclick', () => {
      if (this.disposed || this.value.querySelector?.('input')) return;
      const current = this.getValue();
      const input = this.document.createElement('input');
      input.type = 'number';
      input.min = String(this.min);
      input.max = String(this.max);
      input.step = String(this.step);
      input.value = this._format(current);
      input.className = 'ui-inline-editor';
      input.setAttribute?.('aria-label', 'Velocidad de la Simulación');
      this.value.textContent = '';
      this.value.appendChild(input);
      input.focus?.();
      input.select?.();

      let finished = false;
      const finish = apply => {
        if (finished) return;
        finished = true;
        const next = Number(input.value);
        if (apply && Number.isFinite(next)) this.setValue(next);
        else this.value.textContent = this._format(current);
      };
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    });
  }

  dispose() {
    if (this.disposed) return;
    this.slider.removeEventListener('input', this._onInput);
    this.root.remove();
    this.disposed = true;
  }
}

export { SimulationSpeedControl };
export default SimulationSpeedControl;
