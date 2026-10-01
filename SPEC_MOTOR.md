# SPEC_MOTOR — Especificación matemática definitiva del motor
Conservación del momento angular · persona + rueda · modos `Free` y `VerticalBearing`

Alcance: solo el motor (física + integración). Sin render, sin UI.
Referencia numérica: `oracle/oracle.py` y `oracle/tests.py` (Python/NumPy, no es el motor de producción). **Todos los valores medidos de este documento salen de esa referencia** (`dt = 1/240 s`, parámetros por defecto de §2). Correr `python3 oracle/tests.py` los reproduce.

---

## 0. Correcciones a mi informe anterior

Antes de la spec, lo que cambió al verificar numéricamente:

1. **Ejes del cuerpo.** En el informe puse `X_b` hacia adelante. Lo corrijo: para conservar tu `n̂(θ) = (cosθ, 0, sinθ)` con el montaje clásico (eje de la rueda **lateral** a θ = 0), definí `X_b` = lateral derecha, `Y_b` = hacia adelante, `Z_b` = longitudinal (cabeza). Ver §1. Es la decisión D-1 de §11.
2. **Esfuerzo de la articulación.** Dije que `p_s·θ̇` era el indicador de plausibilidad. Está subestimado: el torque real de sostener θ(t) (`τ_h`) incluye el acoplamiento giroscópico con la rotación del cuerpo. Con defaults: `p_s·θ̇_max = 18.8 N·m` pero `τ_h,max = 53.3 N·m` (Free) y `40.4 N·m` (VerticalBearing). El indicador correcto es `τ_h` (§4.7).
3. **Trayectoria de θ.** La ley "decidir aceleración paso a paso" que insinué chatea y hace que el resultado dependa de `dt`. La reemplazo por un **plan analítico** (§5): exacto, independiente de `dt`. El vuelo de 180° dura **2.25 s** (no 2.0).
4. **Excursión de θ.** No hay overshoot fuera de ±90° (invariante demostrado en §5.3). Desaparece la decisión que planteaba.
5. **Default de spin.** `s0 = 40 rad/s` (antes usé 60): con 60 el giro de la persona superaba 1.2 rev/s y el torque de sostén pasaba los 120 N·m.
6. **Honestidad sobre los tests.** En la formulación primaria `L_total = L0` está *impuesto*, así que "L se conserva" es tautológico ahí. Los tests no tautológicos son: balance de energía, validador de Euler generalizado, oráculo de partículas, forma cerrada de VerticalBearing, torque del cojinete con `τ_z = 0`, y `τ_ext = 0` en Free (§10).

---

## 1. Marcos, convenciones y signos

**Unidades:** SI (m, kg, s, rad). Ángulos internos en rad. Float64.

**Marco del mundo `W`** (inercial): origen en el CM del conjunto, terna derecha, `X_W × Y_W = Z_W`, **`Z_W` hacia arriba**. Un CM en caída libre o con velocidad constante es equivalente (invariancia galileana): el CM se mantiene en el origen y no se simula traslación.

**Marco del cuerpo `B`** (fijo al cuerpo B = persona, más plataforma en `VerticalBearing`), origen en el CM del conjunto persona + rueda:

```text
X_b = lateral, hacia la derecha de la persona
Y_b = hacia adelante
Z_b = longitudinal, hacia la cabeza
X_b × Y_b = Z_b   (terna derecha)
```

**Orientación:** cuaternión unitario `q = (w, x, y, z)`, escalar primero, Hamilton. `R(q)` lleva coordenadas del cuerpo a las del mundo:

```text
v_W = R(q) · v_B

R(q) = [ 1-2(y²+z²)   2(xy - zw)    2(xz + yw)  ]
       [ 2(xy + zw)   1-2(x²+z²)    2(yz - xw)  ]
       [ 2(xz - yw)   2(yz + xw)    1-2(x²+y²)  ]
```

**Velocidad angular:** `Ω_b` = velocidad angular del cuerpo respecto del mundo, en componentes del cuerpo. Regla de la mano derecha en todo el documento.

**Triada de la rueda** (en ejes del cuerpo), para el ángulo `θ`:

```text
n̂(θ) = ( cosθ, 0, sinθ )      eje de la rueda
t̂(θ) = (-sinθ, 0, cosθ )      = dn̂/dθ
ĥ    = ( 0,   -1, 0    )      eje de la bisagra = -Ŷ_b
```

Verificación de signo: `ĥ × n̂ = t̂ = dn̂/dθ`. Por lo tanto la velocidad angular de inclinación relativa al cuerpo es `θ̇·ĥ`.

```text
θ = 0      n̂ = +X_b   (eje horizontal, apunta a la derecha de la persona)
θ = +90°   n̂ = +Z_b   (vertical, hacia arriba)
θ = -90°   n̂ = -Z_b   (vertical, hacia abajo)
θ aumenta  → el extremo +X_b del eje sube
```

**Spin:** `s` = componente del `ω` **absoluto** de la rueda a lo largo de `n̂`. `s > 0` = giro antihorario visto desde la punta de `n̂` mirando hacia la rueda. `p_s = I_a·s`.

**Modo `VerticalBearing`:** `q` es solo rotación alrededor de `Z_W` (yaw), con `q0 = identidad`, de modo que `Z_b ≡ Z_W`.

---

## 2. Parámetros y defaults documentados

Todos los valores por defecto son **estimaciones de orden de magnitud**, no mediciones. Están pensados para ser reemplazables.

