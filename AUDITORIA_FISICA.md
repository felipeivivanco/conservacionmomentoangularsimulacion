# Auditoría física del SPEC + propuesta de motor
Conservación del momento angular — rueda de bicicleta, plataforma vs. cuerpo libre

Alcance: solo física y arquitectura del motor. Sin Three.js ni UI.
Nota: el `SPEC.md` recibido está **truncado** en el §11 (termina en `L_t_`). Audité hasta ahí; falta el resto (validación, parámetros, UI, salidas, si las había).

Verificación: la fórmula central del momento angular de la rueda (§2.3) la comprobé numéricamente contra un anillo discretizado en 720 masas puntuales (error ~1e-13, para varios θ, Ω, θ̇, s). Los números de ejemplo salen de ese mismo script.

---

## 0. Veredicto

El SPEC tiene la intuición correcta (L vectorial, dos modos, cuaterniones/cuerpo rígido 3D), pero **como está escrito no representa correctamente la física**. Hay 6 problemas críticos:

1. `dL_total/dt = 0` es falso en modo plataforma (solo se conserva Lz).
2. `n̂(θ) = (cosθ, 0, sinθ)` en el plano X–Z **global** es incorrecto: θ es una coordenada *relativa* cuerpo–rueda.
3. `L_wheel = I·ω·n̂` es incompleto: falta la inercia transversal de la rueda y el término de θ̇, y `ω` es ambigua (¿relativa o absoluta?).
4. `I_platform` no incluye la rueda, y la inercia efectiva del sistema **depende de θ**.
5. `I_body = diag(Ix,Iy,Iz)` vale para la persona sola, no para persona + rueda (tensor no diagonal, parallel-axis).
6. El slider de θ no puede ser un salto instantáneo: el resultado depende de la **trayectoria** θ(t), no solo del valor final.

Formulación recomendada: **cuaternión de orientación + L_total constante en el mundo + resolución algebraica de Ω con la "inercia bloqueada" (locked inertia) del sistema**. Las ecuaciones de Euler con tensor constante *no alcanzan*. El modo plataforma no es un modelo aparte: es el modo libre + una restricción (cojinete vertical ideal).

---

## 1. Hallazgos punto por punto

