// Fruit trees: plant a sapling, it grows through 5 stages, then fruits through 4 stages
// (blossom -> tiny fruit -> swelling -> ripe). Only you harvest; the cats water them.
// After a harvest the tree blossoms again.
import { G, TILE, randInt } from './game.js';
import { DATA } from './data.js';
import { drawSprite, hasSprite } from './sprites.js';
import { idx, tx, ty, inBounds, ground, obj, plotAt } from './world.js';
import { growBonusAt } from './decorations.js';
import { emit } from './particles.js';

// Each planted tree keeps one of 5 trunk styles (straight, leaning, forked, knotty, gnarled), shared by every tree type.
export const TRUNK_STYLES = 5;
export const treeAt = i => G.state.trees?.[i] || null;
export const treeDef = id => DATA.treeById[id];

// Times in trees.json are "while watered"; dry trees grow (1 + bonus) times slower.
const wetMult = () => 1 + DATA.balance.farm.waterGrowthBonus;
export const isWet = t => t.wetUntil > G.state.simTime;
export function treeRate(t, tile) { return growBonusAt(tile) * (1 + (isWet(t) ? DATA.balance.farm.waterGrowthBonus : 0)); }
export const stageSec = t => (treeDef(t.id)?.growHours ?? 36) * 3600 / 4 * wetMult();
export const fruitSec = t => (treeDef(t.id)?.fruitHours ?? 12) * 3600 / 3 * wetMult();
export const needsWater = t => (t.stage < 4 || t.fruit < 3) && !isWet(t);

export function updateTrees(dt) {
  const st = G.state;
  for (const k in st.trees) {
    const t = st.trees[k], tile = +k, rate = treeRate(t, tile);
    if (t.stage < 4) {
      t.g += dt * rate;
      const ns = Math.min(4, Math.floor(t.g / stageSec(t)));
      if (ns > t.stage) {
        t.stage = ns;
        if (t.stage === 4) { t.fruit = 0; t.fg = 0; }
        G.emit('treeGrew', { tile, tree: t, kind: 'stage' });
      }
    } else if (t.fruit < 3) {
      t.fg += dt * rate;
      const nf = Math.min(3, Math.floor(t.fg / fruitSec(t)));
      if (nf > t.fruit) { t.fruit = nf; G.emit('treeGrew', { tile, tree: t, kind: 'fruit' }); }
    }
  }
}
export function timeToNext(t, tile) {
  const rate = treeRate(t, tile);
  if (t.stage < 4) return ((t.stage + 1) * stageSec(t) - t.g) / rate;
  if (t.fruit < 3) return ((t.fruit + 1) * fruitSec(t) - t.fg) / rate;
  return 0;
}

/* ------------------------------------------------------------ planting */
export function plantProblem(tile) {
  if (tile < 0) return 'Out of bounds';
  const st = G.state, x = tx(tile), y = ty(tile);
  if (ground(tile) !== 'g') return ground(tile) === 'f' ? 'Clear the forest first' : 'Trees go on grass';
  if (obj(tile)) return 'Something is already there';
  if (plotAt(tile)) return 'Not inside a garden plot';
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { // full-grown crowns are about 3 tiles wide
    if (!inBounds(x + dx, y + dy)) continue;
    const o = obj(idx(x + dx, y + dy));
    if (o && o.startsWith('o:')) return 'Too close to another tree';
  }
  const c = st.cabin;
  if (x >= c.x - 1 && x <= c.x + 3 && y >= c.y - 1 && y <= c.y + 2) return 'Too close to the cabin';
  const p = st.player;
  if (Math.floor(p.x / TILE) === x && Math.floor((p.y - 3) / TILE) === y) return 'You are standing there';
  for (const cat of G.cats) if (Math.floor(cat.x / TILE) === x && Math.floor((cat.y - 2) / TILE) === y) return `${cat.cfg.name} is sitting there`;
  return null;
}
export function plantSapling(id, tile) {
  const st = G.state;
  if ((st.inv.saplings[id] || 0) <= 0 || plantProblem(tile)) return false;
  st.inv.saplings[id]--; if (!st.inv.saplings[id]) delete st.inv.saplings[id];
  st.map.obj[tile] = 'o:' + id;
  // each tree gets one of 5 looks, mirrored half the time (10 looks per tree type)
  st.trees[tile] = { id, stage: 0, g: 0, fruit: -1, fg: 0, wetUntil: 0, v: randInt(0, TRUNK_STYLES - 1) };
  G.emit('treePlanted', { tile, id });
  return true;
}
// Dig a tree up and get its sapling back.
export function digUp(tile) {
  const st = G.state, t = st.trees[tile];
  if (!t) return null;
  delete st.trees[tile];
  if (st.map.obj[tile]?.startsWith('o:')) st.map.obj[tile] = null;
  st.inv.saplings[t.id] = (st.inv.saplings[t.id] || 0) + 1;
  return t.id;
}

