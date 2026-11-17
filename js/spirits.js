// The Great Stump and the spirit animals.
//
// A 2x2 stump hides in the forest. Once you've chopped your way to it you can leave a fruit
// offering. Each evening (data/spirits.json arriveHours, on the real clock) there's a chance a
// spirit animal (the fox or the moose) answers it. While the spirit visits it wanders around the
// stump, glows, and the cats work faster; when it leaves it may leave a gift on the stump.
// Spirits drift through trees and walls, so they don't need paths.
import { G, TILE, rand, randRange, randInt, pickWeighted, clamp } from './game.js';
import { DATA } from './data.js';
import { drawSprite, animFrame, hasSprite, iconHTML } from './sprites.js';
import { hourOfDay } from './daytime.js';
import { emit } from './particles.js';
import { toast, banner, showCard, openMenu, closeAllMenus } from './ui.js';
import { sfx } from './audio.js';

const S = () => DATA.spirits;
export const spiritDefaults = () => ({ stump: -1, offering: null, visit: null, gift: null, lastRoll: '', visits: {} });
const sp = () => G.state?.spirit;
export const spiritVisiting = () => !!sp()?.visit;
export const spiritWorkMult = () => (sp()?.visit ? S().workMult : 1);
const animalOf = id => S().animals[id] || Object.values(S().animals)[0];

/* --------------------------------------------------- hiding the stump */
// Picks a 2x2 patch of forest a few tiles deep (not by the map edge or the water), turns it into a
// tiny glade and puts the stump there. Returns its top-left tile, or -1 if there's no room.
export function placeStump(map) {
  const { w, h, ground, obj } = map, C = DATA.spirits.stump;
  const dist = new Int16Array(w * h).fill(-1), q = [];
  for (let i = 0; i < w * h; i++) if (ground[i] !== 'f') { dist[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || dist[n] >= 0) continue;
      dist[n] = dist[i] + 1; q.push(n);
    }
  }
  const border = (DATA.balance.trees?.permanentBorder ?? 3) + 1;
  const nearWater = (x, y) => { for (let yy = y - 3; yy <= y + 4; yy++) for (let xx = x - 3; xx <= x + 4; xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h && ground[yy * w + xx] === 'w') return true; return false; };
  const pick = (lo, hi) => {
    const out = [];
    for (let y = border; y < h - border - 1; y++) for (let x = border; x < w - border - 1; x++) {
      const tiles = [y * w + x, y * w + x + 1, (y + 1) * w + x, (y + 1) * w + x + 1];
      if (tiles.some(t => ground[t] !== 'f' || obj[t])) continue;
      const d = Math.min(...tiles.map(t => dist[t]));
      if (d < lo || d > hi || nearWater(x, y)) continue;
      out.push(tiles[0]);
    }
    return out;
  };
  let c = pick(C.minDepth ?? 4, C.maxDepth ?? 9);
  if (!c.length) c = pick(2, 99);
  if (!c.length) return -1;
  const a = c[randInt(0, c.length - 1)];
  for (const t of [a, a + 1, a + w, a + w + 1]) { ground[t] = 'g'; obj[t] = 'stump'; }
  return a;
}
export const isStump = i => G.state.map.obj[i] === 'stump';
function stumpCentre() { const a = sp().stump, w = G.state.map.w; return { x: (a % w) * TILE + TILE, y: ((a / w) | 0) * TILE + TILE }; }
// Open tiles near the stump where a visiting spirit can stand and be seen (not in the trees).
function openSpots() {
  const s = sp(), m = G.state.map, w = m.w, ax = s.stump % w, ay = (s.stump / w) | 0, R = S().wanderTiles ?? 3, out = [];
  for (let y = ay - R; y <= ay + 1 + R; y++) for (let x = ax - R; x <= ax + 1 + R; x++) {
    if (x < 0 || y < 0 || x >= w || y >= m.h) continue;
    const i = y * w + x, g = m.ground[i];
    if (g === 'f' || g === 'w' || m.obj[i] === 'stump') continue;
    out.push({ x: x * TILE + 8, y: y * TILE + 12 });
  }
  return out;
}
const inFront = () => { const c = stumpCentre(); return { x: c.x + 6, y: c.y + TILE + 12 }; };

