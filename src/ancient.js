import * as THREE from 'three';
import { makeRng } from './textures.js';
import {
  Builder, place, instanced, linspace, columnParts, wallGeometry, wallMatrix, roofSlab, gableRoof,
  gablePrism, stairs, entablature, cypress, stonePine, blockBuilding, cityGrid, cityBlock,
} from './parts.js';

// Axes: +X runs from the temple (north-west) to the Curia (south-east),
// -Z is the Capitoline side with the tabernae, +Z is the side of the later imperial fora.
export const LAYOUT = {
  x0: -80,
  x1: 80,
  wallZ: 37.5,
  plazaZ: 24.5,
  plazaX1: 67,
  stylobate: 0.9,
  column: { R: 0.42, H: 8.2 },
  E: 1.8,
  frontZ: 25.4,
  midZ: 31.5,
  seFrontX: 67.9,
  seMidX: 74,
  tabernaeDepth: 9,
  bays: 29,
  templeX: -49.4,
  temple: { R: 0.625, H: 12.5, podium: 5, halfWidth: 11.5, pitch: 3.0286 },
};

export function porticoColumnSites() {
  const L = LAYOUT;
  const frontXs = linspace(-78.1, L.seFrontX, 37);
  const midXs = [...frontXs, L.seMidX];
  const seZs = linspace(-L.frontZ, L.frontZ, 14);
  return { frontXs, midXs, seZs };
}

export function templeColumnSites() {
  const T = LAYOUT.temple;
  const sites = [];
  for (let i = 0; i < 8; i++) sites.push({ x: -0.8, z: -10.6 + i * T.pitch, side: 'front', index: i });
  for (let k = 1; k <= 8; k++) {
    sites.push({ x: -0.8 - k * 3.03, z: -10.6, side: 'south', index: k });
    sites.push({ x: -0.8 - k * 3.03, z: 10.6, side: 'north', index: k });
  }
  return sites;
}

