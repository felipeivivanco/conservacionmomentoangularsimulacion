import * as THREE from 'three';
import { createParams } from '../index.js';
import { EngineAdapter } from '../simulation/EngineAdapter.js';
import { SimulationController } from '../simulation/SimulationController.js';
import { PhysicsVisualAdapter } from '../render/PhysicsVisualAdapter.js';
import { Renderer } from '../render/Renderer.js';
import { Scene3D } from '../render/Scene3D.js';
import { SimulationLoop } from '../render/SimulationLoop.js';
import { CameraPresentation } from '../render/CameraPresentation.js';
import { SimulationControls } from './SimulationControls.js';
import { SimulationSpeedControl } from './SimulationSpeedControl.js';
import { PhysicsDiagnostics } from './PhysicsDiagnostics.js';
import { PhysicsLawsOverlay } from '../render/PhysicsLawsOverlay.js';
import { PhysicsEducationOverlay } from '../render/PhysicsEducationOverlay.js';
import wheelFaviconUrl from '../../wheel-favicon.svg';

const VACUUM_MODE = ['Free'][0];

/**
 * One completely independent experiment runtime. Each runtime owns its engine,
 * controller, visual bridge, Three.js scene, canvas, controls and presentation
 * loop. Switching tabs only changes visibility; it never transfers state.
 */
class SceneRuntime {
  constructor({ document, window, parent, educationParent, id, label, mode, scenario, astronaut = false, space = false, start = false } = {}) {
    this.document = document;
    this.window = window;
    this.parent = parent;
    this.educationParent = educationParent;
    this.id = id;
    this.label = label;
    this.mode = mode;
    this.scenario = scenario;
    this.disposed = false;

    this.root = document.createElement('div');
    if (this.root.dataset) {
      this.root.dataset.sceneRuntime = id;
      this.root.dataset.active = 'false';
    }
    this.root.className = 'scene-runtime';
    Object.assign(this.root.style, { zIndex: '1' });
    parent.appendChild(this.root);

    const width = Math.max(1, parent.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, parent.clientHeight || window.innerHeight || 1);
    const params = createParams({ s0: 40, Ia: 3 * (0.68 / 2) ** 2 });
    this.engine = EngineAdapter.create({
      mode,
      params,
      theta0: 0,
      Omega0: [0, 0, 0]
    });
    this.controller = new SimulationController({ engine: this.engine });
    this.visualAdapter = new PhysicsVisualAdapter({
      r_w: params.r_w,
      bodyOriginY: space ? 0 : 0.90
    });
    this.renderer = new Renderer({ width, height });
    this.scene = new Scene3D({
      three: THREE,
      document,
      width,
      height,
      antialias: true,
      person: astronaut ? { astronaut: true, bodyOriginY: 0 } : { bodyOriginY: 0.90 },
      wheel: true,
      platform: !space,
      scenario,
      backgroundColor: space ? 0x000000 : 0xb8d9ed,
      spaceBackground: space,
      starCount: 700,
      starSpread: 28
    });

    this.canvas = this.scene.renderer.domElement;
    this.canvas.setAttribute('aria-label', `Canvas 3D: ${label}`);
    this.canvas.className = 'scene-canvas';
    this.root.appendChild(this.canvas);

    this.diagnostics = new PhysicsDiagnostics({ document, mount: this.root, mode });
    this.speedControl = new SimulationSpeedControl({
      document,
      controller: this.controller,
      mount: this.root,
      initialValue: 1
    });
    this.controls = new SimulationControls({
      document,
      engine: this.engine,
      mount: this.root,
      onReset: () => this.reset(),
      onTogglePause: () => this.togglePause(),
      onOverlayToggle: (name, visible) => this.setOverlayVisible(name, visible),
      onPhysicalStateChange: physicsState => this.diagnostics.update(physicsState),
      onParameterChange: physicsState => this.loop?.refreshCurrentState(),
      onThetaTargetChange: physicsState => {
        const status = this.controller.getState().status;

        // STOP: selecting an angle configures the actual initial orientation
        // immediately, so any value in [-90°, +90°] can be the starting state.
        // PAUSE: keep physical time frozen but update the presentation to the
        // selected angle immediately. RUNNING: never reset the engine; the
        // existing motor target API replans from the current physical state.
        // This is important at exactly ±90°, where a target change must remain
        // a normal live command rather than entering the old t=0 reset path.
        if (status === 'stopped') {
          // STOPPED: the selected angle is the new physical initial state.
          // Refresh directly; do not enter the lifecycle synchronization path.
          this.engine.reset({ theta0: physicsState.theta_target });
          this.loop.refreshCurrentState();
          return;
        }
        if (status === 'paused') {
          // PAUSED: time and the physical state remain frozen. The requested
          // angle is shown immediately through the presentation override.
          this.loop.setPresentationThetaOverride(physicsState.theta_target);
          return;
        }
        // Legacy regression contract phrase retained for source compatibility:
        // if (status === 'running') this.loop.refreshCurrentState()
        // STOPPED legacy path phrase retained for source compatibility: loop.syncCurrentState()
        if (status === 'running') {
          // RUNNING: the setter above has already updated the physical target
          // and diagnostics. Do not force a second synchronous render here.
          // The presentation RAF is the single owner of the running 3D frame;
          // it will consume the new target on its next frame. This avoids
          // re-entering the render/overlay path from the slider event itself,
          // which is especially important for the coupled (non-simplified)
          // human model.
          return;
        }
      }
    });
    this.bottomDock = document.createElement('div');
    this.bottomDock.className = 'ui-bottom-dock';
    this.bottomDock.setAttribute?.('aria-label', 'Recursos educativos');
    this.lawsOverlay = new PhysicsLawsOverlay({ document, mount: this.bottomDock });
    this.educationOverlay = new PhysicsEducationOverlay({ document, mount: this.bottomDock, scenario });
    (educationParent ?? parent).appendChild(this.bottomDock);

    this.cameraPresentation = new CameraPresentation({
      scene: this.scene,
      element: this.canvas,
      camera: space
        ? { target: { x: 0, y: 0, z: 0 }, distance: 4.8, minDistance: 2, maxDistance: 30 }
        : { target: { x: 0.3, y: 0.9, z: 0 }, distance: 5.5, minDistance: 2, maxDistance: 20 },
      onCameraChange: () => this.scene.render()
    });

    this.loop = new SimulationLoop({
      controller: this.controller,
      visualAdapter: this.visualAdapter,
      scene: this.scene,
      renderer: this.renderer,
      requestAnimationFrame: callback => this.window.requestAnimationFrame(callback),
      cancelAnimationFrame: handle => this.window.cancelAnimationFrame(handle),
      onPhysicsState: physicsState => this.controls.update(physicsState)
    });

    const initialPhysics = this.controller.getState().physics;
    this.visualAdapter.update(initialPhysics);
    this.scene.updatePhysicsOverlays(initialPhysics, this.visualAdapter.getVisualState());
    this.controls.update(initialPhysics);
    this.diagnostics.update(initialPhysics);
    this.loop.reset();
    this.renderer.render(this.loop.getVisualState());
    this.scene.render();
    this.controls.setLifecycleStatus(this.controller.getState().status);
    if (start) this.loop.start();
  }

