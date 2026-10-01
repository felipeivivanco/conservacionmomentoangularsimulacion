# Simulación 3D — Conservación del Momento Angular

## 1. Objetivo del proyecto

Desarrollar una aplicación web interactiva que permita visualizar y experimentar con el fenómeno de conservación del momento angular.

La escena representa inicialmente:

* Una persona de pie sobre una plataforma circular.
* La persona sostiene una rueda de bicicleta mediante su eje, con los brazos extendidos.
* La rueda gira alrededor de su propio eje.
* El usuario puede modificar la orientación del eje de la rueda.
* El cambio de orientación del momento angular de la rueda produce una reacción sobre el sistema.
* La aplicación debe representar un fenómeno físico mediante un modelo matemático, no simplemente reproducir una animación prefijada.

La simulación debe permitir comparar dos situaciones:

1. Persona sobre una plataforma giratoria.
2. Persona libre en el espacio, sin plataforma.

El objetivo principal es educativo: permitir modificar parámetros, observar la respuesta del sistema y visualizar los vectores de momento angular.

---

# 2. Tecnologías

La aplicación será una aplicación web.

Tecnologías principales:

* HTML5
* CSS3
* JavaScript
* Three.js

No se requiere backend.

La simulación debe ejecutarse directamente en el navegador.

---

# 3. Sistema físico

La simulación debe permitir estudiar dos configuraciones físicas diferentes.

---

## 3.1 Modo 1 — Persona sobre plataforma

El sistema está compuesto por:

* Persona.
* Plataforma circular.
* Rueda.

La persona y la plataforma se consideran conjuntamente como un cuerpo.

La plataforma puede rotar alrededor de su eje vertical Z.

En este modo, la plataforma restringe los grados de libertad rotacionales del sistema persona + plataforma.

El movimiento rotacional principal permitido es:

```text
Omega = (0, 0, Omega_z)
```

Variables principales:

* `I_platform`: momento de inercia de persona + plataforma respecto del eje Z.
* `Omega_z`: velocidad angular de persona + plataforma alrededor de Z.

---

## 3.2 Modo 2 — Persona libre / sin plataforma

La plataforma se elimina completamente.

La persona queda suspendida libremente en el espacio mientras sostiene la rueda.

En este modo, la persona puede experimentar rotación alrededor de los tres ejes:

* X
* Y
* Z

La velocidad angular del cuerpo es un vector:

```text
Omega_body = (Omega_x, Omega_y, Omega_z)
```

El momento angular de la persona debe tratarse como un vector tridimensional.

En este modo no debe asumirse que toda la reacción ocurre únicamente alrededor del eje Z.

El sistema debe respetar la conservación vectorial del momento angular.

El modelo debe considerar:

```text
L_total = L_wheel + L_body
```

y, en ausencia de torque externo:

```text
dL_total / dt = 0
```

o:

```text
L_total = constante
```

El objetivo es que el cambio de orientación del eje de la rueda produzca una reacción tridimensional sobre el cuerpo.

---

# 4. Diferencia entre los modos

## Modo plataforma

Los grados de libertad rotacionales del conjunto persona + plataforma están restringidos.

Se considera:

```text
Omega_body = (0, 0, Omega_z)
```

La respuesta del sistema debe ser compatible con esta restricción.

---

## Modo libre

No existe plataforma.

El cuerpo puede adquirir:

```text
Omega_body = (Omega_x, Omega_y, Omega_z)
```

La respuesta debe calcularse mediante dinámica de cuerpo rígido tridimensional.

La orientación final del cuerpo debe surgir del modelo físico y no de una animación predeterminada.

---

# 5. Sistema de coordenadas

Utilizar un sistema cartesiano:

```text
X → horizontal
Y → horizontal
Z → vertical
```

El eje Z es inicialmente vertical.

La plataforma, cuando existe, gira alrededor del eje Z.

La dirección positiva de Z apunta hacia arriba.

---

# 6. Rueda

La rueda posee:

* Diámetro `D`
* Radio `R = D / 2`
* Momento de inercia `I_wheel`
* Velocidad angular propia `omega`
* Orientación del eje `theta`

La rueda debe considerarse un cuerpo rígido.

El momento angular de la rueda es:

```text
L_wheel = I_wheel * omega * n_hat
```

donde `n_hat` es el vector unitario que representa la orientación instantánea del eje de la rueda.

---

# 7. Orientación de la rueda

El usuario puede modificar el ángulo `theta`.

Convención:

