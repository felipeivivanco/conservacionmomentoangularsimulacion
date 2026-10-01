/**
 * Student-facing physical diagnostics.
 * All displayed quantities come directly from one engine snapshot. The
 * The panel uses the world frame, matching the physical vector overlay.
 */
class PhysicsDiagnostics {
  constructor({ document, mount, mode = 'VerticalBearing' } = {}) {
    if (!document || typeof document.createElement !== 'function') throw new TypeError('document is required');
    if (!mount || typeof mount.appendChild !== 'function') throw new TypeError('mount must provide appendChild()');
    this.document = document;
    this.mount = mount;
    this.disposed = false;
    this._humanYTooltips = [];
    this.mode = mode;
    this._infoOpen = false;

    this.root = document.createElement('aside');
    this.root.className = 'ui-panel ui-diagnostics';
    this.root.setAttribute?.('aria-label', 'Parámetros');

    const header = document.createElement('div');
    header.className = 'ui-diagnostic-header';
    const icon = document.createElement('span');
    icon.className = 'ui-diagnostic-icon';
    icon.textContent = '⚙';
    this.title = document.createElement('div');
    this.title.className = 'ui-diagnostic-title';
    this.title.textContent = 'Parámetros';
    this.infoToggle = document.createElement('button');
    this.infoToggle.type = 'button';
    this.infoToggle.className = 'ui-diagnostic-info-toggle';
    this.infoToggle.textContent = '+';
    this.infoToggle.setAttribute?.('aria-label', 'Mostrar información de la inercia del humano');
    this.infoToggle.setAttribute?.('aria-expanded', 'false');
    this.infoToggle.addEventListener?.('click', () => this._toggleInfo());
    const titleSpacer = document.createElement('div');
    titleSpacer.className = 'ui-diagnostic-title-spacer';
    header.append(icon, this.title, titleSpacer, this.infoToggle);
    this.root.appendChild(header);

    this.parameters = document.createElement('div');
    this.root.appendChild(this.parameters);
    this.inertiaInfo = document.createElement('div');
    this.inertiaInfo.className = 'ui-inertia-info';
    this.inertiaInfo.style.display = 'none';
    this.root.appendChild(this.inertiaInfo);
    mount.appendChild(this.root);
  }

  _line(label, value) {
    const wrapper = this.document.createElement('div');
    wrapper.className = 'ui-diagnostic-line';
    const heading = this.document.createElement('div');
    heading.textContent = label;
    heading.className = 'ui-diagnostic-label';
    const valueNode = this.document.createElement('div');
    valueNode.className = 'ui-diagnostic-value';
    valueNode.textContent = value;
    wrapper.append(heading, valueNode);
    return wrapper;
  }

  _vectorBlock(title, vector, frame = 'mundial') {
    const wrapper = this.document.createElement('section');
    wrapper.className = 'ui-vector-card';
    const heading = this.document.createElement('div');
    heading.className = 'ui-vector-title';
    heading.textContent = title;
    const frameNode = this.document.createElement('div');
    frameNode.className = 'ui-vector-frame';
    frameNode.textContent = `Marco: ${frame}`;
    const magnitude = this._norm(vector);
    const magnitudeNode = this.document.createElement('div');
    magnitudeNode.className = 'ui-vector-mag';
    magnitudeNode.textContent = `|L| = ${magnitude.toFixed(4)} kg·m²/s`;
    const components = [];
    for (const [axis, value] of [['x', vector[0]], ['y', vector[1]], ['z', vector[2]]]) {
      const row = this.document.createElement('div');
      row.textContent = `${axis}: ${value.toFixed(4)}`;
      row.className = 'ui-vector-row' + (axis === 'y' && title === 'L — humano' ? ' ui-vector-row--y' : '');
      if (this.mode !== 'Free' && title === 'L — humano' && axis === 'y') this._addHumanYHelp(row, value);
      components.push(row);
    }
    wrapper.append(heading, frameNode, magnitudeNode, ...components);
    return wrapper;
  }

