// DUSTFALL — rendering: the three.js scene, bot figures, the viewmodel
// weapon, muzzle flash, tracers and particles. The renderer reads the
// sim state and never writes it (except draining the fx event queue,
// which is the sim's one-way channel to the visuals).

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { buildMapMeshes } from './map.js';
import { eyeHeight } from './player.js';
import { fxEvents } from './combat.js';
import { PHASE } from './state.js';

const BOT_COLORS = {
  vanguard: PALETTE.vanguard,
  sentinel: PALETTE.sentinel,
};

export function createRenderer(canvas, state) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 55, 110);

  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
  scene.add(camera);

  // Golden-hour lighting: one warm sun with shadows, one cool sky bounce.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-30, 42, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9));

  buildMapMeshes(scene);

  // ---- viewmodel weapon (a low-poly rifle built from boxes) ----
  const gun = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.5, metalness: 0.6 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.55), gunMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), gunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.4);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.09), gripMat);
  mag.position.set(0, -0.11, -0.08);
  mag.rotation.x = 0.2;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.18), gripMat);
  stock.position.set(0, -0.01, 0.32);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.06), gunMat);
  sight.position.set(0, 0.08, -0.12);
  gun.add(body, barrel, mag, stock, sight);
  gun.position.set(0.22, -0.21, -0.45);
  camera.add(gun);

  // Muzzle flash: a small glowing quad + point light, shown for 40 ms.
  const flashMat = new THREE.MeshBasicMaterial({
    color: PALETTE.muzzle, transparent: true, opacity: 0, depthWrite: false,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), flashMat);
  flash.position.set(0, 0.02, -0.58);
  gun.add(flash);
  const flashLight = new THREE.PointLight(PALETTE.muzzle, 0, 9, 2);
  flashLight.position.set(0, 0, -0.6);
  gun.add(flashLight);

  // ---- bot figures ----
  const botMeshes = new Map();
  const botGeoBody = new THREE.BoxGeometry(0.62, 1.05, 0.36);
  const botGeoHead = new THREE.SphereGeometry(0.19, 12, 10);
  const botGeoLegL = new THREE.BoxGeometry(0.24, 0.55, 0.3);
  const botGeoGun = new THREE.BoxGeometry(0.06, 0.1, 0.6);
  const visorMat = new THREE.MeshStandardMaterial({ color: PALETTE.visor, roughness: 0.3, metalness: 0.5 });

  function botMesh(agent) {
    let m = botMeshes.get(agent.id);
    if (m) return m;
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: BOT_COLORS[agent.team], roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.85 });
    const bodyM = new THREE.Mesh(botGeoBody, suit);
    bodyM.position.y = 1.0;
    bodyM.castShadow = true;
    const head = new THREE.Mesh(botGeoHead, suit);
    head.position.y = 1.62;
    head.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.05), visorMat);
    visor.position.set(0, 1.64, -0.17);
    const legL = new THREE.Mesh(botGeoLegL, dark);
    legL.position.set(-0.16, 0.28, 0);
    const legR = new THREE.Mesh(botGeoLegL, dark);
    legR.position.set(0.16, 0.28, 0);
    const gunM = new THREE.Mesh(botGeoGun, dark);
    gunM.position.set(0.18, 1.15, -0.35);
    g.add(bodyM, head, visor, legL, legR, gunM);
    // Name tag: a small floating sprite is too costly; the team colour
    // and the HUD feed identify bots instead.
    scene.add(g);
    botMeshes.set(agent.id, { group: g, legL, legR, walkPhase: Math.random() * 6 });
    return botMeshes.get(agent.id);
  }

  // ---- bomb mesh (a small device with a blinking light) ----
  const bombGroup = new THREE.Group();
  const bombBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.22, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.4, metalness: 0.7 }),
  );
  bombBox.position.y = 0.11;
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  );
  bombLight.position.set(0.12, 0.25, 0);
  bombGroup.add(bombBox, bombLight);
  bombGroup.visible = false;
  scene.add(bombGroup);

  // ---- tracers + particles (pooled, no allocation per shot) ----
  const TRACER_POOL = 24;
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: PALETTE.tracer, transparent: true, opacity: 0,
    }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const SPARK_POOL = 40;
  const sparks = [];
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_POOL * 3), 3));
  const sparkPts = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffd27a, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparkPts.frustumCulled = false;
  scene.add(sparkPts);
  for (let i = 0; i < SPARK_POOL; i++) {
    sparks.push({ life: 0, vx: 0, vy: 0, vz: 0 });
    sparkGeo.attributes.position.setXYZ(i, 0, -100, 0);
  }
  let sparkNext = 0;

  const explosionLight = new THREE.PointLight(0xff7a2a, 0, 30, 1.6);
  scene.add(explosionLight);

  let flashUntil = 0;
  let walkTime = 0;

  function spawnTracer(x0, y0, z0, x1, y1, z1) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_POOL;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, x0, y0, z0);
    pos.setXYZ(1, x1, y1, z1);
    pos.needsUpdate = true;
    t.line.material.opacity = 0.85;
    t.life = 0.09;
  }

  function spawnSparks(x, y, z, n) {
    for (let k = 0; k < n; k++) {
      const s = sparks[sparkNext];
      sparkNext = (sparkNext + 1) % SPARK_POOL;
      s.life = 0.3 + Math.random() * 0.25;
      s.vx = (Math.random() - 0.5) * 4;
      s.vy = Math.random() * 3 + 1;
      s.vz = (Math.random() - 0.5) * 4;
      sparkGeo.attributes.position.setXYZ(sparkNext === 0 ? SPARK_POOL - 1 : sparkNext - 1, x, y, z);
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function drainFx(time) {
    while (fxEvents.length > 0) {
      const ev = fxEvents.shift();
      if (ev.kind === 'tracer') {
        spawnTracer(ev.x0, ev.y0, ev.z0, ev.x1, ev.y1, ev.z1);
      } else if (ev.kind === 'spark') {
        spawnSparks(ev.x, ev.y, ev.z, ev.head ? 8 : 5);
      } else if (ev.kind === 'impact') {
        spawnSparks(ev.x, ev.y, ev.z, 3);
      } else if (ev.kind === 'explosion') {
        explosionLight.position.set(ev.x, ev.y + 1, ev.z);
        explosionLight.intensity = 60;
        spawnSparks(ev.x, ev.y, ev.z, 20);
      }
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    renderer,
    scene,
    camera,
    setFlash() {
      flashUntil = performance.now() + 45;
    },
    render(state, dt) {
      drainFx(state.time);
      const p = state.player;

      // Menu backdrop: a slow orbit over the yard so the start screen
      // shows the map itself, not a black frame.
      if (state.phase === PHASE.MENU) {
        const t = performance.now() / 1000;
        const a = t * 0.08;
        camera.position.set(Math.sin(a) * 24, 18, Math.cos(a) * 24);
        camera.lookAt(0, 0, 0);
        gun.visible = false;
        renderer.render(scene, camera);
        return;
      }

      walkTime += dt * (p.moving ? 9 : 0);

      // Camera: player eye + recoil + shake + a subtle walk bob.
      const bob = p.moving && p.y <= 0.01 ? Math.sin(walkTime) * 0.025 : 0;
      const shake = state.shake;
      const sx = (Math.random() - 0.5) * shake * 0.05;
      const sy = (Math.random() - 0.5) * shake * 0.05;
      camera.position.set(p.x + sx, p.y + eyeHeight(p) + bob + sy, p.z);
      camera.rotation.order = 'YXZ';
      // The sim's forward is (sin yaw, -cos yaw); three.js gives a camera
      // with rotation.y = θ a forward of (-sin θ, -cos θ), so the camera
      // yaw is the NEGATIVE of the sim yaw.
      camera.rotation.y = -p.yaw;
      camera.rotation.x = p.pitch + p.loadout.recoilPitch * 0.5;
      camera.rotation.z = Math.sin(walkTime * 0.5) * 0.004 * (p.moving ? 1 : 0);
      gun.visible = p.alive && state.phase !== PHASE.MENU;
      gun.position.y = -0.21 + bob * 0.4;
      gun.position.x = 0.22 + Math.sin(walkTime * 0.5) * 0.004;

      // Muzzle flash.
      const flashing = performance.now() < flashUntil;
      flashMat.opacity = flashing ? 0.95 : 0;
      flashLight.intensity = flashing ? 14 : 0;
      flash.rotation.z = Math.random() * 3;

      // Bots: position, yaw, walk-cycle legs, death pose.
      for (const a of state.agents) {
        const m = botMesh(a);
        m.group.position.set(a.x, a.y, a.z);
        // Same sign rule as the camera: the figure is built facing -Z, so
        // its rotation.y is the negative of the sim yaw.
        m.group.rotation.y = -a.yaw;
        if (!a.alive) {
          m.group.rotation.x = -Math.PI / 2;
          m.group.position.y = 0.25;
          continue;
        }
        m.group.rotation.x = 0;
        if (a.moving) {
          m.walkPhase += dt * 10;
          const s = Math.sin(m.walkPhase) * 0.5;
          m.legL.rotation.x = s;
          m.legR.rotation.x = -s;
        } else {
          m.legL.rotation.x = 0;
          m.legR.rotation.x = 0;
        }
      }

      // Bomb.
      const bomb = state.bomb;
      bombGroup.visible = bomb.state === 'planted';
      if (bomb.state === 'planted') {
        bombGroup.position.set(bomb.x, 0, bomb.z);
        const blink = Math.sin(state.time * (bomb.fuseLeft < 10 ? 14 : 6)) > 0;
        bombLight.material.color.setHex(blink ? 0xff3b30 : 0x551512);
      }

      // Tracer fade.
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
        }
      }
      // Spark physics (positions live in the shared buffer).
      const pos = sparkGeo.attributes.position;
      for (let i = 0; i < SPARK_POOL; i++) {
        const s = sparks[i];
        if (s.life <= 0) continue;
        s.life -= dt;
        s.vy -= 9 * dt;
        const x = pos.getX(i) + s.vx * dt;
        const y = Math.max(0.02, pos.getY(i) + s.vy * dt);
        const z = pos.getZ(i) + s.vz * dt;
        pos.setXYZ(i, x, y, z);
        if (s.life <= 0) pos.setXYZ(i, 0, -100, 0);
      }
      pos.needsUpdate = true;
      explosionLight.intensity = Math.max(0, explosionLight.intensity - dt * 120);

      renderer.render(scene, camera);
    },
  };
}
