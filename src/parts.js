import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const KEPT_ATTRIBUTES = ['position', 'normal', 'uv'];

function plain(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) {
    if (!KEPT_ATTRIBUTES.includes(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

export function worldUV(g, tile, swap = false) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.sub(a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k);
      const y = p.getY(i + k);
      const z = p.getZ(i + k);
      let u;
      let v;
      if (ay >= ax && ay >= az) {
        u = swap ? z : x;
        v = swap ? x : z;
      } else if (ax >= az) {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
      uv[(i + k) * 2] = u / tile;
      uv[(i + k) * 2 + 1] = v / tile;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class Builder {
  constructor() {
    this.buckets = new Map();
    this.stack = [new THREE.Matrix4()];
  }

  push(matrix) {
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(matrix));
  }

  pop() {
    this.stack.pop();
  }

  get transform() {
    return this.stack[this.stack.length - 1];
  }

  add(geometry, material, matrix, options = {}) {
    const g = plain(geometry);
    const m = matrix ? this.transform.clone().multiply(matrix) : this.transform;
    g.applyMatrix4(m);
    if (!options.keepUV) worldUV(g, material.userData.tile || 1, options.swapUV);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
  }

  box(material, cx, y0, cz, sx, sy, sz, rotY = 0, options) {
    const matrix = new THREE.Matrix4().makeRotationY(rotY).setPosition(cx, y0 + sy / 2, cz);
    this.add(new THREE.BoxGeometry(sx, sy, sz), material, matrix, options);
  }

  span(material, x0, x1, y0, y1, z0, z1, options) {
    this.box(material, (x0 + x1) / 2, y0, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), 0, options);
  }

  build(group) {
    for (const [material, list] of this.buckets) {
      const mesh = new THREE.Mesh(mergeGeometries(list), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.buckets.clear();
  }
}

export function place(x, y, z, rotY = 0, scale = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(scale, scale, scale),
  );
}

export function instanced(geometry, material, matrices) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function linspace(a, b, count) {
  return Array.from({ length: count }, (_, i) => a + ((b - a) * i) / (count - 1));
}

function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}

function shaftGeometry(R, y0, y1, fluted, tile) {
  const profile = [];
  const steps = fluted ? 6 : 4;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    profile.push(new THREE.Vector2(R * (1 - 0.15 * Math.pow(t, 1.8)), y0 + (y1 - y0) * t));
  }
  const flutes = 24;
  const g = new THREE.LatheGeometry(profile, fluted ? flutes * 4 : 16);
  if (fluted) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const angle = Math.atan2(z, x);
      const u = (((angle / (Math.PI * 2)) * flutes) % 1 + 1) % 1;
      const d = Math.abs(u - 0.5) / 0.45;
      const depth = d < 1 ? Math.sqrt(1 - d * d) * 0.075 : 0;
      p.setXYZ(i, x * (1 - depth), p.getY(i), z * (1 - depth));
    }
    g.computeVertexNormals();
  }
  scaleUV(g, (Math.PI * 2 * R) / tile, (y1 - y0) / tile);
  return plain(g);
}

function baseGeometry(R) {
  const plinth = new THREE.BoxGeometry(2.7 * R, 0.33 * R, 2.7 * R).translate(0, 0.165 * R, 0);
  const points = [
    [0, 0.33], [1.3, 0.33], [1.36, 0.4], [1.36, 0.5], [1.3, 0.57], [1.2, 0.6], [1.14, 0.66],
    [1.14, 0.74], [1.2, 0.8], [1.24, 0.84], [1.24, 0.92], [1.18, 0.98], [1.0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r * R, y * R));
  const mouldings = new THREE.LatheGeometry(points, 16);
  return mergeGeometries([plain(plinth), plain(mouldings)]);
}

