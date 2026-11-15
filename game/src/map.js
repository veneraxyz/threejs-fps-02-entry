// DUSTFALL — "Kestrel Yard": an original desert compound map. Two bomb
// sites (A north-west, B south-east), three lanes (A-long, Mid, B-long) and
// a connector, with crates and corners for cover. The map is data first:
// every wall is an AABB the sim tests movement, bullets and sight against,
// and the renderer builds meshes from the same data, so what you see is
// what you collide with.
//
// Coordinates: x east, z south, ground at y=0. Playable area x [-28, 28],
// z [-20, 20]. Vanguard (attackers) spawn west, Sentinels east.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { rayBox, pointInBox } from './utils.js';

export const MAP_BOUNDS = { x0: -28, z0: -20, x1: 28, z1: 20 };
export const WALL_H = 3.4;

// Full-height walls: block movement, bullets and line of sight.
export const WALLS = [
  // Perimeter
  { x0: -29, z0: -21, x1: 29, z1: -20, top: WALL_H, mat: 'concrete' },
  { x0: -29, z0: 20, x1: 29, z1: 21, top: WALL_H, mat: 'concrete' },
  { x0: -29, z0: -21, x1: -28, z1: 21, top: WALL_H, mat: 'concrete' },
  { x0: 28, z0: -21, x1: 29, z1: 21, top: WALL_H, mat: 'concrete' },
  // North block: separates A-long from the connector's top
  { x0: -12, z0: -20, x1: -2, z1: -14, top: WALL_H, mat: 'concreteDark' },
  // North-east building (defender north)
  { x0: 2, z0: -20, x1: 20, z1: -12, top: WALL_H, mat: 'rust' },
  // West-mid building: A-site's south edge
  { x0: -20, z0: -8, x1: -8, z1: -2, top: WALL_H, mat: 'concrete' },
  // East-mid building
  { x0: 8, z0: -8, x1: 20, z1: -2, top: WALL_H, mat: 'concreteDark' },
  // South-west building
  { x0: -20, z0: 12, x1: -2, z1: 20, top: WALL_H, mat: 'rust' },
  // South-mid block: B-site's west edge
  { x0: -2, z0: 14, x1: 6, z1: 20, top: WALL_H, mat: 'concrete' },
  // Mid-doors pillars (the choke): two stubs leaving a 2 m gap at x=0
  { x0: -1.5, z0: -2, x1: -0.9, z1: 2, top: WALL_H, mat: 'steel' },
  { x0: 0.9, z0: -2, x1: 1.5, z1: 2, top: WALL_H, mat: 'steel' },
  // A-site back wall stub
  { x0: -16, z0: -16, x1: -15.4, z1: -12, top: WALL_H, mat: 'teal' },
  // B-site back wall stub
  { x0: 15.4, z0: 12, x1: 16, z1: 16, top: WALL_H, mat: 'amber' },
];

// Low crates: block movement only (eye-level bullets and sight pass over).
export const CRATES = [
  { x0: -14, z0: -13, x1: -12.6, z1: -11.6, top: 1.2, mat: 'crate' },
  { x0: -10, z0: -10.5, x1: -8.6, z1: -9.1, top: 1.2, mat: 'crateDark' },
  { x0: -24, z0: -17.5, x1: -22.6, z1: -16.1, top: 1.2, mat: 'crate' },
  { x0: -6, z0: -18.5, x1: -4.6, z1: -17.1, top: 1.2, mat: 'crateDark' },
  { x0: -18, z0: -1, x1: -16.6, z1: 0.4, top: 1.2, mat: 'crate' },
  { x0: 12, z0: -1, x1: 13.4, z1: 0.4, top: 1.2, mat: 'crateDark' },
  { x0: -1, z0: 6, x1: 0.4, z1: 7.4, top: 1.2, mat: 'crate' },
  { x0: 8, z0: 10, x1: 9.4, z1: 11.4, top: 1.2, mat: 'crate' },
  { x0: 12.6, z0: 13, x1: 14, z1: 14.4, top: 1.2, mat: 'crateDark' },
  { x0: 20, z0: 16.5, x1: 21.4, z1: 17.9, top: 1.2, mat: 'crate' },
  { x0: 22, z0: -4, x1: 23.4, z1: -2.6, top: 1.2, mat: 'crate' },
];

// Bomb sites (plant zones, drawn on the ground).
export const SITES = {
  A: { x0: -16, z0: -16, x1: -6, z1: -8, color: PALETTE.teal, label: 'A' },
  B: { x0: 6, z0: 8, x1: 16, z1: 16, color: PALETTE.amber, label: 'B' },
};

export const SPAWNS = {
  vanguard: [
    { x: -25, z: 0, yaw: Math.PI / 2 },
    { x: -25, z: -3, yaw: Math.PI / 2 },
    { x: -25, z: 3, yaw: Math.PI / 2 },
  ],
  sentinel: [
    { x: 24, z: -4, yaw: -Math.PI / 2 },
    { x: 24, z: 0, yaw: -Math.PI / 2 },
    { x: 24, z: 4, yaw: -Math.PI / 2 },
    { x: 20, z: 8, yaw: -Math.PI / 2 },
  ],
};

