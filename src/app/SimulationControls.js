/**
 * Student-facing controls. Physical state changes are delegated to EngineAdapter.
 * The wheel inertia remains a motor parameter but is not manually controlled here.
 */
class SimulationControls {
  constructor({ document, engine, mount, onReset, onTogglePause, onOverlayToggle, onPhysicalStateChange, onThetaTargetChange, onParameterChange } = {}) {
    if (!document || typeof document.createElement !== 'function') throw new TypeError('document is required');
    if (!engine || typeof engine.setThetaTarget !== 'function' || typeof engine.setSpinRate !== 'function' ||
        typeof engine.setWheelDiameter !== 'function' || typeof engine.setWheelMass !== 'function' ||
        typeof engine.setIncludeHuman !== 'function') {
      throw new TypeError('engine must expose theta, spin, diameter, mass and human-model APIs');
    }
    if (!mount || typeof mount.appendChild !== 'function') throw new TypeError('mount must provide appendChild()');
    if (onReset !== undefined && typeof onReset !== 'function') throw new TypeError('onReset must be a function');
    if (onTogglePause !== undefined && typeof onTogglePause !== 'function') throw new TypeError('onTogglePause must be a function');
    if (onParameterChange !== undefined && typeof onParameterChange !== 'function') throw new TypeError('onParameterChange must be a function');

    this.document = document;
    this.window = document.defaultView ?? globalThis.window ?? null;
    this.engine = engine;
    this.mount = mount;
    this.onReset = onReset ?? null;
    this.onTogglePause = onTogglePause ?? null;
    this.onOverlayToggle = onOverlayToggle ?? null;
    this.onPhysicalStateChange = onPhysicalStateChange ?? null;
    this.onThetaTargetChange = onThetaTargetChange ?? null;
    this.onParameterChange = onParameterChange ?? null;
    this.paused = false;
    this.lifecycleStatus = 'stopped';
    this.disposed = false;
    this._lastState = null;
    this._configuredSpin = 40;
    this._directionSign = 1;

    this.root = document.createElement('section');
    this.root.className = 'ui-panel ui-controls';
    this.root.setAttribute?.('aria-label', 'Controles de la simulación');

    this.thetaLabel = this._label('Ángulo del eje');
    this.thetaSlider = this._range('theta-target-slider', -90, 90, 1, 0, 'Ángulo del eje');
    this.thetaValue = this._valueNode();
    this.spinLabel = this._label('Velocidad angular de la rueda');
    this.spinSlider = this._range('initial-spin-slider', 0, 80, 1, 40, 'Velocidad angular de la rueda');
    this.spinValue = this._valueNode();
    this.directionLabel = this._label('Sentido de giro');
    this.directionSwitch = document.createElement('input');
    this.directionSwitch.type = 'checkbox';
    this.directionSwitch.setAttribute?.('role', 'switch');
    this.directionSwitch.setAttribute?.('aria-label', 'Sentido de giro: Antihorario (+)');
    this.directionSwitch.id = 'wheel-direction-switch';
    this.directionState = document.createElement('span');
    this.directionState.className = 'ui-direction-state';
    this._updateDirectionPresentation();
    this.diameterLabel = this._label('Diámetro de la rueda');
    this.diameterSlider = this._range('wheel-diameter-slider', 0.20, 8.00, 0.01, 0.68, 'Diámetro de la rueda');
    this.diameterValue = this._valueNode();
    this.diameterSlider.title = 'm';
    this.massLabel = this._label('Masa de la rueda');
    this.massSlider = this._range('wheel-mass-slider', 0.10, 20.00, 0.01, 3.00, 'Masa de la rueda');
    this.massValue = this._valueNode();
    this.massSlider.title = 'kg';

    // Backward-compatible alias retained for the theta control.
    this.slider = this.thetaSlider;

    // The editable values live directly beside their sliders. Keep only the
    // derived inertia readout below the controls; no duplicated parameter card.
    this.readout = document.createElement('div');
    this.readout.className = 'ui-readouts ui-card';
    this.inertiaReadout = document.createElement('div');
    this.inertiaReadout.className = 'ui-readout ui-readout--inertia';
    this.readout.appendChild(this.inertiaReadout);

    this.humanModelGroup = document.createElement('div');
    this.humanModelGroup.className = 'ui-control-group ui-human-model-group';
    const humanModelRow = document.createElement('div');
    humanModelRow.className = 'ui-control-row';
    this.humanModelLabel = this._label('Modelo simplificado del humano');
    this.humanModelLabel.style.margin = '0';
    this.humanModelSwitch = document.createElement('input');
    this.humanModelSwitch.type = 'checkbox';
    this.humanModelSwitch.className = 'ui-switch';
    this.humanModelSwitch.id = 'include-human-switch';
    this.humanModelSwitch.checked = false;
    this.humanModelSwitch.setAttribute?.('role', 'switch');
    this.humanModelState = document.createElement('span');
    this.humanModelState.className = 'ui-direction-state';
    this._updateHumanModelPresentation();
    const humanModelControl = document.createElement('div');
    humanModelControl.className = 'ui-direction';
    humanModelControl.append(this.humanModelSwitch, this.humanModelState);
    humanModelRow.append(this.humanModelLabel, humanModelControl);
    this.humanModelGroup.appendChild(humanModelRow);

    // Compatibility aliases: these names are retained for existing callers/tests,
    // but all four references point to the live slider-adjacent value nodes.
    this.targetReadout = this.thetaValue;
    this.initialSpinReadout = this.spinValue;
    this.diameterReadout = this.diameterValue;
    this.massReadout = this.massValue;

    this.pauseButton = document.createElement('button');
    this.pauseButton.type = 'button';
    this.pauseButton.textContent = '▶ Iniciar simulación';
    this.pauseButton.setAttribute?.('aria-label', 'Iniciar simulación');
    

    this.overlaySection = document.createElement('div');
    this.overlaySection.className = 'ui-card';
    const overlayTitle = document.createElement('div');
    overlayTitle.className = 'ui-card-title';
    overlayTitle.textContent = '◉  Visualización';
    this.overlaySection.appendChild(overlayTitle);
    this.overlayChecks = {};
    for (const [key,label] of [['axes','Ejes'],['vectors','Vectores físicos']]) {
      const wrapper=document.createElement('label'); wrapper.className='ui-overlay-option';
      const input=document.createElement('input'); input.type='checkbox'; input.checked=false; input.id=`overlay-${key}`;
      input.setAttribute?.('aria-label',label);
      input._overlayHandler=()=>this.onOverlayToggle?.(key,input.checked);
      input.addEventListener('change',input._overlayHandler);
      wrapper.append(input, this.document.createTextNode ? this.document.createTextNode(` ${label}`) : label);
      this.overlaySection.appendChild(wrapper); this.overlayChecks[key]=input;
    }

    this.resetButton = document.createElement('button');
    this.resetButton.type = 'button';
    this.resetButton.textContent = '↻ Reiniciar';
    this.resetButton.setAttribute?.('aria-label', 'Reiniciar');
    this.resetButton.style.background = '#c62828';
    

    this.thetaLabel.htmlFor = this.thetaSlider.id;
    this.spinLabel.htmlFor = this.spinSlider.id;
    this.diameterLabel.htmlFor = this.diameterSlider.id;
    this.massLabel.htmlFor = this.massSlider.id;
    const title = document.createElement('div');
    title.className = 'ui-panel-title';
    title.innerHTML = '<span class="ui-title-icon">↻</span><span>Controles</span>';

    this.scrollContent = document.createElement('div');
    this.scrollContent.className = 'ui-controls-scroll';
    this.scrollContent.appendChild(title);

    const controlGroup = (label, control, valueNode) => {
      const group = document.createElement('div');
      group.className = 'ui-control-group';
      const row = document.createElement('div');
      row.className = 'ui-control-row';
      label.className = 'ui-control-label';
      label.style.margin = '0';
      row.append(label);
      if (valueNode) row.append(valueNode);
      group.append(row, control);
      return group;
    };
    this.scrollContent.append(controlGroup(this.thetaLabel, this.thetaSlider, this.thetaValue));
    this.scrollContent.append(controlGroup(this.spinLabel, this.spinSlider, this.spinValue));

    const directionGroup = document.createElement('div');
    directionGroup.className = 'ui-control-group';
    const directionRow = document.createElement('div');
    directionRow.className = 'ui-control-row';
    this.directionLabel.className = 'ui-control-label';
    this.directionLabel.style.margin = '0';
    directionRow.append(this.directionLabel);
    const direction = document.createElement('div');
    direction.className = 'ui-direction';
    this.directionSwitch.className = 'ui-switch';
    direction.append(this.directionSwitch, this.directionState);
    directionRow.append(direction);
    directionGroup.append(directionRow);
    this.scrollContent.append(directionGroup);

    this.scrollContent.append(
      controlGroup(this.diameterLabel, this.diameterSlider, this.diameterValue),
      controlGroup(this.massLabel, this.massSlider, this.massValue),
      this.readout,
      this.humanModelGroup,
      this.overlaySection
    );

    this.actions = document.createElement('div');
    this.actions.className = 'ui-controls-actions';
    this.pauseButton.className = 'ui-action ui-action--start';
    this.resetButton.className = 'ui-action ui-action--reset';
    this.actions.append(this.pauseButton, this.resetButton);
    this.root.append(this.scrollContent, this.actions);
    mount.appendChild(this.root);

    this._onThetaInput = () => this.setTargetDegrees(Number(this.thetaSlider.value));
    this._onSpinInput = () => {
      if (this.disposed) return;
      const value = Math.max(0, Math.min(80, Number(this.spinSlider.value)));
      this._configuredSpin = value;
      const state = this.engine.setSpinRate(this._effectiveSpin(value));
      this.update(state);
      this.onParameterChange?.(state, 'spin');
    };
    this._onDirectionChange = () => {
      if (this.disposed) return;
      this._directionSign = this.directionSwitch.checked ? -1 : 1;
      const magnitude = Math.max(0, Math.min(80, Number(this.spinSlider.value)));
      const state = this.engine.setSpinRate(this._effectiveSpin(magnitude));
      this._configuredSpin = magnitude;
      this.update(state);
      this.onParameterChange?.(state, 'spin-direction');
    };
    this._onDiameterInput = () => {
      if (this.disposed) return;
      const value = Number(this.diameterSlider.value);
      const state = this.engine.setWheelDiameter(value);
      this.update(state);
      this.onParameterChange?.(state, 'diameter');
    };
    this._onMassInput = () => {
      if (this.disposed) return;
      const value = Number(this.massSlider.value);
      const state = this.engine.setWheelMass(value);
      this.update(state);
      this.onParameterChange?.(state, 'mass');
    };
    this._onHumanModelChange = () => {
      if (this.disposed) return;
      const state = this.engine.setIncludeHuman(!Boolean(this.humanModelSwitch.checked));
      this.update(state);
      this.onParameterChange?.(state, 'include-human');
    };
    this._onPauseToggle = () => {
      if (this.disposed) return;
      const lifecycle = this.onTogglePause?.();
      if (typeof lifecycle === 'string') this.setLifecycleStatus(lifecycle);
      else if (lifecycle && typeof lifecycle === 'object' && typeof lifecycle.status === 'string') this.setLifecycleStatus(lifecycle.status);
      else if (typeof lifecycle === 'boolean') this.setPaused(lifecycle);
    };
    this._onReset = () => this.onReset?.();

    this._installNumericEditing(this.thetaValue, {
      key: 'theta', min: -90, max: 90, step: 1,
      parse: value => this.setTargetDegrees(value),
      format: value => `${this._formatDegrees(value)}°`
    });
    this._installNumericEditing(this.spinValue, {
      key: 'spin', min: 0, max: 80, step: 1,
      parse: value => {
        const clamped = Math.max(0, Math.min(80, value));
        this._configuredSpin = clamped;
        this.spinSlider.value = String(clamped);
        const state = this.engine.setSpinRate(this._effectiveSpin(clamped));
        this.update(state);
        this.onParameterChange?.(state, 'spin');
        return state;
      },
      format: value => `${value.toFixed(2)} rad/s`
    });
    this._installNumericEditing(this.diameterValue, {
      key: 'diameter', min: 0.20, max: 8.00, step: 0.01,
      parse: value => {
        const state = this.engine.setWheelDiameter(Math.max(0.20, Math.min(8.00, value)));
        this.update(state);
        this.onParameterChange?.(state, 'diameter');
        return state;
      },
      format: value => `${value.toFixed(2)} m`
    });
    this._installNumericEditing(this.massValue, {
      key: 'mass', min: 0.10, max: 20.00, step: 0.01,
      parse: value => {
        const state = this.engine.setWheelMass(Math.max(0.10, Math.min(20.00, value)));
        this.update(state);
        this.onParameterChange?.(state, 'mass');
        return state;
      },
      format: value => `${value.toFixed(2)} kg`
    });

    this.thetaSlider.addEventListener('input', this._onThetaInput);
    this.spinSlider.addEventListener('input', this._onSpinInput);
    this.directionSwitch.addEventListener('change', this._onDirectionChange);
    this.diameterSlider.addEventListener('input', this._onDiameterInput);
    this.massSlider.addEventListener('input', this._onMassInput);
    this.humanModelSwitch.addEventListener('change', this._onHumanModelChange);
    this.pauseButton.addEventListener('click', this._onPauseToggle);
    this.resetButton.addEventListener('click', this._onReset);

    // The application immediately replaces this presentation state with the
    // engine snapshot. Keep this fallback only for isolated construction tests.
    const initial = this.engine?.getState?.();
    if (initial) this.update(initial);
    this.setLifecycleStatus('stopped');
  }

