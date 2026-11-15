// DUSTFALL — the single state object. Every module reads and writes this
// one object; nothing keeps a second copy of a value the sim owns. The
// renderer reads it too, but only the sim (fixed step) mutates it.

import { ECONOMY, PLAYER, WEAPONS, GRENADE } from './config.js';
import { SPAWNS } from './map.js';

export const PHASE = {
  MENU: 'menu', // start screen, pointer unlocked
  FREEZE: 'freeze', // buy phase, players locked in spawn
  LIVE: 'live', // round in progress
  ROUND_END: 'roundEnd', // banner, then next round
  MATCH_END: 'matchEnd', // final screen
};

export const BOT_NAMES = {
  vanguard: ['Rook', 'Sable'],
  sentinel: ['Kestrel', 'Havoc', 'Nomad', 'Vex'],
};

export function freshLoadout() {
  return {
    weapons: {
      pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
    },
    current: 'pistol',
    grenades: 0,
    reloading: 0,
    fireCooldown: 0,
    bloom: 0,
    recoilPitch: 0,
    lastShotAt: -10,
  };
}

export function freshAgent(id, name, team, spawn) {
  return {
    id,
    name,
    team,
    alive: true,
    health: PLAYER.health,
    x: spawn.x,
    z: spawn.z,
    y: 0, // feet height above ground (jump)
    vy: 0,
    vx: 0,
    vz: 0,
    yaw: spawn.yaw,
    pitch: 0,
    crouch: false,
    moving: false,
    loadout: freshLoadout(),
    // Bot-only fields (the player ignores them):
    bot: null,
  };
}

export function freshBotState(role) {
  return {
    role, // 'siteA' | 'siteB' | 'mid' | 'attackA' | 'attackB' | 'roam'
    mode: 'move', // move | hold | engage | defuse | investigate
    path: [],
    pathIndex: 0,
    holdUntil: 0,
    targetId: null,
    seenAt: -10, // last time the bot saw its target
    aimError: 0.05,
    burstLeft: 0,
    nextShotAt: 0,
    lastKnown: null, // {x, z} last known enemy position
    strafeDir: 1,
    strafeAt: 0,
    channelAt: -1, // defuse channel start time
  };
}

export function createState() {
  const s = {
    phase: PHASE.MENU,
    time: 0, // sim clock, seconds since match start
    round: 1,
    score: { vanguard: 0, sentinel: 0 },
    lossStreak: 0,
    money: ECONOMY.start,
    freezeLeft: 0,
    roundLeft: 0,
    roundEndLeft: 0,
    roundWinner: null,
    roundReason: '',
    player: freshAgent('you', 'You', 'vanguard', SPAWNS.vanguard[0]),
    agents: [], // bots (allies + enemies); the player is separate
    grenades: [],
    bomb: {
      state: 'carried', // carried | planted | exploded | defused
      site: null,
      x: 0,
      z: 0,
      fuseLeft: 0,
      plantProgress: 0,
      defuseProgress: 0,
      defuserId: null,
    },
    plantChannel: 0, // player plant progress 0..1
    feed: [], // kill feed entries {text, at, good}
    noises: [], // gunshot sounds bots can hear {x, z, at, team}
    shake: 0, // camera shake magnitude
    flash: 0, // damage flash 0..1
    hitmarkAt: -10,
    hitmarkKill: false,
    kills: 0,
    deaths: 0,
    rngSeed: 1337,
  };
  return s;
}

// Spawn the bot roster for a round: 2 Vanguard allies, 4 Sentinels.
export function spawnBots(state) {
  state.agents = [];
  for (let i = 0; i < 2; i++) {
    const a = freshAgent(`ally${i}`, BOT_NAMES.vanguard[i], 'vanguard', SPAWNS.vanguard[i + 1]);
    a.bot = freshBotState(i === 0 ? 'attackA' : 'attackB');
    state.agents.push(a);
  }
  const roles = ['siteA', 'siteB', 'mid', 'siteB'];
  for (let i = 0; i < 4; i++) {
    const a = freshAgent(`foe${i}`, BOT_NAMES.sentinel[i], 'sentinel', SPAWNS.sentinel[i]);
    a.bot = freshBotState(roles[i]);
    // Defenders start with rifles.
    a.loadout.weapons.rifle = { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve };
    a.loadout.current = 'rifle';
    state.agents.push(a);
  }
}

export function resetRound(state) {
  state.player = freshAgent('you', 'You', 'vanguard', SPAWNS.vanguard[0]);
  // Keep the player's bought weapons between rounds; only refill the
  // starting pistol when the player owns nothing else.
  state.player.loadout = state.keepLoadout || freshLoadout();
  state.keepLoadout = null;
  spawnBots(state);
  state.grenades = [];
  state.bomb = {
    state: 'carried', site: null, x: 0, z: 0, fuseLeft: 0,
    plantProgress: 0, defuseProgress: 0, defuserId: null,
  };
  state.plantChannel = 0;
  state.shake = 0;
  state.flash = 0;
}

export function aliveCount(state, team) {
  let n = state.player.team === team && state.player.alive ? 1 : 0;
  for (const a of state.agents) if (a.team === team && a.alive) n++;
  return n;
}

export function pushFeed(state, text, good) {
  state.feed.push({ text, at: state.time, good: !!good });
  if (state.feed.length > 6) state.feed.shift();
}

export { GRENADE };