function leafGeometry(R, y0, angle, width, height, curl, bellRadius) {
  const rows = 3;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const y = y0 + height * (t - 0.24 * Math.pow(t, 4));
    for (let s = -1; s <= 1; s++) {
      const r = bellRadius(y) + 0.03 * R + curl * Math.pow(t, 3) + (s === 0 ? 0.05 * R : 0);
      const profile = (0.7 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (1 - 0.65 * Math.pow(t, 4));
      const theta = angle + (s * (width / 2) * profile) / r;
      positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
      uvs.push((s + 1) / 2, t);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let s = 0; s < 2; s++) {
      const a = j * 3 + s;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return plain(g);
}

function capitalGeometry(R, y0) {
  const bellHeight = 2.02 * R;
  const bellRadius = (y) => {
    const t = Math.max(0, Math.min(1, (y - y0) / bellHeight));
    return R * (0.85 + 0.03 * t + 0.3 * t * t * t);
  };
  const parts = [];
  const profile = [];
  for (let i = 0; i <= 4; i++) {
    const y = y0 + (bellHeight * i) / 4;
    profile.push(new THREE.Vector2(bellRadius(y), y));
  }
  profile.push(new THREE.Vector2(0, y0 + bellHeight));
  parts.push(plain(new THREE.LatheGeometry(profile, 16)));
  parts.push(plain(new THREE.TorusGeometry(0.89 * R, 0.07 * R, 4, 16).rotateX(Math.PI / 2).translate(0, y0, 0)));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(leafGeometry(R, y0 + 0.04 * R, a, 0.7 * R, 0.95 * R, 0.3 * R, bellRadius));
    parts.push(leafGeometry(R, y0 + 0.12 * R, a + Math.PI / 8, 0.72 * R, 1.5 * R, 0.36 * R, bellRadius));
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    parts.push(leafGeometry(R, y0 + 0.5 * R, a, 0.42 * R, 1.75 * R, 0.5 * R, bellRadius));
    const scroll = new THREE.TorusGeometry(0.15 * R, 0.07 * R, 4, 8)
      .rotateY(-a)
      .translate(1.5 * R * Math.cos(a), y0 + 1.82 * R, 1.5 * R * Math.sin(a));
    parts.push(plain(scroll));
    const inner = (i * Math.PI) / 2;
    parts.push(leafGeometry(R, y0 + 0.7 * R, inner, 0.3 * R, 1.35 * R, 0.22 * R, bellRadius));
  }
  const c = 1.22 * R;
  const dip = 0.34 * R;
  const shape = new THREE.Shape();
  shape.moveTo(-c, -c);
  shape.quadraticCurveTo(0, -c + dip, c, -c);
  shape.quadraticCurveTo(c - dip, 0, c, c);
  shape.quadraticCurveTo(0, c - dip, -c, c);
  shape.quadraticCurveTo(-c + dip, 0, -c, -c);
  const abacus = new THREE.ExtrudeGeometry(shape, { depth: 0.28 * R, bevelEnabled: false, curveSegments: 3 })
    .rotateX(-Math.PI / 2)
    .translate(0, y0 + bellHeight, 0);
  parts.push(plain(abacus));
  return mergeGeometries(parts);
}

export function columnParts(R, H, fluted, tile = 4) {
  const capitalHeight = 2.3 * R;
  return {
    R,
    H,
    base: baseGeometry(R),
    shaft: shaftGeometry(R, R, H - capitalHeight, fluted, tile),
    capital: capitalGeometry(R, H - capitalHeight),
  };
}

export function brokenShaft(R, height, rng) {
  const g = new THREE.CylinderGeometry(R * 0.96, R, height, 20, 1).translate(0, height / 2, 0);
  const p = g.attributes.position;
  const tilt = (rng() - 0.5) * 0.9;
  const dir = rng() * Math.PI * 2;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > height * 0.9) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, height + tilt * (x * Math.cos(dir) + z * Math.sin(dir)) + (Math.hypot(x, z) < 0.01 ? 0.12 * R : 0));
    }
  }
  g.computeVertexNormals();
  return g;
}