function buildTemple(B, M, columns) {
  const T = LAYOUT.temple;
  const P = T.podium;
  const hw = T.halfWidth;
  B.push(place(LAYOUT.templeX, 0, 0));

  B.span(M.marbleAshlar, -30.6, 0, 0, P, -hw, hw);
  B.span(M.marble, -30.9, 0.3, 0, 0.7, -hw - 0.3, hw + 0.3);
  B.span(M.marble, -30.8, 0.15, P - 0.4, P, -hw - 0.2, hw + 0.2);

  stairs(B, M.marble, { x: 2.4, z: 0, dx: -1, dz: 0, width: hw * 2, count: 8, rise: 0.2, run: 0.3, y0: 3.4 });
  B.span(M.marbleAshlar, 0, 2.4, 0, 3.4, -hw, hw);
  B.span(M.marbleAshlar, 2.4, 8.4, 0, 3.4, -8.9, 8.9);
  B.span(M.marble, 2.4, 8.55, 3.4, 3.6, -8.9, 8.9);
  B.span(M.marble, 8.25, 8.55, 3.6, 4.4, -8.9, 8.9);
  for (const s of [-1, 1]) {
    stairs(B, M.marble, { x: 8.4, z: s * 10.2, dx: -1, dz: 0, width: 2.6, count: 17, rise: 0.2, run: 0.3, y0: 0 });
    B.span(M.marbleAshlar, 2.4, 3.3, 0, 3.4, s * 8.9, s * hw);
    B.span(M.marble, 3.3, 8.6, 0, 4.3, s * (hw - 0.05), s * (hw + 0.3));
  }

  for (const s of [-1, 1]) {
    B.span(M.marble, 10.5, 14.5, 0, 0.9, s * 2.5, s * 9.5);
    B.span(M.water, 10.9, 14.1, 0.9, 0.93, s * 2.9, s * 9.1);
    B.span(M.marble, 10.5, 14.5, 0.9, 1.05, s * 2.5, s * 2.8);
    B.span(M.marble, 10.5, 14.5, 0.9, 1.05, s * 9.2, s * 9.5);
    B.span(M.marble, 10.5, 10.8, 0.9, 1.05, s * 2.5, s * 9.5);
    B.span(M.marble, 14.2, 14.5, 0.9, 1.05, s * 2.5, s * 9.5);
  }

  const top = P + T.H;
  B.span(M.marbleAshlar, -28.6, -9.4, P, top, -7.6, -6.8);
  B.span(M.marbleAshlar, -28.6, -9.4, P, top, 6.8, 7.6);
  B.span(M.marbleAshlar, -28.6, -27.3, P, top, -11.18, 11.18);
  B.add(wallGeometry(15.2, T.H, 0.8, [{ x: 7.6, y: 0, w: 4.4, h: 9 }]), M.marbleAshlar, wallMatrix(-8.6, P, -7.6, 'z'));
  B.span(M.bronze, -9.25, -9.1, P, P + 9, -2.2, 2.2);
  B.span(M.gilt, -9.08, -9.02, P + 0.4, P + 8.6, -0.06, 0.06);
  for (const s of [-1, 1]) {
    B.span(M.marble, -8.75, -8.45, P, P + 9.3, s * 2.2, s * 2.65);
    for (let i = 0; i < 4; i++) B.span(M.gilt, -9.08, -9.03, P + 0.6 + i * 2.1, P + 2.3 + i * 2.1, s * 0.35, s * 1.9);
  }
  B.span(M.marble, -8.8, -8.4, P + 9, P + 9.6, -2.9, 2.9);
  B.span(M.marbleAshlar, -9.4, -27.3, P, P + 0.05, -6.8, 6.8);

  B.add(new THREE.CylinderGeometry(5, 5, 16.5, 28), M.marbleAshlar, new THREE.Matrix4().setPosition(-28.6, 8.25, 0));
  B.add(
    new THREE.SphereGeometry(5.25, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1),
    M.lead,
    new THREE.Matrix4().setPosition(-28.6, 16.5, 0),
    { keepUV: true },
  );

  const E = 2.9;
  const ex0 = -28.6;
  const ex1 = -0.22;
  const ez = 11.18;
  entablature(B, M, { x0: ex0, x1: ex1, z0: -ez, z1: ez, y: top, E });
  const eave = top + E;
  const half = ez + 0.46 * E;
  const rise = half * 0.4;
  for (const x of [ex1 - 0.75, ex0 + 0.15]) {
    B.add(gablePrism(ez * 2, rise * (ez / half), 0.6).rotateY(Math.PI / 2), M.marble, new THREE.Matrix4().setPosition(x, eave, 0));
  }
  for (const s of [-1, 1]) {
    roofSlab(B, M.roofTile, { a0: ex0 - 1.5, a1: ex1 + 1.5, low: s * (half + 0.25), high: 0, yLow: eave - 0.05, yHigh: eave + rise + 0.05 });
    for (const [a0, a1] of [[ex1 - 0.5, ex1 + 1.6], [ex0 - 1.6, ex0 + 0.5]]) {
      roofSlab(B, M.marble, { a0, a1, low: s * (half + 0.3), high: 0, yLow: eave - 0.38, yHigh: eave + rise - 0.3, thick: 0.5 });
    }
    B.span(M.marble, ex1 + 0.2, ex1 + 1.4, eave, eave + 0.7, s * (half - 1.0), s * (half + 0.1));
    acroterion(B, M.marble, ex1 + 0.8, eave + 0.7, s * (half - 0.45), 0.6);
  }
  B.span(M.marble, ex1 + 0.2, ex1 + 1.4, eave + rise - 0.2, eave + rise + 0.6, -0.8, 0.8);
  acroterion(B, M.marble, ex1 + 0.8, eave + rise + 0.6, 0, 1.0);

  for (const site of templeColumnSites()) {
    columns.temple.push(B.transform.clone().multiply(place(site.x, P, site.z)));
  }
  B.pop();
}

