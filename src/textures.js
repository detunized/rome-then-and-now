import * as THREE from 'three';

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rng = makeRng(seed);
  const N = 256;
  const grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  return (x, y, period) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const a = grid[(y0 % N) * N + (x0 % N)];
    const b = grid[(y0 % N) * N + (x1 % N)];
    const c = grid[(y1 % N) * N + (x0 % N)];
    const d = grid[(y1 % N) * N + (x1 % N)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbm(noise, u, v, freq, octaves) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(u * f, v * f, f);
    total += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / total;
}

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 974711) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function bake(size, shade, normalStrength) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const out = [0, 0, 0, 0];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      shade(px / size, py / size, out);
      const i = py * size + px;
      image.data[i * 4] = Math.max(0, Math.min(255, out[0]));
      image.data[i * 4 + 1] = Math.max(0, Math.min(255, out[1]));
      image.data[i * 4 + 2] = Math.max(0, Math.min(255, out[2]));
      image.data[i * 4 + 3] = 255;
      height[i] = out[3];
    }
  }
  ctx.putImageData(image, 0, 0);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = size;
  const nctx = normalCanvas.getContext('2d');
  const nimage = nctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const xl = height[py * size + ((px + size - 1) % size)];
      const xr = height[py * size + ((px + 1) % size)];
      const yu = height[((py + size - 1) % size) * size + px];
      const yd = height[((py + 1) % size) * size + px];
      const nx = -(xr - xl) * normalStrength;
      const ny = (yd - yu) * normalStrength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (py * size + px) * 4;
      nimage.data[i] = (nx * inv * 0.5 + 0.5) * 255;
      nimage.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      nimage.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      nimage.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimage, 0, 0);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, normalMap };
}

function stone({ seed, base, variation = 0.1, freq = 6, stain = 0, veins = 0, speckle = 0, bump = 0.4 }) {
  const noise = makeNoise(seed);
  const noise2 = makeNoise(seed + 17);
  return (u, v, out) => {
    const n = fbm(noise, u, v, freq, 5);
    const fine = noise2(u * 96, v * 96, 96);
    let k = 1 - variation + variation * 2 * n;
    if (stain) k *= 1 - stain * Math.max(0, fbm(noise2, u, v, 3, 3) - 0.45) * 2;
    if (veins) {
      const w = Math.abs(Math.sin((u * 3 + v * 1.3 + n * 2.2) * Math.PI * 2));
      k -= veins * Math.pow(1 - w, 10);
    }
    if (speckle) k += speckle * (fine - 0.5);
    out[0] = base[0] * k;
    out[1] = base[1] * k;
    out[2] = base[2] * k;
    out[3] = n * bump + fine * 0.08 * bump;
  };
}

function blocks({ seed, cols, rows, joint = 0.04, base, jointColor, variation = 0.12, grain = 0.1, stagger = 0.5, bump = 1, freq = 8 }) {
  const noise = makeNoise(seed);
  return (u, v, out) => {
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const shifted = u * cols + (row % 2) * stagger;
    const col = Math.floor(shifted) % cols;
    const fx = shifted - Math.floor(shifted);
    const jx = joint * (cols / rows);
    const edge = Math.min(fx / jx, (1 - fx) / jx, fy / joint, (1 - fy) / joint);
    const n = fbm(noise, u, v, freq, 4);
    const fine = noise(u * 128, v * 128, 128);
    const tone = 1 - variation + 2 * variation * hash2(col, row, seed);
    const k = tone * (1 - grain + 2 * grain * n) + (fine - 0.5) * grain * 0.6;
    if (edge < 1) {
      const t = Math.max(0, edge);
      out[0] = jointColor[0] + (base[0] * k - jointColor[0]) * t;
      out[1] = jointColor[1] + (base[1] * k - jointColor[1]) * t;
      out[2] = jointColor[2] + (base[2] * k - jointColor[2]) * t;
      out[3] = (0.25 + 0.75 * t) * bump + n * 0.15 * bump;
    } else {
      out[0] = base[0] * k;
      out[1] = base[1] * k;
      out[2] = base[2] * k;
      out[3] = bump + n * 0.15 * bump + hash2(col, row, seed + 5) * 0.2 * bump;
    }
  };
}

