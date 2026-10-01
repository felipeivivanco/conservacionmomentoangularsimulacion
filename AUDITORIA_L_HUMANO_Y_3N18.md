# Auditoría física — L_humano,Y — 3N.18

## 1. Caso analizado

Escena 1, modo `VerticalBearing`.

Condiciones:

- masa de la rueda: `m_w = 2.40 kg`
- diámetro: `D = 0.70 m`
- modelo de rueda del demo: aro delgado, por lo que `Ia = m_w D² / 4 = 0.294 kg·m²`
- velocidad axial inicial: `omega = 20 rad/s`
- `theta0 = 0°`
- `Omega0 = [0,0,0]`
- `r_w = [0, 0.60, 0.40] m`
- `kt = 0.5`, por lo que `It = 0.147 kg·m²`
- trayectoria: `0° -> +90°` y, en una segunda ejecución independiente, `0° -> -90°`

La muestra se tomó del estado físico cuando `theta` coincide con cada ángulo solicitado, no de una interpolación visual.

## 2. Convenciones

El motor usa `q=(w,x,y,z)` y `R(q)` transforma cuerpo -> mundo.

`Omega_b`, `L_body` y `L_wheel` de la ficha física están expresados en el marco corporal. Las cantidades con sufijo `_world` están expresadas en laboratorio/mundo.

En `VerticalBearing`, el cuerpo solamente tiene la componente `Omega_b.z` en la ecuación cerrada del modo; `Omega_b.x = Omega_b.y = 0` en estas maniobras.

## 3. Ecuaciones reales utilizadas

El motor construye primero la inercia corporal sin el término axial de la rueda:

```text
Istar = diag(Ip) + mu (|r_w|² I - r_w r_wᵀ)
```

Para `r_w=[0,0.60,0.40]`, `mu=70*2.4/(70+2.4)=2.320441988950276 kg` y el caso VerticalBearing añade `I_pl_z=2` sobre ZZ.

El resultado numérico es:

```text
Istar =
[ 13.706629834254144,  0,                    0                  ]
[ 0,                  13.871270718232044,   -0.5569060773480662 ]
[ 0,                  -0.5569060773480662,   4.4353591160220995 ]
```

El momento angular humano es directamente:

```text
L_body = Istar Omega_b
```

Por tanto, su componente Y es:

```text
L_body,Y = I_yx Omega_x + I_yy Omega_y + I_yz Omega_z
```

En esta maniobra VerticalBearing:

```text
Omega_x = 0
Omega_y = 0
```

por lo que queda exactamente:

```text
L_body,Y = I_yz Omega_z
```

El término fuera de diagonal procede del término de Steiner/paralelo de ejes:

```text
I_yz = -mu r_y r_z
     = -(2.320441988950276)(0.60)(0.40)
     = -0.5569060773480662 kg·m²
```

La velocidad `Omega_z` viene de la ecuación cerrada existente del bearing:

```text
Omega_z =
[L0_z - p_s sin(theta) - It thetaDot h_z]
/
[Istar_zz + It cos²(theta)]
```

con `h_z=0` en la convención del motor. Por tanto, durante la maniobra:

```text
Omega_z = -p_s sin(theta) / [Istar_zz + It cos²(theta)]
```

para el caso positivo, con `p_s = Ia*omega = 5.88 kg·m²/s`.

## 4. Tabla numérica: 0° -> +90°