export function wallGeometry(length, height, thickness, openings = [], topProfile = null) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  if (topProfile) {
    for (const [x, y] of topProfile) shape.lineTo(x, y);
  } else {
    shape.lineTo(0, height);
    shape.lineTo(length, height);
  }
  shape.lineTo(length, 0);
  const doors = openings.filter((o) => o.y === 0).sort((a, b) => b.x - a.x);
  for (const d of doors) {
    shape.lineTo(d.x + d.w / 2, 0);
    shape.lineTo(d.x + d.w / 2, d.h);
    if (d.arch) shape.absarc(d.x, d.h, d.w / 2, 0, Math.PI, false);
    else shape.lineTo(d.x - d.w / 2, d.h);
    shape.lineTo(d.x - d.w / 2, 0);
  }
  shape.closePath();
  for (const o of openings) {
    if (o.y === 0) continue;
    const hole = new THREE.Path();
    hole.moveTo(o.x - o.w / 2, o.y);
    hole.lineTo(o.x + o.w / 2, o.y);
    hole.lineTo(o.x + o.w / 2, o.y + o.h);
    if (o.arch) hole.absarc(o.x, o.y + o.h, o.w / 2, 0, Math.PI, false);
    else hole.lineTo(o.x - o.w / 2, o.y + o.h);
    hole.closePath();
    shape.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 10 });
}

// Places a wallGeometry so that its length runs along +X or +Z starting at (x, y, z).
export function wallMatrix(x, y, z, axis = 'x') {
  const m = new THREE.Matrix4();
  if (axis === 'z') m.makeRotationY(-Math.PI / 2);
  return m.setPosition(x, y, z);
}

export function raggedProfile(length, heightAt, rng, step = 0.9) {
  const points = [];
  let x = 0;
  let h = heightAt(0);
  points.push([0, h]);
  while (x < length) {
    const nx = Math.min(length, x + step * (0.5 + rng()));
    points.push([nx, h]);
    if (nx < length) {
      h = Math.max(0.3, heightAt(nx) + (rng() - 0.5) * 1.2);
      points.push([nx, h]);
    }
    x = nx;
  }
  return points;
}

export function roofSlab(B, material, { a0, a1, low, high, yLow, yHigh, axis = 'x', thick = 0.22 }) {
  const run = Math.abs(high - low);
  const rise = yHigh - yLow;
  const slope = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const mid = (low + high) / 2;
  const y = (yLow + yHigh) / 2;
  const along = (a0 + a1) / 2;
  const m = new THREE.Matrix4();
  if (axis === 'x') {
    m.makeRotationX(high > low ? -angle : angle).setPosition(along, y, mid);
    B.add(new THREE.BoxGeometry(Math.abs(a1 - a0), thick, slope), material, m);
  } else {
    m.makeRotationZ(high > low ? angle : -angle).setPosition(mid, y, along);
    B.add(new THREE.BoxGeometry(slope, thick, Math.abs(a1 - a0)), material, m, { swapUV: true });
  }
}

export function gableRoof(B, material, { a0, a1, b0, b1, y, rise, axis = 'x', overhang = 0.4, ridge = null }) {
  const ridgeAt = ridge === null ? (b0 + b1) / 2 : ridge;
  const drop = (edge) => (rise * overhang) / Math.abs(ridgeAt - edge);
  roofSlab(B, material, { a0: a0 - overhang, a1: a1 + overhang, low: b0 - overhang, high: ridgeAt, yLow: y - drop(b0), yHigh: y + rise, axis });
  roofSlab(B, material, { a0: a0 - overhang, a1: a1 + overhang, low: b1 + overhang, high: ridgeAt, yLow: y - drop(b1), yHigh: y + rise, axis });
}

// Triangular prism: gable profile across `span`, extruded along the ridge for `length`.
export function gablePrism(span, rise, length) {
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0);
  shape.lineTo(span / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false }).translate(0, 0, -length / 2);
}

