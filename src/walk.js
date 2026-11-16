import * as THREE from 'three';
import { createLegionary } from './legionary.js';

// Walk mode: a character that runs and jumps through the scene, steered like a first person
// game: the mouse turns the character, W and S go forward and back, A and D step sideways.
// It is seen from behind, through its eyes, or from the front.
//
// The world is whatever the viewer says is solid right now, one triangle tree per layer,
// all built when walk mode is first entered. The character collides in two parts:
//   walls    a capsule that starts a step height above the feet, pushed out of anything
//            it touches, so low obstacles do not stop it
//   ground   rays cast down under the feet, which lift it onto steps and let it follow
//            stairs down
// In the air the capsule reaches down to the feet, so a jump has to clear a ledge.

const HEIGHT = 1.8;
const RADIUS = 0.3;
const STEP_HEIGHT = 0.6;
const AIR_CLEARANCE = 0.1;
// Least vertical part of a surface normal that still counts as ground, about 45 degrees.
const WALKABLE = 0.7;
const GRAVITY = 28;
const JUMP_HEIGHT = 1.25;
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
const WALK_SPEED = 5;
const SPRINT_SPEED = 9;
const FLY_SPEED = 14;
const CLIMB_SPEED = 9;
// Longest pause between two presses of Space that still counts as a double tap.
const DOUBLE_TAP = 0.3;
const FALL_SPEED = 45;
const LOWEST = -40;
const MAX_STEP = 1 / 100;
const EYE = 1.62;
const CAMERA_DISTANCE = 5.5;
// Height of the point the third person camera turns around. It stays inside the capsule,
// so nothing can come between the two.
const CAMERA_PIVOT = 1.25;
const CAMERA_MARGIN = 0.25;
const NEAR = 0.15;
const LOOK_SPEED = 0.0023;
const FIELD_OF_VIEW = 70;

const FEET = [[0, 0]];
for (let i = 0; i < 8; i++) FEET.push([0.22 * Math.cos(i * Math.PI / 4), 0.22 * Math.sin(i * Math.PI / 4)]);
const LENS = [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.15], [0, -0.15]];
const MOVES = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