| Símbolo | Default | Unidad | Nivel | Justificación / validez |
|---|---|---|---|---|
| `m_p` | 70 | kg | avanzado | Adulto típico. **Parámetro nuevo** (necesario para parallel-axis). |
| `I_p = (I_x, I_y, I_z)` | (12.5, 13.5, 1.6) | kg·m² | avanzado | Momentos principales de la persona respecto de su CM, en ejes de `B`. `I_x`: eje lateral; `I_y`: eje antero-posterior; `I_z`: eje longitudinal. Orden de magnitud de tablas antropométricas (Hanavan / de Leva) con los brazos algo adelantados. Deben cumplir la desigualdad triangular (cada uno < suma de los otros dos) y ser > 0. |
| `m_w` | 3.0 | kg | básico | Rueda tipo demo de cátedra. **Parámetro nuevo** (parallel-axis). |
| `D` | 0.68 | m | básico | Diámetro. `R = D/2 = 0.34`. Independiente de `I_a` (decisión 5). |
| `I_a` (I_wheel) | 0.30 | kg·m² | básico | Momento axial. Independiente de `D`. Validez: `0 < I_a ≤ m_w·R²` (= 0.347); advertir si `I_a < 0.5·m_w·R²`. |
| `κ_t = I_t / I_a` | 0.5 | — | avanzado | Rueda plana: `I_t = I_a/2` (exacto para una lámina). Cota rígida: `I_a ≤ 2·I_t`, o sea `κ_t ≥ 0.5`. Rango permitido `[0.5, 1]`. |
| `r_w` | (0, 0.60, 0.40) | m | avanzado | Posición del CM de la rueda respecto del CM de la persona, en ejes de `B`: centrada, 0.60 m adelante, 0.40 m arriba (brazos extendidos a la altura del hombro). **Parámetro nuevo.** |
| `I_pl_z` | 2.0 | kg·m² | avanzado | Solo `VerticalBearing`. Disco de 16 kg y 0.5 m de radio: `½·16·0.5²`. |
| `s0` | 40 | rad/s | básico | ≈ 382 rpm, giro a mano. Puede ser negativo. |
| `θ0` | +90° | — | básico | Eje vertical, montaje clásico. |
| `θ̇_max` | 90°/s = 1.5708 | rad/s | avanzado | Pedido. |
| `θ̈_max` | 360°/s² = 6.2832 | rad/s² | avanzado | 0.25 s hasta velocidad máxima; giro de 180° en 2.25 s, coherente con lo que hace una persona (1–3 s). |
| `τ_h,warn` | 50 | N·m | avanzado | Umbral **solo informativo** de esfuerzo (§4.7, D-4). |
| `dt` | 1/240 | s | motor | Paso fijo. |
| `Δt_frame,max` | 0.1 | s | motor | Tope del tiempo real por frame (anti espiral de la muerte). |

**Derivados:**

```text
I_t = κ_t · I_a                               = 0.15    kg·m²
p_s = I_a · s0                                = 12.0    kg·m²/s
μ   = m_p·m_w / (m_p + m_w)                   = 2.8767  kg
d   = r_w
```

**Por qué `m_p`, `m_w` y `r_w` son obligatorios:** el CM de la rueda está fuera del eje del cuerpo, y eso suma al tensor de inercia un término de Steiner `μ(|d|²·1 − d·dᵀ)`. Con los defaults sube `I_zz` de 1.6 a 2.64 (+65 %) y crea un producto de inercia `I_yz = −0.69 kg·m²`. Omitirlo sería una simplificación grande (D-2).

**Tensor de la base** (`B` = persona; en `VerticalBearing` se suma la plataforma):

```text
I_B* = diag(I_x, I_y, I_z) + μ·( |d|²·1 − d·dᵀ )  [ + I_pl_z · ẑ_b·ẑ_bᵀ  solo en VerticalBearing ]
```

Con defaults:

```text
I_B*(Free) = [ 13.9959    0         0      ]
             [  0        13.9603   -0.6904 ]
             [  0        -0.6904    2.6356 ]        kg·m²

I_B*(VerticalBearing): igual, con I_zz = 4.6356
```

---

## 3. Estado, entradas y salidas

**Estado dinámico:**

| Variable | Descripción | v1 |
|---|---|---|
| `q` | cuaternión unitario del cuerpo | integrado |
| `W_act` | trabajo acumulado del actuador | integrado |
| `t` | tiempo de simulación | — |
| `plan` | plan de θ activo (§5) | — |

**Constantes de la corrida (estado con derivada nula en v1):**

| Variable | Descripción | Extensión reservada |
|---|---|---|
| `L0 ∈ ℝ³` (Free) / `L_z0 ∈ ℝ` (VB) | momento angular total en el mundo | `L̇ = τ_ext` (fricción/arrastre) |
| `p_s` | momento de spin de la rueda | `ṗ_s = −c_s·ω_rel` (fricción del cojinete) |

**Entrada del usuario:** solo `θ_target ∈ [−90°, +90°]`. Todo lo demás se fija en `reset`.

**Estado derivado** (nunca se integra, se calcula): `θ, θ̇, θ̈` (del plan), `Ω_b`, `n̂_W = R(q)·n̂`.

**Salidas por frame:** `q`, `θ`, `θ_target`, `θ̇`, `Ω_b`, `Ω_W`, `n̂_W`, `L_wheel`, `L_body`, `L_total`, `T`, `W_act`, `τ_h`, `τ_react`, `τ_bearing` (VB), `|τ_h|>τ_h,warn`.

---

## 4. Ecuaciones definitivas

### 4.1 Velocidad angular absoluta de la rueda

```text
ω_w = Ω_b + θ̇·ĥ + ω_rel·n̂
s   = n̂·ω_w = ω_rel + n̂·Ω_b          (porque ĥ ⟂ n̂)
```

Cojinete de spin sin fricción ⇒ `p_s = I_a·s` constante. La velocidad relativa `ω_rel = p_s/I_a − n̂·Ω_b` **no** es constante (se recalcula, es solo salida).

### 4.2 Inercia bloqueada `I_c(θ)`

```text
P(θ)   = 1 − n̂·n̂ᵀ                       (proyector ⟂ al eje de la rueda)
I_c(θ) = I_B* + I_t · P(θ)
İ_c    = −I_t·θ̇·( t̂·n̂ᵀ + n̂·t̂ᵀ )
```

`I_c` es simétrica definida positiva siempre (suma de una SPD y una semidefinida positiva) ⇒ el solve es siempre posible; número de condición ≲ 10 con los defaults.

La inercia axial `I_a` **no** aparece: quedó absorbida en `p_s`. Solo entra la transversal de la rueda.

### 4.3 Momentos angulares (todos respecto del CM del conjunto)

En ejes del cuerpo:

```text
L_wheel = p_s·n̂ + I_t·P·Ω_b + I_t·θ̇·ĥ        (rueda respecto de su propio CM: spin + arrastre transversal + arrastre por inclinación)
L_body  = I_B*·Ω_b                             (persona [+ plataforma] + término orbital del CM de la rueda)
L_total = L_wheel + L_body = I_c·Ω_b + p_s·n̂ + I_t·θ̇·ĥ
```