export function stairs(B, material, { x, z, dx, dz, width, count, rise, run, y0 }) {
  for (let i = 0; i < count; i++) {
    const cx = x + dx * (i + 0.5) * run;
    const cz = z + dz * (i + 0.5) * run;
    const sx = dx !== 0 ? run : width;
    const sz = dz !== 0 ? run : width;
    B.box(material, cx, y0, cz, sx, (i + 1) * rise, sz);
  }
}

export function entablature(B, M, { x0, x1, z0, z1, y, E, dentils = true, frieze = M.frieze }) {
  const layer = (material, from, to, proj) => {
    B.span(material, x0 - proj, x1 + proj, y + from * E, y + to * E, z0 - proj, z1 + proj);
  };
  layer(M.marble, 0, 0.16, 0);
  layer(M.marble, 0.16, 0.36, 0.035 * E);
  layer(frieze, 0.36, 0.63, 0);
  layer(M.marble, 0.63, 0.7, 0.07 * E);
  layer(M.marble, 0.7, 0.8, 0.1 * E);
  layer(M.marble, 0.8, 0.92, 0.38 * E);
  layer(M.marble, 0.92, 1, 0.46 * E);
  if (!dentils) return;
  const size = 0.075 * E;
  const proj = 0.17 * E;
  const yb = y + 0.705 * E;
  const h = 0.09 * E;
  const runX = x1 - x0 + 2 * proj;
  const runZ = z1 - z0 + 2 * proj;
  const nx = Math.max(1, Math.round(runX / (size * 2)));
  const nz = Math.max(1, Math.round(runZ / (size * 2)));
  if (runX > 2.5) {
    for (let i = 0; i < nx; i++) {
      const x = x0 - proj + (runX * (i + 0.5)) / nx;
      B.box(M.marble, x, yb, z0 - proj + size / 2, size, h, size);
      B.box(M.marble, x, yb, z1 + proj - size / 2, size, h, size);
    }
  }
  if (runZ > 2.5) {
    for (let i = 0; i < nz; i++) {
      const z = z0 - proj + (runZ * (i + 0.5)) / nz;
      B.box(M.marble, x0 - proj + size / 2, yb, z, size, h, size);
      B.box(M.marble, x1 + proj - size / 2, yb, z, size, h, size);
    }
  }
}

function lumpy(source, amount, rng) {
  source.deleteAttribute('uv');
  source.deleteAttribute('normal');
  const geometry = mergeVertices(source, 1e-3);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (rng() - 0.5) * amount;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function stonePine(B, M, x, y, z, height, rng) {
  const lean = (rng() - 0.5) * 0.12;
  const trunkHeight = height * 0.72;
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, trunkHeight, 8).translate(0, trunkHeight / 2, 0);
  B.add(trunk, M.pineBark, new THREE.Matrix4().makeRotationZ(lean).setPosition(x, y, z), { keepUV: true });
  const topX = x - Math.sin(lean) * trunkHeight;
  const crown = height * 0.42;
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : crown * (0.3 + 0.6 * rng());
    const r = crown * (0.42 + 0.3 * rng());
    const blob = lumpy(new THREE.IcosahedronGeometry(1, 2), 0.3, rng).scale(r, r * 0.4, r);
    const cx = topX + Math.cos(a) * d;
    const cz = z + Math.sin(a) * d;
    const cy = y + trunkHeight + height * 0.1 + (rng() - 0.5) * height * 0.06;
    B.add(blob, i % 3 === 0 ? M.pineLeafDark : M.pineLeaf, new THREE.Matrix4().setPosition(cx, cy, cz), { keepUV: true });
    if (i > 0 && i < 4) {
      const from = new THREE.Vector3(topX, y + trunkHeight * 0.9, z);
      const to = new THREE.Vector3(cx, cy - r * 0.2, cz);
      const length = from.distanceTo(to);
      const branch = new THREE.CylinderGeometry(0.08, 0.14, length, 6).translate(0, length / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      B.add(branch, M.pineBark, new THREE.Matrix4().compose(from, q, new THREE.Vector3(1, 1, 1)), { keepUV: true });
    }
  }
}

