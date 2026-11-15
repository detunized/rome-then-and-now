import * as THREE from 'three';
import { makeRng } from './textures.js';
import {
  Builder, place, instanced, columnParts, brokenShaft, wallGeometry, wallMatrix, raggedProfile, roofSlab,
  gableRoof, entablature, stonePine, cypress, cityGrid, cityBlock, robedFigure,
} from './parts.js';
import { LAYOUT, porticoColumnSites, tabernaeBays, buildCuria } from './ancient.js';

const STREET = 6;
const CLIVUS = 11;
const PLATEAU = 24;
// Excavated area, counter-clockwise in (x, z). The north-east edge follows Via dei Fori Imperiali.
const PIT = [[-84, -47], [125, -47], [125, -17], [70, -17], [70, 12], [-84, 30]];
const ROAD = (() => {
  const [ax, az] = PIT[4];
  const [bx, bz] = PIT[5];
  const length = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / length;
  const dz = (bz - az) / length;
  return { cx: (ax + bx) / 2, cz: (az + bz) / 2, dx, dz, nx: dz, nz: -dx, rot: Math.atan2(-dz, dx) };
})();

function alongRoad(t, offset) {
  return [ROAD.cx + ROAD.dx * t + ROAD.nx * offset, ROAD.cz + ROAD.dz * t + ROAD.nz * offset];
}

function buildGround(R, M, N, MM) {
  const far = 2000;
  const shape = new THREE.Shape();
  shape.moveTo(-far, -far);
  shape.lineTo(far, -far);
  shape.lineTo(far, far);
  shape.lineTo(-far, far);
  shape.closePath();
  const hole = new THREE.Path();
  PIT.forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
  hole.closePath();
  shape.holes.push(hole);
  N.add(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), MM.cobble, new THREE.Matrix4().setPosition(0, STREET, 0));
  countryside(N, MM, STREET + 0.02);

  R.span(M.grass, -84, 125, -1, 0, -47, 31);
  R.span(M.dirt, -84, 70, 0, 0.05, -47, -37.2);
  R.span(M.dirt, 70, 125, 0, 0.04, -47, -17);

  for (let i = 1; i < PIT.length; i++) {
    const [ax, az] = PIT[i];
    const [bx, bz] = PIT[(i + 1) % PIT.length];
    const length = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / length;
    const dz = (bz - az) / length;
    const rot = Math.atan2(-dz, dx);
    const cx = (ax + bx) / 2 + dz * 0.4;
    const cz = (az + bz) / 2 - dx * 0.4;
    N.box(MM.brick, cx, -0.5, cz, length + 0.8, STREET + 1.4, 0.8, rot);
    N.box(MM.travertine, cx, STREET + 0.9, cz, length + 1, 0.16, 1.0, rot);
  }
}

// Green land around the city, so the hazy distance reads as countryside.
export function countryside(B, M, top) {
  const edge = 815;
  const far = 2000;
  B.span(M.grass, -far, far, top - 0.02, top, edge, far);
  B.span(M.grass, -far, far, top - 0.02, top, -far, -edge);
  B.span(M.grass, -far, -edge, top - 0.02, top, -edge, edge);
  B.span(M.grass, edge, far, top - 0.02, top, -edge, edge);
}

