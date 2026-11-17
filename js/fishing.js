// Fishing from a dock. Bait the water with harvested crops or dug-up bugs (the better the bait, the
// rarer the fish), cast, wait through a few tugs, and when the big "!" appears press A to reel in.
// Cats fish off the dock too, using the same bait.
import { G, TILE, rand, randRange, randInt, pickWeighted } from './game.js';
import { DATA, RARITY_ORDER } from './data.js';
import { input } from './input.js';
import { drawSprite } from './sprites.js';
import { idx, tx, ty, inBounds, ground, obj } from './world.js';
import { anchors, anchorOf, decorIdAt, decorState, footprint } from './decorations.js';
import { emit, burst } from './particles.js';
import { sfx } from './audio.js';

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const isDockId = id => !!DATA.decor[id]?.onWater;
export const openWater = i => i >= 0 && ground(i) === 'w' && !obj(i);
export const hasDock = () => anchors().some(a => a.d.onWater);
export function dockAnchorAt(i) { const id = decorIdAt(i); return id && isDockId(id) ? anchorOf(i) : -1; }

/* ---------------------------------------------------------------- bait */
export function baitOf(anchor) { const s = decorState(anchor); s.bait ||= { portions: 0, value: 0 }; return s.bait; }
export function baitQuality(b) {
  if (!b || b.portions <= 0) return 0;
  const B = DATA.fishCfg.bait, avg = b.value / b.portions;
  return Math.max(0, Math.min(1, Math.log(Math.max(1, avg) / B.qualityLowPrice) / Math.log(B.qualityHighPrice / B.qualityLowPrice)));
}
export function rarityOdds(q) {
  const w = { common: 70 * (1 - q) + 6, uncommon: 24 + 16 * q, rare: 4 + 26 * q, legendary: 0.4 + 14 * q ** 1.5, mystical: 0.05 + 8 * q ** 2 };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / total]));
}
// What can be used as bait: harvested crops and dug-up bugs, with their value.
export function baitItems() {
  const st = G.state, out = [];
  for (const [id, n] of Object.entries(st.inv.crops)) if (n > 0) out.push({ kind: 'crops', id, n, name: DATA.cropById[id]?.name || id, price: DATA.cropById[id]?.price ?? 1, icon: `item_${id}` });
  // bugs from digging (fruit is for eating, selling and the spirits' offerings)
  for (const [id, n] of Object.entries(st.inv.bugs || {})) if (n > 0) out.push({ kind: 'bugs', id, n, name: DATA.bugById[id]?.name || id, price: DATA.bugById[id]?.price ?? 1, icon: `bug_${id}` });
  return out.sort((a, b) => a.price - b.price);
}
export function addBait(anchor, item, n) {
  const st = G.state, b = baitOf(anchor), max = DATA.fishCfg.bait.maxPortions;
  n = Math.min(n, st.inv[item.kind][item.id] || 0, max - b.portions);
  if (n <= 0) return 0;
  st.inv[item.kind][item.id] -= n; if (!st.inv[item.kind][item.id]) delete st.inv[item.kind][item.id];
  b.portions += n; b.value += n * item.price;
  return n;
}
function useBait(anchor) { const b = baitOf(anchor); if (b.portions <= 0) return false; const avg = b.value / b.portions; b.portions--; b.value = Math.max(0, b.value - avg); if (!b.portions) b.value = 0; return true; }
export function rollFish(q) {
  const odds = rarityOdds(q), r = pickWeighted(Object.entries(odds));
  const pool = DATA.fish.filter(f => f.rarity === r);
  return (pool.length ? pool : DATA.fish)[randInt(0, (pool.length ? pool : DATA.fish).length - 1)].id;
}
export function giveFish(id, by) {
  const st = G.state;
  st.inv.fish[id] = (st.inv.fish[id] || 0) + 1;
  const first = !st.fishFound[id];
  st.fishFound[id] = (st.fishFound[id] || 0) + 1;
  st.stats.fishCaught = (st.stats.fishCaught || 0) + 1;
  G.emit('fishCaught', { id, def: DATA.fishById[id], first, by });
}
export function sellFish(id, n) {
  const inv = G.state.inv.fish, have = inv[id] || 0; n = Math.min(n, have);
  if (n <= 0) return 0;
  const coins = n * (DATA.fishById[id]?.price ?? 1);
  inv[id] = have - n; if (!inv[id]) delete inv[id];
  G.state.coins += coins; G.state.stats.earned = (G.state.stats.earned || 0) + coins;
  return coins;
}

