import * as THREE from 'three';

// The walking character: a blocky Roman legionary made of boxes, 30 pixels tall to the
// top of the helmet, with every face painted pixel by pixel on a small canvas.
// It stands on its local origin and faces +Z.

const PIXEL = 0.06;

const SKIN = '#c48c57';
const SKIN_SHADE = '#a67142';
const HAIR = '#3a2515';
const EYE = '#24170f';
const EYE_WHITE = '#d8d2c4';
const STEEL = '#7b818c';
const STEEL_LIGHT = '#9ca2ad';
const STEEL_DARK = '#59606b';
const RED = '#a8231c';
const RED_DARK = '#771611';
const RED_LIGHT = '#c73327';
const LEATHER = '#6d4524';
const LEATHER_DARK = '#48301a';
const GOLD = '#cf9f2e';
const GOLD_DARK = '#93691a';
const WOOD = '#8a623a';

// Cheap repeatable noise, so that flat areas get the slight grain of hand placed pixels.
function grain(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

let textureCount = 0;

function pixelTexture(width, height, paint, mirrored = false) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  const pen = {
    width,
    height,
    rect(x, y, w, h, color) {
      context.fillStyle = color;
      context.fillRect(mirrored ? width - x - w : x, y, w, h);
    },
    dot(x, y, color) {
      this.rect(x, y, 1, 1, color);
    },
    rows(colors) {
      colors.forEach((color, y) => this.rect(0, y, width, 1, color));
    },
  };
  paint(pen);
  const seed = textureCount++;
  const image = context.getImageData(0, 0, width, height);
  for (let i = 0; i < width * height; i++) {
    const shade = 0.93 + 0.14 * grain(i % width, Math.floor(i / width), seed);
    for (let c = 0; c < 3; c++) image.data[i * 4 + c] = Math.min(255, image.data[i * 4 + c] * shade);
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const plain = (color) => (pen) => pen.rect(0, 0, pen.width, pen.height, color);

// Materials for a box of `size` pixels, in the face order of BoxGeometry. `left` is the
// character's own left (+X). A side is painted with its front edge at x = 0, and `side`
// stands in for both sides when they look the same.
function boxMaterials([w, h, d], faces) {
  const face = (width, height, paint, mirrored) => new THREE.MeshStandardMaterial({
    map: pixelTexture(width, height, paint ?? plain(STEEL), mirrored), roughness: 0.85, metalness: 0,
  });
  return [
    face(d, h, faces.left ?? faces.side),
    face(d, h, faces.right ?? faces.side, true),
    face(w, d, faces.top),
    face(w, d, faces.bottom),
    face(w, h, faces.front),
    face(w, h, faces.back),
  ];
}

function box(size, materials, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0] * PIXEL, size[1] * PIXEL, size[2] * PIXEL), materials);
  mesh.position.set(x * PIXEL, y * PIXEL, z * PIXEL);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function pivot(x, y, z, ...children) {
  const group = new THREE.Group();
  group.position.set(x * PIXEL, y * PIXEL, z * PIXEL);
  group.add(...children);
  return group;
}

function headMaterials() {
  const bowl = (pen) => {
    pen.rows([STEEL_LIGHT, STEEL, GOLD]);
  };
  return boxMaterials([8, 8, 8], {
    front: (pen) => {
      pen.rect(0, 0, 8, 8, SKIN);
      bowl(pen);
      pen.rect(0, 3, 1, 4, STEEL);
      pen.rect(7, 3, 1, 4, STEEL);
      pen.dot(1, 4, EYE_WHITE);
      pen.dot(6, 4, EYE_WHITE);
      pen.dot(2, 4, EYE);
      pen.dot(5, 4, EYE);
      pen.rect(3, 5, 2, 1, SKIN_SHADE);
      pen.rect(3, 6, 2, 1, '#8c4a3a');
      pen.dot(0, 7, LEATHER);
      pen.dot(7, 7, LEATHER);
    },
    side: (pen) => {
      pen.rect(0, 0, 8, 8, STEEL);
      bowl(pen);
      pen.rect(0, 3, 1, 5, SKIN);
      pen.rect(1, 3, 2, 4, STEEL_LIGHT);
      pen.dot(2, 4, GOLD_DARK);
      pen.rect(3, 3, 5, 3, STEEL_DARK);
      pen.rect(1, 7, 4, 1, SKIN_SHADE);
      pen.rect(3, 6, 2, 1, HAIR);
      pen.rect(5, 6, 3, 2, STEEL_LIGHT);
    },
    back: (pen) => {
      pen.rect(0, 0, 8, 8, STEEL_DARK);
      bowl(pen);
      pen.dot(1, 4, STEEL_LIGHT);
      pen.dot(6, 4, STEEL_LIGHT);
      pen.rect(0, 6, 8, 2, STEEL_LIGHT);
    },
    top: (pen) => {
      pen.rect(0, 0, 8, 8, STEEL_LIGHT);
      pen.rect(3, 0, 2, 8, GOLD_DARK);
    },
    bottom: plain(SKIN_SHADE),
  });
}