Aclaración de partición (D-6): `L_body` **incluye** el término orbital `μ(|d|²·1 − d·dᵀ)Ω_b` del CM de la rueda alrededor del CM total; `L_wheel` es solo el de la rueda respecto de su propio CM. La suma es exacta y es la del SPEC (`L_total = L_wheel + L_body`).

En el mundo: `L_W = R(q)·L_b` para cada uno.

### 4.4 Cálculo de Ω — modo `Free`

Sin torque externo, `L_total,W = L0` constante:

```text
L_b  = R(q)ᵀ · L0
Ω_b  = I_c(θ)⁻¹ · ( L_b − p_s·n̂(θ) − I_t·θ̇·ĥ )        solve lineal 3×3 (Cholesky o Cramer)
```

Nota: `θ̇` entra por `I_t·θ̇·ĥ`. Por eso el resultado depende de la **trayectoria** θ(t) y no solo de θ.

### 4.5 Cálculo de Ω — modo `VerticalBearing`

Restricción: cojinete vertical ideal. `Ω_b = Ω_z·ẑ_b`, y solo se conserva `L_z`:

```text
Ω_z = ( L_z0 − p_s·sinθ − I_t·θ̇·(ĥ·ẑ_b) ) / I_c,zz(θ)
    = ( L_z0 − p_s·sinθ ) / ( I_zz* + I_t·cos²θ )                (porque ĥ·ẑ_b = 0)

I_zz* = I_z + μ·(d_x² + d_y²) + I_pl_z          (= 4.6356 con defaults)
```

`L_z0 = ẑ·R(q0)·( I_c(θ0)·Ω0 + p_s·n̂(θ0) )`. Con reposo inicial: `L_z0 = p_s·sinθ0`.

Consecuencia: `Ω_z` depende de θ pero **no** de θ̇ (el término de inclinación no tiene componente Z), así que `Ω_z` final solo depende de los extremos del giro. El **ángulo acumulado** de la plataforma, `ψ = ∫Ω_z dt`, sí depende de cuánto tarda θ(t).

### 4.6 Actualización del cuaternión

```text
q̇ = ½ · q ⊗ (0, Ω_b)          (Ω_b en ejes del cuerpo; producto de Hamilton)
```

Integración en §8. Renormalización `q ← q/|q|` tras cada paso. Para `VerticalBearing`, `Ω_b = (0,0,Ω_z)` mantiene `q` en yaw puro.

### 4.7 Torques (salidas y diagnóstico)

Necesarios: `Ω̇_b` y `θ̈` (del plan).

```text
Free:
  Ω̇_b = I_c⁻¹ · ( −Ω_b × L_b − p_s·θ̇·t̂ − I_t·θ̈·ĥ − İ_c·Ω_b )
VerticalBearing:
  Ω̇_z = −( p_s·θ̇·cosθ + Ω_z·İ_c,zz ) / I_c,zz          con İ_c,zz = −2·I_t·θ̇·sinθ·cosθ
```

Torque sobre la rueda respecto de su CM (componentes en `B`):

```text
L̇_wheel,b = p_s·θ̇·t̂ + I_t·( Ṗ·Ω_b + P·Ω̇_b ) + I_t·θ̈·ĥ        Ṗ = −θ̇·( t̂·n̂ᵀ + n̂·t̂ᵀ )
τ_w,b     = L̇_wheel,b + Ω_b × L_wheel,b                          (= dL_wheel/dt inercial, en ejes del cuerpo)
τ_h       = ĥ · τ_w,b                                            torque de la articulación (actuador) sobre la rueda
τ_react   = −τ_w,b                                               torque de la rueda sobre el cuerpo (= dL_body/dt)
```

`τ_h` es el torque que **la persona tiene que hacer** para imponer θ(t). Es una salida y un indicador de esfuerzo; **no** entra en la dinámica (θ es una restricción reónoma prescrita).

Torque del cojinete (torque externo sobre el conjunto respecto del CM):

```text
τ_ext,b = İ_c·Ω_b + I_c·Ω̇_b + p_s·θ̇·t̂ + I_t·θ̈·ĥ + Ω_b × L_total,b
τ_bearing,W = R(q)·τ_ext,b                (= dL_total,W/dt)
```

- `Free`: `τ_ext ≡ 0` (test).
- `VerticalBearing`: `τ_bearing,z ≡ 0` (test). Solo componentes horizontales: es el par de reacción que impide que el eje se incline. Valor máximo con defaults: **36.7 N·m**.

### 4.8 Energía y trabajo del actuador

```text
T = ½·Ω_bᵀ·I_c·Ω_b + I_t·θ̇·(ĥ·Ω_b) + ½·I_t·θ̇² + p_s²/(2·I_a)
P_act = τ_h·θ̇
Ẇ_act = P_act                      (se integra junto con q)
```

Balance exacto (ambos modos): `T(t) − T(0) = W_act(t)`. Justificación: el torque del cojinete es horizontal y `Ω ∥ ẑ` ⇒ `τ_bearing·Ω = 0`; el cojinete de spin no disipa; el único trabajo entra por la bisagra. Es el mejor chequeo independiente de `τ_h`, `Ω̇`, `T` y de la integración.

Con defaults (giro de 180°): `max(T − T0) = 96.2 J` (Free), `62.1 J` (VB). **La energía no se conserva**, y no debe mostrarse como conservada.

---

## 5. Tratamiento de θ(t): plan analítico

θ es una **variable de forma prescrita**, no un ángulo instantáneo. El usuario solo fija `θ_target`.

### 5.1 Propiedades exigidas

- `|θ̇| ≤ θ̇_max`, `|θ̈| ≤ θ̈_max`.
- `θ` y `θ̇` continuos (clase C¹); `θ̈` acotado y seccionalmente constante.
- Determinista e **independiente de `dt`**, salvo por el instante (múltiplo de `dt`) en que se detecta un cambio de target.
- Llega a `θ_target` con `θ̇ = 0` exactamente.

### 5.2 Construcción