/* --------------------------------------------------- where you can fish */
// Standing on a dock and facing open water.
export function playerSpot() {
  const p = G.state.player, here = idx(Math.floor(p.x / TILE), Math.floor((p.y - 3) / TILE));
  const anchor = dockAnchorAt(here);
  if (anchor < 0) return null;
  const [dx, dy] = DIRV[p.dir];
  const x = tx(here) + dx, y = ty(here) + dy;
  if (!inBounds(x, y) || !openWater(idx(x, y))) return null;
  return { anchor, water: idx(x, y), here };
}
// Dock tiles next to open water, for cats: [{ tile, water }]
export function dockSeats(anchor) {
  const id = decorIdAt(anchor), out = [];
  for (const t of footprint(anchor, id)) {
    if (t < 0 || ground(t) !== 'w') continue; // only the part over the water
    for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0]]) { const x = tx(t) + dx, y = ty(t) + dy; if (inBounds(x, y) && openWater(idx(x, y))) { out.push({ tile: t, water: idx(x, y) }); break; } }
  }
  return out;
}
export function baitedDockNear(fromTile, maxDist = 45) {
  let best = null, bd = maxDist;
  for (const a of anchors()) {
    if (!a.d.onWater || baitOf(a.i).portions <= 0) continue;
    const d = Math.abs(tx(a.i) - tx(fromTile)) + Math.abs(ty(a.i) - ty(fromTile));
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
export function catFish(cat, anchor) { // called when a cat's fishing time is up
  const b = baitOf(anchor);
  if (b.portions <= 0 || rand() > DATA.fishCfg.cats.catchChance) return null;
  const q = baitQuality(b);
  useBait(anchor);
  const id = rollFish(q);
  giveFish(id, cat.id);
  return id;
}

/* -------------------------------------------------------------- minigame */
// waiting -> tug (x2-4) -> bite ("!" + press A) -> reel -> done
export const F = { active: false };
export function startFishing(spot) {
  const M = DATA.fishCfg.minigame, b = baitOf(spot.anchor);
  if (b.portions <= 0) return false;
  const q = baitQuality(b), fishId = rollFish(q), rarity = DATA.fishById[fishId].rarity;
  Object.assign(F, {
    active: true, state: 'cast', t: 0.45, anchor: spot.anchor, water: spot.water, q, fishId,
    tugs: randInt(M.tugs[0], M.tugs[1]), dip: 0, window: M.biteWindowSec[rarity] ?? 0.9, msg: null,
  });
  G.mode = 'fishing';
  sfx('cast');
  return true;
}
function endFishing(msg, ok) {
  F.state = 'done'; F.t = ok ? 0.9 : 1.2; F.msg = msg;
}
export function updateFishing(dt) {
  if (!F.active) return;
  const M = DATA.fishCfg.minigame, wx = tx(F.water) * TILE + 8, wy = ty(F.water) * TILE + 8;
  F.t -= dt; F.dip = Math.max(0, F.dip - dt * 3);
  const early = input.pressed('confirm') && (F.state === 'wait' || F.state === 'tug');
  if (input.pressed('cancel') && F.state !== 'done') { sfx('cancel'); endFishing('Reeled in.', false); return; }
  if (early) { sfx('cancel'); burst(wx, wy, { n: 4, color: '#b7e0ef', g: 120 }); endFishing('Too soon! It swam off.', false); return; }
  switch (F.state) {
    case 'cast': if (F.t <= 0) { F.state = 'wait'; F.t = randRange(M.waitSec[0], M.waitSec[1]); emit({ x: wx - 3, y: wy - 2, vy: -6, life: 0.4, color: '#b7e0ef', size: 2 }); sfx('plop'); } break;
    case 'wait': if (F.t <= 0) { F.state = 'tug'; F.t = 0; } break;
    case 'tug':
      if (F.t <= 0) {
        if (F.tugs > 0) { F.tugs--; F.dip = 0.6; F.t = randRange(M.tugGapSec[0], M.tugGapSec[1]); sfx('plop'); emit({ x: wx, y: wy, vy: -10, g: 60, life: 0.4, color: '#b7e0ef', size: 1 }); }
        else { F.state = 'bite'; F.t = F.window; F.dip = 1.6; sfx('bite'); burst(wx, wy, { n: 6, color: '#fffaf0', g: 140, up: 0.7 }); }
      }
      break;
    case 'bite':
      if (input.pressed('confirm')) {
        if (useBait(F.anchor)) { sfx('reel'); burst(wx, wy, { n: 10, color: '#7fb3d5', g: 140 }); giveFish(F.fishId, 'player'); endFishing(null, true); }
        else endFishing('Out of bait!', false);
      } else if (F.t <= 0) { sfx('cancel'); endFishing('It got away!', false); }
      break;
    case 'done': if (F.t <= 0) { F.active = false; G.mode = 'play'; } break;
  }
}
export const fishingMessage = () => (F.active ? (F.state === 'bite' ? 'Ⓐ PULL!' : F.state === 'done' ? F.msg || '' : F.state === 'cast' ? 'Casting...' : 'Wait for the big tug... (Ⓑ reel in)') : '');

/* --------------------------------------------------------------- drawing */
function line(ctx, x0, y0, x1, y1) {
  ctx.strokeStyle = 'rgba(255,250,240,0.8)'; ctx.lineWidth = 1; ctx.beginPath();
  const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + 4;
  ctx.moveTo(x0 + 0.5, y0 + 0.5); ctx.quadraticCurveTo(mx, my, x1 + 0.5, y1 + 0.5); ctx.stroke();
}
export function drawFishing(ctx, t) {
  if (F.active && (F.state !== 'done' || F.t > 0.5)) {
    const p = G.state.player, [dx, dy] = DIRV[p.dir];
    const hx = p.x + dx * 7, hy = p.y - 16 + Math.min(0, dy) * 2;
    const wx = tx(F.water) * TILE + 8, wy = ty(F.water) * TILE + 8 + (F.state === 'bite' ? 3 : F.dip * 2);
    const fly = F.state === 'cast' ? Math.max(0, F.t / 0.45) : 0;
    const bx = wx + (hx - wx) * fly, by = wy + (hy - wy) * fly - Math.sin(fly * Math.PI) * 14;
    line(ctx, hx, hy, bx, by - 3);
    drawSprite(ctx, 'fx_bobber', F.dip > 0.3 || F.state === 'bite' ? 1 : 0, bx - 4, by - 6 + Math.round(Math.sin(t * 3) * 0.6));
    if (F.state === 'bite') drawSprite(ctx, 'icon_bang', 0, p.x - 4, p.y - 46 + Math.round(Math.sin(t * 20)));
  }
  // cats' bobbers
  for (const cat of G.cats) if (cat.state === 'fishing' && cat.fishWater != null) {
    const wx = tx(cat.fishWater) * TILE + 8, wy = ty(cat.fishWater) * TILE + 8;
    line(ctx, cat.x + (cat.dir === 'left' ? -5 : cat.dir === 'right' ? 5 : 0), cat.y - 9, wx, wy - 3);
    drawSprite(ctx, 'fx_bobber', Math.sin(t * 2 + cat.x) > 0.92 ? 1 : 0, wx - 4, wy - 6 + Math.round(Math.sin(t * 3 + cat.x)));
  }
}
export { RARITY_ORDER };