function roofTiles(seed) {
  const noise = makeNoise(seed);
  const cols = 4;
  const rows = 3;
  return (u, v, out) => {
    const fx = u * cols - Math.floor(u * cols);
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const col = Math.floor(u * cols);
    const ridge = Math.abs(fx - 0.5) < 0.17 ? Math.cos(((fx - 0.5) / 0.17) * Math.PI * 0.5) : 0;
    const tone = 0.82 + 0.3 * hash2(col, row, seed) + 0.12 * (fbm(noise, u, v, 8, 4) - 0.5);
    const shadow = fy < 0.06 ? 0.6 : 1;
    const k = tone * shadow * (0.85 + 0.15 * ridge);
    out[0] = 178 * k;
    out[1] = 98 * k;
    out[2] = 62 * k;
    out[3] = ridge * 0.9 + (1 - fy) * 0.35;
  };
}

function grass(seed) {
  const noise = makeNoise(seed);
  const noise2 = makeNoise(seed + 3);
  return (u, v, out) => {
    const patch = fbm(noise, u, v, 4, 5);
    const fine = noise2(u * 180, v * 180, 180);
    const dry = Math.max(0, Math.min(1, (patch - 0.52) * 5));
    const k = 0.75 + 0.5 * fine;
    out[0] = (96 + 58 * dry) * k;
    out[1] = (116 + 22 * dry) * k;
    out[2] = (58 + 26 * dry) * k;
    out[3] = fine * 0.6 + patch * 0.3;
  };
}

function planks(seed) {
  const noise = makeNoise(seed);
  const count = 12;
  return (u, v, out) => {
    const board = Math.floor(v * count);
    const fy = v * count - board;
    const streak = noise(u * 6 + board * 3.1, v * 96, 96);
    const k = (0.8 + 0.35 * hash2(board, 0, seed)) * (0.85 + 0.25 * streak) * (fy < 0.07 ? 0.45 : 1);
    out[0] = 124 * k;
    out[1] = 82 * k;
    out[2] = 58 * k;
    out[3] = fy < 0.07 ? 0 : 0.8 + streak * 0.2;
  };
}

