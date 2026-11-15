// The player character: movement, context actions, tools, player switching.
import { G, TILE, randRange } from './game.js';
import { DATA } from './data.js';
import { input } from './input.js';
import { drawSprite, animFrame, slotSwap, hasSprite } from './sprites.js';
import { idx, inBounds, boxBlocked, debrisAt, plotAt, ground, obj, choppable } from './world.js';
import { addJob, getJob, workJob } from './jobs.js';
import * as farm from './farm.js';
import { catNear, petCat } from './cats.js';
import { decorAction } from './decorations.js';
import { emit, poof, burst } from './particles.js';
import { sfx } from './audio.js';

export const TOOLS = [
  { id: 'hand', name: 'Hands', icon: 'tool_hand', allow: null },
  { id: 'axe', name: 'Clearing tools', icon: 'tool_axe', allow: ['clear'] },
  { id: 'hoe', name: 'Hoe', icon: 'tool_hoe', allow: ['till'] },
  { id: 'seeds', name: 'Seed bag', icon: 'tool_seeds', allow: ['plant'] },
  { id: 'can', name: 'Watering can', icon: 'tool_can', allow: ['water'] },
];
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const anim = { moving: false, working: false, t: 0, workSound: 0 };

export const playerCfg = () => DATA.playersConfig.players[G.state.activePlayer] || DATA.playersConfig.players[0];
export const playerName = () => playerCfg()?.name || 'Player';
let swapCache = { key: null, val: null };
function playerSwap() {
  const cfg = playerCfg();
  const k = JSON.stringify(cfg?.colors || {});
  if (swapCache.key !== k) swapCache = { key: k, val: slotSwap('player', cfg?.colors) };
  return swapCache.val;
}

export function facingPoint() {
  const p = G.state.player, [dx, dy] = DIRV[p.dir];
  return { x: p.x + dx * 12, y: p.y - 4 + dy * 12 };
}
export function facingTile() {
  const f = facingPoint();
  const x = Math.floor(f.x / TILE), y = Math.floor(f.y / TILE);
  return inBounds(x, y) ? idx(x, y) : -1;
}
export function selectedSeedKey() {
  const p = G.state.player, owned = farm.ownedSeedKeys();
  if (p.seedKey && farm.seedCount(p.seedKey) > 0) return p.seedKey;
  return owned[0] || null;
}
export function cycleSeed(d) {
  const owned = farm.ownedSeedKeys();
  if (!owned.length) return null;
  const cur = owned.indexOf(selectedSeedKey());
  G.state.player.seedKey = owned[(cur + d + owned.length) % owned.length];
  return G.state.player.seedKey;
}

// What would pressing/holding A do right now?
export function resolveAction(ignoreCats = false) {
  const st = G.state, tool = TOOLS[st.player.tool] || TOOLS[0];
  const allow = t => !tool.allow || tool.allow.includes(t);
  const fp = facingPoint();
  const cat = tool.id === 'hand' && !ignoreCats ? catNear(fp.x, fp.y) : null;
  if (cat) return { kind: 'pet', cat, label: `Pet ${cat.cfg.name}` };
  const t = facingTile();
  if (t < 0) return null;
  const o = obj(t);
  if (tool.id === 'hand') {
    if (o === 'crate') return { kind: 'crate', label: 'Shipping crate: sell crops' };
    if (o === 'shop') return { kind: 'shop', label: 'Seed shop' };
    if (o === 'cabin') return { kind: 'cabin', label: 'Customize the cabin' };
    const da = decorAction(t);
    if (da) return da;
  }
  const crop = st.crops[t];
  if (crop && crop.stage >= 3) return { kind: 'harvest', tile: t, crop, label: `Harvest ${farm.cropName(crop.id)}` };
  const d = debrisAt(t);
  if (d && allow('clear')) return { kind: 'work', type: 'clear', tile: t, label: `Clear ${DATA.debris[d]?.name || 'debris'}` };
  if (choppable(t) && allow('clear')) return { kind: 'work', type: 'clear', tile: t, label: 'Chop down tree' };
  const plot = plotAt(t);
  if (ground(t) === 'g' && !o && allow('till')) {
    if (plot) return { kind: 'work', type: 'till', tile: t, label: 'Till soil' };
    if (tool.id === 'hoe') return { kind: 'info', tile: t, label: 'Make a plot first (plan mode)' };
  }
  if (ground(t) === 't' && !crop && allow('plant')) {
    const k = selectedSeedKey();
    if (k) return { kind: 'work', type: 'plant', tile: t, seedKey: k, label: `Plant ${farm.seedLabel(k)}` };
    return { kind: 'info', tile: t, label: 'No seeds! Visit the shop' };
  }
  if (crop && crop.stage < 3) {
    if (!(crop.wetUntil > st.simTime) && allow('water')) return { kind: 'work', type: 'water', tile: t, crop, label: `Water ${farm.cropName(crop.id)}` };
    return { kind: 'inspect', tile: t, crop, label: farm.cropName(crop.id) };
  }
  return null;
}