| # | Sección | Problema | Gravedad | Corrección |
|---|---|---|---|---|
| 1 | §3.1, §4, §11 | Se aplica `dL_total/dt = 0` a ambos modos. Con plataforma, el cojinete ejerce torques horizontales (Lx, Ly **no** se conservan). | Crítico | En plataforma solo `d(L·ẑ)/dt = 0`. El torque horizontal del cojinete es una salida a mostrar (§2.6). |
| 2 | §7 | `n̂` en el plano X–Z **fijo del mundo**. Si la persona gira, el plano de inclinación gira con ella. | Crítico | `n̂_body(θ)` en ejes del cuerpo; `n̂_world = R(q)·n̂_body(θ)`. |
| 3 | §6, §8 | `L_wheel = I_wheel·ω·n̂` solo es el momento de spin. Una rueda es un cuerpo axisimétrico con `I_axial ≠ I_transversal`; además la rueda es arrastrada por la rotación del cuerpo y por θ̇. `ω` no está definida como relativa o absoluta. | Crítico | Tensor `diag(I_t, I_t, I_a)` con `I_t = I_a/2` (lámina plana). Usar el spin **absoluto** `s = n̂·ω_w` como variable (§2.3). |
| 4 | §3.1, §9 | `I_platform` = persona + plataforma, sin la rueda. La rueda aporta `I_t·cos²θ` (y `m_w·d²` por su offset respecto del eje Z). Entonces `L_z` depende de θ a través de la inercia. | Crítico | Inercia efectiva `I_eff(θ)`, ver §2.6. |
| 5 | §9, §10 | `I_body` diagonal es válido para la persona sola en ejes principales. El conjunto persona + rueda (rueda desplazada del CM) tiene **productos de inercia**. Además `I_world = R·I_body·Rᵀ` cambia con la orientación. | Crítico | Tensor 3×3 simétrico completo en ejes del cuerpo; el mundo se obtiene rotando. |
| 6 | §7 | El slider como valor instantáneo implica torque infinito y un término `I_t·θ̇` que se vuelve una delta de Dirac. Rango 0–90° no permite el experimento clásico (flip de 180°, ΔL = 2L). | Crítico | Perfil de θ limitado en velocidad/aceleración (§2.7). Rango −90°…+90° (o 0…180°) más signo de spin. |
| 7 | §3.2 | "Suspendida libremente en el espacio": la persona no puede estar suspendida con gravedad, pero tampoco hace falta. Lo que se necesita es **torque externo nulo respecto del CM**. | Importante | Definir: caída libre/microgravedad, sin arrastre. Gravedad uniforme no da torque respecto del CM. |
| 8 | §5 | Falta declarar terna derecha (`X × Y = Z`) y distinguir ejes del **mundo** vs. ejes del **cuerpo**. Three.js es Y-arriba. | Importante | Motor interno Z-arriba, terna derecha; conversión solo en el adaptador de render. |
| 9 | §10 | Se pide decidir entre Euler/cuaterniones/etc. | Importante | Respuesta en §3. |
| 10 | §6 | `ω` de la rueda constante implica un motor que sostiene la velocidad relativa. Una rueda real gira libre: se conserva el spin absoluto. | Importante | Por defecto cojinete sin fricción → `p_s = I_a·s` constante (§2.3). Fricción como opción. |
| 11 | general | La energía **no** se conserva en el flip (los músculos hacen trabajo). No se define condición inicial ni dónde queda L inicial. | Menor | Mostrar trabajo del actuador; condición inicial explícita (§2.5). |
| 12 | §11+ | Documento truncado. | Menor | Reenviar. |

---

## 2. Modelo físico propuesto

### 2.1 Sistema, marcos y supuestos (explícitos)

Sistema: cuerpo B (persona, y plataforma en modo 1) + rueda W. Marco del mundo: inercial, terna derecha, Z hacia arriba. Marco del cuerpo: fijo a B, origen en el CM del conjunto; convención: `Z_b` eje longitudinal (cabeza), `X_b` hacia adelante, `Y_b` lateral.

Supuestos, todos idealizaciones:

- **A1.** Persona = cuerpo rígido de forma fija. (Real: mover los brazos cambia la inercia; se ignora.)
- **A2.** La rueda es rígida, axisimétrica, y gira alrededor de su **propio CM**, que está fijo en el cuerpo (natural: la sostenés del eje por el centro). Consecuencia: el CM total no se mueve respecto del cuerpo y no hay acoplamiento de traslación. Si en algún momento se quiere inclinar la rueda alrededor de otro punto, esto se rompe y hay que agregar traslación del CM.
- **A3.** Articulación de inclinación ideal: una bisagra con eje fijo en el cuerpo, perpendicular al plano de inclinación. Cojinete del spin sin fricción (por defecto).
- **A4.** Sin torques externos respecto del CM (modo libre) / cojinete vertical ideal (modo plataforma).
- **A5.** L se calcula respecto del CM del conjunto; el CM se mueve con velocidad constante (o en caída libre) y se puede renderizar quieto (invariancia galileana).

### 2.2 Cinemática de la rueda

Convención del SPEC: `n̂_b(θ) = (cosθ, 0, sinθ)` en ejes del cuerpo (θ = 0 eje horizontal, θ = 90° eje vertical/longitudinal).

Velocidad angular de inclinación relativa al cuerpo: `θ̇·ĥ`, con **`ĥ = −ŷ_b`**. Signo explícito: al aumentar θ, `n̂` va de +X hacia +Z, que es una rotación alrededor de **−Y** por la regla de la mano derecha. Se verifica que `ĥ × n̂ = dn̂/dθ = (−sinθ, 0, cosθ)`.

Velocidad angular absoluta de la rueda:

