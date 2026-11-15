// DUSTFALL — bootstrap and the game loop. The simulation runs on a fixed
// 60 Hz step, kept apart from rendering: each animation frame advances the
// sim by whole ticks (accumulator, capped so a hitch never spirals) and
// then renders the latest state. The loop never allocates in the hot path.

import { TICK } from './config.js';
import { createState, PHASE } from './state.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createRenderer } from './render.js';
import { startMatch, tickRounds, buyItem } from './rounds.js';
import { updateBot } from './bots.js';
import { moveAgent, forwardOf, rightOf, speedOf } from './player.js';
import { resolveShot, throwGrenade, tickGrenades } from './combat.js';
import { canFire, startReload, tickLoadout, switchSlot, spreadOf } from './weapons.js';
import { ensureAudio, sfx } from './audio.js';
import { mulberry32, clamp } from './utils.js';

const canvas = document.getElementById('game-canvas');
const state = createState();
const rng = mulberry32(20261115);
const input = createInput(canvas);
const view = createRenderer(canvas, state);

let started = false;

const hud = createHud(state, {
  onStart() {
    ensureAudio();
    started = true;
    startMatch(state);
    input.lock();
  },
  onResume() {
    input.lock();
  },
  onRestart() {
    ensureAudio();
    startMatch(state);
    input.lock();
  },
  onBuy(id) {
    if (id === 'pistol-ammo') {
      const p = state.player;
      if (state.money < 200) {
        sfx.denied();
        return;
      }
      state.money -= 200;
      p.loadout.weapons.pistol.reserve = 48;
      sfx.buy();
      return;
    }
    const msg = buyItem(state, id);
    if (msg.startsWith('Bought')) sfx.buy();
    else sfx.denied();
  },
  onBuyOpen() {
    input.unlock();
  },
});

// ---- the fixed-step simulation -------------------------------------------

function stepSim(dt) {
  state.time += dt;
  state.flash = Math.max(0, state.flash - dt * 1.6);
  state.shake = Math.max(0, state.shake - dt * 2.2);
  // Noises fade after two seconds.
  for (let i = state.noises.length - 1; i >= 0; i--) {
    if (state.time - state.noises[i].at > 2) state.noises.splice(i, 1);
  }

  if (state.phase === PHASE.MENU || state.phase === PHASE.MATCH_END) return;

  const p = state.player;
  tickLoadout(p.loadout, dt);

  // Buy menu toggle (freeze phase only; B opens, B or Esc closes).
  if (input.wantBuy && state.phase === PHASE.FREEZE) hud.toggleBuy();
  if (hud.buyOpen && state.phase !== PHASE.FREEZE) hud.setBuy(false);

  // Movement: frozen during the buy phase; dead players spectate.
  if (p.alive && state.phase === PHASE.LIVE) {
    p.yaw += input.yawDelta;
    p.pitch = clamp(p.pitch + input.pitchDelta, -1.45, 1.45);
    p.crouch = input.crouching();
    const fwd = forwardOf(p.yaw);
    const right = rightOf(p.yaw);
    let wx = 0;
    let wz = 0;
    if (input.forward()) {
      wx += fwd.x;
      wz += fwd.z;
    }
    if (input.back()) {
      wx -= fwd.x;
      wz -= fwd.z;
    }
    if (input.right()) {
      wx += right.x;
      wz += right.z;
    }
    if (input.left()) {
      wx -= right.x;
      wz -= right.z;
    }
    const len = Math.sqrt(wx * wx + wz * wz);
    if (len > 0.001) {
      wx /= len;
      wz /= len;
    }
    moveAgent(p, wx, wz, input.wantJump, dt);
  } else if (!p.alive) {
    // Spectate: look around from where you fell.
    p.yaw += input.yawDelta;
    p.pitch = clamp(p.pitch + input.pitchDelta, -1.45, 1.45);
  }

  // Shooting (live only, pointer locked, buy menu closed).
  if (p.alive && state.phase === PHASE.LIVE && input.locked && !hud.buyOpen) {
    const w = p.loadout.current;
    const auto = w !== 'pistol';
    const trigger = auto ? input.firing : input.fired;
    if (trigger && canFire(p.loadout, state.time)) {
      const result = resolveShot(state, p, p.yaw, p.pitch, rng);
      view.setFlash();
      sfx.shoot(w);
      if (result.hit) {
        if (result.head) sfx.headshot();
        else sfx.hit();
        if (result.target && !result.target.alive) sfx.kill();
      }
    } else if (trigger && p.loadout.weapons[w].mag === 0 && p.loadout.reloading <= 0) {
      sfx.dryFire();
      startReload(p.loadout);
    }
    if (input.wantReload && startReload(p.loadout)) sfx.reload();
    if (input.wantGrenade) throwGrenade(state, p, p.yaw, p.pitch);
    if (input.wantSlot) switchSlot(p.loadout, input.wantSlot);
  }

  // Bots move and fight only while the round is live.
  if (state.phase === PHASE.LIVE) {
    for (const a of state.agents) updateBot(state, a, dt, rng);
  }
  tickGrenades(state, dt);
  tickRounds(state, dt, input);
  input.endTick();
}