function acroterion(B, material, x, y, z, radius) {
  const fan = new THREE.CylinderGeometry(radius, radius, 0.4, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  B.add(fan, material, new THREE.Matrix4().makeScale(1, 1.25, 1).setPosition(x, y, z));
}

function figure(B, material, x, y, z, height) {
  const body = new THREE.CylinderGeometry(height * 0.07, height * 0.16, height * 0.78, 10).translate(0, height * 0.39, 0);
  B.add(body, material, new THREE.Matrix4().setPosition(x, y, z), { keepUV: true });
  B.add(new THREE.SphereGeometry(height * 0.085, 10, 8), material, new THREE.Matrix4().setPosition(x, y + height * 0.87, z), { keepUV: true });
  const arm = new THREE.CylinderGeometry(height * 0.03, height * 0.035, height * 0.45, 6).translate(0, height * 0.22, 0);
  B.add(arm, material, new THREE.Matrix4().makeRotationX(0.9).setPosition(x, y + height * 0.62, z + height * 0.1), { keepUV: true });
}

function equestrianStatue(B, M, x, z) {
  B.span(M.marbleAshlar, x - 2.4, x + 2.4, 0, 3.2, z - 1.3, z + 1.3);
  B.span(M.marble, x - 2.7, x + 2.7, 0, 0.5, z - 1.6, z + 1.6);
  B.span(M.marble, x - 2.6, x + 2.6, 3.0, 3.35, z - 1.5, z + 1.5);
  const m = M.gilt;
  const at = (g, px, py, pz, rz = 0, rx = 0) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz));
    B.add(g, m, new THREE.Matrix4().compose(new THREE.Vector3(x + px, 3.35 + py, z + pz), q, new THREE.Vector3(1, 1, 1)), { keepUV: true });
  };
  at(new THREE.CapsuleGeometry(0.55, 1.5, 6, 12).rotateZ(Math.PI / 2), 0, 1.9, 0);
  at(new THREE.CapsuleGeometry(0.3, 0.9, 4, 10), 1.25, 2.6, 0, -0.6);
  at(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8).rotateZ(Math.PI / 2), 1.85, 3.0, 0, -0.5);
  at(new THREE.CapsuleGeometry(0.1, 0.9, 4, 8), -1.35, 1.6, 0, -0.5);
  const legs = [[0.85, 0.36, 0.15], [0.85, -0.36, -0.55], [-0.85, 0.36, 0.1], [-0.85, -0.36, -0.1]];
  legs.forEach(([lx, lz, bend], i) => {
    const lifted = i === 1;
    at(new THREE.CylinderGeometry(0.13, 0.1, lifted ? 1.0 : 1.5, 8), lx + (lifted ? 0.3 : 0), lifted ? 1.25 : 0.75, lz, bend);
  });
  at(new THREE.CapsuleGeometry(0.3, 0.7, 4, 10), -0.1, 2.9, 0);
  at(new THREE.SphereGeometry(0.2, 10, 8), -0.1, 3.75, 0);
  at(new THREE.CapsuleGeometry(0.08, 0.7, 4, 6).rotateZ(Math.PI / 2), 0.4, 3.2, 0.32, 0.5);
  for (const s of [-1, 1]) at(new THREE.CapsuleGeometry(0.11, 0.8, 4, 6), 0.05, 2.1, s * 0.5, 0.25);
}

