// DUSTFALL — combat resolution: hitscan shots, damage, grenades and the
// visual events the renderer turns into tracers, sparks and flashes.
// A shot is a ray from the shooter's eye. It is tested against every
// enemy body (head sphere, then body box) and every wall; the nearest hit
// wins. Headshots multiply damage.

import { WEAPONS, GRENADE } from './config.js';
import { raySphere, rayBox, clamp } from './utils.js';
import { WALLS, raycastWalls } from './map.js';
import { eyeHeight, speedOf } from './player.js';
import { spreadOf, fireShot } from './weapons.js';
import { pushFeed } from './state.js';

const HEAD_R = 0.19;
const HEAD_Y = 1.52;
const BODY_HALF = 0.34;
const BODY_TOP = 1.42;

// Every shot and explosion appends an event here; render.js drains the
// list each frame and turns events into tracers, sparks and flashes.
export const fxEvents = [];

function bodyBoxOf(agent) {
  return {
    x0: agent.x - BODY_HALF, z0: agent.z - BODY_HALF,
    x1: agent.x + BODY_HALF, z1: agent.z + BODY_HALF,
    top: BODY_TOP + agent.y,
  };
}

// Resolve one hitscan shot. `shooter` is an agent, `yaw`/`pitch` its aim,
// `rng` the sim's PRNG. Returns {hit, head, target, dist, point} or null
// when nothing was hit (the ray still draws a tracer to the wall/ground).
export function resolveShot(state, shooter, yaw, pitch, rng) {
  const w = fireShot(shooter.loadout, state.time);
  // Gunfire is audible: bots within earshot investigate the position.
  state.noises.push({ x: shooter.x, z: shooter.z, at: state.time, team: shooter.team });
  const spread = spreadOf(shooter.loadout, speedOf(shooter), shooter.y > 0.01, shooter.crouch);
  const yawOff = (rng() * 2 - 1) * spread;
  const pitchOff = (rng() * 2 - 1) * spread;
  const ay = yaw + yawOff;
  const ap = clamp(pitch + pitchOff, -1.5, 1.5);
  const dx = Math.sin(ay) * Math.cos(ap);
  const dy = Math.sin(ap);
  const dz = -Math.cos(ay) * Math.cos(ap);
  const ex = shooter.x;
  const ey = shooter.y + eyeHeight(shooter);
  const ez = shooter.z;
  const maxDist = w.range;

  // Nearest wall along the ray.
  let bestDist = raycastWalls(ex, ey, ez, dx, dy, dz, maxDist);
  // Ground plane.
  if (dy < -1e-6) {
    const tg = -ey / dy;
    if (tg > 0 && tg < bestDist) bestDist = tg;
  }

  // Nearest enemy body.
  let bestTarget = null;
  let bestHead = false;
  let bestT = bestDist;
  const candidates = [];
  if (shooter !== state.player) candidates.push(state.player);
  for (const a of state.agents) if (a !== shooter) candidates.push(a);
  for (const t of candidates) {
    if (!t.alive || t.team === shooter.team) continue;
    const headT = raySphere(ex, ey, ez, dx, dy, dz, t.x, t.y + HEAD_Y, t.z, HEAD_R, maxDist);
    const bodyT = rayBox(ex, ey, ez, dx, dy, dz, bodyBoxOf(t), maxDist);
    const tHit = Math.min(headT, bodyT);
    if (tHit < bestT) {
      bestT = tHit;
      bestTarget = t;
      bestHead = headT <= bodyT;
    }
  }

  const hitX = ex + dx * bestT;
  const hitY = ey + dy * bestT;
  const hitZ = ez + dz * bestT;
  fxEvents.push({
    kind: 'tracer', x0: ex, y0: ey, z0: ez, x1: hitX, y1: hitY, z1: hitZ,
    at: state.time,
  });

  if (bestTarget) {
    const falloff = clamp(1 - Math.max(0, bestT - 18) / 60, 0.55, 1);
    const dmg = Math.round(w.damage * (bestHead ? w.headMult : 1) * falloff);
    damageAgent(state, bestTarget, dmg, shooter, bestHead);
    fxEvents.push({ kind: 'spark', x: hitX, y: hitY, z: hitZ, at: state.time, head: bestHead });
    return { hit: true, head: bestHead, target: bestTarget, dist: bestT, point: { x: hitX, y: hitY, z: hitZ } };
  }
  fxEvents.push({ kind: 'impact', x: hitX, y: hitY, z: hitZ, at: state.time });
  return { hit: false, dist: bestT, point: { x: hitX, y: hitY, z: hitZ } };
}

