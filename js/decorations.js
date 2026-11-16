// Decorations: placement (any size), connecting fences/hedges, gameplay effects
// (growth/work bonuses, renewable stone & fiber, wishing well, mailbox, signs),
// ambient effects (birds, bees, campfire) and drawing.
import { G, TILE, rand, randRange, randInt, pickWeighted, hash2 } from './game.js';
import { DATA } from './data.js';
import { drawSprite, animFrame, hasSprite, optionSwap, mergeSwaps } from './sprites.js';
import { idx, tx, ty, inBounds, ground, obj, plotAt, debrisAt, blocks } from './world.js';
import { addJob } from './jobs.js';
import { emit } from './particles.js';
import { hourOfDay, isNight } from './daytime.js';

export const def = id => DATA.decor[id];
export const sizeOf = id => def(id)?.size || [1, 1];
export const decorBlocks = id => { const d = def(id); return !!d && !d.ground && d.blocks !== false; };
export const decorState = a => (G.state.decorState[a] ||= {});

/* ------------------------------------------------------------ anchors */
// Multi-tile decorations store 'x:<id>' on their top-left tile and 'p:<anchor>' on the rest.
export function anchorOf(i) {
  const o = obj(i);
  if (!o) return -1;
  if (o.startsWith('x:')) return i;
  if (o.startsWith('p:')) return +o.slice(2);
  return -1;
}
export function decorIdAt(i) { const a = anchorOf(i); if (a < 0) return null; const o = obj(a); return o?.startsWith('x:') ? o.slice(2) : null; }
export function footprint(anchor, id) {
  const [w, h] = sizeOf(id), out = [], x0 = tx(anchor), y0 = ty(anchor);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push(inBounds(x, y) ? idx(x, y) : -1);
  return out;
}

let cache = null;
export function markDirty() { cache = null; }
export function anchors() {
  if (cache && cache.map === G.state.map) return cache.list;
  const list = [], o = G.state.map.obj;
  for (let i = 0; i < o.length; i++) if (o[i] && o[i].startsWith('x:')) { const id = o[i].slice(2); if (def(id)) list.push({ i, id, d: def(id) }); }
  // growth bonus map
  const bonus = new Float32Array(o.length).fill(1);
  let work = 0;
  for (const a of list) {
    if (a.d.catWorkBonus) work += a.d.catWorkBonus;
    const gb = a.d.growBonus; if (!gb) continue;
    const [w, h] = sizeOf(a.id), cx = tx(a.i) + w / 2, cy = ty(a.i) + h / 2;
    for (let y = Math.floor(cy - gb.radius); y <= cy + gb.radius; y++) for (let x = Math.floor(cx - gb.radius); x <= cx + gb.radius; x++) {
      if (!inBounds(x, y) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > gb.radius + 0.5) continue;
      const t = idx(x, y); bonus[t] = Math.max(bonus[t], gb.mult);
    }
  }
  cache = { map: G.state.map, list, bonus, work: Math.min(work, 0.5) };
  return list;
}
export function growBonusAt(tile) { anchors(); return cache.bonus[tile] || 1; }
// garden shed bonus, times the kitchen feast bonus while the cats are well fed
export function catWorkMult() { anchors(); const h = G.state.home; return (1 + cache.work) * (h && h.feastUntil > G.state.simTime ? DATA.interior.feast.workMult : 1); }
export const countOf = id => anchors().filter(a => a.id === id).length;

