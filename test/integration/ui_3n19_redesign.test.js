import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('3N.19-UI-A — la nueva composición separa header, main, escenario y barra educativa', () => {
  const main = read('src/app/main.js');
  const css = read('src/app/ui-theme.css');
  const html = read('index.html');
  assert.match(main, /className = 'ui-header'/);
  assert.match(main, /className = 'ui-main'/);
  assert.match(main, /className = 'ui-stage'/);
  assert.match(main, /className = 'ui-bottom-host'/);
  assert.match(main, /educationParent: this\.educationHost/);
  assert.match(css, /#app\.ui-app/);
  assert.match(css, /\.ui-main\s*\{[\s\S]*grid-template-rows/);
  assert.match(html, /src\/app\/ui-theme\.css/);
});

test('3N.19-UI-B — los paneles y acciones usan layout adaptable sin position fixed', () => {
  const css = read('src/app/ui-theme.css');
  assert.match(css, /\.ui-controls-scroll\s*\{[\s\S]*overflow-y:auto/);
  assert.match(css, /\.ui-diagnostics\s*\{[\s\S]*overflow-y:auto/);
  assert.match(css, /\.ui-bottom-dock\s*\{[\s\S]*position:relative/);
  assert.match(css, /@media \(max-height: 820px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.doesNotMatch(css, /\.ui-bottom-dock[^}]*position:\s*fixed/);
});

test('3N.19-UI-C — la UI mantiene las APIs existentes para overlays y escenas', () => {
  const controls = read('src/app/SimulationControls.js');
  const main = read('src/app/main.js');
  assert.match(controls, /onOverlayToggle\?\.\(key,input\.checked\)/);
  assert.match(main, /setOverlayVisible\(name, visible\)/);
  assert.match(main, /mode: 'VerticalBearing'/);
  assert.match(main, /mode: VACUUM_MODE/);
  assert.match(main, /this\.engine = EngineAdapter\.create/);
  assert.match(main, /this\.controller = new SimulationController/);
});

test('3N.19-UI-D — la escena 3D solo recibe cambios de presentación', () => {
  const scene = read('src/render/Scene3D.js');
  assert.match(scene, /presentation-grid/);
  assert.match(scene, /GridHelper/);
  assert.match(scene, /spaceBackground \? 0x000000/);
  assert.match(scene, /dff2ff/);
  assert.doesNotMatch(scene, /SimulationController|EngineAdapter|setSpinRate|setThetaTarget/);
});


test('3N.19-UI-E — layout final mantiene paneles contenidos, barra asimétrica y tema real', () => {
  const css = read('src/app/ui-theme.css');
  const main = read('src/app/main.js');
  assert.match(css, /\.ui-controls\s*\{[^}]*top:10px[^}]*bottom:auto[^}]*max-height:calc\(100% - 82px\)/s);
  assert.match(css, /\.ui-diagnostics\s*\{[^}]*top:10px[^}]*bottom:auto[^}]*max-height:calc\(100% - 82px\)/s);
  assert.match(css, /\.ui-bottom-dock\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/s);
  assert.match(css, /\.ui-bottom-dock > \.ui-bottom-laws\s*\{[^}]*justify-self:start/s);
  assert.match(css, /\.ui-bottom-dock > \.ui-bottom-what\s*\{[^}]*justify-self:end/s);
  assert.match(css, /\.ui-bottom-toggle\s*\{[^}]*white-space:nowrap/s);
  assert.match(css, /font-size:13(?:\.5)?px/);
  assert.match(css, /\.ui-education-section\s*\{[^}]*font-size:13\.5px/s);
  assert.match(css, /#app\[data-ui-theme="dark"\]/);
  assert.match(css, /\.ui-control-value input/);
  assert.match(main, /dataset.uiTheme = 'light'/);
  assert.match(main, /next = this\.mount\.dataset\?\.uiTheme === 'dark' \? 'light' : 'dark'/);
  assert.match(main, /Cambiar a modo oscuro/);
  assert.match(main, /Cambiar a modo claro/);
});

test('3N.19-UI-F — los cuatro valores editables están en los nodos junto a sus sliders', () => {
  const controls = read('src/app/SimulationControls.js');
  assert.match(controls, /controlGroup\(this\.thetaLabel, this\.thetaSlider, this\.thetaValue\)/);
  assert.match(controls, /controlGroup\(this\.spinLabel, this\.spinSlider, this\.spinValue\)/);
  assert.match(controls, /controlGroup\(this\.diameterLabel, this\.diameterSlider, this\.diameterValue\)/);
  assert.match(controls, /controlGroup\(this\.massLabel, this\.massSlider, this\.massValue\)/);
  assert.match(controls, /_installNumericEditing\(this\.thetaValue/);
  assert.match(controls, /_installNumericEditing\(this\.spinValue/);
  assert.match(controls, /_installNumericEditing\(this\.diameterValue/);
  assert.match(controls, /_installNumericEditing\(this\.massValue/);
  assert.match(controls, /this\.readout\.appendChild\(this\.inertiaReadout\)/);
});

test('3N.19-UI-G — el ? de L humano existe únicamente en Plataforma', async () => {
  const source = read('src/app/PhysicsDiagnostics.js');
  assert.match(source, /if \(this\.mode !== 'Free' && title === 'L — humano' && axis === 'y'\) this\._addHumanYHelp/);
});


test('C.1-A — las cuatro superficies principales quedan separadas del flujo de la escena y no existe un marco exterior', () => {
  const css = read('src/app/ui-theme.css');
  assert.match(css, /\.ui-main\s*\{[^}]*overflow:visible/);
  assert.match(css, /\.ui-stage\s*\{[^}]*position:absolute[^}]*inset:0/);
  assert.match(css, /\.ui-bottom-host\s*\{[^}]*position:absolute[^}]*bottom:var\(--ui-gap\)/);
  assert.match(css, /\.ui-controls[^}]*max-height:calc\(100% - 82px\)/s);
  assert.match(css, /\.ui-diagnostics[^}]*max-height:calc\(100% - 82px\)/s);
  assert.doesNotMatch(css, /\.ui-main\s*\{[^}]*background\s*:/);
  assert.doesNotMatch(css, /\.ui-main\s*\{[^}]*border\s*:/);
});

test('C.1-B — abrir educación no modifica el layout de la escena 3D', () => {
  const css = read('src/app/ui-theme.css');
  const education = read('src/render/PhysicsEducationOverlay.js');
  assert.match(css, /\.ui-bottom-host\s*\{[^}]*position:absolute/);
  assert.match(css, /\.ui-stage\s*\{[^}]*position:absolute[^}]*inset:0/);
  assert.match(education, /this\.content\.style\.display = this\.expanded \? 'block' : 'none'/);
  assert.doesNotMatch(education, /parentElement\?\.style\?\.setProperty\?\.\('--ui-dock-height'/);
});

test('C.1-C — el tooltip de L humano usa un stacking context superior y solo se crea en Plataforma', () => {
  const source = read('src/app/PhysicsDiagnostics.js');
  assert.match(source, /this\.mode !== 'Free' && title === 'L — humano' && axis === 'y'/);
  assert.match(source, /const tooltipHost = this\.mount\.parentElement \|\| this\.mount/);
  assert.match(source, /zIndex: '1000'/);
});