function crestMaterials() {
  const bristles = (pen) => {
    for (let x = 0; x < pen.width; x++) pen.rect(x, 0, 1, pen.height, x % 2 ? RED : RED_DARK);
    pen.rect(0, 0, pen.width, 1, RED_LIGHT);
    pen.rect(0, pen.height - 1, pen.width, 1, GOLD_DARK);
  };
  return boxMaterials([2, 3, 10], {
    side: bristles,
    front: bristles,
    back: bristles,
    top: (pen) => {
      for (let y = 0; y < pen.height; y++) pen.rect(0, y, pen.width, 1, y % 2 ? RED_LIGHT : RED);
    },
    bottom: plain(GOLD_DARK),
  });
}

function torsoMaterials() {
  const armour = (pen) => {
    pen.rows([STEEL, STEEL_LIGHT, STEEL, STEEL_LIGHT, STEEL_DARK, STEEL_LIGHT, STEEL, LEATHER, RED, RED_DARK]);
  };
  return boxMaterials([8, 10, 4], {
    front: (pen) => {
      armour(pen);
      pen.rect(2, 0, 4, 1, RED_LIGHT);
      for (const y of [1, 3, 5]) pen.rect(3, y, 2, 1, GOLD);
      for (const x of [1, 6]) pen.dot(x, 7, GOLD_DARK);
      pen.rect(3, 7, 2, 1, GOLD);
      for (const x of [2, 3, 4, 5]) {
        pen.dot(x, 8, x % 2 ? LEATHER : LEATHER_DARK);
        pen.dot(x, 9, GOLD);
      }
    },
    back: (pen) => {
      armour(pen);
      pen.rect(2, 0, 4, 1, RED_LIGHT);
      pen.rect(3, 1, 2, 6, STEEL_DARK);
    },
    side: armour,
    top: (pen) => {
      pen.rect(0, 0, 8, 4, STEEL);
      pen.rect(2, 1, 4, 2, RED_LIGHT);
    },
    bottom: plain(RED_DARK),
  });
}

function armMaterials() {
  const sleeve = (pen) => {
    pen.rows([STEEL_LIGHT, STEEL, STEEL_LIGHT, RED, SKIN, SKIN, LEATHER, LEATHER_DARK, SKIN, SKIN_SHADE]);
    pen.dot(1, 6, GOLD);
  };
  return boxMaterials([3, 10, 4], { front: sleeve, back: sleeve, side: sleeve, top: plain(STEEL_LIGHT), bottom: plain(SKIN_SHADE) });
}

function legMaterials() {
  const sandal = (pen) => {
    pen.rows([RED, RED_DARK, SKIN, SKIN_SHADE, SKIN, SKIN, LEATHER, SKIN, LEATHER, LEATHER_DARK]);
    pen.dot(0, 7, LEATHER);
    pen.dot(2, 7, LEATHER);
    pen.dot(1, 5, LEATHER);
    pen.dot(3, 5, LEATHER);
  };
  return boxMaterials([4, 10, 4], {
    front: (pen) => {
      sandal(pen);
      pen.rect(1, 9, 2, 1, SKIN);
      pen.dot(1, 0, LEATHER);
      pen.dot(2, 0, LEATHER_DARK);
      pen.dot(1, 1, GOLD);
      pen.dot(2, 1, GOLD);
    },
    back: sandal,
    side: sandal,
    top: plain(RED_DARK),
    bottom: plain(LEATHER_DARK),
  });
}

