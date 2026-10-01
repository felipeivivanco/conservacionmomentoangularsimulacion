# Auditoría Fase C.2

## Base

ZIP de entrada exacto: `simulacion_agente3_C1_wheel_header_asset_fix(1).zip`

SHA-256 de la base verificada antes de modificar:

`8f2fce2e7c54fe8639ddf8faf0294a552350fb5e99bf85c554f381e2b5f07d69`

## Masa y diámetro

La ruta interactiva conserva `s0` como velocidad angular seleccionada y recalcula inmediatamente:

`I_a = m_w D^2 / 4`

`p_s = I_a s0`

Por ello, con `s0` constante, modificar masa o diámetro modifica inmediatamente el momento angular axial de la rueda y todos los diagnósticos que provienen del snapshot.

Los cambios no avanzan `t` ni `steps`; STOP, PAUSE y RUNNING usan el mismo setter físico.

## Modelo de cuerpo humano

`includeHuman=true` reproduce el modelo antropomórfico existente.

`includeHuman=false` usa una idealización simétrica: se elimina la contribución geométrica de distribución de masa `mu` y sus términos fuera de la diagonal, conservando únicamente los tres momentos principales `Ip`. En Plataforma se conserva además `I_pl_z`, que corresponde al soporte/rodamiento y no al acoplamiento antropomórfico.

En particular, desaparece el término `I_yz` que producía la componente `L_humano,Y` en VerticalBearing. La persona, rueda y escena visuales no se duplican: solo cambia el modelo de cálculo y el snapshot.

Al cambiar ON/OFF se conserva la cinemática instantánea (`q`, `theta`, `thetaDot`, `Omega_b`) y se reconstruye el `L0` correspondiente al nuevo modelo, sin avance temporal.

## Vectores

El vector `L` original se conserva. Cuando tiene dos o tres componentes no nulas, se añade una construcción cabeza-cola X/Y/Z. La escala es común con el vector original, por lo que el último extremo coincide con su punta.

Colores físicos:

- X = rojo
- Y = verde
- Z = azul

En Vacío, las flechas/etiquetas auxiliares principales usan blanco para contraste; los componentes físicos mantienen rojo/verde/azul.

Las etiquetas exponen el signo físico (`ω+`, `ω−` o signos por componente de `L`).

## Oracle y regresiones

`oracle/golden.json` permanece sin cambios y conserva su SHA original:

`2fa61cfb5c9a60c2686d2a3d7fbfb6c915de973090d240b6aa7defdf9fcd4d9f`

La extensión usa el modelo existente como valor por defecto, por lo que el crosscheck de los estados del oracle permanece dentro de las tolerancias históricas.