```text
ω_w = Ω_b + θ̇·ĥ + ω_rel·n̂
s   = n̂ · ω_w = ω_rel + n̂·Ω_b      (spin absoluto; ĥ ⟂ n̂)
```

### 2.3 Momento angular de la rueda (respecto de su CM)

```text
L_w = I_a·s·n̂ + I_t·(Ω_b − (n̂·Ω_b)·n̂) + I_t·θ̇·ĥ
```

Tres términos: spin, arrastre transversal por la rotación del cuerpo, y arrastre por la inclinación. Esto es lo que el SPEC omite. (Verificado contra el anillo discretizado.)

Con cojinete sin fricción, el torque a lo largo del eje de la rueda es cero, así que **`p_s ≡ I_a·s` es constante**. Esto es el error conceptual de "ω constante": lo que se conserva es el spin absoluto, no la velocidad relativa a las manos. Ambas coinciden solo si Ω·n̂ ≈ 0. En los números de abajo la diferencia es de orden 3–6 %, pero cambia la estructura de la ecuación.

Con `p_s` como variable de estado, la inercia axial de la rueda queda absorbida y **solo la inercia transversal entra en el acoplamiento**:

```text
L_w = p_s·n̂ + I_t·(1 − n̂·n̂ᵀ)·Ω_b + I_t·θ̇·ĥ
```

### 2.4 Momento angular total y ecuación de estado (formulación de inercia bloqueada)

En ejes del cuerpo:

```text
L_b = I_c(θ)·Ω_b + p_s·n̂_b(θ) + I_t·θ̇·ĥ

I_c(θ) = I_B* + I_t·(1 − n̂_b·n̂_bᵀ)
```

- `I_B*`: tensor 3×3 simétrico de persona (y plataforma) **más** parallel-axis de la rueda respecto del CM total: `μ·(|d|²·1 − d·dᵀ)`, con `μ = m_B·m_w/(m_B + m_w)` y `d` el vector CM-cuerpo → CM-rueda. Constante en el cuerpo por A2.
- `I_c(θ)` depende de θ **solo** por el término transversal de la rueda.

Sin torque externo, `L_world` es un vector constante `L0`. Entonces, en cada instante:

```text
L_b   = R(q)ᵀ · L0
Ω_b   = I_c(θ)⁻¹ · ( L_b − p_s·n̂_b(θ) − I_t·θ̇·ĥ )      ← solve lineal 3×3, algebraico
q̇     = ½ · q ⊗ (0, Ω_b)                                  ← única EDO de orientación
n̂_world = R(q) · n̂_b(θ)
```

Esto es la ecuación de reconstrucción de un sistema con simetría SO(3) (el problema del gato que cae). Ventajas: conserva `|L|` exacto por construcción y no hace falta integrar Ω.

Equivalente en ejes del cuerpo (útil para validar de forma independiente): `L̇_b = −Ω_b × L_b`. Es la ecuación de Euler generalizada para inercia y momento interno variables: `d/dt(I·Ω + h) + Ω × (I·Ω + h) = 0`. Reduce a Euler clásico solo si `I` y `h` son constantes (θ̇ = 0 y θ fijo, que es el giróstato de "doble spin").

### 2.5 Modo libre

Estado: `q` (cuaternión unitario), θ, θ̇ (perfil), `p_s`, `L0`.

Condición inicial coherente: cuerpo en reposo (`Ω_b = 0`) con la rueda girando: `L0 = R(q0)·(p_s·n̂_b(θ0) + I_t·θ̇0·ĥ)`; con θ̇0 = 0, `L0 = p_s·n̂_world0`. Es decir, en reposo el sistema ya tiene L ≠ 0, y no pasa nada hasta que θ cambie.

Inercias típicas, orden de magnitud a calibrar con tablas antropométricas (tipo Hanavan / de Leva): persona de ~70 kg, `I_x ≈ I_y ≈ 12–14 kg·m²`, `I_z ≈ 1–1.5` (brazos al costado) a `≈ 2.5–3` (brazos extendidos con la rueda). Fuerte anisotropía: la respuesta alrededor del eje longitudinal es ~5–10 veces más rápida que alrededor de los transversales.