// Waypoint graph for bot navigation. Edges are symmetric.
export const WAYPOINTS = [
  { x: -25, z: 0 }, // 0 T spawn
  { x: -22, z: -17 }, // 1 A-long west
  { x: -12, z: -17 }, // 2 A-long east
  { x: -11, z: -12 }, // 3 A site
  { x: -14, z: -15 }, // 4 A site north
  { x: -14, z: 0 }, // 5 mid west
  { x: 0, z: 0 }, // 6 mid doors
  { x: 14, z: 0 }, // 7 mid east
  { x: 24, z: 0 }, // 8 CT spawn
  { x: 0, z: -10 }, // 9 connector north
  { x: 0, z: 10 }, // 10 connector south
  { x: 12, z: 17 }, // 11 B-long west
  { x: 22, z: 17 }, // 12 B-long east
  { x: 11, z: 12 }, // 13 B site
  { x: -5, z: -11 }, // 14 A connector
  { x: 5, z: 11 }, // 15 B connector
  { x: 22, z: -4 }, // 16 CT north
  { x: 22, z: 8 }, // 17 CT south
];
export const WAY_EDGES = [
  [0, 1], [0, 5], [1, 2], [2, 3], [2, 4], [3, 4], [3, 14], [4, 14],
  [5, 6], [6, 7], [7, 8], [6, 9], [6, 10], [9, 14], [10, 15], [9, 2],
  [10, 11], [11, 13], [11, 12], [12, 17], [13, 15], [13, 17], [15, 17],
  [8, 16], [8, 17], [7, 16], [16, 9], [14, 5],
];

const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of WAY_EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

// Breadth-first path between waypoint indices. Returns an array of node
// indices including start and goal, or null when unreachable.
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = new Int16Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const next of ADJ[cur]) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let n = to;
        while (n !== from) {
          n = prev[n];
          path.push(n);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i].x - x;
    const dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// True when the segment from (x0,y0,z0) to (x1,y1,z1) is not blocked by a
// full-height wall. Crates never block sight (they are below eye level).
export function hasLineOfSight(x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const inv = 1 / len;
  for (const w of WALLS) {
    if (rayBox(x0, y0, z0, dx * inv, dy * inv, dz * inv, w, len) < len) return false;
  }
  return true;
}

// Distance from a ray origin to the nearest wall, or Infinity.
export function raycastWalls(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  for (const w of WALLS) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, w, maxDist);
    if (t < best) best = t;
  }
  return best;
}

export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    if (pointInBox(x, z, SITES[key])) return key;
  }
  return null;
}

// ---------------------------------------------------------------- meshes

const MATS = {};
function mat(name) {
  if (!MATS[name]) {
    const color = PALETTE[name] ?? 0xffffff;
    MATS[name] = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.04 });
  }
  return MATS[name];
}

// A sand ground texture painted on a canvas: noise speckle plus worn
// patches and faint lane markings. No asset files, no network.
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#b59a6e';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const shade = Math.random();
    g.fillStyle = shade < 0.5 ? 'rgba(120,95,60,0.25)' : 'rgba(220,195,150,0.22)';
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = 'rgba(110,88,55,0.10)';
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 60, 14 + Math.random() * 40, Math.random() * 3, 0, 7);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Build the static map meshes into `scene`. Returns the ground plane so the
// renderer can raycast bullet impacts against it (y=0 is the floor).
export function buildMapMeshes(scene) {
  const group = new THREE.Group();
  group.name = 'map';
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(58, 42),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const w of WALLS) {
    const m = new THREE.Mesh(wallGeo, mat(w.mat));
    m.scale.set(w.x1 - w.x0, w.top, w.z1 - w.z0);
    m.position.set((w.x0 + w.x1) / 2, w.top / 2, (w.z0 + w.z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    // A darker cap strip along the top edge so walls read in the distance.
    const cap = new THREE.Mesh(wallGeo, mat('concreteDark'));
    cap.scale.set(w.x1 - w.x0 + 0.06, 0.12, w.z1 - w.z0 + 0.06);
    cap.position.set((w.x0 + w.x1) / 2, w.top + 0.06, (w.z0 + w.z1) / 2);
    group.add(cap);
  }
  for (const c of CRATES) {
    const m = new THREE.Mesh(wallGeo, mat(c.mat));
    m.scale.set(c.x1 - c.x0, c.top, c.z1 - c.z0);
    m.position.set((c.x0 + c.x1) / 2, c.top / 2, (c.z0 + c.z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    const rim = new THREE.Mesh(wallGeo, mat('crateDark'));
    rim.scale.set(c.x1 - c.x0 + 0.04, 0.08, c.z1 - c.z0 + 0.04);
    rim.position.set((c.x0 + c.x1) / 2, c.top - 0.04, (c.z0 + c.z1) / 2);
    group.add(rim);
  }
  // Site markings: painted ground rectangles with the site letter.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.22 }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set((s.x0 + s.x1) / 2, 0.02, (s.z0 + s.z1) / 2);
    group.add(mark);
    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(s.x1 - s.x0 + 0.3, s.z1 - s.z0 + 0.3),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.5 }),
    );
    border.rotation.x = -Math.PI / 2;
    border.position.set((s.x0 + s.x1) / 2, 0.015, (s.z0 + s.z1) / 2);
    group.add(border);
  }
  scene.add(group);
  return ground;
}