  update(state) {
    if (this.disposed) throw new Error('PhysicsDiagnostics is disposed');
    if (!state || !state.params || !Number.isFinite(state.theta) || !Array.isArray(state.Omega_b) || state.Omega_b.length !== 3 || !state.Omega_b.every(Number.isFinite) || !Array.isArray(state.Omega_w) || !Array.isArray(state.n_w)) {
      throw new TypeError('physics snapshot must contain params, theta, Omega_w and n_w');
    }
    const physicalOmegaWheel = this._dot(state.Omega_w, state.n_w);
    // The two UI panels intentionally share the configured wheel-speed value
    // from the same engine snapshot. The physical dot product remains audited
    // separately and is exposed as physicalOmegaWheel; it is not a second UI
    // source for the displayed control value.
    const omegaWheel = state.params.s0;
    // The overlay draws world-frame vectors, so the student-facing component
    // values use the same frame. This keeps panel X/Y/Z numerically identical
    // to the colored physical arrows.
    const LWheel = state.L_wheel_world ?? state.L_wheel_body ?? state.L_wheel;
    const LBody = state.L_body_world ?? state.L_body_body ?? state.L_body;
    if (!Array.isArray(LWheel) || LWheel.length !== 3 || !LWheel.every(Number.isFinite) ||
        !Array.isArray(LBody) || LBody.length !== 3 || !LBody.every(Number.isFinite)) {
      throw new TypeError('physics snapshot must contain wheel and body angular momentum vectors');
    }

    this._clearHumanYTooltips();
    const signedHumanOmega = this._signedHumanOmega(state.Omega_b);
    this._replace(this.parameters, [
      this._line('Velocidad angular de la rueda', `ω = ${omegaWheel.toFixed(2)} rad/s`),
      this._line('Velocidad angular del humano', `${signedHumanOmega.toFixed(3)} rad/s`),
      this._line('Diámetro de la rueda', `D = ${state.params.D.toFixed(2)} m`),
      this._line('Masa de la rueda', `m = ${state.params.m_w.toFixed(2)} kg`),
      this._line('Ángulo del eje', `θ = ${this._deg(state.theta).toFixed(1)}°`),
      this._line('Momento de inercia de la rueda', `I = ${state.params.Ia.toFixed(4)} kg·m²`),
      this._vectorBlock('L — rueda', LWheel, 'mundial'),
      this._vectorBlock('L — humano', LBody, 'mundial')
    ]);
    this._updateInertiaInfo(state);

    return this.getState(state, omegaWheel, physicalOmegaWheel);
  }

  _signedHumanOmega(omega) {
    const magnitude = this._norm(omega);
    if (magnitude < 1e-12) return 0;
    const z = Number(omega[2]);
    if (Math.abs(z) >= 1e-12) return Math.sign(z) * magnitude;
    const dominant = omega.reduce((best, value, index) => Math.abs(value) > Math.abs(omega[best]) ? index : best, 0);
    return Math.sign(omega[dominant]) * magnitude;
  }

  _toggleInfo() {
    this._infoOpen = !this._infoOpen;
    this.parameters.style.display = this._infoOpen ? 'none' : '';
    this.inertiaInfo.style.display = this._infoOpen ? '' : 'none';
    this.infoToggle.textContent = this._infoOpen ? '−' : '+';
    this.infoToggle.setAttribute?.('aria-expanded', String(this._infoOpen));
    this.infoToggle.setAttribute?.('aria-label', this._infoOpen ? 'Volver a Parámetros' : 'Mostrar información de la inercia del humano');
  }