Ejemplo ilustrativo (m_w = 3 kg, R = 0.34 m → `I_a = 0.347`, `I_t = 0.173`; s = 60 rad/s → `p_s = 20.8 kg·m²/s`; `I_x = I_y = 13`, `I_z = 2.5`): la solución algebraica de Ω con θ = 0 y el cuerpo aún en su orientación inicial da `Ω ≈ (−1.60, 0, +7.78) rad/s`. Es solo orden de magnitud: durante el giro `q` cambia y el problema es fuertemente no lineal. Justifica por qué el modo libre necesita 3D completo.

Efecto adicional en modo libre: con `I_x, I_y, I_z` distintos, existe el **eje intermedio inestable** (teorema de la raqueta / Dzhanibekov). Sirve como test del integrador (§5).

### 2.6 Modo plataforma = modo libre + restricción

Restricción: cojinete vertical ideal en Z. `Ω_b = Ω·ẑ`. Solo `L·ẑ` se conserva:

```text
L_z = ẑ·[ I_c(θ)·ẑ ]·Ω + p_s·n_z + I_t·θ̇·(ĥ·ẑ)
```

Con inclinación en el plano X–Z del cuerpo, `ĥ` es horizontal, así que `ĥ·ẑ = 0`. Con `n_z = sinθ` y `I_p' = I_persona+plataforma respecto del eje Z + m_w·d²`:

```text
Ω_z(θ) = ( L_z0 − p_s·sinθ ) / ( I_p' + I_t·cos²θ )
```

Forma cerrada, y benchmark analítico. Con los mismos parámetros y `I_p' = 6 kg·m²`, `L_z0 = p_s` (rueda vertical, `θ = 90°`, todo en reposo):

| θ | Ω_z (rad/s) |
|---|---|
| +90° | 0 |
| +45° | +1.00 |
| 0° | +3.37 |
| −45° | +5.84 |
| −90° | +6.94 (flip de 180°, ΔL_body = 2·p_s) |

Signo explícito: al llevar la rueda de vertical a horizontal, la rueda "entrega" su Lz al cuerpo y **la persona gira en el mismo sentido que giraba la rueda** (Ω_z > 0 si `p_s > 0`, es decir, antihorario visto desde arriba).

Torque del cojinete (horizontal): como `L_total` horizontal **no** es constante (`L_h` rota junto con la plataforma), el cojinete ejerce `τ_bearing = dL_total/dt`. Se calcula como salida; su componente Z debe dar 0 (test).

Constante de plataforma: puede tener fricción `−c·Ω_z` (torque externo, disipa L). Por defecto `c = 0`.

### 2.7 Tratamiento físico de θ

θ es una **variable de forma** (coordenada de la articulación cuerpo–rueda), controlada por la persona con torque interno. Hay que separar dos cosas:

- **Qué reacción produce**: por conservación, la reacción sobre el cuerpo sale del algebra de §2.4 en función de `θ(t)` y `θ̇(t)`. Da lo mismo cómo se genera el torque, porque es interno.
- **Qué trayectorias son alcanzables**: un torque humano es finito. Un salto de θ requiere torque infinito. Numéricamente, un salto Δθ en un paso `dt` mete un término `I_t·Δθ/dt` que depende del framerate y produce una rotación finita espuria del cuerpo (~ `(I_t/I)·Δθ`, dependiente de `dt`). Inaceptable.

Propuesta: el slider fija un **objetivo** `θ_target`; el estado real `(θ, θ̇)` lo alcanza con perfil limitado (`|θ̇| ≤ θ̇_max`, `|θ̈| ≤ θ̈_max`, o filtro de 2º orden críticamente amortiguado con saturación). Valores iniciales tunables: `θ̇_max ≈ 60–90°/s`.

