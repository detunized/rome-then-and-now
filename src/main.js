import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createMaterials, noiseTexture } from './textures.js';
import { createSky } from './sky.js';
import { buildAncient } from './ancient.js';
import { buildToday } from './today.js';
import { buildGhost } from './ghost.js';

const VIEWS = [
  { name: 'Overview', position: [30, 82, 132], target: [-8, 4, -12] },
  { name: 'Temple', position: [-20, 4.5, 17], target: [-56, 13, -1] },
  { name: 'Colonnade', position: [58, 2.9, -28.6], target: [-40, 5.2, -28.2] },
  { name: 'From above', position: [-2, 270, 34], target: [-2, 0, -6] },
];

const LABELS = [
  { text: 'Temple of Venus Genetrix', at: [-62, 28, 0], era: 'ancient', core: true },
  { text: 'Double colonnade', at: [10, 14.5, -29], era: 'ancient', core: true },
  { text: 'Tabernae (shops and offices)', at: [-25, 21.5, -42], era: 'ancient', core: true },
  { text: 'Statue of Caesar', at: [-8, 8.5, 0], era: 'ancient', core: true },
  { text: 'Curia Julia', at: [94, 27, -28], era: 'both' },
  { text: 'Forum of Augustus', at: [-20, 30, 120], era: 'ancient' },
  { text: 'Capitoline Hill (Arx)', at: [-60, 52, -170], era: 'ancient' },
  { text: 'Temple podium, three columns re-erected', at: [-62, 20, -11], era: 'today', ruin: true },
  { text: 'Standing portico columns', at: [0, 10.5, -26], era: 'today', ruin: true },
  { text: 'Tabernae ruins', at: [-20, 15, -41], era: 'today', ruin: true },
  { text: 'Via dei Fori Imperiali', at: [-10, 12, 48], era: 'today' },
  { text: 'Santi Luca e Martina', at: [88, 44, -1], era: 'today' },
  { text: 'Vittoriano', at: [-185, 84, -100], era: 'today' },
];

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Nothing moves, so the shadow map is only redrawn when the visible era changes.
renderer.shadowMap.autoUpdate = false;
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.54;
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

const sunDirection = new THREE.Vector3(0.6, 0.62, 0.5).normalize();

const sky = createSky(noiseTexture(), sunDirection, scene.fog.color);
const pmrem = new THREE.PMREMGenerator(renderer);
const skyScene = new THREE.Scene();
skyScene.add(sky.mesh);
sky.uniforms.sunDisc.value = 0;
scene.environment = pmrem.fromScene(skyScene, 0, 1, 20000).texture;
scene.environmentIntensity = 0.8;
sky.uniforms.sunDisc.value = 1;
backdrop.add(sky.mesh);

const sun = new THREE.DirectionalLight(0xffeed8, 3.0);
sun.position.copy(sunDirection).multiplyScalar(420).add(new THREE.Vector3(0, 0, -5));
sun.target.position.set(0, 0, -5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -175;
sun.shadow.camera.right = 175;
sun.shadow.camera.top = 150;
sun.shadow.camera.bottom = -150;
sun.shadow.camera.near = 50;
sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xeaeef4, 0xa39178, 0.55));

let composer = null;
let occlusion = null;
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
  occlusion.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
  occlusion.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.2, rings: 2, samples: 8 });
  composer.addPass(occlusion);
  composer.addPass(new OutputPass());
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
  low: { ratio: 1, budget: 1.2e6, shadow: 2048, soft: false, occlusion: false },
  medium: { ratio: 1.5, budget: 3.5e6, shadow: 2048, soft: false, occlusion: false },
  high: { ratio: 2, budget: 14e6, shadow: 4096, soft: true, occlusion: false },
  max: { ratio: 2, budget: 14e6, shadow: 4096, soft: true, occlusion: true },
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
  detailShading = q.occlusion && composer !== null;
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
const REBUILD_TOP = 29;
const STAGE_SECONDS = 4;
const ghostPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
const corePlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
let stage = 0;
let stageTarget = 0;
let fadeModern = true;