/* ------------------------------------------------------------- harvest */
export function harvestTree(tile) {
  const st = G.state, t = st.trees[tile];
  if (!t || t.fruit < 3) return null;
  const d = treeDef(t.id), n = randInt(d.yield[0], d.yield[1]);
  st.inv.fruit[t.id] = (st.inv.fruit[t.id] || 0) + n;
  const first = !st.fruitFound[t.id];
  st.fruitFound[t.id] = (st.fruitFound[t.id] || 0) + n;
  t.fruit = 0; t.fg = 0; // blossoms again
  st.stats.fruitPicked = (st.stats.fruitPicked || 0) + n;
  const res = { tile, id: t.id, def: d, n, first };
  G.emit('fruitHarvest', res);
  return res;
}
export function buySapling(id) {
  const st = G.state, d = treeDef(id);
  if (!d || st.coins < d.saplingPrice) return false;
  st.coins -= d.saplingPrice;
  st.inv.saplings[id] = (st.inv.saplings[id] || 0) + 1;
  return true;
}
export function sellFruit(id, n) {
  const inv = G.state.inv.fruit, have = inv[id] || 0;
  n = Math.min(n, have);
  if (n <= 0) return 0;
  const coins = n * (treeDef(id)?.fruitPrice ?? 1);
  inv[id] = have - n; if (!inv[id]) delete inv[id];
  G.state.coins += coins;
  G.state.stats.earned = (G.state.stats.earned || 0) + coins;
  return coins;
}

/* ------------------------------------------------------------ describe */
export function treeStatus(t) {
  const names = DATA.treeStageNames, fnames = DATA.fruitStageNames;
  if (t.stage < 4) return `${names[t.stage]} (${t.stage + 1}/5)`;
  return `${names[4]} · ${fnames[Math.max(0, t.fruit)]}${t.fruit >= 0 && t.fruit < 3 ? ` (${t.fruit + 1}/4)` : ''}`;
}

/* -------------------------------------------------------------- render */
const STAGE_ART = [['young', 0.55], ['young', 0.78], ['young', 1], ['grown', 0.82], ['grown', 1]];
export function drawTree(ctx, tile, t) {
  const x = tx(tile) * TILE + 8, y = (ty(tile) + 1) * TILE - 1;
  if (isWet(t)) { ctx.fillStyle = 'rgba(43,58,90,0.35)'; ctx.beginPath(); ctx.ellipse(x, y - 1, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
  // Imported tree art (art/fruit-trees-sheet.png): a young and a grown picture per tree.
  // Stages: young at 55%, 78% and full size, then grown at 82% and full size (with the fruit).
  if (hasSprite(`ftree2_${t.id}_grown`)) {
    const [name, sc] = STAGE_ART[t.stage] || STAGE_ART[4], spr = `ftree2_${t.id}_${name}`, d = DATA.sprites.sprites[spr];
    const px = x - d.ax * sc, py = y + 1 - d.ay * sc;
    drawSprite(ctx, spr, 0, px, py, { scale: sc });
    if (t.stage === 4 && t.fruit >= 0) drawSprite(ctx, `ffruit2_${t.id}`, t.fruit, px, py);
    if (t.fruit === 3 && !G.offline && Math.random() < 0.01) emit({ x: x - 12 + Math.random() * 24, y: py + 6 + Math.random() * d.h * 0.5, vy: -6, life: 0.8, sprite: 'fx_sparkle', frameRate: 6, fade: false });
    return;
  }
  const shape = treeDef(t.id)?.shape || 'round', trunk = `ftrunk_${shape}_${(t.v ?? 0) % TRUNK_STYLES}`;
  if (t.stage > 0) drawSprite(ctx, trunk, t.stage, x - 16, y - 47);
  drawSprite(ctx, `ftree_${t.id}`, t.stage, x - 16, y - 47);
  if (t.stage === 4 && t.fruit >= 0) drawSprite(ctx, `ffruit_${t.id}`, t.fruit, x - 16, y - 47);
  if (t.fruit === 3 && !G.offline && Math.random() < 0.01) emit({ x: x - 10 + Math.random() * 20, y: y - 40 + Math.random() * 20, vy: -6, life: 0.8, sprite: 'fx_sparkle', frameRate: 6, fade: false });
}