Chequeo de plausibilidad para mostrar: el torque giroscópico de inclinar la rueda es `p_s·θ̇` (~33 N·m con los números de arriba a 90°/s), comparable al máximo humano. Si supera un límite configurable, se marca "esfuerzo no humano".

Dirección de la reacción: el torque que la persona ejerce sobre la rueda al inclinarla es `p_s·θ̇·t̂` con `t̂ = dn̂/dθ` (perpendicular a `n̂` y a la bisagra), no a lo largo de la bisagra. La reacción sobre el cuerpo es `−p_s·θ̇·t̂`. Es muy buena salida visual para vectores.

Extensión posterior (v2): joint accionado por torque (θ dinámico con `θ̈` desde un PD saturado). No hace falta para v1.

### 2.8 Energía y diagnósticos

- `E_cin` total no se conserva durante el flip (el actuador hace trabajo). Mostrar `W_actuador` acumulado. **Solo con θ̇ = 0** se conserva la energía: eso es un test (§5).
- Diagnósticos por frame: `L_w`, `L_B`, `L_total` (mundo), `|L_total|` y su error, `Ω_b` y `Ω_world`, `E_cin`, `p_s·θ̇` (esfuerzo), `τ_bearing` (modo 1).
- Fricción/aire: cojinete de la rueda (interno, transfiere L al cuerpo: `ṗ_s = −c·ω_rel`) vs. arrastre del aire (externo, pierde L). Ambos opcionales, por defecto 0.

---

## 3. Formulación: comparativa y decisión

| Opción | Veredicto |
|---|---|
| 3 rotaciones independientes X, Y, Z / ángulos de Euler | **No.** Las rotaciones finitas no conmutan; gimbal lock. |
| Ecuaciones de Euler con `I` constante | **Insuficientes.** `I_c(θ)` y el momento interno `h` varían en el tiempo. |
| Euler generalizado (giróstato con inercia variable), cuerpo | Correcto. Usarlo como **validación independiente**. |
| **Cuaternión + `L0` en el mundo + Ω algebraico** | **Recomendada (primaria).** Conserva |L| por construcción, sin drift, una sola EDO (`q`). |
| Matriz de rotación | Válida, pero requiere re-ortonormalizar; se usa solo derivada de `q` para armar `R`. |
| Multicuerpo Newton–Euler completo | Válida; se usa como oráculo offline (validador), no en tiempo real. |

Sobre el tensor en mundo vs. cuerpo: se guarda en el cuerpo (constante salvo por `I_t·(1 − n̂n̂ᵀ)`). Se rota al mundo solo si hace falta, con `I_world = R·I_b·Rᵀ`. No se resuelve nada en el mundo con un tensor constante, ese es un error clásico.

---

## 4. Integración numérica

- Paso fijo `dt` (p. ej. 1/240 s), acumulador, tope de subpasos por frame. La física no depende de FPS.
- Float64 en el motor.
- Estado a integrar: `q` (4) y el perfil de θ. `L0` y `p_s` constantes.
- Método: RK4 sobre `q` con renormalización por paso, o mejor un integrador de grupo de Lie: `q_{n+1} = exp(½·Ω·dt) ⊗ q_n`. Con Ω evaluado algebraicamente en cada etapa.
- Como Ω es función explícita del estado, no hay término rígido; RK4 a 240 Hz es holgado para Ω ~ 10 rad/s.

---

## 5. Plan de validación (tests analíticos)

