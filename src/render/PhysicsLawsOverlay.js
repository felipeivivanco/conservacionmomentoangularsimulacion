/** Student-facing educational accordion for the classical rotation laws. */
class PhysicsLawsOverlay {
  constructor({ document, mount } = {}) {
    if (!document || typeof document.createElement !== 'function') throw new TypeError('document is required');
    if (!mount || typeof mount.appendChild !== 'function') throw new TypeError('mount must provide appendChild()');
    this.document = document;
    this.mount = mount;
    this.disposed = false;
    this.visible = true;
    this.expanded = false;

    this.root = document.createElement('aside');
    this.root.className = 'ui-bottom-education ui-bottom-laws';
    this.root.setAttribute?.('aria-label', 'Definiciones Físicas');

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.textContent = '📖 Definiciones Físicas ▼';
    this.toggle.setAttribute?.('aria-expanded', 'false');
    this.toggle.className = 'ui-bottom-toggle';

    this.content = document.createElement('div');
    this.content.className = 'ui-bottom-content';

    const sections = [
      ['Velocidad angular', 'ω — Velocidad angular', 'Describe qué tan rápido gira un objeto y alrededor de qué eje.', 'ω = dθ/dt', 'Unidad: rad/s.'],
      ['Momento angular', '𝑳 — Momento angular', 'Mide la cantidad de movimiento de rotación de un cuerpo. Para una rotación alrededor de un eje fijo:', '𝑳 = Iω', 'La dirección se relaciona con el eje de giro y el sentido se determina con la regla de la mano derecha.'],
      ['Momento de inercia', 'I — Momento de inercia', 'Mide qué tan difícil es cambiar el estado de rotación de un cuerpo. Depende de la masa y de cómo está distribuida respecto del eje.', 'I = Σ mᵢrᵢ²', 'Para una distribución continua: I = ∫ r² dm.'],
      ['Torque', 'τ — Torque', 'Describe la capacidad de una fuerza para cambiar el movimiento de rotación.', 'τ = d𝑳/dt', 'La variación del momento angular requiere un torque externo neto.'],
      ['Conservación del momento angular', 'Conservación del momento angular', 'Si el torque externo neto sobre el sistema físico considerado es cero:', 'τ_ext = 0  ⇒  𝑳 = constante', 'El momento angular del sistema físico considerado se conserva.'],
      ['Regla de la mano derecha', 'Regla de la mano derecha', 'Los dedos siguen el sentido de giro y el pulgar indica la dirección del vector momento angular.', null, '']
    ];

    for (const [, headingText, bodyText, equation, note] of sections) {
      const section = document.createElement('section');
      section.className = 'ui-education-section';
      const heading = document.createElement('div');
      heading.textContent = headingText;
      heading.className = 'ui-education-heading';
      const body = document.createElement('div');
      body.textContent = bodyText;
      section.appendChild(heading);
      section.appendChild(body);
      if (equation) {
        const formula = document.createElement('div');
        formula.textContent = equation;
        formula.className = 'ui-formula';
        section.appendChild(formula);
      }
      if (note) {
        const noteNode = document.createElement('div');
        noteNode.textContent = note;
        noteNode.className = 'ui-education-note';
        section.appendChild(noteNode);
      }
      this.content.appendChild(section);
    }

    this.toggle.addEventListener?.('click', () => this.setExpanded(!this.expanded));
    this.root.append(this.toggle, this.content);
    mount.appendChild(this.root);
    this.setExpanded(false);
  }

  setExpanded(expanded) {
    this.expanded = Boolean(expanded);
    this.mount.parentElement?.style?.setProperty?.('--ui-dock-height', this.expanded ? 'min(34vh, 270px)' : '64px');
    this.content.style.display = this.expanded ? 'block' : 'none';
    this.toggle.textContent = this.expanded ? '📖 Definiciones Físicas ▲' : '📖 Definiciones Físicas ▼';
    this.toggle.setAttribute?.('aria-expanded', String(this.expanded));
  }

  // Kept as a no-op compatibility method: the educational panel is always present.
  setVisible(visible) {
    this.visible = true;
    this.root.style.display = 'block';
  }

  dispose() {
    if (this.disposed) return;
    this.root.remove();
    this.disposed = true;
  }
}

export { PhysicsLawsOverlay };
export default PhysicsLawsOverlay;
