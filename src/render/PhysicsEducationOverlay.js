/** Student-facing guide to the physical model and its technical scope. */
class PhysicsEducationOverlay {
  constructor({ document, mount, scenario = 1 } = {}) {
    if (!document || typeof document.createElement !== 'function') throw new TypeError('document is required');
    if (!mount || typeof mount.appendChild !== 'function') throw new TypeError('mount must provide appendChild()');
    this.document = document;
    this.mount = mount;
    this.disposed = false;
    this.expanded = false;
    this.activeSection = 'what';
    this.scenario = scenario;

    this.root = document.createElement('aside');
    this.root.className = 'ui-bottom-education ui-bottom-what';
    this.root.setAttribute?.('aria-label', '¿Qué está pasando? y Salvedades técnicas');

    this.header = document.createElement('div');
    this.header.className = 'physics-education-header';

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.textContent = '💡 ¿Qué está pasando? ▼';
    this.toggle.setAttribute?.('aria-expanded', 'false');
    this.toggle.setAttribute?.('aria-controls', 'physics-education-content');
    this.toggle.className = 'ui-bottom-toggle physics-education-toggle';

    this.technicalToggle = document.createElement('button');
    this.technicalToggle.type = 'button';
    this.technicalToggle.textContent = 'Salvedades técnicas';
    this.technicalToggle.setAttribute?.('aria-expanded', 'false');
    this.technicalToggle.setAttribute?.('aria-controls', 'physics-education-content');
    this.technicalToggle.className = 'ui-bottom-toggle ui-bottom-technical-toggle';

    this.content = document.createElement('div');
    this.content.id = 'physics-education-content';
    this.content.className = 'ui-bottom-content';

    this.whatContent = this.document.createElement('div');
    this.technicalContent = this.document.createElement('div');
    this._buildWhatIsHappening();
    this._buildTechnicalCaveats();
    this.content.append(this.whatContent, this.technicalContent);

    this.toggle.addEventListener?.('click', () => {
      if (this.expanded && this.activeSection === 'what') this.setExpanded(false);
      else this.setSection('what', true);
    });
    this.technicalToggle.addEventListener?.('click', () => {
      if (this.expanded && this.activeSection === 'technical') this.setExpanded(false);
      else this.setSection('technical', true);
    });

    this.header.append(this.toggle, this.technicalToggle);
    this.root.append(this.header, this.content);
    mount.appendChild(this.root);
    this.setSection('what', false);
  }

  _section(container, headingText, bodyText, equation) {
    const section = this.document.createElement('section');
    section.className = 'ui-education-section';
    const heading = this.document.createElement('div');
    heading.textContent = headingText;
    heading.className = 'ui-education-heading';
    const body = this.document.createElement('div');
    body.textContent = bodyText;
    section.append(heading, body);
    if (equation) {
      const formula = this.document.createElement('div');
      formula.textContent = equation;
      formula.className = 'ui-formula';
      section.appendChild(formula);
    }
    container.appendChild(section);
    return section;
  }

  _buildWhatIsHappening() {
    const sections = [
      ['Masa', 'Al aumentar la masa de la rueda, aumenta su momento de inercia si la geometría se mantiene. Una mayor inercia significa que cuesta más cambiar su estado de rotación.'],
      ['Modelo de la rueda', 'En esta simulación aproximamos la rueda como un aro delgado (anillo), suponiendo que gran parte de su masa está concentrada cerca del borde. El momento de inercia depende de cómo está distribuida la masa respecto del eje de giro. Para una distribución general, puede expresarse como una suma de contribuciones de masa.', 'I = Σ mᵢrᵢ²\nI = mr²\nI = mD²/4'],
      ['Otros modelos de inercia', 'Un aro delgado o anillo tiene I = mr². Un disco o cilindro macizo tiene I = 1/2 mr². Un aro grueso puede modelarse teniendo en cuenta sus radios interior y exterior. Una rueda real también puede aproximarse como un modelo compuesto, sumando las contribuciones de llanta o neumático, radios, buje y otras partes.'],
      ['Diámetro y radio', 'Al aumentar el diámetro también aumenta el radio. En el modelo de aro, como la masa está más lejos del eje, el momento de inercia aumenta con el cuadrado del radio.'],
      ['Velocidad angular de la rueda', 'En esta simulación, ω representa la velocidad de spin de la rueda alrededor de su propio eje. El control fija ese spin; al cambiar la orientación del eje pueden cambiar las componentes cartesianas de la velocidad angular vectorial, sin que eso implique cambiar el spin alrededor del eje.', '𝑳 = Iω'],
      ['Momento angular y torque', 'Cuando giramos el eje de la rueda, cambiamos la dirección de su momento angular. Para cambiar la dirección de 𝑳 hace falta un torque.', 'τ = d𝑳/dt'],
      ['Conservación', 'Idealmente, cuando no actúa un torque externo neto relevante, el momento angular total del sistema se conserva aproximadamente. La rueda puede cambiar la dirección de su momento angular y el cuerpo responder adquiriendo momento angular. En esta configuración puede aparecer una componente Y del momento angular humano; esto no implica una pérdida de conservación y la dirección de esa componente depende de la configuración.', '𝑳_total = 𝑳_rueda + 𝑳_humano ≈ constante'],
      ['Suposiciones del modelo', 'La rueda se aproxima como un aro delgado y rígido; su distribución de masa está idealizada y no se modelan con detalle todas las partes de una rueda real. El objetivo es estudiar el fenómeno de momento angular y torque, no reproducir exactamente una bicicleta real.']
    ];
    if (this.scenario === 2) {
      sections.unshift([
        'Experimento en vacío',
        'Sin una plataforma que limite el movimiento, la persona puede reaccionar en los tres ejes. Al cambiar la dirección del momento angular de la rueda, aparece un torque de reacción sobre el conjunto humano. En ausencia de torque externo, el momento angular total del sistema se conserva.'
      ]);
    }
    for (const item of sections) this._section(this.whatContent, ...item);
  }