1. **Forma cerrada modo 1**: `Ω_z(θ)` de §2.6 contra el motor restringido (error < 1e-9). Tabla de §2.6 como test de regresión.
2. **`L_w` vs. masas puntuales**: ya hecho para la fórmula; conservarlo como test unitario del módulo de inercia.
3. **Euler–Poinsot** (θ̇ = 0, θ fijo): `T` y `|L|` constantes; verificar el **eje intermedio inestable**.
4. **Consistencia modo 1 ⇄ modo 2**: modo libre con inercias transversales `→ ∞` reproduce modo 1.
5. **Validación independiente**: integrar `L̇_b = −Ω_b × L_b` (Euler generalizado) en paralelo y comparar `q(t)` con la formulación primaria.
6. **Reversibilidad**: subir y bajar θ con L_total ≠ 0 y comparar con predicción (la orientación final depende de la trayectoria; sin trayectoria de forma cerrada trivial, usar el oráculo offline).
7. **Independencia de dt**: `dt` y `dt/2` dan el mismo resultado hasta el error del integrador.
8. **Límite `I_t → 0`**: recupera la fórmula simple del SPEC (`L_w = p_s·n̂`).
9. **Test de salto**: un `θ_target` en escalón no produce spikes ni dependencia de `dt`.

---

## 6. Arquitectura del motor (sin DOM, sin Three.js)

Módulo puro, testeable en Node y ejecutable después en un Web Worker sin cambios.

```text
engine/
  math/        vec3, mat3, quat (Float64)                  — sin dependencias
  params/      Params + validación (SI, rangos)            — I_a, I_t, m_w, R, I_B*, d, p_s, límites
  inertia/     compositeInertia(θ), wheelTensor            — I_c(θ), parallel-axis
  joint/       ThetaProfile (target → θ, θ̇ limitados)      — rate/accel limit
  constraint/  Free | VerticalBearing(c)                    — máscara/proyección de Ω
  solver/      solveOmega(state, constraint)                — 3×3 (libre) o escalar (plataforma)
  integrator/  step(state, dt) — quaternion exp/RK4         — paso fijo + acumulador
  diagnostics/ L_w, L_B, L_total, |L|err, T, W_act, τ_bearing, p_s·θ̇
  snapshot/    toSnapshot(state) → datos planos (Z-up, SI)  — contrato con el render
tests/         los 9 tests de §5
```

Interfaz pública mínima:

```text
createEngine(params, mode)          → engine
engine.setThetaTarget(θ)            // solo cambia el objetivo
engine.setMode('free'|'platform')   // ver abajo
engine.advance(dtReal)              // acumulador + pasos fijos
engine.snapshot()                   // q, n̂_world, Ω, L_w, L_B, L_tot, θ, diagnósticos
engine.reset(initialConditions)
```

Decisiones de diseño:

- **Un solo motor, dos restricciones.** El modo plataforma es `VerticalBearing`, no otro código. Evita divergencias y permite el test 4.
- **Cambio de modo con la simulación en marcha = evento no físico.** Pasar libre → plataforma equivale a un impulso que destruye `L_h` (y energía). Propuesta: cambiar de modo hace `reset` con los mismos parámetros, o un evento explícito documentado con la pérdida calculada.
- **Conversión de ejes y unidades solo en el adaptador de render** (Z-arriba, terna derecha → Y-arriba de Three.js).
- **Sin estado oculto**: el snapshot alcanza para dibujar y para los diagnósticos; el motor es determinista.
- **Worker opcional**: 3 DOF de orientación, corre sobre el hilo principal sin problemas; se deja lista la separación.

---

## 7. Decisiones que necesito de vos antes de pasar a implementación

1. **Cojinete de la rueda**: ¿por defecto sin fricción (`p_s` constante, recomendado) o con motor que mantiene la velocidad relativa?
2. **Rango de θ**: ¿−90°…+90° (recomendado, permite flip de 180°) o 0…180°?
3. **Punto de giro de la rueda**: ¿confirmás A2 (inclina alrededor de su propio CM, fijo en el cuerpo)? Si querés que la rueda se desplace al inclinarla, hay que sumar traslación del CM.
4. **Cambio de modo**: ¿`reset` o evento impulsivo documentado?
5. **Parámetros por defecto**: ¿usamos los del ejemplo (rueda 3 kg / R 0.34 m, persona 70 kg) o querés perfiles seleccionables (rueda liviana vs. cargada con plomo, como en el experimento de cátedra)?
6. **Resto del SPEC** (§11 en adelante).