Al inicio, o cuando `clamp(θ_target, −π/2, π/2)` cambia respecto del target del plan activo, se **re-planifica desde el estado actual exacto** `(θ₀, ω₀)` en el tiempo `t₀`:

```text
a = θ̈_max ;  v = θ̇_max
ω₀ ← clamp(ω₀, −v, +v)
e   = θ_target − θ₀
d_b = ω₀·|ω₀| / (2a)                        distancia de frenado firmada
σ   = +1 si (e − d_b) ≥ 0, si no −1
u₀  = σ·ω₀ ;  ẽ = σ·e
u_p = sqrt( max(0, a·ẽ + u₀²/2) )           velocidad pico (perfil triangular)

si u_p ≤ v:                                 triangular
    t₁ = max(0, u_p − u₀)/a ;  t₂ = 0 ;  t₃ = u_p/a
si no:                                      trapezoidal
    t₁ = max(0, v − u₀)/a
    x₁ = (v² − u₀²)/(2a) ;  x₃ = v²/(2a)
    t₂ = max(0, (ẽ − x₁ − x₃)/v) ;  t₃ = v/a

segmentos: (t₁, +σ·a), (t₂, 0), (t₃, −σ·a)
```

Cada segmento es un polinomio de grado 2 exacto en θ; los nudos quedan almacenados con sus estados. `plan.eval(t)` devuelve `(θ, θ̇, θ̈)` (para `t ≥ t_fin`: `(θ_target, 0, 0)`).

### 5.3 Invariante de rango

`θ + d_b(θ̇) ∈ [−π/2, +π/2]` se mantiene siempre: el plan activo frena exactamente en su target (dentro del rango) y todo re-plan parte de un estado que cumple esa condición. Si hay que revertir, el plan frena primero, y ese frenado termina dentro del rango. **Conclusión:** θ nunca sale de ±90°, sin topes duros ni saltos de velocidad. Guarda numérica: `|θ| ≤ π/2·(1+1e-12)`.

Con defaults: giro de 180° = 0.25 s (aceleración) + 1.75 s (crucero) + 0.25 s (freno) = **2.25 s**.

### 5.4 Qué NO hace

No hay saltos de θ. Un escalón del slider produce un perfil trapezoidal; el término `I_t·θ̇` nunca tiene delta de Dirac; el resultado no depende del framerate.

---

## 6. Modo `Free`

Ecuaciones: §4.4 + §4.6 (única EDO: `q`).

**Reset:**
```text
q0 = identidad  (ejes del cuerpo = ejes del mundo)
θ0, θ_target = θ0, plan = quieto
Ω0 = 0   (por defecto; Ω0 ≠ 0 solo como opción avanzada/tests)
L0 = R(q0) · ( I_c(θ0)·Ω0 + p_s·n̂(θ0) )          con θ̇0 = 0
```

Con `Ω0 = 0`, `L0 = p_s·n̂_W(0)`: el sistema arranca con L ≠ 0 y **no pasa nada** hasta que θ cambie.

**Propiedades:** las tres componentes de Ω responden; la inercia anisótropa domina (`I_zz ≪ I_xx, I_yy` ⇒ respuesta ≈ 5× más rápida alrededor del eje longitudinal). El eje de la rueda **en el mundo** no acompaña a θ (se mueve con el cuerpo).

**Referencia de regresión** (defaults, giro +90° → −90°, `t = 6 s`, `dt = 1/240`):

```text
max |Ω_x|, |Ω_y|, |Ω_z|          = 1.346, 0.904, 8.544  rad/s
máx. inclinación de Z_b vs Z_W    = 41.06°
ángulo entre n̂_W(0) y n̂_W(6 s)   = 148.97°   (no 180°: el cuerpo se reorienta)
máx. |τ_h| = 53.27 N·m ; máx. |τ_react| = 57.18 N·m ; máx. (T − T0) = 96.19 J
```

---

## 7. Modo `VerticalBearing`

Es `Free` más una restricción, **no** otro motor. Ecuaciones: §4.5 + §4.6.

Supuestos de este modo:

- **A6.** El eje de la plataforma pasa por el CM del conjunto persona + plataforma + rueda. El cojinete aporta fuerza vertical (peso) y un par horizontal de restricción; no hay fuerza horizontal neta.
- **A7.** La masa de la plataforma no entra en `μ` (error < 1 % sobre un término que ya es ~20 % de `I_zz`). Entra solo por `I_pl_z`.
- Cojinete vertical ideal: sin fricción por defecto (`c_pl = 0`, reservado).
- `I_x`, `I_y` de la persona **no** influyen en la dinámica de este modo (solo `I_zz*`); la UI puede deshabilitarlos.

**Reset:** igual que Free pero `L_z0 = ẑ·R(q0)·(I_c(θ0)·Ω0 + p_s·n̂(θ0))`.

**Forma cerrada** con reposo inicial (`θ0 = +90°`, `Ω0 = 0`):

```text
Ω_z(θ) = p_s·( 1 − sinθ ) / ( I_zz* + I_t·cos²θ )
```

Defaults (`p_s = 12`, `I_zz* = 4.6356`, `I_t = 0.15`):

| θ | Ω_z [rad/s] |
|---|---|
| +90° | 0 |
| +45° | +0.7461 |
| 0° | +2.5075 |
| −45° | +4.3487 |
| −90° | +5.1773 (= 2·p_s/I_zz*) |

**Signo:** con `p_s > 0`, al llevar la rueda de vertical a horizontal la persona gira **en el mismo sentido** que giraba la rueda (`Ω_z > 0`, antihorario visto desde arriba). Con `p_s < 0`, se invierte exactamente (`−2.5075` en θ = 0).

---

## 8. Integración numérica

**Paso fijo** `dt = 1/240 s`, acumulador, `Δt_frame ≤ 0.1 s` (máx. 24 pasos por frame; si se supera se descarta el exceso, no se acumula deuda).

**Paso `step(dt)`:**

1. Si `clamp(θ_target)` ≠ target del plan: re-planificar en `t` desde `plan.eval(t)`.
2. Nudos del plan en `(t, t+dt)` parten el paso en sub-intervalos `[t_a, t_b]` (así ninguna discontinuidad de `θ̈` cae dentro de una etapa RK).
3. En cada sub-intervalo, **RK4 clásico** sobre `y = (q, W_act)` con `h = t_b − t_a`. En cada etapa (`τ ∈ {0, h/2, h}`): `θ(t_a+τ), θ̇(t_a+τ)` salen del plan (exacto), `Ω_b` del solve algebraico (§4.4 / 4.5), `q̇` de §4.6, `Ẇ` de §4.8.
4. `q ← q/|q|`.