function facade(seed, modern) {
  const noise = makeNoise(seed);
  const cells = 4;
  return (u, v, out) => {
    const col = Math.floor(u * cells);
    const row = Math.floor(v * cells);
    const fx = u * cells - col;
    const fy = v * cells - row;
    const n = fbm(noise, u, v, 6, 4);
    const streak = fbm(noise, u * 3, v * 0.4, 8, 3);
    const k = 0.9 + 0.12 * n - 0.1 * Math.max(0, streak - 0.5) * 2;
    let r = 236 * k;
    let g = 226 * k;
    let b = 206 * k;
    let h = 0.6 + n * 0.1;
    const state = hash2(col, row, seed);
    const half = modern ? 0.17 : 0.12;
    const top = modern ? 0.2 : 0.3;
    const bottom = modern ? 0.7 : 0.62;
    const dx = Math.abs(fx - 0.5);
    const inside = dx < half && fy > top && fy < bottom;
    const frame = modern ? 0.035 : 0.02;
    const onFrame = dx < half + frame && fy > top - frame && fy < bottom + frame * 1.8;
    if (inside) {
      const closed = state < (modern ? 0.35 : 0.3);
      if (closed) {
        const slat = modern ? 0.75 + 0.25 * Math.sin(fy * 260) : 0.9;
        r = (modern ? 74 : 104) * slat;
        g = (modern ? 96 : 76) * slat;
        b = (modern ? 78 : 52) * slat;
        h = 0.5;
      } else {
        const glint = modern ? 22 * Math.max(0, 1 - Math.abs(fy - top - 0.1) * 9) : 0;
        r = 26 + glint;
        g = 28 + glint;
        b = 32 + glint * 1.2;
        h = 0.2;
      }
      if (modern && dx < 0.006) {
        r = g = b = 190;
      }
    } else if (onFrame) {
      r = 214 * k;
      g = 206 * k;
      b = 190 * k;
      h = 0.75;
    } else if (modern && !inside && state >= 0.35 && dx >= half + frame && dx < half * 2 + frame && fy > top && fy < bottom) {
      const slat = 0.75 + 0.25 * Math.sin(fy * 260);
      r = 82 * slat;
      g = 104 * slat;
      b = 84 * slat;
      h = 0.68;
    }
    if (fy > 0.965) {
      r *= 0.86;
      g *= 0.86;
      b *= 0.86;
      h += 0.1;
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
    out[3] = h;
  };
}

export function noiseTexture() {
  const size = 256;
  const noise = makeNoise(91);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const value = (fbm(noise, px / size, py / size, 8, 3) - 0.5) * 1.9 + 0.5;
      const i = (py * size + px) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.max(0, Math.min(255, value * 255));
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function rubble(seed) {
  const noise = makeNoise(seed);
  return (u, v, out) => {
    const cells = 14;
    const cx = Math.floor(u * cells);
    const cy = Math.floor(v * cells);
    let nearest = 9;
    let tone = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const gx = cx + i;
        const gy = cy + j;
        const wx = ((gx % cells) + cells) % cells;
        const wy = ((gy % cells) + cells) % cells;
        const px = gx + hash2(wx, wy, seed);
        const py = gy + hash2(wx, wy, seed + 9);
        const d = Math.hypot(u * cells - px, v * cells - py);
        if (d < nearest) {
          nearest = d;
          tone = hash2(wx, wy, seed + 21);
        }
      }
    }
    const n = fbm(noise, u, v, 10, 4);
    const stoneMask = nearest < 0.38 ? 1 : 0;
    const k = stoneMask ? 0.7 + 0.5 * tone : 0.9 + 0.25 * n;
    out[0] = (stoneMask ? 134 : 150) * k;
    out[1] = (stoneMask ? 114 : 134) * k;
    out[2] = (stoneMask ? 92 : 112) * k;
    out[3] = stoneMask ? 0.9 - nearest : 0.3 * n;
  };
}