const $ = (id) => document.getElementById(id);
const labelNodes = LABELS.map((label) => {
  const node = document.createElement('div');
  node.className = 'label';
  node.textContent = label.text;
  $('labels').appendChild(node);
  return { ...label, node, point: new THREE.Vector3().fromArray(label.at) };
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
    today: s < 2,
    modern: faded * (1 - smooth(solid * 1.6)),
    remains: 1 - smooth((solid - 0.45) / 0.55),
    ghost: s > 0.001 && s < 2 ? -0.5 + outline * REBUILD_TOP : null,
    core: s > 1 ? (s >= 2 ? 1e6 : -0.5 + solid * REBUILD_TOP) : null,
    context: smooth(solid * 1.3),
    occlusion: Math.min(1, Math.max(0, 1 - s / 0.2, (s - 1.8) / 0.2)),
    key: `${s.toFixed(3)} ${fadeModern}`,
  };
}

function applyState(state) {
  today.group.visible = state.today;
  if (state.today) {
    today.modern.visible = state.modern > 0.01;
    today.remains.visible = state.remains > 0.01;
    today.earth.visible = today.remains.visible && state.modern < 0.999;
    setOpacity(layers.modern, state.modern);
    setOpacity(layers.remains, state.remains);
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

function currentMode() {
  return compare ? 'compare' : MODES[Math.round(stageTarget)];
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
  if (on) split = 0.5;
  syncUi();
}

function syncUi() {
  const mode = currentMode();
  $('btn-today').classList.toggle('active', mode === 'today');
  $('btn-rebuild').classList.toggle('active', mode === 'rebuild');
  $('btn-ancient').classList.toggle('active', mode === 'ancient');
  $('btn-compare').classList.toggle('active', compare);
  $('btn-labels').classList.toggle('active', showLabels);
  $('btn-fade').classList.toggle('active', fadeModern);
  $('timeline').style.visibility = compare ? 'hidden' : 'visible';
  $('era').textContent = {
    compare: 'Ancient on the left, today on the right',
    ancient: 'Rome, 2nd century AD, after Trajan\'s rebuild',
    rebuild: 'Today\'s ruins with the ancient forum drawn on top',
    today: 'Rome, today',
  }[mode];
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
$('replay').addEventListener('click', () => {
  compare = false;
  if (stageTarget < 0.5) stageTarget = 2;
  stage = 0;
  syncUi();
});
$('amount').addEventListener('input', (event) => {
  stage = stageTarget = Number(event.target.value) / 100;
  syncUi();
});
$('btn-compare').addEventListener('click', () => setCompare(!compare));
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

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    setMode({ today: 'rebuild', rebuild: 'ancient', ancient: 'today', compare: 'today' }[currentMode()]);
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
  $('amount').value = Math.round(stage * 100);
  if (cameraTween) {
    cameraTween.t = Math.min(1, cameraTween.t + dt / 1.6);
    const k = cameraTween.t * cameraTween.t * (3 - 2 * cameraTween.t);
    camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, k);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, k);
    if (cameraTween.t === 1) cameraTween = null;
  }
  controls.update();
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
  const remainsMaterials = createMaterials();
  const modernMaterials = createMaterials();
  const contextMaterials = createMaterials();
  const coreMaterials = createMaterials();
  for (const material of materialsOf(coreMaterials)) {
    material.clippingPlanes = [corePlane];
    material.clipShadows = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
  }
  ancient = buildAncient(contextMaterials, coreMaterials);
  today = buildToday(remainsMaterials, modernMaterials);
  const hidden = ['interior', 'dark', 'dirt', 'water', 'timber'].map((name) => coreMaterials[name]);
  ghost = buildGhost(ancient.core, new Set(hidden), ancient.columnSets, ghostPlane);
  layers = { remains: materialsOf(remainsMaterials), modern: materialsOf(modernMaterials), context: materialsOf(contextMaterials) };
  scene.add(ancient.group, today.group, ghost);
  applyQuality(quality);
  syncUi();
  $('loading').classList.add('done');
  window.app = {
    sky, scene, camera, controls, renderer, sun, composer, applyQuality, setEra, setMode, setCompare, goToView, VIEWS, hooks,
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
