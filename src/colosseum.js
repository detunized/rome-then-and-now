import * as THREE from 'three';
import { makeRng } from './textures.js';
import {
  Builder, place, wallGeometry, wallMatrix, gablePrism, gableRoof, robedFigure, stonePine, cypress, cityGrid, cityBlock,
  columnParts, instanced,
} from './parts.js';

// The Colosseum is generated once, element by element. Every element goes into the
// reconstructed `core`; the ones that still stand also go into `remains`, with weathered
// materials. That makes today's ruin an exact subset of the ancient building.
//
// Axes: +X east, +Z south, Y up. The long axis of the oval runs east to west.
// The outer wall survives on the north side only.

const HALF_LENGTH = 94;
const HALF_WIDTH = 78;
const BAYS = 80;
const ARENA = 51;
const LEVELS = [0, 10.5, 22.3, 33.9, 48.5];
const RING_A = 2.6;
const RING_B = 7.4;
const RING_C = 14.2;
const RING_THICK = 2.2;
const ROW = 0.75;
const RISE = 0.47;
const TIERS = [
  { from: 46.5, rows: 16, y: 4.0 },
  { from: 33.0, rows: 14, y: 14.3 },
  { from: 21.3, rows: 6, y: 24.7 },
];

const STONE = ['travertineBlocks', 'travertineWorn'];
const BRICK = ['brick', 'brickOld'];
const MARBLE = ['marble', 'marbleOld'];
const FACING = ['marbleAshlar', 'brickOld'];
const TUFA = ['tufa', 'tufaOld'];
const SUBSTRUCTURE = ['brick', 'rubble'];

// Points on the outer oval at equal distances along its length, with outward normals.
function stations(a, b, count) {
  const samples = 7200;
  const cumulative = [0];
  let px = a;
  let pz = 0;
  for (let i = 1; i <= samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const x = a * Math.cos(angle);
    const z = b * Math.sin(angle);
    cumulative.push(cumulative[i - 1] + Math.hypot(x - px, z - pz));
    px = x;
    pz = z;
  }
  const total = cumulative[samples];
  const result = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const wanted = (total * k) / count;
    while (cumulative[j + 1] < wanted) j++;
    const angle = ((j + (wanted - cumulative[j]) / (cumulative[j + 1] - cumulative[j])) / samples) * Math.PI * 2;
    const x = a * Math.cos(angle);
    const z = b * Math.sin(angle);
    const length = Math.hypot(x / (a * a), z / (b * b));
    result.push({ x, z, nx: x / (a * a) / length, nz: z / (b * b) / length });
  }
  return result;
}