function buildPorticoes(B, M, columns) {
  const L = LAYOUT;
  const S = L.stylobate;
  const { frontXs, midXs, seZs } = porticoColumnSites();
  const top = S + L.column.H;
  const eave = top + L.E;

  B.span(M.travertinePave, L.x0, L.plazaX1, -0.4, 0, -L.plazaZ, L.plazaZ);
  for (const s of [-1, 1]) {
    B.span(M.travertinePave, L.x0, L.x1, -0.4, S, s * L.plazaZ, s * L.wallZ);
    stairs(B, M.marble, { x: 0, z: s * (L.plazaZ - 0.8), dx: 0, dz: s, width: L.x1 - L.x0, count: 2, rise: 0.3, run: 0.4, y0: 0 });
    for (const x of frontXs) columns.portico.push(place(x, S, s * L.frontZ));
    for (const x of midXs) columns.portico.push(place(x, S, s * L.midZ));
    const zf = s * L.frontZ;
    entablature(B, M, { x0: -78.6, x1: L.seFrontX + 0.5, z0: zf - 0.5, z1: zf + 0.5, y: top, E: L.E });
    B.span(M.marble, -78.6, L.seMidX + 0.4, top, eave, s * L.midZ - 0.4, s * L.midZ + 0.4);
    B.span(M.timber, L.x0, L.x1, eave - 0.05, eave + 0.12, s * (L.frontZ - 0.5), s * L.wallZ);
    gableRoof(B, M.roofTile, { a0: L.x0, a1: L.x1, b0: Math.min(s * (L.frontZ - 1.3), s * L.wallZ), b1: Math.max(s * (L.frontZ - 1.3), s * L.wallZ), y: eave + 0.1, rise: 2.2, overhang: 0.1, ridge: s * L.midZ });
  }
  B.span(M.travertinePave, L.plazaX1, L.x1, -0.4, S, -L.plazaZ, L.plazaZ);
  stairs(B, M.marble, { x: L.plazaX1 - 0.8, z: 0, dx: 1, dz: 0, width: L.plazaZ * 2, count: 2, rise: 0.3, run: 0.4, y0: 0 });
  for (const z of seZs.slice(1, -1)) columns.portico.push(place(L.seFrontX, S, z));
  for (const z of seZs.slice(1, -1)) columns.portico.push(place(L.seMidX, S, z));
  entablature(B, M, { x0: L.seFrontX - 0.5, x1: L.seFrontX + 0.5, z0: -L.frontZ - 0.5, z1: L.frontZ + 0.5, y: top, E: L.E });
  B.span(M.marble, L.seMidX - 0.4, L.seMidX + 0.4, top, eave, -L.midZ, L.midZ);
  B.span(M.timber, L.seFrontX - 0.5, L.x1, eave - 0.05, eave + 0.12, -L.wallZ, L.wallZ);
  gableRoof(B, M.roofTile, { a0: -L.wallZ, a1: L.wallZ, b0: L.seFrontX - 1.3, b1: L.x1, y: eave + 0.1, rise: 2.2, overhang: 0.1, ridge: L.seMidX, axis: 'z' });
}

export function tabernaeBays() {
  const L = LAYOUT;
  const width = (L.x1 - L.x0) / L.bays;
  return Array.from({ length: L.bays }, (_, i) => ({ index: i, x0: L.x0 + i * width, center: L.x0 + (i + 0.5) * width, width }));
}

