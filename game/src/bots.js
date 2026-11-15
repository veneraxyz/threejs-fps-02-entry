// DUSTFALL — bot AI. Each bot runs a small state machine: move along a
// waypoint route, hold a position and watch a lane, engage a visible
// enemy, investigate a sound, or defuse the bomb. Bots see through a
// vision cone plus a line-of-sight test, hear gunshots, and aim with an
// error that shrinks the longer they hold a target in sight — so a bot
// that just spotted you is dangerous, but not instantly lethal.

import { BOT } from './config.js';
import { clamp, wrapAngle } from './utils.js';
import { WAYPOINTS, findPath, nearestWaypoint, hasLineOfSight } from './map.js';
import { moveAgent, forwardOf } from './player.js';
import { eyeHeight } from './player.js';
import { resolveShot } from './combat.js';
import { tickLoadout, canFire } from './weapons.js';
import { sfx } from './audio.js';

// Route each role walks at round start (waypoint indices).
const ROUTES = {
  siteA: [16, 9, 2, 4],
  siteB: [17, 13],
  mid: [16, 6, 9, 6],
  attackA: [1, 2, 3],
  attackB: [5, 6, 10, 11, 13],
  roam: [6, 9, 10, 6],
};

// Where a role holds, and which direction it watches (waypoint to face).
const HOLDS = {
  siteA: { at: 4, face: 2 },
  siteB: { at: 13, face: 11 },
  mid: { at: 6, face: 5 },
  attackA: { at: 3, face: 14 },
  attackB: { at: 13, face: 15 },
  roam: { at: 6, face: 0 },
};

const TURN_RATE = 6.5; // rad/s

function faceToward(bot, targetYaw, dt) {
  const d = wrapAngle(targetYaw - bot.yaw);
  const step = clamp(d, -TURN_RATE * dt, TURN_RATE * dt);
  bot.yaw += step;
  return Math.abs(d) < 0.15;
}

function yawTo(bot, x, z) {
  return Math.atan2(x - bot.x, -(z - bot.z));
}

function pitchTo(bot, target) {
  const dx = target.x - bot.x;
  const dy = target.y + 1.2 - (bot.y + eyeHeight(bot));
  const dz = target.z - bot.z;
  return Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
}

// Scan for a visible enemy. Returns the nearest one, or null.
function scanForEnemy(state, bot) {
  const ex = bot.x;
  const ey = bot.y + eyeHeight(bot);
  const ez = bot.z;
  const fwd = forwardOf(bot.yaw);
  let best = null;
  let bestD = Infinity;
  const candidates = state.player.team !== bot.team ? [state.player] : [];
  for (const a of state.agents) if (a.team !== bot.team) candidates.push(a);
  for (const t of candidates) {
    if (!t.alive) continue;
    const dx = t.x - ex;
    const dz = t.z - ez;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > BOT.viewDistance || dist < 0.5) continue;
    const dot = (dx * fwd.x + dz * fwd.z) / dist;
    if (dot < Math.cos(BOT.viewHalfAngle)) continue;
    if (!hasLineOfSight(ex, ey, ez, t.x, t.y + 1.2, t.z)) continue;
    if (dist < bestD) {
      bestD = dist;
      best = t;
    }
  }
  return best;
}

function startRoute(bot, route) {
  const from = nearestWaypoint(bot.x, bot.z);
  const first = route[0];
  const prefix = from === first ? [] : findPath(from, first) || [];
  bot.bot.path = [...prefix, ...route];
  bot.bot.pathIndex = 0;
  bot.bot.mode = 'move';
}

function followPath(state, bot, dt, speed) {
  const b = bot.bot;
  if (b.pathIndex >= b.path.length) return true; // arrived
  const wp = WAYPOINTS[b.path[b.pathIndex]];
  const dx = wp.x - bot.x;
  const dz = wp.z - bot.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.7) {
    b.pathIndex++;
    return b.pathIndex >= b.path.length;
  }
  const inv = 1 / dist;
  moveAgent(bot, dx * inv, dz * inv, false, dt);
  faceToward(bot, yawTo(bot, wp.x, wp.z), dt);
  return false;
}