function shieldMaterials() {
  const rim = (pen) => {
    pen.rect(0, 0, pen.width, pen.height, GOLD_DARK);
  };
  return boxMaterials([10, 13, 1], {
    back: (pen) => {
      pen.rect(0, 0, 10, 13, GOLD);
      pen.rect(1, 1, 8, 11, RED);
      pen.rect(1, 6, 8, 1, GOLD);
      for (const [x, y] of [[2, 3], [3, 4], [7, 3], [6, 4], [3, 8], [2, 9], [6, 8], [7, 9]]) pen.dot(x, y, GOLD);
      pen.rect(3, 5, 4, 3, GOLD_DARK);
      pen.rect(4, 5, 2, 3, STEEL_LIGHT);
      pen.rect(4, 6, 2, 1, STEEL);
    },
    front: (pen) => {
      pen.rect(0, 0, 10, 13, WOOD);
      pen.rect(0, 4, 10, 1, LEATHER_DARK);
      pen.rect(0, 8, 10, 1, LEATHER_DARK);
    },
    side: rim,
    top: rim,
    bottom: rim,
  });
}

function sword() {
  const solid = (size, color) => boxMaterials(size, { front: plain(color), back: plain(color), side: plain(color), top: plain(color), bottom: plain(color) });
  const blade = box([1, 8, 1], solid([1, 8, 1], STEEL_LIGHT), 0, 6, 0);
  const guard = box([3, 1, 1.4], solid([3, 1, 1], GOLD), 0, 1.5, 0);
  const grip = box([1, 3, 1], solid([1, 3, 1], LEATHER_DARK), 0, 0, 0);
  const group = pivot(0, -8, 0.5, blade, guard, grip);
  group.rotation.x = 1.25;
  return group;
}

export function createLegionary() {
  const head = pivot(0, 20, 0,
    box([8, 8, 8], headMaterials(), 0, 4, 0),
    box([2, 3, 10], crestMaterials(), 0, 9.5, 0),
    box([8.6, 1, 1], boxMaterials([8, 1, 1], { front: plain(GOLD), back: plain(GOLD), side: plain(GOLD), top: plain(GOLD), bottom: plain(GOLD_DARK) }), 0, 5.5, 4.3),
    box([8.6, 1, 1.6], boxMaterials([8, 1, 2], { front: plain(STEEL_LIGHT), back: plain(STEEL_LIGHT), side: plain(STEEL_LIGHT), top: plain(STEEL_LIGHT), bottom: plain(STEEL_DARK) }), 0, 0.9, -4.5));
  const torso = box([8, 10, 4], torsoMaterials(), 0, 15, 0);
  const shield = box([10, 13, 1], shieldMaterials(), 0, 13.5, -2.9);
  const arms = armMaterials();
  const legs = legMaterials();
  const leftArm = pivot(5.5, 18.5, 0, box([3, 10, 4], arms, 0, -3.5, 0));
  const rightArm = pivot(-5.5, 18.5, 0, box([3, 10, 4], arms, 0, -3.5, 0), sword());
  const leftLeg = pivot(2, 10, 0, box([4, 10, 4], legs, 0, -5, 0));
  const rightLeg = pivot(-2, 10, 0, box([4, 10, 4], legs, 0, -5, 0));

  const group = new THREE.Group();
  group.add(head, torso, shield, leftArm, rightArm, leftLeg, rightLeg);

  let phase = 0;
  let swing = 0;
  let air = 0;
  let clock = 0;

  // `speed` is the real speed over the ground in metres per second, so the legs stop
  // when a wall does. Returns true while the pose is still changing.
  function animate(dt, { speed, grounded, pitch }) {
    const ease = 1 - Math.exp(-dt * 12);
    const stride = grounded ? Math.min(1, speed / 4) * (0.6 + Math.min(0.35, speed * 0.04)) : 0;
    swing += (stride - swing) * ease;
    air += ((grounded ? 0 : 1) - air) * ease;
    if (speed > 0.05) phase += dt * (4 + speed * 1.7);
    clock += dt;
    const step = Math.sin(phase) * swing;
    const sway = Math.sin(clock * 1.6) * 0.02;
    leftLeg.rotation.x = step + air * 0.45;
    rightLeg.rotation.x = -step - air * 0.3;
    leftArm.rotation.x = -step * 0.9 - air * 0.9;
    rightArm.rotation.x = step * 0.9 - air * 0.5;
    leftArm.rotation.z = 0.05 + sway + air * 0.25;
    rightArm.rotation.z = -0.05 - sway - air * 0.25;
    head.rotation.x = -Math.max(-0.5, Math.min(0.5, pitch * 0.6));
    return swing > 0.004 || air > 0.004;
  }

  return { group, animate };
}