export function damageAgent(state, target, dmg, attacker, head) {
  if (!target.alive) return;
  target.health -= dmg;
  if (target === state.player) {
    state.flash = Math.min(1, state.flash + 0.45);
    state.shake = Math.min(1, state.shake + 0.25);
  }
  if (attacker === state.player) {
    state.hitmarkAt = state.time;
    state.hitmarkKill = target.health <= 0;
  }
  if (target.health > 0) return;
  target.health = 0;
  target.alive = false;
  const verb = head ? '◉' : '✕';
  const good = attacker === state.player || attacker.team === 'vanguard';
  pushFeed(state, `${attacker.name} ${verb} ${target.name}`, good);
  if (attacker === state.player) {
    state.kills += 1;
    state.money += 300;
  }
  if (target === state.player) state.deaths += 1;
}

// Throw a grenade from the agent's eye along its aim.
export function throwGrenade(state, agent, yaw, pitch) {
  if (agent.loadout.grenades <= 0) return false;
  agent.loadout.grenades -= 1;
  const dx = Math.sin(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * Math.cos(pitch);
  state.grenades.push({
    x: agent.x + dx * 0.6,
    y: agent.y + eyeHeight(agent) - 0.1,
    z: agent.z + dz * 0.6,
    vx: dx * GRENADE.throwSpeed + agent.vx * 0.5,
    vy: dy * GRENADE.throwSpeed + GRENADE.upSpeed,
    vz: dz * GRENADE.throwSpeed + agent.vz * 0.5,
    fuse: GRENADE.fuse,
    owner: agent,
  });
  return true;
}

// Grenade physics + detonation. Call once per tick.
export function tickGrenades(state, dt) {
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.fuse -= dt;
    g.vy -= GRENADE.gravity * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    if (g.y <= 0.12) {
      g.y = 0.12;
      g.vy = -g.vy * GRENADE.bounce;
      g.vx *= 0.7;
      g.vz *= 0.7;
    }
    // Bounce off walls (cheap: test the point against each wall's XZ box).
    for (const w of WALLS) {
      if (g.x > w.x0 && g.x < w.x1 && g.z > w.z0 && g.z < w.z1 && g.y < w.top) {
        const dl = g.x - w.x0;
        const dr = w.x1 - g.x;
        const dtz = g.z - w.z0;
        const db = w.z1 - g.z;
        const m = Math.min(dl, dr, dtz, db);
        if (m === dl || m === dr) g.vx = -g.vx * GRENADE.bounce;
        else g.vz = -g.vz * GRENADE.bounce;
        break;
      }
    }
    if (g.fuse <= 0) {
      explodeGrenade(state, g);
      state.grenades.splice(i, 1);
    }
  }
}

function explodeGrenade(state, g) {
  fxEvents.push({ kind: 'explosion', x: g.x, y: Math.max(0.3, g.y), z: g.z, at: state.time });
  const victims = [state.player, ...state.agents];
  for (const t of victims) {
    if (!t.alive) continue;
    const dx = t.x - g.x;
    const dy = t.y + 1 - g.y;
    const dz = t.z - g.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > GRENADE.radius) continue;
    const dmg = Math.round(GRENADE.maxDamage * (1 - d / GRENADE.radius));
    damageAgent(state, t, Math.max(5, dmg), g.owner, false);
  }
  const pdx = state.player.x - g.x;
  const pdz = state.player.z - g.z;
  const pd = Math.sqrt(pdx * pdx + pdz * pdz);
  if (pd < 12) state.shake = Math.min(1, state.shake + (1 - pd / 12) * 0.8);
}
