import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createMaterials, noiseTexture } from './textures.js';
import { createSky } from './sky.js';
import { buildGhost } from './ghost.js';
import { installSoftShadows, createBounceLight } from './lighting.js';
import { createWalk } from './walk.js';


// Final colour treatment, applied after tone mapping: a little more contrast and
// saturation, warmer highlights against cooler shadows, and a soft vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.1 }, saturation: { value: 1.1 }, vignette: { value: 0.3 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color = (color - 0.5) * contrast + 0.5;
      color += (luma - 0.5) * vec3(0.035, 0.005, -0.04);
      color *= 1.0 - vignette * smoothstep(0.3, 0.95, length(vUv - 0.5) * 1.25);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }`,
};

// The viewer engine. A scene definition supplies the camera views, labels, texts, the
// places walk mode can start from (see walk.js) and a `build(sets)` function that returns
// the geometry for each layer:
//   today.remains  what survives from antiquity      today.modern   everything built since
//   ancient.core   the reconstructed monument        ancient.context  its ancient surroundings
export function createViewer(definition) {
  installSoftShadows();
  const VIEWS = definition.views;
  const LABELS = definition.labels;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Nothing moves, so the shadow map is only redrawn when the visible era changes.
  renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  // Sky, clouds and far hills live in their own scene so that ambient occlusion ignores them.
  const backdrop = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc4d0db, 0.001);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.3, 9000);
  camera.position.fromArray(VIEWS[0].position);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(VIEWS[0].target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.497;
  controls.minDistance = 2;
  controls.maxDistance = 700;
  controls.update();

  // A low sun rakes across the stone and gives long shadows; the sky only fills them in a little.
  const sunDirection = new THREE.Vector3().fromArray(definition.sun ?? [0.7, 0.5, 0.52]).normalize();

  const sky = createSky(noiseTexture(), sunDirection, scene.fog.color);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky.mesh);
  sky.uniforms.sunDisc.value = 0;
  scene.environment = pmrem.fromScene(skyScene, 0, 1, 20000).texture;
  scene.environmentIntensity = 0.55;
  sky.uniforms.sunDisc.value = 1;
  backdrop.add(sky.mesh);

  const sun = new THREE.DirectionalLight(0xffe6c8, 5.2);
  sun.position.copy(sunDirection).multiplyScalar(420).add(new THREE.Vector3(0, 0, -5));
  sun.target.position.set(0, 0, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowExtent = definition.shadowExtent ?? [175, 150];
  sun.shadow.camera.left = -shadowExtent[0];
  sun.shadow.camera.right = shadowExtent[0];
  sun.shadow.camera.top = shadowExtent[1];
  sun.shadow.camera.bottom = -shadowExtent[1];
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xb8d0f4, 0xb89c78, 0.5));
  scene.add(createBounceLight(sunDirection));

  let composer = null;
  let occlusion = null;
  let bloom = null;
  let antialias = null;
  let detailShading = false;
  let shadowEra = null;
  // The post-processing path is fill-rate bound, so it renders at a capped resolution
  // and computes ambient occlusion at half of the window size.
  const PIXEL_BUDGET = 9e6;
  function sizeComposer() {
    if (!composer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = Math.min(renderer.getPixelRatio(), Math.sqrt(PIXEL_BUDGET / (width * height)));
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    occlusion.setSize(Math.round(width * 0.5), Math.round(height * 0.5));
    antialias.material.uniforms.resolution.value.set(1 / (width * ratio), 1 / (height * ratio));
  }
  try {
    const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(backdrop, camera));
    const main = new RenderPass(scene, camera);
    main.clear = false;
    main.clearDepth = true;
    composer.addPass(main);
    occlusion = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    occlusion.updateGtaoMaterial({ radius: 3.2, distanceExponent: 1.2, thickness: 1.5, scale: 1.5, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
    occlusion.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.2, rings: 2, samples: 8 });
    // The occlusion pass draws the scene with its own material, which knows nothing of the
    // outline's clipping plane, so the outline is kept out of it.
    const computeOcclusion = occlusion.render.bind(occlusion);
    occlusion.render = (...parameters) => {
      const shown = ghost.visible;
      ghost.visible = false;
      computeOcclusion(...parameters);
      ghost.visible = shown;
    };
    composer.addPass(occlusion);
    bloom =new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.7, 1.6);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
    antialias = new ShaderPass(FXAAShader);
    composer.addPass(antialias);
    sizeComposer();
  } catch (error) {
    console.warn('Detail shading is unavailable', error);
    composer = null;
  }
  renderer.autoClear = false;

  // Graphics levels. `budget` caps the number of rendered pixels, which is what old GPUs run out of first.
  const QUALITY_ORDER = ['low', 'medium', 'high', 'max'];
  const QUALITY = {
    low: { ratio: 1, budget: 1.2e6, shadow: 2048, soft: false, post: false, bloom: false },
    medium: { ratio: 1.5, budget: 3.5e6, shadow: 2048, soft: false, post: false, bloom: false },
    high: { ratio: 2, budget: 14e6, shadow: 4096, soft: true, post: true, bloom: false },
    max: { ratio: 2, budget: 14e6, shadow: 4096, soft: true, post: true, bloom: true },
  };
  const QUALITY_KEY = 'forum-of-caesar-quality';
  let quality = 'high';
  let resolutionScale = 1;
  let autoQuality = true;
  try {
    const stored = JSON.parse(localStorage.getItem(QUALITY_KEY));
    if (stored && QUALITY[stored.level]) {
      quality = stored.level;
      resolutionScale = Math.min(1, Math.max(0.3, stored.scale || 1));
    }
  } catch {
    // Storage can be unavailable in private windows. The default level is used then.
  }

  function applyQuality(level) {
    quality = level;
    const q = QUALITY[level];
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.ratio, Math.sqrt((q.budget * resolutionScale) / (width * height))));
    renderer.setSize(width, height);
    const type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (renderer.shadowMap.type !== type) {
      renderer.shadowMap.type = type;
      scene.traverse((object) => {
        if (object.material) object.material.needsUpdate = true;
      });
    }
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    shadowEra = null;
    if (ghost) ghost.userData.line.linewidth = Math.max(1.3, 1.3 * renderer.getPixelRatio());
    detailShading = q.post && composer !== null;
    if (bloom) bloom.enabled = q.bloom;
    sizeComposer();
    try {
      localStorage.setItem(QUALITY_KEY, JSON.stringify({ level, scale: resolutionScale }));
    } catch {
      // Not being able to remember the level is harmless.
    }
    document.getElementById('quality').value = level;
  }

  // Steps one level down, and below Low keeps shrinking the rendered resolution.
  function lowerQuality() {
    const index = QUALITY_ORDER.indexOf(quality);
    if (index > 0) applyQuality(QUALITY_ORDER[index - 1]);
    else if (resolutionScale > 0.35) {
      resolutionScale *= 0.7;
      applyQuality('low');
    }
  }

  // Distant ridges that rise out of the haze: the base of each ridge has the haze colour.
  function farHills(radius, low, high, ridgeColor, phase) {
    const segments = 240;
    const positions = [];
    const colors = [];
    const base = scene.fog.color;
    const top = new THREE.Color(ridgeColor);
    const height = (i) => {
      const a = (i / segments) * Math.PI * 2;
      const wave = 0.5 + 0.25 * Math.sin(a * 3 + phase) + 0.15 * Math.sin(a * 7 + phase * 2.3) + 0.1 * Math.sin(a * 17 + phase * 0.7);
      return low + (high - low) * Math.max(0, wave);
    };
    const push = (i, y, color) => {
      const a = (i / segments) * Math.PI * 2;
      positions.push(radius * Math.cos(a), y, radius * Math.sin(a));
      colors.push(color.r, color.g, color.b);
    };
    for (let i = 0; i < segments; i++) {
      push(i, -20, base);
      push(i + 1, -20, base);
      push(i, height(i), top);
      push(i + 1, -20, base);
      push(i + 1, height(i + 1), top);
      push(i, height(i), top);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
  }
  backdrop.add(farHills(4400, 170, 470, 0xb0bdcb, 0.4));
  backdrop.add(farHills(3200, 95, 240, 0xa0b0b6, 2.1));

  let ancient = null;
  let today = null;
  let ghost = null;
  let layers = null;
  let compare = false;
  let split = 0.5;
  let showLabels = true;
  let cameraTween = null;

  // One timeline runs from today (0) through the outline rebuild (1) to ancient Rome (2).
  // From 0 to 1 the modern city dissolves and the forum grows as a blue outline.
  // From 1 to 2 the outline fills in solid while the ancient city appears around it.
  const MODES = ['today', 'rebuild', 'ancient'];
  const REBUILD_TOP = definition.rebuildTop;
  const STAGE_SECONDS = 4;
  const ghostPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  const corePlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  let stage = 0;
  let stageTarget = 0;
  let fadeModern = true;
  // Scenes whose ruins are an exact subset of the ancient model can keep the surviving
  // parts visible, with a tint, inside the rebuilt whole.
  const canShowSurviving = definition.remainsMatchCore === true;
  let showSurviving = false;
  const SURVIVING_TINT = new THREE.Color(0xff9a52);

  const $ = (id) => document.getElementById(id);
  const labelNodes = LABELS.map((label) => {
    const node = document.createElement('div');
    node.className = 'label';
    node.textContent = label.text;
    $('labels').appendChild(node);
    return { ...label, node, point: new THREE.Vector3().fromArray(label.at) };
  });

  const walk = createWalk({
    scene, camera, renderer, controls,
    layers: () => [today.modern, today.remains, today.earth, ancient.core, ancient.context].filter(Boolean),
    solids: solidGroups,
    places: definition.places ?? [{ name: 'Start', at: [VIEWS[0].target[0], VIEWS[0].target[1] + 60, VIEWS[0].target[2]] }],
    hint: $('hint'),
    onChange: syncUi,
    onTimeStep: nextMode,
  });

  const smooth = (x) => {
    const t = Math.min(1, Math.max(0, x));
    return t * t * (3 - 2 * t);
  };

  function materialsOf(set) {
    const list = [];
    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      if (value.isMaterial) list.push(value);
      else Object.values(value).forEach(visit);
    };
    visit(set);
    return list;
  }

  // Dissolves a whole layer with dithering, which needs no sorting and keeps depth correct.
  function setOpacity(materials, opacity) {
    const dissolve = opacity < 0.999;
    for (const material of materials) {
      if (material.alphaHash !== dissolve) {
        material.alphaHash = dissolve;
        material.needsUpdate = true;
      }
      material.opacity = dissolve ? opacity : 1;
    }
  }

  function setTint(materials, amount) {
    for (const material of materials) {
      if (!material.color) continue;
      material.userData.baseColor ??= material.color.clone();
      material.color.copy(material.userData.baseColor).lerp(SURVIVING_TINT, amount * 0.38);
    }
  }

  function setShadows(group, on) {
    if (group.userData.shadows === on) return;
    group.userData.shadows = on;
    group.traverse((object) => {
      if (object.isMesh) object.castShadow = on;
    });
  }

  function timelineState(s) {
    const outline = Math.min(1, s);
    const solid = Math.max(0, s - 1);
    const faded = fadeModern ? 1 - 0.74 * smooth(outline * 3) : 1;
    return {
      today: s < 2 || showSurviving,
      modern: faded * (1 - smooth(solid * 1.6)),
      remains: showSurviving ? 1 : 1 - smooth((solid - 0.45) / 0.55),
      tint: showSurviving ? smooth(solid * 1.5) : 0,
      ghost: s > 0.001 && s < 2 ? -0.5 + outline * REBUILD_TOP : null,
      core: s > 1 ? (s >= 2 ? 1e6 : -0.5 + solid * REBUILD_TOP) : null,
      context: smooth(solid * 1.3),
      occlusion: Math.min(1, Math.max(0, 1 - s / 0.2, (s - 1.8) / 0.2)),
      key: `${s.toFixed(3)} ${fadeModern} ${showSurviving}`,
    };
  }

  let appliedTint = 0;
  let appliedSurviving = false;

  function applyState(state) {
    if (showSurviving !== appliedSurviving) {
      // Where ruin and reconstruction coincide, this decides which of the two is drawn.
      appliedSurviving = showSurviving;
      for (const material of layers.core) {
        material.polygonOffsetFactor = material.polygonOffsetUnits = showSurviving ? 0.5 : -1;
      }
    }
    today.group.visible = state.today;
    if (state.today) {
      today.modern.visible = state.modern > 0.01;
      today.remains.visible = state.remains > 0.01;
      if (today.earth) today.earth.visible = today.remains.visible && state.modern < 0.999;
      setOpacity(layers.modern, state.modern);
      setOpacity(layers.remains, state.remains);
      if (state.tint !== appliedTint) {
        appliedTint = state.tint;
        setTint(layers.remains, state.tint);
      }
      setShadows(today.modern, state.modern > 0.5);
      setShadows(today.remains, state.remains > 0.5);
    }
    ghost.visible = state.ghost !== null;
    if (ghost.visible) ghostPlane.constant = state.ghost;
    ancient.core.visible = state.core !== null;
    if (ancient.core.visible) corePlane.constant = state.core;
    ancient.context.visible = state.context > 0.01;
    if (ancient.context.visible) {
      setOpacity(layers.context, state.context);
      setShadows(ancient.context, state.context > 0.5);
    }
    ancient.group.visible = ancient.core.visible || ancient.context.visible;
    if (state.key !== shadowEra) {
      shadowEra = state.key;
      renderer.shadowMap.needsUpdate = true;
    }
  }

  // What the walking character runs into: every layer that is more than half there. The
  // monument is solid as an outline too, from the moment that outline is complete, or
  // earlier if the modern layer has dissolved by then, so that its floors take over from
  // the modern ones without a gap.
  function solidGroups() {
    const state = timelineState(stage);
    const modern = state.today && state.modern > 0.5;
    const groups = [];
    if (modern) groups.push(today.modern);
    if (state.today && state.remains > 0.5) groups.push(today.remains, today.earth);
    if (stage >= 1 || (stage > 0 && !modern)) groups.push(ancient.core);
    if (state.context > 0.5) groups.push(ancient.context);
    return groups.filter(Boolean);
  }

  function currentMode() {
    return compare ? 'compare' : MODES[Math.round(stageTarget)];
  }

  function nextMode() {
    setMode({ today: 'rebuild', rebuild: 'ancient', ancient: 'today', compare: 'today' }[currentMode()]);
  }

  function setMode(mode) {
    compare = false;
    stageTarget = MODES.indexOf(mode);
    syncUi();
  }

  function setEra(target) {
    setMode(target === 1 ? 'ancient' : 'today');
  }

  function setCompare(on) {
    compare = on;
    if (on) {
      split = 0.5;
      walk.exit();
    }
    syncUi();
  }

  function syncUi() {
    const mode = currentMode();
    $('btn-today').classList.toggle('active', mode === 'today');
    $('btn-rebuild').classList.toggle('active', mode === 'rebuild');
    $('btn-ancient').classList.toggle('active', mode === 'ancient');
    $('btn-compare').classList.toggle('active', compare);
    $('btn-labels').classList.toggle('active', showLabels);
    $('btn-walk').classList.toggle('active', walk.active);
    $('btn-fade').classList.toggle('active', fadeModern);
    $('btn-surviving').classList.toggle('active', showSurviving);
    $('btn-surviving').style.display = canShowSurviving ? '' : 'none';
    $('timeline').style.visibility = compare ? 'hidden' : 'visible';
    $('era').textContent = definition.text[mode];
  }

  function goToView(view) {
    cameraTween = {
      t: 0,
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition: new THREE.Vector3().fromArray(view.position),
      toTarget: new THREE.Vector3().fromArray(view.target),
    };
  }

  VIEWS.forEach((view, i) => {
    const button = document.createElement('button');
    button.textContent = view.name;
    button.title = `Shortcut: ${i + 1}`;
    button.addEventListener('click', () => goToView(view));
    $('views').appendChild(button);
  });

  $('btn-today').addEventListener('click', () => setMode('today'));
  $('btn-rebuild').addEventListener('click', () => setMode('rebuild'));
  $('btn-ancient').addEventListener('click', () => setMode('ancient'));
  $('btn-fade').addEventListener('click', () => {
    fadeModern = !fadeModern;
    syncUi();
  });
  $('btn-surviving').addEventListener('click', () => {
    showSurviving = !showSurviving;
    syncUi();
  });
  $('btn-compare').addEventListener('click', () => setCompare(!compare));
  $('btn-walk').addEventListener('click', () => {
    if (walk.active) walk.exit();
    else enterWalk();
  });
  $('btn-labels').addEventListener('click', () => {
    showLabels = !showLabels;
    syncUi();
  });
  $('quality').addEventListener('change', (event) => {
    autoQuality = false;
    resolutionScale = 1;
    applyQuality(event.target.value);
    event.target.blur();
  });

  // Flying: W A S D or the arrow keys move over the ground, Q and E go down and up.
  const FLY_KEYS = { KeyW: [0, 0, 1], ArrowUp: [0, 0, 1], KeyS: [0, 0, -1], ArrowDown: [0, 0, -1], KeyA: [-1, 0, 0], ArrowLeft: [-1, 0, 0], KeyD: [1, 0, 0], ArrowRight: [1, 0, 0], KeyQ: [0, -1, 0], KeyE: [0, 1, 0] };
  const held = new Set();
  const flyForward = new THREE.Vector3();
  const flyRight = new THREE.Vector3();
  const flyStep = new THREE.Vector3();
  function fly(dt) {
    if (held.size === 0) return;
    const speed = (held.has('ShiftLeft') || held.has('ShiftRight') ? 90 : 30) * dt;
    flyForward.subVectors(controls.target, camera.position).setY(0).normalize();
    flyRight.set(-flyForward.z, 0, flyForward.x);
    flyStep.set(0, 0, 0);
    for (const code of held) {
      const move = FLY_KEYS[code];
      if (!move) continue;
      flyStep.addScaledVector(flyRight, move[0] * speed).addScaledVector(flyForward, move[2] * speed);
      flyStep.y += move[1] * speed;
    }
    if (camera.position.y + flyStep.y < 1.6) flyStep.y = 1.6 - camera.position.y;
    camera.position.add(flyStep);
    controls.target.add(flyStep);
    cameraTween = null;
  }
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  function enterWalk() {
    if (!today) return;
    setCompare(false);
    cameraTween = null;
    walk.enter();
  }

  window.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'SELECT') return;
    if (walk.active) {
      walk.onKeyDown(event);
      return;
    }
    if (FLY_KEYS[event.code] || event.code.startsWith('Shift')) {
      held.add(event.code);
      if (event.code.startsWith('Arrow')) event.preventDefault();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      nextMode();
    } else if (event.code === 'KeyG') {
      if (!event.repeat) enterWalk();
    } else if (event.key === 'c') setCompare(!compare);
    else if (event.key === 'l') {
      showLabels = !showLabels;
      syncUi();
    } else if (VIEWS[Number(event.key) - 1]) goToView(VIEWS[Number(event.key) - 1]);
  });

  const divider = $('divider');
  let dragging = false;
  divider.addEventListener('pointerdown', (event) => {
    dragging = true;
    divider.setPointerCapture(event.pointerId);
  });
  divider.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    split = Math.max(0.02, Math.min(0.98, event.clientX / window.innerWidth));
  });
  divider.addEventListener('pointerup', () => {
    dragging = false;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyQuality(quality);
  });

  const projected = new THREE.Vector3();
  function updateLabels(width, height) {
    for (const label of labelNodes) {
      projected.copy(label.point).project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      let era = stage >= 1.5 ? 'ancient' : stage >= 0.5 ? 'rebuild' : 'today';
      if (compare) era = x < split * width ? 'ancient' : 'today';
      const matches = label.era === 'both'
        || (era === label.era)
        || (era === 'rebuild' && (label.core || (label.era === 'today' && !label.ruin)));
      const visible = showLabels && projected.z < 1 && projected.z > -1 && x > 0 && x < width && y > 60 && y < height - 110 && matches;
      label.node.style.display = visible ? 'block' : 'none';
      if (visible) label.node.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${(y - 14).toFixed(1)}px)`;
    }
  }

  const clock = new THREE.Clock();
  const SLOW_FRAME = 1 / 24;
  let warmup = 60;
  let sampled = 0;
  let slow = 0;
  function watchFrameRate(delta) {
    if (!autoQuality || document.hidden || delta > 1 || compare || stage !== stageTarget || hooks.fixedDelta !== null) return;
    if (warmup > 0) {
      warmup--;
      return;
    }
    sampled++;
    if (delta > SLOW_FRAME) slow++;
    if (sampled < 80) return;
    if (slow > 48) {
      lowerQuality();
      warmup = 45;
    }
    sampled = slow = 0;
  }

  function render(state) {
    applyState(state);
    if (composer && detailShading) {
      // Ambient occlusion fades out while the scene is in between eras, where outlines
      // and dissolving layers would give it false shadows.
      occlusion.enabled = state.occlusion > 0.001;
      occlusion.blendIntensity = state.occlusion;
      composer.render();
      return;
    }
    renderer.clear();
    renderer.render(backdrop, camera);
    renderer.clearDepth();
    renderer.render(scene, camera);
  }

  // Hooks for scripted camera moves and frame by frame video capture (see capture.js).
  const hooks = { beforeFrame: null, afterFrame: null, fixedDelta: null };

  function frame() {
    const rawDelta = clock.getDelta();
    const dt = hooks.fixedDelta ?? Math.min(rawDelta, 0.05);
    watchFrameRate(rawDelta);
    if (hooks.beforeFrame) hooks.beforeFrame();
    if (stage !== stageTarget) {
      const step = dt / STAGE_SECONDS;
      stage = Math.abs(stageTarget - stage) <= step ? stageTarget : stage + Math.sign(stageTarget - stage) * step;
    }
    $('track-1').style.width = `${Math.min(1, Math.max(0, stage)) * 100}%`;
    $('track-2').style.width = `${Math.min(1, Math.max(0, stage - 1)) * 100}%`;
    $('btn-rebuild').classList.toggle('reached', stage >= 1);
    $('btn-ancient').classList.toggle('reached', stage >= 2);
    $('btn-today').classList.toggle('reached', true);
    if (walk.active) {
      cameraTween = null;
      walk.update(dt);
    } else {
      if (cameraTween) {
        cameraTween.t = Math.min(1, cameraTween.t + dt / 1.6);
        const k = cameraTween.t * cameraTween.t * (3 - 2 * cameraTween.t);
        camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, k);
        controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, k);
        if (cameraTween.t === 1) cameraTween = null;
      }
      fly(dt);
      controls.update();
    }
    sky.mesh.position.copy(camera.position);
    sky.uniforms.time.value += dt;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const edge = Math.round(width * split);
    renderer.setScissorTest(true);
    if (compare) {
      renderer.setScissor(0, 0, edge, height);
      render(timelineState(2));
      renderer.setScissor(edge, 0, width - edge, height);
      render(timelineState(0));
    } else {
      renderer.setScissor(0, 0, width, height);
      render(timelineState(stage));
    }

    divider.style.display = compare ? 'block' : 'none';
    divider.style.left = `${edge}px`;
    for (const [id, x] of [['tag-ancient', edge - 86], ['tag-today', edge + 22]]) {
      $(id).style.display = compare ? 'block' : 'none';
      $(id).style.left = `${x}px`;
    }
    updateLabels(width, height);
    if (hooks.afterFrame) hooks.afterFrame();
    requestAnimationFrame(frame);
  }

  function start() {
    // Four material sets over the same textures, one per layer, so that each layer
    // can be dissolved or clipped without touching the others.
    const sets = { remains: createMaterials(), modern: createMaterials(), context: createMaterials(), core: createMaterials() };
    layers = Object.fromEntries(Object.entries(sets).map(([name, set]) => [name, materialsOf(set)]));
    for (const material of layers.core) {
      material.clippingPlanes = [corePlane];
      material.clipShadows = true;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
    }
    const built = definition.build(sets);
    ancient = built.ancient;
    today = built.today;
    ghost = buildGhost(ancient.core, new Set(built.ghostSkip), built.columnSets ?? [], ghostPlane);
    scene.add(ancient.group, today.group, ghost);
    applyQuality(quality);
    syncUi();
    $('loading').classList.add('done');
    window.app = {
      sky, scene, camera, controls, renderer, sun, composer, applyQuality, setEra, setMode, setCompare, goToView, VIEWS, hooks, walk,
      // Renders at a fixed pixel width regardless of the window, for video capture.
      setRenderWidth: (pixels) => {
        renderer.setPixelRatio(pixels / window.innerWidth);
        renderer.setSize(window.innerWidth, window.innerHeight);
        ghost.userData.line.linewidth = Math.max(1.3, 1.3 * renderer.getPixelRatio());
        sizeComposer();
      },
      getQuality: () => ({ quality, resolutionScale, ratio: renderer.getPixelRatio() }),
      setStage: (value) => {
        stage = stageTarget = value;
        syncUi();
      },
    };
    frame();
  }

  setTimeout(start, 50);
}
