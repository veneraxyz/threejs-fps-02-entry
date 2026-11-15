// DUSTFALL — the HUD: DOM overlays, the buy menu and the minimap. The HUD
// never owns game state: update() reads the state once per frame and only
// touches the DOM when a value actually changed.

import { PHASE } from './state.js';
import { WEAPONS, GRENADE, ECONOMY } from './config.js';
import { MAP_BOUNDS, WALLS, SITES, CRATES } from './map.js';
import { ammoText, currentWeapon } from './weapons.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud(state, hooks) {
  const hud = {
    buyOpen: false,
    last: {},
    minimap: el('minimap'),
    mctx: null,
  };
  if (hud.minimap) hud.mctx = hud.minimap.getContext('2d');

  // ---- buy menu (built once from the weapon table) ----
  const buyList = el('buy-list');
  if (buyList) {
    const items = [
      { id: 'rifle', name: WEAPONS.rifle.name, desc: '36 dmg · 30 rounds · full-auto', price: WEAPONS.rifle.price },
      { id: 'smg', name: WEAPONS.smg.name, desc: '26 dmg · 32 rounds · fast fire', price: WEAPONS.smg.price },
      { id: 'grenade', name: 'HE Grenade', desc: 'Blast radius 6.5 m · max 2 carried', price: GRENADE.price },
      { id: 'pistol-ammo', name: 'Pistol ammo', desc: 'Refill pistol reserve', price: 200 },
    ];
    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      row.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
      row.addEventListener('click', () => hooks.onBuy(item.id));
      buyList.appendChild(row);
    }
  }

  el('play').addEventListener('click', hooks.onStart);
  el('resume').addEventListener('click', hooks.onResume);
  el('restart').addEventListener('click', hooks.onRestart);
  el('buy-close').addEventListener('click', () => hud.setBuy(false));

  hud.setBuy = (open) => {
    hud.buyOpen = open && state.phase === PHASE.FREEZE;
    el('buy-menu').hidden = !hud.buyOpen;
    if (hud.buyOpen) hooks.onBuyOpen();
  };
  hud.toggleBuy = () => hud.setBuy(!hud.buyOpen);

  const setText = (id, value) => {
    if (hud.last[id] !== value) {
      hud.last[id] = value;
      el(id).textContent = value;
    }
  };
  const setWidth = (id, pct) => {
    const v = Math.round(pct * 100);
    if (hud.last[id] !== v) {
      hud.last[id] = v;
      el(id).style.width = `${v}%`;
    }
  };

  function drawMinimap() {
    const c = hud.mctx;
    if (!c) return;
    const W = 168;
    const H = 120;
    const sx = W / (MAP_BOUNDS.x1 - MAP_BOUNDS.x0);
    const sz = H / (MAP_BOUNDS.z1 - MAP_BOUNDS.z0);
    const px = (x) => (x - MAP_BOUNDS.x0) * sx;
    const pz = (z) => (z - MAP_BOUNDS.z0) * sz;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(20,22,26,0.85)';
    c.fillRect(0, 0, W, H);
    for (const w of WALLS) {
      c.fillStyle = '#3a3f46';
      c.fillRect(px(w.x0), pz(w.z0), (w.x1 - w.x0) * sx, (w.z1 - w.z0) * sz);
    }
    for (const cr of CRATES) {
      c.fillStyle = '#2c2f34';
      c.fillRect(px(cr.x0), pz(cr.z0), (cr.x1 - cr.x0) * sx, (cr.z1 - cr.z0) * sz);
    }
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      c.fillStyle = key === 'A' ? 'rgba(46,127,122,0.8)' : 'rgba(217,154,43,0.8)';
      c.fillRect(px(s.x0), pz(s.z0), (s.x1 - s.x0) * sx, (s.z1 - s.z0) * sz);
      c.fillStyle = '#e9e6df';
      c.font = 'bold 10px sans-serif';
      c.fillText(key, px((s.x0 + s.x1) / 2) - 3, pz((s.z0 + s.z1) / 2) + 3);
    }
    // Teammates.
    for (const a of state.agents) {
      if (!a.alive || a.team !== 'vanguard') continue;
      c.fillStyle = '#2f7fb8';
      c.beginPath();
      c.arc(px(a.x), pz(a.z), 3, 0, 7);
      c.fill();
    }
    // Planted bomb.
    if (state.bomb.state === 'planted') {
      c.fillStyle = '#ff5a3c';
      c.beginPath();
      c.arc(px(state.bomb.x), pz(state.bomb.z), 4, 0, 7);
      c.fill();
    }
    // The player: a wedge rotated by yaw. The wedge is drawn pointing up
    // (north on the map) and canvas rotation is clockwise-positive, so a
    // rotation of exactly the sim yaw points it along the facing vector.
    const p = state.player;
    if (p.alive) {
      c.save();
      c.translate(px(p.x), pz(p.z));
      c.rotate(p.yaw);
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(0, -6);
      c.lineTo(4, 5);
      c.lineTo(-4, 5);
      c.closePath();
      c.fill();
      c.restore();
    }
  }

  hud.update = (spread) => {
    const p = state.player;
    const inGame = state.phase !== PHASE.MENU && state.phase !== PHASE.MATCH_END;
    el('hud').hidden = !inGame;
    el('start-overlay').hidden = state.phase !== PHASE.MENU;
    el('match-overlay').hidden = state.phase !== PHASE.MATCH_END;

    if (!inGame) {
      if (state.phase === PHASE.MATCH_END) {
        const won = state.score.vanguard > state.score.sentinel;
        setText('match-title', won ? 'VICTORY' : 'DEFEAT');
        setText('match-score', `${state.score.vanguard} — ${state.score.sentinel}`);
        setText('match-stats', `${state.kills} kills · ${state.deaths} deaths · round ${state.round}`);
      }
      return;
    }

    // Vital signs.
    setText('health-num', `${Math.max(0, Math.ceil(p.health))}`);
    setWidth('health-bar', Math.max(0, p.health) / 100);
    el('health').classList.toggle('low', p.health <= 30 && p.alive);
    const ammo = ammoText(p.loadout);
    setText('ammo-mag', `${ammo.mag}`);
    setText('ammo-reserve', `/ ${ammo.reserve}`);
    el('ammo').classList.toggle('empty', ammo.mag === 0);
    setText('weapon-name', currentWeapon(p.loadout).name + (p.loadout.grenades > 0 ? ` · ${p.loadout.grenades}× HE` : ''));
    setText('money', `$${state.money}`);
    setText('round-num', `ROUND ${state.round}`);
    setText('score-v', `${state.score.vanguard}`);
    setText('score-s', `${state.score.sentinel}`);
    const vAlive = (p.alive ? 1 : 0) + state.agents.filter((a) => a.alive && a.team === 'vanguard').length;
    const sAlive = state.agents.filter((a) => a.alive && a.team === 'sentinel').length;
    setText('alive-v', `${vAlive} alive`);
    setText('alive-s', `${sAlive} alive`);

    // Timer.
    const t = state.phase === PHASE.FREEZE ? state.freezeLeft : Math.max(0, state.roundLeft);
    const mm = Math.floor(t / 60);
    const ss = Math.floor(t % 60);
    setText('timer', `${mm}:${ss.toString().padStart(2, '0')}`);
    setText('phase-label', state.phase === PHASE.FREEZE ? 'BUY PHASE — press B' : state.phase === PHASE.ROUND_END ? 'ROUND OVER' : 'LIVE');
    el('timer').classList.toggle('urgent', t <= 10 && state.phase === PHASE.LIVE);

    // Crosshair spread + hitmarker.
    const gap = 6 + spread * 900;
    el('crosshair').style.setProperty('--gap', `${gap.toFixed(1)}px`);
    const hitAge = state.time - state.hitmarkAt;
    el('hitmarker').classList.toggle('on', hitAge < 0.18);
    el('hitmarker').classList.toggle('kill', state.hitmarkKill && hitAge < 0.18);

    // Damage flash.
    el('damage-flash').style.opacity = state.flash.toFixed(2);

    // Bomb status.
    const bomb = state.bomb;
    const bombEl = el('bomb-status');
    // The fuse bar shows only once the bomb is planted; while it is
    // carried the hint line below tells the player what to do.
    if (bomb.state === 'planted') {
      bombEl.hidden = false;
      setText('bomb-label', `BOMB AT ${bomb.site} — ${bomb.fuseLeft.toFixed(0)}s`);
      setWidth('bomb-bar', bomb.fuseLeft / 40);
      el('bomb-bar').classList.toggle('defusing', bomb.defuseProgress > 0);
    } else {
      bombEl.hidden = true;
    }

    // Plant channel.
    el('plant-bar-wrap').hidden = state.plantChannel <= 0;
    setWidth('plant-bar', state.plantChannel);

    // Context hint.
    let hint = '';
    if (!p.alive) hint = 'You are dead — spectating until next round';
    else if (bomb.state === 'carried') {
      hint = 'Carry the bomb to site A or B — hold E to plant';
    } else if (bomb.state === 'planted') hint = 'Bomb planted — defend it until it blows';
    setText('hint', hint);

    // Kill feed.
    const feedEl = el('feed');
    const fresh = state.feed.filter((f) => state.time - f.at < 5);
    const feedKey = fresh.map((f) => f.text).join('|');
    if (hud.last.feed !== feedKey) {
      hud.last.feed = feedKey;
      feedEl.innerHTML = '';
      for (const f of fresh) {
        const d = document.createElement('div');
        d.className = f.good ? 'feed-good' : 'feed-bad';
        d.textContent = f.text;
        feedEl.appendChild(d);
      }
    }

    // Round banner.
    const banner = el('round-banner');
    if (state.phase === PHASE.ROUND_END) {
      banner.hidden = false;
      const won = state.roundWinner === 'vanguard';
      setText('banner-title', won ? 'ROUND WON' : 'ROUND LOST');
      setText('banner-sub', state.roundReason);
      banner.classList.toggle('win', won);
      banner.classList.toggle('lose', !won);
    } else {
      banner.hidden = true;
    }

    // Death overlay.
    el('death-overlay').hidden = p.alive || state.phase === PHASE.ROUND_END;

    // Buy menu affordability.
    if (hud.buyOpen) {
      const rows = buyList.querySelectorAll('.buy-row');
      const prices = [WEAPONS.rifle.price, WEAPONS.smg.price, GRENADE.price, 200];
      rows.forEach((row, i) => row.classList.toggle('poor', state.money < prices[i]));
      setText('buy-money', `Balance: $${state.money}`);
    }

    drawMinimap();
  };

  return hud;
}
