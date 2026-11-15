// DUSTFALL — the round machine: freeze time, live play, round end, match
// end. It owns the economy, the buy menu's rules and the bomb's lifecycle.
// A round ends by elimination, by the bomb exploding, by a defuse, or by
// the timer running out (defenders win on time).

import {
  FREEZE_TIME, ROUND_TIME, BOMB_FUSE, PLANT_TIME, DEFUSE_TIME,
  ROUND_END_TIME, MATCH_WIN_ROUNDS, ECONOMY, WEAPONS, GRENADE,
} from './config.js';
import { PHASE, resetRound, aliveCount, pushFeed } from './state.js';
import { siteAt } from './map.js';
import { giveWeapon } from './weapons.js';
import { sfx } from './audio.js';

export function startMatch(state) {
  state.score = { vanguard: 0, sentinel: 0 };
  state.lossStreak = 0;
  state.money = ECONOMY.start;
  state.round = 1;
  state.kills = 0;
  state.deaths = 0;
  state.feed = [];
  startRound(state);
}

export function startRound(state) {
  resetRound(state);
  state.phase = PHASE.FREEZE;
  state.freezeLeft = FREEZE_TIME;
  state.roundLeft = ROUND_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.noises = [];
}

function endRound(state, winner, reason) {
  if (state.phase === PHASE.ROUND_END || state.phase === PHASE.MATCH_END) return;
  state.phase = PHASE.ROUND_END;
  state.roundEndLeft = ROUND_END_TIME;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  const playerWon = winner === 'vanguard';
  if (playerWon) {
    state.money += ECONOMY.win;
    state.lossStreak = 0;
    sfx.roundWin();
  } else {
    const bonus = Math.min(ECONOMY.maxLossBonus, ECONOMY.loss + state.lossStreak * ECONOMY.lossStreakBonus);
    state.money += bonus;
    state.lossStreak += 1;
    sfx.roundLose();
  }
  pushFeed(state, `${winner === 'vanguard' ? 'Vanguard' : 'Sentinels'} take round ${state.round} — ${reason}`, playerWon);
  // Keep the player's loadout for the next round (weapons persist).
  state.keepLoadout = state.player.loadout;
}

// Buy an item during the freeze phase. Returns a status string for the HUD.
export function buyItem(state, id) {
  if (state.phase !== PHASE.FREEZE) return 'Buy only during the freeze phase';
  const p = state.player;
  if (id === 'grenade') {
    if (p.loadout.grenades >= 2) return 'Already carrying 2 grenades';
    if (state.money < GRENADE.price) return 'Not enough money';
    state.money -= GRENADE.price;
    p.loadout.grenades += 1;
    sfx.buy();
    return `Bought HE grenade — $${GRENADE.price}`;
  }
  const w = WEAPONS[id];
  if (!w) return 'Unknown item';
  if (p.loadout.weapons[id]) return `Already own the ${w.name}`;
  if (state.money < w.price) return `Not enough money ($${w.price})`;
  state.money -= w.price;
  giveWeapon(p.loadout, id);
  sfx.buy();
  return `Bought ${w.name} — $${w.price}`;
}

// One tick of the round machine. Returns nothing; the sim calls it after
// moving the agents.
export function tickRounds(state, dt, input) {
  if (state.phase === PHASE.FREEZE) {
    state.freezeLeft -= dt;
    if (state.freezeLeft <= 0) {
      state.phase = PHASE.LIVE;
      state.roundLeft = ROUND_TIME;
    }
    return;
  }
  if (state.phase !== PHASE.LIVE) {
    if (state.phase === PHASE.ROUND_END) {
      state.roundEndLeft -= dt;
      if (state.roundEndLeft <= 0) {
        if (state.score.vanguard >= MATCH_WIN_ROUNDS || state.score.sentinel >= MATCH_WIN_ROUNDS) {
          state.phase = PHASE.MATCH_END;
        } else {
          state.round += 1;
          startRound(state);
        }
      }
    }
    return;
  }

  state.roundLeft -= dt;
  const bomb = state.bomb;

  // Bomb fuse.
  if (bomb.state === 'planted') {
    bomb.fuseLeft -= dt;
    if (bomb.defuseProgress >= 1) {
      bomb.state = 'defused';
      sfx.defuse();
      endRound(state, 'sentinel', 'bomb defused');
      return;
    }
    if (bomb.fuseLeft <= 0) {
      bomb.state = 'exploded';
      sfx.explosion();
      state.shake = 1;
      endRound(state, 'vanguard', 'bomb detonated');
      return;
    }
  }

  // Player plant channel: hold E inside a site while carrying the bomb.
  const p = state.player;
  if (bomb.state === 'carried' && p.alive && input.interacting()) {
    const site = siteAt(p.x, p.z);
    if (site) {
      state.plantChannel += dt / PLANT_TIME;
      if (state.plantChannel >= 1) {
        bomb.state = 'planted';
        bomb.site = site;
        bomb.x = p.x;
        bomb.z = p.z;
        bomb.fuseLeft = BOMB_FUSE;
        bomb.defuseProgress = 0;
        state.plantChannel = 0;
        state.money += ECONOMY.plant;
        sfx.plant();
        pushFeed(state, 'You planted the bomb at site ' + site, true);
      }
    } else {
      state.plantChannel = 0;
    }
  } else {
    state.plantChannel = 0;
  }

  // A sentinel's defuse channel only counts while the bot stands at the
  // bomb; bots.js sets defuseProgress and clears it when interrupted.
  if (bomb.state === 'planted' && bomb.defuserId) {
    const defuser = state.agents.find((a) => a.id === bomb.defuserId);
    if (!defuser || !defuser.alive) {
      bomb.defuserId = null;
      bomb.defuseProgress = 0;
    }
  }

  // Elimination / timeout.
  const vAlive = aliveCount(state, 'vanguard');
  const sAlive = aliveCount(state, 'sentinel');
  if (vAlive === 0 && bomb.state !== 'planted') {
    endRound(state, 'sentinel', 'Vanguard eliminated');
    return;
  }
  if (sAlive === 0) {
    endRound(state, 'vanguard', bomb.state === 'planted' ? 'Sentinels eliminated' : 'Sentinels eliminated');
    return;
  }
  if (state.roundLeft <= 0) {
    if (bomb.state === 'planted') {
      // The round continues until the fuse ends; the timer stops mattering.
      state.roundLeft = 0;
    } else {
      endRound(state, 'sentinel', 'time expired');
    }
  }
}