const definitions = {
  marble: { tile: 4, size: 512, strength: 1.2, shade: stone({ seed: 1, base: [226, 220, 208], variation: 0.06, veins: 0.08 }) },
  marbleOld: { tile: 4, size: 512, strength: 3, shade: stone({ seed: 2, base: [204, 194, 176], variation: 0.14, stain: 0.6, speckle: 0.08, bump: 0.8 }) },
  facadeAncient: { tile: 12, size: 512, strength: 2, shade: facade(31, false) },
  facadeModern: { tile: 12, size: 512, strength: 2, shade: facade(32, true) },
  marbleAshlar: {
    tile: 3.6, size: 512, strength: 2.5,
    shade: blocks({ seed: 3, cols: 2, rows: 6, joint: 0.03, base: [224, 218, 206], jointColor: [156, 148, 136], variation: 0.04, grain: 0.04, bump: 0.6 }),
  },
  travertinePave: {
    tile: 4.8, size: 512, strength: 2.5,
    shade: blocks({ seed: 4, cols: 3, rows: 5, joint: 0.035, base: [216, 206, 186], jointColor: [120, 110, 96], variation: 0.07, grain: 0.07, bump: 0.6 }),
  },
  travertine: { tile: 3, size: 512, strength: 2.5, shade: stone({ seed: 5, base: [214, 202, 180], variation: 0.1, stain: 0.25, speckle: 0.1, bump: 0.8 }) },
  tufa: {
    tile: 2.4, size: 512, strength: 4,
    shade: blocks({ seed: 6, cols: 2, rows: 4, joint: 0.028, base: [164, 146, 120], jointColor: [112, 98, 82], variation: 0.09, grain: 0.14, bump: 1 }),
  },
  tufaOld: {
    tile: 2.4, size: 512, strength: 5,
    shade: blocks({ seed: 7, cols: 2, rows: 4, joint: 0.04, base: [140, 122, 100], jointColor: [84, 72, 60], variation: 0.15, grain: 0.22, bump: 1 }),
  },
  brick: {
    tile: 1.2, size: 512, strength: 3,
    shade: blocks({ seed: 8, cols: 4, rows: 18, joint: 0.16, base: [166, 106, 78], jointColor: [190, 176, 156], variation: 0.16, grain: 0.1, bump: 1 }),
  },
  brickOld: {
    tile: 1.2, size: 512, strength: 4,
    shade: blocks({ seed: 9, cols: 4, rows: 18, joint: 0.2, base: [150, 92, 64], jointColor: [150, 136, 116], variation: 0.24, grain: 0.18, bump: 1 }),
  },
  cobble: {
    tile: 2, size: 512, strength: 3,
    shade: blocks({ seed: 10, cols: 16, rows: 16, joint: 0.12, base: [128, 126, 124], jointColor: [74, 72, 70], variation: 0.16, grain: 0.1, bump: 1 }),
  },
  basalt: {
    tile: 3, size: 512, strength: 3,
    shade: blocks({ seed: 11, cols: 4, rows: 5, joint: 0.06, base: [78, 76, 78], jointColor: [36, 34, 34], variation: 0.2, grain: 0.12, bump: 1, stagger: 0.37 }),
  },
  roofTile: { tile: 1.8, size: 512, strength: 5, shade: roofTiles(12) },
  grass: { tile: 9, size: 512, strength: 2.5, shade: grass(13) },
  dirt: { tile: 7, size: 512, strength: 2.5, shade: stone({ seed: 14, base: [164, 148, 116], variation: 0.16, speckle: 0.2, bump: 1 }) },
  asphalt: { tile: 4, size: 256, strength: 1.5, shade: stone({ seed: 15, base: [66, 66, 70], variation: 0.06, speckle: 0.25, bump: 0.5 }) },
  wood: { tile: 1.8, size: 256, strength: 3, shade: planks(16) },
  rubble: { tile: 3, size: 512, strength: 5, shade: rubble(17) },
  plaster: { tile: 6, size: 512, strength: 1.2, shade: stone({ seed: 18, base: [232, 222, 204], variation: 0.06, stain: 0.3, bump: 0.5 }) },
  granite: { tile: 1.5, size: 256, strength: 0.8, shade: stone({ seed: 19, base: [150, 147, 143], variation: 0.1, speckle: 0.3, freq: 24, bump: 0.3 }) },
};

const cache = new Map();

function texture(name) {
  if (!cache.has(name)) {
    const d = definitions[name];
    cache.set(name, bake(d.size, d.shade, d.strength));
  }
  return cache.get(name);
}

export function material(name, options = {}) {
  const { color = 0xffffff, roughness = 0.85, metalness = 0, normalScale = 1, side = THREE.FrontSide } = options;
  const t = texture(name);
  const m = new THREE.MeshStandardMaterial({
    map: t.map,
    normalMap: t.normalMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    color,
    roughness,
    metalness,
    side,
  });
  m.userData.tile = definitions[name].tile;
  return m;
}

export function flat(color, options = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...options });
  m.userData.tile = 1;
  return m;
}