function buildRoad(B, M, rng) {
  const strip = (material, from, to, y, height, length = 1900) => {
    const [x, z] = alongRoad(0, (from + to) / 2);
    B.box(material, x, y, z, length, height, to - from, ROAD.rot);
  };
  strip(M.travertinePave, 0.8, 9, STREET, 0.16);
  strip(M.asphalt, 9, 31, STREET, 0.04);
  strip(M.travertinePave, 31, 39, STREET, 0.16);
  strip(M.grass, 39, 84, STREET, 0.12, 420);
  for (let t = -940; t < 940; t += 9) {
    const [x, z] = alongRoad(t, 20);
    B.box(M.paint, x, STREET + 0.04, z, 3.2, 0.012, 0.16, ROAD.rot);
  }
  for (const offset of [9.3, 30.7]) {
    const [x, z] = alongRoad(0, offset);
    B.box(M.paint, x, STREET + 0.04, z, 1880, 0.012, 0.14, ROAD.rot);
  }
  for (let t = -600; t <= 600; t += 30) {
    for (const offset of [8.2, 31.8]) {
      const [x, z] = alongRoad(t + (offset > 20 ? 15 : 0), offset);
      B.add(new THREE.CylinderGeometry(0.07, 0.11, 8.5, 8).translate(0, 4.25, 0), M.iron, place(x, STREET, z), { keepUV: true });
      B.add(new THREE.SphereGeometry(0.32, 10, 8), M.paint, place(x, STREET + 8.7, z), { keepUV: true });
    }
  }
  for (let t = -280; t <= 280; t += 17) {
    const [x, z] = alongRoad(t + rng() * 5, 35.5 + rng() * 1.5);
    stonePine(B, M, x, STREET, z, 15 + rng() * 5, rng);
  }
  for (const t of [-640, -590, -520, -470, -400, -350, 340, 390, 450, 510, 570, 630]) {
    const [x, z] = alongRoad(t, 35.5);
    stonePine(B, M, x, STREET, z, 15 + rng() * 4, rng);
  }
  for (let i = 0; i < 26; i++) {
    const [x, z] = alongRoad(-190 + rng() * 380, 44 + rng() * 36);
    if (rng() < 0.6) stonePine(B, M, x, STREET, z, 13 + rng() * 6, rng);
    else cypress(B, M, x, STREET, z, 9 + rng() * 5, rng);
  }
  for (const t of [-64, -22, 34]) {
    const [x, z] = alongRoad(t, 4.6);
    stonePine(B, M, x, STREET, z, 14 + rng() * 4, rng);
  }
}

function buildHill(B, M, N, MM, rng) {
  B.span(M.tufaOld, -150, 140, 0, CLIVUS - 0.2, -60, -47);
  B.span(M.basalt, -150, 140, CLIVUS - 0.2, CLIVUS, -54, -47.5);
  B.span(M.brickOld, -150, 140, CLIVUS - 0.2, CLIVUS + 1, -47.5, -47);
  B.span(M.travertine, -150, 140, CLIVUS + 1, CLIVUS + 1.12, -47.6, -46.9);
  B.span(M.tufaOld, -150, 140, 0, 15, -78, -60);
  B.span(M.tufaOld, -150, 140, 0, 19.4, -90, -78);
  roofSlab(B, M.grass, { a0: -150, a1: 140, low: -54, high: -90.5, yLow: CLIVUS - 0.25, yHigh: PLATEAU - 0.05, thick: 0.5 });
  B.span(M.tufaOld, -260, 140, 0, PLATEAU - 0.2, -300, -90);
  B.span(M.cobble, -260, 140, PLATEAU - 0.2, PLATEAU, -300, -90);
  B.span(M.tufaOld, -260, -150, 0, PLATEAU - 0.2, -90, -40);
  B.span(M.cobble, -260, -150, PLATEAU - 0.2, PLATEAU, -90, -40);

  for (let i = 0; i < 22; i++) {
    const x = -140 + rng() * 270;
    const z = -57 - rng() * 30;
    if (x > -76 && x < 6 && z < -58) continue;
    const y = CLIVUS + ((-54 - z) / 36.5) * (PLATEAU - CLIVUS);
    if (rng() < 0.55) stonePine(N, MM, x, y, z, 11 + rng() * 6, rng);
    else cypress(N, MM, x, y, z, 8 + rng() * 5, rng);
  }

  // Brick palazzo with arcaded windows that sits above the tabernae.
  const x0 = -74;
  const length = 78;
  const openings = [];
  for (let i = 0; i < 13; i++) {
    const x = 3 + i * 6;
    openings.push({ x, y: 3.2, w: 2.2, h: 2.4, arch: true });
    openings.push({ x, y: 10.4, w: 2.6, h: 3.0, arch: true });
  }
  N.add(wallGeometry(length, 18, 0.6, openings), MM.brick, wallMatrix(x0, CLIVUS, -60.6));
  N.span(MM.dark, x0 + 0.2, x0 + length - 0.2, CLIVUS, CLIVUS + 17.5, -60.9, -60.62);
  N.span(MM.brick, x0, x0 + length, CLIVUS, CLIVUS + 18, -80, -60.9);
  N.span(MM.travertine, x0 - 0.3, x0 + length + 0.3, CLIVUS + 18, CLIVUS + 18.6, -80.3, -59.7);
  N.span(MM.travertine, x0 - 0.1, x0 + length + 0.1, CLIVUS + 8.6, CLIVUS + 9, -60.7, -59.85);
  gableRoof(N, MM.roofTile, { a0: x0, a1: x0 + length, b0: -80, b1: -60, y: CLIVUS + 18.6, rise: 2.4, overhang: 0.5 });

  const styles = MM.facades.modern;
  cityBlock(N, MM, { x: 60, y: PLATEAU, z: -114, bays: 15, depthBays: 9, floors: 5, style: styles[0] });
  cityBlock(N, MM, { x: 114, y: PLATEAU, z: -120, bays: 10, depthBays: 11, floors: 4, style: styles[1] });
  cityBlock(N, MM, { x: -30, y: PLATEAU, z: -132, bays: 23, depthBays: 10, floors: 5, style: styles[2] });
  cityBlock(N, MM, { x: 20, y: PLATEAU, z: -200, bays: 30, depthBays: 14, floors: 6, style: styles[4] });
  cityBlock(N, MM, { x: -90, y: PLATEAU, z: -230, bays: 20, depthBays: 12, floors: 5, style: styles[3] });
  for (let i = 0; i < 9; i++) stonePine(N, MM, -120 + rng() * 240, PLATEAU, -100 - rng() * 12, 13 + rng() * 5, rng);
}

