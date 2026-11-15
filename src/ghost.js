import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

function columnProxy(R, H) {
  const shaftHeight = H - 3.3 * R;
  const parts = [
    new THREE.CylinderGeometry(1.25 * R, 1.32 * R, R, 8).translate(0, R / 2, 0),
    new THREE.CylinderGeometry(0.85 * R, R, shaftHeight, 8).translate(0, R + shaftHeight / 2, 0),
    new THREE.CylinderGeometry(1.38 * R, 0.88 * R, 2 * R, 8).translate(0, H - 1.3 * R, 0),
    new THREE.BoxGeometry(2.5 * R, 0.3 * R, 2.5 * R).translate(0, H - 0.15 * R, 0),
  ];
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

// Drops edges shorter than `minimum` metres. Small ornaments such as dentils would
// otherwise make up most of the lines and turn into noise at a distance.
function longEdges(positions, minimum) {
  const kept = [];
  for (let i = 0; i < positions.length; i += 6) {
    const length = Math.hypot(positions[i + 3] - positions[i], positions[i + 4] - positions[i + 1], positions[i + 5] - positions[i + 2]);
    if (length >= minimum) kept.push(positions[i], positions[i + 1], positions[i + 2], positions[i + 3], positions[i + 4], positions[i + 5]);
  }
  return kept;
}

// Outline version of the ancient forum: a faint tinted surface plus edge lines.
// A depth-only pass runs first so that only the nearest surface is tinted, and the
// polygon offsets make it lose against today's ruins wherever the two coincide.
export function buildGhost(core, skipMaterials, columnSets, plane) {
  const group = new THREE.Group();
  const clippingPlanes = [plane];
  const depth = new THREE.MeshBasicMaterial({
    colorWrite: false, transparent: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2, clippingPlanes,
  });
  const fill = new THREE.MeshLambertMaterial({
    color: 0x4fa9ff, emissive: 0x174f8c, transparent: true, opacity: 0.38, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes,
  });
  const line = new LineMaterial({ color: 0xeaf7ff, linewidth: 2, transparent: true, opacity: 0.95, depthWrite: false, clippingPlanes });
  const outline = (positions) => new LineSegments2(new LineSegmentsGeometry().setPositions(positions), line);
  group.userData.line = line;

  const addSurface = (object, order) => {
    object.renderOrder = order;
    object.castShadow = false;
    object.receiveShadow = false;
    group.add(object);
  };

  for (const mesh of core.children) {
    if (mesh.isInstancedMesh || skipMaterials.has(mesh.material)) continue;
    addSurface(new THREE.Mesh(mesh.geometry, depth), 10);
    addSurface(new THREE.Mesh(mesh.geometry, fill), 11);
    addSurface(outline(longEdges(new THREE.EdgesGeometry(mesh.geometry, 28).attributes.position.array, 0.3)), 12);
  }

  for (const { R, H, matrices } of columnSets) {
    const proxy = columnProxy(R, H);
    for (const [material, order] of [[depth, 10], [fill, 11]]) {
      const instances = new THREE.InstancedMesh(proxy, material, matrices.length);
      matrices.forEach((m, i) => instances.setMatrixAt(i, m));
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingSphere();
      addSurface(instances, order);
    }
    const edges = new THREE.EdgesGeometry(proxy, 28).attributes.position;
    const positions = new Float32Array(edges.count * 3 * matrices.length);
    const v = new THREE.Vector3();
    matrices.forEach((m, i) => {
      for (let k = 0; k < edges.count; k++) {
        v.fromBufferAttribute(edges, k).applyMatrix4(m);
        positions.set([v.x, v.y, v.z], (i * edges.count + k) * 3);
      }
    });
    addSurface(outline(positions), 12);
  }
  return group;
}