export function updateBot(state, bot, dt, rng) {
  const b = bot.bot;
  if (!bot.alive) return;
  tickLoadout(bot.loadout, dt);

  // Perception: sight first, then hearing.
  const seen = scanForEnemy(state, bot);
  if (seen) {
    b.targetId = seen.id;
    b.seenAt = state.time;
    b.lastKnown = { x: seen.x, z: seen.z };
    b.aimError = Math.max(0.012, b.aimError - dt * 0.06);
  } else if (state.time - b.seenAt > 2.5) {
    b.targetId = null;
  }
  if (!b.targetId) {
    for (const n of state.noises) {
      if (n.team === bot.team) continue;
      const dx = n.x - bot.x;
      const dz = n.z - bot.z;
      if (dx * dx + dz * dz < BOT.hearRadius * BOT.hearRadius) {
        if (!b.lastKnown || state.time - n.at < 1) b.lastKnown = { x: n.x, z: n.z };
      }
    }
  }

  // The planted bomb overrides everything for defenders.
  const planted = state.bomb.state === 'planted';
  if (planted && bot.team === 'sentinel' && b.mode !== 'defuse') {
    b.mode = 'defuse';
    const from = nearestWaypoint(bot.x, bot.z);
    const goal = nearestWaypoint(state.bomb.x, state.bomb.z);
    b.path = findPath(from, goal) || [goal];
    b.pathIndex = 0;
  }
  if (planted && bot.team === 'vanguard' && b.mode !== 'engage' && b.mode !== 'hold') {
    // Attackers guard the planted bomb.
    b.mode = 'move';
    const from = nearestWaypoint(bot.x, bot.z);
    const goal = nearestWaypoint(state.bomb.x, state.bomb.z);
    b.path = findPath(from, goal) || [goal];
    b.pathIndex = 0;
  }

  // Visible enemy: fight.
  if (b.targetId) {
    const target = b.targetId === 'you' ? state.player : state.agents.find((a) => a.id === b.targetId);
    if (target && target.alive) {
      b.mode = 'engage';
      engage(state, bot, target, dt, rng);
      return;
    }
    b.targetId = null;
  }

  switch (b.mode) {
    case 'move': {
      if (b.path.length === 0) startRoute(bot, ROUTES[b.role] || ROUTES.roam);
      const arrived = followPath(state, bot, dt, BOT.walkSpeed);
      if (arrived) {
        b.mode = 'hold';
        b.holdUntil = state.time + (b.role === 'mid' ? 6 : 9999);
      }
      break;
    }
    case 'hold': {
      const hold = HOLDS[b.role] || HOLDS.roam;
      const face = WAYPOINTS[hold.face];
      faceToward(bot, yawTo(bot, face.x, face.z), dt);
      // Drift back to the hold spot if pushed away.
      const at = WAYPOINTS[hold.at];
      const dx = at.x - bot.x;
      const dz = at.z - bot.z;
      if (dx * dx + dz * dz > 1.2) {
        const d = Math.sqrt(dx * dx + dz * dz);
        moveAgent(bot, dx / d, dz / d, false, dt);
      } else {
        moveAgent(bot, 0, 0, false, dt);
      }
      if (state.time > b.holdUntil) {
        // Roamers cycle to the next leg of their route.
        b.mode = 'move';
        startRoute(bot, ROUTES[b.role] || ROUTES.roam);
      } else if (b.lastKnown && state.time - b.seenAt > 2.5) {
        b.mode = 'investigate';
        const from = nearestWaypoint(bot.x, bot.z);
        const goal = nearestWaypoint(b.lastKnown.x, b.lastKnown.z);
        b.path = findPath(from, goal) || [goal];
        b.pathIndex = 0;
      }
      break;
    }
    case 'investigate': {
      const arrived = followPath(state, bot, dt, BOT.runSpeed);
      if (arrived) {
        b.lastKnown = null;
        b.mode = 'move';
        startRoute(bot, ROUTES[b.role] || ROUTES.roam);
      }
      break;
    }
    case 'defuse': {
      if (!planted) {
        b.mode = 'move';
        startRoute(bot, ROUTES[b.role] || ROUTES.roam);
        break;
      }
      const dx = state.bomb.x - bot.x;
      const dz = state.bomb.z - bot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 1.6) {
        followPath(state, bot, dt, BOT.runSpeed);
        b.channelAt = -1;
      } else {
        moveAgent(bot, 0, 0, false, dt);
        faceToward(bot, yawTo(bot, state.bomb.x, state.bomb.z), dt);
        if (b.channelAt < 0) {
          b.channelAt = state.time;
          state.bomb.defuserId = bot.id;
        }
        state.bomb.defuseProgress = clamp((state.time - b.channelAt) / 5, 0, 1);
      }
      break;
    }
    default:
      b.mode = 'move';
  }
}