```text
theta = 0°   → eje de la rueda horizontal
theta = 90°  → eje de la rueda vertical
```

Rango inicial:

```text
0° ——————————————— 90°
```

La rueda debe inclinarse dentro de un plano definido por el modelo físico.

Para la configuración inicial se utilizará el plano X-Z.

Si el eje de la rueda se encuentra en dicho plano, su dirección puede representarse inicialmente como:

```text
n_hat(theta) = (cos(theta), 0, sin(theta))
```

IMPORTANTE:

Esta expresión define la orientación geométrica del eje. El agente de física debe determinar cómo debe integrarse temporalmente dicha orientación y cómo afecta a la dinámica del sistema.

---

# 8. Momento angular de la rueda

El módulo del momento angular de la rueda es:

```text
|L_wheel| = I_wheel * |omega|
```

Su representación vectorial es:

```text
L_wheel = I_wheel * omega * n_hat
```

La dirección de `L_wheel` debe cambiar cuando cambia la orientación del eje de la rueda.

El sentido debe respetar la regla de la mano derecha.

---

# 9. Momento angular del cuerpo

## Modo plataforma

La persona + plataforma se modelan como un sistema que gira alrededor del eje Z.

Su momento angular debe ser calculado de acuerdo con el modelo físico validado por el agente de física.

Como aproximación para un cuerpo con un único grado de libertad:

```text
L_body = I_platform * Omega_z
```

en la dirección Z.

---

## Modo libre

La persona debe modelarse como un cuerpo rígido tridimensional.

La velocidad angular es:

```text
Omega_body = (Omega_x, Omega_y, Omega_z)
```

En general:

```text
L_body = I_body * Omega_body
```

donde `I_body` es el tensor de inercia del cuerpo.

Para una primera aproximación puede utilizarse un sistema de ejes principales:

```text
I_body =
[ Ix   0   0 ]
[ 0   Iy   0 ]
[ 0    0  Iz ]
```

Sin embargo, el agente de física debe determinar cómo debe representarse el tensor respecto del sistema de coordenadas global cuando el cuerpo cambia de orientación.

---

# 10. Modelo tridimensional del cuerpo libre

En el modo libre, el cuerpo humano debe considerarse un cuerpo rígido tridimensional idealizado.

Debe tener:

* Masa o parámetros equivalentes necesarios para definir su inercia.
* Orientación.
* Velocidad angular.
* Momento angular.
* Tensor de inercia.

La dinámica debe utilizar las ecuaciones apropiadas para un cuerpo rígido tridimensional.

El agente de física debe determinar si es necesario utilizar:

* ecuaciones de Euler;
* integración del momento angular;
* cuaterniones;
* matrices de rotación;
* u otra formulación equivalente.

La orientación del cuerpo debe actualizarse a partir del estado físico.

No se debe implementar la rotación mediante tres animaciones independientes de X, Y y Z si eso no representa correctamente la dinámica de un cuerpo rígido.

---

# 11. Conservación del momento angular

El principio fundamental de la simulación es:

```text
L_total = L_wheel + L_body
```

En ausencia de torque externo:

```text
dL_total / dt = 0
```

Por lo tanto:

```text
L_total = constante
```

El motor físico debe trabajar con vectores.

No se debe reemplazar arbitrariamente la conservación vectorial por una única ecuación escalar.

---

## 11.1 Modo plataforma

La respuesta del cuerpo está restringida por la plataforma.

El motor debe calcular la respuesta compatible con el grado de libertad permitido.

---

## 11.2 Modo libre

El cuerpo puede responder en tres dimensiones.

El cambio del momento angular de la rueda debe producir una variación correspondiente del momento angular del cuerpo, respetando:

```text
Delta L_total = 0
```

o:

```text
Delta L_body = -Delta L_wheel
```

cuando se consideran únicamente los cambios internos del sistema completo y no existen torques externos.

---

# 12. Torque externo

El modelo ideal inicial debe asumir:

```text
Torque externo ≈ 0
```

Esto significa:

* sin fricción significativa;
* sin resistencia del aire relevante;
* sin contacto externo en el modo libre;
* sin torque externo aplicado deliberadamente.

El sistema debe documentar cualquier torque externo que posteriormente se incorpore.

---

# 13. Parámetros modificables por el usuario

## 13.1 Ángulo de la rueda

Variable:

```text
theta
```

Unidad:

grados.

Rango:

```text
0° — 90°
```

---

## 13.2 Velocidad angular de la rueda

Variable:

```text
omega
```