  _updateInertiaInfo(state) {
    const human = state.human ?? { mass:70, inertia:[12.5,13.5,1.6] };
    const matrices = state.inertiaMatrices ?? {};
    const matrix = matrices.Istar;
    const matrixCurrent = matrices.Ic;
    const Ip = human.inertia;
    const Ia = Number(state.params.Ia);
    const theta = Number(state.theta);
    const LWheel = state.L_wheel_world ?? state.L_wheel_body ?? state.L_wheel;
    const LBody = state.L_body_world ?? state.L_body_body ?? state.L_body;
    const LTotal = state.L_total_world ?? state.L_total ?? [0,0,0];
    const r = [0, 0.60, 0.40];
    const Iplz = 2.0;
    const simplified = state.params?.includeHuman === false;
    const Izz = Array.isArray(matrixCurrent) && Array.isArray(matrixCurrent[2]) ? Number(matrixCurrent[2][2]) : NaN;
    const signedOmegaHuman = this._signedHumanOmega(state.Omega_b);
    const lzSum = Number(LWheel[2]) + Number(LBody[2]);
    const lzCheck = Math.abs(lzSum) < 1e-9 ? '≈ 0' : lzSum.toFixed(6);

    const children = [
      this._line('Componentes propias del humano', `Iₓ = ${Ip[0].toFixed(1)} kg·m²   Iᵧ = ${Ip[1].toFixed(1)} kg·m²   I𝓏 = ${Ip[2].toFixed(1)} kg·m²`),
      this._line('Masa del humano', `mₚ = ${Number(human.mass).toFixed(2)} kg`),
      this._line('Posición de la rueda', `𝑟⃗ = (0, 0.60, 0.40) m`),
      this._line('Inercia de la plataforma', `I_z = ${Iplz.toFixed(1)} kg·m²`)
    ];

    if (simplified) {
      const modelNote = this.document.createElement('div');
      modelNote.className = 'ui-inertia-explanation ui-inertia-explanation--compact';
      modelNote.textContent = 'Modelo simplificado del humano: se conservan las inercias propias Iₓ, Iᵧ e I𝓏, pero se omite el acoplamiento geométrico del humano con la posición 𝑟⃗ y la masa de la rueda. La plataforma solo aporta I_z en la escena Plataforma.';
      children.push(modelNote);
    } else {
      const modelNote = this.document.createElement('div');
      modelNote.className = 'ui-inertia-explanation ui-inertia-explanation--compact';
      modelNote.textContent = 'Modelo completo del humano: I* incorpora las inercias propias y el acoplamiento geométrico asociado a la posición 𝑟⃗ y a la masa reducida humano–rueda. En Plataforma también incorpora I_z del soporte.';
      children.push(modelNote);
    }

    const matrixTitle = this.document.createElement('div');
    matrixTitle.className = 'ui-inertia-matrix-title';
    matrixTitle.textContent = 'Matriz I* — inercia base efectiva';
    children.push(matrixTitle);
    const matrixExplain = this.document.createElement('div');
    matrixExplain.className = 'ui-inertia-explanation ui-inertia-explanation--compact';
    matrixExplain.textContent = simplified
      ? 'I* parte de las inercias propias del humano. En Plataforma se suma la inercia I_z del soporte; no se añade el acoplamiento geométrico asociado a 𝑟⃗.'
      : 'I* reúne las inercias propias del humano, el acoplamiento geométrico asociado a 𝑟⃗ y, en Plataforma, la inercia I_z del soporte.';
    children.push(matrixExplain, this._matrixNode(matrix));

    const currentTitle = this.document.createElement('div');
    currentTitle.className = 'ui-inertia-matrix-title';
    currentTitle.textContent = 'Matriz I(θ) — inercia dinámica actual';
    children.push(currentTitle);
    const currentExplain = this.document.createElement('div');
    currentExplain.className = 'ui-inertia-explanation ui-inertia-explanation--compact';
    currentExplain.textContent = 'I(θ) se obtiene tomando I* y añadiendo la inercia de la rueda en las direcciones perpendiculares a su eje. Por eso I(θ) cambia cuando cambia θ.';
    children.push(currentExplain, this._matrixNode(matrixCurrent));

    if (this.mode !== 'Free') {
      const calcTitle = this.document.createElement('div');
      calcTitle.className = 'ui-inertia-matrix-title';
      calcTitle.textContent = 'Cálculo de Ω_z';
      children.push(calcTitle);

      const calcExplain = this.document.createElement('div');
      calcExplain.className = 'ui-inertia-explanation ui-inertia-explanation--compact';
      calcExplain.textContent = 'En Plataforma se conserva la componente vertical L_z del sistema.';
      children.push(calcExplain);

      children.push(this._line('Momento angular vertical de la rueda', `L_z,rueda = ${Number(LWheel[2]).toFixed(4)} kg·m²/s`));
      children.push(this._line('Inercia dinámica en Z', `I(θ)_zz = ${Izz.toFixed(4)} kg·m²`));
      children.push(this._line('Resultado', `Ω_z = − L_z,rueda / I(θ)_zz = − ${Number(LWheel[2]).toFixed(4)} / ${Izz.toFixed(4)} = ${signedOmegaHuman.toFixed(4)} rad/s`));
    } else {
      const calcTitle = this.document.createElement('div');
      calcTitle.className = 'ui-inertia-matrix-title';
      calcTitle.textContent = 'Cálculo de Ω';
      children.push(calcTitle);
      const calcExplain = this.document.createElement('div');
      calcExplain.className = 'ui-inertia-explanation ui-inertia-explanation--compact';
      calcExplain.textContent = 'En Vacío no existe la restricción de la plataforma. Ω se obtiene de la dinámica rotacional libre y conserva el momento angular vectorial total del sistema.';
      children.push(calcExplain);
    }

    const totalBlock = this._vectorBlock('L — total del sistema', LTotal, 'mundial');
    children.push(totalBlock);

    const checkTitle = this.document.createElement('div');
    checkTitle.className = 'ui-inertia-matrix-title';
    checkTitle.textContent = this.mode === 'Free' ? 'Conservación de L del sistema' : 'Chequeo de L_z';
    children.push(checkTitle);
    const checkExplain = this.document.createElement('div');
    checkExplain.className = 'ui-inertia-explanation ui-inertia-explanation--compact';
    checkExplain.textContent = this.mode === 'Free'
      ? 'En Vacío, el momento angular total del sistema se conserva como vector.'
      : 'En Plataforma, la componente L_z del sistema se conserva. Si el valor inicial es 0, la rueda y el humano se compensan en Z.';
    children.push(checkExplain);
    if (this.mode === 'Free') {
      children.push(this._line('Momento angular total', `L_total = (${Number(LTotal[0]).toFixed(4)}, ${Number(LTotal[1]).toFixed(4)}, ${Number(LTotal[2]).toFixed(4)}) kg·m²/s`));
    } else {
      children.push(this._line('Rueda + humano', `${Number(LWheel[2]).toFixed(4)} + (${Number(LBody[2]).toFixed(4)}) = ${lzCheck} kg·m²/s`));
    }

    const explanation = this.document.createElement('div');
    explanation.className = 'ui-inertia-explanation';
    explanation.textContent = simplified
      ? 'Los valores mostrados corresponden al modelo simplificado del humano. Las inercias propias del humano siguen participando en la dinámica, pero no se incorpora el acoplamiento geométrico asociado a 𝑟⃗. Los resultados se actualizan directamente desde el estado físico de la simulación.'
      : 'Los valores mostrados corresponden al modelo completo del humano. Además de las inercias propias, la dinámica incorpora el acoplamiento geométrico asociado a 𝑟⃗ y a la distribución de masa humano–rueda. Los resultados se actualizan directamente desde el estado físico de la simulación.';
    children.push(explanation);
    this._replace(this.inertiaInfo, children);
  }