  _label(text) {
    const label = this.document.createElement('label');
    label.textContent = text;
    label.className = 'ui-control-label';
    return label;
  }

  _range(id, min, max, step, value, aria) {
    const slider = this.document.createElement('input');
    slider.type = 'range'; slider.min = String(min); slider.max = String(max); slider.step = String(step); slider.value = String(value);
    slider.id = id; slider.className = 'ui-range'; slider.setAttribute?.('aria-label', aria);
    this._syncRangeVisual(slider);
    slider.addEventListener('input', () => this._syncRangeVisual(slider));
    return slider;
  }

  _syncRangeVisual(slider) {
    if (!slider) return;
    const min = Number(slider.min);
    const max = Number(slider.max);
    const value = Number(slider.value);
    const progress = Number.isFinite(min) && Number.isFinite(max) && max > min && Number.isFinite(value)
      ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
      : 0;
    slider.style?.setProperty?.('--ui-range-progress', `${progress}%`);
  }

  _valueNode() {
    const node = this.document.createElement('span');
    node.className = 'ui-control-value';
    node.setAttribute?.('role', 'button');
    return node;
  }

  static degreesToRadians(degrees) {
    if (!Number.isFinite(degrees)) throw new TypeError('degrees must be finite');
    return degrees * Math.PI / 180;
  }