/* ---------------------------------------------------------------- time */
function dayKey() {
  if (G.settings?.timeMode === 'fast') { const len = DATA.balance.time.fastDayLengthSec; return 'f' + Math.floor((G.state.simTime / len * 24 + 8) / 24); }
  const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function offerChance(fruitId) { const O = S().offering, p = DATA.treeById[fruitId]?.fruitPrice ?? 20; return clamp(O.base + p * O.perPrice, 0, O.max); }
const fmtH = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };

/* -------------------------------------------------------------- update */
export function updateSpirits(dt) {
  const s = sp();
  if (!s || s.stump < 0) return;
  const v = s.visit;
  if (v) {
    if (G.state.simTime >= v.until) { depart(); return; }
    wander(v, dt);
    if (!G.offline && rand() < dt * 2) emit({ x: v.x + randRange(-8, 8), y: v.y - randRange(4, 20), vx: randRange(-3, 3), vy: -10, life: 1.4, color: rand() < 0.5 ? '#7fd7ff' : '#c8f0ff', glow: true });
    return;
  }
  if (s.gift && !G.offline && rand() < dt * 1.5) { const c = stumpCentre(); emit({ x: c.x + randRange(-8, 8), y: c.y - 14, vy: -8, life: 1, sprite: 'fx_sparkle', frameRate: 6, fade: false }); }
  const h = hourOfDay(), [a, b] = S().arriveHours;
  if (s.offering && h >= a && h < b && s.lastRoll !== dayKey()) {
    s.lastRoll = dayKey();
    if (rand() < offerChance(s.offering.fruit)) arrive();
  }
}
// Exported for the debug menu.
export function arrive(animal) {
  const s = sp(), st = G.state, c = stumpCentre();
  animal ||= pickWeighted(Object.entries(S().animals).map(([id, a]) => [id, a.weight]));
  const spots = openSpots(), start = spots.length ? spots.reduce((a, b) => (Math.hypot(b.x - c.x, b.y - c.y) < Math.hypot(a.x - c.x, a.y - c.y) ? b : a)) : inFront();
  s.visit = { animal, at: st.simTime, until: st.simTime + randRange(...S().stayHours) * 3600, x: start.x, y: start.y, dir: 'down', side: 'left', moving: false, wait: 8, tx: null, ty: null, t: 0 };
  s.offering = null;
  s.visits[animal] = (s.visits[animal] || 0) + 1;
  const A = animalOf(animal);
  if (!G.offline) {
    sfx('discover');
    banner(`The <b>${A.name}</b> has come to the Great Stump!`, 6000);
    toast(`While it stays, the cats work ${Math.round((S().workMult - 1) * 100)}% faster`, `${A.sprites}_idle_front`, 6000);
  }
  G.emit('spiritArrived', { animal });
}
function depart() {
  const s = sp(), v = s.visit, A = animalOf(v.animal);
  s.visit = null;
  if (rand() < S().giftChance) s.gift = rollGift(v.animal);
  if (!G.offline) {
    for (let k = 0; k < 16; k++) emit({ x: v.x + randRange(-10, 10), y: v.y - randRange(0, 24), vx: randRange(-12, 12), vy: randRange(-30, -8), life: 1.6, color: '#7fd7ff', glow: true });
    toast(`The ${A.name} has gone${s.gift ? '... it left a gift on the stump!' : '.'}`, s.gift ? 'fx_sparkle' : null, 6000);
  }
}
function wander(v, dt) {
  const A = animalOf(v.animal);
  v.t += dt;
  if (v.wait > 0) { v.wait -= dt; v.moving = false; return; }
  if (v.tx == null) {
    // an open spot near the stump (the glade, the path you chopped, the clearing...)
    const spots = openSpots(), p = spots.length ? spots[randInt(0, spots.length - 1)] : inFront();
    v.tx = p.x + randRange(-3, 3); v.ty = p.y;
  }
  const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy), step = A.speed * dt;
  if (d <= step) { v.x = v.tx; v.y = v.ty; v.tx = null; v.wait = randRange(6, 18); v.moving = false; if (rand() < 0.4) v.dir = 'down'; return; }
  v.x += dx / d * step; v.y += dy / d * step; v.moving = true;
  v.dir = Math.abs(dx) >= Math.abs(dy) * 0.8 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  if (v.dir === 'left' || v.dir === 'right') v.side = v.dir;
}

