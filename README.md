# Angular Momentum Engine v1

Motor físico v1 según `SPEC_MOTOR.md`. Las ecuaciones y las decisiones D-1…D-10 son la fuente de verdad.

## Requisitos

- Node.js 18+ (ES modules y `node:test`)
- Python 3.10+
- NumPy y SciPy para el oracle/referencia Python

## Verificación reproducible

Desde la raíz del proyecto:

```bash
npm test
npm run crosscheck
```

`npm test` ejecuta T1–T12 del motor JS.

`npm run crosscheck` primero ejecuta `oracle/make_golden.py`, que genera `oracle/golden.json` **únicamente desde `oracle.py`**, y luego compara el motor JS contra esos resultados independientes. El golden no es una implementación alternativa del motor JS.

La API pública está exportada desde `src/index.js` e incluye `createParams`, `validateParams`, `makeContext`, `frame`, `Istar`, `Ic`, `dIc`, `Plan`, `omega`, `evaluate`, `run`, `initialState`, `AngularMomentumEngine`, las operaciones de cuaterniones y `math`.

## Referencia Python completa

`tests.py` es la batería Python de referencia y no forma parte de `npm test`. Ejecutarla con:

```bash
npm run reference-python
# o: python3 tests.py
```

Puede ser una ejecución larga debido a las simulaciones y validaciones de referencia; no se reemplaza ni se acorta mediante el crosscheck.

## Estructura

- `src/index.js`: motor v1.
- `test/engine.test.js`: T1–T12.
- `oracle.py`: oracle independiente NumPy.
- `oracle/make_golden.py`: generación de datos golden desde el oracle.
- `oracle/golden.json`: salida reproducible del oracle.
- `tests/helpers.js`: utilidades del crosscheck.
- `tests/oracle_crosscheck.test.js`: comparación JS↔Python.
- `SPEC_MOTOR.md`: fuente de verdad física.

## Capa de integración (Agente 2)

La integración mantiene el motor físico como caja negra:

```text
Application
    ↓
SimulationController
    ↓
EngineAdapter
    ↓
AngularMomentumEngine
```

### EngineAdapter

`src/simulation/EngineAdapter.js` es la interfaz de la aplicación con el motor. Expone:

- `EngineAdapter.create(options)`
- `step(dt)`
- `reset(options)`
- `getState()`
- `setMode(mode)`
- `setParams(params)`

`step(dt)` sólo acepta múltiplos enteros del `params.dt` físico y delega la evolución en `AngularMomentumEngine`; no contiene ecuaciones físicas.

`getState()` devuelve un snapshot aislado. Cambiar modo o parámetros reconstruye el motor y reinicia la simulación para evitar alterar una integración en curso.

### SimulationController

`src/simulation/SimulationController.js` separa tiempo real de tiempo físico mediante un acumulador y un `physicsDt` fijo tomado de `params.dt`.

```text
realDelta × timeScale
        ↓
    accumulator
        ↓
 fixed physicsDt
        ↓
EngineAdapter.step(physicsDt)
```

La API es:

- `start()` — pasa de `stopped` a `running` sin reiniciar.
- `pause()` — congela el avance físico.
- `resume()` — continúa desde el estado actual.
- `stop()` — detiene y descarta el remanente del acumulador, sin reiniciar la física.
- `reset()` — vuelve al estado inicial y queda `stopped`.
- `advance(realDelta)` — consume tiempo real sólo cuando está `running`.
- `setTimeScale(scale)` — modifica únicamente cuánto tiempo físico se acumula.
- `getState()` — devuelve estado temporal y snapshot físico.

Los `realDelta` negativos, `NaN` e infinitos se ignoran. Por defecto, un `realDelta` mayor que `0.1 s` se limita a `0.1 s`; el timestep físico nunca se modifica.

### Tests de integración

```bash
npm run test:integration
```

Incluye las pruebas del adaptador y del controlador, incluyendo determinismo, independencia del frame rate, pausa, escalado temporal, deltas inválidos y protección ante deltas grandes.

## Ejecución local

Requiere Node.js y npm. Instalar las dependencias y ejecutar:

```bash
npm install
npm run dev
```

El servidor de desarrollo es Vite. Para generar el paquete de producción:

```bash
npm run build
```

El resultado queda en `dist/`. Para previsualizar exactamente ese build:

```bash
npm run preview
```

## GitHub Pages

El proyecto incluye `vite.config.js` con `base: './'`. Esto hace que los assets del build utilicen rutas relativas y puedan funcionar cuando GitHub Pages sirva el proyecto bajo una ruta de repositorio, por ejemplo `/<repositorio>/`. No se fija ningún nombre de repositorio ni URL concreta.

La publicación en GitHub Pages corresponde a una fase posterior.

## Validación

Los scripts existentes de validación se conservan:

```bash
npm test
npm run crosscheck
npm run test:integration
```

`npm run crosscheck` regenera `oracle/golden.json`; antes de distribuir una versión se debe comprobar que el hash del golden permanezca idéntico al baseline validado.