  static radiansToDegrees(radians) {
    if (!Number.isFinite(radians)) throw new TypeError('radians must be finite');
    return radians * 180 / Math.PI;
  }

  setTargetDegrees(degrees) {
    if (this.disposed) throw new Error('SimulationControls is disposed');
    const clamped = Math.max(-90, Math.min(90, degrees));
    const state = this.engine.setThetaTarget(SimulationControls.degreesToRadians(clamped));
    this.update(state);
    this.thetaSlider.value = String(clamped);
    this.onThetaTargetChange?.(state);
    return state;
  }

  setInitialSpin(s0) {
    if (this.disposed) throw new Error('SimulationControls is disposed');
    if (!Number.isFinite(s0)) throw new TypeError('s0 must be finite');
    const clamped = Math.max(0, Math.min(80, s0));
    this._configuredSpin = clamped;
    this.spinSlider.value = String(clamped);
    this._directionSign = s0 < 0 ? -1 : 1;
    this.directionSwitch.checked = this._directionSign < 0;
    this._updateDirectionPresentation();
    return this._effectiveSpin(clamped);
  }

  getInitialSpin() { return this._effectiveSpin(this._configuredSpin); }

  _effectiveSpin(magnitude) { return this._directionSign * Math.max(0, Math.min(80, Number(magnitude))); }