  _buildTechnicalCaveats() {
    const technical = [
      ['Marco teórico', 'Esta simulación estudia principalmente la dinámica rotacional de un sistema formado por un cuerpo y una rueda giratoria. La variable central es el momento angular. Cuando no existe torque externo neto sobre el sistema: el momento angular total se conserva. En la Escena 2, el sistema se considera libre de torque externo. En la Escena 1, la plataforma introduce una restricción externa: permite la rotación alrededor de Z y puede ejercer torque sobre las componentes horizontales. Por eso las dos escenas no deben interpretarse bajo exactamente las mismas condiciones de conservación.'],
      ['Idealización del cuerpo humano', 'El humano se representa mediante un cuerpo rígido equivalente con una distribución de masa e inercia definida. No se modela la anatomía real segmento por segmento. Por lo tanto, los valores de momento angular representan el comportamiento del modelo mecánico adoptado y no una medición biomecánica de una persona real. No se modelan individualmente brazos, piernas, torso y cabeza como cuerpos dinámicos independientes; la orientación global del cuerpo se calcula mediante la dinámica rotacional del modelo; la representación visual del humano es una representación del cuerpo rígido equivalente.'],
      ['Movimiento de los brazos', 'Los brazos tienen una función principalmente representativa: permiten visualizar cómo el cuerpo sostiene el eje de la rueda. Su movimiento visual no constituye un modelo biomecánico independiente y no modifica dinámicamente el tensor de inercia del cuerpo.'],
      ['Rueda y momento de inercia', 'La rueda utiliza el modelo geométrico adoptado por la simulación. Para la rueda tipo aro: I = mD²/4, donde m es la masa y D es el diámetro. El momento de inercia depende tanto de la masa como de cómo está distribuida respecto del eje de giro. Por eso modificar la masa o el diámetro modifica realmente la respuesta dinámica de la rueda.', 'I = mD²/4'],
      ['Diámetros extremos', 'Para diámetros muy grandes, la representación visual puede desplazar la rueda hacia delante para evitar intersecciones geométricas con el cuerpo. Este ajuste tiene finalidad de representación y no constituye un nuevo grado de libertad de la dinámica del cuerpo. Una corrección geométrica visual no debe interpretarse como una modificación de las ecuaciones físicas.'],
      ['Escena 1 — plataforma', 'En la Escena 1 el cuerpo está vinculado a una plataforma que restringe su movimiento rotacional. El modelo permite la rotación alrededor del eje vertical Z. La plataforma puede ejercer torque externo sobre el sistema en las direcciones horizontales. En esta escena no debe exigirse la conservación de las tres componentes del vector momento angular. La magnitud conservada relevante para esta restricción es la componente alrededor del eje Z.'],
      ['Escena 2 — vacío', 'La Escena 2 representa un sistema libre de torque externo neto. El entorno se idealiza como vacío y no se consideran fuerzas o torques externos relevantes para la dinámica rotacional estudiada. En estas condiciones, el momento angular total del sistema se conserva como vector. Cuando cambia la orientación del eje de la rueda, cambia la dirección de su momento angular. Como el momento angular total debe permanecer constante, el cuerpo desarrolla una reacción rotacional compensatoria. Esta es precisamente la reacción que explica el movimiento del astronauta.'],
      ['Vacío no significa ausencia de toda física', 'La representación de vacío no significa que el sistema quede inmóvil. Significa que no se consideran torques externos relevantes. El intercambio de momento angular entre la rueda y el cuerpo continúa ocurriendo internamente.'],
      ['Energía y trabajo del actuador', 'La conservación del momento angular no implica necesariamente conservación de la energía mecánica en esta simulación. El cambio programado del ángulo de la rueda es realizado por un actuador, que puede aportar o extraer energía del sistema. Por ello, durante una maniobra puede existir trabajo del actuador aunque el momento angular total permanezca conservado. Conservación de momento angular ≠ conservación automática de energía mecánica cuando existe un actuador realizando trabajo.'],
      ['Traslación del centro de masa', 'El modelo está concentrado en la dinámica rotacional. El centro de masa se mantiene sin una dinámica traslacional independiente. Por lo tanto, esta simulación no pretende representar caída libre, desplazamiento orbital o movimiento de traslación del sistema. En Escena 2 esto debe quedar especialmente claro: la palabra “vacío” no significa que estamos simulando una persona flotando con seis grados de libertad completos.'],
      ['Momento angular en Y', 'Las componentes del momento angular no deben interpretarse directamente como componentes independientes de la velocidad angular. Debido a la distribución espacial de masa, el tensor de inercia puede contener términos de acoplamiento. Por eso una velocidad angular principalmente orientada en Z puede producir una componente del momento angular en Y. Esto no significa que el cuerpo esté girando alrededor de Y.'],
      ['Diferencia entre Ω y L', 'La velocidad angular indica cómo está rotando el cuerpo. El momento angular depende además de la distribución de masa y de la orientación del cuerpo. Por eso Ω y L no tienen que apuntar siempre en la misma dirección en un cuerpo cuya distribución de masa no es esféricamente simétrica.'],
      ['Qué significa cambiar cada parámetro', 'Velocidad angular de la rueda: modificarla modifica el momento angular asociado al giro de la rueda. Sentido de giro: invertirlo invierte el sentido del momento angular de la rueda y puede invertir las correspondientes reacciones. Masa: modificarla cambia el momento de inercia de la rueda y, por lo tanto, su respuesta rotacional. Diámetro: modificarlo cambia la distribución de masa respecto del eje y, por lo tanto, modifica el momento de inercia. Ángulo del eje: modificarlo cambia la orientación del eje y, por lo tanto, la dirección del momento angular de la rueda. Ninguno de estos controles debe describirse como un simple efecto visual.'],
      ['Fuera del alcance del modelo', 'La simulación no pretende modelar biomecánica humana detallada; articulaciones individuales; deformación de la rueda; flexibilidad de brazos; vibraciones estructurales; resistencia del aire; fricción del aire; pérdidas reales de rodamientos; movimiento traslacional del centro de masa; dinámica orbital; contacto detallado entre pies y plataforma; respuesta estructural de la plataforma. No forman parte del modelo considerado en esta simulación.'],
      ['Aclaración sobre las reacciones visuales', 'La animación 3D no calcula la física de manera independiente. La orientación visual del cuerpo procede del estado físico calculado por el motor. La representación gráfica tiene como objetivo mostrar ese estado de forma comprensible.'],
      ['Regla de oro para interpretar la UI', 'En lugar de atribuir un fenómeno a que “el programa lo hace”, esta interfaz debe entenderse como una representación de lo que el modelo físico calcula o de lo que ocurre en las condiciones asumidas por esta simulación. La aplicación distingue entre fenómeno físico e idealización del modelo.'],
      ['Regla académica final', 'La simulación no pretende reproducir toda la realidad física. Pretende representar de manera consistente un modelo rotacional idealizado, con hipótesis explícitas, permitiendo observar cómo la conservación del momento angular y el acoplamiento entre rueda y cuerpo producen las reacciones observadas. La finalidad es distinguir resultado físico del modelo de simplificación adoptada por el modelo.']
    ];
    const title = this.document.createElement('div');
    title.textContent = 'Marco académico';
    title.className = 'ui-education-heading';
    this.technicalContent.appendChild(title);
    for (const item of technical) this._section(this.technicalContent, ...item);
  }

