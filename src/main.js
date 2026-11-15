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

const VIEWS = [
  { name: 'Overview', position: [30, 82, 132], target: [-8, 4, -12] },
  { name: 'Temple', position: [-20, 4.5, 17], target: [-56, 13, -1] },
  { name: 'Colonnade', position: [58, 2.9, -28.6], target: [-40, 5.2, -28.2] },
  { name: 'From above', position: [-2, 270, 34], target: [-2, 0, -6] },
];

const LABELS = [
  { text: 'Temple of Venus Genetrix', at: [-62, 28, 0], era: 'ancient' },
  { text: 'Double colonnade', at: [10, 14.5, -29], era: 'ancient' },
  { text: 'Tabernae (shops and offices)', at: [-25, 21.5, -42], era: 'ancient' },
  { text: 'Statue of Caesar', at: [-8, 8.5, 0], era: 'ancient' },
  { text: 'Curia Julia', at: [94, 27, -28], era: 'both' },
  { text: 'Forum of Augustus', at: [-20, 30, 120], era: 'ancient' },
  { text: 'Capitoline Hill (Arx)', at: [-60, 52, -170], era: 'ancient' },
  { text: 'Temple podium, three columns re-erected', at: [-62, 20, -11], era: 'today' },
  { text: 'Standing portico columns', at: [0, 10.5, -26], era: 'today' },
  { text: 'Tabernae ruins', at: [-20, 15, -41], era: 'today' },
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
let split = 0;
let splitTarget = 0;
let compare = false;
let showLabels = true;
let cameraTween = null;

const $ = (id) => document.getElementById(id);
const labelNodes = LABELS.map((label) => {
  const node = document.createElement('div');
  node.className = 'label';
  node.textContent = label.text;
  $('labels').appendChild(node);
  return { ...label, node, point: new THREE.Vector3().fromArray(label.at) };
});

function setEra(target) {
  compare = false;
  splitTarget = target;
  syncUi();
}

function setCompare(on) {
  compare = on;
  if (on) splitTarget = 0.5;
  else splitTarget = split >= 0.5 ? 1 : 0;
  syncUi();
}

function syncUi() {
  $('btn-today').classList.toggle('active', !compare && splitTarget === 0);
  $('btn-ancient').classList.toggle('active', !compare && splitTarget === 1);
  $('btn-compare').classList.toggle('active', compare);
  $('btn-labels').classList.toggle('active', showLabels);
  $('era').textContent = compare
    ? 'Ancient on the left, today on the right'
    : splitTarget === 1 ? 'Rome, 2nd century AD, after Trajan\'s rebuild' : 'Rome, today';
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

$('btn-today').addEventListener('click', () => setEra(0));
$('btn-ancient').addEventListener('click', () => setEra(1));
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
    setEra(splitTarget >= 0.5 ? 0 : 1);
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
  split = splitTarget = Math.max(0.02, Math.min(0.98, event.clientX / window.innerWidth));
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
    const side = x < split * width ? 'ancient' : 'today';
    const visible = showLabels && projected.z < 1 && projected.z > -1 && x > 0 && x < width && y > 60 && y < height - 70
      && (label.era === 'both' || label.era === side);
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
  if (!autoQuality || document.hidden || delta > 1 || (split > 0 && split < 1)) return;
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

function frame() {
  const rawDelta = clock.getDelta();
  const dt = Math.min(rawDelta, 0.05);
  watchFrameRate(rawDelta);
  if (!dragging && split !== splitTarget) {
    const step = dt * 1.6;
    split = Math.abs(splitTarget - split) <= step ? splitTarget : split + Math.sign(splitTarget - split) * step;
  }
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
  const draw = (era) => {
    if (era !== shadowEra) {
      shadowEra = era;
      renderer.shadowMap.needsUpdate = true;
    }
    if (composer && detailShading) {
      composer.render();
      return;
    }
    renderer.clear();
    renderer.render(backdrop, camera);
    renderer.clearDepth();
    renderer.render(scene, camera);
  };
  renderer.setScissorTest(true);
  if (edge > 0) {
    ancient.visible = true;
    today.visible = false;
    renderer.setScissor(0, 0, edge, height);
    draw('ancient');
  }
  if (edge < width) {
    ancient.visible = false;
    today.visible = true;
    renderer.setScissor(edge, 0, width - edge, height);
    draw('today');
  }

  const showDivider = edge > 0 && edge < width;
  divider.style.display = showDivider ? 'block' : 'none';
  divider.style.left = `${edge}px`;
  for (const [id, x] of [['tag-ancient', edge - 86], ['tag-today', edge + 22]]) {
    $(id).style.display = showDivider && compare ? 'block' : 'none';
    $(id).style.left = `${x}px`;
  }
  updateLabels(width, height);
  requestAnimationFrame(frame);
}

function start() {
  const M = createMaterials();
  ancient = buildAncient(M);
  today = buildToday(M);
  scene.add(ancient, today);
  applyQuality(quality);
  syncUi();
  $('loading').classList.add('done');
  window.app = { sky, scene, camera, controls, renderer, sun, composer, applyQuality, getQuality: () => ({ quality, resolutionScale, ratio: renderer.getPixelRatio() }), setEra, setCompare, goToView, VIEWS, setSplit: (v) => { split = splitTarget = v; } };
  frame();
}

setTimeout(start, 50);