export function cypress(B, M, x, y, z, height, rng) {
  const profile = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    profile.push(new THREE.Vector2(height * 0.09 * Math.sin(Math.PI * Math.pow(t, 0.6)) + 0.02, height * (0.08 + 0.92 * t)));
  }
  B.add(lumpy(new THREE.LatheGeometry(profile, 10), 0.18, rng), M.cypressLeaf, new THREE.Matrix4().setPosition(x, y, z), { keepUV: true });
  B.add(new THREE.CylinderGeometry(0.12, 0.16, height * 0.1, 6).translate(0, height * 0.05, 0), M.pineBark, new THREE.Matrix4().setPosition(x, y, z), { keepUV: true });
}

// Generic plastered block with window rows and a tiled gable roof.
export function blockBuilding(B, M, { x, y, z, w, d, h, wall, rot = 0, floor = 3.3, base = null, roof = M.roofTile, flatRoof = false }) {
  B.push(place(x, y, z, rot));
  B.span(wall, -w / 2, w / 2, 0, h, -d / 2, d / 2);
  if (base) B.span(base, -w / 2 - 0.05, w / 2 + 0.05, 0, Math.min(floor, h * 0.3), -d / 2 - 0.05, d / 2 + 0.05);
  const stories = Math.max(1, Math.floor(h / floor));
  for (let s = 0; s < stories; s++) {
    const wy = s * floor + floor * 0.38 + (h - stories * floor) * 0.5;
    const nw = Math.max(1, Math.floor(w / 2.7));
    const nd = Math.max(1, Math.floor(d / 2.7));
    for (let i = 0; i < nw; i++) {
      const wx = -w / 2 + (w * (i + 0.5)) / nw;
      B.box(M.dark, wx, wy, d / 2, 1.0, 1.45, 0.12);
      B.box(M.dark, wx, wy, -d / 2, 1.0, 1.45, 0.12);
    }
    for (let i = 0; i < nd; i++) {
      const wz = -d / 2 + (d * (i + 0.5)) / nd;
      B.box(M.dark, w / 2, wy, wz, 0.12, 1.45, 1.0);
      B.box(M.dark, -w / 2, wy, wz, 0.12, 1.45, 1.0);
    }
  }
  if (flatRoof) {
    B.span(wall, -w / 2 - 0.3, w / 2 + 0.3, h, h + 0.5, -d / 2 - 0.3, d / 2 + 0.3);
  } else if (w >= d) {
    const rise = d * 0.18;
    B.add(gablePrism(d, rise, w).rotateY(Math.PI / 2), wall, new THREE.Matrix4().setPosition(0, h, 0));
    gableRoof(B, roof, { a0: -w / 2, a1: w / 2, b0: -d / 2, b1: d / 2, y: h + 0.12, rise, axis: 'x', overhang: 0.5 });
  } else {
    const rise = w * 0.18;
    B.add(gablePrism(w, rise, d), wall, new THREE.Matrix4().setPosition(0, h, 0));
    gableRoof(B, roof, { a0: -d / 2, a1: d / 2, b0: -w / 2, b1: w / 2, y: h + 0.12, rise, axis: 'z', overhang: 0.5 });
  }
  B.pop();
}