/* --------------------------------------------------------------- gifts */
function rollGift(animal) {
  const A = animalOf(animal), bonus = A.giftBonus || 1;
  const g = pickWeighted(S().gifts.map(x => [x, x.weight * (x.rarity === 'legendary' ? bonus : 1)]));
  if (g.kind === 'coins') return { kind: 'coins', n: Math.round(randInt(g.min, g.max) * bonus), from: animal };
  if (g.kind === 'mats') return { kind: 'mats', wood: Math.round(randInt(...g.wood) * bonus), stone: Math.round(randInt(...g.stone) * bonus), from: animal };
  if (g.kind === 'seed') { const pool = DATA.crops.filter(c => c.rarity === g.rarity); return { kind: 'seed', rarity: g.rarity, id: pool[randInt(0, pool.length - 1)].id, from: animal }; }
  const t = DATA.trees[randInt(0, DATA.trees.length - 1)]; // any tree, decorative ones included
  return { kind: 'sapling', id: t.id, from: animal };
}
function collectGift() {
  const s = sp(), g = s.gift, st = G.state, A = animalOf(g.from);
  s.gift = null;
  let text = '', icon = 'fx_sparkle';
  if (g.kind === 'coins') { st.coins += g.n; text = `${g.n} coins`; icon = 'item_coin'; }
  if (g.kind === 'mats') { st.mats.wood = (st.mats.wood || 0) + g.wood; st.mats.stone = (st.mats.stone || 0) + g.stone; text = `${g.wood} wood and ${g.stone} stone`; icon = 'item_wood'; }
  if (g.kind === 'seed') { (st.inv.unknown[g.rarity] ||= []).push(g.id); text = `a ${DATA.rarities[g.rarity]?.name || g.rarity} mystery seed`; icon = `seedpack_${g.rarity}`; }
  if (g.kind === 'sapling') { st.inv.saplings[g.id] = (st.inv.saplings[g.id] || 0) + 1; text = `a ${DATA.treeById[g.id].name.toLowerCase()} sapling`; icon = `sapling_${g.id}`; }
  sfx('discover');
  showCard(`<div class="disc">${iconHTML(`${A.sprites}_idle_front`, 'ico huge')}</div><h2>A gift from the ${A.name}</h2><p>Left on the Great Stump: <b>${text}</b>.</p><p class="muted">Leave another offering to call the spirits back.</p>`, { cls: 'discover' });
  void icon;
}

/* -------------------------------------------------------------- actions */
// What pressing A does when you face the stump (or a visiting spirit).
export function spiritAction(t, fp) {
  const s = sp();
  if (!s || s.stump < 0) return null;
  const v = s.visit;
  if (v && fp && Math.hypot(v.x - fp.x, v.y - 6 - fp.y) < 16) {
    const A = animalOf(v.animal);
    return { kind: 'decor', label: `${A.name} · the cats work ${Math.round((S().workMult - 1) * 100)}% faster · leaves in ~${fmtH(v.until - G.state.simTime)}`, run: () => { sfx('pop'); toast(A.desc, `${A.sprites}_idle_front`); } };
  }
  if (t < 0 || !isStump(t)) return null;
  if (s.gift) return { kind: 'decor', label: 'Take the spirit\'s gift', run: collectGift };
  if (v) return { kind: 'decor', label: `The Great Stump · the ${animalOf(v.animal).name} is visiting`, run: () => {} };
  if (s.offering) {
    const f = DATA.treeById[s.offering.fruit];
    return { kind: 'decor', label: `Your ${f.fruit.toLowerCase()} offering waits (${Math.round(offerChance(f.id) * 100)}% each evening, 7-9pm) · Ⓐ take it back`, run: () => { G.state.inv.fruit[f.id] = (G.state.inv.fruit[f.id] || 0) + 1; s.offering = null; sfx('cancel'); toast(`You took back the ${f.fruit.toLowerCase()}`, `fruit_${f.id}`); } };
  }
  return { kind: 'decor', label: 'The Great Stump · leave a fruit offering', run: offeringMenu };
}
function offeringMenu() {
  const s = sp();
  openMenu({
    title: 'Fruit offering', icon: S().stump.sprite,
    subtitle: () => `Leave one fruit on the Great Stump. Each evening between 7 and 9pm a spirit animal may answer it. Finer fruit makes a visit more likely.`,
    empty: 'You have no fruit yet. Plant a fruit tree (seed shop → saplings) and pick its fruit.',
    items: () => Object.entries(G.state.inv.fruit || {}).filter(([, n]) => n > 0).map(([id, n]) => {
      const t = DATA.treeById[id];
      return {
        label: t.fruit, icon: `fruit_${id}`, sub: `${Math.round(offerChance(id) * 100)}% chance each evening`, right: `×${n}`,
        onSelect: () => { G.state.inv.fruit[id] -= 1; s.offering = { fruit: id, at: G.state.simTime }; sfx('plant'); closeAllMenus(); toast(`You left a ${t.fruit.toLowerCase()} on the Great Stump. Come back this evening...`, `fruit_${id}`, 5000); },
      };
    }),
  });
}