function buildVittoriano(B, M) {
  const y = PLATEAU;
  const stone = M.whiteStone;
  B.span(stone, -196, -164, y, y + 40, -196, -84);
  B.span(stone, -197, -163, y + 40, y + 42, -197, -83);
  for (let i = 0; i < 15; i++) {
    const z = -190 + i * 7.1;
    B.span(stone, -164, -163.2, y + 4, y + 40, z - 0.9, z + 0.9);
  }
  B.span(stone, -164, -128, y, y + 24, -192, -88);
  for (let i = 0; i < 12; i++) {
    for (let level = 0; level < 3; level++) {
      const z = -186 + i * 8.4;
      B.span(M.dark, -128.1, -127.9, y + 4 + level * 6.5, y + 8 + level * 6.5, z - 1.2, z + 1.2);
      B.span(stone, -128.2, -127.7, y + 8 + level * 6.5, y + 8.5 + level * 6.5, z - 1.7, z + 1.7);
    }
  }
  for (let i = 0; i < 4; i++) {
    for (let level = 0; level < 3; level++) {
      const x = -159 + i * 8.6;
      B.span(M.dark, x - 1.2, x + 1.2, y + 4 + level * 6.5, y + 8 + level * 6.5, -88.1, -87.9);
    }
  }
  B.span(stone, -165, -127, y + 24.5, y + 25.7, -193, -87);
  B.span(stone, -192, -168, y + 42, y + 46, -192, -88);

  for (const zc of [-74, -206]) {
    B.span(stone, -193, -167, y, y + 44, zc - 13, zc + 13);
    B.span(stone, -194, -166, y + 43, y + 45, zc - 14, zc + 14);
    B.span(M.dark, -188, -172, y + 45, y + 60, zc - 8, zc + 8);
    for (const [cx, cz] of [[-191, zc - 11], [-169, zc - 11], [-191, zc + 11], [-169, zc + 11]]) {
      B.span(stone, cx - 2, cx + 2, y + 45, y + 60, cz - 2, cz + 2);
    }
    for (let i = 0; i < 4; i++) {
      const o = -6.6 + i * 4.4;
      const column = new THREE.CylinderGeometry(0.95, 1.1, 15, 16).translate(0, 7.5, 0);
      for (const [cx, cz] of [[-180 + o, zc - 11.4], [-180 + o, zc + 11.4], [-168.6, zc + o], [-191.4, zc + o]]) {
        B.add(column, stone, place(cx, y + 45, cz));
      }
    }
    B.span(stone, -194.5, -165.5, y + 60, y + 64, zc - 14.5, zc + 14.5);
    B.span(stone, -195.5, -164.5, y + 63.2, y + 64.4, zc - 15.5, zc + 15.5);
    B.span(stone, -191, -169, y + 64.4, y + 68.5, zc - 11, zc + 11);
    B.span(stone, -186, -174, y + 68.5, y + 70.5, zc - 6, zc + 6);
    const bronze = M.bronzeGreen;
    for (let i = 0; i < 4; i++) {
      const hz = zc - 3.6 + i * 2.4;
      B.add(new THREE.CapsuleGeometry(0.75, 2.4, 4, 10).rotateZ(Math.PI / 2), bronze, place(-177, y + 73, hz), { keepUV: true });
      B.add(new THREE.CapsuleGeometry(0.4, 1.4, 4, 8), bronze, new THREE.Matrix4().makeRotationZ(-0.6).setPosition(-175, y + 74.3, hz), { keepUV: true });
      for (const lx of [-178.4, -175.8]) B.add(new THREE.CylinderGeometry(0.18, 0.14, 2.2, 6), bronze, place(lx, y + 71.6, hz), { keepUV: true });
    }
    B.add(new THREE.CylinderGeometry(0.5, 1.1, 5.5, 10), bronze, place(-182, y + 73.6, zc), { keepUV: true });
    B.add(new THREE.SphereGeometry(0.6, 10, 8), bronze, place(-182, y + 76.9, zc), { keepUV: true });
    for (const s of [-1, 1]) {
      const wing = new THREE.BoxGeometry(0.25, 4.6, 1.6);
      B.add(wing, bronze, new THREE.Matrix4().makeRotationX(s * 0.75).setPosition(-182.6, y + 77.2, zc + s * 2.1), { keepUV: true });
    }
  }
}