Como `Ω` es función algebraica del estado, no hay rigidez; el error observado es de **orden 4** (razón 15.1–15.9 al duplicar la resolución).

**Interpolación de render (opcional):** `slerp(q_prev, q_curr, acc/dt)`.

**Guardas de desarrollo** (no bloquean producción): `NaN/Inf` ⇒ detener; `||q|−1| > 1e-12` tras normalizar ⇒ error; `|T−T0−W_act| > 1e-6·max(1,T)` ⇒ aviso.

---

## 9. Tolerancias numéricas

Medidas con la referencia y dt = 1/240; el umbral es ≥ 10× el valor medido (y la razón está indicada):

| Chequeo | Medido | **Tolerancia** |
|---|---|---|
| `‖q‖ − 1` tras normalizar | 2e-16 | `1e-12` |
| `L_total,W − L0` relativo (Free) / `L_z − L_z0` (VB) | 1e-15 | `1e-12` (tautológico, ver §0.6) |
| `Ω_z` motor vs forma cerrada (VB) | 9e-16 rad/s | `1e-10` rad/s |
| `L_total` y `T` vs oráculo de partículas (rel.) | 2e-15 | `1e-12` |
| `τ_bearing,z` (VB) y `τ_ext` (Free) | 4e-15 / 3e-14 N·m | `1e-9` N·m |
| Balance `T − T0 − W_act` (giro de 180°, 6 s) | 1.1e-8 J (Free), 2.9e-10 J (VB) | `1e-6` J |
| Validador de Euler generalizado vs primaria: `|ΔΩ|` / ángulo(q) | 1.3e-7 rad/s / 2.1e-7 rad | `1e-5` |
| Giróstato (θ fijo) vs integrador independiente (SciPy): `|ΔΩ|` en 20 s | 1.3e-8 rad/s | `1e-6` |
| Giróstato: deriva de `T` y de `|L|` en 20 s (relativa) | 1.1e-11 / 9e-16 | `1e-9` / `1e-12` |
| Tasa de crecimiento del eje intermedio | igual a la teórica (0.57735027) | `1e-6` relativa |
| Convergencia (θ analítico): err. de `q` por dt = 1/60, 1/120, 1/240, 1/480 | 4.2e-7, 2.6e-8, 1.7e-9, 1.1e-10 rad | razón ≥ 12 al duplicar |
| Independencia de dt (giro real, `q` y `Ω` a los 6 s vs dt = 1/1920), dt = 1/240 | 3.3e-8 rad, 7.5e-9 rad/s | `1e-6` |
| Torque analítico vs derivada numérica de `L_total` (lejos de nudos) | 3.8e-3 N·m (error de diferencia central) | `1e-3 · max‖τ‖` |
| Free con `I_x, I_y → 1e8` vs VB | 5.5e-9 rad/s | `1e-6` rad/s |
| Plan de θ: `|θ|`, `|θ̇|`, `|θ̈|`, salto de `θ̇` por paso | 90°, 90°/s, 360°/s², 1.5°/s | `≤ π/2(1+1e-12)`, `θ̇_max(1+1e-12)`, `θ̈_max`, `θ̈_max·dt` |
| `θ_final − θ_target` | 0 | `1e-12` |

---

## 10. Tests analíticos

Cada test tiene entrada, salida esperada y criterio. Todos pasan en la referencia con la tolerancia de §9.

| ID | Prueba | Criterio |
|---|---|---|
| **T1** | **Oráculo de partículas.** Persona = 6 masas puntuales que reproducen `diag(I_p)`; rueda = anillo de 720 masas (`I_a = m_w R²`, `κ_t = 0.5`). Para estados aleatorios `(θ, θ̇, Ω_b)`: sumar `Σ m r × v` y `Σ ½ m v²` y comparar con `L_total` (§4.3) y `T` (§4.8). Valida ensamblado de `I_c`, Steiner, signo de `ĥ` y el término `I_t·θ̇·ĥ` **sin usar mis fórmulas**. | error relativo ≤ 1e-12 |
| **T2** | **Forma cerrada de VB** (§4.5/§7) contra el motor en un giro completo; tabla de §7 como regresión; simetría de signo (`p_s → −p_s` ⇒ `Ω_z → −Ω_z`). | ≤ 1e-10 rad/s |
| **T3** | **Estado:** normas de `q`, coherencia `L_wheel + L_body = L_total`. | ≤ 1e-12 |
| **T4** | **Euler–Poinsot / giróstato** (θ fijo, con spin): `T`, `|L|` constantes y `Ω(t)` igual a un integrador independiente de las ecuaciones de Euler del giróstato (SciPy). **Eje intermedio inestable**: `I = diag(1,2,3)`, rotación alrededor del eje 2 con la perturbación en el autovector inestable; tasa de crecimiento `λ = Ω·sqrt((I₂−I₁)(I₃−I₂)/(I₁I₃)) = 0.57735`. (Este test usa `κ_t = 0` y `m_w ≈ 0` como *override de test*; no es un valor físico.) | §9 |
| **T4b** | **Free → VB en el límite:** `I_x, I_y → ∞` (más `I_pl_z` sumado a `I_z`) reproduce VB. | ≤ 1e-6 rad/s |
| **T5** | **Balance de energía** `T − T0 = ∫τ_h·θ̇ dt`, en ambos modos, durante un giro de 180°. Es el chequeo independiente de `τ_h`. | ≤ 1e-6 J |
| **T6** | **Torque del cojinete:** en VB `τ_bearing,z = 0`, y la parte horizontal coincide con `d(L_total)/dt` numérica; en Free `τ_ext = 0`. | §9 |
| **T7** | **Reacción sobre el cuerpo:** `τ_react` analítico = `dL_body/dt` numérica (Free). **T7b: validador de Euler generalizado:** integrar en paralelo `L̇_b = −Ω × L_b` en ejes del cuerpo (sin usar `L0` del mundo) y comparar `Ω(t)` y `q(t)` con la primaria. | §9 |
| **T8** | **Convergencia del integrador** con `θ(t) = A·sin(2π·0.4·t)` analítico (A = 80°): orden 4. | razón ≥ 12 |
| **T9** | **Plan de θ:** límites, C¹, llegada exacta, giro de 180° = 2.25 s, re-plan a mitad de vuelo, 60 cambios aleatorios de target (invariante de rango), independencia de `dt` (1/240 vs 1/960: 9.4e-10 rad). | §9 |
| **T10** | **Signos:** `p_s > 0`, +90° → 0 ⇒ `Ω_z = +2.5075`; `p_s < 0` ⇒ `−2.5075`. | exacto a 1e-10 |
| **T11 (a implementar)** | **Límite `I_t → 0`** (override de test): `L_wheel = p_s·n̂` y `Ω_b = I_B*⁻¹(L_b − p_s·n̂)`. | 1e-12 |
| **T12 (a implementar)** | **Validación de parámetros:** rechazar `I_a > m_w R²`, `κ_t < 0.5`, `I_p` que viole la desigualdad triangular, masas ≤ 0. | rechazo |