| theta | thetaDot | Omega_b.x | Omega_b.y | Omega_b.z | L_wheel.x | L_wheel.y | L_wheel.z | L_body.x | L_body.y | L_body.z | L_total.x | L_total.y | L_total.z |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0° | 6.28e-12 | 0 | 0 | -4.03e-24 | 5.880000 | -9.24e-13 | 1.79e-23 | 0 | 2.25e-24 | -1.79e-23 | 5.880000 | -9.24e-13 | 0 |
| 30° | 1.570796 | 0 | 0 | -0.646778 | 5.133399 | -0.230907 | 2.868693 | 0 | 0.360195 | -2.868693 | 5.114263 | -0.461316 | -4.44e-16 |
| 45° | 1.570796 | 0 | 0 | -0.922137 | 4.225565 | -0.230907 | 4.090011 | 0 | 0.513544 | -4.090011 | 4.166759 | -0.757236 | 0 |
| 60° | 1.570796 | 0 | 0 | -1.138664 | 3.012479 | -0.230907 | 5.050383 | 0 | 0.634129 | -5.050383 | 2.915726 | -0.857997 | 0 |
| 75° | 1.570796 | 0 | 0 | -1.277701 | 1.568811 | -0.230907 | 5.667062 | 0 | 0.711559 | -5.667062 | 1.555159 | -0.523140 | -8.88e-16 |
| 90° | 0 | 0 | 0 | -1.325710 | 0 | 0 | 5.880000 | 0 | 0.738296 | -5.880000 | 0.623463 | 0.395442 | 0 |

Unidades de `Omega`: rad/s. Unidades de `L`: kg·m²/s.

## 5. Tabla numérica: 0° -> -90°

| theta | thetaDot | Omega_b.z | L_wheel.y | L_wheel.z | L_body.y | L_body.z | L_total.y | L_total.z |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0° | -6.28e-12 | +4.03e-24 | +9.24e-13 | -1.79e-23 | -2.25e-24 | +1.79e-23 | +9.24e-13 | 0 |
| -30° | -1.570796 | +0.646778 | +0.230907 | -2.868693 | -0.360195 | +2.868693 | +0.461316 | +4.44e-16 |
| -45° | -1.570796 | +0.922137 | +0.230907 | -4.090011 | -0.513544 | +4.090011 | +0.757236 | 0 |
| -60° | -1.570796 | +1.138664 | +0.230907 | -5.050383 | -0.634129 | +5.050383 | +0.857997 | 0 |
| -75° | -1.570796 | +1.277701 | +0.230907 | -5.667062 | -0.711559 | +5.667062 | +0.523140 | +8.88e-16 |
| -90° | 0 | +1.325710 | 0 | -5.880000 | -0.738296 | +5.880000 | -0.395442 | 0 |

## 6. Descomposición de L_humano,Y

La comprobación directa del motor da:

```text
L_body,Y = I_yy Omega_y + I_yz Omega_z
```

En todos los puntos no triviales de estas maniobras:

```text
I_yy Omega_y = 0
I_yz Omega_z = L_body,Y
```

Ejemplos:

```text
+45°:
I_yy Omega_y = 0
I_yz Omega_z = (-0.5569060773480662)(-0.9221374557056037)
               = +0.5135439532327338

-45°:
I_yy Omega_y = 0
I_yz Omega_z = (-0.5569060773480662)(+0.9221374557056037)
               = -0.5135439532327338

+90°:
I_yy Omega_y = 0
I_yz Omega_z = +0.7382959641255602

-90°:
I_yy Omega_y = 0
I_yz Omega_z = -0.7382959641255602
```

El residuo de la identidad `L_body,Y - (I_yy Omega_y + I_yz Omega_z)` fue cero a precisión de máquina en las muestras calculadas, porque `L_body` se obtiene directamente de esa multiplicación matricial.

## 7. ¿Proviene de q?

No como causa primaria.

`q` transforma vectores entre cuerpo y mundo. No genera por sí mismo la componente `L_body,Y` que aparece en la tabla. La componente ya está presente en `L_body = Istar Omega_b` en el marco corporal.

`q` sí es necesario para obtener `L_total_world` y para el render, pero no es el origen de `L_body,Y`.

## 8. ¿Proviene de thetaDot?

No directamente en la ecuación de `L_body` de este modo.

`thetaDot` participa en las ecuaciones dinámicas y en `L_wheel`, pero `L_body,Y` se obtiene de `Istar Omega_b`. En los puntos mostrados, `Omega_b.y=0`, por lo que `thetaDot` no aporta directamente al término Y del momento humano.