/* ----------------------------------------------------------- HUD + light */
export function spiritHUD() {
  const v = sp()?.visit;
  if (!v) return '';
  const A = animalOf(v.animal);
  return `<div class="cat-row spirit-row">${iconHTML(`${A.sprites}_idle_front`, 'ico portrait')}<div><b>${A.name}</b><small>Visiting · cats +${Math.round((S().workMult - 1) * 100)}% · ${fmtH(v.until - G.state.simTime)} left</small></div></div>`;
}
export function spiritLights() {
  const v = sp()?.visit;
  return v ? [{ x: v.x, y: v.y - 12, r: animalOf(v.animal).light, col: '120,210,255' }] : [];
}

/* ------------------------------------------------------------- drawing */
function spriteFor(v) {
  const base = animalOf(v.animal).sprites, has = n => hasSprite(`${base}_${n}`);
  let n, flip = false;
  const side = v.side || 'left';
  if (v.moving) {
    if (v.dir === 'up' && has('walk_up')) n = 'walk_up';
    else if (v.dir === 'down' && has('walk_down')) n = 'walk_down';
    else { n = 'walk_side'; flip = (v.dir === 'left' || v.dir === 'right' ? v.dir : side) === 'left'; }
  } else if (v.dir === 'down' && has('idle_front')) n = 'idle_front';
  else if (v.dir === 'up' && has('idle_back')) n = 'idle_back';
  else { n = has('idle_side') ? 'idle_side' : 'idle_front'; flip = side === 'left'; }
  return { name: `${base}_${n}`, flip };
}
export function drawSpirits(push, ctx, t) {
  const s = sp();
  if (!s || s.stump < 0) return;
  const w = G.state.map.w, ax = s.stump % w, ay = (s.stump / w) | 0, C = S().stump;
  const d = DATA.sprites.sprites[C.sprite], sc = C.scale || 1;
  const sx = ax * TILE + TILE - (d?.w ?? 32) * sc / 2, sy = (ay + 2) * TILE - (d?.h ?? 32) * sc + 1;
  push((ay + 2) * TILE - 1, () => {
    drawSprite(ctx, C.sprite, 0, sx, sy, { scale: sc });
    if (s.offering) drawSprite(ctx, `fruit_${s.offering.fruit}`, 0, ax * TILE + 8, sy + 1, { scale: 0.75 });
    if (s.gift) drawSprite(ctx, 'icon_exclaim', 0, ax * TILE + 12, sy - 12 + Math.round(Math.sin(t * 4)));
  });
  const v = s.visit;
  if (!v) return;
  const A = animalOf(v.animal), { name, flip } = spriteFor(v), def = DATA.sprites.sprites[name], k = A.scale || 1;
  const fade = clamp((G.state.simTime - v.at) / 3, 0, 1) * clamp((v.until - G.state.simTime) / 3, 0, 1);
  const bob = Math.sin(t * 2) * 1.2;
  push(v.y, () => drawSprite(ctx, name, animFrame(name, v.t), v.x - (def?.ax ?? 16) * k, v.y - (def?.ay ?? 30) * k + bob, { scale: k, flip, alpha: 0.92 * fade }));
}