function buildTabernae(B, M) {
  const L = LAYOUT;
  const S = L.stylobate;
  const bays = tabernaeBays();
  const length = L.x1 - L.x0;
  const lower = 10.2;
  const upper = 6.6;
  const zFront = -L.wallZ;
  const zBack = -L.wallZ - L.tabernaeDepth;

  const lowerOpenings = [];
  const upperOpenings = [];
  for (const bay of bays) {
    const x = bay.center - L.x0;
    lowerOpenings.push({ x, y: 0, w: 3.4, h: 4.8 });
    lowerOpenings.push({ x, y: 5.7, w: 3.0, h: 0.4, arch: true });
    upperOpenings.push({ x, y: 2.5, w: 1.9, h: 1.5, arch: true });
  }
  B.add(wallGeometry(length, lower, 0.9, lowerOpenings), M.plasterCream, wallMatrix(L.x0, S, zFront - 0.9));
  for (const bay of bays) {
    const pier = (bay.width - 3.4) / 2;
    B.span(M.plasterRed, bay.x0, bay.x0 + pier, S, S + 1.9, zFront - 0.02, zFront + 0.03);
    B.span(M.plasterRed, bay.x0 + bay.width - pier, bay.x0 + bay.width, S, S + 1.9, zFront - 0.02, zFront + 0.03);
  }
  B.add(wallGeometry(length, upper, 0.8, upperOpenings), M.plasterCream, wallMatrix(L.x0, S + lower, zFront - 0.85));
  for (const bay of bays) {
    B.span(M.travertine, bay.center - 2.0, bay.center + 2.0, S + 4.8, S + 5.4, zFront - 0.95, zFront + 0.06);
  }
  B.span(M.travertine, L.x0, L.x1, S + lower - 0.15, S + lower + 0.3, zFront - 0.95, zFront + 0.12);

  const topY = S + lower + upper;
  B.span(M.tufa, L.x0 - 1.2, L.x1 + 1.2, 0, topY, zBack - 0.8, zBack);
  for (let i = 0; i <= bays.length; i++) {
    const x = L.x0 + i * bays[0].width;
    B.span(M.interior, x - 0.3, x + 0.3, 0, topY, zBack, zFront - 0.92);
  }
  for (const y of [S + 5.5, S + lower, topY - 0.3]) B.span(M.interior, L.x0, L.x1, y, y + 0.3, zBack, zFront - 0.92);
  B.span(M.interior, L.x0, L.x1, S, topY, zBack, zBack + 0.1);
  B.span(M.dirt, L.x0, L.x1, 0, S, zBack, zFront - 0.5);
  B.span(M.travertine, L.x0 - 0.2, L.x1 + 0.2, topY, topY + 0.45, zFront - 1.1, zFront + 0.25);
  const attic = zFront - 0.3 - (zBack - 0.6);
  B.add(gablePrism(attic, 1.7, length + 2).rotateY(Math.PI / 2), M.plasterCream, new THREE.Matrix4().setPosition(0, topY + 0.3, (zBack - 0.6 + zFront - 0.3) / 2));
  gableRoof(B, M.roofTile, { a0: L.x0 - 1, a1: L.x1 + 1, b0: zBack - 0.6, b1: zFront - 0.3, y: topY + 0.5, rise: 1.7, overhang: 0.45 });
}

function buildEnclosure(B, M) {
  const L = LAYOUT;
  const S = L.stylobate;
  B.span(M.tufa, L.x0, L.x1 + 1.2, 0, 14.6, L.wallZ, L.wallZ + 1.2);
  B.span(M.plasterCream, L.x0, L.x1, S, 11, L.wallZ - 0.06, L.wallZ);
  B.span(M.plasterRed, L.x0, L.x1, S, S + 1.9, L.wallZ - 0.09, L.wallZ);
  B.span(M.plasterCream, L.x1 - 0.06, L.x1, 6.9, 11, -L.wallZ, L.wallZ);
  B.span(M.plasterCream, L.x0, L.x0 + 0.06, S, 11, -L.wallZ, -L.plazaZ);
  B.span(M.plasterCream, L.x0, L.x0 + 0.06, S, 11, L.plazaZ, L.wallZ);
  B.span(M.travertine, L.x0 - 0.2, L.x1 + 1.4, 14.6, 15.0, L.wallZ - 0.15, L.wallZ + 1.4);
  for (let i = 0; i < 20; i++) {
    const x = L.x0 + 4 + i * 8;
    B.span(M.tufa, x - 0.6, x + 0.6, 0, 14.6, L.wallZ + 1.2, L.wallZ + 1.7);
  }

  const seDoors = [-8, 6, 20].map((z) => ({ x: z + L.wallZ + L.tabernaeDepth, y: 0, w: 3.4, h: 5.6, arch: true }));
  const seLength = L.wallZ * 2 + L.tabernaeDepth + 1.2;
  B.add(wallGeometry(seLength, 13.8 - S, 1.2, seDoors), M.tufa, wallMatrix(L.x1 + 1.2, S, -L.wallZ - L.tabernaeDepth, 'z'));
  B.span(M.tufa, L.x1, L.x1 + 1.2, 0, S, -L.wallZ - L.tabernaeDepth, L.wallZ + 1.2);
  B.span(M.travertine, L.x1 - 0.15, L.x1 + 1.35, 13.8, 14.2, -L.wallZ - L.tabernaeDepth, L.wallZ + 1.2);

  B.span(M.tufa, L.x0 - 1.2, L.x0, 0, 13.8, -L.wallZ - L.tabernaeDepth, -4.4);
  B.span(M.tufa, L.x0 - 1.2, L.x0, 0, 13.8, 4.4, L.wallZ + 1.2);
  B.span(M.travertine, L.x0 - 1.35, L.x0 + 0.15, 13.8, 14.2, -L.wallZ - L.tabernaeDepth, -4.4);
  B.span(M.travertine, L.x0 - 1.35, L.x0 + 0.15, 13.8, 14.2, 4.4, L.wallZ + 1.2);
}