function buildChurch(B, M) {
  // Santi Luca e Martina, heavily simplified: Greek cross, drum and dome.
  const wall = M.travertine;
  B.push(place(89, STREET, -4));
  B.span(wall, -14, 14, 0, 17, -6.5, 6.5);
  B.span(wall, -7, 7, 0, 17, -11, 11);
  B.span(M.travertineOld, -14.4, 14.4, 16.4, 17.4, -6.9, 6.9);
  B.span(M.travertineOld, -7.4, 7.4, 16.4, 17.4, -11.4, 11.4);
  B.span(wall, -9.5, 9.5, 17.4, 22.5, -9.5, 9.5);
  B.span(M.travertineOld, -10, 10, 22.5, 23.3, -10, 10);
  gableRoof(B, M.roofTile, { a0: -14, a1: 14, b0: -6.5, b1: 6.5, y: 17.5, rise: 2.2, overhang: 0.3 });
  gableRoof(B, M.roofTile, { a0: -11, a1: 11, b0: -7, b1: 7, y: 17.5, rise: 2.2, overhang: 0.3, axis: 'z' });
  for (const s of [-1, 1]) {
    for (const [px, pz, sx, sz] of [[s * 14.05, 0, 0.3, 3], [0, s * 11.05, 3, 0.3]]) {
      B.box(M.dark, px, 2, pz, sx, 5.5, sz);
      B.box(M.dark, px, 10.5, pz, sx * 0.8 + 0.06, 3.4, sz * 0.8 + 0.06);
    }
    for (const o of [-4.2, 4.2]) {
      B.box(M.travertineOld, s * 14.2, 0, o, 0.5, 16.4, 1.0);
      B.box(M.travertineOld, o, 0, s * 11.2, 1.0, 16.4, 0.5);
    }
  }
  B.add(new THREE.CylinderGeometry(6.4, 6.4, 8.5, 32), wall, place(0, 23.3 + 4.25, 0));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 6.45;
    if (i % 2 === 0) B.box(M.dark, Math.cos(a) * r, 25.4, Math.sin(a) * r, 1.5, 4.2, 0.3, -a + Math.PI / 2);
    else B.box(M.travertineOld, Math.cos(a) * r, 23.3, Math.sin(a) * r, 0.9, 8.5, 0.5, -a + Math.PI / 2);
  }
  B.add(new THREE.CylinderGeometry(6.9, 6.9, 0.7, 32), M.travertineOld, place(0, 32.1, 0));
  B.add(new THREE.SphereGeometry(6.5, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.12, 1), M.lead, place(0, 32.4, 0), { keepUV: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rib = new THREE.TorusGeometry(6.55, 0.14, 5, 14, Math.PI / 2).scale(1, 1.12, 1);
    B.add(rib, M.lead, new THREE.Matrix4().makeRotationY(a).setPosition(0, 32.4, 0), { keepUV: true });
  }
  B.add(new THREE.CylinderGeometry(1.5, 1.7, 4.2, 12), wall, place(0, 39.3 + 2.1, 0));
  B.add(new THREE.SphereGeometry(1.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.lead, place(0, 43.5, 0), { keepUV: true });
  B.box(M.iron, 0, 45.2, 0, 0.12, 2.2, 0.12);
  B.box(M.iron, 0, 46.4, 0, 0.9, 0.12, 0.12);
  B.pop();
}

function buildTempleRuin(B, M, rng, columns) {
  const T = LAYOUT.temple;
  B.push(place(LAYOUT.templeX, 0, 0));
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 5; j++) {
      const x0 = -30.6 + i * 3.4;
      const z0 = -11.5 + j * 4.6;
      const edge = i === 0 || i === 8 || j === 0 || j === 4;
      const h = (edge ? 3.1 : 3.9) + rng() * 1.2 - (i > 6 ? 0.9 : 0);
      B.span(M.rubble, x0, x0 + 3.4, 0, h, z0, z0 + 4.6);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x0 = rng() * 2;
    B.span(M.rubble, x0, x0 + 2.5 + rng() * 4, 0, 0.8 + rng() * 2, -9 + i * 3, -6 + i * 3);
  }
  for (let i = 0; i < 12; i++) {
    const x = -30 + i * 2.6;
    if (rng() < 0.6) B.span(M.marbleOld, x, x + 2.2, 0, 0.75, -12.0, -11.45);
    if (rng() < 0.45) B.span(M.marbleOld, x, x + 2.2, 0, 0.75, 11.45, 12.0);
  }

  // Three columns re-erected in the 1930s on a rebuilt strip of the podium.
  const xs = [3, 4, 5].map((k) => -0.8 - k * 3.03);
  B.span(M.brickOld, xs[2] - 1.6, xs[0] + 1.6, 0, T.podium, -11.6, -9.4);
  B.span(M.travertineOld, xs[2] - 1.7, xs[0] + 1.7, T.podium - 0.35, T.podium, -11.7, -9.3);
  for (const x of xs) columns.temple.push(B.transform.clone().multiply(place(x, T.podium, -10.6)));
  const old = { marble: M.marbleOld, frieze: M.marbleOld };
  entablature(B, old, { x0: xs[2] - 0.62, x1: xs[0] + 0.62, z0: -11.18, z1: -10.0, y: T.podium + T.H, E: 2.9 });

  const rear = raggedProfile(18, (x) => 5 + 3.5 * Math.sin((x / 18) * Math.PI), rng, 1.1);
  B.add(wallGeometry(18, 0, 1.3, [], rear), M.brickOld, wallMatrix(-27.3, 3.4, -9, 'z'));
  for (const s of [-1, 1]) {
    const side = raggedProfile(13, (x) => 4.5 - x * 0.3, rng, 1.2);
    B.add(wallGeometry(13, 0, 0.8, [], side), M.tufaOld, wallMatrix(-28.4, 3.6, s * 7.2 - 0.4));
  }
  B.pop();
}

