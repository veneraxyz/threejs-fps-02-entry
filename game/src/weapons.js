// DUSTFALL — weapons: firing, reloading, spread and recoil. Spread is the
// heart of the gunplay: it grows with movement and with every shot (bloom),
// and shrinks when the shooter stops and aims — so stopping to aim pays,
// and firing on the move is punished, exactly as the bounty asks.

import { WEAPONS } from './config.js';
import { clamp } from './utils.js';

export function currentWeapon(loadout) {
  return WEAPONS[loadout.current];
}

export function weaponState(loadout) {
  return loadout.weapons[loadout.current];
}

// The shooter's current spread cone half-angle (radians).
export function spreadOf(loadout, speed, airborne, crouch) {
  const w = currentWeapon(loadout);
  let s = w.spread + loadout.bloom;
  const move = speed / 5.2;
  s += w.moveSpread * move * move;
  if (airborne) s += 0.06;
  if (crouch) s *= 0.75;
  return s;
}

// Can the weapon fire right now? (Loaded, not reloading, cooldown done.)
export function canFire(loadout, time) {
  const ws = weaponState(loadout);
  return (
    loadout.reloading <= 0 &&
    loadout.fireCooldown <= 0 &&
    ws.mag > 0 &&
    time - loadout.lastShotAt >= 0
  );
}

// Fire one shot: consumes a round, sets the cooldown, grows bloom and
// recoil. Returns the weapon definition for the caller to resolve the hit.
export function fireShot(loadout, time) {
  const w = currentWeapon(loadout);
  const ws = weaponState(loadout);
  ws.mag -= 1;
  loadout.fireCooldown = w.fireInterval;
  loadout.lastShotAt = time;
  loadout.bloom = Math.min(w.bloomMax, loadout.bloom + w.bloom);
  loadout.recoilPitch += w.recoil;
  return w;
}

export function startReload(loadout) {
  const w = currentWeapon(loadout);
  const ws = weaponState(loadout);
  if (loadout.reloading > 0) return false;
  if (ws.mag >= w.mag || ws.reserve <= 0) return false;
  loadout.reloading = w.reloadTime;
  return true;
}

// Advance cooldowns and recovery. Call once per tick.
export function tickLoadout(loadout, dt) {
  if (loadout.fireCooldown > 0) loadout.fireCooldown -= dt;
  if (loadout.reloading > 0) {
    loadout.reloading -= dt;
    if (loadout.reloading <= 0) {
      const w = currentWeapon(loadout);
      const ws = weaponState(loadout);
      const need = w.mag - ws.mag;
      const take = Math.min(need, ws.reserve);
      ws.mag += take;
      ws.reserve -= take;
    }
  }
  // Bloom decays; recoil pitch recovers toward zero.
  loadout.bloom = Math.max(0, loadout.bloom - dt * 0.05);
  loadout.recoilPitch = Math.max(0, loadout.recoilPitch - dt * 0.09);
}

export function giveWeapon(loadout, id) {
  const w = WEAPONS[id];
  if (!w) return false;
  if (!loadout.weapons[id]) {
    loadout.weapons[id] = { mag: w.mag, reserve: w.reserve };
  } else {
    loadout.weapons[id].reserve = Math.min(w.reserve, loadout.weapons[id].reserve + w.mag);
  }
  loadout.current = id;
  loadout.reloading = 0;
  return true;
}

export function switchSlot(loadout, slot) {
  const order = ['pistol', 'rifle', 'smg'];
  const id = order[slot - 1];
  if (id && loadout.weapons[id] && loadout.current !== id) {
    loadout.current = id;
    loadout.reloading = 0;
    loadout.fireCooldown = Math.max(loadout.fireCooldown, 0.15);
    return true;
  }
  return false;
}

export function ammoText(loadout) {
  const ws = weaponState(loadout);
  return { mag: ws.mag, reserve: ws.reserve, reloading: loadout.reloading > 0 };
}