// Box with a four sided base in the ground plane and independent heights at each corner.
function hexa(base, bottoms, tops) {
  let points = base;
  let low = Array.isArray(bottoms) ? bottoms : [bottoms, bottoms, bottoms, bottoms];
  let high = Array.isArray(tops) ? tops : [tops, tops, tops, tops];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  if (area > 0) {
    points = [...points].reverse();
    low = [...low].reverse();
    high = [...high].reverse();
  }
  const b = points.map((p, i) => [p[0], low[i], p[1]]);
  const t = points.map((p, i) => [p[0], high[i], p[1]]);
  const positions = [];
  const quad = (p, q, r, s) => positions.push(...p, ...q, ...r, ...p, ...r, ...s);
  quad(t[0], t[1], t[2], t[3]);
  quad(b[3], b[2], b[1], b[0]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(b[i], b[j], t[j], t[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Places geometry whose local X runs from `a` to `b` and whose local +Z points to `inward`.
function alongMatrix(a, b, inward, y) {
  let from = a;
  let dx = b[0] - a[0];
  let dz = b[1] - a[1];
  if (-dz * inward[0] + dx * inward[1] < 0) {
    from = b;
    dx = -dx;
    dz = -dz;
  }
  const length = Math.hypot(dx, dz);
  dx /= length;
  dz /= length;
  const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(dx, 0, dz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dz, 0, dx));
  matrix.setPosition(from[0], y, from[1]);
  return { matrix, length };
}

function ovalShape(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  return shape;
}

function groundWithHole(hole) {
  const far = 2000;
  const shape = new THREE.Shape();
  shape.moveTo(-far, -far);
  shape.lineTo(far, -far);
  shape.lineTo(far, far);
  shape.lineTo(-far, far);
  shape.closePath();
  shape.holes.push(ovalShape(hole));
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

export function buildColosseum(sets) {
  const MC = sets.core;
  const MR = sets.remains;
  const MM = sets.modern;
  const MX = sets.context;
  const C = new Builder();
  const R = new Builder();
  const N = new Builder();
  const X = new Builder();
  const E = new Builder();
  const rng = makeRng(1880);
  const S = stations(HALF_LENGTH, HALF_WIDTH, BAYS);
  const wrap = (k) => ((k % BAYS) + BAYS) % BAYS;
  const point = (k, d) => {
    const s = S[wrap(k)];
    return [s.x - s.nx * d, s.z - s.nz * d];
  };
  const between = (k, t, d) => {
    const a = point(k, d);
    const b = point(k + 1, d);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const inward = (k) => {
    const a = S[wrap(k)];
    const b = S[wrap(k + 1)];
    return [-(a.nx + b.nx) / 2, -(a.nz + b.nz) / 2];
  };

  const emit = (survives, pair, geometry, matrix, options) => {
    C.add(geometry, MC[pair[0]], matrix, options);
    if (survives) R.add(geometry, MR[pair[1]], matrix, options);
  };
  const panel = (k, d, y, height, thick, openings, survives, pair = STONE) => {
    const { matrix, length } = alongMatrix(point(k, d), point(k + 1, d), inward(k), y);
    emit(survives, pair, wallGeometry(length, height, thick, openings(length)), matrix);
  };
  const band = (k, d, y, height, depth, projection, survives, pair = STONE) => {
    const { matrix, length } = alongMatrix(point(k, d), point(k + 1, d), inward(k), y);
    emit(survives, pair, new THREE.BoxGeometry(length + 0.15, height, depth).translate(length / 2, height / 2, depth / 2 - projection), matrix);
  };
  const block = (k, d0, d1, y0, y1, survives, pair) => {
    emit(survives, pair, hexa([point(k, d0), point(k + 1, d0), point(k + 1, d1), point(k, d1)], y0, y1));
  };
  const post = (k, d, y, height, radius, survives, pair = STONE, segments = 10) => {
    const [x, z] = point(k, d);
    emit(survives, pair, new THREE.CylinderGeometry(radius * 0.93, radius, height, segments).translate(0, height / 2, 0), place(x, y, z));
  };
  // Small pieces set along a bay at a fraction of its length: corbels, masts, shields.
  const alongBay = (k, d, fraction, y, geometry, survives, pair) => {
    const { matrix, length } = alongMatrix(point(k, d), point(k + 1, d), inward(k), y);
    emit(survives, pair, geometry.translate(length * fraction, 0, 0), matrix, { keepUV: pair[0] === 'gilt' || pair[0] === 'timber' });
  };

  // The outer wall stands from just north of the west end round to the north-east.
  const outerStands = (k) => wrap(k) >= 41 && wrap(k) <= 71;
  const innerStands = (k) => wrap(k) >= 40 && wrap(k) <= 72;
  const upperStands = [];
  let run = true;
  for (let k = 0; k < BAYS; k++) {
    if (rng() < 0.3) run = rng() < 0.7;
    upperStands.push(innerStands(k) || run);
  }

  for (let k = 0; k < BAYS; k++) {
    const stands = outerStands(k);
    const stationStands = outerStands(k) || outerStands(k - 1);

    // Outer wall, ground arcade with Tuscan half columns.
    panel(k, 0, 0, 10.5, RING_A, (length) => [{ x: length / 2, y: 0, w: 4.2, h: 4.9, arch: true }], stands);
    band(k, 0, 9.0, 0.35, 0.5, 0.14, stands);
    band(k, 0, 9.9, 0.6, 0.7, 0.4, stands);
    post(k, -0.12, 0, 0.5, 0.68, stationStands, STONE, 8);
    post(k, -0.12, 0.5, 8.1, 0.5, stationStands);
    post(k, -0.12, 8.6, 0.4, 0.66, stationStands, STONE, 8);

    // Second and third arcades, with statues in the arches.
    for (const level of [1, 2]) {
      const base = LEVELS[level];
      const height = LEVELS[level + 1] - base;
      panel(k, 0, base, height, RING_A, (length) => [{ x: length / 2, y: 1.6, w: 4.2, h: 4.3, arch: true }], stands);
      band(k, 0, base + height - 1.5, 0.35, 0.5, 0.14, stands);
      band(k, 0, base + height - 0.6, 0.6, 0.7, 0.4, stands);
      post(k, -0.12, base, 1.6, 0.66, stationStands, STONE, 8);
      post(k, -0.12, base + 1.6, height - 3.5, 0.46, stationStands);
      post(k, -0.12, base + height - 1.9, 0.4, 0.62, stationStands, STONE, 8);
      const mid = inward(k);
      const [sx, sz] = between(k, 0.5, 1.1);
      const metal = level === 1 ? MC.marble : MC.bronze;
      robedFigure(C, metal, metal, sx, base + 1.6, sz, 2.7, Math.atan2(mid[1], -mid[0]));
    }

    // Attic: pilasters, windows, corbels for the awning masts, crowning cornice.
    const attic = LEVELS[3];
    panel(k, 0, attic, 14.6, 2.0, (length) => (k % 2 === 0
      ? [{ x: length / 2, y: 5.4, w: 1.7, h: 2.6 }]
      : [{ x: length / 2, y: 2.2, w: 1.1, h: 1.1 }]), stands);
    band(k, 0, attic, 0.5, 0.5, 0.2, stands);
    band(k, 0, attic + 13.6, 1.0, 1.0, 0.62, stands);
    post(k, -0.02, attic + 0.5, 12.6, 0.52, stationStands, STONE, 4);
    for (const fraction of [1 / 6, 1 / 2, 5 / 6]) {
      alongBay(k, 0, fraction, attic + 9.4, new THREE.BoxGeometry(0.5, 0.8, 0.9).translate(0, 0.4, -0.4), stands, STONE);
      alongBay(k, 0, fraction, attic + 9.6, new THREE.CylinderGeometry(0.11, 0.15, 11, 6).translate(0, 5.5, -0.55), false, ['timber', 'timber']);
    }
    if (k % 2 === 1) {
      alongBay(k, 0, 0.5, attic + 7.4, new THREE.CylinderGeometry(0.95, 0.95, 0.16, 20).rotateX(Math.PI / 2).translate(0, 0, -0.1), false, ['gilt', 'gilt']);
    }

    // Second ring of piers, between the two outer corridors.
    const inner = innerStands(k);
    panel(k, RING_B, 0, 10.5, RING_THICK, (length) => [{ x: length / 2, y: 0, w: 3.8, h: 4.7, arch: true }], inner);
    panel(k, RING_B, 10.5, 11.8, RING_THICK, (length) => [{ x: length / 2, y: 1.2, w: 3.8, h: 4.2, arch: true }], inner);

    // Third ring. Where the outer wall has fallen, this is the facade seen today.
    panel(k, RING_C, 0, 10.5, RING_THICK, (length) => [{ x: length / 2, y: 0, w: 3.4, h: 4.6, arch: true }], true);
    panel(k, RING_C, 10.5, 11.8, RING_THICK, (length) => [{ x: length / 2, y: 1.2, w: 3.4, h: 3.8, arch: true }], true);
    panel(k, RING_C, 22.3, 11.6, RING_THICK, (length) => [{ x: length / 2, y: 3.0, w: 2.4, h: 2.0, arch: true }], upperStands[k]);
    band(k, RING_C, 9.9, 0.6, 0.5, 0.25, true);
    band(k, RING_C, 21.7, 0.6, 0.5, 0.25, true);
    band(k, RING_C, 33.3, 0.6, 0.5, 0.25, upperStands[k]);

    // Floors of the corridors.
    block(k, RING_A, RING_C, 10.0, 10.5, inner, STONE);
    block(k, RING_A, RING_C, 21.8, 22.3, inner, STONE);
    block(k, 2.0, RING_C + RING_THICK, 33.4, 33.9, inner, STONE);

    // Seating. The brick substructure survives; the marble seats on top of it do not.
    block(k, 50.2, ARENA, 0, 3.6, true, FACING);
    block(k, 46.5, 50.2, 0, 3.6, true, SUBSTRUCTURE);
    block(k, 50.7, ARENA, 3.6, 4.6, false, MARBLE);
    for (const [index, tier] of TIERS.entries()) {
      const outer = tier.from - tier.rows * ROW;
      const top = tier.y + tier.rows * RISE - 0.25;
      const kept = index === 0 ? rng() < 0.93 : rng() < 0.82;
      emit(kept, SUBSTRUCTURE, hexa([point(k, outer), point(k + 1, outer), point(k + 1, tier.from), point(k, tier.from)], 0, [top, top, tier.y - 0.2, tier.y - 0.2]));
      // Radial brick wall along the pier line, standing slightly proud of the slope.
      const [ox, oz] = point(k, outer);
      const [ix, iz] = point(k, tier.from);
      const length = Math.hypot(ix - ox, iz - oz);
      const sx = ((iz - oz) / length) * 0.4;
      const sz = (-(ix - ox) / length) * 0.4;
      emit(true, BRICK, hexa([[ox - sx, oz - sz], [ox + sx, oz + sz], [ix + sx, iz + sz], [ix - sx, iz - sz]], 0, [top + 0.2, top + 0.2, tier.y + 0.3, tier.y + 0.3]));
      for (let row = 0; row < tier.rows; row++) {
        const rowTop = tier.y + row * RISE + 0.45;
        block(k, tier.from - (row + 1) * ROW, tier.from - row * ROW, rowTop - 0.9, rowTop, false, MARBLE);
      }
    }
    block(k, 33.25, 34.5, 0, 11.2, rng() < 0.85, SUBSTRUCTURE);
    block(k, 33.25, 34.5, 11.2, 11.5, false, MARBLE);
    block(k, 33.0, 33.25, 0, 14.5, false, MARBLE);
    block(k, 21.55, 22.5, 0, 20.6, rng() < 0.8, SUBSTRUCTURE);
    block(k, 21.55, 22.5, 20.6, 20.9, false, MARBLE);
    block(k, 21.3, 21.55, 0, 24.9, false, MARBLE);
    block(k, RING_C + RING_THICK, 16.8, 0, 27.5, rng() < 0.8, SUBSTRUCTURE);

    // Top gallery with a colonnade, wooden seats and a tiled roof.
    post(k, 15.3, 33.9, 8.6, 0.4, false, MARBLE);
    band(k, 14.9, 42.5, 0.7, 0.8, 0, false, MARBLE);
    emit(false, ['roofTile', 'roofTile'], hexa([point(k, 2.2), point(k + 1, 2.2), point(k + 1, 16.4), point(k, 16.4)], [45.3, 45.3, 43.0, 43.0], [45.6, 45.6, 43.3, 43.3]));
    for (let row = 0; row < 8; row++) block(k, 12.5 - row, 13.5 - row, 33.9, 34.4 + row * 0.45, false, ['timber', 'timber']);

    // Wall of the pit under the arena.
    block(k, ARENA, 52.2, -6.2, 0, true, TUFA);
  }

  // Arena. The floor of sand over timber hid the hypogeum; today most of it is open.
  const arenaEdge = Array.from({ length: BAYS }, (_, k) => point(k, ARENA));
  const pitEdge = Array.from({ length: BAYS }, (_, k) => point(k, 51.6));
  C.add(new THREE.ShapeGeometry(ovalShape(arenaEdge)).rotateX(-Math.PI / 2), MC.sand, place(0, 0.03, 0));
  emit(true, ['dirt', 'dirt'], new THREE.ShapeGeometry(ovalShape(pitEdge)).rotateX(-Math.PI / 2), place(0, -6.2, 0));
  for (const z of [-17, -12, -7.5, -2.2, 2.2, 7.5, 12, 17]) {
    const half = 43 * Math.sqrt(1 - (z / 27) ** 2) - 2.5;
    for (let x = -half; x < half - 1.5; x += 7.6) {
      const length = Math.min(6.4, half - x);
      emit(true, BRICK, new THREE.BoxGeometry(length, 5.5, 0.9).translate(length / 2, 2.75, 0), place(x, -6.2, z));
    }
  }
  for (let x = -36; x <= 36; x += 9) {
    emit(true, TUFA, new THREE.BoxGeometry(0.9, 5.5, 3.6), place(x, -3.45, 4.85));
    emit(true, TUFA, new THREE.BoxGeometry(0.9, 5.5, 3.6), place(x + 4.5, -3.45, -4.85));
  }
  const deck = arenaEdge.filter(([x]) => x > 20);
  const east = [...deck.filter(([, z]) => z < 0), ...deck.filter(([, z]) => z >= 0)];
  N.add(new THREE.ShapeGeometry(ovalShape(east)).rotateX(-Math.PI / 2), MM.wood, place(0, 0.03, 0));

  // The two brick buttresses of 1807 and 1826 that hold the broken ends of the outer wall.
  const buttress = (k, heights) => {
    N.add(hexa([point(k, 0), point(k + 1, 0), point(k + 1, RING_A), point(k, RING_A)], 0, [heights[0], heights[1], heights[1], heights[0]]), MM.brick);
  };
  buttress(40, [31, 48.5]);
  buttress(39, [11, 31]);
  buttress(72, [48.5, 29]);
  buttress(73, [29, 9]);

  // Arch of Constantine: stands in both eras.
  const archX = -141;
  const archZ = 74;
  emit(true, MARBLE, wallGeometry(25.7, 21, 7.4, [
    { x: 12.85, y: 0, w: 6.5, h: 8.2, arch: true },
    { x: 4.4, y: 0, w: 3.3, h: 5.5, arch: true },
    { x: 21.3, y: 0, w: 3.3, h: 5.5, arch: true },
  ]), wallMatrix(archX, 0, archZ));
  for (const [y, height, grow] of [[12.3, 0.9, 0.5], [20.2, 0.8, 0.45]]) {
    emit(true, MARBLE, new THREE.BoxGeometry(25.7 + grow * 2, height, 7.4 + grow * 2), place(archX + 12.85, y + height / 2, archZ + 3.7));
  }
  for (const x of [2.2, 8.4, 17.3, 23.5]) {
    for (const z of [-0.55, 7.95]) {
      emit(true, MARBLE, new THREE.BoxGeometry(1.2, 2.4, 1.2), place(archX + x, 1.2, archZ + z));
      emit(true, ['giallo', 'marbleOld'], new THREE.CylinderGeometry(0.4, 0.44, 8.6, 12), place(archX + x, 6.7, archZ + z));
      emit(true, MARBLE, new THREE.BoxGeometry(1.1, 0.7, 1.1), place(archX + x, 11.35, archZ + z));
      robedFigure(C, MC.marble, MC.marble, archX + x, 13.2, archZ + z, 3, z < 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }

  // Lost monuments around the amphitheatre.
  // Meta Sudans, the conical fountain.
  emit(false, MARBLE, new THREE.CylinderGeometry(8, 8, 1.1, 40), place(-124, 0.55, 34));
  C.add(new THREE.CylinderGeometry(7.3, 7.3, 0.1, 40), MC.water, place(-124, 1.12, 34), { keepUV: true });
  emit(false, FACING, new THREE.CylinderGeometry(3.6, 3.9, 2.4, 28), place(-124, 1.2, 34));
  emit(false, FACING, new THREE.CylinderGeometry(0.9, 3.4, 15, 28), place(-124, 9.9, 34));
  // Colossus of the Sun, the bronze statue that gave the building its name.
  emit(false, FACING, new THREE.BoxGeometry(9, 7, 9), place(-128, 3.5, -46));
  robedFigure(C, MC.gilt, MC.gilt, -128, 7, -46, 31, Math.PI, true);
  for (let i = 0; i < 7; i++) {
    const angle = -0.9 + i * 0.3;
    const ray = new THREE.CylinderGeometry(0.05, 0.22, 4.2, 6).translate(0, 2.1, 0).rotateZ(-angle);
    C.add(ray, MC.gilt, place(-128, 37.4, -46, Math.PI / 2), { keepUV: true });
  }
  // Temple of Venus and Roma on its terrace. The terrace still exists.
  emit(true, ['travertineBlocks', 'tufaOld'], new THREE.BoxGeometry(150, 7, 104), place(-262, 3.5, 0));
  C.span(MC.marbleAshlar, -312, -212, 7, 9, -22, 22);
  C.span(MC.marbleAshlar, -300, -224, 9, 27, -14, 14);
  C.span(MC.marble, -311, -213, 27, 30.2, -21, 21);
  C.add(gablePrism(42, 7.4, 98).rotateY(Math.PI / 2), MC.marble, place(-262, 30.2, 0));
  gableRoof(C, MC.roofTile, { a0: -312, a1: -212, b0: -22, b1: 22, y: 30.3, rise: 7.8, overhang: 0.6 });
  const templeColumns = [];
  for (let i = 0; i < 10; i++) {
    for (const x of [-309.6, -214.4]) templeColumns.push(place(x, 9, -19.8 + i * 4.4));
  }
  for (let i = 1; i < 19; i++) {
    for (const z of [-19.8, 19.8]) templeColumns.push(place(-309.6 + i * 5.01, 9, z));
  }

  // Ancient surroundings.
  X.add(groundWithHole(pitEdge), MX.cityGround, place(0, -0.03, 0));
  for (let k = 0; k < BAYS; k++) {
    X.add(hexa([point(k, -19), point(k + 1, -19), point(k + 1, 0.5), point(k, 0.5)], -0.3, 0.02), MX.plazaPave);
    if (k % 2 === 0) {
      const [x, z] = point(k, -19.4);
      X.add(new THREE.CylinderGeometry(0.28, 0.34, 1.7, 8), MX.travertine, place(x, 0.85, z));
    }
  }
  X.span(MX.tufa, -330, 330, 0, 8.8, -470, -178);
  X.span(MX.cityGround, -330, 330, 8.8, 9, -470, -178);
  for (let x = -300; x < 300; x += 52) {
    cityBlock(X, MX, { x, z: -204 - rng() * 10, y: 9, bays: 12 + Math.floor(rng() * 4), depthBays: 8, floors: 3 + Math.floor(rng() * 3), style: MX.facades.ancient[Math.floor(rng() * 5)] });
  }
  const nearMonument = (x, z, r) => {
    if ((x / (195 + r)) ** 2 + (z / (165 + r)) ** 2 < 1) return true;
    if (x > -345 - r && x < -180 + r && Math.abs(z) < 60 + r) return true;
    if (x > -335 - r && x < 335 + r && z < -170 + r && z > -480 - r) return true;
    return false;
  };
  cityGrid(X, MX, rng, { cell: 30, extent: 780, y: 0, styles: MX.facades.ancient, floors: [2, 5], blocked: nearMonument, street: [3, 6] });
  for (const [x0, x1, z0, z1] of [[-2000, 2000, 815, 2000], [-2000, 2000, -2000, -815], [-2000, -815, -815, 815], [815, 2000, -815, 815]]) {
    X.span(MX.grass, x0, x1, -0.03, 0, z0, z1);
  }
  for (let i = 0; i < 150; i++) {
    const k = Math.floor(rng() * BAYS);
    const [x, z] = between(k, rng(), -3 - rng() * 30);
    robedFigure(X, MX.cloth[Math.floor(rng() * MX.cloth.length)], MX.skin, x, 0.02, z, 1.6 + rng() * 0.22, rng() * 6.3);
  }

  // Today's surroundings.
  N.add(groundWithHole(pitEdge), MM.cobble, place(0, -0.02, 0));
  E.add(groundWithHole(pitEdge), MR.dirt, place(0, -0.08, 0));
  N.box(MM.asphalt, 0, 0, -138, 760, 0.04, 16);
  N.box(MM.asphalt, -265, 0, -112, 300, 0.04, 22, 0.32);
  N.box(MM.asphalt, 150, 0, 0, 14, 0.04, 420);
  N.span(MM.grass, -110, 120, 0, 0.1, 112, 190);
  N.span(MM.grass, -330, 330, 0, 8.8, -470, -178);
  N.span(MM.grass, -335, -190, 7, 7.15, -50, 50);
  for (let i = 0; i < 46; i++) {
    const hill = i < 26;
    const x = hill ? -310 + rng() * 620 : (i < 36 ? -100 + rng() * 210 : -325 + rng() * 125);
    const z = hill ? -190 - rng() * 110 : (i < 36 ? 120 + rng() * 60 : -45 + rng() * 90);
    const y = hill ? 8.8 : (i < 36 ? 0.1 : 7.15);
    if (rng() < 0.75) stonePine(N, MM, x, y, z, 13 + rng() * 6, rng);
    else cypress(N, MM, x, y, z, 9 + rng() * 5, rng);
  }
  const roads = (x, z, r) => nearMonument(x, z, r) || (z < -100 + r && z > -160 - r) || (x > 135 - r && x < 165 + r);
  cityGrid(N, MM, rng, { cell: 48, extent: 800, y: 0, styles: MM.facades.modern, floors: [4, 7], blocked: roads, flatChance: 0.2 });
  for (const [x0, x1, z0, z1] of [[-2000, 2000, 815, 2000], [-2000, 2000, -2000, -815], [-2000, -815, -815, 815], [815, 2000, -815, 815]]) {
    N.span(MM.grass, x0, x1, -0.02, 0.01, z0, z1);
  }
  for (let i = 0; i < 130; i++) {
    const k = Math.floor(rng() * BAYS);
    const [x, z] = between(k, rng(), -4 - rng() * 34);
    robedFigure(N, MM.cloth[2 + Math.floor(rng() * (MM.cloth.length - 2))], MM.skin, x, 0.02, z, 1.6 + rng() * 0.25, rng() * 6.3);
  }

  const core = new THREE.Group();
  const context = new THREE.Group();
  const remains = new THREE.Group();
  const modern = new THREE.Group();
  const earth = new THREE.Group();
  C.build(core);
  X.build(context);
  R.build(remains);
  N.build(modern);
  E.build(earth);

  const column = columnParts(0.95, 18, true);
  core.add(instanced(column.shaft, MC.marble, templeColumns));
  core.add(instanced(column.base, MC.marble, templeColumns));
  core.add(instanced(column.capital, MC.marbleDouble, templeColumns));

  const ancientGroup = new THREE.Group();
  ancientGroup.add(context, core);
  const todayGroup = new THREE.Group();
  todayGroup.add(remains, modern, earth);
  return {
    ancient: { group: ancientGroup, core, context },
    today: { group: todayGroup, remains, modern, earth },
    ghostSkip: ['interior', 'dark', 'dirt', 'water', 'timber'].map((name) => MC[name]),
    columnSets: [{ R: 0.95, H: 18, matrices: templeColumns }],
  };
}