// All triangles of a layer in world space, with instanced meshes written out.
function collisionGeometry(group) {
  group.updateWorldMatrix(true, true);
  const meshes = [];
  let vertices = 0;
  group.traverse((object) => {
    if (!object.isMesh || !object.geometry.attributes.position) return;
    const { index, attributes } = object.geometry;
    meshes.push(object);
    vertices += (index ? index.count : attributes.position.count) * (object.isInstancedMesh ? object.count : 1);
  });
  const positions = new Float32Array(vertices * 3);
  const vertex = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const instance = new THREE.Matrix4();
  let offset = 0;
  for (const mesh of meshes) {
    const { index, attributes } = mesh.geometry;
    const count = index ? index.count : attributes.position.count;
    const copies = mesh.isInstancedMesh ? mesh.count : 1;
    for (let copy = 0; copy < copies; copy++) {
      matrix.copy(mesh.matrixWorld);
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(copy, instance);
        matrix.multiply(instance);
      }
      for (let i = 0; i < count; i++) {
        vertex.fromBufferAttribute(attributes.position, index ? index.getX(i) : i).applyMatrix4(matrix);
        positions[offset++] = vertex.x;
        positions[offset++] = vertex.y;
        positions[offset++] = vertex.z;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

// `layers()` returns every group that can be solid and `solids()` the ones that are solid
// at this moment. `places` is a list of { name, at: [x, y, z], look: [x, z] }: the character
// is dropped from `at` onto whatever is below it, facing `look`. The first place is where
// it starts.
export function createWalk({ scene, camera, renderer, controls, layers, solids, places, hint, onChange, onMode }) {
  const canvas = renderer.domElement;
  const figure = createLegionary();
  figure.group.visible = false;
  scene.add(figure.group);

  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const keys = new Set();
  const trees = new Map();
  const stats = { physicsMs: 0, worstMs: 0, buildMs: 0, triangles: 0 };
  let MeshBVH = null;
  let world = [];
  let active = false;
  let ready = false;
  let placed = false;
  let locked = false;
  let grounded = false;
  let firstPerson = false;
  let fromFront = false;
  let flying = false;
  let lastSpaceTap = -Infinity;
  let currentPlace = 0;
  let yaw = 0;
  let pitch = -0.25;
  let facing = 0;
  // How far the drawn character still is from where a step up or down has put it.
  let lag = 0;
  let cameraDistance = CAMERA_DISTANCE;
  let orbit = null;
  let orbitHint = '';

  const ray = new THREE.Ray();
  const segment = new THREE.Line3();
  const bounds = new THREE.Box3();
  const onTriangle = new THREE.Vector3();
  const onSegment = new THREE.Vector3();
  const push = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const before = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const backward = new THREE.Vector3();
  const lensRight = new THREE.Vector3();
  const lensUp = new THREE.Vector3();

  function nearestHit(origin, direction, far) {
    ray.origin.copy(origin);
    ray.direction.copy(direction);
    let nearest = null;
    for (const tree of world) {
      const hit = tree.raycastFirst(ray, THREE.DoubleSide, 0, nearest ? nearest.distance : far);
      if (hit) nearest = hit;
    }
    return nearest;
  }

  const probe = new THREE.Vector3();
  // Highest walkable surface under the feet between `top` and `top - depth`.
  function groundUnder(top, depth) {
    let highest = null;
    for (const [dx, dz] of FEET) {
      const hit = nearestHit(probe.set(position.x + dx, top, position.z + dz), DOWN, depth);
      if (hit && Math.abs(hit.face.normal.y) >= WALKABLE && (highest === null || hit.point.y > highest)) highest = hit.point.y;
    }
    return highest;
  }

  let touched = false;
  let bumpedHead = false;
  // Only in the air do the ground rays start high enough to see what is under the rounded
  // end of the capsule. On foot a ledge there is too high to step on and has to stop it.
  let raysSeeFloor = false;
  const capsule = {
    intersectsBounds: (box) => box.intersectsBox(bounds),
    intersectsTriangle: (triangle) => {
      const distance = triangle.closestPointToSegment(segment, onTriangle, onSegment);
      if (distance >= RADIUS) return;
      push.subVectors(onSegment, onTriangle);
      if (distance < 1e-6) {
        // The axis of the capsule is inside the surface: leave on the side it came from.
        triangle.getNormal(normal);
        if (normal.dot(push.subVectors(before, onTriangle)) < 0) normal.negate();
        push.copy(normal).multiplyScalar(RADIUS);
      } else if (raysSeeFloor && push.y > WALKABLE * distance) {
        // A floor under the capsule belongs to the ground rays.
        return;
      } else if (push.y > 0) {
        // A ledge or slope touching the rounded underside pushes sideways only, so the
        // capsule does not ride up over it.
        const flat = Math.hypot(push.x, push.z);
        if (flat < 1e-6) return;
        const wanted = Math.sqrt(RADIUS * RADIUS - push.y * push.y);
        push.set(push.x, 0, push.z).multiplyScalar((wanted - flat) / flat);
      } else {
        push.multiplyScalar((RADIUS - distance) / distance);
        if (push.y < -1e-4) bumpedHead = true;
      }
      segment.start.add(push);
      segment.end.add(push);
      touched = true;
    },
  };

  // Pushes the capsule out of the walls and returns true if a ceiling pushed it down.
  // `clearance` is how far above the feet the capsule starts.
  function collideWalls(clearance) {
    raysSeeFloor = clearance === AIR_CLEARANCE;
    segment.start.set(position.x, position.y + clearance + RADIUS, position.z);
    segment.end.set(position.x, position.y + HEIGHT - RADIUS, position.z);
    before.copy(segment.start);
    bumpedHead = false;
    touched = true;
    for (let pass = 0; pass < 3 && touched; pass++) {
      touched = false;
      bounds.makeEmpty().expandByPoint(segment.start).expandByPoint(segment.end).expandByScalar(RADIUS);
      for (const tree of world) tree.shapecast(capsule);
    }
    position.x = segment.start.x;
    position.z = segment.start.z;
    position.y += segment.start.y - before.y;
    return bumpedHead;
  }

  function physics(dt) {
    let right = 0;
    let ahead = 0;
    for (const code of keys) {
      const move = MOVES[code];
      if (!move) continue;
      right += move[0];
      ahead += move[1];
    }
    const length = Math.hypot(right, ahead) || 1;
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = flying ? FLY_SPEED : shift ? SPRINT_SPEED : WALK_SPEED;
    const wantedX = ((right * Math.cos(yaw) - ahead * Math.sin(yaw)) / length) * speed;
    const wantedZ = ((-right * Math.sin(yaw) - ahead * Math.cos(yaw)) / length) * speed;
    const grip = 1 - Math.exp(-dt * (flying ? 7 : grounded ? 14 : 4));
    velocity.x += (wantedX - velocity.x) * grip;
    velocity.z += (wantedZ - velocity.z) * grip;
    if (right === 0 && ahead === 0 && Math.hypot(velocity.x, velocity.z) < 0.02) velocity.x = velocity.z = 0;

    if (flying) grounded = false;
    else if (grounded && keys.has('Space')) {
      velocity.y = JUMP_SPEED;
      grounded = false;
    }
    const walking = grounded;
    const startY = position.y;
    if (walking) velocity.y = 0;
    else if (flying) {
      const wantedY = ((keys.has('Space') ? 1 : 0) - (shift ? 1 : 0)) * CLIMB_SPEED;
      velocity.y += (wantedY - velocity.y) * (1 - Math.exp(-dt * 10));
    } else {
      const rising = velocity.y;
      velocity.y = Math.max(rising - GRAVITY * dt, -FALL_SPEED);
      position.y += (rising - velocity.y) * dt * 0.5;
    }
    position.addScaledVector(velocity, dt);
    const clearance = walking ? STEP_HEIGHT : AIR_CLEARANCE;
    if (collideWalls(clearance) && velocity.y > 0) velocity.y = 0;

    // The capsule leaves anything under its rounded end to the ground rays, so they have
    // to start no lower than the middle of that end.
    const top = Math.max(startY, position.y) + (walking ? clearance : clearance + RADIUS);
    const reach = walking ? STEP_HEIGHT : 0;
    const ground = groundUnder(top, top - position.y + reach + 0.01);
    if (walking) {
      grounded = ground !== null;
      if (grounded) {
        lag = Math.max(-STEP_HEIGHT, Math.min(STEP_HEIGHT, lag + position.y - ground));
        position.y = ground;
      }
    } else if (ground !== null) {
      position.y = ground;
      if (velocity.y <= 0) {
        velocity.y = 0;
        // A flight ends by coming down onto the ground, not by skimming over it.
        if (!flying || shift) land();
      }
    }
    if (position.y < LOWEST) goTo(0);
  }

  function land() {
    grounded = true;
    if (!flying) return;
    flying = false;
    showHint();
  }

  function toggleFlying() {
    flying = !flying;
    if (flying) velocity.y = 0;
    showHint();
  }

  // True when the character is inside a closed shape or under a floor that has just appeared.
  function buried() {
    probe.set(position.x, position.y + HEIGHT / 2, position.z);
    const hit = nearestHit(probe, UP, 400);
    return hit !== null && hit.face.normal.y > 0;
  }

  function drop(x, y, z) {
    const hit = nearestHit(probe.set(x, y, z), DOWN, y - LOWEST);
    position.set(x, hit ? hit.point.y : y, z);
    velocity.set(0, 0, 0);
    grounded = false;
    flying = false;
    lag = 0;
  }

  function goTo(index) {
    const place = places[index];
    if (!place) return;
    currentPlace = index;
    drop(...place.at);
    if (place.look) {
      yaw = Math.atan2(position.x - place.look[0], position.z - place.look[1]);
      pitch = -0.25;
    }
    facing = yaw + Math.PI;
    cameraDistance = CAMERA_DISTANCE;
    placed = true;
  }

  function treeOf(group) {
    if (!trees.has(group)) {
      const started = performance.now();
      const geometry = collisionGeometry(group);
      trees.set(group, new MeshBVH(geometry));
      stats.buildMs += performance.now() - started;
      stats.triangles += geometry.attributes.position.count / 3;
    }
    return trees.get(group);
  }

  function setWorld(groups) {
    if (groups.length === world.length && groups.every((group) => world.includes(trees.get(group)))) return;
    world = groups.map(treeOf);
    if (!placed) goTo(0);
    else if (buried()) drop(position.x, 400, position.z);
  }

  function placeCamera(dt) {
    const feetY = position.y + lag;
    if (fromFront) camera.rotation.set(-pitch, yaw + Math.PI, 0, 'YXZ');
    else camera.rotation.set(pitch, yaw, 0, 'YXZ');
    if (firstPerson) {
      camera.position.set(position.x, feetY + EYE, position.z);
      figure.group.visible = false;
      return;
    }
    pivot.set(position.x, feetY + CAMERA_PIVOT, position.z);
    backward.set(0, 0, 1).applyQuaternion(camera.quaternion);
    lensRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    lensUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    let free = CAMERA_DISTANCE;
    for (const [x, y] of LENS) {
      probe.copy(pivot).addScaledVector(lensRight, x).addScaledVector(lensUp, y);
      const hit = nearestHit(probe, backward, CAMERA_DISTANCE + CAMERA_MARGIN);
      if (hit) free = Math.min(free, hit.distance - CAMERA_MARGIN);
    }
    free = Math.max(0.05, free);
    cameraDistance = free < cameraDistance ? free : cameraDistance + (free - cameraDistance) * (1 - Math.exp(-dt * 6));
    camera.position.copy(pivot).addScaledVector(backward, cameraDistance);
    figure.group.visible = cameraDistance > 1;
  }

  function update(dt, groups = solids()) {
    if (!active || !ready) return;
    setWorld(groups);
    const fromX = position.x;
    const fromZ = position.z;
    const fromY = position.y + lag;
    const fromFacing = facing;
    if (dt > 0) {
      const started = performance.now();
      const steps = Math.ceil(dt / MAX_STEP);
      for (let i = 0; i < steps; i++) physics(dt / steps);
      const spent = performance.now() - started;
      stats.physicsMs += (spent - stats.physicsMs) * 0.05;
      stats.worstMs = Math.max(stats.worstMs, spent);
      lag = Math.abs(lag) < 0.002 ? 0 : lag * Math.exp(-dt * 16);
    }
    const speed = dt > 0 ? Math.hypot(position.x - fromX, position.z - fromZ) / dt : 0;
    facing = yaw + Math.PI;
    const moving = figure.animate(dt, { speed, grounded, pitch });
    figure.group.position.set(position.x, position.y + lag, position.z);
    figure.group.rotation.y = facing;
    const shown = figure.group.visible;
    placeCamera(dt);
    // The shadow map is only redrawn on request, so a pose that changed has to ask for it.
    const shifted = position.x !== fromX || position.z !== fromZ || position.y + lag !== fromY || facing !== fromFacing;
    if (figure.group.visible !== shown || (figure.group.visible && (moving || shifted))) renderer.shadowMap.needsUpdate = true;
  }

  function showHint() {
    if (!active) return;
    if (!ready) {
      hint.innerHTML = '<b>Getting ready to walk…</b>';
      return;
    }
    const key = (...names) => names.map((name) => `<kbd>${name}</kbd>`).join('');
    const item = (keys, text) => `<span>${keys} ${text}</span>`;
    const items = [
      locked ? '<span>Mouse to look around</span>' : '<b>Click the scene to steer with the mouse</b>',
      item(key('W', 'A', 'S', 'D'), 'move'),
      item(key('Space'), flying ? 'up' : 'jump'),
      item(key('Shift'), flying ? 'down' : 'run'),
      item(key('Space', 'Space'), flying ? 'walk again' : 'fly'),
      item(key('V'), 'change the view'),
      item(key('1', '2', '3'), 'today, blueprint, ancient'),
      places.length > 1 ? item(key('P'), 'next place') : '',
      item(key('R'), 'back to the start'),
      locked ? item(key('Esc'), 'free the mouse') : '',
      item(key('G'), 'stop walking'),
      item(key('H'), 'hide this help'),
    ];
    hint.innerHTML = items.join('');
  }

  // Asks for raw mouse movement first, without the pointer acceleration of the system,
  // which makes aiming feel loose. Not every browser offers it.
  function lockPointer() {
    const plain = () => canvas.requestPointerLock?.()?.catch?.(() => {});
    try {
      const request = canvas.requestPointerLock?.({ unadjustedMovement: true });
      if (request?.catch) request.catch((error) => (error.name === 'NotSupportedError' ? plain() : undefined));
    } catch {
      plain();
    }
  }

  function nextView() {
    if (firstPerson) [firstPerson, fromFront] = [false, true];
    else if (fromFront) fromFront = false;
    else firstPerson = true;
  }

  async function enter() {
    if (active) return;
    active = true;
    orbit = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), near: camera.near, fov: camera.fov, enabled: controls.enabled };
    orbitHint = hint.innerHTML;
    controls.enabled = false;
    keys.clear();
    lockPointer();
    showHint();
    onChange();
    try {
      MeshBVH ??= (await import('three-mesh-bvh')).MeshBVH;
    } catch (error) {
      console.warn('Walking is unavailable', error);
      exit();
      return;
    }
    // One frame for the message to show before the trees are built, which takes a moment.
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (!active) return;
    layers().forEach(treeOf);
    camera.near = NEAR;
    camera.fov = FIELD_OF_VIEW;
    camera.updateProjectionMatrix();
    ready = true;
    showHint();
    update(0);
    figure.group.visible = !firstPerson;
    renderer.shadowMap.needsUpdate = true;
  }

  function exit() {
    if (!active) return;
    active = false;
    ready = false;
    flying = false;
    keys.clear();
    figure.group.visible = false;
    renderer.shadowMap.needsUpdate = true;
    camera.position.copy(orbit.position);
    camera.quaternion.copy(orbit.quaternion);
    camera.near = orbit.near;
    camera.fov = orbit.fov;
    camera.updateProjectionMatrix();
    controls.enabled = orbit.enabled;
    controls.update();
    hint.innerHTML = orbitHint;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    onChange();
  }

  // The viewer passes every key press here while walk mode is on, and handles none itself.
  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (MOVES[event.code] || event.code === 'Space' || event.code.startsWith('Shift')) {
      event.preventDefault();
      // A button that has the focus would be pressed by Space.
      document.activeElement?.blur();
      keys.add(event.code);
      if (event.code === 'Space' && !event.repeat && ready) {
        const now = performance.now() / 1000;
        const doubled = now - lastSpaceTap < DOUBLE_TAP;
        lastSpaceTap = doubled ? -Infinity : now;
        if (doubled) toggleFlying();
      }
    } else if (event.repeat) return;
    else if (event.code === 'Escape' || event.code === 'KeyG') exit();
    else if (!ready) return;
    else if (event.code === 'KeyV') nextView();
    else if (event.code === 'KeyR') goTo(0);
    else if (event.code === 'KeyP') goTo((currentPlace + 1) % places.length);
    else if (/^Digit[1-3]$/.test(event.code)) onMode(Number(event.code.slice(5)) - 1);
  }

  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('click', () => {
    if (active && !locked) lockPointer();
  });
  document.addEventListener('pointerlockchange', () => {
    // The browser frees the mouse on Esc without passing the key on. Walking goes on, so
    // that the menus can be used; a click on the scene takes the mouse again.
    locked = document.pointerLockElement === canvas;
    showHint();
  });
  document.addEventListener('mousemove', (event) => {
    if (!active || !(locked || (event.buttons === 1 && event.target === canvas))) return;
    yaw -= event.movementX * LOOK_SPEED;
    pitch = Math.max(-1.45, Math.min(1.45, pitch - event.movementY * LOOK_SPEED));
  });

  return {
    enter,
    capture: lockPointer,
    exit,
    update,
    onKeyDown,
    goTo,
    get active() {
      return active;
    },
    // For tests and the console.
    keys,
    stats,
    position,
    velocity,
    figure,
    get state() {
      return { active, ready, locked, grounded, flying, firstPerson, fromFront, yaw, pitch, cameraDistance, position: position.toArray(), velocity: velocity.toArray() };
    },
    look(newYaw, newPitch) {
      yaw = newYaw;
      pitch = newPitch;
    },
    teleport(x, y, z) {
      drop(x, y, z);
    },
    setFirstPerson(on) {
      firstPerson = on;
      fromFront = false;
    },
  };
}