Las pruebas T1–T10 ya están implementadas en `oracle/tests.py`; T11–T12 son triviales y quedan para el motor real.

---

## 11. Decisiones físicas que todavía necesito de vos antes de pasar a código

**D-1. Ejes del cuerpo y plano de inclinación.** Corrijo mi informe: `X_b` lateral derecha, `Y_b` adelante, `Z_b` cabeza; el eje de la rueda a θ = 0 apunta a la **derecha** de la persona y se inclina en el plano `X_b–Z_b` (montaje clásico). ¿Confirmás? Cambia qué significa `I_x` (eje lateral) vs. `I_y`, y hacia dónde está desplazada la rueda (`r_w`).

**D-2. Tres parámetros nuevos obligatorios** que no estaban en tu lista: `m_p`, `m_w` y `r_w` (más `I_pl_z` para la plataforma). Sin ellos no hay término de Steiner y `I_zz` queda 65 % abajo. Propongo tratarlos como *avanzados* con los defaults de §2. ¿Aceptás?

**D-3. Supuestos del modo plataforma.** A6 (el eje pasa por el CM del conjunto) y A7 (masa de la plataforma fuera de `μ`, error < 1 %). ¿Aceptás? Consecuencia de UI: en `VerticalBearing`, `I_x` e `I_y` no influyen.

**D-4. θ prescrito vs. esfuerzo humano.** Sostener el θ(t) prescrito exige `τ_h` hasta 53 N·m (Free) y 40 N·m (VB), mucho más que `p_s·θ̇` (19 N·m), porque la rueda se resiste a girar con el cuerpo. En v1 el motor **impone θ(t) y solo marca advertencia** si `|τ_h| > τ_h,warn` (50 N·m). La alternativa (v2) es un actuador con torque saturado: θ pasaría a ser dinámico y podría *no* seguir al plan (cambia la física, no solo la visualización). ¿v1 con advertencia? ¿Otro umbral?

**D-5. Spin durante la simulación.** `p_s` (y su signo) solo se define en el reset; no hay slider de "acelerar la rueda" en vivo (haría falta un torque axial interno que reacciona sobre el cuerpo). ¿Confirmás? ¿Se permite `Ω0 ≠ 0` inicial como opción avanzada, o solo reposo?

**D-6. Qué muestra "L_body".** Incluye el término orbital del CM de la rueda (§4.3). ¿Está bien para los vectores en pantalla, o preferís mostrar `L_person` y `L_orbital` separados? También: ¿los vectores por defecto en marco del mundo?

**D-7. Realismo del modo plataforma.** El motor asume cojinete ideal y persona rígida que no vuelca. El par horizontal de reacción llega a 36.7 N·m con defaults. ¿Agregamos un indicador de vuelco (comparar contra un umbral configurable) o lo dejamos fuera de v1?

**D-8. Alcance de la articulación.** v1 = **una** bisagra (inclinación en el plano `X_b–Z_b`). La rueda no se puede orientar fuera de ese plano. ¿Confirmado?

**D-9. Trayectoria de θ.** v1 = perfil bang-bang/trapezoidal (jerk infinito en los nudos ⇒ escalones en el `τ_h` mostrado, aunque Ω sea continua). ¿Alcanza o querés un perfil con jerk limitado (curva S) desde v1?

**D-10. Valores por defecto.** Son estimaciones (§2). Si tu experimento real tiene otra rueda o querés un caso específico (rueda cargada con plomo, etc.), dame valores y los reemplazo; si no, los uso tal cual.

Sin novedad (ya definido): fricción del cojinete y arrastre reservados con coeficientes nulos; el reset al cambiar de modo; el CM no se traslada.

---

# Extensión 3M — parámetros físicos interactivos y control externo

Esta extensión no modifica las ecuaciones base del acoplamiento `theta`/cuerpo/rueda que
se verifican contra `oracle.py`. Añade una semántica explícita para tres cambios de
configuración durante una simulación ya iniciada.

## Spin de rueda en tiempo real

Cuando el control `Velocidad angular` cambia durante la simulación, el valor solicitado
se interpreta como una intervención externa sobre el spin axial de la rueda, no como una
asignación visual. Si `p_s` es el momento angular axial antes del cambio y `n_w` el eje
físico actual en coordenadas mundo:

`p_s,new = Ia * s_cmd`

`Delta L_control,w = (p_s,new - p_s,old) * n_w`

Para `Free`, `L0` se incrementa por `Delta L_control,w`. Para `VerticalBearing`, su
escalar conservado `L0 = L_total,z` recibe la componente `Delta L_control,w,z`.
Esto deja inalterados `q`, `theta` y el estado del cuerpo en el instante de intervención,
mientras cambia de forma física `Omega_w · n_w` al valor solicitado.

La intervención queda registrada en el snapshot mediante `external_control` y
`L_control`. El trabajo energético instantáneo asociado se acumula en `W_control`.
No se declara conservación de `L_total` durante esa intervención.

## Cambio de `Ia` durante la simulación

Al modificar `Ia` se conserva el momento angular axial existente `p_s`; no se fuerza la
velocidad anterior. Por tanto:

`s_actual = p_s / Ia_new`

El estado angular total se conserva en el instante del cambio. La variación de energía
producida por la reconfiguración de inercia se contabiliza en `W_parameter`.

## Cambio de `D` durante la simulación

`D` modifica `R = D/2` y la geometría visual, pero no modifica automáticamente `Ia` si
la combinación continúa siendo válida. Si una reducción de `D` hace inválido el valor
actual de `Ia`, se aplica:

`Ia_new = m_w * R^2`

conservando el `p_s` existente. El cambio queda reflejado en `W_parameter`; el motor
nunca entra en un estado que viole `Ia <= m_w R^2`.

## Balance energético extendido

Sin intervenciones nuevas, el balance histórico permanece:

`T(t) - T(0) = W_act(t)`

Con los controles interactivos de 3M, el guard de energía utiliza:

`T(t) - T(0) = W_act(t) + W_control(t) + W_parameter(t)`

`W_act` sigue siendo exclusivamente el trabajo del actuador de `theta`; los otros dos
acumuladores corresponden respectivamente a cambios de spin externos y a
reconfiguraciones de parámetros.

## Diagnóstico

La interfaz no muestra `L_total`. Los diagnósticos de rueda y humano se toman
directamente de `L_wheel_body` y `L_body_body` del snapshot. Sus magnitudes se
calculan como la norma del mismo vector mostrado. `omega rueda` es exactamente
`Omega_w · n_w` del snapshot.

## 3N — Marcos de referencia, masa variable y overlays de diagnóstico

### Marcos de momento angular

El motor conserva internamente el momento angular en coordenadas mundo cuando el
modo `Free` lo requiere (`L0` mundial). Para diagnóstico se exponen dos
representaciones explícitas del mismo vector:

- `*_world`: coordenadas mundo.
- `*_body`: coordenadas del marco corporal, obtenido con `R(q)^T * L_world`.

La convención es `q`: cuerpo -> mundo. Por tanto `expressInWorldFrame(q,v)`
calcula `R(q)v` y `expressInBodyFrame(q,v)` calcula `R(q)^T v`.

El origen geométrico de una flecha no forma parte de esta transformación de
vector. El motor conserva `L_wheel`, `L_body` y `L_total` para las ecuaciones y
los tests de conservación; esos nombres son internos y `L_total` no se muestra
en la interfaz ni en el overlay de vectores.

### Parámetros de rueda e inercia

`D` controla el diámetro geométrico y `R=D/2`. `m_w` controla la masa física de
la rueda y entra en la masa reducida `mu`. `Ia` sigue siendo un parámetro del
modelo de inercia axial, pero en esta interfaz ya no es un control del usuario.
No se introduce una fórmula nueva `Ia(D,m)` porque el modelo validado no define
una geometría de distribución de masa que permita determinar de forma única `Ia`
a partir sólo de masa y diámetro. Se conserva por tanto el `Ia` existente y se
aplica el mismo límite físico ya validado:

`Ia <= m_w * R^2`.

Un cambio de `D` o `m_w` que reduzca el máximo permitido puede producir un clamp
explícito de `Ia`. Un cambio de `m_w` modifica realmente `mu` y, por tanto, las
ecuaciones que usan la inercia corporal reducida. El cambio energético continúa
contabilizándose en `W_parameter`.

### Geometría de rueda

El diámetro no se implementa mediante escala anisotrópica del assembly. Se
reconstruyen el aro y los radios con `R=D/2`, mientras que el eje conserva su
longitud y grosor. El assembly mantiene escala `(1,1,1)`.

### Persona fija y rueda adelantada

La posición del humano es una referencia fija respecto de la plataforma. Cambiar
`D` no modifica `personPosition`; los pies no se trasladan para alcanzar la rueda.

El motor mantiene intacto el `r_w` físico porque ese vector participa en la
dinámica y en `Istar`. Para la presentación se define explícitamente:

`wheelForwardOffset = max(0, bodyForwardRadius + wheelEnvelopeRadius - r_w_forward)`

con `wheelEnvelopeRadius = D/2 + tubeRadius`. En la convención corporal, el
frente humano es `+Y`; por ello `r_w_forward = r_w[1]`. Esta condición equivale a:

`wheelCenterForward - wheelEnvelopeRadius >= bodyForwardRadius`.

Así el desplazamiento es aproximadamente cero para ruedas pequeñas y crece de
forma progresiva cuando el envolvente de la rueda necesita separarse del torso.
El offset se aplica sólo a la geometría de presentación de la rueda y a los
puntos de agarre; no modifica `r_w`, `q`, `n_w`, las ecuaciones de conservación
ni ninguna cantidad del motor.

Los puntos de agarre se calculan sobre la misma línea del eje, ahora trasladada
por `wheelForwardOffset`. Los brazos se estiran desde los hombros hasta esas
manos; el cuerpo no se desplaza.

### Overlays

- **Ejes**: únicamente los seis ejes globales finitos `±X`, `±Y`, `±Z`, con
  X rojo, Y verde y Z azul. No se dibuja ningún eje corporal `Z_body`.
- **Vectores físicos**: únicamente `ω — rueda`, `𝑳 — rueda`, `ω — humano` y
  `𝑳 — humano` (los dos últimos sólo cuando son no nulos). El eje de la rueda
  no se dibuja como vector independiente. Los nombres internos del motor no se
  muestran. `L_total` continúa existiendo en el motor, pero no en la presentación.
- **Leyes físicas**: guía educativa desplegable en la esquina inferior izquierda
  con velocidad angular, momento angular, momento de inercia, torque, conservación
  y regla de la mano derecha. No se muestran balances energéticos ni nombres de
  variables del programa.

Los overlays son independientes y sólo controlan presentación.

### Interfaz educativa

La ficha de parámetros de la derecha muestra sólo:

- `ω` — velocidad angular;
- `D` — diámetro de la rueda;
- `m` — masa de la rueda;
- `θ` — ángulo del eje.

El control manual de momento de inercia no aparece en la interfaz, aunque `Ia`
sigue formando parte del motor.

## 3N.2 — Sincronización de brazos y diagnósticos educativos

### Brazos: un único estado geométrico

La cadena visual se determina exclusivamente por:

`cuerpo -> hombro -> mano -> eje de rueda`