// Context building on a 3 m facade grid, so that the window texture lines up with the walls.
export function cityBlock(B, M, { x, z, y, bays, depthBays, floors, style, flatRoof = false }) {
  const w = bays * 3;
  const d = depthBays * 3;
  const h = floors * 3;
  const x0 = Math.round(x / 3) * 3 - Math.floor(bays / 2) * 3;
  const z0 = Math.round(z / 3) * 3 - Math.floor(depthBays / 2) * 3;
  B.span(style.facade, x0, x0 + w, y, y + h, z0, z0 + d);
  B.span(style.plain, x0 - 0.35, x0 + w + 0.35, y + h, y + h + 0.35, z0 - 0.35, z0 + d + 0.35);
  if (flatRoof) {
    B.span(M.lead, x0 + 0.5, x0 + w - 0.5, y + h + 0.35, y + h + 0.5, z0 + 0.5, z0 + d - 0.5);
    return;
  }
  const top = y + h + 0.35;
  if (w >= d) {
    const rise = d * 0.17;
    B.add(gablePrism(d, rise, w).rotateY(Math.PI / 2), style.plain, new THREE.Matrix4().setPosition(x0 + w / 2, top, z0 + d / 2));
    gableRoof(B, M.roofTile, { a0: x0, a1: x0 + w, b0: z0, b1: z0 + d, y: top + 0.1, rise, axis: 'x', overhang: 0.5 });
  } else {
    const rise = w * 0.17;
    B.add(gablePrism(w, rise, d), style.plain, new THREE.Matrix4().setPosition(x0 + w / 2, top, z0 + d / 2));
    gableRoof(B, M.roofTile, { a0: z0, a1: z0 + d, b0: x0, b1: x0 + w, y: top + 0.1, rise, axis: 'z', overhang: 0.5 });
  }
}

export function cityGrid(B, M, rng, { cell, extent, y, styles, floors, blocked, flatChance = 0, street = [6, 11] }) {
  const count = Math.floor(extent / cell);
  for (let i = -count; i <= count; i++) {
    for (let j = -count; j <= count; j++) {
      const x = i * cell + (rng() - 0.5) * 4;
      const z = j * cell + (rng() - 0.5) * 4;
      const gap = street[0] + rng() * (street[1] - street[0]);
      const bays = Math.max(3, Math.floor((cell - gap) / 3) - Math.floor(rng() * 2));
      const depthBays = Math.max(3, Math.floor((cell - gap) / 3) - Math.floor(rng() * 3));
      const levels = floors[0] + Math.floor(rng() * (floors[1] - floors[0] + 1));
      if (rng() < 0.06 || blocked(x, z, Math.max(bays, depthBays) * 1.6)) continue;
      cityBlock(B, M, { x, z, y, bays, depthBays, floors: levels, style: styles[Math.floor(rng() * styles.length)], flatRoof: rng() < flatChance });
    }
  }
}

const ROBE = [[0, 0], [0.2, 0], [0.24, 0.12], [0.21, 0.6], [0.18, 1.0], [0.22, 1.2], [0.25, 1.36], [0.2, 1.44], [0.07, 1.49], [0.06, 1.56]];

// Simple draped figure, used for statues and for people.
export function robedFigure(B, body, head, x, y, z, height, rot = 0, raisedArm = false) {
  const k = height / 1.78;
  const profile = ROBE.map(([r, h]) => new THREE.Vector2(r * k, h * k));
  B.add(new THREE.LatheGeometry(profile, 10).scale(1, 1, 0.6), body, place(x, y, z, rot), { keepUV: true });
  B.add(new THREE.SphereGeometry(0.105 * k, 9, 7).scale(0.9, 1.1, 1), head, place(x, y + 1.66 * k, z), { keepUV: true });
  for (const side of raisedArm ? [-1] : [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.05 * k, 0.04 * k, 0.6 * k, 6).translate(side * 0.27 * k, 1.06 * k, 0);
    B.add(arm, body, place(x, y, z, rot), { keepUV: true });
  }
  if (raisedArm) {
    const arm = new THREE.CylinderGeometry(0.045 * k, 0.055 * k, 0.62 * k, 6)
      .translate(0, 0.31 * k, 0)
      .rotateZ(-1.0)
      .translate(0.24 * k, 1.34 * k, 0);
    B.add(arm, body, place(x, y, z, rot), { keepUV: true });
  }
}

export function statue(B, M, x, y, z, rot, material, height = 2.4) {
  B.box(M.marble, x, y, z, 1.3, 0.25, 1.3);
  B.box(M.marbleAshlar, x, y + 0.25, z, 1.05, 1.1, 1.05);
  B.box(M.marble, x, y + 1.35, z, 1.25, 0.2, 1.25);
  robedFigure(B, material, material, x, y + 1.55, z, height, rot, true);
}