function buildPorticoRuin(B, M, rng, columns) {
  const L = LAYOUT;
  const S = 0.55;
  const { frontXs } = porticoColumnSites();
  B.span(M.travertineOld, -72, 64, 0, S, -L.wallZ, -L.plazaZ);
  B.span(M.travertineOld, -60, 48, 0, 0.28, -L.plazaZ, -L.plazaZ + 0.5);
  let previous = null;
  let beamPlaced = false;
  const row = (z, from, to, standing, stumps) => {
    for (const x of frontXs) {
      if (x < from || x > to) continue;
      const r = rng();
      if (r < standing) {
        const withCapital = rng() < 0.55;
        columns.shaft.push(place(x, S, z, rng() * 6));
        if (withCapital) columns.capital.push(place(x, S, z));
        if (withCapital && previous && previous.z === z && Math.abs(previous.x - x) < 4.2 && !beamPlaced) {
          B.span(M.marbleOld, previous.x - 0.5, x + 0.5, S + L.column.H, S + L.column.H + 0.75, z - 0.42, z + 0.42);
          beamPlaced = true;
        }
        previous = withCapital ? { x, z } : null;
      } else {
        previous = null;
        if (r < standing + stumps) {
          B.add(brokenShaft(L.column.R, 0.5 + rng() * 3.2, rng), M.graniteOld, place(x, S + L.column.R, z));
          B.box(M.marbleOld, x, S, z, 1.13, 0.14, 1.13);
          B.add(new THREE.CylinderGeometry(0.5, 0.55, 0.28, 16), M.marbleOld, place(x, S + 0.28, z));
        }
      }
    }
  };
  row(-L.frontZ, -50, 36, 0.62, 0.25);
  row(-L.midZ, -42, 24, 0.3, 0.3);
  for (const x of [-70, -58.5, -47]) {
    B.add(brokenShaft(L.column.R, 0.6 + rng() * 1.6, rng), M.graniteOld, place(x, 0.3, L.frontZ - 1.5));
  }
}