export function buildCuria(B, M, { ruin }) {
  const wall = ruin ? M.brickOld : M.plasterCream;
  const trim = ruin ? M.brickOld : M.marble;
  const w = 25.6;
  const d = 17.7;
  const h = 21;
  B.push(place(81.6, 0, -37.2));
  const windows = [-4.6, 0, 4.6].map((o) => ({ x: d / 2 + o, y: 12.2, w: 2.3, h: 2.6, arch: true }));
  B.add(wallGeometry(d, h, 1.1, [{ x: d / 2, y: 0, w: 3.6, h: 6.4 }, ...windows]), wall, wallMatrix(w, 0, 0, 'z'));
  B.add(wallGeometry(d, h, 1.1, [{ x: d / 2, y: 13, w: 2.3, h: 2.4, arch: true }]), wall, wallMatrix(1.1, 0, 0, 'z'));
  B.span(wall, 0, w, 0, h, 0, 1.1);
  B.span(wall, 0, w, 0, h, d - 1.1, d);
  B.span(M.dark, 1.1, w - 1.3, 0, h - 0.5, 1.1, d - 1.1);
  B.span(M.bronze, w - 1.0, w - 0.8, 0, 6.4, d / 2 - 1.8, d / 2 + 1.8);
  for (const [x, z] of [[0, 0], [w, 0], [0, d], [w, d]]) B.span(wall, x - 1.0, x + 1.0, 0, h, z - 1.0, z + 1.0);
  if (!ruin) {
    B.span(M.marbleAshlar, -0.08, w + 0.08, 0, 7, -0.08, 1.1);
    B.span(M.marbleAshlar, -0.08, w + 0.08, 0, 7, d - 1.1, d + 0.08);
    B.span(M.marbleAshlar, w - 0.02, w + 0.08, 0, 7, 0, d / 2 - 2.4);
    B.span(M.marbleAshlar, w - 0.02, w + 0.08, 0, 7, d / 2 + 2.4, d);
    B.span(M.marble, w - 0.3, w + 0.2, 6.4, 7.1, d / 2 - 2.4, d / 2 + 2.4);
  }
  B.span(trim, -1.2, w + 1.2, h, h + 0.6, -1.2, d + 1.2);
  const rise = 3.6;
  B.add(gablePrism(d + 1.6, rise, w + 1.6).rotateY(Math.PI / 2), wall, new THREE.Matrix4().setPosition(w / 2, h + 0.6, d / 2));
  gableRoof(B, ruin ? M.roofTileOld : M.roofTile, { a0: -0.8, a1: w + 0.8, b0: -0.8, b1: d + 0.8, y: h + 0.75, rise, overhang: 0.7 });
  B.pop();
}