function engage(state, bot, target, dt, rng) {
  const b = bot.bot;
  // Face the target, strafe sideways to stay hard to hit.
  faceToward(bot, yawTo(bot, target.x, target.z), dt);
  if (state.time > b.strafeAt) {
    b.strafeDir = rng() < 0.5 ? -1 : 1;
    b.strafeAt = state.time + BOT.strafePeriod * (0.7 + rng() * 0.6);
  }
  const toT = { x: target.x - bot.x, z: target.z - bot.z };
  const d = Math.max(0.1, Math.sqrt(toT.x * toT.x + toT.z * toT.z));
  const perp = { x: -toT.z / d, z: toT.x / d };
  // Keep a preferred range: close in past 18 m, back off inside 4 m.
  const approach = d > 18 ? 0.6 : d < 4 ? -0.6 : 0;
  const wx = perp.x * b.strafeDir * 0.8 + (toT.x / d) * approach;
  const wz = perp.z * b.strafeDir * 0.8 + (toT.z / d) * approach;
  const wl = Math.max(0.001, Math.sqrt(wx * wx + wz * wz));
  moveAgent(bot, wx / wl, wz / wl, false, dt);

  // Fire in bursts with an aim error that shrinks while the target stays
  // in sight; the error is applied as extra spread on the shot.
  // holdFire is a demo-only flag (set by the __DUSTFALL__ screenshot
  // hooks) so a posed bot does not shoot the photographer.
  if (b.holdFire) return;
  if (state.time < b.nextShotAt) return;
  if (!canFire(bot.loadout, state.time)) {
    if (bot.loadout.weapons[bot.loadout.current].mag === 0) {
      bot.loadout.reloading = 2.2; // bots reload on a fixed timer
    }
    return;
  }
  if (b.burstLeft <= 0) {
    b.burstLeft = BOT.burstMin + Math.floor(rng() * (BOT.burstMax - BOT.burstMin + 1));
  }
  const err = b.aimError * (0.6 + rng() * 0.8);
  const aimYaw = bot.yaw + (rng() * 2 - 1) * err;
  const aimPitch = pitchTo(bot, target) + (rng() * 2 - 1) * err * 0.7;
  resolveShot(state, bot, aimYaw, aimPitch, rng);
  b.burstLeft -= 1;
  b.nextShotAt = state.time + (b.burstLeft > 0 ? BOT.shotGap : BOT.burstGap);
  if (state.player.alive) {
    const pdx = bot.x - state.player.x;
    const pdz = bot.z - state.player.z;
    if (pdx * pdx + pdz * pdz < 30 * 30) sfx.shootFar();
  }
}