Unidad:

rad/s.

El usuario debe poder modificarla mediante slider y/o entrada numérica.

---

## 13.3 Diámetro de la rueda

Variable:

```text
D
```

Unidad:

metros.

El radio se calcula como:

```text
R = D / 2
```

El diámetro debe afectar como mínimo a la geometría visual.

Si se implementa una relación física entre diámetro, masa y momento de inercia, dicha relación debe estar documentada.

---

## 13.4 Momento de inercia de la rueda

Variable:

```text
I_wheel
```

Unidad:

kg·m².

Debe ser un parámetro independiente modificable por el usuario.

No debe asumirse automáticamente una masa o distribución de masa concreta salvo que se implemente explícitamente un modelo de rueda.

---

# 14. Parámetros físicos del cuerpo

## 14.1 Modo plataforma

Debe existir:

```text
I_platform
```

que representa el momento de inercia de persona + plataforma respecto del eje correspondiente.

El valor puede ser inicialmente interno.

---

## 14.2 Modo libre

Debe existir una representación de la inercia del cuerpo:

```text
Ix
Iy
Iz
```

Estos parámetros pueden estar ocultos en la interfaz principal y aparecer dentro de:

```text
Parámetros avanzados
```

Los valores utilizados deben estar documentados.

No deben inventarse silenciosamente.

---

# 15. Dinámica del ángulo de la rueda

El usuario debe poder modificar la orientación de la rueda mediante `theta`.

Debe distinguirse entre:

* posición/orientación deseada;
* velocidad de cambio de orientación;
* estado físico instantáneo.

El motor debe determinar cómo debe tratarse físicamente el cambio de orientación.

No se debe asumir automáticamente que cambiar `theta` instantáneamente es físicamente equivalente a mover la rueda a esa velocidad.

Para una simulación temporal realista, el agente de física debe definir:

```text
theta(t)
dtheta/dt
d²theta/dt²
```

cuando corresponda.

Debe documentar qué aproximación se utiliza.

---

# 16. Representación visual

## Plataforma

En modo plataforma debe existir una plataforma circular claramente visible.

Debe rotar de acuerdo con el estado físico calculado.

---

## Persona

Debe existir una representación 3D simplificada de una persona.

Debe ser suficiente para identificar:

* cabeza;
* torso;
* brazos;
* piernas.

No es necesario un modelo anatómico detallado.

---

## Rueda

Debe existir una rueda de bicicleta visualmente reconocible.

Debe:

* girar sobre su propio eje;
* cambiar de orientación según `theta`;
* permanecer sostenida por las manos de la persona.

---

## Modo libre

Cuando se seleccione el modo libre:

* la plataforma debe desaparecer completamente;
* la persona debe quedar suspendida en el espacio;
* la persona debe poder rotar en tres dimensiones;
* la rueda debe permanecer conectada a las manos;
* la orientación visual debe corresponder al estado físico.

---

# 17. Vectores físicos

La simulación debe poder visualizar:

```text
L_wheel
L_body
L_total
```

Opcionalmente también:

```text
Omega_body
Omega_wheel
```

Los vectores deben:

* tener dirección correcta;
* tener sentido correcto;
* actualizarse en tiempo real;
* estar ligados al estado físico.

El usuario debe poder activar/desactivar su visualización.

---

# 18. Cámaras

La aplicación debe tener dos modos.

## Cámara libre

El usuario puede:

* rotar la cámara con el mouse;
* acercarse y alejarse;
* desplazarse alrededor de la escena;
* observar desde cualquier dirección.

---

## Primera persona

La cámara debe estar aproximadamente a la altura de los ojos.

Debe estar vinculada a la orientación física real del cuerpo.

### Modo plataforma

La cámara sigue la rotación de la persona/plataforma alrededor de Z.

### Modo libre

La cámara sigue la orientación tridimensional real del cuerpo.

La cámara no debe tener una animación independiente de la física.

---

# 19. Controles de la interfaz

La interfaz principal debe permitir seleccionar:

```text
Modo:

○ Plataforma
○ Libre / vacío
```

Controles:

```text
Ángulo de rueda
Velocidad angular
Diámetro
Momento de inercia
```

Botones:

```text
Iniciar
Pausar
Reiniciar
```

Controles visuales opcionales:

```text
Mostrar vectores
Mostrar ejes
Mostrar información física
```

---

# 20. Parámetros avanzados

Opcionalmente:

```text
I_platform

Ix
Iy
Iz
```

También pueden existir parámetros relacionados con:

```text
masa del cuerpo
velocidad de inclinación
fricción
```

si posteriormente se decide implementar modelos más complejos.

Los parámetros avanzados deben estar claramente diferenciados de los parámetros principales.

---

# 21. Estado de la simulación

La simulación debe manejar estados:

```text
IDLE
RUNNING
PAUSED
RESET
```

Al presionar `Reiniciar`:

* se restablece la orientación inicial;
* se restablece la velocidad angular del cuerpo;
* se restablece la orientación de la rueda;
* se restablece el estado físico;
* se actualizan los valores visualizados.

---

# 22. Arquitectura del software

El proyecto debe separarse en tres módulos principales.

---

## 22.1 Módulo de física

Responsable de:

* ecuaciones;
* variables físicas;
* conservación del momento angular;
* dinámica rotacional;
* integración temporal;
* cálculo de velocidades;
* cálculo de orientaciones;
* cálculo de vectores;
* actualización del estado físico.

Archivo sugerido:

```text
src/physics/physics.js
```

Este módulo NO debe crear objetos Three.js ni elementos HTML.

---

## 22.2 Módulo de escena 3D

Responsable de:

* Three.js;
* plataforma;
* persona;
* rueda;
* cámaras;
* iluminación;
* vectores;
* ejes;
* transformaciones;
* representación visual.

Archivo sugerido:

```text
src/scene/scene.js
```

Este módulo NO debe modificar las ecuaciones físicas.

Debe recibir el estado calculado por el módulo de física.

---

## 22.3 Módulo de interfaz e integración

Responsable de:

* HTML;
* CSS;
* sliders;
* botones;
* indicadores;
* selección de modo;
* conexión entre UI, física y escena.

Archivos sugeridos:

```text
src/ui/ui.js
src/main.js
```

---

# 23. Arquitectura de datos

El motor físico debe producir un estado similar a:

```text
simulationState:

mode

theta
omega

D
I_wheel

L_wheel

Omega_body
L_body

L_total

bodyOrientation
bodyAngularVelocity
```

En modo plataforma también:

```text
Omega_z
```

y, si corresponde:

```text
I_platform
```

En modo libre:

```text
Omega_x
Omega_y
Omega_z

Ix
Iy
Iz
```

La escena 3D consume este estado.

La interfaz consume este estado para mostrar los valores.

Flujo:

```text
UI
 ↓
Parámetros
 ↓
Physics Engine
 ↓
simulationState
 ↓
3D Scene + UI
```

---

# 24. Separación de responsabilidades entre agentes

## Agente 1 — Física

Responsable exclusivamente del modelo físico y matemático.

Debe:

* auditar las hipótesis;
* verificar las ecuaciones;
* determinar el modelo de dinámica correcto;
* implementar el motor físico;
* crear pruebas físicas.

No debe diseñar la UI ni la escena 3D.

---

## Agente 2 — Three.js

Responsable exclusivamente de:

* escena;
* modelos;
* cámaras;
* transformaciones;
* visualización.

No debe modificar las ecuaciones físicas.

---

## Agente 3 — UI e integración

Responsable de:

* interfaz;
* controles;
* indicadores;
* integración de módulos;
* experiencia de usuario.

No debe inventar ni modificar ecuaciones físicas.

---

# 25. Regla fundamental entre agentes

Ningún agente debe modificar la responsabilidad principal de otro módulo sin documentarlo.

Si existe una contradicción entre módulos:

1. detener la implementación afectada;
2. identificar la contradicción;
3. resolverla en `SPEC.md`;
4. actualizar los módulos afectados.

`SPEC.md` funciona como contrato común del proyecto.

---

# 26. Requisitos de precisión

La simulación debe distinguir entre:

### Modelo físico

Ecuaciones y principios utilizados.

### Modelo visual

Representación de los objetos.

### Animación

Actualización temporal de los estados.

No se debe utilizar una animación arbitraria para sustituir un cálculo físico.

La orientación y rotación del cuerpo deben surgir del estado físico calculado.

---

# 27. Conservación numérica

El motor debe monitorear opcionalmente el error de conservación del momento angular:

```text
error_L = |L_total(t) - L_total(0)|
```

La aplicación puede mostrar:

```text
Error de conservación: 0.00%
```

o una magnitud equivalente.

El agente de física debe establecer un criterio razonable de tolerancia numérica.

---

# 28. Casos de prueba

## Caso 1 — Rueda detenida

```text
omega = 0
```

Resultado esperado:

La rueda no debe aportar momento angular debido a su giro.

---

## Caso 2 — Momento de inercia nulo

```text
I_wheel = 0
```

Resultado esperado:

La rueda no debe aportar momento angular.

---

## Caso 3 — Rueda horizontal

```text
theta = 0°
```

Debe verificarse la dirección del vector de momento angular de acuerdo con la convención establecida.

Si se utiliza:

```text
n_hat = (cos(theta), 0, sin(theta))
```

entonces:

```text
L_wheel,z = 0
```

---

## Caso 4 — Rueda vertical

```text
theta = 90°
```

Con la convención anterior:

```text
L_wheel,z = I_wheel * omega
```

---

## Caso 5 — Aumentar velocidad angular

Aumentar `omega`.

El módulo del momento angular de la rueda debe aumentar proporcionalmente:

```text
|L_wheel| ∝ |omega|
```

---

## Caso 6 — Aumentar momento de inercia

Aumentar `I_wheel`.

El módulo del momento angular debe aumentar proporcionalmente:

```text
|L_wheel| ∝ I_wheel
```

---

## Caso 7 — Comparación de modos

Utilizar exactamente los mismos parámetros de rueda.

Ejecutar:

1. modo plataforma;
2. modo libre.

Las respuestas deben ser diferentes debido a las diferentes restricciones físicas.

---

## Caso 8 — Modo libre

La plataforma no debe existir físicamente en la escena.

El cuerpo debe poder adquirir velocidad angular alrededor de X, Y y Z cuando el modelo físico lo determine.

---

## Caso 9 — Conservación vectorial

En modo libre debe verificarse numéricamente:

```text
L_total(t) ≈ L_total(0)
```

dentro de la tolerancia numérica definida.

---

## Caso 10 — Rueda vertical → horizontal

Partir con:

```text
theta = 90°
```

y modificar la orientación hasta:

```text
theta = 0°
```

El motor debe calcular la variación vectorial del momento angular de la rueda y la correspondiente reacción del cuerpo.

No debe imponerse manualmente una rotación predeterminada del humano.

---

## Caso 11 — Rueda horizontal → vertical

Realizar el proceso inverso:

```text
theta = 0° → 90°
```

Verificar que la respuesta sea consistente con la conservación del momento angular y con las convenciones de signos.

---

# 29. Auditoría física obligatoria

Antes de implementar el motor definitivo, el agente responsable de física debe revisar especialmente:

1. Si el tratamiento del modo plataforma es físicamente consistente.
2. Si el tratamiento del modo libre requiere ecuaciones de Euler.
3. Cómo representar correctamente el tensor de inercia cuando cambia la orientación del cuerpo.
4. Cómo integrar la orientación del cuerpo en el tiempo.
5. Cómo tratar el movimiento impuesto de la rueda.
6. Cómo conservar numéricamente el momento angular.
7. Qué restricciones internas representa el hecho de que la persona sostenga la rueda.
8. Qué simplificaciones son necesarias para que el modelo sea viable en tiempo real.
9. Qué diferencia existe entre modificar instantáneamente `theta` y mover físicamente el eje de la rueda.
10. Qué valores iniciales de inercia son razonables y cómo deben documentarse.

Si alguna ecuación o supuesto de este documento es físicamente incorrecto o insuficiente, debe señalarse antes de implementarlo.

No debe implementarse una ecuación simplemente porque aparezca en este documento si la auditoría demuestra que no representa correctamente el fenómeno.

---

# 30. Principio de desarrollo

El orden obligatorio de desarrollo es:

```text
1. Validación del modelo físico
        ↓
2. Implementación del motor físico
        ↓
3. Pruebas del motor
        ↓
4. Construcción de escena 3D
        ↓
5. Integración física + 3D
        ↓
6. Interfaz
        ↓
7. Cámaras
        ↓
8. Visualización de vectores
        ↓
9. Pruebas completas
        ↓
10. Pulido visual
```

No se debe comenzar creando una animación y posteriormente intentar justificarla mediante ecuaciones.

---

# 31. Estado actual

El concepto general está definido.

La próxima tarea es que el Agente 1 realice una auditoría completa del modelo físico y determine la formulación matemática definitiva para:

* modo plataforma;
* modo libre;
* conservación vectorial del momento angular;
* dinámica de cuerpo rígido;
* orientación de la rueda;
* integración temporal.

El resultado de dicha auditoría debe ser revisado antes de que los agentes de 3D e interfaz comiencen la implementación.