function buildTabernaeRuin(B, M, rng) {
  const L = LAYOUT;
  const S = 0.5;
  const zFront = -L.wallZ;
  for (const bay of tabernaeBays()) {
    const i = bay.index;
    const w = bay.width;
    const envelope = Math.max(0, Math.sin((Math.PI * (i + 1)) / 27));
    const h = Math.max(2, 3 + 12 * envelope + (rng() - 0.5) * 5);
    const door = { x: w / 2, y: 0, w: 3.4, h: 4.8 };
    const lunette = { x: w / 2, y: 5.7, w: 3.0, h: 0.4, arch: true };
    const at = wallMatrix(bay.x0, S, zFront - 0.9);
    if (h >= 10.2) {
      B.add(wallGeometry(w, 10.2, 0.9, [door, lunette]), M.tufaOld, at);
      const extra = h - 10.2 + 0.6;
      const openings = extra > 5.6 ? [{ x: w / 2, y: 2.5, w: 1.9, h: 1.5, arch: true }] : [];
      const profile = raggedProfile(w, () => Math.max(extra, openings.length ? 5.7 : 0.6), rng);
      B.add(wallGeometry(w, 0, 0.8, openings, profile), M.brickOld, wallMatrix(bay.x0, S + 10.2, zFront - 0.85));
    } else if (h >= 8.6) {
      B.add(wallGeometry(w, 0, 0.9, [door, lunette], raggedProfile(w, () => h, rng)), M.tufaOld, at);
    } else if (h >= 5.6) {
      B.add(wallGeometry(w, 0, 0.9, [door], raggedProfile(w, () => Math.max(h, 5.7), rng)), M.tufaOld, at);
    } else {
      const pier = (w - 3.4) / 2;
      B.span(M.tufaOld, bay.x0, bay.x0 + pier, S, S + h * (0.6 + 0.4 * rng()), zFront - 0.9, zFront);
      B.span(M.tufaOld, bay.x0 + w - pier, bay.x0 + w, S, S + h * (0.6 + 0.4 * rng()), zFront - 0.9, zFront);
    }
    if (h >= 5.6) B.span(M.travertineOld, bay.center - 2.0, bay.center + 2.0, S + 4.8, S + 5.35, zFront - 0.95, zFront + 0.05);
    const depth = L.tabernaeDepth - 1.0;
    const cross = raggedProfile(depth, (t) => Math.max(1.5, (h + 1.5) * (1 - 0.35 * (t / depth))), rng, 1.1);
    B.add(wallGeometry(depth, 0, 0.6, [], cross), M.brickOld, wallMatrix(bay.x0 + 0.3, 0, zFront - L.tabernaeDepth + 0.05, 'z'));
  }

  // Remains of the Basilica Argentaria next to the temple.
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 2; j++) {
      const x = -79 + i * 5.1;
      const z = -27 - j * 6;
      const h = i === 2 && j === 0 ? 12.5 : 2.5 + rng() * 5.5;
      B.box(M.travertineOld, x, 0, z, 2.0, 0.9, 2.0);
      B.box(M.brickOld, x, 0.9, z, 1.5, h, 1.5);
    }
  }
}