export function createMaterials() {
  return {
    marble: material('marble', { roughness: 0.5 }),
    marbleDouble: material('marble', { roughness: 0.5, side: THREE.DoubleSide }),
    marbleOld: material('marbleOld', { roughness: 0.9 }),
    marbleOldDouble: material('marbleOld', { roughness: 0.9, side: THREE.DoubleSide }),
    marbleAshlar: material('marbleAshlar', { roughness: 0.55 }),
    frieze: material('marble', { roughness: 0.6, color: 0xe9dfcf }),
    travertinePave: material('travertinePave', { roughness: 0.75 }),
    travertine: material('travertine', { roughness: 0.8 }),
    travertineOld: material('travertine', { roughness: 0.95, color: 0xb9ad98 }),
    tufa: material('tufa', { roughness: 0.95 }),
    tufaOld: material('tufaOld', { roughness: 1 }),
    brick: material('brick', { roughness: 0.9 }),
    brickOld: material('brickOld', { roughness: 1 }),
    cobble: material('cobble', { roughness: 0.85 }),
    basalt: material('basalt', { roughness: 0.8 }),
    roofTile: material('roofTile', { roughness: 0.85 }),
    roofTileOld: material('roofTile', { roughness: 0.95, color: 0xc9b9a6 }),
    grass: material('grass', { roughness: 1 }),
    dirt: material('dirt', { roughness: 1 }),
    cityGround: material('dirt', { roughness: 1, color: 0xcabfae }),
    asphalt: material('asphalt', { roughness: 0.9 }),
    wood: material('wood', { roughness: 0.85 }),
    timber: material('wood', { roughness: 0.9, color: 0x9a8468 }),
    rubble: material('rubble', { roughness: 1 }),
    plaster: material('plaster', { roughness: 0.9 }),
    plasterOchre: material('plaster', { roughness: 0.9, color: 0xe2b877 }),
    plasterRed: material('plaster', { roughness: 0.9, color: 0xb5553f }),
    plasterPink: material('plaster', { roughness: 0.9, color: 0xdba085 }),
    plasterCream: material('plaster', { roughness: 0.9, color: 0xf0dcae }),
    whiteStone: material('marbleAshlar', { roughness: 0.7, color: 0xf0ece2 }),
    interior: material('plaster', { roughness: 1, color: 0x4a4038 }),
    facades: {
      ancient: [0xe6bd80, 0xf0dcae, 0xdba085, 0xf2ead8, 0xd9a86a].map((color) => ({
        facade: material('facadeAncient', { roughness: 0.92, color }),
        plain: material('plaster', { roughness: 0.92, color }),
      })),
      modern: [0xe2b877, 0xdba085, 0xf0dcae, 0xd99a6c, 0xece4d2, 0xc98f6b].map((color) => ({
        facade: material('facadeModern', { roughness: 0.9, color }),
        plain: material('plaster', { roughness: 0.9, color }),
      })),
    },
    granite: material('granite', { roughness: 0.45 }),
    graniteOld: material('granite', { roughness: 0.8, color: 0xc4bdb2 }),
    rust: flat(0x5b3a2a, { roughness: 0.7, metalness: 0.5 }),
    bronze: flat(0x6b4a26, { roughness: 0.35, metalness: 0.9 }),
    gilt: flat(0xd9a441, { roughness: 0.3, metalness: 1 }),
    bronzeGreen: flat(0x3d5a4c, { roughness: 0.6, metalness: 0.6 }),
    dark: flat(0x15120f, { roughness: 1 }),
    iron: flat(0x2a2c2e, { roughness: 0.6, metalness: 0.7 }),
    lead: flat(0x7d8790, { roughness: 0.5, metalness: 0.5 }),
    water: flat(0x3c6f7a, { roughness: 0.08, metalness: 0.2 }),
    pineBark: flat(0x5a4636, { roughness: 1 }),
    pineLeaf: flat(0x3a5a2c, { roughness: 1 }),
    pineLeafDark: flat(0x2a4424, { roughness: 1 }),
    cypressLeaf: flat(0x22381f, { roughness: 1 }),
    shrub: flat(0x4b6a32, { roughness: 1 }),
    glass: flat(0x26323a, { roughness: 0.15, metalness: 0.6 }),
    paint: flat(0xe8e8e2, { roughness: 0.8 }),
  };
}