  setSection(section, expanded = true) {
    this.activeSection = section === 'technical' ? 'technical' : 'what';
    this.whatContent.style.display = this.activeSection === 'what' && expanded ? 'block' : 'none';
    this.technicalContent.style.display = this.activeSection === 'technical' && expanded ? 'block' : 'none';
    this.setExpanded(expanded);
  }

  setExpanded(expanded) {
    this.expanded = Boolean(expanded);
    this.mount.classList?.toggle('is-expanded', this.expanded);
    this.content.style.display = this.expanded ? 'block' : 'none';
    this.toggle.setAttribute?.('aria-expanded', String(this.expanded && this.activeSection === 'what'));
    this.technicalToggle.setAttribute?.('aria-expanded', String(this.expanded && this.activeSection === 'technical'));
    this.toggle.textContent = this.activeSection === 'what' && this.expanded ? '💡 ¿Qué está pasando? ▲' : '💡 ¿Qué está pasando?';
    this.technicalToggle.textContent = this.activeSection === 'technical' && this.expanded ? 'Salvedades técnicas ▲' : 'Salvedades técnicas';
    this.toggle.classList?.toggle('is-active', this.activeSection === 'what' && this.expanded);
    this.technicalToggle.classList?.toggle('is-active', this.activeSection === 'technical' && this.expanded);
  }

  dispose() {
    if (this.disposed) return;
    this.root.remove();
    this.disposed = true;
  }
}

export { PhysicsEducationOverlay };
export default PhysicsEducationOverlay;