function buildBoardwalk(B, M) {
  const deckY = 0.45;
  const paths = [
    [[69, -9], [52, -9], [36, -4], [18, -6], [2, 2], [-14, 0], [-30, 8], [-38, 17], [-56, 19]],
    [[2, 2], [8, 13], [24, 17]],
  ];
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / length;
      const dz = (bz - az) / length;
      const rot = Math.atan2(-dz, dx);
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      B.box(M.wood, cx, deckY, cz, length + 1.6, 0.12, 2.3, rot);
      B.box(M.iron, cx, 0, cz, length, deckY, 0.25, rot);
      for (const s of [-1, 1]) {
        const ox = -dz * 1.1 * s;
        const oz = dx * 1.1 * s;
        for (const y of [deckY + 0.55, deckY + 1.05]) B.box(M.rust, cx + ox, y, cz + oz, length + 1.2, 0.05, 0.05, rot);
        const posts = Math.max(2, Math.round(length / 2));
        for (let k = 0; k <= posts; k++) {
          const t = -length / 2 + (length * k) / posts;
          B.box(M.rust, cx + dx * t + ox, deckY, cz + dz * t + oz, 0.06, 1.08, 0.06, rot);
        }
      }
    }
  }
}

function buildVisitors(B, M, rng) {
  const person = (x, y, z) => {
    const cloth = M.cloth[2 + Math.floor(rng() * (M.cloth.length - 2))];
    robedFigure(B, cloth, M.skin, x, y, z, 1.6 + rng() * 0.25, rng() * Math.PI * 2);
  };
  for (const [ax, az, bx, bz] of [[69, -9, 52, -9], [52, -9, 36, -4], [36, -4, 18, -6], [18, -6, 2, 2], [2, 2, -14, 0], [-14, 0, -30, 8], [-30, 8, -38, 17], [-38, 17, -56, 19]]) {
    const count = 1 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const t = rng();
      person(ax + (bx - ax) * t + (rng() - 0.5) * 1.2, 0.57, az + (bz - az) * t + (rng() - 0.5) * 1.2);
    }
  }
  for (let i = 0; i < 40; i++) {
    const [x, z] = alongRoad(-170 + rng() * 340, rng() < 0.6 ? 2 + rng() * 6 : 32 + rng() * 6);
    person(x, STREET + 0.16, z);
  }
}