## 9. ¿Proviene del tensor de inercia transformado por theta?

No en el sentido de una transformación de `Istar` dependiente de theta. En el motor, `Istar` es el tensor corporal base y es constante en el marco corporal.

La dependencia con theta aparece en `Ic`, que añade la parte de inercia axial transversal de la rueda:

```text
Ic(theta) = Istar + It (I - n nᵀ)
```

Eso determina `Omega_b`, y por esa vía cambia indirectamente `L_body,Y`. Pero la componente Y observada en `L_body` procede específicamente del término fuera de diagonal `I_yz` de `Istar`.

## 10. ¿Por qué aparece aunque visualmente parezca X -> Z?

Porque `X -> Z` describe principalmente la orientación del eje de la rueda. El momento angular del humano se expresa en el marco corporal y la inercia corporal no es diagonal en ese marco debido al desplazamiento `r_w=[0,0.60,0.40]`.

Ese desplazamiento genera el producto de inercia `I_yz != 0`. Cuando la reacción del cuerpo genera `Omega_z`, la relación vectorial `L=I Omega` produce una componente Y aunque `Omega` tenga solamente componente Z.

Por eso no se debe inferir `L_y=0` a partir de que la geometría visual parezca una rotación pura X->Z.

## 11. ¿Es físico o residuo numérico?

Es un término físico del modelo, no un residuo numérico.

En el extremo `+90°`:

```text
|L_body,Y| = 0.7382959641 kg·m²/s
```

En `-90°`:

```text
|L_body,Y| = 0.7382959641 kg·m²/s
```

En cambio, la componente Z conservada por el VerticalBearing queda a nivel de:

```text
max |L_total,Z| ≈ 8.88e-16 kg·m²/s
```

La comprobación contra el oracle de la fase mantiene errores de ángulo de quaternion de `3.30e-15 rad` como máximo en Free y `2.22e-15 rad` en VerticalBearing, y error máximo de energía de `1.42e-14 J` en Free.

La componente Y física es, por tanto, aproximadamente 14 órdenes de magnitud mayor que esos residuos numéricos de conservación/validación.

## 12. Comparación +90° / -90°

El signo cambia:

```text
+90° -> L_body,Y = +0.7382959641 kg·m²/s
-90° -> L_body,Y = -0.7382959641 kg·m²/s
```

La razón es doblemente directa en la ecuación:

```text
Omega_z ∝ -sin(theta)
L_body,Y = I_yz Omega_z
```

`I_yz` es negativo y fijo. Por ello cambiar `theta` de +90° a -90° cambia el signo de `Omega_z` y, consecuentemente, el signo de `L_body,Y`.

## 13. Sobre la conservación

En `VerticalBearing` no se debe exigir conservación del vector completo `L_total_world`: el apoyo puede ejercer torque externo horizontal.

La tabla muestra precisamente que `L_total,Z` permanece aproximadamente cero mientras `L_total,X` y `L_total,Y` pueden cambiar durante la maniobra.

Esto es coherente con el modelo del bearing y no constituye una violación de la conservación que el modelo impone.

## 14. Conclusión

`L_humano,Y` es un término físico real del modelo.

La causa exacta es el producto de inercia:

```text
I_yz = -mu r_y r_z
```

combinado con la reacción `Omega_b.z` producida por la dinámica del VerticalBearing.

No es creado por el render, no es creado por `q`, no es una animación, y no es un residuo numérico.

La magnitud para el caso solicitado alcanza aproximadamente:

```text
|L_humano,Y| = 0.738296 kg·m²/s
```

en ±90°, con signo opuesto entre las dos direcciones.

## 15. Corrección requerida

**No requiere ninguna corrección física.**

La fase 3N.18 no modifica las ecuaciones del motor por este fenómeno. El informe es exclusivamente diagnóstico, como se solicitó.