/* ---------------------------------------------------------- placement */
export function placeProblem(id, anchor) {
  const d = def(id);
  if (!d) return 'Unknown item';
  const p = G.state.player, c = G.state.cabin;
  if (d.bridge) return bridgeProblem(id, anchor);
  if (d.onWater) return waterProblem(id, anchor);
  for (const t of footprint(anchor, id)) {
    if (t < 0) return 'Out of bounds';
    const g = ground(t), o = obj(t);
    if (g === 'f') return 'Too deep in the forest';
    if (g === 'w') return "That's water";
    if (o) return 'Something is already there';
    if (g === 't') return 'Not on tilled soil';
    if (d.ground) { if (g === id) return 'Already there'; continue; }
    if (plotAt(t)) return 'Not inside a plot';
    if (tx(t) === c.x + 1 && ty(t) === c.y + 2) return 'Keep the door clear';
    if (decorBlocks(id)) {
      if (Math.floor(p.x / TILE) === tx(t) && Math.floor((p.y - 3) / TILE) === ty(t)) return 'You are standing there';
      for (const cat of G.cats) if (Math.floor(cat.x / TILE) === tx(t) && Math.floor((cat.y - 2) / TILE) === ty(t)) return `${cat.cfg.name} is sitting there`;
    }
  }
  return null;
}
// Bridges cross the river: solid ground at both ends, water in between.
function bridgeProblem(id, anchor) {
  const tiles = footprint(anchor, id);
  for (let k = 0; k < tiles.length; k++) {
    const t = tiles[k];
    if (t < 0) return 'Out of bounds';
    const g = ground(t), o = obj(t), end = k === 0 || k === tiles.length - 1;
    if (o && !o.startsWith('h:')) return 'Something is in the way';
    if (g === 'f') return 'Trees are in the way';
    if (g === 't') return 'Not on tilled soil';
    if (end && g === 'w') return 'Both ends need solid ground on the riverbank';
    if (!end && g !== 'w') return 'Span the river: the middle goes over the water';
  }
  return null;
}
// Docks start on the shore and reach out over the water.
function waterProblem(id, anchor) {
  const [w] = sizeOf(id), tiles = footprint(anchor, id);
  let water = 0, landTop = 0;
  for (let k = 0; k < tiles.length; k++) {
    const t = tiles[k];
    if (t < 0) return 'Out of bounds';
    const g = ground(t), o = obj(t);
    if (o && !o.startsWith('h:')) return 'Something is in the way';
    if (g === 'f') return 'Trees are in the way';
    if (g === 't') return 'Not on tilled soil';
    if (g === 'w') water++;
    else if (k < w) landTop++;
    else if (g !== 's' && g !== 'g' && !def(g)?.ground) return 'Something is in the way';
  }
  if (!landTop) return 'Start the dock on the shore (its top row must touch land)';
  if (water < tiles.length / 2) return 'Point it out over the water';
  return null;
}

export function placeDecor(id, anchor) {
  const d = def(id), st = G.state;
  if (d.ground) { st.map.ground[anchor] = id; markDirty(); return; }
  footprint(anchor, id).forEach((t, k) => { st.map.obj[t] = k === 0 ? 'x:' + id : 'p:' + anchor; }); // (any shells underneath are swept away)
  if (d.spawn) decorState(anchor).next = st.simTime + d.spawn.everySec;
  if (d.interact === 'wish') decorState(anchor).next = st.simTime + 3600;
  if (d.interact === 'mail') decorState(anchor).next = st.simTime + randRange(1800, 3600);
  markDirty();
}
// Removes whatever decoration covers tile t. Returns its id (or null).
export function removeDecorAt(t) {
  const st = G.state, g = ground(t);
  const a = anchorOf(t);
  if (a >= 0) {
    const id = decorIdAt(t);
    for (const f of footprint(a, id)) if (f >= 0 && (st.map.obj[f] === 'x:' + id || st.map.obj[f] === 'p:' + a)) st.map.obj[f] = null;
    delete st.decorState[a];
    markDirty();
    return id;
  }
  if (def(g)?.ground) {
    const c = st.cabin;
    if (g === 'path_stone' && tx(t) === c.x + 1 && ty(t) > c.y + 1 && ty(t) <= c.y + 3) return null; // the original front path stays
    st.map.ground[t] = 'g';
    markDirty();
    return g;
  }
  return null;
}