// ---- the frame loop ------------------------------------------------------

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // a hitch never spirals the sim
  acc += dt;
  let steps = 0;
  while (acc >= TICK && steps < 5) {
    stepSim(TICK);
    acc -= TICK;
    steps++;
  }
  if (steps === 5) acc = 0;
  const spread = spreadOf(state.player.loadout, speedOf(state.player), state.player.y > 0.01, state.player.crouch);
  hud.update(spread);
  view.render(state, dt);
}

// Pause overlay: shown when the pointer unlocks mid-round.
document.addEventListener('pointerlockchange', () => {
  const paused = !input.locked && started && (state.phase === PHASE.LIVE || state.phase === PHASE.FREEZE) && !hud.buyOpen;
  document.getElementById('pause-overlay').hidden = !paused;
});

requestAnimationFrame(frame);

// ---- demo hooks (used by the screenshot script; harmless in play) --------
window.__DUSTFALL__ = {
  state,
  start() {
    if (!started) {
      started = true;
      startMatch(state);
    }
  },
  // Skip the freeze phase and go live immediately.
  goLive() {
    state.phase = PHASE.LIVE;
    state.roundLeft = 100;
  },
  teleport(x, z, yaw, pitch) {
    const p = state.player;
    p.x = x;
    p.z = z;
    p.yaw = yaw ?? p.yaw;
    p.pitch = pitch ?? 0;
  },
  giveMoney(n) {
    state.money += n;
  },
  openBuy() {
    hud.setBuy(true);
  },
  plantAt(site) {
    state.bomb.state = 'planted';
    state.bomb.site = site;
    state.bomb.x = site === 'A' ? -11 : 11;
    state.bomb.z = site === 'A' ? -12 : 12;
    state.bomb.fuseLeft = 32;
  },
  // Move the nearest enemy bot in front of the player for a combat shot.
  placeFoe(dist) {
    const foe = state.agents.find((a) => a.team === 'sentinel' && a.alive);
    if (!foe) return;
    const f = forwardOf(state.player.yaw);
    foe.x = state.player.x + f.x * dist;
    foe.z = state.player.z + f.z * dist;
    foe.yaw = state.player.yaw + Math.PI;
    foe.bot.mode = 'hold';
    foe.bot.holdFire = true; // posed for the screenshot — does not shoot
  },
  // Fire one shot from the player's current aim (for screenshots).
  shootOnce() {
    if (state.player.alive && canFire(state.player.loadout, state.time)) {
      resolveShot(state, state.player, state.player.yaw, state.player.pitch, rng);
      view.setFlash();
    }
  },
  lock() {
    input.lock();
  },
};