  _updateDirectionPresentation() {
    if (!this.directionSwitch || !this.directionState) return;
    const negative = this._directionSign < 0;
    this.directionState.textContent = negative ? 'Horario (−)' : 'Antihorario (+)';
    this.directionSwitch.setAttribute?.('aria-label', negative ? 'Sentido de giro: Horario (−)' : 'Sentido de giro: Antihorario (+)');
    this.directionSwitch.setAttribute?.('aria-checked', String(negative));
  }

  _updateHumanModelPresentation() {
    if (!this.humanModelSwitch || !this.humanModelState) return;
    const simplified = Boolean(this.humanModelSwitch.checked);
    this.humanModelState.textContent = simplified ? 'ON' : 'OFF';
    this.humanModelSwitch.setAttribute?.('aria-label', simplified ? 'Modelo simplificado del humano: activado' : 'Modelo simplificado del humano: desactivado');
    this.humanModelSwitch.setAttribute?.('aria-checked', String(simplified));
  }

  setIncludeHuman(includeHuman, physicsState = null) {
    if (this.disposed) throw new Error('SimulationControls is disposed');
    this.humanModelSwitch.checked = !Boolean(includeHuman);
    this._updateHumanModelPresentation();
    const state = physicsState ?? this.engine?.getState?.();
    if (state) this.update(state);
    return state;
  }