  _matrixNode(matrix) {
    const table = this.document.createElement('div');
    table.className = 'ui-inertia-matrix';
    if (!Array.isArray(matrix) || matrix.length !== 3) {
      table.textContent = 'Matriz no disponible';
      return table;
    }
    for (const row of matrix) {
      const rowNode = this.document.createElement('div');
      rowNode.className = 'ui-inertia-matrix-row';
      for (const value of row) {
        const cell = this.document.createElement('span');
        cell.textContent = Number(value).toFixed(5);
        rowNode.appendChild(cell);
      }
      table.appendChild(rowNode);
    }
    const unit = this.document.createElement('div');
    unit.className = 'ui-inertia-matrix-unit';
    unit.textContent = 'kg·m²';
    table.appendChild(unit);
    return table;
  }

  getState(state, omega = state.params.s0, physicalOmega = this._dot(state.Omega_w, state.n_w)) {
    const wheel = state.L_wheel_world ?? state.L_wheel_body ?? state.L_wheel;
    const body = state.L_body_world ?? state.L_body_body ?? state.L_body;
    const LWheel = Array.isArray(wheel) ? [...wheel] : undefined;
    const LBody = Array.isArray(body) ? [...body] : undefined;
    return {
      omegaWheel: omega,
      physicalOmegaWheel: physicalOmega,
      omegaHuman: Array.isArray(state.Omega_b) ? this._signedHumanOmega(state.Omega_b) : undefined,
      humanMass: state.human?.mass,
      humanInertia: Array.isArray(state.human?.inertia) ? [...state.human.inertia] : undefined,
      Istar: state.inertiaMatrices?.Istar,
      Ic: state.inertiaMatrices?.Ic,
      Ia: state.params.Ia,
      D: state.params.D,
      R: state.params.R,
      m_w: state.params.m_w,
      LWheel,
      LBody,
      LWheelMagnitude: LWheel ? this._norm(LWheel) : undefined,
      LBodyMagnitude: LBody ? this._norm(LBody) : undefined,
      frame: 'world'
    };
  }