/* --------------------------------------------------------------- sim */
let regrowT = 0, tickT = 0;
export function updateDecor(dt) {
  const st = G.state;
  tickT -= dt;
  if (tickT > 0) return;
  tickT = 5;
  for (const a of anchors()) {
    const sp = a.d.spawn;
    if (!sp) continue;
    const s = decorState(a.i);
    s.next ??= st.simTime + sp.everySec;
    if (st.simTime < s.next) continue;
    s.next = st.simTime + sp.everySec * (0.8 + rand() * 0.4);
    const ring = ringAround(a.i, a.id);
    if (ring.filter(t => debrisAt(t)).length >= sp.max) continue;
    const spots = ring.filter(t => canSprout(t));
    if (!spots.length) continue;
    const t = spots[randInt(0, spots.length - 1)];
    st.map.obj[t] = 'd:' + pickWeighted(Object.entries(sp.debris));
    addJob('clear', t, { marked: true });
    G.emit('sprouted', { tile: t, from: a.id });
  }
  // the clearing slowly grows a few wild weeds and twigs back
  const R = DATA.balance.regrow;
  if (R) {
    regrowT += 5;
    if (regrowT >= R.everySec) {
      regrowT = 0;
      let n = 0; for (const o of st.map.obj) if (o && o.startsWith('d:')) n++;
      if (n < R.maxWild) for (let k = 0; k < 30; k++) {
        const t = randInt(0, st.map.ground.length - 1);
        if (!canSprout(t) || plotAt(t)) continue;
        const c = st.cabin; if (Math.abs(tx(t) - (c.x + 1)) <= 2 && ty(t) >= c.y - 1 && ty(t) <= c.y + 3) continue;
        st.map.obj[t] = 'd:' + pickWeighted(Object.entries(R.debris));
        break;
      }
    }
  }
}
function ringAround(anchor, id) {
  const [w, h] = sizeOf(id), x0 = tx(anchor), y0 = ty(anchor), out = [];
  for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
    if (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h) continue;
    if (inBounds(x, y)) out.push(idx(x, y));
  }
  return out;
}
function canSprout(t) {
  if (ground(t) !== 'g' || obj(t)) return false;
  const p = G.state.player;
  if (Math.abs(Math.floor(p.x / TILE) - tx(t)) <= 1 && Math.abs(Math.floor((p.y - 3) / TILE) - ty(t)) <= 1) return false;
  for (const c of G.cats) if (Math.floor(c.x / TILE) === tx(t) && Math.floor((c.y - 2) / TILE) === ty(t)) return false;
  return true;
}