function buildCapitoline(B, M, rng, columns) {
  B.span(M.tufa, -150, 84, 0, 11.8, -78, -47.3);
  B.span(M.basalt, -150, 84, 11.8, 12, -54, -47.3);
  B.span(M.cityGround, -150, 84, 11.8, 12, -78, -54);
  B.span(M.tufa, -150, 100, 0, 20.8, -128, -78);
  B.span(M.cityGround, -150, 100, 20.8, 21, -128, -78);
  B.span(M.tufa, -150, 100, 0, 32.8, -240, -128);
  B.span(M.cityGround, -150, 100, 32.8, 33, -240, -128);

  const styles = M.facades.ancient;
  const pick = () => styles[Math.floor(rng() * styles.length)];
  let x = -144;
  while (x < 66) {
    const bays = 5 + Math.floor(rng() * 4);
    cityBlock(B, M, { x: x + bays * 1.5, z: -66, y: 12, bays, depthBays: 5, floors: 3 + Math.floor(rng() * 3), style: pick() });
    x += bays * 3 + 3;
  }
  x = -142;
  while (x < 76) {
    const bays = 6 + Math.floor(rng() * 5);
    const depthBays = 6 + Math.floor(rng() * 4);
    cityBlock(B, M, { x: x + bays * 1.5, z: -100, y: 21, bays, depthBays, floors: 3 + Math.floor(rng() * 3), style: pick() });
    x += bays * 3 + 6;
  }
  for (let i = 0; i < 14; i++) cypress(B, M, -140 + i * 17 + rng() * 6, 21, -124 + rng() * 2, 10 + rng() * 4, rng);

  // Temple of Juno Moneta on the Arx, shown as a simple hexastyle temple.
  B.push(place(-60, 33, -170));
  B.span(M.marbleAshlar, -10, 10, 0, 3, -17, 17);
  stairs(B, M.marble, { x: 0, z: 21.5, dx: 0, dz: -1, width: 16, count: 10, rise: 0.3, run: 0.45, y0: 0 });
  B.span(M.marbleAshlar, -7, 7, 3, 13, -16, 6);
  for (let i = 0; i < 6; i++) columns.small.push(B.transform.clone().multiply(place(-8.5 + i * 3.4, 3, 15.5, 0, 1.2)));
  for (let k = 1; k <= 7; k++) {
    for (const s of [-1, 1]) columns.small.push(B.transform.clone().multiply(place(s * 8.5, 3, 15.5 - k * 4.2, 0, 1.2)));
  }
  entablature(B, M, { x0: -9.1, x1: 9.1, z0: -16.5, z1: 16.1, y: 3 + 8.2 * 1.2, E: 2.2 });
  const eave = 3 + 8.2 * 1.2 + 2.2;
  for (const z of [15.6, -16.4]) B.add(gablePrism(18.2, 3.7, 0.6), M.marble, new THREE.Matrix4().setPosition(0, eave, z));
  gableRoof(B, M.roofTile, { a0: -17, a1: 16.6, b0: -10.1, b1: 10.1, y: eave, rise: 4.1, axis: 'z', overhang: 0.6 });
  B.pop();
  for (let i = 0; i < 16; i++) {
    const px = -140 + rng() * 230;
    const pz = -136 - rng() * 95;
    if (Math.abs(px + 60) < 16 && Math.abs(pz + 168) < 28) continue;
    stonePine(B, M, px, 33, pz, 14 + rng() * 5, rng);
  }
}

function buildForumOfAugustus(B, M, columns) {
  // Context only: the Temple of Mars Ultor precinct beyond the north-east wall.
  B.span(M.travertinePave, -66, 26, -0.3, 0.02, 40.5, 176);
  B.span(M.tufa, -70, -66, 0, 24, 40.5, 180);
  B.span(M.tufa, 26, 30, 0, 24, 40.5, 180);
  B.span(M.tufa, -70, 30, 0, 33, 176, 181);
  B.push(place(-20, 0, 132, Math.PI / 2, 1.3));
  B.span(M.marbleAshlar, -30, 0, 0, 3.6, -11.5, 11.5);
  stairs(B, M.marble, { x: 5.4, z: 0, dx: -1, dz: 0, width: 17, count: 12, rise: 0.3, run: 0.45, y0: 0 });
  B.span(M.marbleAshlar, -28.6, -8.6, 3.6, 16.1, -7.6, 7.6);
  const sites = templeColumnSites();
  for (const site of sites) columns.temple.push(B.transform.clone().multiply(place(site.x, 3.6, site.z)));
  entablature(B, M, { x0: -28.6, x1: -0.22, z0: -11.18, z1: 11.18, y: 16.1, E: 2.9, dentils: false });
  B.add(gablePrism(22.4, 4.5, 0.6).rotateY(Math.PI / 2), M.marble, new THREE.Matrix4().setPosition(-0.9, 19, 0));
  gableRoof(B, M.roofTile, { a0: -29.5, a1: 0.6, b0: -12.5, b1: 12.5, y: 19, rise: 5, overhang: 0.3 });
  B.pop();
  for (const s of [-1, 1]) {
    const x = -20 + s * 38;
    B.span(M.travertinePave, x - 7, x + 7, 0, 0.6, 44, 150);
    for (let i = 0; i < 26; i++) columns.portico.push(place(x - s * 6, 0.6, 46 + i * 4));
    B.span(M.marble, x - s * 6 - 0.5, x - s * 6 + 0.5, 8.8, 10.6, 44, 150);
    roofSlab(B, M.roofTile, { a0: 44, a1: 150, low: x - s * 7, high: x + s * 8, yLow: 10.6, yHigh: 14, axis: 'z' });
  }
}