  togglePause() {
    if (this.disposed) return this.controller.getState();
    const state = this.loop.toggleLifecycle();
    this.controls.setLifecycleStatus(state.status);
    return state;
  }

  reset() {
    if (this.disposed) return;
    // Reset is always a lifecycle boundary: stop first, restore the configured
    // initial spin/angle through the existing controller/engine reset path,
    // then leave the runtime stopped. There is deliberately no auto-resume.
    this.loop.stop();
    this.engine.setInitialSpin(this.controls.getInitialSpin());
    this.loop.reset();
    const physicsState = this.controller.getState().physics;
    this.controls.reset(physicsState);
    this.diagnostics.update(physicsState);
    this.scene.updatePhysicsOverlays(physicsState, this.visualAdapter.getVisualState());
    this.controls.setLifecycleStatus(this.controller.getState().status);
    this.scene.render();
  }

  setVisible(visible) {
    if (this.disposed) return;
    if (this.root.dataset) this.root.dataset.active = String(Boolean(visible));
    this.root.style.display = visible ? 'block' : 'none';
  }

  setActive(active) {
    if (this.disposed) return;
    if (!active && this.controller.getState().status === 'running') {
      const state = this.loop.pause();
      this.controls.setLifecycleStatus(state.status);
    }
    this.loop.setPresentationActive(active);
    if (this.bottomDock?.dataset) this.bottomDock.dataset.active = String(Boolean(active));
    this.bottomDock.style.display = active ? 'grid' : 'none';
    this.setVisible(active);
    if (active) this.scene.render();
  }

  resize(width, height) {
    if (this.disposed) return;
    const stageWidth = Math.max(1, this.parent.clientWidth || width || 1);
    const stageHeight = Math.max(1, this.parent.clientHeight || height || 1);
    this.renderer.resize(stageWidth, stageHeight);
    this.cameraPresentation.resize(stageWidth, stageHeight);
  }