function buildFragments(B, M, rng, capital) {
  const stones = [M.marbleOld, M.marbleOld, M.travertineOld, M.tufaOld];
  const inPit = (x, z) => {
    const [nx, nz] = [ROAD.nx, ROAD.nz];
    return (x - ROAD.cx) * nx + (z - ROAD.cz) * nz < -2.5;
  };
  for (let i = 0; i < 190; i++) {
    let x;
    let z;
    if (i < 70) {
      const [px, pz] = alongRoad(-70 + rng() * 140, -3.5 - Math.floor(rng() * 3) * 2.2);
      x = px;
      z = pz;
    } else {
      x = -80 + rng() * 146;
      z = -23 + rng() * 44;
    }
    if (!inPit(x, z) || (x < -38 && Math.abs(z) < 13)) continue;
    const material = stones[Math.floor(rng() * stones.length)];
    const kind = rng();
    if (kind < 0.7) {
      B.box(material, x, 0, z, 0.5 + rng() * 1.4, 0.25 + rng() * 0.6, 0.4 + rng() * 0.6, rng() * Math.PI);
    } else if (kind < 0.93) {
      const radius = rng() < 0.3 ? 0.6 : 0.42;
      const length = 0.7 + rng() * 1.8;
      const lying = rng() < 0.7;
      const drum = new THREE.CylinderGeometry(radius, radius, length, 18);
      if (lying) drum.rotateZ(Math.PI / 2);
      B.add(drum, rng() < 0.5 ? M.graniteOld : M.marbleOld, place(x, lying ? radius : length / 2, z, rng() * Math.PI));
    } else {
      const g = capital.clone().translate(0, -(LAYOUT.column.H - 2.3 * LAYOUT.column.R), 0);
      B.add(g, M.marbleOldDouble, place(x, 0, z, rng() * Math.PI), { keepUV: true });
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = -78 + rng() * 144;
    const z = -22 + rng() * 40;
    if (!inPit(x, z) || (x < -38 && Math.abs(z) < 14)) continue;
    const patch = new THREE.CylinderGeometry(1, 1, 0.05, 14);
    const p = patch.attributes.position;
    const wobble = Array.from({ length: 14 }, () => 0.7 + rng() * 0.6);
    for (let k = 0; k < p.count; k++) {
      const a = Math.atan2(p.getZ(k), p.getX(k));
      const w = wobble[((Math.round((a / (Math.PI * 2)) * 14) % 14) + 14) % 14];
      p.setX(k, p.getX(k) * w);
      p.setZ(k, p.getZ(k) * w);
    }
    const r = 2 + rng() * 5;
    B.add(patch.scale(r, 1, r * (0.5 + rng() * 0.6)), M.dirt, place(x, 0.0, z, rng() * Math.PI));
  }
  for (let i = 0; i < 9; i++) {
    const x = -38 + rng() * 22;
    const z = -9 + rng() * 18;
    B.box(M.travertineOld, x, 0, z, 2 + rng() * 4, 0.08, 1.5 + rng() * 3, rng() * 0.2);
  }
}

function buildCity(B, M, rng) {
  const walls = [M.plasterOchre, M.plasterPink, M.plasterCream, M.plasterOchre, M.plaster];
  const blocked = (x, z, r) => {
    if (x > -262 - r && x < 142 + r && z > -302 - r && z < -44 + r) return true;
    if (x > -150 - r && x < 128 + r && z > -48 - r && z < 34 + r) return true;
    const along = (x - ROAD.cx) * ROAD.dx + (z - ROAD.cz) * ROAD.dz;
    const across = (x - ROAD.cx) * ROAD.nx + (z - ROAD.cz) * ROAD.nz;
    if (across > -4 - r && across < 42 + r) return true;
    if (Math.abs(along) < 212 + r && across < 86 + r && across > 0) return true;
    return false;
  };
  cityGrid(B, M, rng, { cell: 48, extent: 800, y: STREET, styles: M.facades.modern, floors: [4, 7], blocked, flatChance: 0.2 });
}

// `remains` holds what survives from antiquity (plus the bare terrain); `modern` holds
// everything built since. They use separate material sets so that each can be dissolved.
export function buildToday(M, MM) {
  const group = new THREE.Group();
  const remains = new THREE.Group();
  const modern = new THREE.Group();
  const R = new Builder();
  const N = new Builder();
  const rng = makeRng(7);
  const columns = { temple: [], shaft: [], capital: [] };
  const L = LAYOUT;
  const portico = columnParts(L.column.R, L.column.H, false, 1.5);
  const temple = columnParts(L.temple.R, L.temple.H, true);

  buildGround(R, M, N, MM);
  buildRoad(N, MM, rng);
  buildHill(R, M, N, MM, rng);
  buildVittoriano(N, MM);
  buildChurch(N, MM);
  buildCuria(R, M, { ruin: true });
  buildTempleRuin(R, M, rng, columns);
  buildPorticoRuin(R, M, rng, columns);
  buildTabernaeRuin(R, M, rng);
  buildBoardwalk(N, MM);
  buildFragments(R, M, rng, portico.capital);
  buildVisitors(N, MM, rng);
  buildCity(N, MM, rng);
  for (const [x, z, h] of [[62, 4, 15], [112, -24, 14], [118, -40, 16], [-80, 22, 13]]) stonePine(N, MM, x, 0, z, h, rng);
  N.span(MM.grass, -148, -92, STREET, STREET + 0.12, -42, 22);
  for (let i = 0; i < 9; i++) stonePine(N, MM, -144 + rng() * 48, STREET, -38 + rng() * 56, 13 + rng() * 5, rng);
  R.build(remains);
  N.build(modern);

  // Earth at the ancient level. It is only shown while the modern street level is dissolved.
  const earth = new THREE.Group();
  const E = new Builder();
  E.span(M.dirt, -1500, 1500, -1.2, -0.08, -1500, 1500);
  E.build(earth);

  remains.add(instanced(portico.shaft, M.graniteOld, columns.shaft));
  remains.add(instanced(portico.base, M.marbleOld, columns.shaft));
  remains.add(instanced(portico.capital, M.marbleOldDouble, columns.capital));
  remains.add(instanced(temple.shaft, M.marbleOld, columns.temple));
  remains.add(instanced(temple.base, M.marbleOld, columns.temple));
  remains.add(instanced(temple.capital, M.marbleOldDouble, columns.temple));
  group.add(remains, modern, earth);
  return { group, remains, modern, earth };
}