  update(physicsState) {
    if (this.disposed) throw new Error('SimulationControls is disposed');
    if (!physicsState || !Number.isFinite(physicsState.theta) || !Number.isFinite(physicsState.theta_target)) throw new TypeError('physicsState must contain finite theta and theta_target');
    if (!Array.isArray(physicsState.Omega_w) || !Array.isArray(physicsState.n_w) || physicsState.Omega_w.length !== 3 || physicsState.n_w.length !== 3) throw new TypeError('physicsState must contain Omega_w and n_w');
    if (!physicsState.params) throw new TypeError('physicsState must contain params');
    this._lastState = structuredClone(physicsState);
    const targetDegrees = SimulationControls.radiansToDegrees(physicsState.theta_target);
    this.thetaSlider.value = String(targetDegrees);
    this._syncRangeVisual(this.thetaSlider);
    const effectiveSpin = Number(physicsState.params.s0);
    const magnitude = Math.abs(effectiveSpin);
    if (Math.abs(effectiveSpin) > 1e-15) this._directionSign = effectiveSpin < 0 ? -1 : 1;
    this.spinSlider.value = String(magnitude);
    this._syncRangeVisual(this.spinSlider);
    this._configuredSpin = magnitude;
    this.directionSwitch.checked = this._directionSign < 0;
    this._updateDirectionPresentation();
    this.diameterSlider.value = String(physicsState.params.D);
    this._syncRangeVisual(this.diameterSlider);
    this.massSlider.value = String(physicsState.params.m_w);
    this._syncRangeVisual(this.massSlider);
    this.humanModelSwitch.checked = physicsState.params.includeHuman === false;
    this._updateHumanModelPresentation();
    // A live browser render can arrive on the very next animation frame after
    // dblclick. While a numeric editor is open, preserve that value node so the
    // input remains attached and editable. The engine snapshot is the only
    // source of truth for both the slider and the displayed value.
    if (!this.thetaValue._numericEditor) this.thetaValue.textContent = `${this._formatDegrees(targetDegrees)}°`;
    if (!this.spinValue._numericEditor) this.spinValue.textContent = `${magnitude.toFixed(2)} rad/s`;
    if (!this.diameterValue._numericEditor) this.diameterValue.textContent = `${physicsState.params.D.toFixed(2)} m`;
    if (!this.massValue._numericEditor) this.massValue.textContent = `${physicsState.params.m_w.toFixed(2)} kg`;
    this.inertiaReadout.textContent = `Momento de inercia: ${physicsState.params.Ia.toFixed(4)} kg·m²`;
    this.onPhysicalStateChange?.(physicsState);
    return this.getState();
  }