function buildCity(B, M, rng) {
  const walls = [M.plasterOchre, M.plasterCream, M.plasterPink, M.plaster, M.plasterOchre];
  const blocked = (x, z, r) => {
    if (x > -152 - r && x < 102 + r && z > -242 - r && z < -46 + r) return true;
    if (x > -84 - r && x < 110 + r && z > -50 - r && z < 42 + r) return true;
    if (x > -72 - r && x < 32 + r && z > 38 - r && z < 183 + r) return true;
    if (x > 30 - r && x < 172 + r && z > -45 - r && z < 96 + r) return true;
    return false;
  };
  cityGrid(B, M, rng, { cell: 30, extent: 780, y: 0, styles: M.facades.ancient, floors: [2, 5], blocked, street: [3, 6] });
  // Forum Transitorium wall and the Basilica Aemilia side, as plain context masses.
  B.span(M.tufa, 34, 150, 0, 18, 44, 46);
  B.span(M.tufa, 34, 150, 0, 18, 88, 90);
  blockBuilding(B, M, { x: 150, y: 0, z: -2, w: 30, d: 70, h: 16, wall: M.plasterCream, base: M.marbleAshlar });
}

export function buildAncient(M) {
  const group = new THREE.Group();
  const B = new Builder();
  const rng = makeRng(42);
  const columns = { portico: [], temple: [], small: [] };

  B.span(M.cityGround, -2000, 2000, -1, -0.05, -2000, 2000);
  for (const [x0, x1, z0, z1] of [[-2000, 2000, 815, 2000], [-2000, 2000, -2000, -815], [-2000, -815, -815, 815], [815, 2000, -815, 815]]) {
    B.span(M.grass, x0, x1, -0.05, -0.02, z0, z1);
  }
  buildPorticoes(B, M, columns);
  buildTabernae(B, M);
  buildEnclosure(B, M);
  buildTemple(B, M, columns);
  equestrianStatue(B, M, -8, 0);
  buildCuria(B, M, { ruin: false });
  buildCapitoline(B, M, rng, columns);
  buildForumOfAugustus(B, M, columns);
  buildCity(B, M, rng);
  B.build(group);

  const L = LAYOUT;
  const portico = columnParts(L.column.R, L.column.H, false, 1.5);
  group.add(instanced(portico.shaft, M.granite, columns.portico));
  group.add(instanced(portico.base, M.marble, columns.portico));
  group.add(instanced(portico.capital, M.marbleDouble, columns.portico));
  group.add(instanced(portico.shaft, M.marble, columns.small));
  group.add(instanced(portico.base, M.marble, columns.small));
  group.add(instanced(portico.capital, M.marbleDouble, columns.small));
  const temple = columnParts(L.temple.R, L.temple.H, true);
  group.add(instanced(temple.shaft, M.marble, columns.temple));
  group.add(instanced(temple.base, M.marble, columns.temple));
  group.add(instanced(temple.capital, M.marbleDouble, columns.temple));
  return group;
}