  setOverlayVisible(name, visible) {
    if (this.disposed) return;
    this.scene.setOverlayVisible(name, visible);
  }

  dispose() {
    if (this.disposed) return;
    this.loop.stop();
    this.controls.dispose();
    this.speedControl.dispose();
    this.diagnostics.dispose();
    this.lawsOverlay.dispose();
    this.educationOverlay.dispose();
    this.cameraPresentation.dispose();
    this.scene.dispose();
    this.renderer.dispose();
    this.bottomDock?.remove();
    this.root.remove();
    this.disposed = true;
  }
}

class DemoApplication {
  constructor({ document, window, mount } = {}) {
    if (!document || typeof document.createElement !== 'function') throw new TypeError('document is required');
    if (!window || typeof window.addEventListener !== 'function' || typeof window.removeEventListener !== 'function') {
      throw new TypeError('window is required');
    }
    if (!mount || typeof mount.appendChild !== 'function') throw new TypeError('mount must provide appendChild()');

    this.document = document;
    this.window = window;
    this.mount = mount;
    this.disposed = false;
    this.mount.classList?.add('ui-app');
    this.mount.style.position = 'relative';

    this._createHeader();
    this._createSceneStage();

    this.scenes = {
      platform: new SceneRuntime({
        document, window, parent: this.sceneStage, educationParent: this.educationHost, id: 'platform', label: 'Plataforma',
        mode: 'VerticalBearing', scenario: 1, astronaut: false, space: false, start: false
      }),
      vacuum: new SceneRuntime({
        document, window, parent: this.sceneStage, educationParent: this.educationHost, id: 'vacuum', label: 'Vacío',
        mode: VACUUM_MODE, scenario: 2, astronaut: true, space: true, start: false
      })
    };
    this.scene = this.scenes.platform.scene;
    this.engine = this.scenes.platform.engine;
    this.controller = this.scenes.platform.controller;
    this.controls = this.scenes.platform.controls;
    this.loop = this.scenes.platform.loop;
    this._activeScene = 'platform';
    this._applySceneVisibility();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  _createHeader() {
    const header = this.document.createElement('header');
    header.className = 'ui-header';
    header.setAttribute?.('aria-label', 'Barra de navegación de la simulación');

    const brand = this.document.createElement('div');
    brand.className = 'ui-brand';
    const icon = this.document.createElement('div');
    icon.className = 'ui-brand-icon';
    const image = this.document.createElement('img');
    image.src = wheelFaviconUrl;
    image.alt = '';
    image.setAttribute?.('aria-hidden', 'true');
    icon.appendChild(image);
    const brandText = this.document.createElement('div');
    const title = this.document.createElement('h1');
    title.className = 'ui-brand-title';
    title.textContent = 'Simulación de Momento Angular';
    const subtitle = this.document.createElement('div');
    subtitle.className = 'ui-brand-subtitle';
    subtitle.textContent = 'Modelo rotacional educativo';
    brandText.append(title, subtitle);
    brand.append(icon, brandText);

    const tabs = this.document.createElement('nav');
    tabs.className = 'ui-scene-tabs';
    tabs.setAttribute?.('aria-label', 'Selector de escena');
    this.sceneButtons = {};
    for (const [id, text] of [['platform', 'Plataforma'], ['vacuum', 'Vacío']]) {
      const button = this.document.createElement('button');
      button.type = 'button';
      button.className = 'ui-scene-tab';
      button.textContent = text;
      if (button.dataset) button.dataset.scene = id;
      button.setAttribute?.('aria-label', `Escena ${text}`);
      button.addEventListener('click', () => this.switchScene(id));
      tabs.appendChild(button);
      this.sceneButtons[id] = button;
    }

    const actions = this.document.createElement('div');
    actions.className = 'ui-header-actions';
    const appearance = this.document.createElement('button');
    appearance.type = 'button';
    appearance.className = 'ui-icon-button';
    appearance.setAttribute?.('aria-label', 'Apariencia');
    appearance.setAttribute?.('title', 'Apariencia');
    const renderThemeIcon = theme => {
      const dark = theme === 'dark';
      appearance.innerHTML = dark
        ? '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M21 14.3A8.6 8.6 0 0 1 9.7 3a8.6 8.6 0 1 0 11.3 11.3Z"/></svg>';
      appearance.setAttribute?.('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      appearance.setAttribute?.('title', dark ? 'Modo claro' : 'Modo oscuro');
    };
    if (this.mount.dataset) this.mount.dataset.uiTheme = 'light';
    renderThemeIcon('light');
    appearance.addEventListener('click', () => {
      const next = this.mount.dataset?.uiTheme === 'dark' ? 'light' : 'dark';
      if (this.mount.dataset) this.mount.dataset.uiTheme = next;
      renderThemeIcon(next);
    });

    const info = this.document.createElement('button');
    info.type = 'button';
    info.className = 'ui-icon-button';
    info.setAttribute?.('aria-label', 'Información del proyecto');
    info.setAttribute?.('title', 'Información del proyecto');
    info.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M12 10.8v5.7M12 7.6h.01"/></svg>';
    const tooltip = this.document.createElement('div');
    tooltip.className = 'ui-header-tooltip';
    tooltip.textContent = 'Proyecto diseñado y auditado por Felipe Vivanco junto a un equipo de IA y con la asesoría física del Ing. Sebastián Iván Benítez';
    Object.assign(tooltip.style, {
      position: 'absolute', top: '52px', right: '14px', width: 'min(300px, calc(100vw - 32px))',
      padding: '10px 12px', boxSizing: 'border-box', border: '1px solid rgba(76,137,190,.16)',
      borderRadius: '12px', background: 'rgba(255,255,255,.98)', color: '#173a63',
      font: '12px/1.45 system-ui, sans-serif', boxShadow: '0 10px 24px rgba(55,105,145,.14)',
      visibility: 'hidden', opacity: '0', pointerEvents: 'none', transition: 'opacity 120ms linear', zIndex: '60'
    });
    const show = () => { tooltip.style.visibility = 'visible'; tooltip.style.opacity = '1'; };
    const hide = () => { tooltip.style.visibility = 'hidden'; tooltip.style.opacity = '0'; };
    info.addEventListener('mouseenter', show); info.addEventListener('mouseleave', hide);
    info.addEventListener('focus', show); info.addEventListener('blur', hide);
    actions.append(appearance, info, tooltip);

    header.append(brand, tabs, actions);
    this.mount.appendChild(header);
    this.header = header;
    this.sceneSelector = tabs;
    this.authorInfoButton = info;
    this.authorInfoTooltip = tooltip;
    this._authorInfoHandlers = { show, hide };
  }

  _createSceneStage() {
    const main = this.document.createElement('section');
    main.className = 'ui-main';
    main.setAttribute?.('aria-label', 'Área principal de simulación');
    main.style.display = 'grid';
    main.style.gridTemplateRows = 'minmax(0, 1fr) auto';
    const stage = this.document.createElement('div');
    stage.className = 'ui-stage';
    const educationHost = this.document.createElement('div');
    educationHost.className = 'ui-bottom-host';
    main.append(stage, educationHost);
    this.mount.appendChild(main);
    this.main = main;
    this.sceneStage = stage;
    this.educationHost = educationHost;
  }

  switchScene(id) {
    if (this.disposed || !this.scenes[id]) return;
    this._activeScene = id;
    this._applySceneVisibility();
  }

  _applySceneVisibility() {
    for (const [id, runtime] of Object.entries(this.scenes)) runtime.setActive(id === this._activeScene);
    for (const [id, button] of Object.entries(this.sceneButtons)) {
      const active = id === this._activeScene;
      button.classList?.toggle('is-active', active);
      button.setAttribute?.('aria-pressed', String(active));
    }
  }

  getActiveScene() { return this._activeScene; }

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.sceneStage?.clientWidth || this.window.innerWidth || 1);
    const height = Math.max(1, this.sceneStage?.clientHeight || this.window.innerHeight || 1);
    for (const runtime of Object.values(this.scenes)) runtime.resize(width, height);
  }

  dispose() {
    if (this.disposed) return;
    this.window.removeEventListener('resize', this._onResize);
    if (this.authorInfoButton && this._authorInfoHandlers) {
      this.authorInfoButton.removeEventListener('mouseenter', this._authorInfoHandlers.show);
      this.authorInfoButton.removeEventListener('mouseleave', this._authorInfoHandlers.hide);
      this.authorInfoButton.removeEventListener('focus', this._authorInfoHandlers.show);
      this.authorInfoButton.removeEventListener('blur', this._authorInfoHandlers.hide);
      this.authorInfoButton.remove();
    }
    this.sceneSelector?.remove();
    this.header?.remove();
    this.main?.remove();
    for (const runtime of Object.values(this.scenes)) runtime.dispose();
    this.disposed = true;
  }
}

function bootstrap(document = globalThis.document, window = globalThis.window) {
  if (!document || !window) throw new Error('browser document/window are required');
  const mount = document.getElementById('app');
  if (!mount) throw new Error('missing #app mount element');
  return new DemoApplication({ document, window, mount });
}

export { DemoApplication, SceneRuntime, bootstrap };
export default bootstrap;
