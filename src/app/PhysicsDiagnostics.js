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
    return this._lineRich(label, value, value);
  }

  _lineRich(label, html, plain = html) {
    const wrapper = this.document.createElement('div');
    wrapper.className = 'ui-diagnostic-line';
    const heading = this.document.createElement('div');
    heading.textContent = label;
    heading.className = 'ui-diagnostic-label';
    const valueNode = this.document.createElement('div');
    valueNode.className = 'ui-diagnostic-value';
    valueNode.textContent = plain;
    if ('innerHTML' in valueNode) valueNode.innerHTML = html;
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
      this._lineRich('Velocidad angular de la rueda', 'ω = ' + omegaWheel.toFixed(2) + ' rad/s'),
      this._lineRich('Velocidad angular del humano', signedHumanOmega.toFixed(3) + ' rad/s'),
      this._lineRich('Diámetro de la rueda', 'D = ' + state.params.D.toFixed(2) + ' m'),
      this._lineRich('Masa de la rueda', this._math('m_w', '<i>m</i><sub>w</sub>') + ' = ' + state.params.m_w.toFixed(2) + ' kg', 'm_w = ' + state.params.m_w.toFixed(2) + ' kg'),
      this._lineRich('Ángulo del eje', 'θ = ' + this._deg(state.theta).toFixed(1) + '°'),
      this._lineRich('Momento de inercia de la rueda', this._math('I_a', '<i>I</i><sub>a</sub>') + ' = ' + state.params.Ia.toFixed(4) + ' kg·m²', 'I_a = ' + state.params.Ia.toFixed(4) + ' kg·m²'),
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

  _richBlock({html, plain, className='ui-inertia-explanation', math=false}) {
    const node = this.document.createElement('div');
    node.className = className + (math ? ' ui-math-block' : '');
    node.textContent = plain;
    if ('innerHTML' in node) node.innerHTML = html;
    return node;
  }

  _math(latex, html) {
    return `<span class="ui-math" data-latex="${latex.replace(/"/g, '&quot;')}">${html}</span>`;
  }

  _vecR(sub = '') {
    const suffix = sub ? `<sub>${sub}</sub>` : '';
    return `<span class="ui-vector-symbol"><span class="ui-vector-letter">r</span><span class="ui-vector-arrow" aria-hidden="true">→</span></span>${suffix}`;
  }

  _vec(letter, sub = '') {
    const suffix = sub ? `<sub>${sub}</sub>` : '';
    return `<span class="ui-vector-symbol"><span class="ui-vector-letter">${letter}</span><span class="ui-vector-arrow" aria-hidden="true">→</span></span>${suffix}`;
  }

  _updateInertiaInfo(state) {
    const human = state.human ?? { mass:70, inertia:[12.5,13.5,1.6] };
    const matrices = state.inertiaMatrices ?? {};
    const matrix = matrices.Istar;
    const matrixCurrent = matrices.Ic;
    const Ip = human.inertia;
    const Ia = Number(state.params.Ia);
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
      this._lineRich('Inercia propia del humano',
        this._math('I_x', '<i>I</i><sub>x</sub>') + ' = ' + Ip[0].toFixed(1) + '   ' +
        this._math('I_y', '<i>I</i><sub>y</sub>') + ' = ' + Ip[1].toFixed(1) + '   ' +
        this._math('I_z', '<i>I</i><sub>z</sub>') + ' = ' + Ip[2].toFixed(1) + ' kg·m²',
        `I_x = ${Ip[0].toFixed(1)}   I_y = ${Ip[1].toFixed(1)}   I_z = ${Ip[2].toFixed(1)} kg·m²`),
      this._lineRich('Masa del humano',
        this._math('m_p', '<i>m</i><sub>p</sub>') + ' = ' + Number(human.mass).toFixed(2) + ' kg',
        `m_p = ${Number(human.mass).toFixed(2)} kg`),
      this._lineRich('Posición de la rueda',
        this._math('\\vec{r}_w', this._vecR('w')) + ' = (0, 0.60, 0.40) m',
        'r_w = (0, 0.60, 0.40) m'),
      this._lineRich('Inercia de la plataforma',
        this._math('I_z', '<i>I</i><sub>z</sub>') + ` = ${Iplz.toFixed(1)} kg·m²`,
        `I_z = ${Iplz.toFixed(1)} kg·m²`)
    ];

    const matrixTitle = this.document.createElement('div');
    matrixTitle.className = 'ui-inertia-matrix-title';
    matrixTitle.textContent = 'I* — inercia base efectiva';
    if ('innerHTML' in matrixTitle) matrixTitle.innerHTML = this._math('I^*', '<i>I</i><sup>*</sup>') + ' — inercia base efectiva';
    children.push(matrixTitle);

    if (simplified) {
      children.push(this._richBlock({
        html: `${this._math('I^*', '<i>I</i><sup>*</sup>')} parte de las inercias propias del humano. En Plataforma se suma la inercia ${this._math('I_{plat}', '<i>I</i><sub>plat</sub>')} del soporte; no se añade el acoplamiento geométrico asociado a ${this._math('\\vec{r}', this._vecR())}.`,
        plain: 'I* parte de las inercias propias del humano. En Plataforma se suma la inercia I_plat del soporte; no se añade el acoplamiento geométrico asociado a r.'
      }));
    } else {
      children.push(this._richBlock({
        html: `${this._math('I^*', '<i>I</i><sup>*</sup>')} reúne las inercias propias del humano, el acoplamiento geométrico asociado a ${this._math('\\vec{r}_w', this._vecR('w'))} y, en Plataforma, la inercia ${this._math('I_z', '<i>I</i><sub>z</sub>')} del soporte.`,
        plain: 'I* reúne las inercias propias del humano, el acoplamiento geométrico asociado a r_w y, en Plataforma, la inercia I_z del soporte.'
      }));
    }
    children.push(this._matrixNode(matrix));

    const currentTitle = this.document.createElement('div');
    currentTitle.className = 'ui-inertia-matrix-title';
    currentTitle.textContent = 'I(θ) — inercia dinámica actual';
    if ('innerHTML' in currentTitle) currentTitle.innerHTML = this._math('I(\\theta)', '<i>I</i>(θ)') + ' — inercia dinámica actual';
    children.push(currentTitle);
    children.push(this._richBlock({
      html: `${this._math('I(\\theta)', '<i>I</i>(θ)')} se obtiene tomando ${this._math('I^*', '<i>I</i><sup>*</sup>')} y añadiendo la inercia de la rueda en las direcciones perpendiculares a su eje. Por eso ${this._math('I(\\theta)', '<i>I</i>(θ)')} cambia cuando cambia ${this._math('\\theta', 'θ')}.`,
      plain: 'I(theta) se obtiene tomando I* y añadiendo la inercia de la rueda en las direcciones perpendiculares a su eje. Por eso I(theta) cambia cuando cambia theta.'
    }));
    children.push(this._matrixNode(matrixCurrent));



    if (this.mode !== 'Free') {
      const calcTitle = this.document.createElement('div');
      calcTitle.className = 'ui-inertia-matrix-title';
      calcTitle.textContent = 'Cálculo de Ω_z';
      children.push(calcTitle);

      const calcExplain = this.document.createElement('div');
      calcExplain.className = 'ui-inertia-explanation ui-inertia-explanation--compact';
      calcExplain.textContent = 'En Plataforma se conserva la componente vertical L_z del sistema.';
      children.push(calcExplain);

      children.push(this._lineRich('Momento angular vertical de la rueda',
        this._math('L_{z,rueda}', '<i>L</i><sub>z,rueda</sub>') + ' = ' + Number(LWheel[2]).toFixed(4) + ' kg·m²/s',
        `L_z,rueda = ${Number(LWheel[2]).toFixed(4)} kg·m²/s`));
      children.push(this._lineRich('Inercia dinámica en Z',
        this._math('I(\\theta)_{zz}', '<i>I</i>(θ)<sub>zz</sub>') + ' = ' + Izz.toFixed(4) + ' kg·m²',
        `I(θ)_zz = ${Izz.toFixed(4)} kg·m²`));
      children.push(this._lineRich('Resultado',
        this._math('\\Omega_z', 'Ω<sub>z</sub>') + ' = − ' + this._math('L_{z,rueda}', '<i>L</i><sub>z,rueda</sub>') + ' / ' + this._math('I(\\theta)_{zz}', '<i>I</i>(θ)<sub>zz</sub>') + ' = − ' + Number(LWheel[2]).toFixed(4) + ' / ' + Izz.toFixed(4) + ' = ' + signedOmegaHuman.toFixed(4) + ' rad/s',
        `Ω_z = − L_z,rueda / I(θ)_zz = − ${Number(LWheel[2]).toFixed(4)} / ${Izz.toFixed(4)} = ${signedOmegaHuman.toFixed(4)} rad/s`));
    } else {
      const calcTitle = this.document.createElement('div');
      calcTitle.className = 'ui-inertia-matrix-title';
      calcTitle.textContent = 'Cálculo de Ω';
      children.push(calcTitle);
      children.push(this._richBlock({
        html: 'En Vacío no existe la restricción de la plataforma. Ω se obtiene de la dinámica rotacional libre y conserva el momento angular vectorial total del sistema.',
        plain: 'En Vacío no existe la restricción de la plataforma. Ω se obtiene de la dinámica rotacional libre y conserva el momento angular vectorial total del sistema.'
      }));
    }

    children.push(this._vectorBlock('L — total del sistema', LTotal, 'mundial'));

    const checkTitle = this.document.createElement('div');
    checkTitle.className = 'ui-inertia-matrix-title';
    checkTitle.textContent = this.mode === 'Free' ? 'Conservación de L del sistema' : 'Chequeo de L_z';
    children.push(checkTitle);
    children.push(this._richBlock({
      html: this.mode === 'Free'
        ? 'En Vacío, el momento angular total del sistema se conserva como vector.'
        : 'En Plataforma, la componente L<sub>z</sub> del sistema se conserva. Si el valor inicial es 0, la rueda y el humano se compensan en Z.',
      plain: this.mode === 'Free'
        ? 'En Vacío, el momento angular total del sistema se conserva como vector.'
        : 'En Plataforma, la componente L_z del sistema se conserva. Si el valor inicial es 0, la rueda y el humano se compensan en Z.'
    }));
    if (this.mode === 'Free') {
      children.push(this._line('Momento angular total', `L_total = (${Number(LTotal[0]).toFixed(4)}, ${Number(LTotal[1]).toFixed(4)}, ${Number(LTotal[2]).toFixed(4)}) kg·m²/s`));
    } else {
      children.push(this._line('Rueda + humano', `${Number(LWheel[2]).toFixed(4)} + (${Number(LBody[2]).toFixed(4)}) = ${lzCheck} kg·m²/s`));
    }


      if (this.mode !== 'Free') {
      const fullTitle = simplified ? 'Modelo simplificado del humano' : 'Modelo completo del humano';
            const fullHtml = simplified
              ? `<strong>${fullTitle}</strong><br><br>Los valores mostrados corresponden al modelo simplificado del humano. Las inercias propias del humano siguen participando en la dinámica, pero no se incorpora el acoplamiento geométrico asociado a ${this._math('\\vec{r}', this._vecR())}. Los resultados se actualizan directamente desde el estado físico de la simulación.<br><br>La inercia axial de la rueda es:<div class="ui-formula-display">${this._math('I_a = \\frac{m_w D^2}{4}', '<i>I</i><sub>a</sub> = <span class="frac"><span>m<sub>w</sub>D²</span><span>4</span></span>')}</div>Matriz base, con ${this._math('I_p = \\mathrm{diag}(I_x,I_y,I_z)', '<i>I</i><sub>p</sub> = diag(<i>I</i><sub>x</sub>, <i>I</i><sub>y</sub>, <i>I</i><sub>z</sub>)')} la inercia propia del humano. En Plataforma se suma la inercia ${this._math('I_{plat}', '<i>I</i><sub>plat</sub>')} del soporte, y no se añade el acoplamiento geométrico asociado a ${this._math('\\vec{r}', this._vecR())}:<div class="ui-formula-display">${this._math('I^* = I_p + I_{plat}\\hat e_z\\hat e_z^T', '<i>I</i><sup>*</sup> = <i>I</i><sub>p</sub> + <i>I</i><sub>plat</sub> ê<sub>z</sub>ê<sub>z</sub><sup>T</sup>')}</div>Matriz dinámica, con ${this._math('\\hat a=(\\cos\\theta,0,\\sin\\theta)', 'â = (cos θ, 0, sin θ)')} el versor del eje de la rueda:<div class="ui-formula-display">${this._math('I(\\theta)=I^*+\\frac{I_a}{2}(\\mathbb{1}-\\hat a\\hat a^T)', '<i>I</i>(θ) = <i>I</i><sup>*</sup> + <span class="frac"><span><i>I</i><sub>a</sub></span><span>2</span></span>(𝟙 − ââ<sup>T</sup>')}</div><strong>Momento angular del humano</strong><div class="ui-formula-display">${this._math('\\vec L_{humano}=I^*\\vec\\Omega', `${this._vec('L','humano')} = I<sup>*</sup> ${this._vec('Ω')}`)}</div>En Plataforma, como ${this._math('I^*', '<i>I</i><sup>*</sup>')} es diagonal y ${this._math('\\vec\\Omega=(0,0,\\Omega_z)', `${this._vec('Ω')} = (0, 0, Ω<sub>z</sub>)`)}, el momento angular del humano queda dirigido únicamente sobre el eje z. Por lo tanto, solo interviene ${this._math('I^*_{zz}=I_z+I_{plat}', 'I<sup>*</sup><sub>zz</sub> = I<sub>z</sub> + I<sub>plat</sub>')} y no hay componentes en x ni en y.<br><br><strong>Velocidad angular del humano</strong><br>Ω<sub>z</sub> sale de conservar la componente vertical del momento angular, que al inicio vale cero. La rueda aporta por su giro propio:<div class="ui-formula-display">${this._math('L_{z,axial}=I_a\\omega\\sin\\theta', 'L<sub>z, axial</sub> = I<sub>a</sub> ω sin θ')}</div>y el humano arrastra el conjunto con inercia ${this._math('I(\\theta)_{zz}', '<i>I</i>(θ)<sub>zz</sub>')}:<div class="ui-formula-display">${this._math('I(\\theta)_{zz}\\Omega_z+I_a\\omega\\sin\\theta=0', '<i>I</i>(θ)<sub>zz</sub> Ω<sub>z</sub> + I<sub>a</sub>ω sin θ = 0')}<br>${this._math('\\Rightarrow\\quad \\Omega_z=-\\frac{I_a\\omega\\sin\\theta}{I(\\theta)_{zz}}', '⇒ Ω<sub>z</sub> = − <span class="frac"><span>I<sub>a</sub>ω sin θ</span><span>I(θ)<sub>zz</sub></span></span>')}</div>El signo negativo indica giro opuesto al de la rueda (horario visto desde +z). En el numerador va solo la parte axial, porque la transversal ya está dentro de ${this._math('I(\\theta)_{zz}', '<i>I</i>(θ)<sub>zz</sub>')}.`
              : `<strong>${fullTitle}</strong><br><br>Los valores mostrados corresponden al modelo completo del humano. Además de las inercias propias, la dinámica incorpora el acoplamiento geométrico asociado a ${this._math('\\vec{r}', this._vecR())} y a la distribución de masa humano–rueda. Los resultados se actualizan directamente desde el estado físico de la simulación.<br><br>Las matrices usan la masa reducida humano–rueda ${this._math('\\mu', '<i>μ</i>')} y la inercia axial de la rueda ${this._math('I_a', '<i>I</i><sub>a</sub>')}:<div class="ui-formula-display">${this._math('\\mu=\\frac{m_p m_w}{m_p+m_w},\\qquad I_a=\\frac{m_wD^2}{4}', 'μ = <span class="frac"><span>m<sub>p</sub> m<sub>w</sub></span><span>m<sub>p</sub> + m<sub>w</sub></span></span>   I<sub>a</sub> = <span class="frac"><span>m<sub>w</sub>D²</span><span>4</span></span>')}</div>Matriz base, con ${this._math('I_p=\\mathrm{diag}(I_x,I_y,I_z)', '<i>I</i><sub>p</sub> = diag(<i>I</i><sub>x</sub>, <i>I</i><sub>y</sub>, <i>I</i><sub>z</sub>)')} la inercia propia del humano:<div class="ui-formula-display">${this._math('I^*=I_p+\\mu(\\lVert\\vec r\\rVert^2\\mathbb1-\\vec r\\vec r^T)+I_{plat}\\hat e_z\\hat e_z^T', `<i>I</i><sup>*</sup> = <i>I</i><sub>p</sub> + μ(‖${this._vecR()}‖²𝟙 − ${this._vecR()}${this._vecR()}<sup>T</sup>) + I<sub>plat</sub> ê<sub>z</sub>ê<sub>z</sub><sup>T</sup>`)}</div>Matriz dinámica, con ${this._math('\\hat a=(\\cos\\theta,0,\\sin\\theta)', 'â = (cos θ, 0, sin θ)')} el versor del eje de la rueda:<div class="ui-formula-display">${this._math('I(\\theta)=I^*+\\frac{I_a}{2}(\\mathbb1-\\hat a\\hat a^T)', '<i>I</i>(θ) = <i>I</i><sup>*</sup> + <span class="frac"><span><i>I</i><sub>a</sub></span><span>2</span></span>(𝟙 − ââ<sup>T</sup>')}</div><strong>Momento angular del humano</strong><div class="ui-formula-display">${this._math('\\vec L_{humano}=I^*\\vec\\Omega', `${this._vec('L','humano')} = I<sup>*</sup> ${this._vec('Ω')}`)}</div>En Plataforma ${this._math('\\vec\\Omega=(0,0,\\Omega_z)', `${this._vec('Ω')} = (0, 0, Ω<sub>z</sub>)`)}, así que solo interviene la tercera columna de ${this._math('I^*', '<i>I</i><sup>*</sup>')}.<br><br><strong>Velocidad angular del humano</strong><br>Ω<sub>z</sub> sale de conservar la componente vertical del momento angular, que al inicio vale cero. La rueda aporta por su giro propio:<div class="ui-formula-display">${this._math('L_{z,axial}=I_a\\omega\\sin\\theta', 'L<sub>z, axial</sub> = I<sub>a</sub> ω sin θ')}</div>y el humano arrastra el conjunto con inercia ${this._math('I(\\theta)_{zz}', '<i>I</i>(θ)<sub>zz</sub>')}:<div class="ui-formula-display">${this._math('I(\\theta)_{zz}\\Omega_z+L_{z,axial}=0\\quad\\Rightarrow\\quad\\Omega_z=-\\frac{I_a\\omega\\sin\\theta}{I(\\theta)_{zz}}', '<i>I</i>(θ)<sub>zz</sub> Ω<sub>z</sub> + L<sub>z, axial</sub> = 0 ⇒ Ω<sub>z</sub> = − <span class="frac"><span>I<sub>a</sub>ω sin θ</span><span>I(θ)<sub>zz</sub></span></span>')}</div>El signo negativo indica giro opuesto al de la rueda (horario visto desde +z). En el numerador va solo la parte axial, porque la transversal ya está dentro de ${this._math('I(\\theta)_{zz}', '<i>I</i>(θ)<sub>zz</sub>')}.`;
            children.push(this._richBlock({html: fullHtml, plain: simplified ? 'Modelo simplificado del humano. Los valores mostrados corresponden al modelo simplificado del humano. Se omite el acoplamiento geométrico asociado a r y a la masa de la rueda. La inercia axial de la rueda es I_a = m_w D²/4. Matriz base I* = I_p + I_plat e_z e_z^T. Matriz dinámica I(theta) = I* + (I_a/2)(1 - a a^T). Momento angular del humano L_humano = I* Omega. Velocidad angular del humano: Omega_z = -I_a omega sin(theta)/I(theta)_zz.' : 'Modelo completo del humano. Los valores mostrados corresponden al modelo completo del humano. Además de las inercias propias, la dinámica incorpora el acoplamiento geométrico asociado a r y a la distribución de masa humano–rueda. Las matrices usan la masa reducida humano–rueda mu y la inercia axial de la rueda I_a. Matriz base I* y matriz dinámica I(theta). Momento angular del humano L_humano = I* Omega. Velocidad angular del humano: Omega_z = -I_a omega sin(theta)/I(theta)_zz.'}));
      }
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
