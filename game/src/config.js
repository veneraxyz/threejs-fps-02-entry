// DUSTFALL — tuning table. One place for every number the sim reads, so a
// balance pass never has to hunt through the code. All times in seconds,
// all distances in metres, all money in dollars.

export const TICK = 1 / 60; // fixed simulation step
export const MATCH_WIN_ROUNDS = 8;
export const FREEZE_TIME = 8; // buy phase at the start of every round
export const ROUND_TIME = 100; // live round length
export const BOMB_FUSE = 40; // seconds from plant to detonation
export const PLANT_TIME = 3; // channel to plant
export const DEFUSE_TIME = 5; // channel to defuse
export const ROUND_END_TIME = 4; // banner before the next round

export const ECONOMY = {
  start: 800,
  kill: 300,
  win: 3250,
  loss: 1400,
  lossStreakBonus: 500,
  maxLossBonus: 2900,
  plant: 300,
  defuse: 300,
};

export const PLAYER = {
  radius: 0.35,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  height: 1.8,
  walkSpeed: 5.2,
  crouchSpeed: 2.6,
  accel: 42,
  friction: 9,
  airAccel: 8,
  jumpSpeed: 5.4,
  gravity: 14.5,
  health: 100,
};

export const BOT = {
  radius: 0.35,
  walkSpeed: 4.1,
  runSpeed: 5.0,
  eyeHeight: 1.55,
  health: 100,
  viewDistance: 42,
  viewHalfAngle: 1.05, // ~60 deg half cone
  hearRadius: 26,
  burstMin: 2,
  burstMax: 4,
  burstGap: 0.55,
  shotGap: 0.13,
  baseSpread: 0.028,
  aimLockTime: 0.9, // seconds of sight before aim error halves
  damageNear: 16,
  damageFar: 9,
  damageFalloff: 30,
  strafePeriod: 0.9,
};

// Weapons: damage is per body hit; head multiplies it. spread is the base
// cone half-angle in radians; movement and bloom grow it (see weapons.js).
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 34, headMult: 2.0,
    mag: 12, reserve: 48, auto: false, fireInterval: 0.18, reloadTime: 1.6,
    spread: 0.011, moveSpread: 0.05, bloom: 0.006, bloomMax: 0.03,
    recoil: 0.011, kick: 0.35, range: 60, pellets: 1,
  },
  rifle: {
    id: 'rifle', name: 'VK-47', price: 2700, damage: 36, headMult: 2.5,
    mag: 30, reserve: 90, auto: true, fireInterval: 0.1, reloadTime: 2.4,
    spread: 0.014, moveSpread: 0.075, bloom: 0.004, bloomMax: 0.045,
    recoil: 0.016, kick: 0.55, range: 80, pellets: 1,
  },
  smg: {
    id: 'smg', name: 'Kestrel-9', price: 1500, damage: 26, headMult: 2.0,
    mag: 32, reserve: 96, auto: true, fireInterval: 0.07, reloadTime: 2.0,
    spread: 0.019, moveSpread: 0.055, bloom: 0.003, bloomMax: 0.05,
    recoil: 0.01, kick: 0.4, range: 50, pellets: 1,
  },
};

export const GRENADE = {
  price: 300, fuse: 1.5, radius: 6.5, maxDamage: 120,
  throwSpeed: 13, upSpeed: 4.5, bounce: 0.45, gravity: 14.5,
};

export const TEAMS = {
  vanguard: { name: 'Vanguard', color: 0x2f7fb8, label: 'ATK' },
  sentinel: { name: 'Sentinels', color: 0xc8542e, label: 'DEF' },
};
