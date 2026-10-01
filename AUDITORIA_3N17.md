# Auditoría física 3N.17

## Causa raíz

El control live de spin estaba tratando `Δp_s n̂` como una modificación de `L0` del
sistema completo. Eso hacía que la ecuación algebraica de `Ω_b` cancelara la variación
de `p_s`, dejando al humano congelado en estados donde debía existir acoplamiento.

La ruta UI ya entregaba el valor al `EngineAdapter`; `SimulationLoop.refreshCurrentState()`
solo presentaba el snapshot y no era la causa física.

## Corrección

El cambio de spin se trata como actuación interna rueda-cuerpo:

`Δp_s = I_a(ω_new − ω_old)`

`ΔL_wheel = Δp_s n̂`

sin modificar `L0`.

En Free esto conserva `L_total_world`. En VerticalBearing conserva `L_z` y deja que el
bearing aporte la reacción horizontal permitida por el modelo.

No se modificaron las ecuaciones de `theta`, `q`, `Omega_b` ni la integración RK4.

## Consecuencias verificadas

- Free: cambio de spin modifica `Omega_b`, `L_body` y `q` cuando existe acoplamiento.
- Free: `L_total_world` permanece constante durante la intervención.
- VerticalBearing: para `sin(theta) != 0`, cambia `Omega_z`; para `theta=0`, la reacción
  corporal de yaw puede ser exactamente cero porque el bearing absorbe el torque horizontal.
- `L_control` registra el impulso aplicado a la rueda.
- `W_control` registra la energía introducida por el actuador.
- No se añadió ningún reloj, interpolación ni quaternion artificial.