let lastAction = null;
export function currentAction() { return lastAction; }

export function updatePlayer(dt, handlers) {
  const st = G.state, p = st.player;
  anim.t += dt;
  const B = DATA.balance;
  const speed = B.player.speedTilesPerSec * TILE;
  let { x: ax, y: ay } = input.axis;
  anim.moving = false;
  if (G.mode === 'play' && !(input.down('confirm') && anim.working)) {
    if (Math.abs(ax) > 0.05 || Math.abs(ay) > 0.05) {
      const nx = p.x + ax * speed * dt, ny = p.y + ay * speed * dt;
      if (!boxBlocked(nx, p.y - 3, 5, 3)) p.x = nx;
      if (!boxBlocked(p.x, ny - 3, 5, 3)) p.y = ny;
      if (Math.abs(ax) > Math.abs(ay)) p.dir = ax > 0 ? 'right' : 'left'; else p.dir = ay > 0 ? 'down' : 'up';
      anim.moving = true;
    }
  }
  // keep working while A is held, even if a helpful cat wanders into the way
  const wasWorking = anim.working && input.down('confirm');
  anim.working = false;
  if (G.mode !== 'play') { lastAction = null; return; }
  const act = resolveAction(wasWorking);
  lastAction = act;
  if (!act) return;
  if (input.pressed('confirm')) {
    switch (act.kind) {
      case 'pet': petCat(act.cat); return;
      case 'crate': handlers.crate(); return;
      case 'shop': handlers.shop(); return;
      case 'cabin': handlers.cabin(); return;
      case 'decor': act.run(handlers); return;
      case 'harvest': { const r = farm.harvest(act.tile); if (r) { sfx('harvest'); burst((act.tile % st.map.w) * TILE + 8, Math.floor(act.tile / st.map.w) * TILE + 8, { n: 6, sprite: 'fx_leaf' }); } return; }
    }
  }
  if (act.kind === 'work' && input.down('confirm')) {
    let j = getJob(act.type, act.tile);
    if (!j) j = addJob(act.type, act.tile, act.type === 'plant' ? { seedKey: act.seedKey, manual: true } : {});
    if (!j) return;
    anim.working = true;
    const done = workJob(j, B.player.workRate * dt, 'player');
    anim.workSound -= dt;
    if (anim.workSound <= 0) { anim.workSound = 0.32; sfx(act.type === 'water' ? 'water' : act.type === 'clear' ? 'chop' : 'dig'); }
    const cx = (act.tile % st.map.w) * TILE + 8, cy = Math.floor(act.tile / st.map.w) * TILE + 8;
    if (Math.random() < dt * 8) emit({ x: cx + randRange(-5, 5), y: cy, vx: randRange(-25, 25), vy: -40, g: 140, life: 0.4, sprite: act.type === 'clear' ? 'fx_leaf' : act.type === 'water' ? null : 'fx_dirt', color: act.type === 'water' ? '#7fb3d5' : null });
    if (done) { sfx(act.type === 'plant' ? 'plant' : 'pop'); poof(cx, cy + 4); }
  }
}

export function switchPlayer() {
  const st = G.state, n = DATA.playersConfig.players.length;
  st.activePlayer = (st.activePlayer + 1) % n;
  poof(st.player.x, st.player.y - 6);
  burst(st.player.x, st.player.y - 10, { n: 5, sprite: 'fx_sparkle', g: 20 });
  sfx('swap');
  G.emit('playerSwitched', playerCfg());
}

export function drawPlayer(push, ctx, t) {
  const p = G.state.player;
  push(p.y, () => {
    const set = playerCfg()?.spriteSet || 'p1';
    const dir = p.dir === 'left' || p.dir === 'right' ? 'side' : p.dir;
    const kind = anim.working ? 'work' : 'walk';
    let name = `${set}_${kind}_${dir}`;
    if (!hasSprite(name)) name = `p1_${kind}_${dir}`;
    const f = anim.working || anim.moving ? animFrame(name, anim.t) : 0;
    const sw = playerSwap();
    drawSprite(ctx, name, f, p.x - 8, p.y - 23, { flip: p.dir === 'left', swap: sw.swap, swapKey: sw.key });
  });
}