  reset(physicsState) {
    if (this.disposed) throw new Error('SimulationControls is disposed');
    const state = physicsState ?? this.engine?.getState?.();
    if (!state) throw new TypeError('physicsState is required when no engine state is available');
    return this.update(state);
  }

  setLifecycleStatus(status) {
    if (this.disposed) throw new Error('SimulationControls is disposed');
    if (!['stopped', 'running', 'paused'].includes(status)) throw new RangeError('status must be stopped, running or paused');
    this.lifecycleStatus = status;
    this.engine.setLifecycleStatus?.(status);
    this.paused = status === 'paused';
    const presentation = {
      stopped: { text: '▶ Iniciar simulación', aria: 'Iniciar simulación', color: '#2e7d32' },
      running: { text: '⏸ Pausar simulación', aria: 'Pausar simulación', color: '#d9a400' },
      paused: { text: '▶ Reanudar simulación', aria: 'Reanudar simulación', color: '#2e7d32' }
    }[status];
    this.pauseButton.textContent = presentation.text;
    this.pauseButton.setAttribute?.('aria-label', presentation.aria);
    this.pauseButton.style.background = presentation.color;
    return status;
  }

  setPaused(paused) {
    return this.setLifecycleStatus(Boolean(paused) ? 'paused' : 'running');
  }

  getState() {
    return {
      targetDegrees: Number(this.thetaSlider.value),
      thetaTarget: SimulationControls.degreesToRadians(Number(this.thetaSlider.value)),
      initialSpin: this.getInitialSpin(),
      wheelSpin: this._lastState?.params?.s0 ?? 0,
      directionSign: this._directionSign,
      Ia: this._lastState?.params?.Ia,
      D: this._lastState?.params?.D ?? Number(this.diameterSlider.value),
      mass: this._lastState?.params?.m_w ?? Number(this.massSlider.value),
      includeHuman: this._lastState?.params?.includeHuman !== false
    };
  }