  _addHumanYHelp(row, value) {
    const helpText = 'Las componentes X, Y y Z de este panel usan el marco mundial, igual que las flechas de colores del overlay. El acoplamiento antropomórfico se origina en el marco corporal (Iᵧ𝓏 ≠ 0) y, al transformar el vector al mundo, sus componentes pueden redistribuirse entre X, Y y Z. No significa que exista un giro independiente alrededor de cada eje.';
    row.setAttribute?.('aria-label', `Componente Y del momento angular humano: ${value.toFixed(4)}. Ayuda disponible en el signo de interrogación.`);
    row.style.position = 'relative';

    const help = this.document.createElement('button');
    help.type = 'button';
    help.textContent = '?';
    help.setAttribute?.('aria-label', 'Explicación de la componente Y de L humano');
    help.className = 'ui-help';
    Object.assign(help.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '17px',
      height: '17px',
      marginLeft: '6px',
      padding: '0',
      border: '1px solid rgba(0,0,0,0.28)',
      borderRadius: '50%',
      background: 'var(--ui-tooltip-bg, rgba(255,255,255,0.97))',
      color: 'var(--ui-tooltip-text, #173a63)',
      fontSize: '11px',
      fontWeight: '700',
      lineHeight: '1',
      cursor: 'help',
      verticalAlign: 'middle'
    });

    const tooltip = this.document.createElement('div');
    tooltip.textContent = helpText;
    tooltip.setAttribute?.('role', 'tooltip');
    tooltip.setAttribute?.('aria-hidden', 'true');
    Object.assign(tooltip.style, {
      display: 'none',
      position: 'fixed',
      zIndex: '1000',
      maxWidth: 'min(360px, calc(100vw - 32px))',
      padding: '10px 12px',
      boxSizing: 'border-box',
      borderRadius: '8px',
      border: '1px solid rgba(0,0,0,0.18)',
      background: 'rgba(255,255,255,0.97)',
      color: '#111',
      boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
      fontSize: '13px',
      lineHeight: '1.4',
      pointerEvents: 'none'
    });

    const show = () => {
      tooltip.style.display = 'block';
      tooltip.setAttribute?.('aria-hidden', 'false');
      const rect = help.getBoundingClientRect?.();
      if (rect) {
        tooltip.style.left = `${Math.max(8, Math.min(rect.left, (globalThis.innerWidth || 800) - 368))}px`;
        tooltip.style.top = `${Math.min((globalThis.innerHeight || 600) - 12, rect.bottom + 6)}px`;
      } else {
        tooltip.style.left = '16px';
        tooltip.style.top = '16px';
      }
    };
    const hide = () => {
      tooltip.style.display = 'none';
      tooltip.setAttribute?.('aria-hidden', 'true');
    };
    help.addEventListener?.('mouseenter', show);
    help.addEventListener?.('mouseleave', hide);
    help.addEventListener?.('focus', show);
    help.addEventListener?.('blur', hide);

    row.appendChild(help);
    const tooltipHost = this.mount.parentElement || this.mount;
    tooltipHost.appendChild(tooltip);
    this._humanYTooltips.push(tooltip);
    row._humanYHelp = { help, tooltip, show, hide };
  }

  _clearHumanYTooltips() {
    for (const tooltip of this._humanYTooltips) tooltip.remove?.();
    this._humanYTooltips = [];
  }

  _replace(container, children) {
    if (typeof container.replaceChildren === 'function') container.replaceChildren(...children);
    else { container.children = []; if (typeof container.append === 'function') container.append(...children); }
  }

  _dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  _norm(v) { return Math.hypot(v[0], v[1], v[2]); }
  _deg(rad) { return rad * 180 / Math.PI; }

  dispose() {
    if (this.disposed) return;
    this._clearHumanYTooltips();
    this.root.remove();
    this.disposed = true;
  }
}

export { PhysicsDiagnostics };
export default PhysicsDiagnostics;