`PhysicsVisualAdapter` produce las manos en coordenadas mundo a partir del mismo
`q`, `theta`, `n_w` y `wheelForwardOffset` que determinan el eje y centro de la
rueda. `PersonVisual` transforma esas manos al marco local del cuerpo y coloca
cada brazo como un segmento entre hombro y mano. No existe una velocidad angular,
acumulador temporal, timer ni animación independiente para los brazos.

La orientación del cuerpo se aplica antes de convertir los puntos de agarre a
coordenadas locales. Por ello, una rotación en azimut del cuerpo rota el conjunto
visual de forma coherente y un cambio de orientación del eje cambia directamente
la dirección del segmento hombro-mano.

### Diagnósticos de momento angular

La ficha derecha usa el mismo snapshot físico que recibe el overlay de vectores.
Los componentes de `L` se muestran en el marco corporal validado en 3N.1:

`L_rueda = L_wheel_body`

`L_humano = L_body_body`

Para cada vector se calcula únicamente su norma:

`|L| = sqrt(Lx^2 + Ly^2 + Lz^2)`.

El momento de inercia mostrado es directamente `Ia` del estado físico; no se
recalcula en la interfaz.

### Overlay de vectores

La presentación muestra únicamente `omega` y `L` de la rueda y, cuando son no
ceros, `omega` y `L` del humano. Los vectores de la escena se transforman a
coordenadas visuales sólo para dibujarlos; la magnitud y la dirección física
proceden del mismo snapshot usado por los diagnósticos. `L_total` sigue siendo
calculado por el motor para conservación, pero no se dibuja ni se muestra.

### Leyes físicas

El panel de leyes está siempre presente, contraído inicialmente y se abre mediante
su propio botón. No depende de un checkbox externo. Incluye las formas algebraicas:

`omega = dtheta/dt`

`L = I omega`

`I = sum(m_i r_i^2)` y, para una distribución continua, `I = integral(r^2 dm)`

`tau = dL/dt`

`tau_ext = 0 => L = constante`.

La conservación se refiere al momento angular del sistema físico considerado.


## 3N.5 — Modelo interactivo de aro delgado y explicación educativa

Para la rueda de la demostración interactiva se adopta explícitamente el modelo de
**aro delgado/anillo** alrededor de su eje de simetría, suponiendo que gran parte
de su masa está concentrada cerca del borde:

`I_a = m_w R^2 = m_w D^2 / 4`.

Este es el único modelo de inercia utilizado por los controles interactivos de
masa y diámetro. No modifica la formulación de `theta`, los cuaterniones, la
conservación de `L`, ni los modos `Free`/`VerticalBearing`.

Cuando `m_w` o `D` cambia, el motor recalcula `I_a` con esa expresión y conserva el
`p_s` existente, de acuerdo con la semántica de intervención de parámetros ya
establecida. Por tanto el spin absoluto resultante `p_s/I_a` cambia de manera
física. `I_t = kt*I_a` se actualiza conjuntamente y la energía asociada al cambio
se registra en `W_parameter`.

`setWheelInertia()` permanece como API interna compatible, pero no existe control
manual de `I_a` en la interfaz. Los parámetros históricos de `createParams()` y
`oracle/golden.json` se mantienen para compatibilidad y validación del motor; el
demo interactivo inicializa `I_a` con el modelo de aro delgado.

El panel educativo explica `L = Iω`, `τ = dL/dt`, el intercambio entre rueda y
cuerpo y la conservación aproximada de `L_total` cuando el torque externo neto
es despreciable. La componente Y del momento angular humano se presenta como
una consecuencia de la configuración de ejes y de la maniobra, no como una regla
universal.

### Bootstrap inicial

La composición de presentación crea `Scene3D` con `scenario: 1`, aplica el snapshot
físico inicial al adaptador visual y reinicia/aplica el estado visual antes de
iniciar el `SimulationLoop`. El primer render de la escena se realiza antes del
primer callback de `requestAnimationFrame`, de modo que persona, plataforma, rueda,
eje y diagnósticos parten de un mismo estado.

La cámara orbital apunta al centro del experimento. Los paneles de diagnósticos,
leyes físicas y educación se crean antes de iniciar el loop y reciben el snapshot
inicial; sus actualizaciones posteriores siguen procediendo del mismo snapshot.

## Extensión 3N.17 — Spin live como actuación interna rueda-cuerpo

La semántica interactiva de `setSpinRate()` para cambios realizados durante la
simulación queda corregida respecto de la extensión 3M anterior.

Cuando el control cambia `s`, se aplica físicamente:

`Δp_s = I_a · (s_new − s_old)`

`ΔL_wheel = Δp_s · n̂_W`

El actuador aporta energía al subsistema rueda-cuerpo, pero la actuación de spin es
**interna al sistema persona + rueda**: no se modifica `L0` para fabricar un torque
angular externo sobre el conjunto.

### Free

`L0` es el momento angular total mundial conservado. Al cambiar `p_s`, la ecuación
existente

`Ω_b = I_c(θ)^−1 · (L_b − p_s n̂ − I_t θ̇ ĥ)`

produce inmediatamente la reacción del cuerpo. A `θ` y `θ̇` fijos, la variación de
`L_body` es la opuesta a la variación de `L_wheel`, por lo que `L_total_world` no cambia
por la intervención de spin.

### VerticalBearing

`L0` es el componente Z conservado. La componente horizontal del torque del actuador
puede ser absorbida por el cojinete, mientras que la componente Z modifica `Ω_z` según
la ecuación existente:

`Ω_z = (L_z0 − p_s sinθ − I_t θ̇ h_z) / I_c,zz`

Por eso, con `θ = 0°`, cambiar spin puede modificar `L_wheel` sin producir yaw del cuerpo:
el torque de spin es horizontal y el bearing puede reaccionar horizontalmente. Para
`sinθ ≠ 0`, el cambio de `p_s` produce la reacción corporal correspondiente.

El snapshot continúa registrando `L_control` como el impulso angular aplicado al eje de
la rueda y `W_control` como la energía aportada por la actuación. `external_control`
se conserva por compatibilidad de API, pero ahora informa `external: false, internal: true`
para dejar explícito que no es una inyección de momento angular externo del sistema
completo.