/* ------------------------------------------------- cats & furniture */
// Nearest decoration with a given cat role, reachable-ish (within maxDist tiles).
export function nearestCatSpot(role, fromTile, maxDist = 30) {
  let best = null, bd = maxDist;
  for (const a of anchors()) {
    if (a.d.cats !== role && !(role === 'fire' && a.d.fire)) continue;
    const d = Math.abs(tx(a.i) - tx(fromTile)) + Math.abs(ty(a.i) - ty(fromTile));
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
export function catFurniture(fromTile) {
  const f = {};
  for (const r of ['bed', 'post', 'tree', 'bowls', 'cushion', 'yarn', 'fire']) f[r] = !!nearestCatSpot(r, fromTile);
  return f;
}

/* ----------------------------------------------- interactive objects */
const fill = (s, cat) => s.replace(/\{cat\}/g, cat);
export function decorAction(tile) {
  const id = decorIdAt(tile);
  if (!id) return null;
  const d = def(id), a = anchorOf(tile), s = decorState(a), st = G.state;
  if (d.interact === 'sign') return { kind: 'decor', tile, label: s.text ? `"${s.text}" (Ⓐ rename)` : 'Write on the sign', run: h => h.sign(a) };
  if (d.interact === 'mail') {
    if (s.letter) return { kind: 'decor', tile, label: 'You have a letter!', run: h => h.letter(a) };
    return { kind: 'info', tile, label: 'Mailbox (no mail right now)' };
  }
  if (d.interact === 'wish') {
    s.next ??= st.simTime;
    if (st.simTime >= s.next) return { kind: 'decor', tile, label: 'Make a wish', run: h => h.wish(a) };
    return { kind: 'info', tile, label: `Wishing well (next wish in ${fmtShort(s.next - st.simTime)})` };
  }
  if (d.interact === 'cathouse') {
    const owner = G.cats.find(c => c.id === s.owner);
    return { kind: 'decor', tile, label: owner ? `${owner.cfg.name}'s house (Ⓐ decorate)` : 'Empty cat house (Ⓐ choose a cat)', run: h => h.catHouse(a) };
  }
  if (d.spawn) { const n = ringAround(a, id).filter(t => debrisAt(t)).length; return { kind: 'info', tile, label: `${d.name}: ${n}/${d.spawn.max} grown, next in ~${fmtShort(Math.max(0, (s.next ?? 0) - st.simTime))}` }; }
  return null;
}
const fmtShort = s => (s < 60 ? `${Math.ceil(s)}s` : s < 3600 ? `${Math.ceil(s / 60)}m` : `${Math.floor(s / 3600)}h ${Math.ceil((s % 3600) / 60)}m`);
// Mailbox letters arrive while you're away too
export function updateMail() {
  const st = G.state;
  for (const a of anchors()) {
    if (a.d.interact !== 'mail') continue;
    const s = decorState(a.i);
    s.next ??= st.simTime + 3600;
    if (!s.letter && st.simTime >= s.next) { s.letter = true; G.emit('mail', { anchor: a.i }); }
  }
}
export function readLetter(a) {
  const st = G.state, s = decorState(a);
  s.letter = false;
  s.next = st.simTime + (DATA.balance.mailbox?.everySec ?? 21600) * randRange(0.7, 1.3);
  const cats = G.cats.map(c => c.cfg.name);
  const cat = cats.length ? cats[randInt(0, cats.length - 1)] : 'the cat';
  const pool = DATA.letters || ['Hello from the woods!'];
  const text = fill(pool[randInt(0, pool.length - 1)], cat);
  let gift = null;
  if (rand() < 0.3) {
    if (rand() < 0.5) { const n = randInt(20, 60); st.coins += n; gift = `${n} coins`; }
    else { giveMysterySeed(); gift = 'a mystery seed'; }
  }
  return { text, gift };
}
export function makeWish(a) {
  const st = G.state, s = decorState(a), W = DATA.balance.wishingWell || { everySec: 72000 };
  s.next = st.simTime + W.everySec;
  const r = rand();
  if (r < 0.05) { const pool = DATA.crops.filter(c => c.rarity === 'rare'); (st.inv.unknown.rare ||= []).push(pool[randInt(0, pool.length - 1)].id); return 'a Rare mystery seed!'; }
  if (r < 0.3) { giveMysterySeed(); giveMysterySeed(); return 'two mystery seeds'; }
  const n = randInt(40, 150); st.coins += n; return `${n} coins`;
}
function giveMysterySeed() {
  const st = G.state, r = rand() < 0.8 ? 'common' : 'uncommon';
  const pool = DATA.crops.filter(c => c.rarity === r);
  (st.inv.unknown.mystery ||= []).push(pool[randInt(0, pool.length - 1)].id);
}

/* ------------------------------------------------------ ambient fx */
const birds = new Map();
export const birdBoost = () => 1 + 0.5 * Math.min(4, countOf('bird_feeder'));
export function nearFire(px, py) {
  for (const a of anchors()) if (a.d.fire && Math.hypot(tx(a.i) * TILE + 8 - px, ty(a.i) * TILE + 8 - py) < 6 * TILE) return true;
  return false;
}
export function updateDecorFx(dt) {
  if (G.offline) return;
  const cam = G.camera, vw = G.view.w, vh = G.view.h, h = hourOfDay(), day = h > 6.5 && h < 19.5;
  const seen = new Set();
  for (const a of anchors()) {
    const x = tx(a.i) * TILE, y = ty(a.i) * TILE;
    if (x < cam.x - 48 || x > cam.x + vw + 48 || y < cam.y - 48 || y > cam.y + vh + 48) continue;
    if (a.d.bees && day && rand() < dt * 3) emit({ x: x + 8 + randRange(-10, 10), y: y + 4 + randRange(-8, 4), vx: randRange(-12, 12), vy: randRange(-8, 8), life: 0.8, color: rand() < 0.5 ? '#f7cd5d' : '#1a1423', size: 1 });
    if (a.d.fire) {
      if (rand() < dt * 4) emit({ x: x + 8 + randRange(-2, 2), y: y + 4, vx: randRange(-6, 6), vy: -26, g: -4, life: 0.7, color: rand() < 0.5 ? '#f7cd5d' : '#f29b4b', size: 1, layer: 1 });
      if (rand() < dt * 0.8) emit({ x: x + 5, y: y - 6, vx: 4, vy: -10, life: 2.5, sprite: 'fx_smoke' });
    }
    if (a.id === 'pond' && rand() < dt * 0.6) emit({ x: x + 6 + rand() * 20, y: y + 10 + rand() * 14, vy: -3, life: 0.8, sprite: 'fx_sparkle', frameRate: 6, fade: false });
    if (a.d.birds && day) {
      seen.add(a.i);
      let b = birds.get(a.i);
      if (!b) { b = { x: x + 8, y: y + 20, t: 0, hop: 0, dir: 1 }; birds.set(a.i, b); }
      b.t -= dt;
      if (b.t <= 0) { b.t = randRange(0.6, 2.4); b.tx = x + 8 + randRange(-14, 14); b.ty = y + 18 + randRange(-2, 10); b.hop = 0.25; }
      if (b.hop > 0) { b.hop -= dt; b.x += (b.tx - b.x) * Math.min(1, dt * 8); b.y += (b.ty - b.y) * Math.min(1, dt * 8); b.dir = b.tx < b.x ? -1 : 1; }
    }
  }
  for (const k of birds.keys()) if (!seen.has(k)) birds.delete(k);
}

/* ----------------------------------------------------------- cat houses */
export function catHouseOf(catId) { return anchors().find(a => a.d.interact === 'cathouse' && decorState(a.i).owner === catId) || null; }
export function catHouseLook(a) { const s = decorState(a); return { owner: s.owner ?? null, roof: s.roof || 'red', wall: s.wall || 'oak', door: s.door ?? 0, accent: s.accent || 'none' }; }
export function drawCatHouse(ctx, a, px, py) {
  const L = catHouseLook(a);
  const sw = mergeSwaps(optionSwap('roof', L.roof), optionSwap('wall', L.wall));
  drawSprite(ctx, 'cathouse', 0, px, py, { swap: sw.swap, swapKey: sw.key });
  if (L.accent === 'flowers') drawSprite(ctx, 'cathouse_flowers', 0, px + 2, py + 26);
  drawSprite(ctx, `cathouse_door_${L.door}`, 0, px + 10, py + 19);
  if (L.owner) drawSprite(ctx, 'cathouse_plate', 0, px + 10, py + 15);
  if (L.accent === 'bow') drawSprite(ctx, 'cathouse_bow', 0, px + 11, py);
  if (L.accent === 'fish') drawSprite(ctx, 'cathouse_fish', 0, px + 4, py + 18);
}
// The tile just in front of a cat house's door (where its cat curls up).
export function catHouseDoorstep(a) { return idx(tx(a) + 1, ty(a) + 2); }

/* ------------------------------------------------------------ drawing */
const CONNECT_DRAW = { fence: ['decor_fence_rail_h', 'decor_fence_rail_v'], hedge: ['decor_hedge_h', 'decor_hedge_v'] };
function connects(i, group) { const id = decorIdAt(i); return !!id && def(id)?.connect === group && anchorOf(i) === i; }
export function drawDecor(push, ctx, t, x0, y0, x1, y1) {
  const st = G.state, w = st.map.w;
  for (const a of anchors()) {
    const ax = tx(a.i), ay = ty(a.i), [fw, fh] = sizeOf(a.id);
    if (ax + fw < x0 || ax > x1 || ay + fh < y0 || ay - 2 > y1) continue;
    const spr = a.d.sprite;
    const sd = DATA.sprites.sprites[spr];
    const sw = sd?.w ?? 16, sh = sd?.h ?? 16;
    const px = ax * TILE + Math.round((fw * TILE - sw) / 2), py = (ay + fh) * TILE - sh;
    const baseY = (ay + fh) * TILE - 3;
    let frame = animFrame(spr, t + hash2(ax, ay, 3) * 5);
    if (a.d.interact === 'mail') frame = decorState(a.i).letter ? 1 : 0;
    const grp = a.d.connect;
    if (grp) {
      const [h, v] = CONNECT_DRAW[grp];
      if (ax + 1 < w && connects(a.i + 1, grp)) push(baseY - 0.5, () => drawSprite(ctx, h, 0, ax * TILE + 8, ay * TILE));
      if (connects(a.i + w, grp)) push(baseY + 8, () => drawSprite(ctx, v, 0, ax * TILE, ay * TILE + 8));
    }
    if (a.d.floor) continue; // drawn with the ground (drawFloorDecor)
    if (a.d.interact === 'cathouse') { push(baseY, () => drawCatHouse(ctx, a.i, px, py)); continue; }
    push(baseY, () => {
      drawSprite(ctx, spr, frame, px, py);
      if (a.d.interact === 'mail' && decorState(a.i).letter) drawSprite(ctx, 'icon_exclaim', 0, px + 4, py - 10 + Math.round(Math.sin(t * 4)));
      if (a.d.interact === 'wish' && st.simTime >= (decorState(a.i).next ?? 0)) { if (Math.sin(t * 2 + ax) > 0.95) emit({ x: px + 4 + rand() * 8, y: py + 10, vy: -6, life: 0.8, sprite: 'fx_sparkle', frameRate: 6, fade: false }); }
    });
    const b = birds.get(a.i);
    if (b) push(b.y, () => drawSprite(ctx, 'fx_bird', b.hop > 0 ? 1 : 0, b.x - 4, b.y - 7 - (b.hop > 0 ? 2 : 0), { flip: b.dir < 0 }));
  }
}
// Big flat decorations (docks) drawn right after the ground, under everything else.
export function drawFloorDecor(ctx, x0, y0, x1, y1) {
  for (const a of anchors()) {
    if (!a.d.floor) continue;
    const ax = tx(a.i), ay = ty(a.i), [fw, fh] = sizeOf(a.id);
    if (ax + fw < x0 || ax > x1 || ay + fh < y0 || ay > y1) continue;
    const [ox, oy] = a.d.drawOffset || [0, 0];
    drawSprite(ctx, a.d.sprite, 0, ax * TILE + ox, ay * TILE + oy);
  }
}

/* ------------------------------------------------------------ seashells */
let shellT = 0;
// Every so often a shell washes up on a sand tile next to the water.
export function updateShells(dt) {
  const st = G.state, W = DATA.shellWashUp, list = DATA.shells;
  if (!list.length) return;
  shellT += dt;
  if (shellT < W.everySec * (0.8 + (hash2(Math.floor(st.simTime / 997), 3) * 0.4))) return;
  shellT = 0;
  let n = 0; for (const o of st.map.obj) if (o && o.startsWith('h:')) n++;
  if (n >= W.maxOnBeach) return;
  const m = st.map, spots = [];
  for (let i = 0; i < m.ground.length; i++) {
    if (m.ground[i] !== 's' || m.obj[i]) continue;
    const x = i % m.w, y = Math.floor(i / m.w);
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(x + dx, y + dy) && m.ground[(y + dy) * m.w + x + dx] === 'w')) spots.push(i);
  }
  if (!spots.length) return;
  const t = spots[randInt(0, spots.length - 1)];
  m.obj[t] = 'h:' + pickWeighted(list.map(s => [s.id, s.weight ?? 1]));
  G.emit('shellWashed', { tile: t });
}
export function gatherShell(t) {
  const st = G.state, o = obj(t);
  if (!o || !o.startsWith('h:')) return null;
  const id = o.slice(2);
  st.map.obj[t] = null;
  st.inv.shells[id] = (st.inv.shells[id] || 0) + 1;
  const first = !st.shellsFound[id];
  st.shellsFound[id] = (st.shellsFound[id] || 0) + 1;
  const res = { id, def: DATA.shellById[id], first, tile: t };
  G.emit('shell', res);
  return res;
}

// Floor decorations: drawn on top of a grass tile
export function overlaySprite(g) { const d = def(g); return d?.overlay ? d.sprite : null; }
export function lightsFrom() {
  const out = [];
  for (const a of anchors()) {
    if (!a.d.light) continue;
    const [fw] = sizeOf(a.id);
    out.push({ x: tx(a.i) * TILE + fw * 8, y: ty(a.i) * TILE + (a.d.fire ? 8 : 4), r: a.d.light, fire: !!a.d.fire });
  }
  return out;
}
export { hasSprite, isNight, blocks };