  _installNumericEditing(readout, { key, min, max, step, parse, format }) {
    readout.setAttribute?.('title', 'Doble clic para editar');
    readout.style.cursor = 'text';
    readout.style.userSelect = 'none';
    readout._numericEditor = null;
    readout.addEventListener?.('dblclick', event => {
      if (event?.button !== undefined && event.button !== 0) return;
      if (readout._numericEditor) return;

      const current = this._numericValue(key);
      const originalText = readout.textContent;
      const formatted = format(current);
      const match = formatted.match(/-?\d+(?:\.\d+)?/);
      const prefix = match ? formatted.slice(0, match.index) : '';
      const suffix = match ? formatted.slice(match.index + match[0].length) : '';

      readout.textContent = '';
      if (prefix) readout.appendChild(this.document.createTextNode ? this.document.createTextNode(prefix) : prefix);

      const input = this.document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(current);
      input.setAttribute?.('aria-label', `Editar ${key}`);
      input.setAttribute?.('inputmode', 'decimal');
      Object.assign(input.style, {
        display: 'inline-block',
        position: 'relative',
        zIndex: '30',
        width: key === 'theta' ? '5.2em' : '6.2em',
        height: '1.7em',
        minWidth: key === 'theta' ? '5.2em' : '6.2em',
        boxSizing: 'border-box',
        font: 'inherit',
        lineHeight: '1.3',
        padding: '2px 4px',
        margin: '0 2px',
        border: '1px solid rgba(0,0,0,0.45)',
        borderRadius: '4px',
        background: '#fff',
        color: '#111',
        opacity: '1',
        visibility: 'visible',
        pointerEvents: 'auto'
      });
      readout.appendChild(input);
      if (suffix) readout.appendChild(this.document.createTextNode ? this.document.createTextNode(suffix) : suffix);
      // Mark the editor only after insertion. This ordering is intentional:
      // update() can now observe a connected live editor and will leave it in
      // place on subsequent application/animation-frame updates.
      readout._numericEditor = input;

      let finished = false;
      const finish = commit => {
        if (finished || readout._numericEditor !== input) return;
        finished = true;
        readout._numericEditor = null;
        const raw = String(input.value ?? '').trim();
        const value = Number(raw);
        if (!commit || raw === '' || !Number.isFinite(value)) {
          readout.textContent = originalText;
          return;
        }
        const clamped = Math.max(min, Math.min(max, value));
        parse(clamped);
        // `parse()` updates the same physical state and slider path as the
        // corresponding slider. Keep the final presentation sourced from the
        // engine snapshot rather than maintaining a second numeric state.
        readout.textContent = format(clamped);
      };

      input.addEventListener?.('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault?.();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault?.();
          finish(false);
        }
      });
      input.addEventListener?.('blur', () => finish(true));

      // The input is inserted before focus is requested. Use one browser-frame
      // fallback as well: some DOM implementations only make a newly inserted
      // control focusable after layout, while still allowing the synchronous
      // path in simple/test DOMs. No simulation timer or physical animation is
      // introduced by this UI-only deferral.
      input.focus?.();
      input.select?.();
      if (typeof this.window?.requestAnimationFrame === 'function') {
        this.window.requestAnimationFrame(() => {
          if (readout._numericEditor === input && input.isConnected !== false) {
            input.focus?.();
            input.select?.();
          }
        });
      }
    });
  }

  _numericValue(key) {
    if (key === 'theta') return Number(this.thetaSlider.value);
    if (key === 'spin') return Number(this.spinSlider.value);
    if (key === 'diameter') return Number(this.diameterSlider.value);
    if (key === 'mass') return Number(this.massSlider.value);
    return 0;
  }

  dispose() {
    if (this.disposed) return;
    this.thetaSlider.removeEventListener('input', this._onThetaInput);
    this.spinSlider.removeEventListener('input', this._onSpinInput);
    this.directionSwitch.removeEventListener('change', this._onDirectionChange);
    this.diameterSlider.removeEventListener('input', this._onDiameterInput);
    this.massSlider.removeEventListener('input', this._onMassInput);
    this.humanModelSwitch.removeEventListener('change', this._onHumanModelChange);
    for (const input of Object.values(this.overlayChecks)) input.removeEventListener?.('change', input._overlayHandler);
    this.pauseButton.removeEventListener('click', this._onPauseToggle);
    this.resetButton.removeEventListener('click', this._onReset);
    this.root.remove();
    this.disposed = true;
  }

  _dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  _formatDegrees(value) { return (Math.abs(value) < 1e-10 ? 0 : value).toFixed(1); }
}

export { SimulationControls };
export default SimulationControls;
