// Generates data/sprites.json — the default placeholder pixel art for the game.
// Run with: node tools/gen-sprites.mjs
// Sprites are palette-indexed: each frame is an array of row strings where
// '.' is transparent and '0'-'9','a'-'v' are indices into the 32-colour palette.
// Once you start editing sprites in the Workshop, export from there instead of
// re-running this script (it would overwrite your art).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'sprites.json');

const PALETTE = [
  '#1a1423', '#3b2a3a', '#5e3b2e', '#8a5a3b', '#b98352', '#e0b98a', '#f6e7c8', '#fffaf0',
  '#2e4a3a', '#3f6e46', '#5d9b4f', '#8cc65a', '#c4e27a', '#2b3a5a', '#4a6fa5', '#7fb3d5',
  '#b7e0ef', '#6b2e3e', '#b8434a', '#e5735a', '#f29b4b', '#f7cd5d', '#fbe9a0', '#5b3a6e',
  '#8e5ba8', '#c89bd8', '#e88fb0', '#f7c6d3', '#4d4a52', '#7d7a80', '#b3aeb0', '#dcd6cf',
];
const C = {
  out: 0, plum: 1, dbrown: 2, brown: 3, tan: 4, ltan: 5, cream: 6, white: 7,
  dgreen: 8, green1: 9, green: 10, lgreen: 11, pgreen: 12, dblue: 13, blue: 14, lblue: 15,
  pblue: 16, dred: 17, red: 18, coral: 19, orange: 20, yellow: 21, pyellow: 22, purple: 23,
  violet: 24, lav: 25, pink: 26, ppink: 27, dgray: 28, gray: 29, lgray: 30, vlgray: 31,
};
// palette index characters: up to 62 colours per palette ('.' = transparent)
const CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class G {
  constructor(w, h) { this.w = w; this.h = h; this.p = new Int16Array(w * h).fill(-1); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (c != null && this.in(x, y)) this.p[y * this.w + x] = c; return this; }
  get(x, y) { return this.in(x, y) ? this.p[y * this.w + x] : -1; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
  fill(c) { return this.rect(0, 0, this.w, this.h, c); }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    return this;
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  pts(list, c) { for (const [x, y] of list) this.set(x, y, c); return this; }
  // Paint every transparent pixel that touches a filled pixel.
  outline(c = C.out, diag = false) {
    const src = this.p.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x] !== -1) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (diag) n.push([1, 1], [-1, -1], [1, -1], [-1, 1]);
      for (const [dx, dy] of n) {
        const xx = x + dx, yy = y + dy;
        if (this.in(xx, yy) && src[yy * this.w + xx] !== -1 && src[yy * this.w + xx] !== c) { this.p[y * this.w + x] = c; break; }
      }
    }
    return this;
  }
  replace(a, b) { for (let i = 0; i < this.p.length; i++) if (this.p[i] === a) this.p[i] = b; return this; }
  clone() { const g = new G(this.w, this.h); g.p = this.p.slice(); return g; }
  flipX() { const g = new G(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.p[y * this.w + x] = this.p[y * this.w + (this.w - 1 - x)]; return g; }
  shift(dx, dy) { const g = new G(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.set(x + dx, y + dy, this.get(x, y) === -1 ? null : this.get(x, y)); return g; }
  stamp(o, ox = 0, oy = 0) { for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const v = o.get(x, y); if (v !== -1) this.set(x + ox, y + oy, v); } return this; }
  rows() { const r = []; for (let y = 0; y < this.h; y++) { let s = ''; for (let x = 0; x < this.w; x++) { const v = this.p[y * this.w + x]; s += v < 0 ? '.' : CH[v]; } r.push(s); } return r; }
}

const sprites = {};
function add(name, cat, frames, fps = 0, extra = {}) {
  if (!Array.isArray(frames)) frames = [frames];
  sprites[name] = { w: frames[0].w, h: frames[0].h, cat, fps, frames: frames.map(f => f.rows()), ...extra };
}

/* ------------------------------------------------------------------ tiles */
function grass(seed, flowers = false) {
  const g = new G(16, 16).fill(C.green), r = rng(seed);
  for (let i = 0; i < 9; i++) { const x = (r() * 16) | 0, y = (r() * 16) | 0; g.set(x, y, C.lgreen); g.set(x + 1, y - 1, C.lgreen); }
  for (let i = 0; i < 6; i++) { const x = (r() * 16) | 0, y = (r() * 16) | 0; g.set(x, y, C.green1); }
  if (flowers) for (let i = 0; i < 3; i++) {
    const x = 2 + ((r() * 12) | 0), y = 2 + ((r() * 12) | 0), col = [C.white, C.pink, C.yellow][i % 3];
    g.pts([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]], col); g.set(x, y, C.yellow === col ? C.orange : C.yellow);
  }
  return g;
}
for (let i = 0; i < 4; i++) add(`grass_${i}`, 'tiles', grass(11 + i * 7));
// Eight more grass textures in the same greens, so open ground doesn't look tiled.
function grassTexture(kind) {
  const g = new G(16, 16).fill(C.green), r = rng(500 + kind * 31);
  const R = n => Math.floor(r() * n);
  switch (kind) {
    case 4: // clover patches
      for (let k = 0; k < 3; k++) { const x = 2 + R(12), y = 2 + R(12); g.pts([[x, y - 1], [x - 1, y], [x + 1, y], [x - 1, y - 1], [x + 1, y - 1]], C.lgreen).set(x, y, C.green1).set(x, y + 1, C.green1); }
      for (let k = 0; k < 4; k++) g.set(R(16), R(16), C.green1);
      break;
    case 5: // long blades
      for (let k = 0; k < 9; k++) { const x = R(16), y = 3 + R(12), h = 2 + R(3), c = k % 3 ? C.lgreen : C.green1; for (let j = 0; j < h; j++) g.set(x + (j === h - 1 && r() < 0.5 ? 1 : 0), y - j, c); }
      break;
    case 6: // short and calm
      for (let k = 0; k < 6; k++) g.set(R(16), R(16), k % 2 ? C.lgreen : C.green1);
      break;
    case 7: // shady dapples
      for (const [px, py] of [[4, 4], [11, 7], [5, 12]]) g.ellipse(px + R(2), py + R(2), 1.4 + r() * 0.8, 1 + r() * 0.5, C.green1);
      for (let k = 0; k < 5; k++) g.set(R(16), R(16), C.lgreen);
      break;
    case 8: // sunlit patches
      for (const [px, py] of [[4, 4], [11, 7], [5, 12]]) g.ellipse(px + R(2), py + R(2), 1.4 + r() * 0.8, 1 + r() * 0.5, C.lgreen);
      for (let k = 0; k < 3; k++) g.set(R(16), R(16), C.pgreen);
      for (let k = 0; k < 4; k++) g.set(R(16), R(16), C.green1);
      break;
    case 9: // a few pebbles in the grass
      for (let k = 0; k < 3; k++) { const x = 2 + R(12), y = 2 + R(12); g.set(x, y, C.lgray).set(x + 1, y, C.gray).set(x, y + 1, C.gray); }
      for (let k = 0; k < 6; k++) { const x = R(16), y = R(16); g.set(x, y, C.lgreen).set(x + 1, y - 1, C.lgreen); }
      break;
    case 10: // little v-shaped tufts
      for (let k = 0; k < 7; k++) { const x = 1 + R(14), y = 2 + R(13); g.pts([[x - 1, y - 1], [x, y], [x + 1, y - 1]], k % 3 ? C.lgreen : C.green1); }
      break;
    case 11: // scattered fallen leaves
      for (let k = 0; k < 4; k++) { const x = 1 + R(13), y = 1 + R(14), c = k % 2 ? C.lgreen : C.green1; g.pts([[x, y], [x + 1, y], [x + 1, y - 1], [x + 2, y - 1]], c); }
      for (let k = 0; k < 4; k++) g.set(R(16), R(16), C.lgreen);
      break;
  }
  return g;
}
for (let i = 4; i < 12; i++) add(`grass_${i}`, 'tiles', grassTexture(i));
add('grass_flowers', 'tiles', grass(99, true));

function soil(wet) {
  const base = wet ? C.dbrown : C.brown, dark = wet ? C.plum : C.dbrown, hi = wet ? C.brown : C.tan;
  const g = new G(16, 16).fill(base), r = rng(wet ? 5 : 3);
  for (const y of [3, 7, 11, 15]) { for (let x = 0; x < 16; x++) g.set(x, y, dark); for (let x = 1; x < 16; x += 3) g.set(x + ((y / 4) | 0) % 2, y - 1, hi); }
  for (let i = 0; i < 5; i++) g.set((r() * 16) | 0, (r() * 16) | 0, dark);
  if (wet) for (let i = 0; i < 3; i++) g.set((r() * 16) | 0, (r() * 16) | 0, C.dblue);
  return g;
}
add('soil', 'tiles', soil(false));
add('soil_wet', 'tiles', soil(true));

{
  const g = grass(42), r = rng(7);
  const stones = [[4, 4, 3, 2.5], [11, 5, 3.5, 2.5], [5, 11, 3.5, 3], [12, 12, 3, 2.5]];
  for (const [x, y, rx, ry] of stones) { g.ellipse(x, y, rx + 1, ry + 1, C.gray); g.ellipse(x, y, rx, ry, C.lgray); g.set(x - 1, y - 1, C.vlgray); g.set(x + (r() > 0.5 ? 1 : 0), y + 1, C.gray); }
  add('path_stone', 'tiles', g);
  const w = new G(16, 16).fill(C.tan);
  for (const y of [0, 5, 10, 15]) for (let x = 0; x < 16; x++) w.set(x, y, C.brown);
  for (const y of [2, 7, 12]) { w.set(2, y, C.dbrown); w.set(13, y, C.dbrown); for (let x = 4; x < 11; x += 2) w.set(x, y - 1, C.ltan); }
  w.set(8, 3, C.brown); w.set(6, 8, C.brown); w.set(9, 13, C.brown);
  add('path_wood', 'tiles', w);
}

function forest(seed) {
  const g = new G(16, 16).fill(C.dgreen), r = rng(seed);
  for (let i = 0; i < 6; i++) { const x = r() * 16, y = r() * 16; g.ellipse(x, y, 3, 2.5, C.green1); g.set(x - 1, y - 1, C.green); }
  for (let i = 0; i < 4; i++) g.set((r() * 16) | 0, (r() * 16) | 0, C.plum);
  return g;
}
for (let i = 0; i < 3; i++) add(`forest_${i}`, 'tiles', forest(200 + i));

// Water: shallow (rivers, near the shore) and deep (middle of the lake), each with 3 gently moving frames,
// plus foam edges drawn on the side of a water tile that touches land.
function water(deep, f) {
  const base = deep ? C.dblue : C.blue, hi = deep ? C.blue : C.lblue, r = rng(deep ? 77 : 33);
  const g = new G(16, 16).fill(base);
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(r() * 14), y = Math.floor(r() * 16), len = 2 + Math.floor(r() * 3);
    const shift = [0, 1, 0][f] * (k % 2 ? 1 : -1);
    for (let j = 0; j < len; j++) g.set((x + j + shift + 16) % 16, y, hi);
  }
  if (!deep) { const x = Math.floor(r() * 12) + 2, y = Math.floor(r() * 12) + 2; if (f === 1) g.set(x, y, C.pblue); if (f === 2) g.set(x + 1, y + 1, C.pblue); }
  return g;
}
add('water', 'tiles', [0, 1, 2].map(f => water(false, f)), 2);
add('water_deep', 'tiles', [0, 1, 2].map(f => water(true, f)), 2);
{
  const edge = (dir) => {
    const g = new G(16, 16);
    for (let k = 0; k < 16; k++) {
      const wob = (k % 5 === 0 ? 1 : 0);
      const pts = { n: [[k, 0], [k, 1 + wob]], s: [[k, 15], [k, 14 - wob]], w: [[0, k], [1 + wob, k]], e: [[15, k], [14 - wob, k]] }[dir];
      g.set(pts[0][0], pts[0][1], C.ltan).set(pts[1][0], pts[1][1], k % 3 ? C.pblue : C.white);
    }
    return g;
  };
  for (const d of ['n', 's', 'w', 'e']) add(`water_edge_${d}`, 'tiles', edge(d));
}

// Sand for the beach along the bottom of the lake: three looks, a few with shells or driftwood.
function sand(v) {
  const g = new G(16, 16).fill(C.ltan), r = rng(900 + v * 13);
  for (let k = 0; k < 10; k++) g.set(Math.floor(r() * 16), Math.floor(r() * 16), k % 3 ? C.tan : C.cream);
  for (let k = 0; k < 3; k++) { const x = Math.floor(r() * 14), y = Math.floor(r() * 15); g.set(x, y, C.cream).set(x + 1, y, C.cream); }
  if (v === 1) g.pts([[5, 9], [6, 9], [7, 9], [6, 8]], C.ppink).set(6, 9, C.pink); // a little shell
  if (v === 2) g.line(3, 11, 10, 9, C.brown).line(4, 12, 10, 10, C.tan).set(11, 9, C.dbrown); // driftwood
  return g;
}
for (let v = 0; v < 3; v++) add(`sand_${v}`, 'tiles', sand(v));

function tree(kind) {
  const g = new G(24, 32);
  const trunk = (col = C.brown, hi = C.tan, dark = C.dbrown, w = 4) => { g.rect(12 - w / 2, 22, w, 9, col); g.set(12 - w / 2, 30, dark); g.set(12 + w / 2, 30, col); g.set(11 - w / 2, 30, col); g.line(11, 23, 11, 29, hi); };
  const blob = (base, mid, hi, dark, spots = [[15, 6], [17, 10], [6, 14], [14, 16], [18, 15], [8, 18]], shade = [[16, 19], [7, 20], [19, 12], [12, 21]]) => {
    g.ellipse(12, 13, 10.5, 10, base); g.ellipse(11, 11, 8, 7.5, mid); g.ellipse(9, 8, 4, 3, hi);
    g.pts(spots, hi); g.pts(shade, dark);
  };
  if (kind === 0) { trunk(); blob(C.green1, C.green, C.lgreen, C.dgreen); }
  else if (kind === 1) { trunk();
    for (let t = 0; t < 4; t++) { const y = 4 + t * 5, half = 3 + t * 2.4; for (let j = 0; j < 7; j++) { const hw = Math.round(half * (j + 1) / 7); g.rect(12 - hw, y + j, hw * 2, 1, j < 2 ? C.green : C.green1); } }
    g.pts([[11, 5], [10, 11], [9, 16], [8, 21], [13, 9], [12, 14]], C.lgreen);
  } else if (kind === 2) { // birch: pale trunk with dark marks, light airy leaves
    g.rect(10, 12, 4, 19, C.vlgray).line(10, 12, 10, 30, C.lgray);
    g.pts([[11, 15], [12, 15], [12, 19], [13, 19], [11, 23], [11, 27], [12, 27]], C.dgray);
    g.ellipse(12, 10, 8.5, 8, C.green).ellipse(11, 8, 6, 5.5, C.lgreen).ellipse(9, 6, 3, 2.2, C.pgreen);
    g.ellipse(6, 14, 3.5, 3, C.green).ellipse(18, 13, 3.5, 3, C.green).pts([[14, 5], [16, 9], [6, 12], [12, 14]], C.pgreen).pts([[15, 16], [8, 16]], C.green1);
  } else if (kind === 3) { // wide cloud tree: a broad canopy of soft puffs
    trunk(C.brown, C.tan, C.dbrown);
    g.line(12, 23, 8, 19, C.brown).line(12, 23, 16, 19, C.brown);
    const puffs = [[5, 15, 4.5, 4], [19, 15, 4.5, 4], [8, 9, 5.5, 5], [16, 9, 5.5, 5], [12, 5, 5, 4.5], [12, 14, 6.5, 5]];
    for (const [x, y, rx, ry] of puffs) g.ellipse(x, y, rx + 0.6, ry + 0.6, C.green1);
    for (const [x, y, rx, ry] of puffs) g.ellipse(x - 0.5, y - 0.5, rx - 0.4, ry - 0.4, C.green);
    for (const [x, y, rx] of puffs) g.ellipse(x - rx * 0.35, y - 1.6, rx * 0.4, 1.3, C.lgreen);
    g.pts([[4, 18], [20, 18], [9, 19], [15, 19], [12, 18]], C.green1).pts([[11, 3], [7, 7], [15, 7]], C.pgreen);
  } else if (kind === 4) { // tall cloud tree: stacked puffs like a pile of clouds
    trunk(C.brown, C.tan, C.dbrown, 3);
    const puffs = [[12, 4, 4.5, 3.8], [8, 10, 5, 4.3], [16, 10, 5, 4.3], [12, 12, 5, 4], [7, 17, 5, 4], [17, 17, 5, 4], [12, 19, 5.5, 3.5]];
    for (const [x, y, rx, ry] of puffs) g.ellipse(x, y, rx + 0.6, ry + 0.6, C.dgreen);
    for (const [x, y, rx, ry] of puffs) g.ellipse(x - 0.4, y - 0.5, rx - 0.5, ry - 0.5, C.green1);
    for (const [x, y, rx] of puffs) g.ellipse(x - rx * 0.3, y - 1.5, rx * 0.45, 1.2, C.green);
    g.pts([[11, 2], [6, 8], [14, 8], [5, 15], [15, 15]], C.lgreen);
  } else if (kind === 5) { // tall dark spruce
    g.rect(11, 25, 2, 6, C.dbrown).set(10, 30, C.dbrown).set(13, 30, C.dbrown);
    for (let t = 0; t < 6; t++) { const y = 1 + t * 4, half = 2 + t * 1.8; for (let j = 0; j < 5; j++) { const hw = Math.max(1, Math.round(half * (j + 1) / 5)); g.rect(12 - hw, y + j, hw * 2, 1, j < 1 ? C.green1 : C.dgreen); } }
    g.pts([[11, 3], [10, 8], [9, 13], [8, 18], [7, 23], [13, 6], [14, 15]], C.green1).pts([[12, 0], [12, 1]], C.green1);
  } else if (kind === 6) { // old mossy oak: wide, low, with a hollow
    g.rect(9, 20, 6, 11, C.brown).line(9, 20, 9, 30, C.dbrown).line(10, 21, 10, 29, C.tan).ellipse(12.5, 25, 1.2, 1.8, C.out);
    g.pts([[7, 30], [8, 29], [16, 30], [15, 29], [6, 31], [17, 31]], C.brown).pts([[9, 27], [10, 28], [14, 23]], C.green);
    g.ellipse(12, 12, 11.5, 9, C.dgreen).ellipse(11, 10, 9.5, 7.5, C.green1).ellipse(9, 8, 5, 3.5, C.green);
    g.ellipse(4, 14, 3.5, 3, C.green1).ellipse(20, 14, 3.5, 3, C.green1);
    g.pts([[6, 7], [15, 5], [17, 9], [13, 13], [7, 12]], C.green).pts([[16, 17], [6, 17], [11, 18]], C.dgreen);
  }
  return g.outline();
}
const TREE_KINDS = 7;
for (let k = 0; k < TREE_KINDS; k++) add(`tree_${k}`, 'tiles', tree(k));

/* ----------------------------------------------------------------- debris */
// Each debris type has 5 looks: debris_<type> plus debris_<type>_1 .. _4.
// The game picks one per tile so the clearing doesn't look copy-pasted.
const DEBRIS_VARIANTS = 5;
const debrisArt = {
  twig(v, r) {
    const g = new G(16, 16);
    if (v === 0) {
      g.line(3, 12, 12, 9, C.brown).line(4, 13, 12, 10, C.dbrown).line(7, 11, 6, 7, C.brown).line(10, 10, 13, 13, C.dbrown);
      g.pts([[6, 6], [5, 6], [6, 5]], C.green).set(13, 14, C.lgreen);
    } else {
      const n = 2 + (v % 2);
      for (let k = 0; k < n; k++) {
        const x0 = 2 + r() * 4, y0 = 9 + r() * 5, x1 = 10 + r() * 4, y1 = 7 + r() * 6;
        g.line(x0, y0, x1, y1, k % 2 ? C.dbrown : C.brown);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        if (r() < 0.7) g.line(mx, my, mx + (r() - 0.5) * 6, my - 2 - r() * 3, C.brown);
      }
      if (v === 2) g.pts([[11, 6], [12, 6], [11, 5]], C.orange).set(12, 5, C.yellow); // a fallen leaf
      if (v === 3) g.pts([[4, 7], [5, 6], [5, 7]], C.green).pts([[12, 11], [13, 11]], C.lgreen);
      if (v === 4) g.ellipse(11, 12, 1.5, 1, C.tan).set(11, 12, C.brown); // pinecone
    }
    return g.outline();
  },
  weeds(v, r) {
    const g = new G(16, 16);
    const blades = v === 0 ? [[4, 6], [6, 8], [8, 5], [10, 9], [12, 6]] : Array.from({ length: 4 + (v % 3) }, (_, k) => [3 + k * (10 / (3 + (v % 3))) + r(), 4 + r() * 6]);
    for (const [x, h] of blades) g.line(x, 14, x + (r() < 0.5 ? 1 : -1), 14 - h, r() < 0.5 ? C.green : C.green1);
    g.pts([[7, 7], [11, 6], [5, 9]].map(([x, y]) => [x + (v ? Math.round(r() * 2 - 1) : 0), y]), C.lgreen);
    const flower = [C.yellow, C.white, C.lav, C.pink, C.yellow][v];
    const fx = v === 0 ? 10 : 4 + Math.round(r() * 8), fy = v === 0 ? 4 : 4 + Math.round(r() * 3);
    if (v !== 3) g.set(fx, fy, flower);
    if (v === 4) g.pts([[fx - 1, fy], [fx + 1, fy], [fx, fy - 1]], C.yellow).set(fx, fy, C.orange); // dandelion
    return g.outline();
  },
  bush(v, r) {
    const g = new G(16, 16);
    const rx = 6 + r() * 1.2, ry = 4.8 + r() * 1;
    g.ellipse(8, 10, rx, ry, C.green1).ellipse(7, 9, rx - 2, ry - 1.5, C.green);
    if (v === 2) g.ellipse(4, 11, 3, 2.5, C.green1).ellipse(12, 11, 3, 2.5, C.green1);
    for (let k = 0; k < 5; k++) g.set(4 + Math.round(r() * 8), 6 + Math.round(r() * 5), C.lgreen);
    g.pts([[10, 12], [6, 13]], C.dgreen);
    const berry = [C.red, C.blue, null, C.white, C.purple][v];
    if (berry) for (let k = 0; k < 3; k++) g.set(4 + Math.round(r() * 8), 7 + Math.round(r() * 5), berry);
    return g.outline();
  },
  rock(v, r) {
    const g = new G(16, 16);
    if (v === 3) { // two small rocks
      g.ellipse(5, 11, 3.5, 2.7, C.gray).ellipse(4.5, 10.5, 2.3, 1.7, C.lgray).ellipse(11, 12, 3, 2.3, C.gray).ellipse(10.5, 11.5, 2, 1.4, C.lgray).set(4, 10, C.vlgray).set(10, 11, C.vlgray);
      return g.outline();
    }
    const rx = 5.5 + r() * 1.5, ry = 3.8 + r() * 1.2;
    g.ellipse(8, 11, rx, ry, C.gray).ellipse(7, 10, rx - 1.5, ry - 1.2, C.lgray).pts([[5, 9], [6, 8], [7, 8]], C.vlgray).pts([[11, 13], [10, 14], [6, 14]], C.dgray);
    if (v === 1) g.line(8, 8, 10, 12, C.dgray); // crack
    if (v === 2) g.pts([[6, 7], [7, 7], [8, 7], [9, 8]], C.green).set(7, 7, C.lgreen); // moss
    if (v === 4) g.pts([[11, 9], [12, 10]], C.lav); // a pretty crystal fleck
    return g.outline();
  },
  stump_small(v, r) { return stumpArt(false, v, r); },
  stump_big(v, r) { return stumpArt(true, v, r); },
  boulder(v, r) {
    const g = new G(16, 16);
    const rx = 7 + r() * 0.6, ry = 6 + r() * 0.8;
    g.ellipse(8, 9, rx, ry, C.gray).ellipse(7, 8, rx - 1.5, ry - 1.5, C.lgray).pts([[4, 6], [5, 5], [6, 5]], C.vlgray).pts([[12, 13], [10, 14], [5, 14], [13, 11]], C.dgray);
    if (v === 0 || v === 2) g.pts([[6, 3], [7, 3], [8, 3], [9, 4], [5, 4], [7, 4]], C.green).pts([[6, 3], [8, 3]], C.lgreen);
    if (v === 1) g.line(9, 4, 11, 9, C.dgray).line(11, 9, 10, 12, C.dgray);
    if (v === 2) g.pts([[3, 11], [4, 12], [12, 6]], C.green);
    if (v === 3) g.ellipse(12, 12, 2.5, 2, C.gray).set(11, 11, C.lgray); // a pebble beside it
    if (v === 4) g.pts([[10, 7], [11, 7], [10, 8]], C.white).pts([[5, 10], [6, 11]], C.lav); // sparkly
    return g.outline();
  },
};
function stumpArt(big, v, r) {
  const g = new G(16, 16), w = (big ? 7 : 5) - (v === 3 ? 1 : 0);
  const h = (big ? 5 : 4) + (v === 1 ? 1 : 0);
  g.rect(8 - w, 14 - h, w * 2, h, C.brown).line(8 - w + 1, 15 - h, 8 - w + 1, 13, C.dbrown).line(8 + w - 2, 15 - h, 8 + w - 2, 13, C.tan);
  g.ellipse(8, 14 - h, w, big ? 2.6 : 2.2, C.ltan).ellipse(8, 14 - h, w - 2, 1.4, C.tan).set(8, 14 - h, C.ltan);
  g.pts([[8 - w - 1, 14], [8 + w, 14], [6, 14], [10, 14]], C.dbrown);
  if (v === 0 && big) g.pts([[3, 6], [4, 5]], C.green);
  if (v === 2) g.pts([[8 + w - 1, 13 - h], [8 + w, 12 - h], [8 + w, 13 - h]], C.green).set(8 + w, 11 - h, C.lgreen); // little sprout
  if (v === 3) g.ellipse(8 + w + 1, 13, 1.5, 1, C.coral).set(8 + w + 1, 12, C.red); // mushroom
  if (v === 4) g.pts([[8 - w - 2, 13], [8 - w - 3, 14], [8 + w + 1, 13], [8 + w + 2, 14]], C.dbrown).set(8 - 1, 14 - h, C.brown);
  return g.outline();
}
for (const [type, fn] of Object.entries(debrisArt)) {
  for (let v = 0; v < DEBRIS_VARIANTS; v++) {
    const r = rng(1000 + v * 97 + type.length * 13);
    add(v === 0 ? `debris_${type}` : `debris_${type}_${v}`, 'debris', fn(v, r));
  }
}

/* ------------------------------------------------------------------ cabin */
{
  const g = new G(48, 48);
  // walls (logs)
  g.rect(2, 18, 44, 27, C.tan);
  for (let y = 18; y < 45; y += 4) { g.line(2, y + 3, 45, y + 3, C.brown); g.line(2, y, 45, y, C.ltan); }
  for (let y = 19; y < 45; y += 4) { g.ellipse(2.5, y + 1.5, 2, 2, C.ltan); g.set(2, y + 1, C.brown); g.ellipse(45.5, y + 1.5, 2, 2, C.ltan); g.set(45, y + 1, C.brown); }
  // foundation
  g.rect(1, 44, 46, 4, C.gray); for (let x = 1; x < 47; x += 4) { g.set(x, 45, C.lgray); g.set(x + 2, 46, C.dgray); }
  // windows
  for (const wx of [6, 33]) {
    g.rect(wx, 27, 10, 10, C.cream).rect(wx + 1, 28, 8, 8, C.lblue).rect(wx + 1, 28, 3, 2, C.pblue);
    g.line(wx + 5, 28, wx + 5, 35, C.cream).line(wx + 1, 31, wx + 8, 31, C.cream);
    g.line(wx, 37, wx + 9, 37, C.brown);
  }
  // door hole (door overlays drawn on top)
  g.rect(19, 30, 10, 15, C.dbrown);
  g.rect(18, 44, 12, 1, C.lgray);
  // roof
  for (let y = 0; y < 21; y++) {
    const inset = Math.max(0, 8 - y);
    const col = y % 3 === 2 ? C.dred : C.red;
    g.rect(inset, y + 2, 48 - inset * 2, 1, col);
  }
  for (let y = 4; y < 22; y += 3) for (let x = (y % 6 === 1 ? 2 : 5); x < 46; x += 6) g.set(x, y, C.coral);
  g.rect(0, 22, 48, 1, C.dred);
  g.rect(8, 2, 32, 1, C.coral);
  // chimney
  g.rect(34, 0, 6, 9, C.gray).rect(33, 0, 8, 2, C.lgray).pts([[35, 3], [38, 5], [36, 7]], C.dgray);
  add('cabin', 'cabin', g.outline(), 0, { swaps: ['roof', 'wall'] });

  const door = (style) => {
    const d = new G(10, 15);
    if (style === 0) { d.rect(0, 0, 10, 15, C.brown); for (let x = 2; x < 10; x += 3) d.line(x, 0, x, 14, C.dbrown); d.set(7, 8, C.yellow); }
    if (style === 1) { d.rect(0, 2, 10, 13, C.green1); d.rect(1, 0, 8, 2, C.green1); d.rect(2, 3, 6, 4, C.lblue); d.line(5, 3, 5, 6, C.green1); d.set(7, 9, C.yellow); d.rect(1, 1, 8, 1, C.green); }
    if (style === 2) { d.ellipse(5, 7.5, 5, 7.5, C.red); d.rect(0, 7, 10, 8, C.red); d.ellipse(5, 6, 2, 2, C.pyellow); d.set(5, 6, C.yellow); d.set(8, 9, C.yellow); d.line(0, 14, 9, 14, C.dred); }
    if (style === 3) { d.rect(0, 0, 10, 15, C.lav); d.rect(1, 1, 8, 13, C.violet); d.rect(2, 2, 6, 5, C.lav); d.rect(2, 8, 6, 5, C.lav); d.set(7, 7, C.yellow); }
    if (style === 4) { d.ellipse(5, 6, 5, 6, C.blue); d.rect(0, 6, 10, 9, C.blue); d.line(5, 1, 5, 14, C.dblue); d.ellipse(5, 5, 2.2, 2.2, C.pblue); d.set(7, 9, C.yellow); d.set(3, 9, C.yellow); }
    if (style === 5) { d.rect(0, 0, 10, 15, C.yellow); d.rect(0, 0, 10, 1, C.orange); d.ellipse(5, 5, 2.6, 2.6, C.lblue).set(4, 4, C.pblue); d.line(1, 10, 8, 10, C.orange); d.set(8, 8, C.brown); }
    return d;
  };
  for (let i = 0; i < 6; i++) add(`cabin_door_${i}`, 'cabin', door(i));

  const box = new G(12, 5);
  box.rect(0, 2, 12, 3, C.brown).line(0, 2, 11, 2, C.tan);
  box.pts([[1, 1], [4, 1], [7, 1], [10, 1]], C.green).pts([[2, 0], [3, 1], [8, 0], [9, 1]], C.pink).pts([[5, 0], [6, 1], [11, 0]], C.yellow).pts([[1, 0], [10, 0]], C.white);
  add('cabin_windowbox', 'cabin', box);

  const smoke = new G(8, 8);
  smoke.ellipse(4, 4, 3.5, 3, C.vlgray).ellipse(3, 3, 2, 1.5, C.white);
  add('fx_smoke', 'fx', smoke);
}

/* ------------------------------------------------------ props and decor */
{
  const crate = new G(16, 16);
  crate.rect(2, 5, 12, 10, C.tan).rect(2, 5, 12, 2, C.ltan);
  for (const y of [8, 11]) crate.line(2, y, 13, y, C.brown);
  crate.line(2, 14, 13, 14, C.brown).line(3, 7, 12, 13, C.brown);
  crate.rect(5, 2, 6, 3, C.orange).pts([[6, 1], [8, 1]], C.green).set(9, 2, C.red);
  add('crate', 'decor', crate.outline());

  const shop = new G(16, 16);
  shop.rect(7, 9, 2, 6, C.brown).rect(1, 1, 14, 9, C.tan).rect(2, 2, 12, 7, C.ltan);
  shop.rect(3, 3, 3, 4, C.red).rect(7, 3, 3, 4, C.blue).rect(11, 3, 2, 4, C.yellow);
  shop.pts([[4, 4], [8, 4], [11, 4]], C.white).rect(1, 0, 14, 1, C.red).pts([[3, 0], [7, 0], [11, 0]], C.white);
  add('shop', 'decor', shop.outline());

  const lantern = new G(16, 16);
  lantern.rect(7, 7, 2, 8, C.dgray).rect(5, 14, 6, 1, C.dgray).rect(5, 2, 6, 6, C.dgray).rect(6, 3, 4, 4, C.yellow).set(7, 4, C.pyellow).rect(6, 1, 4, 1, C.dgray);
  add('decor_lantern', 'decor', lantern.outline());

  const bench = new G(16, 16);
  bench.rect(1, 6, 14, 3, C.tan).line(1, 6, 14, 6, C.ltan).rect(1, 10, 14, 2, C.tan).line(1, 10, 14, 10, C.ltan);
  bench.rect(2, 12, 2, 3, C.brown).rect(12, 12, 2, 3, C.brown).rect(2, 9, 1, 1, C.brown).rect(13, 9, 1, 1, C.brown);
  add('decor_bench', 'decor', bench.outline());

  const pot = new G(16, 16);
  pot.rect(4, 9, 8, 6, C.coral).rect(3, 8, 10, 2, C.orange).line(5, 14, 10, 14, C.red);
  pot.ellipse(8, 6, 4, 3, C.green).pts([[6, 4], [10, 5], [8, 3]], C.pink).pts([[5, 6], [9, 6]], C.yellow).pts([[7, 4], [11, 6]], C.white);
  add('decor_flowerpot', 'decor', pot.outline());

  const bath = new G(16, 16);
  bath.rect(7, 9, 2, 5, C.lgray).rect(5, 13, 6, 2, C.gray).ellipse(8, 7, 7, 3, C.lgray).ellipse(8, 7, 5, 1.8, C.lblue).pts([[6, 6], [7, 6]], C.pblue);
  add('decor_birdbath', 'decor', bath.outline());

  const scare = new G(16, 16);
  scare.line(8, 5, 8, 15, C.brown).line(2, 8, 14, 8, C.brown).rect(5, 7, 6, 5, C.blue).line(5, 9, 10, 9, C.dblue);
  scare.ellipse(8, 4, 2.5, 2.5, C.pyellow).rect(4, 1, 8, 1, C.tan).rect(6, 0, 4, 1, C.tan).pts([[7, 4], [9, 4]], C.out).pts([[2, 9], [14, 9], [3, 7]], C.yellow);
  add('decor_scarecrow', 'decor', scare.outline());

  const gnome = new G(16, 16);
  gnome.rect(5, 9, 6, 6, C.blue).ellipse(8, 8, 3, 2, C.ltan).ellipse(8, 10, 3, 2.5, C.white).set(8, 8, C.ppink);
  for (let y = 0; y < 7; y++) gnome.rect(8 - Math.floor(y / 2), y, 1 + Math.floor(y / 2) * 2, 1, C.red);
  gnome.pts([[6, 14], [9, 14]], C.brown);
  add('decor_gnome', 'decor', gnome.outline());

  // ground-decor preview icons reuse the tile sprites (path_stone, path_wood)
}

/* ---------------------------------------------------- decoration suite */
{
  // fences: a post per tile; rails are drawn between neighbouring posts
  const post = new G(16, 16);
  post.rect(6, 3, 4, 12, C.tan).rect(6, 3, 4, 1, C.ltan).line(9, 4, 9, 14, C.brown).pts([[4, 7], [5, 7], [10, 7], [11, 7], [4, 11], [5, 11], [10, 11], [11, 11]], C.ltan);
  add('decor_fence', 'decor', post.outline());
  const railH = new G(16, 16);
  railH.rect(0, 6, 16, 2, C.ltan).line(0, 7, 15, 7, C.tan).rect(0, 10, 16, 2, C.ltan).line(0, 11, 15, 11, C.tan);
  railH.line(0, 5, 15, 5, C.out).line(0, 8, 15, 8, C.out).line(0, 9, 15, 9, C.out).line(0, 12, 15, 12, C.out);
  add('decor_fence_rail_h', 'decor', railH);
  const railV = new G(16, 16);
  railV.rect(7, 0, 2, 16, C.ltan).line(8, 0, 8, 15, C.tan).line(6, 0, 6, 15, C.out).line(9, 0, 9, 15, C.out);
  add('decor_fence_rail_v', 'decor', railV);
  const gate = new G(16, 16);
  gate.rect(1, 3, 3, 12, C.tan).rect(12, 3, 3, 12, C.tan).rect(1, 3, 3, 1, C.ltan).rect(12, 3, 3, 1, C.ltan);
  gate.rect(4, 6, 8, 2, C.vlgray).rect(4, 11, 8, 2, C.vlgray).line(4, 12, 11, 7, C.cream).pts([[6, 9], [9, 9]], C.vlgray);
  add('decor_fence_gate', 'decor', gate.outline());

  // hedges join up the same way
  const hedge = new G(16, 16);
  hedge.ellipse(8, 9, 7, 6, C.green1).ellipse(7, 8, 5.5, 4.5, C.green).pts([[5, 5], [8, 4], [10, 6], [4, 8]], C.lgreen).pts([[11, 12], [6, 13], [9, 13]], C.dgreen);
  add('decor_hedge', 'decor', hedge.outline());
  const hedgeH = new G(16, 16);
  hedgeH.rect(0, 4, 16, 10, C.green1).rect(0, 5, 16, 4, C.green).pts([[3, 5], [9, 6], [13, 5]], C.lgreen).pts([[4, 12], [11, 12]], C.dgreen).line(0, 3, 15, 3, C.out).line(0, 14, 15, 14, C.out);
  add('decor_hedge_h', 'decor', hedgeH);
  const hedgeV = new G(16, 16);
  hedgeV.rect(2, 0, 12, 16, C.green1).rect(3, 0, 8, 16, C.green).pts([[5, 3], [8, 9], [6, 13]], C.lgreen).line(1, 0, 1, 15, C.out).line(14, 0, 14, 15, C.out);
  add('decor_hedge_v', 'decor', hedgeV);

  const arch = new G(16, 32);
  arch.rect(1, 10, 2, 22, C.tan).rect(13, 10, 2, 22, C.tan);
  for (let a = 0; a <= 20; a++) { const t = Math.PI * a / 20; arch.set(8 - Math.cos(t) * 6.5, 10 - Math.sin(t) * 8, C.tan).set(8 - Math.cos(t) * 5.5, 10 - Math.sin(t) * 7, C.ltan); }
  arch.pts([[1, 14], [2, 18], [1, 23], [14, 12], [13, 17], [14, 25], [4, 4], [8, 2], [12, 4], [2, 8], [14, 8]], C.green).pts([[2, 15], [13, 13], [8, 2], [3, 6], [13, 20]], C.pink).pts([[1, 22], [14, 6]], C.yellow);
  add('decor_arch', 'decor', arch.outline());

  const rocks = new G(16, 16);
  rocks.ellipse(5, 11, 4, 3, C.gray).ellipse(4.5, 10.5, 2.8, 2, C.lgray).ellipse(11, 12, 3.5, 2.6, C.gray).ellipse(10.5, 11.5, 2.4, 1.6, C.vlgray).ellipse(9, 6, 2.5, 2, C.lgray);
  rocks.pts([[2, 14], [7, 7], [13, 8], [14, 14]], C.green).pts([[7, 6], [13, 7]], C.yellow).set(3, 7, C.lav);
  add('decor_rockgarden', 'decor', rocks.outline());

  const feeder = new G(16, 24);
  feeder.rect(7, 10, 2, 14, C.brown).rect(3, 6, 10, 5, C.tan).rect(4, 7, 8, 3, C.ltan).rect(5, 8, 6, 2, C.yellow).pts([[6, 8], [9, 9]], C.orange);
  for (let y = 0; y < 5; y++) feeder.rect(8 - y - 1, 1 + y, y * 2 + 2, 1, C.red);
  feeder.rect(2, 10, 12, 1, C.brown);
  add('decor_birdfeeder', 'decor', feeder.outline());

  const hive = new G(16, 16);
  hive.rect(2, 13, 12, 2, C.brown);
  for (let k = 0; k < 4; k++) hive.ellipse(8, 11 - k * 2.4, 6 - k * 1.1, 2, k % 2 ? C.yellow : C.orange);
  hive.ellipse(8, 3, 2, 1.2, C.orange).ellipse(8, 11, 1.4, 1.2, C.out).pts([[4, 9], [11, 6]], C.pyellow);
  add('decor_beehive', 'decor', hive.outline());

  const pond = [0, 1].map(f => {
    const g = new G(32, 32);
    g.ellipse(16, 17, 15.5, 13.5, C.gray).ellipse(16, 17, 14, 12, C.lgray).ellipse(16, 17, 12.5, 10.5, C.blue).ellipse(15, 15, 10, 8, C.lblue);
    for (let k = 0; k < 10; k++) { const t = k / 10 * Math.PI * 2; g.set(16 + Math.cos(t) * 14.5, 17 + Math.sin(t) * 12.5, k % 2 ? C.dgray : C.vlgray); }
    g.ellipse(10, 20, 3, 2, C.green).set(10, 20, C.blue).ellipse(21, 13, 2.5, 1.8, C.green).ellipse(19, 22, 2.2, 1.6, C.green1);
    g.pts([[21, 12], [22, 12]], C.pink).set(21, 11, C.ppink);
    const sp = f ? [[13, 12], [24, 18], [8, 15]] : [[17, 10], [12, 18], [22, 21]];
    g.pts(sp, C.pblue).pts(sp.map(([x, y]) => [x + 1, y]), C.white);
    return g.outline();
  });
  add('decor_pond', 'decor', pond, 2);

  const well = new G(16, 24);
  well.ellipse(8, 18, 7, 4.5, C.gray).rect(1, 14, 14, 6, C.gray).ellipse(8, 14, 7, 2.5, C.dgray).ellipse(8, 14, 5.5, 1.6, C.dblue);
  for (let x = 2; x < 15; x += 3) well.line(x, 15, x, 19, C.lgray);
  well.line(1, 17, 14, 17, C.lgray);
  well.rect(2, 4, 1, 11, C.brown).rect(13, 4, 1, 11, C.brown).line(3, 7, 12, 7, C.brown).line(8, 7, 8, 11, C.cream).rect(7, 11, 3, 2, C.tan);
  for (let y = 0; y < 4; y++) well.rect(7 - y * 2, y, 2 + y * 4, 1, C.red);
  well.rect(0, 4, 16, 1, C.dred);
  add('decor_well', 'decor', well.outline());

  // for the cats
  const bed = new G(16, 16);
  bed.ellipse(8, 11, 7.5, 4.5, C.pink).ellipse(8, 10.5, 5.5, 2.8, C.ppink).ellipse(8, 11, 4, 1.8, C.cream).pts([[2, 12], [14, 12], [5, 14], [11, 14]], C.red);
  add('decor_catbed', 'decor', bed.outline());
  const scratch = new G(16, 24);
  scratch.rect(2, 20, 12, 3, C.tan).rect(2, 20, 12, 1, C.ltan).rect(6, 5, 4, 15, C.ltan);
  for (let y = 6; y < 20; y += 2) scratch.line(6, y, 9, y + 1, C.tan);
  scratch.rect(3, 2, 10, 3, C.pink).rect(3, 2, 10, 1, C.ppink).line(11, 5, 11, 9, C.cream).ellipse(11, 10, 1.3, 1.3, C.red);
  add('decor_scratchpost', 'decor', scratch.outline());
  const ctree = new G(16, 32);
  ctree.rect(1, 28, 14, 3, C.tan).rect(6, 6, 4, 22, C.ltan);
  for (let y = 7; y < 28; y += 2) ctree.line(6, y, 9, y + 1, C.tan);
  ctree.rect(1, 18, 8, 3, C.pink).rect(1, 18, 8, 1, C.ppink).rect(8, 11, 7, 3, C.pink).rect(8, 11, 7, 1, C.ppink).ellipse(8, 4, 6, 3, C.pink).ellipse(8, 3.5, 4, 1.5, C.cream);
  ctree.line(3, 21, 3, 24, C.cream).ellipse(3, 25, 1.3, 1.3, C.yellow);
  add('decor_cattree', 'decor', ctree.outline());
  const bowls = new G(16, 16);
  bowls.ellipse(4.5, 11, 3.5, 2.2, C.blue).ellipse(4.5, 10, 2.5, 1.2, C.brown).pts([[3, 10], [5, 9]], C.tan);
  bowls.ellipse(11.5, 11, 3.5, 2.2, C.red).ellipse(11.5, 10, 2.5, 1.2, C.lblue).set(11, 10, C.white).line(2, 13, 6, 13, C.dblue).line(9, 13, 13, 13, C.dred);
  add('decor_catbowls', 'decor', bowls.outline());
  const cushion = new G(16, 16);
  cushion.rect(2, 6, 12, 8, C.yellow).rect(3, 6, 10, 2, C.pyellow).pts([[2, 6], [13, 6], [2, 13], [13, 13]], C.orange).ellipse(8, 10, 2, 2, C.orange).set(8, 10, C.pyellow);
  add('decor_cushion', 'decor', cushion.outline());
  const yarn = new G(16, 16);
  yarn.ellipse(8, 11, 4.2, 4, C.pink).line(5, 9, 11, 13, C.ppink).line(5, 12, 10, 8, C.ppink).line(7, 8, 11, 11, C.red).line(12, 13, 15, 14, C.pink).set(6, 9, C.ppink);
  add('decor_yarn', 'decor', yarn.outline());

  // lights
  const strl = [0, 1].map(f => {
    const g = new G(16, 24);
    g.rect(1, 3, 1, 21, C.brown).rect(14, 3, 1, 21, C.brown);
    const pts = []; for (let x = 1; x <= 14; x++) { const y = 4 + Math.round(Math.sin((x - 1) / 13 * Math.PI) * 4); g.set(x, y, C.dgray); if (x % 3 === 0) pts.push([x, y + 1]); }
    pts.forEach(([x, y], k) => g.set(x, y, (k + f) % 2 ? C.yellow : [C.pink, C.lblue, C.lgreen, C.orange][k % 4]).set(x, y + 1, f && k % 2 ? C.pyellow : C.dgray));
    return g;
  });
  add('decor_stringlights', 'decor', strl, 3);
  const fire = [0, 1, 2].map(f => {
    const g = new G(16, 16);
    g.line(3, 13, 12, 10, C.brown).line(3, 10, 12, 13, C.dbrown);
    const h = [7, 9, 8][f], sway = [0, 1, -1][f];
    for (let y = 0; y < h; y++) { const w = Math.max(1, Math.round(3.5 * (1 - y / h))); g.rect(8 - w + Math.round(sway * y / h), 11 - y, w * 2, 1, y < 2 ? C.orange : y < h - 3 ? C.yellow : C.pyellow); }
    g.set(8 + sway, 11 - h, C.coral);
    for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; g.ellipse(8 + Math.cos(t) * 6, 12 + Math.sin(t) * 2.6, 1.4, 1.1, k % 2 ? C.gray : C.lgray); }
    return g.outline();
  });
  add('decor_campfire', 'decor', fire, 6);

  // cozy bits
  const ham = new G(32, 16);
  ham.rect(2, 2, 2, 14, C.brown).rect(28, 2, 2, 14, C.brown);
  for (let x = 4; x <= 27; x++) { const y = 5 + Math.round(Math.sin((x - 4) / 23 * Math.PI) * 5); ham.rect(x, y, 1, 3, x % 4 < 2 ? C.cream : C.lav); }
  ham.line(4, 4, 7, 6, C.ltan).line(27, 4, 24, 6, C.ltan);
  add('decor_hammock', 'decor', ham.outline());
  const sign = new G(16, 16);
  sign.rect(7, 7, 2, 9, C.brown).rect(2, 2, 12, 6, C.ltan).rect(2, 2, 12, 1, C.cream).line(4, 4, 11, 4, C.brown).line(4, 6, 9, 6, C.brown).pts([[2, 7], [13, 7]], C.tan);
  add('decor_signpost', 'decor', sign.outline());
  const mbox = [0, 1].map(f => {
    const g = new G(16, 16);
    g.rect(7, 9, 2, 7, C.brown).ellipse(7, 5, 5, 2.5, C.blue).rect(2, 5, 10, 4, C.blue).rect(2, 8, 10, 1, C.dblue).ellipse(3, 6.5, 1, 2, C.dblue);
    if (f) g.rect(12, 1, 1, 6, C.dgray).rect(13, 1, 2, 2, C.red); else g.rect(12, 5, 1, 2, C.dgray).rect(12, 7, 3, 1, C.red);
    return g.outline();
  });
  add('decor_mailbox', 'decor', mbox);
  const barrow = new G(16, 16);
  barrow.ellipse(4, 12, 2.5, 2.5, C.dgray).set(4, 12, C.lgray).rect(4, 6, 9, 5, C.gray).rect(5, 6, 7, 1, C.lgray).line(12, 10, 15, 13, C.brown).rect(6, 5, 5, 1, C.brown).pts([[6, 4], [8, 4], [10, 4]], C.dbrown).line(10, 11, 11, 14, C.dgray);
  add('decor_wheelbarrow', 'decor', barrow.outline());
  const stand = new G(16, 16);
  stand.rect(2, 9, 12, 2, C.tan).rect(3, 11, 1, 4, C.brown).rect(12, 11, 1, 4, C.brown).rect(4, 4, 6, 5, C.lblue).rect(4, 4, 6, 1, C.pblue).line(10, 6, 13, 3, C.lblue).rect(5, 2, 4, 1, C.blue).ellipse(12, 8, 1.5, 1, C.gray);
  add('decor_canstand', 'decor', stand.outline());
  const pcrate = new G(16, 16);
  pcrate.rect(2, 7, 12, 8, C.tan).line(2, 10, 13, 10, C.brown).line(2, 14, 13, 14, C.brown).rect(2, 7, 12, 1, C.ltan);
  for (const [x, c] of [[4, C.red], [7, C.orange], [10, C.yellow], [12, C.green], [5, C.violet], [9, C.red]]) pcrate.ellipse(x, x % 2 ? 5 : 6, 1.6, 1.6, c);
  add('decor_producecrate', 'decor', pcrate.outline());

  // renewable resources
  const quarry = new G(16, 16);
  quarry.rect(1, 5, 14, 10, C.gray).rect(2, 5, 12, 2, C.lgray).line(3, 9, 7, 9, C.dgray).line(8, 12, 12, 12, C.dgray).line(10, 7, 10, 10, C.dgray).pts([[4, 6], [11, 6]], C.vlgray);
  quarry.line(12, 1, 15, 4, C.brown).pts([[11, 1], [12, 0], [13, 1]], C.lgray);
  add('decor_quarry', 'decor', quarry.outline());
  const meadow = new G(16, 16);
  for (const [x, h, c] of [[2, 8, C.green], [4, 11, C.lgreen], [6, 9, C.green1], [9, 12, C.lgreen], [11, 8, C.green], [13, 10, C.green1]]) meadow.line(x, 15, x + 1, 15 - h, c);
  meadow.pts([[5, 5], [10, 3], [12, 6]], C.yellow).pts([[3, 7], [8, 5]], C.lav).rect(7, 9, 2, 6, C.tan).rect(6, 8, 4, 2, C.ltan);
  add('decor_meadow', 'decor', meadow.outline());

  // floor decorations (drawn on top of grass)
  const steps = new G(16, 16);
  steps.ellipse(5, 5, 3, 2.2, C.lgray).ellipse(11, 9, 3, 2.2, C.lgray).ellipse(5, 13, 3, 2.2, C.lgray).pts([[4, 4], [10, 8], [4, 12]], C.vlgray).pts([[6, 6], [12, 10], [6, 14]], C.gray);
  add('decor_steppingstones', 'decor', steps.outline());
  for (const [name, a, b] of [['pink', C.pink, C.ppink], ['yellow', C.yellow, C.pyellow], ['blue', C.lblue, C.pblue], ['white', C.white, C.vlgray]]) {
    const fb = new G(16, 16);
    fb.rect(1, 2, 14, 12, C.brown).rect(2, 3, 12, 10, C.dbrown);
    for (const [x, y] of [[4, 5], [9, 4], [12, 8], [6, 10], [11, 12], [3, 12]]) { fb.pts([[x - 1, y + 1], [x + 1, y + 2]], C.green).pts([[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]], a).set(x, y, b === C.vlgray ? C.yellow : b); }
    add(`decor_flowerbed_${name}`, 'decor', fb.outline());
  }
  const picnic = new G(16, 16);
  picnic.rect(1, 2, 14, 12, C.white);
  for (let y = 2; y < 14; y++) for (let x = 1; x < 15; x++) if ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) picnic.set(x, y, C.red);
  picnic.rect(9, 7, 5, 4, C.tan).line(9, 7, 13, 7, C.ltan).line(10, 6, 12, 5, C.brown).set(11, 8, C.red).set(12, 8, C.yellow);
  add('decor_picnic', 'decor', picnic.outline());

  // big projects
  const gh = new G(48, 48);
  gh.rect(1, 16, 46, 31, C.vlgray);
  for (let y = 0; y < 15; y++) { const inset = Math.max(0, 15 - y) * 1.4; gh.rect(Math.round(inset * 0.6) + 1, y + 2, 46 - Math.round(inset * 1.2), 1, y % 5 === 0 ? C.vlgray : C.pblue); }
  for (let x = 2; x < 46; x += 6) { gh.line(x, 17, x, 46, C.white); }
  for (let x = 3; x < 46; x += 6) for (let y = 18; y < 46; y += 1) if (!((x + y) % 7)) gh.set(x + 2, y, C.lblue);
  gh.rect(1, 30, 46, 1, C.white);
  for (let x = 4; x < 44; x += 3) { gh.set(x, 44 - (x % 4), C.green).set(x + 1, 43 - (x % 5), C.lgreen); if (x % 9 === 1) gh.set(x, 40, C.red); }
  gh.rect(20, 34, 8, 13, C.lblue).line(24, 34, 24, 46, C.white).rect(20, 34, 8, 1, C.white);
  add('decor_greenhouse', 'decor', gh.outline());
  const shed = new G(32, 40);
  shed.rect(2, 14, 28, 25, C.tan);
  for (let x = 4; x < 30; x += 4) shed.line(x, 15, x, 38, C.brown);
  for (let y = 0; y < 12; y++) shed.rect(Math.max(0, 10 - y), y + 3, 32 - Math.max(0, 10 - y) * 2, 1, y % 3 === 2 ? C.dred : C.brown);
  shed.rect(11, 24, 10, 15, C.dbrown).line(16, 24, 16, 38, C.brown).set(19, 31, C.yellow).rect(23, 18, 5, 4, C.lblue).rect(23, 18, 5, 1, C.cream);
  shed.rect(0, 14, 32, 1, C.dbrown);
  add('decor_shed', 'decor', shed.outline());

  // cat houses (2x2). Walls use palette 3/4/5 and roof 17/18/19, so they share the cabin's colour sets.
  const ch = new G(32, 32);
  ch.rect(3, 15, 26, 16, C.tan);
  for (let y = 18; y < 31; y += 4) ch.line(3, y, 28, y, C.brown);
  ch.line(3, 15, 28, 15, C.ltan).rect(2, 30, 28, 2, C.gray).pts([[5, 31], [11, 31], [19, 31], [25, 31]], C.lgray);
  for (let y = 0; y < 14; y++) { const half = Math.min(15, 3 + y * 1.1); ch.rect(Math.round(16 - half), y + 2, Math.round(half * 2), 1, y % 3 === 2 ? C.dred : C.red); }
  for (let y = 5; y < 15; y += 3) for (let x = 8 + (y % 2) * 2; x < 25; x += 5) ch.set(x, y, C.coral);
  ch.rect(1, 15, 30, 1, C.dred);
  ch.rect(22, 19, 4, 4, C.lblue).set(22, 19, C.pblue).line(24, 19, 24, 22, C.cream);
  add('cathouse', 'decor', ch.outline(), 0, { swaps: ['roof', 'wall'] });
  const doors = [
    () => { const g = new G(12, 12); g.ellipse(6, 7, 5, 5, C.out).ellipse(6, 7, 4, 4, C.plum).rect(1, 7, 10, 5, C.plum).rect(0, 11, 12, 1, C.out); g.rect(2, 7, 1, 4, C.out).rect(9, 7, 1, 4, C.out); return g; },
    () => { const g = new G(12, 12); g.rect(1, 2, 10, 10, C.out).rect(2, 3, 8, 9, C.plum).rect(0, 1, 12, 1, C.cream).rect(0, 1, 1, 11, C.cream).rect(11, 1, 1, 11, C.cream); return g; },
    () => { const g = new G(12, 12); g.ellipse(4, 4, 3, 3, C.out).ellipse(8, 4, 3, 3, C.out); for (let y = 4; y < 12; y++) g.rect(Math.round(1 + (y - 4) * 0.6), y, Math.round(10 - (y - 4) * 1.2), 1, C.out); g.ellipse(4, 4.5, 2, 2, C.plum).ellipse(8, 4.5, 2, 2, C.plum).rect(3, 5, 6, 3, C.plum); return g; },
    () => { const g = new G(12, 12); g.ellipse(6, 7, 5, 5, C.out).ellipse(6, 7, 4, 4, C.plum).rect(1, 7, 10, 5, C.plum).rect(0, 11, 12, 1, C.out); g.pts([[1, 3], [0, 1], [2, 2], [11, 3], [12, 1], [10, 2]], C.out).pts([[4, 9], [7, 9]], C.yellow); return g; },
  ];
  doors.forEach((f, k) => add(`cathouse_door_${k}`, 'decor', f()));
  const flowers = new G(28, 5); flowers.rect(0, 3, 28, 2, C.brown); for (let x = 1; x < 28; x += 3) flowers.set(x, 2, C.green).set(x, 1, [C.pink, C.yellow, C.white, C.lav][x % 4]);
  add('cathouse_flowers', 'decor', flowers);
  const bow = new G(10, 6); bow.pts([[0, 0], [1, 1], [2, 2], [0, 4], [1, 3], [9, 0], [8, 1], [7, 2], [9, 4], [8, 3], [0, 1], [0, 2], [0, 3], [9, 1], [9, 2], [9, 3]], C.pink).rect(4, 1, 2, 3, C.red).pts([[3, 4], [2, 5], [6, 4], [7, 5]], C.pink);
  add('cathouse_bow', 'decor', bow.outline());
  const fish = new G(10, 7); fish.ellipse(4, 3.5, 3.5, 2.5, C.lblue).pts([[8, 1], [8, 5], [9, 0], [9, 6], [8, 3], [7, 3]], C.lblue).set(2, 3, C.out).set(3, 2, C.pblue);
  add('cathouse_fish', 'decor', fish.outline());
  const plate = new G(12, 5); plate.rect(0, 0, 12, 5, C.cream).rect(0, 0, 12, 1, C.white).line(2, 2, 9, 2, C.brown).set(5, 3, C.brown);
  add('cathouse_plate', 'decor', plate.outline());

  // dock: 3 tiles wide, 5 long, drawn flat on the water (you can walk on it)
  const dock = new G(48, 80);
  dock.rect(4, 0, 40, 80, C.tan);
  for (let y = 0; y < 80; y += 5) { dock.line(4, y, 43, y, C.brown); dock.line(4, y + 1, 43, y + 1, C.ltan); }
  for (let y = 2; y < 80; y += 10) dock.pts([[7, y], [24, y + 2], [40, y]], C.dbrown);
  for (let y = 12; y < 80; y += 16) { dock.rect(1, y, 4, 6, C.dbrown).rect(1, y, 4, 1, C.brown); dock.rect(43, y, 4, 6, C.dbrown).rect(43, y, 4, 1, C.brown); }
  dock.rect(3, 72, 6, 7, C.brown).rect(3, 72, 6, 2, C.tan).rect(39, 72, 6, 7, C.brown).rect(39, 72, 6, 2, C.tan);
  dock.line(9, 74, 14, 77, C.cream).line(14, 77, 18, 75, C.cream).ellipse(34, 64, 3, 2, C.cream).set(34, 64, C.tan);
  add('decor_dock', 'decor', dock.outline());

  // seashells (also used as their inventory icons)
  const shell = (draw) => { const g = new G(16, 16); draw(g); return g.outline(); };
  add('shell_scallop', 'items', shell(g => { for (let k = 0; k < 5; k++) { const a = Math.PI * (0.15 + k * 0.175); g.line(8, 13, 8 + Math.cos(a) * 6, 13 - Math.sin(a) * 7, k % 2 ? C.pink : C.ppink); } g.ellipse(8, 8, 5.5, 4.5, C.ppink); for (let k = 0; k < 5; k++) { const a = Math.PI * (0.15 + k * 0.175); g.line(8, 12, 8 + Math.cos(a) * 5, 12 - Math.sin(a) * 6, C.pink); } g.rect(6, 12, 5, 2, C.pink); }));
  add('shell_conch', 'items', shell(g => { g.ellipse(7, 9, 4.5, 3.5, C.cream).ellipse(11, 8, 3, 2.2, C.ltan); for (let k = 0; k < 3; k++) g.ellipse(4 - k, 9 - k * 0.3, 1.6 - k * 0.3, 1.4, C.ltan); g.ellipse(9, 10, 2.5, 1.2, C.ppink).line(5, 7, 10, 7, C.tan).line(4, 10, 8, 11, C.tan).set(13, 7, C.orange); }));
  add('shell_cowrie', 'items', shell(g => { g.ellipse(8, 9, 5, 3.6, C.tan).ellipse(8, 8.5, 4, 2.6, C.ltan).pts([[6, 7], [9, 7], [11, 9], [5, 9], [8, 10]], C.brown).line(5, 11, 11, 11, C.cream).pts([[6, 12], [8, 12], [10, 12]], C.white); }));
  add('shell_moonsnail', 'items', shell(g => { g.ellipse(8, 9, 5, 4.5, C.lav).ellipse(8.5, 8.5, 3.6, 3.2, C.white).ellipse(9, 8, 2.2, 2, C.lav).ellipse(9.3, 7.8, 1, 1, C.violet).line(4, 11, 7, 13, C.violet); }));
  add('shell_sanddollar', 'items', shell(g => { g.ellipse(8, 9, 5.5, 5, C.cream).ellipse(8, 9, 4.5, 4, C.vlgray); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; g.line(8 + Math.cos(a), 9 + Math.sin(a), 8 + Math.cos(a) * 3, 9 + Math.sin(a) * 3, C.tan); } g.set(8, 9, C.tan); }));

  // ambient critter
  const bird = [0, 1].map(f => {
    const g = new G(8, 8);
    const y = f ? 2 : 3;
    g.ellipse(4, y + 2, 2.5, 2, C.brown).set(5, y + 2, C.orange).set(5, y + 3, C.orange).set(6, y, C.brown).set(6, y + 1, C.brown).set(7, y + 1, C.yellow).set(6, y, C.out).set(1, y + 1, C.dbrown);
    if (!f) g.pts([[3, 7], [5, 7]], C.dgray);
    return g;
  });
  add('fx_bird', 'fx', bird, 4);

  // cabin add-ons
  const brick = new G(8, 10);
  brick.rect(1, 0, 6, 10, C.red).rect(0, 0, 8, 2, C.coral);
  for (let y = 3; y < 10; y += 2) brick.line(1, y, 6, y, C.dred);
  brick.pts([[3, 2], [5, 4], [3, 6], [5, 8]], C.dred);
  add('cabin_chimney_brick', 'cabin', brick);
  const tin = new G(8, 10);
  tin.rect(2, 2, 4, 8, C.lgray).line(5, 2, 5, 9, C.gray).rect(1, 0, 6, 2, C.gray).rect(0, 1, 8, 1, C.dgray).set(3, 4, C.vlgray);
  add('cabin_chimney_tin', 'cabin', tin);
  const curt = new G(10, 10);
  curt.rect(0, 0, 10, 2, C.pink).rect(0, 0, 10, 1, C.ppink).rect(0, 2, 2, 8, C.pink).rect(8, 2, 2, 8, C.pink).line(1, 2, 1, 9, C.ppink).line(8, 2, 8, 9, C.ppink).pts([[2, 2], [7, 2]], C.pink);
  add('cabin_curtains', 'cabin', curt);
  const swing = new G(14, 14);
  swing.line(1, 0, 1, 8, C.cream).line(12, 0, 12, 8, C.cream).rect(0, 8, 14, 3, C.tan).rect(0, 8, 14, 1, C.ltan).rect(2, 6, 10, 2, C.pink).set(3, 6, C.ppink).rect(1, 11, 1, 2, C.brown).rect(12, 11, 1, 2, C.brown);
  add('cabin_swing', 'cabin', swing.outline());
  const mat = new G(12, 5);
  mat.rect(0, 0, 12, 5, C.tan).rect(1, 1, 10, 3, C.ltan).pts([[3, 2], [5, 2], [7, 2], [9, 2]], C.red);
  add('cabin_mat', 'cabin', mat.outline());
  const porch = new G(52, 14);
  porch.rect(0, 1, 52, 12, C.ltan);
  for (let y = 3; y < 13; y += 3) porch.line(0, y, 51, y, C.tan);
  for (let x = 6; x < 52; x += 11) porch.line(x, 1, x, 12, C.tan);
  porch.rect(0, 12, 52, 2, C.brown).rect(0, 0, 2, 13, C.brown).rect(50, 0, 2, 13, C.brown);
  add('cabin_porch', 'cabin', porch.outline());
}

/* ----------------------------------------------------------- the players */
// Colour slots (swapped per profile): hair 2/3, skin 5/4, shirt 14/13, pants 28, shoes 1
function person(style, dir, frame, work) {
  const g = new G(16, 24);
  const step = work ? 0 : [0, 1, 0, -1][frame];
  const bob = !work && (frame === 1 || frame === 3) ? 1 : 0;
  const yo = -bob; // whole body lifts a pixel mid-step
  // legs + shoes
  if (dir === 'side') {
    g.rect(6 + step, 18 + yo, 2, 5, C.dgray).rect(8 - step, 18 + yo, 2, 5, C.dgray);
    g.rect(6 + step, 22 + yo + bob, 3, 1, C.plum).rect(8 - step, 22 + yo + bob, 3, 1, C.plum);
  } else {
    const l = step > 0 ? 1 : 0, r = step < 0 ? 1 : 0;
    g.rect(5, 18 + yo, 6, 2, C.dgray);
    g.rect(5, 20 + yo, 2, 3 - l, C.dgray).rect(9, 20 + yo, 2, 3 - r, C.dgray);
    g.rect(5, 22 + yo - l + bob, 2, 1, C.plum).rect(9, 22 + yo - r + bob, 2, 1, C.plum);
  }
  // long hair behind body
  if (style === 'long' && dir !== 'down') g.rect(dir === 'side' ? 3 : 3, 6 + yo, dir === 'side' ? 7 : 10, 9, C.dbrown);
  if (style === 'long' && dir === 'down') { g.rect(3, 6 + yo, 2, 8, C.dbrown); g.rect(11, 6 + yo, 2, 8, C.dbrown); }
  // torso
  if (dir === 'side') { g.rect(5, 11 + yo, 6, 7, C.blue).line(10, 12 + yo, 10, 17 + yo, C.dblue); }
  else { g.rect(4, 11 + yo, 8, 7, C.blue).line(11, 12 + yo, 11, 17 + yo, C.dblue).line(4, 17 + yo, 11, 17 + yo, C.dblue); }
  // arms
  if (work) {
    const up = frame === 0;
    if (dir === 'side') {
      if (up) { g.rect(8, 8 + yo, 2, 4, C.blue).rect(8, 6 + yo, 2, 2, C.ltan); g.line(9, 5, 13, 1, C.gray).rect(12, 0, 3, 2, C.lgray); }
      else { g.rect(9, 12 + yo, 3, 2, C.blue).rect(12, 13 + yo, 2, 2, C.ltan); g.line(13, 14, 15, 20, C.gray).rect(14, 20, 2, 2, C.lgray); }
    } else {
      const ay = up ? 7 : 13;
      g.rect(2, ay + yo, 2, up ? 5 : 4, C.blue).rect(12, ay + yo, 2, up ? 5 : 4, C.blue);
      g.rect(2, (up ? 6 : 17) + yo, 2, 1, C.ltan).rect(12, (up ? 6 : 17) + yo, 2, 1, C.ltan);
      if (dir === 'down') { if (up) g.line(13, 5, 13, 0, C.gray).rect(12, 0, 3, 1, C.lgray); else g.line(13, 18, 13, 22, C.gray).rect(12, 22, 3, 1, C.lgray); }
    }
  } else if (dir === 'side') {
    g.rect(7 + step, 12 + yo, 2, 5, C.blue).rect(7 + step, 17 + yo, 2, 1, C.ltan);
  } else {
    g.rect(3, 12 + yo + (step > 0 ? 1 : 0), 1, 5, C.blue).rect(12, 12 + yo + (step < 0 ? 1 : 0), 1, 5, C.blue);
    g.set(3, 17 + yo + (step > 0 ? 1 : 0), C.ltan).set(12, 17 + yo + (step < 0 ? 1 : 0), C.ltan);
  }
  // head
  g.ellipse(8, 7 + yo, 4.6, 4.4, C.ltan);
  g.set(dir === 'side' ? 11 : 11, 9 + yo, C.tan);
  // face
  if (dir === 'down') {
    g.pts([[6, 7 + yo], [10, 7 + yo]], C.out).pts([[5, 9 + yo], [11, 9 + yo]], C.ppink).set(8, 9 + yo, C.tan);
  } else if (dir === 'side') {
    g.set(10, 7 + yo, C.out).set(12, 8 + yo, C.ltan).set(10, 9 + yo, C.ppink);
  }
  // hair
  const H = C.dbrown, Hh = C.brown;
  if (dir === 'up') {
    g.ellipse(8, 6.5 + yo, 4.8, 4.6, H).line(6, 4 + yo, 9, 3 + yo, Hh);
    if (style === 'long') g.rect(4, 8 + yo, 8, 6, H).line(8, 6 + yo, 8, 13 + yo, Hh);
  } else if (dir === 'side') {
    g.ellipse(7, 5 + yo, 4.8, 3, H).rect(3, 5 + yo, 4, 5, H).line(5, 3 + yo, 9, 3 + yo, Hh);
    if (style === 'short') g.set(11, 5 + yo, H).set(12, 6 + yo, H); else g.set(11, 5 + yo, H);
  } else {
    g.ellipse(8, 4.5 + yo, 4.8, 2.6, H).line(5, 3 + yo, 8, 2 + yo, Hh);
    if (style === 'short') g.pts([[4, 6 + yo], [12, 6 + yo], [9, 5 + yo], [10, 5 + yo]], H);
    else g.pts([[4, 6 + yo], [4, 7 + yo], [12, 6 + yo], [12, 7 + yo], [7, 5 + yo]], H);
  }
  if (style === 'long') { const fx = dir === 'side' ? 5 : 12; g.pts([[fx, 3 + yo], [fx - 1, 4 + yo], [fx + 1, 4 + yo], [fx, 5 + yo]], C.green).set(fx, 4 + yo, C.yellow); }
  if (style === 'short') { // little beanie
    g.rect(4, 1 + yo, 9, 2, C.green).line(4, 3 + yo, 12, 3 + yo, C.green1).set(8, 0 + yo, C.lgreen);
  }
  return g.outline();
}
for (const [set, style] of [['p1', 'short'], ['p2', 'long']]) {
  for (const dir of ['down', 'up', 'side']) {
    add(`${set}_walk_${dir}`, 'player', [0, 1, 2, 3].map(f => person(style, dir, f, false)), 8, { swaps: ['player'] });
    add(`${set}_work_${dir}`, 'player', [0, 1].map(f => person(style, dir, f, true)), 5, { swaps: ['player'] });
  }
}

/* ------------------------------------------------------------------ cats */
// Colour slots (swapped per cat): coat 20, shade 19, marking 3, belly 6, eyes 11
const K = { coat: C.orange, shade: C.coral, mark: C.brown, belly: C.cream, eye: C.lgreen, nose: C.pink };
function catSide(frame, mode) {
  const g = new G(16, 16);
  const legs = mode === 'walk' ? [[3, 1], [5, -1], [9, -1], [11, 1]].map(([x, d]) => [x + (frame % 2 ? d : 0) * (frame === 1 ? 1 : -1), 0]) : [[3, 0], [5, 0], [9, 0], [11, 0]];
  const headY = mode === 'work' ? 9 : 7, headX = mode === 'work' ? 12 : 12;
  // tail
  const tailTip = mode === 'walk' ? [[1, 4 + (frame % 2)]] : [[1, 5]];
  g.line(3, 9, 1, 6, K.coat).set(tailTip[0][0], tailTip[0][1], K.mark).set(1, 5, K.mark);
  // legs
  for (const [x] of legs) g.rect(x, 12, 1, 2, K.coat).set(x, 14, K.belly);
  if (mode === 'work') { const up = frame === 0; g.rect(11, up ? 11 : 12, 1, up ? 2 : 3, K.coat).set(12, up ? 11 : 14, K.belly); }
  // body
  g.ellipse(7, 10, 5.5, 3, K.coat).line(4, 12, 10, 12, K.shade).pts([[9, 11], [10, 11], [8, 12], [9, 12]], K.belly);
  g.pts([[5, 7], [5, 8], [7, 7], [7, 8], [9, 7], [9, 8]], K.mark);
  // head
  g.ellipse(headX, headY, 3.2, 2.8, K.coat);
  g.pts([[headX - 2, headY - 3], [headX - 2, headY - 4], [headX - 1, headY - 3], [headX + 1, headY - 3], [headX + 2, headY - 4], [headX + 2, headY - 3]], K.coat).set(headX - 2, headY - 3, K.nose);
  g.set(headX + 1, headY, K.eye).set(headX + 3, headY + 1, K.nose).pts([[headX + 2, headY + 1], [headX + 1, headY + 2], [headX + 2, headY + 2]], K.belly);
  return g.outline();
}
function catFront(frame, back) {
  const g = new G(16, 16);
  const s = frame % 2 ? (frame === 1 ? 1 : -1) : 0;
  // tail
  if (back) g.line(8, 9, 8 + s, 3, K.coat).set(8 + s, 3, K.mark); else g.line(12, 13, 14, 9 + Math.abs(s), K.coat).set(14, 9 + Math.abs(s), K.mark);
  g.ellipse(8, 11, 4.5, 3.5, K.coat).line(5, 13, 11, 13, K.shade);
  g.rect(5, 13 + (s > 0 ? -1 : 0), 2, 2, K.coat).rect(9, 13 + (s < 0 ? -1 : 0), 2, 2, K.coat);
  g.set(5, 14 + (s > 0 ? -1 : 0), K.belly).set(10, 14 + (s < 0 ? -1 : 0), K.belly);
  if (!back) g.ellipse(8, 11, 2, 2.2, K.belly);
  g.ellipse(8, 6, 4, 3.4, K.coat);
  g.pts([[4, 3], [4, 2], [5, 3], [11, 3], [11, 2], [10, 3]], K.coat);
  if (back) { g.pts([[7, 4], [9, 4], [6, 9], [8, 9], [10, 9]], K.mark); }
  else {
    g.set(4, 3, K.nose).set(11, 3, K.nose);
    g.pts([[6, 6], [9, 6]], K.eye).pts([[7, 8], [8, 8]], K.belly).set(7, 7, K.nose).set(8, 7, K.nose);
    g.pts([[7, 3], [8, 3]], K.mark);
  }
  return g.outline();
}
function catSit(frame) {
  const g = new G(16, 16);
  g.line(11, 14, 13, 13, K.coat).line(13, 13, 13, 11 - frame, K.coat).set(13, 11 - frame, K.mark);
  g.ellipse(8, 11, 4, 4, K.coat).line(5, 14, 11, 14, K.shade).ellipse(9, 11, 1.8, 2.5, K.belly);
  g.pts([[6, 9], [6, 11], [6, 13]], K.mark);
  g.ellipse(9, 5, 3.4, 3, K.coat).pts([[6, 2], [6, 1], [7, 2], [11, 2], [12, 1], [12, 2]], K.coat).set(6, 2, K.nose).set(12, 2, K.nose);
  g.pts([[8, 5], [11, 5]], frame === 2 ? K.out : K.eye).set(10, 6, K.nose).pts([[9, 7], [10, 7]], K.belly);
  g.pts([[8, 15], [10, 15]], K.belly);
  return g.outline();
}
function catSleep(frame) {
  const g = new G(16, 16);
  const ry = frame ? 3.9 : 3.4;
  g.ellipse(8, 11.5, 6.5, ry, K.coat).line(3, 14, 13, 14, K.shade);
  g.pts([[5, 9], [7, 9], [9, 9]], K.mark);
  g.ellipse(12, 11, 2.8, 2.4, K.coat).pts([[11, 8], [13, 8], [14, 9]], K.coat).set(13, 8, K.nose);
  g.line(12, 11, 13, 11, K.out);
  g.line(2, 13, 6, 14, K.mark).line(6, 14, 10, 14, K.coat);
  return g.outline();
}
add('cat_walk_side', 'cats', [0, 1, 2, 3].map(f => catSide(f, 'walk')), 8, { swaps: ['cat'] });
add('cat_walk_down', 'cats', [0, 1, 2, 3].map(f => catFront(f, false)), 8, { swaps: ['cat'] });
add('cat_walk_up', 'cats', [0, 1, 2, 3].map(f => catFront(f, true)), 8, { swaps: ['cat'] });
add('cat_sit', 'cats', [0, 1, 0, 2].map(f => catSit(f)), 2, { swaps: ['cat'] });
add('cat_sleep', 'cats', [0, 1].map(f => catSleep(f)), 1, { swaps: ['cat'] });
add('cat_work', 'cats', [0, 1].map(f => catSide(f, 'work')), 6, { swaps: ['cat'] });

/* ------------------------------------------------------------------ crops */
const CROPS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crops.json'), 'utf8')).crops;
const col = (n) => (typeof n === 'number' ? n : C[n]);

function sprout(g, leaf) {
  g.pts([[7, 15], [8, 15], [9, 15]], C.dbrown);
  g.line(8, 14, 8, 12, leaf).pts([[7, 11], [6, 11], [6, 10]], leaf).pts([[9, 11], [10, 10], [10, 11]], leaf);
}
function rosette(g, cx, cy, r, leaf, dark) {
  for (let a = 0; a < 6; a++) { const t = a / 6 * Math.PI * 2; g.ellipse(cx + Math.cos(t) * r * 0.55, cy + Math.sin(t) * r * 0.4, r * 0.55, r * 0.4, a % 2 ? leaf : dark); }
}
function fronds(g, n, h, leaf, dark) {
  for (let i = 0; i < n; i++) { const x = 8 + (i - (n - 1) / 2) * 2; g.line(8, 14, x + (i - (n - 1) / 2), 14 - h + Math.abs(i - (n - 1) / 2), i % 2 ? leaf : dark); g.set(x + (i - (n - 1) / 2) - 1, 14 - h + 1 + Math.abs(i - (n - 1) / 2), leaf); }
}
function drawCrop(c, stage) {
  const g = new G(16, 16);
  const leaf = col(c.leaf), dark = col(c.leafDark), fruit = col(c.fruit), fdark = col(c.fruitDark), fhi = col(c.fruitHi);
  const glow = c.rarity === 'mystical';
  if (stage === 0) { sprout(g, leaf); return g.outline(); }
  const a = c.archetype;
  if (a === 'root') {
    if (stage === 1) fronds(g, 3, 5, leaf, dark);
    if (stage === 2) fronds(g, 5, 8, leaf, dark);
    if (stage === 3) {
      fronds(g, 5, 9, leaf, dark);
      if (c.fruitShape === 'long') { g.ellipse(8, 13.5, 3, 2.2, fruit).set(7, 13, fhi).line(6, 14, 10, 14, fdark); }
      else { g.ellipse(8, 13, 3.5, 2.6, fruit).set(7, 12, fhi).set(9, 14, fdark); }
    }
  } else if (a === 'leafy') {
    if (stage === 1) rosette(g, 8, 12, 4, leaf, dark);
    if (stage === 2) rosette(g, 8, 11, 6, leaf, dark);
    if (stage === 3) {
      rosette(g, 8, 11, 7, leaf, dark);
      if (c.fruitShape === 'rainbow') { for (const [x, cc] of [[5, C.red], [7, C.yellow], [9, C.pink], [11, C.orange]]) g.line(x, 14, x, 6, cc); g.ellipse(8, 7, 5, 2.5, fruit); }
      else { g.ellipse(8, 10, 4.5, 3.6, fruit).ellipse(7, 9, 2.5, 2, fhi).line(8, 8, 8, 12, fdark); }
    }
  } else if (a === 'stalk') {
    const xs = stage === 1 ? [8] : [5, 8, 11];
    const h = stage === 1 ? 7 : stage === 2 ? 11 : 13;
    for (const x of xs) { g.line(x, 15, x, 15 - h, dark); g.line(x, 15 - h / 2, x - 2, 13 - h / 2, leaf).line(x, 14 - h / 3, x + 2, 12 - h / 3, leaf); }
    if (stage === 3) for (const x of xs) {
      if (c.fruitShape === 'wheat') { g.rect(x - 1, 1, 2, 5, fruit).pts([[x - 1, 1], [x, 2], [x - 1, 4]], fhi).set(x, 0, fdark); }
      else { g.ellipse(x + 1, 6, 1.4, 3, fruit).set(x + 1, 4, fhi).line(x + 2, 8, x + 2, 9, leaf); }
    }
  } else if (a === 'bush') {
    const r = stage === 1 ? 3.5 : stage === 2 ? 5.5 : 6.5;
    g.line(8, 15, 8, 13, C.dbrown).ellipse(8, 14 - r, r, r * 0.95, dark).ellipse(7, 13.5 - r, r * 0.75, r * 0.7, leaf);
    if (stage === 2) g.pts([[5, 7], [10, 6], [8, 9], [11, 10]], col(c.flower ?? 'white')).pts([[5, 7], [10, 6]], C.yellow);
    if (stage === 3) {
      const spots = [[5, 6], [10, 5], [8, 9], [11, 10], [4, 10], [7, 4]];
      for (const [x, y] of spots) {
        if (c.fruitShape === 'small') g.pts([[x, y], [x + 1, y]], fruit).set(x, y, fhi);
        else if (c.fruitShape === 'long') { g.rect(x, y, 1, 3, fruit).set(x, y, fhi).set(x, y - 1, leaf); }
        else g.ellipse(x + 0.5, y + 0.5, 1.6, 1.6, fruit).set(x, y, fhi);
      }
    }
  } else if (a === 'vine') {
    g.line(2, 13, 14, 12, dark).line(4, 12, 3, 9, leaf).line(12, 12, 13, 9, leaf);
    g.ellipse(5, 11, 2, 1.5, leaf).ellipse(11, 10, 2, 1.5, leaf);
    if (stage >= 2) { g.ellipse(2, 9, 2, 1.5, leaf).ellipse(14, 8, 2, 1.5, dark).line(8, 12, 7, 7, leaf).ellipse(7, 7, 2, 1.5, leaf); g.pts([[9, 9], [8, 8]], col(c.flower ?? 'yellow')); }
    if (stage === 3) {
      if (c.fruitShape === 'star') { for (const [x, y] of [[6, 11], [11, 8]]) g.pts([[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1], [x - 2, y], [x + 2, y], [x, y - 2], [x, y + 2]], fruit).set(x, y, fhi); }
      else { g.ellipse(8, 11.5, 5, 3.8, fruit).ellipse(6.5, 10.5, 2, 1.4, fhi).line(8, 8, 8, 15, fdark).line(5, 9, 5, 14, fdark).line(11, 9, 11, 14, fdark).set(8, 7, C.dbrown); }
    }
  } else if (a === 'flower') {
    const h = stage === 1 ? 6 : stage === 2 ? 10 : 11;
    g.line(8, 15, 8, 15 - h, dark).ellipse(6, 13 - h / 3, 2, 1, leaf).ellipse(10, 14 - h / 2, 2, 1, leaf);
    if (stage === 2) g.ellipse(8, 15 - h, 1.6, 2, fdark).set(8, 14 - h, fruit);
    if (stage === 3) { const cy = 4; for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; g.ellipse(8 + Math.cos(t) * 3, cy + Math.sin(t) * 3, 1.5, 1.5, k % 2 ? fruit : fhi); } g.ellipse(8, cy, 1.8, 1.8, col(c.flower ?? 'brown')); }
  } else if (a === 'crystal') {
    g.line(5, 14, 4, 11, leaf).line(11, 14, 12, 11, leaf).ellipse(4, 11, 1.5, 1, leaf).ellipse(12, 11, 1.5, 1, leaf);
    const shards = stage === 1 ? [[8, 4]] : stage === 2 ? [[8, 7], [6, 4]] : [[8, 10], [5, 6], [11, 7]];
    for (const [x, hh] of shards) { for (let y = 0; y < hh; y++) { const w = y < 2 ? 1 : 2; g.rect(x - (w > 1 ? 1 : 0), 14 - hh + y, w, 1, y % 3 === 0 ? fhi : fruit); } g.set(x, 14 - hh, C.white); }
    if (stage === 3) g.line(7, 14, 7, 6, fdark);
  }
  g.outline();
  if (glow && stage >= 2) g.pts([[2, 3], [13, 2], [14, 12], [1, 10]], C.white);
  return g;
}
function drawItem(c) {
  const g = new G(16, 16);
  const leaf = col(c.leaf), fruit = col(c.fruit), fdark = col(c.fruitDark), fhi = col(c.fruitHi);
  switch (c.item) {
    case 'carrot': for (let y = 0; y < 9; y++) { const w = Math.max(1, Math.round(4 - y * 0.45)); g.rect(8 - w, 5 + y, w * 2, 1, y % 3 === 1 ? fdark : fruit); } g.set(6, 6, fhi); g.line(8, 5, 6, 1, leaf).line(8, 5, 8, 1, leaf).line(8, 5, 10, 1, col(c.leafDark)); break;
    case 'round': g.ellipse(8, 10, 4.5, 4, fruit).ellipse(7, 9, 1.5, 1.2, fhi).line(8, 14, 8, 15, fdark).line(8, 6, 6, 1, leaf).line(8, 6, 10, 2, leaf).line(8, 6, 8, 1, col(c.leafDark)); break;
    case 'potato': g.ellipse(8, 9, 6, 4.5, fruit).ellipse(6, 7.5, 2, 1.2, fhi).pts([[5, 10], [9, 8], [11, 11], [7, 12]], fdark); break;
    case 'head': g.ellipse(8, 9, 6, 5.5, fruit).ellipse(7, 8, 3.5, 3, fhi).line(8, 4, 8, 13, fdark).line(4, 9, 6, 12, fdark).line(12, 9, 10, 12, fdark); break;
    case 'chard': for (const [x, cc] of [[5, C.red], [7, C.yellow], [9, C.pink], [11, C.orange]]) g.line(x, 15, x + (x - 8) / 2, 7, cc); g.ellipse(8, 5, 6, 4, fruit).ellipse(6, 4, 2, 1.5, fhi); break;
    case 'cob': g.ellipse(8, 8, 3, 6.5, fruit); for (let y = 3; y < 14; y += 2) g.set(7, y, fhi).set(9, y + 1, fdark); g.line(4, 14, 7, 5, leaf).line(12, 14, 9, 5, leaf); break;
    case 'wheat': for (const x of [5, 8, 11]) { g.line(x, 15, 8, 9, col(c.leafDark)); g.rect(x - 1, 2 + Math.abs(x - 8) / 2, 2, 6, fruit).set(x - 1, 3, fhi); } g.rect(5, 10, 7, 2, C.brown); break;
    case 'tomato': g.ellipse(8, 9.5, 5.5, 5, fruit).ellipse(6, 8, 2, 1.5, fhi).pts([[8, 4], [6, 4], [10, 4], [7, 5], [9, 5], [8, 3]], leaf); break;
    case 'berry': for (let y = 0; y < 8; y++) { const w = Math.max(1, Math.round(5 - Math.abs(y - 2.5) * (y > 2 ? 1 : 0.4))); g.rect(8 - w, 5 + y, w * 2, 1, fruit); } g.pts([[6, 7], [9, 8], [7, 10], [10, 6], [8, 12]], C.pyellow).pts([[6, 4], [8, 3], [10, 4], [7, 4], [9, 4]], leaf); break;
    case 'cluster': for (const [x, y] of [[6, 10], [10, 10], [8, 6], [5, 6], [11, 6]]) g.ellipse(x, y, 2.6, 2.6, fruit).set(x - 1, y - 1, fhi).set(x, y, fdark); break;
    case 'bell': g.ellipse(8, 10, 5.5, 4.5, fruit).rect(4, 6, 8, 4, fruit).ellipse(6, 8, 1.5, 2, fhi).line(8, 7, 8, 14, fdark).rect(7, 3, 2, 3, leaf); break;
    case 'long': for (let y = 0; y < 11; y++) { const w = y < 2 ? 2 : y > 8 ? 2 : 3; g.rect(8 - w + (y > 5 ? 1 : 0), 4 + y, w * 2, 1, fruit); } g.set(7, 6, fhi).set(7, 7, fhi).rect(6, 2, 5, 2, leaf).set(8, 1, leaf); break;
    case 'chili': for (let y = 0; y < 11; y++) g.rect(6 + Math.round(y * 0.4), 4 + y, y > 8 ? 1 : 2, 1, fruit); g.set(6, 5, fhi).rect(5, 2, 3, 2, leaf); g.pts([[11, 4], [12, 6], [4, 9]], C.yellow); break;
    case 'dragon': g.ellipse(8, 9, 5, 6, fruit).ellipse(6, 7, 1.5, 2, fhi).pts([[3, 6], [13, 7], [4, 12], [12, 12], [8, 2], [5, 3], [11, 3]], leaf); break;
    case 'pumpkin': g.ellipse(8, 10, 7, 5, fruit).ellipse(5, 9, 2, 1.5, fhi).line(8, 6, 8, 14, fdark).line(4, 7, 4, 13, fdark).line(12, 7, 12, 13, fdark).rect(7, 3, 2, 3, C.dbrown).line(9, 4, 11, 3, leaf); break;
    case 'melon': g.ellipse(8, 9, 7, 5.5, fruit).ellipse(5, 7, 2, 1.5, fhi); for (const x of [3, 6, 9, 12]) g.line(x, 5, x + 1, 13, fdark); break;
    case 'star': g.pts([[8, 2], [8, 3], [7, 4], [8, 4], [9, 4]], fruit).rect(2, 5, 13, 3, fruit).rect(4, 8, 9, 2, fruit).rect(4, 10, 3, 2, fruit).rect(10, 10, 3, 2, fruit).rect(3, 12, 2, 2, fruit).rect(12, 12, 2, 2, fruit).pts([[7, 6], [6, 7]], fhi).set(8, 8, fdark); break;
    case 'bloom': for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; g.ellipse(8 + Math.cos(t) * 4, 8 + Math.sin(t) * 4, 2.2, 2.2, k % 2 ? fruit : fhi); } g.ellipse(8, 8, 2.5, 2.5, col(c.flower ?? 'brown')); break;
    case 'crystal': for (const [x, h, w] of [[8, 12, 2], [5, 8, 1], [11, 9, 1]]) { for (let y = 0; y < h; y++) g.rect(x - (y < 2 ? 0 : w - 1), 14 - h + y, y < 2 ? 1 : w * 2 - 1 + 1, 1, y % 3 ? fruit : fhi); } g.pts([[8, 2], [5, 6], [11, 5]], C.white); break;
    default: g.ellipse(8, 9, 5, 5, fruit);
  }
  return g.outline();
}
const RARITY_COL = { common: C.gray, uncommon: C.green, rare: C.blue, legendary: C.orange, mystical: C.violet, mystery: C.pink };
function packet(band, inner) {
  const g = new G(16, 16);
  g.rect(3, 2, 10, 13, C.cream).rect(3, 2, 10, 3, band).line(3, 5, 12, 5, C.ltan);
  g.pts([[4, 2], [6, 2], [8, 2], [10, 2], [12, 2]], C.white);
  if (inner) g.stamp(inner, 0, 0);
  return g.outline();
}
for (const c of CROPS) {
  add(`crop_${c.id}`, 'crops', [0, 1, 2, 3].map(s => drawCrop(c, s)), 0, { crop: c.id });
  add(`item_${c.id}`, 'items', drawItem(c), 0, { crop: c.id });
  const mini = new G(16, 16); mini.ellipse(8, 10, 2.6, 2.4, col(c.fruit)).set(7, 9, col(c.fruitHi)).line(8, 8, 9, 6, col(c.leaf));
  add(`seed_${c.id}`, 'items', packet(RARITY_COL[c.rarity], mini), 0, { crop: c.id });
}
for (const [r, band] of Object.entries(RARITY_COL)) {
  const q = new G(16, 16);
  q.pts([[7, 7], [8, 7], [9, 7], [10, 8], [10, 9], [9, 10], [8, 10], [8, 11], [8, 13]], band);
  add(`seedpack_${r}`, 'items', packet(band, q));
}

/* ------------------------------------------------------------ fruit trees */
// Each fruit tree is a puffy, cloud-like canopy on one of 5 shared trunk styles.
//   ftree_<id>:   5 frames: sapling (with its stem), then canopy only for stages 2-5
//   ftrunk_<shape>_<n>: 5 trunk styles per canopy shape (frame 0 is empty: the sapling has its own stem)
//   ffruit_<id>:  4 overlay frames (blossom -> tiny fruit -> swelling -> ripe)
//   fruit_<id>, sapling_<id>: the harvested fruit and the sapling you buy.
const TREES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'trees.json'), 'utf8')).trees;
const CANOPY = { round: { cy: 18, rx: 13, ry: 12 }, upright: { cy: 17, rx: 10, ry: 15 }, spreading: { cy: 21, rx: 15.5, ry: 10 }, soft: { cy: 18, rx: 13, ry: 11.5 } };
const STAGE_SCALE = [0, 0.38, 0.58, 0.8, 1];
// Puff layouts per canopy shape: [x, y, radius] relative to the canopy size, drawn back to front.
const PUFFS = {
  round:     [[0, 0.05, 0.62], [-0.5, 0.25, 0.48], [0.5, 0.25, 0.48], [0, -0.48, 0.5], [-0.45, -0.25, 0.44], [0.45, -0.25, 0.44], [0, 0.5, 0.45], [-0.62, 0.5, 0.34], [0.62, 0.5, 0.34]],
  upright:   [[0, 0.1, 0.55], [0, -0.45, 0.48], [-0.5, 0.35, 0.48], [0.5, 0.35, 0.48], [0, -0.82, 0.36], [-0.45, -0.15, 0.42], [0.45, -0.15, 0.42], [0, 0.62, 0.45]],
  spreading: [[0, 0, 0.62], [-0.55, 0.15, 0.55], [0.55, 0.15, 0.55], [-0.3, -0.45, 0.5], [0.3, -0.45, 0.5], [-0.8, 0.35, 0.38], [0.8, 0.35, 0.38], [0, 0.5, 0.5]],
  soft:      [[0, 0.05, 0.62], [-0.52, 0.2, 0.52], [0.52, 0.2, 0.52], [-0.25, -0.45, 0.48], [0.28, -0.42, 0.46], [0, 0.5, 0.48], [-0.7, -0.05, 0.36], [0.7, -0.05, 0.36]],
};
function canopyOf(shape, s) {
  const c = CANOPY[shape] || CANOPY.round, k = STAGE_SCALE[s];
  return { cx: 16, cy: 47 - (47 - c.cy) * (0.45 + 0.55 * k) - (s === 4 ? 0 : 1), rx: c.rx * k, ry: c.ry * k };
}
function fruitTree(t, s) {
  const g = new G(32, 48), r = rng(t.id.length * 31 + s);
  const leaf = col(t.leaf), dark = col(t.leafDark), hi = col(t.leafHi);
  if (s === 0) {
    g.line(16, 47, 16, 38, C.brown).pts([[15, 46], [17, 46], [14, 47], [18, 47]], C.dbrown);
    g.ellipse(14, 39, 2, 1.2, leaf).ellipse(18, 37, 2, 1.2, leaf).ellipse(16, 36, 1.4, 1.4, hi);
    return g.outline();
  }
  const cp = canopyOf(t.shape, s), layout = PUFFS[t.shape] || PUFFS.round;
  const puffs = (s === 1 ? layout.slice(0, 3) : s === 2 ? layout.slice(0, 5) : layout).map(([ox, oy, pr]) => [cp.cx + ox * cp.rx, cp.cy + oy * cp.ry, pr * Math.min(cp.rx, cp.ry) * (s === 1 ? 1.25 : 1)]);
  for (const [x, y, pr] of puffs) g.ellipse(x, y, pr + 0.6, pr * 0.92 + 0.6, dark);
  for (const [x, y, pr] of puffs) g.ellipse(x - pr * 0.18, y - pr * 0.2, pr * 0.84, pr * 0.78, leaf);
  for (const [x, y, pr] of puffs) g.ellipse(x - pr * 0.38, y - pr * 0.45, pr * 0.36, pr * 0.24, hi);
  for (let k = 0, n = Math.round(3 + s * 2); k < n; k++) { const [x, y, pr] = puffs[Math.floor(r() * puffs.length)]; g.set(x + (r() - 0.3) * pr, y + (r() * 0.6 + 0.2) * pr, dark); }
  return g.outline();
}
// Trunks: 0 straight, 1 leaning, 2 forked, 3 knotty, 4 gnarled. They run up under the canopy, which hides the top.
const TRUNK_STYLES = 5;
function trunk(shape, v, s) {
  const g = new G(32, 48);
  if (s === 0) return g;
  const cp = canopyOf(shape, s), top = Math.round(cp.cy), tw = [0, 1, 2, 3, 4][s], span = 47 - top;
  const bark = v === 3 ? C.dbrown : C.brown, light = v === 3 ? C.brown : C.tan;
  const xAt = y => {
    const f = (47 - y) / span; // 0 at the ground, 1 at the canopy
    if (v === 1) return Math.round(f * (s >= 3 ? 3 : 2));
    if (v === 4) return Math.round(Math.sin(f * Math.PI) * (s >= 3 ? 1.6 : 1));
    return 0;
  };
  const forkY = 47 - Math.round(span * 0.38); // low enough that the Y shows under the canopy
  for (let y = top; y <= 47; y++) {
    if (v === 2 && y < forkY && s >= 2) continue; // the fork's branches are drawn below
    let w = Math.max(1, tw);
    if (v === 4 && y >= 44) w += 47 - y >= 2 ? 1 : 2; // flared base
    const x0 = 16 - Math.floor(w / 2) + xAt(y);
    g.rect(x0, y, w, 1, bark);
    if (w > 1) g.set(x0, y, light);
  }
  if (v === 2 && s >= 2) { // a Y: two branches from the fork up into the canopy
    const bw = Math.max(1, tw - 1), spread = 3 + s * 1.5;
    for (const dir of [-1, 1]) for (let y = top; y < forkY; y++) {
      const f = (forkY - y) / (forkY - top), x0 = 16 - Math.floor(bw / 2) + Math.round(dir * f * spread);
      g.rect(x0, y, bw, 1, bark); if (bw > 1 && dir < 0) g.set(x0, y, light);
    }
  }
  if (v === 3 && s >= 2) { const ky = top + Math.round(span * 0.6); g.rect(16 - Math.floor(tw / 2), ky, Math.max(1, tw), 2, C.plum); if (tw > 2) g.set(16, ky, C.out); g.set(16 + Math.ceil(tw / 2), ky + 3, C.brown); }
  if (s >= 3) { // roots
    const rs = v === 4 ? 3 : v === 3 ? 2 : 1;
    for (let k = 1; k <= rs; k++) { g.set(16 - Math.floor(tw / 2) - k + xAt(47), 47, bark); g.set(16 + Math.ceil(tw / 2) - 1 + k + xAt(47), 47, bark); }
  }
  return g.outline();
}
// fruit positions: only on leaves, a little away from the canopy edge
function fruitSpots(t) {
  const cp = canopyOf(t.shape, 4), r = rng(t.id.length * 7 + 3), out = [], tree = fruitTree(t, 4);
  const leafy = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = tree.get(x + dx, y + dy); if (v === -1 || v === C.out) return false; } return true; };
  for (let tries = 0; out.length < 9 && tries < 600; tries++) {
    const a = r() * Math.PI * 2, d = 0.15 + Math.sqrt(r()) * 0.75;
    const x = Math.round(cp.cx + Math.cos(a) * cp.rx * d), y = Math.round(cp.cy + Math.sin(a) * cp.ry * d * 0.95 + 1);
    if (leafy(x, y) && out.every(([px, py]) => Math.abs(px - x) + Math.abs(py - y) > 4)) out.push([x, y]);
  }
  return out;
}
function fruitOverlay(t, f) {
  const g = new G(32, 48), spots = fruitSpots(t);
  const fc = col(t.fruitColor), fd = col(t.fruitDark), fh = col(t.fruitHi), bl = col(t.blossom);
  for (const [x, y] of spots) {
    if (f === 0) g.pts([[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]], bl).set(x, y, C.yellow);
    if (f === 1) g.set(x, y, C.pgreen).set(x, y + 1, fd);
    if (f === 2) g.rect(x, y, 2, 2, C.lgreen).set(x + 1, y + 1, fc).set(x, y + 1, fd);
    if (f === 3) {
      if (t.item === 'cherry') g.set(x, y - 1, C.green1).line(x, y - 1, x - 1, y, C.green1).line(x, y - 1, x + 2, y, C.green1).rect(x - 2, y, 2, 2, fc).rect(x + 1, y + 1, 2, 2, fc).set(x - 2, y, fh).set(x + 1, y + 1, fh);
      else if (t.item === 'pear' || t.item === 'lemon' || t.item === 'fig') g.rect(x - 1, y - 1, 2, 2, fc).rect(x - 1, y + 1, 3, 2, fc).set(x - 1, y, fh).set(x + 1, y + 2, fd).set(x, y - 2, C.brown);
      else g.ellipse(x + 0.5, y + 0.5, 1.7, 1.7, fc).set(x, y, fh).set(x + 1, y + 1, fd).set(x, y - 2, C.brown);
    }
  }
  return g;
}
function fruitItem(t) {
  const g = new G(16, 16), fc = col(t.fruitColor), fd = col(t.fruitDark), fh = col(t.fruitHi);
  switch (t.item) {
    case 'apple': g.ellipse(8, 9.5, 5.5, 5, fc).ellipse(6, 8, 1.8, 1.5, fh).set(8, 5, fd).line(8, 5, 8, 2, C.brown).ellipse(10.5, 3.5, 2, 1, C.green); break;
    case 'pear': g.ellipse(8, 11, 5, 4.5, fc).ellipse(8, 6.5, 2.8, 3, fc).ellipse(6.5, 9, 1.5, 2, fh).line(8, 3, 8, 1, C.brown).ellipse(10, 2.5, 1.6, 0.9, C.green); break;
    case 'cherry': g.line(6, 10, 8, 3, C.green1).line(11, 10, 8, 3, C.green1).ellipse(5.5, 11.5, 3, 3, fc).ellipse(11, 11.5, 3, 3, fc).set(4, 10, fh).set(10, 10, fh).ellipse(9.5, 2.5, 2, 1, C.green); break;
    case 'peach': g.ellipse(8, 9, 5.5, 5.5, fc).ellipse(10, 10, 3, 3, fd).ellipse(6.5, 7.5, 2, 1.6, fh).line(8, 4, 7, 11, fd).ellipse(6, 3.5, 2, 1, C.green); break;
    case 'plum': g.ellipse(8, 9, 4.5, 5.5, fc).ellipse(6.5, 7.5, 1.4, 2, fh).line(9, 4, 9, 13, fd).line(8, 4, 9, 2, C.brown); break;
    case 'orange': g.ellipse(8, 9, 5.5, 5.5, fc).pts([[6, 7], [9, 8], [7, 11], [10, 11], [5, 10]], fd).ellipse(6, 7, 1.5, 1.2, fh).ellipse(9.5, 3.5, 2, 1, C.green1).set(8, 4, C.dgreen); break;
    case 'lemon': g.ellipse(8, 9, 6, 4.5, fc).pts([[2, 9], [14, 9], [1, 9], [15, 9]], fc).ellipse(6, 7.5, 2, 1.2, fh).set(13, 10, fd).ellipse(9, 4, 2, 1, C.green); break;
    case 'fig': g.ellipse(8, 10.5, 5, 4.5, fc).ellipse(8, 6, 2.5, 2.5, fc).rect(7, 2, 2, 3, C.green1).ellipse(6.5, 9, 1.5, 2, fh).set(9, 13, fd).set(10, 12, fd); break;
  }
  return g.outline();
}
function saplingItem(t) {
  const g = new G(16, 16);
  g.ellipse(8, 12.5, 4.5, 2.6, C.tan).ellipse(8, 12, 3.5, 1.6, C.ltan).line(5, 11, 11, 13, C.brown);
  g.line(8, 11, 8, 4, C.brown).ellipse(6, 5, 2.4, 1.4, col(t.leaf)).ellipse(10.5, 3.5, 2.4, 1.4, col(t.leaf)).ellipse(8.5, 2, 1.4, 1.2, col(t.leafHi));
  g.rect(11, 8, 3, 3, col(t.fruitColor)).set(11, 8, col(t.fruitHi)).line(10, 9, 9, 9, C.cream);
  return g.outline();
}
for (const shape of Object.keys(CANOPY)) for (let v = 0; v < TRUNK_STYLES; v++) add(`ftrunk_${shape}_${v}`, 'trees', [0, 1, 2, 3, 4].map(s => trunk(shape, v, s)), 0, { ax: 16, ay: 47 });
for (const t of TREES) {
  add(`ftree_${t.id}`, 'trees', [0, 1, 2, 3, 4].map(s => fruitTree(t, s)), 0, { ax: 16, ay: 47 });
  add(`ffruit_${t.id}`, 'trees', [0, 1, 2, 3].map(f => fruitOverlay(t, f)), 0, { ax: 16, ay: 47 });
  add(`fruit_${t.id}`, 'items', fruitItem(t));
  add(`sapling_${t.id}`, 'items', saplingItem(t));
}

/* ------------------------------------------------------------------ fish */
// fish_<id>: 16x16 icon, facing right. fx_bobber: the float (2 frames: resting, dipping). icon_bang: the big "!".
const FISH = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fish.json'), 'utf8')).fish;
function fishIcon(f) {
  const g = new G(16, 16), b = col(f.body), be = col(f.belly), fi = col(f.fin), k = f.size || 1;
  const rx = 4.6 * k + 0.4, ry = 2.6 * k + 0.3, cx = 8.5 - (1 - k) * 1.5, cy = 8;
  // tail
  const tx0 = Math.round(cx - rx);
  g.rect(tx0, cy - 1, 1, 3, fi).rect(tx0 - 1, cy - 2, 1, 5, fi).rect(tx0 - 2, cy - 3, 1, 2, fi).rect(tx0 - 2, cy + 2, 1, 2, fi).set(tx0 - 3, cy - 3, fi).set(tx0 - 3, cy + 3, fi);
  // body + belly
  g.ellipse(cx, cy, rx, ry, b).ellipse(cx + 0.5, cy + ry * 0.45, rx * 0.8, ry * 0.45, be);
  // fins
  g.pts([[Math.round(cx) - 1, Math.round(cy - ry) - 1], [Math.round(cx), Math.round(cy - ry) - 1], [Math.round(cx) - 2, Math.round(cy - ry)]], fi);
  g.pts([[Math.round(cx), Math.round(cy + ry) + 1], [Math.round(cx) - 1, Math.round(cy + ry)]], fi);
  // patterns
  const L = Math.round(cx - rx + 2), R = Math.round(cx + rx - 3);
  if (f.pattern === 'stripes') for (let x = L + 1; x <= R - 1; x += 2) g.line(x, Math.round(cy - ry) + 1, x, Math.round(cy), col(f.fin));
  if (f.pattern === 'spots') g.pts([[L + 1, cy - 1], [L + 3, cy], [L + 5, cy - 1], [L + 2, cy + 1]], fi);
  if (f.pattern === 'scales') for (let x = L; x <= R; x += 2) g.set(x, cy - 1, col(f.fin)).set(x + 1, cy, col(f.fin));
  if (f.pattern === 'whiskers') g.line(Math.round(cx + rx), cy + 1, Math.round(cx + rx) + 2, cy + 3, C.out).line(Math.round(cx + rx), cy, Math.round(cx + rx) + 2, cy - 1, C.out);
  if (f.pattern === 'rainbow') g.line(L, cy, R + 1, cy, C.pink).line(L, cy - 1, R, cy - 1, C.yellow);
  if (f.pattern === 'scutes') for (let x = L; x <= R; x += 2) g.set(x, Math.round(cy - ry) + 1, C.vlgray);
  if (f.pattern === 'koi') g.pts([[L + 1, cy - 1], [L + 2, cy - 1], [L + 4, cy], [L + 5, cy - 1]], C.white).pts([[L + 3, cy - 2], [R - 1, cy]], C.red);
  if (f.pattern === 'stars') g.pts([[L + 1, cy - 1], [L + 4, cy], [R - 1, cy - 1]], C.pyellow);
  // eye + mouth
  const ex = Math.round(cx + rx * 0.55), ey = Math.round(cy - ry * 0.25);
  g.set(ex, ey, C.white).set(ex + 1, ey, C.out).set(Math.round(cx + rx), cy + 1, C.dgray);
  g.outline();
  if (f.pattern === 'glow' || f.pattern === 'stars') g.pts([[2, 2], [13, 3], [14, 12], [3, 13]], C.white);
  return g;
}
for (const f of FISH) add(`fish_${f.id}`, 'items', fishIcon(f), 0, { fish: f.id });
{
  const bob = [0, 1].map(fr => { const g = new G(8, 8); const y = fr ? 3 : 1; g.ellipse(4, y + 2, 2.2, 2.2, C.red).rect(2, y + 2, 5, 2, C.white).set(3, y + 1, C.coral).line(4, y - 1, 4, y, C.dgray); if (!fr) g.pts([[1, 7], [6, 7]], C.pblue); return g.outline(); });
  add('fx_bobber', 'fx', bob);
  const bang = new G(8, 12); bang.rect(3, 0, 3, 7, C.yellow).rect(3, 0, 3, 1, C.pyellow).rect(3, 9, 3, 3, C.yellow);
  add('icon_bang', 'ui', bang.outline());
}

/* ------------------------------------------------------- items + ui icons */
{
  const wood = new G(16, 16);
  wood.rect(2, 8, 12, 4, C.tan).ellipse(3, 10, 1.8, 2.2, C.ltan).set(3, 10, C.brown).rect(4, 4, 10, 4, C.brown).ellipse(4, 6, 1.8, 2.2, C.ltan).set(4, 6, C.tan).line(6, 9, 13, 9, C.ltan);
  add('item_wood', 'items', wood.outline());
  const stone = new G(16, 16);
  stone.ellipse(6, 10, 4, 3.5, C.gray).ellipse(5, 9, 2, 1.5, C.lgray).ellipse(11, 9, 3.5, 3, C.lgray).set(10, 8, C.vlgray).set(12, 11, C.gray);
  add('item_stone', 'items', stone.outline());
  const fiber = new G(16, 16);
  for (const x of [5, 7, 9, 11]) fiber.line(x, 14, 8 + (x - 8) * 1.4, 2, x % 4 === 1 ? C.green : C.lgreen);
  fiber.rect(5, 9, 7, 2, C.tan);
  add('item_fiber', 'items', fiber.outline());
  const coin = new G(16, 16);
  coin.ellipse(8, 8, 5.5, 5.5, C.yellow).ellipse(8, 8, 3.5, 3.5, C.orange).ellipse(8, 8, 2.5, 2.5, C.yellow).pts([[5, 5], [6, 4]], C.pyellow);
  add('item_coin', 'items', coin.outline());

  const hand = new G(16, 16);
  hand.rect(5, 6, 7, 7, C.ltan).rect(5, 3, 2, 4, C.ltan).rect(7, 2, 2, 5, C.ltan).rect(9, 3, 2, 4, C.ltan).rect(3, 7, 2, 3, C.ltan).line(11, 7, 11, 12, C.tan);
  add('tool_hand', 'ui', hand.outline());
  const axe = new G(16, 16);
  axe.line(4, 14, 11, 3, C.brown).line(5, 14, 12, 3, C.tan).rect(9, 2, 5, 5, C.lgray).rect(12, 2, 2, 5, C.vlgray).set(9, 6, C.gray);
  add('tool_axe', 'ui', axe.outline());
  const hoe = new G(16, 16);
  hoe.line(3, 14, 11, 4, C.brown).line(4, 14, 12, 4, C.tan).rect(10, 2, 5, 2, C.lgray).rect(13, 4, 2, 3, C.lgray);
  add('tool_hoe', 'ui', hoe.outline());
  const bag = new G(16, 16);
  bag.ellipse(8, 10, 5.5, 4.5, C.ltan).rect(6, 4, 4, 3, C.ltan).line(5, 6, 11, 6, C.red).pts([[6, 10], [9, 9], [8, 12], [10, 11]], C.brown);
  add('tool_seeds', 'ui', bag.outline());
  const can = new G(16, 16);
  can.rect(3, 6, 8, 8, C.lblue).rect(3, 6, 8, 2, C.pblue).line(11, 9, 14, 5, C.lblue).rect(13, 4, 2, 2, C.blue).line(4, 4, 9, 4, C.blue).pts([[3, 5], [10, 5]], C.blue);
  add('tool_can', 'ui', can.outline());

  const heart = new G(8, 8);
  heart.pts([[1, 1], [2, 1], [5, 1], [6, 1]], C.pink).rect(0, 2, 8, 2, C.pink).rect(1, 4, 6, 1, C.pink).rect(2, 5, 4, 1, C.pink).rect(3, 6, 2, 1, C.pink).set(1, 2, C.ppink);
  add('icon_heart', 'ui', heart);
  const zzz = new G(8, 8);
  zzz.line(3, 0, 6, 0, C.pblue).line(6, 0, 3, 3, C.pblue).line(3, 3, 6, 3, C.pblue).line(0, 4, 2, 4, C.white).line(2, 4, 0, 6, C.white).line(0, 6, 2, 6, C.white);
  add('icon_zzz', 'ui', zzz);
  const mark = new G(8, 8);
  mark.line(1, 0, 1, 7, C.brown).rect(2, 0, 5, 3, C.yellow).set(2, 1, C.pyellow);
  add('icon_mark', 'ui', mark.outline());
  const drop = new G(8, 8);
  drop.set(3, 0, C.lblue).rect(2, 1, 3, 2, C.lblue).ellipse(3.5, 5, 2.5, 2.5, C.lblue).set(2, 4, C.pblue);
  add('icon_drop', 'ui', drop.outline());
  const q = new G(8, 8);
  q.rect(2, 0, 4, 1, C.white).pts([[1, 1], [6, 1], [6, 2], [5, 3], [4, 4], [4, 5], [4, 7]], C.white);
  add('icon_question', 'ui', q);
  const exc = new G(8, 8);
  exc.rect(3, 0, 2, 5, C.yellow).rect(3, 6, 2, 2, C.yellow);
  add('icon_exclaim', 'ui', exc.outline());
  const note = new G(8, 8);
  note.rect(4, 0, 1, 6, C.white).rect(5, 0, 2, 1, C.white).ellipse(3, 6, 1.6, 1.3, C.white);
  add('icon_note', 'ui', note);
}

/* ---------------------------------------------------------------- effects */
{
  const sparkle = [0, 1, 2, 3].map(f => {
    const g = new G(8, 8), r = [1, 2, 3, 1][f];
    g.line(4 - r, 4, 4 + r, 4, C.pyellow).line(4, 4 - r, 4, 4 + r, C.pyellow).set(4, 4, C.white);
    if (f === 2) g.pts([[2, 2], [6, 2], [2, 6], [6, 6]], C.yellow);
    return g;
  });
  add('fx_sparkle', 'fx', sparkle, 10);
  const poof = [0, 1, 2, 3].map(f => {
    const g = new G(16, 16), r = 2 + f * 1.5;
    for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; g.ellipse(8 + Math.cos(t) * r, 8 + Math.sin(t) * r, 3 - f * 0.5, 3 - f * 0.5, f > 1 ? C.vlgray : C.white); }
    return g;
  });
  add('fx_poof', 'fx', poof, 10);
  const leafp = new G(4, 4); leafp.pts([[0, 1], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]], C.lgreen);
  add('fx_leaf', 'fx', leafp);
  const dirt = new G(4, 4); dirt.pts([[1, 1], [2, 1], [1, 2], [2, 2]], C.brown);
  add('fx_dirt', 'fx', dirt);
  const bf = (a, b) => [0, 1].map(f => {
    const g = new G(8, 8);
    if (f === 0) { g.ellipse(2, 2.5, 2, 2, a).ellipse(6, 2.5, 2, 2, a).ellipse(2.5, 5.5, 1.5, 1.5, b).ellipse(5.5, 5.5, 1.5, 1.5, b); }
    else { g.ellipse(2.5, 3, 1.3, 2, a).ellipse(5.5, 3, 1.3, 2, a).set(3, 5, b).set(5, 5, b); }
    g.line(4, 2, 4, 6, C.out).set(3, 1, C.out).set(5, 1, C.out);
    return g;
  });
  add('fx_butterfly_a', 'fx', bf(C.pink, C.ppink), 8);
  add('fx_butterfly_b', 'fx', bf(C.yellow, C.pyellow), 8);
  add('fx_butterfly_c', 'fx', bf(C.lblue, C.pblue), 8);
}

/* ------------------------------------------------------- cabin interior */
const clearRect = (g, x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g.in(i, j)) g.p[j * g.w + i] = -1; return g; };
{
  // floors (16x16, two variants each so big rooms don't look tiled)
  const planks = (base, dark, hi, seed) => {
    const r = rng(seed), g = new G(16, 16).fill(base);
    for (let b = 0; b < 4; b++) {
      const y = b * 4;
      g.line(0, y + 3, 15, y + 3, dark);
      const sx = Math.floor(r() * 16); g.line(sx, y, sx, y + 2, dark);
      for (let k = 0; k < 2; k++) g.set(Math.floor(r() * 16), y + 1 + Math.floor(r() * 2), r() < 0.5 ? hi : dark);
      g.line(0, y, 15, y, null);
      if (r() < 0.6) g.set((sx + 4 + Math.floor(r() * 6)) % 16, y, hi);
    }
    return g;
  };
  const floors = {
    oak: s => planks(C.tan, C.brown, C.ltan, s),
    birch: s => planks(C.ltan, C.tan, C.cream, s),
    walnut: s => planks(C.brown, C.dbrown, C.tan, s),
    checker: () => { const g = new G(16, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) g.set(x, y, ((x >> 3) + (y >> 3)) % 2 ? C.pblue : C.cream); return g; },
    stone: s => { const r = rng(s), g = new G(16, 16).fill(C.dgray); const st = [[0, 0, 9, 7], [10, 0, 6, 5], [0, 8, 6, 8], [7, 8, 9, 4], [10, 6, 6, 1], [7, 13, 9, 3]]; for (const [x, y, w, h] of st) { g.rect(x, y, w - 1, h - 1, r() < 0.5 ? C.gray : C.lgray); g.set(x + 1, y + 1, C.vlgray); } return g; },
    rose: () => { const g = new G(16, 16).fill(C.pink); for (const [x, y] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) g.pts([[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]], C.ppink).set(x, y, C.white); return g; },
    sage: () => { const g = new G(16, 16).fill(C.green); for (const [x, y] of [[4, 4], [12, 12]]) g.pts([[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]], C.lgreen); g.pts([[12, 4], [4, 12]], C.pgreen); return g; },
  };
  for (const [id, f] of Object.entries(floors)) for (let v = 0; v < 2; v++) add(`in_floor_${id}_${v}`, 'interior', f(400 + v * 17 + id.length * 3));

  // wall faces (16x32): trim, pattern, chair rail, wainscot, baseboard
  const wall = (id) => {
    const g = new G(16, 32);
    const body = { cream: C.cream, log: C.tan, sage: C.pgreen, rose: C.ppink, sky: C.pblue, butter: C.pyellow }[id];
    g.rect(0, 0, 16, 32, body);
    if (id === 'cream') g.pts([[3, 6], [11, 9], [6, 14], [13, 3]], C.ltan);
    if (id === 'log') for (let y = 2; y < 27; y += 5) { g.line(0, y, 15, y, C.ltan).line(0, y + 4, 15, y + 4, C.brown); g.set((y * 7) % 16, y + 2, C.brown); }
    if (id === 'sage') for (let x = 2; x < 16; x += 8) g.rect(x, 2, 2, 16, C.lgreen);
    if (id === 'sky') for (let x = 0; x < 16; x += 6) g.rect(x, 2, 3, 16, C.lblue);
    if (id === 'butter') for (let x = 1; x < 16; x += 6) g.rect(x, 2, 2, 16, C.yellow);
    if (id === 'rose') for (const [x, y] of [[4, 5], [12, 10], [5, 14]]) g.pts([[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]], C.pink).set(x, y, C.yellow);
    if (id !== 'log') { g.rect(0, 18, 16, 1, C.white).rect(0, 19, 16, 8, C.ltan); g.line(4, 20, 4, 26, C.tan).line(12, 20, 12, 26, C.tan); }
    g.rect(0, 0, 16, 2, C.dbrown).line(0, 2, 15, 2, C.brown);
    g.rect(0, 27, 16, 4, C.brown).line(0, 27, 15, 27, C.tan).line(0, 31, 15, 31, C.dbrown);
    return g;
  };
  for (const id of ['cream', 'log', 'sage', 'rose', 'sky', 'butter']) add(`in_wall_${id}`, 'interior', wall(id));

  const mat = new G(16, 16);
  mat.rect(2, 3, 12, 10, C.red).rect(3, 4, 10, 8, C.coral).rect(5, 6, 6, 4, C.orange).pts([[6, 7], [9, 8]], C.yellow);
  add('in_exit', 'interior', mat.outline());

  // rugs
  const rr = new G(32, 32);
  rr.ellipse(16, 16, 15, 13, C.dred).ellipse(16, 16, 13, 11, C.red).ellipse(16, 16, 10, 8, C.orange).ellipse(16, 16, 7, 5.5, C.yellow).ellipse(16, 16, 4, 3, C.red);
  add('in_rug_round', 'interior', rr.outline());
  const rl = new G(48, 32);
  rl.rect(2, 3, 44, 26, C.dblue).rect(4, 5, 40, 22, C.blue).rect(7, 8, 34, 16, C.lblue);
  for (let k = 0; k < 4; k++) { const cx = 12 + k * 8; rl.pts([[cx, 13], [cx - 1, 14], [cx + 1, 14], [cx - 2, 15], [cx + 2, 15], [cx - 1, 16], [cx + 1, 16], [cx, 17]], C.pblue).set(cx, 15, C.white); }
  for (let y = 4; y < 29; y += 2) rl.set(1, y, C.cream).set(0, y, C.cream).set(46, y, C.cream).set(47, y, C.cream);
  add('in_rug_long', 'interior', rl);
  const rc = new G(32, 32);
  rc.ellipse(16, 18, 14, 11, C.orange);
  for (let k = 0; k < 6; k++) { rc.line(4 + k, 12 - k, 4 + k, 12, C.orange); rc.line(27 - k, 12 - k, 27 - k, 12, C.orange); }
  rc.pts([[6, 9], [7, 10], [25, 9], [24, 10]], C.ppink);
  rc.ellipse(11, 16, 2, 2.5, C.out).ellipse(21, 16, 2, 2.5, C.out).pts([[11, 15], [21, 15]], C.white).pts([[15, 20], [16, 20], [17, 20], [16, 21]], C.pink);
  rc.line(3, 20, 10, 21, C.cream).line(3, 23, 10, 22, C.cream).line(22, 21, 29, 20, C.cream).line(22, 22, 29, 23, C.cream);
  add('in_rug_cat', 'interior', rc.outline());

  // living room
  const chair = (w, c1, c2, c3) => { const g = new G(w, 24); g.rect(2, 4, w - 4, 10, c1).rect(3, 5, w - 6, 3, c2).rect(1, 10, 3, 10, c3).rect(w - 4, 10, 3, 10, c3).rect(3, 13, w - 6, 6, c1).line(3, 13, w - 4, 13, c2).rect(2, 20, 2, 3, C.dbrown).rect(w - 4, 20, 2, 3, C.dbrown); if (w > 16) g.line(w / 2, 5, w / 2, 12, c3); return g.outline(); };
  add('in_armchair', 'interior', chair(16, C.coral, C.orange, C.red));
  add('in_sofa', 'interior', chair(32, C.green, C.lgreen, C.green1));
  const ct = new G(32, 16);
  ct.rect(1, 4, 30, 5, C.tan).line(1, 4, 30, 4, C.ltan).rect(1, 9, 30, 2, C.brown).rect(3, 11, 2, 4, C.brown).rect(27, 11, 2, 4, C.brown);
  ct.rect(6, 5, 3, 3, C.white).set(9, 6, C.white).rect(18, 5, 7, 2, C.violet).line(18, 5, 24, 5, C.lav);
  add('in_coffee_table', 'interior', ct.outline());
  const bs = new G(16, 32), br = rng(77);
  bs.rect(1, 2, 14, 29, C.brown).rect(3, 4, 10, 25, C.dbrown);
  for (const sy of [11, 19, 27]) { bs.rect(3, sy, 10, 2, C.tan); let x = 3; while (x < 12) { const w = 1 + Math.floor(br() * 2), h = 4 + Math.floor(br() * 3); bs.rect(x, sy - h, w, h, [C.red, C.blue, C.green, C.yellow, C.violet, C.orange][Math.floor(br() * 6)]); x += w + (br() < 0.2 ? 1 : 0); } }
  bs.rect(1, 2, 14, 1, C.tan);
  add('in_bookshelf', 'interior', bs.outline());
  const fl = new G(16, 32);
  fl.rect(7, 11, 2, 18, C.dgray).ellipse(8, 29.5, 4.5, 1.6, C.dgray);
  for (let y = 2; y < 11; y++) { const hw = 3 + Math.floor((y - 2) / 3); fl.rect(8 - hw, y, hw * 2, 1, y < 4 ? C.pyellow : C.yellow); }
  fl.line(3, 10, 12, 10, C.orange);
  add('in_floor_lamp', 'interior', fl.outline());
  const fire = [0, 1].map(f => {
    const g = new G(32, 32);
    g.rect(1, 6, 30, 26, C.gray);
    for (let y = 7; y < 31; y += 4) for (let x = (y % 8 ? 1 : 4); x < 31; x += 6) g.rect(x, y, 5, 3, (x + y) % 3 ? C.lgray : C.vlgray);
    g.rect(0, 4, 32, 3, C.brown).line(0, 4, 31, 4, C.tan);
    g.rect(8, 15, 16, 17, C.out); for (let k = 0; k < 4; k++) g.line(9 + k, 14 - Math.floor(k / 2), 22 - k, 14 - Math.floor(k / 2), C.out);
    g.rect(10, 27, 12, 3, C.brown).line(10, 27, 21, 27, C.tan);
    const fx = f ? 1 : 0;
    g.ellipse(16 + fx, 23, 5, 5, C.red).ellipse(16 - fx, 24, 3.5, 3.5, C.orange).ellipse(16, 25, 2, 2, C.yellow).set(15 + fx * 2, 17, C.orange).set(17 - fx, 18, C.yellow);
    g.pts([[5, 2], [6, 2], [5, 3], [6, 3]], C.green).pts([[26, 1], [26, 2], [27, 3], [25, 3]], C.cream);
    return g.outline();
  });
  add('in_fireplace', 'interior', fire, 4);
  const pl = new G(16, 24);
  pl.rect(4, 16, 8, 7, C.coral).rect(3, 15, 10, 2, C.orange).line(5, 17, 5, 21, C.red);
  pl.ellipse(8, 9, 3, 6, C.green1).ellipse(4, 11, 3, 3, C.green).ellipse(12, 10, 3, 3.5, C.green).ellipse(8, 6, 2, 3, C.lgreen).pts([[5, 9], [11, 8], [8, 3]], C.pgreen);
  add('in_plant', 'interior', pl.outline());
  const ra = new G(16, 24);
  ra.rect(1, 13, 14, 3, C.tan).line(1, 13, 14, 13, C.ltan).rect(2, 16, 2, 7, C.brown).rect(12, 16, 2, 7, C.brown);
  ra.rect(3, 5, 10, 8, C.brown).rect(3, 5, 10, 1, C.tan).rect(4, 7, 5, 5, C.ltan).pts([[5, 8], [7, 8], [6, 10], [4, 10], [8, 10]], C.tan).set(11, 8, C.yellow).set(11, 10, C.yellow).line(12, 1, 10, 5, C.dgray);
  add('in_radio', 'interior', ra.outline());
  const pi = new G(32, 32);
  pi.rect(1, 3, 30, 22, C.plum).rect(1, 3, 30, 2, C.dbrown).rect(3, 7, 26, 8, C.dbrown).rect(2, 17, 28, 4, C.white);
  for (let x = 4; x < 29; x += 3) if (x % 7) pi.rect(x, 17, 1, 2, C.out);
  pi.rect(3, 25, 2, 6, C.plum).rect(27, 25, 2, 6, C.plum).rect(13, 26, 6, 2, C.dbrown).rect(6, 8, 6, 5, C.cream).line(7, 10, 10, 10, C.gray);
  add('in_piano', 'interior', pi.outline());
  const dt = new G(32, 24);
  dt.rect(1, 6, 30, 6, C.tan).line(1, 6, 30, 6, C.ltan).rect(1, 12, 30, 2, C.brown).rect(3, 14, 2, 9, C.brown).rect(27, 14, 2, 9, C.brown);
  dt.rect(10, 6, 12, 6, C.cream).line(10, 11, 21, 11, C.ltan).ellipse(16, 6, 4, 2, C.lblue).pts([[14, 4], [16, 3], [18, 4], [15, 5]], C.red).set(17, 5, C.orange).set(13, 5, C.yellow);
  add('in_dining_table', 'interior', dt.outline());
  const ch = new G(16, 24);
  ch.rect(4, 3, 8, 10, C.tan); clearRect(ch, 5, 5, 6, 7); ch.line(6, 5, 6, 11, C.tan).line(9, 5, 9, 11, C.tan).rect(3, 13, 10, 3, C.ltan).rect(3, 16, 2, 7, C.brown).rect(11, 16, 2, 7, C.brown);
  add('in_chair', 'interior', ch.outline());

  // bedroom
  const bed = new G(32, 40);
  bed.rect(1, 1, 30, 12, C.brown).rect(3, 1, 26, 2, C.tan).rect(2, 9, 28, 29, C.cream);
  bed.ellipse(10, 13, 6, 3, C.white).ellipse(22, 13, 6, 3, C.white).pts([[8, 12], [20, 12]], C.vlgray);
  const q = [C.pink, C.ppink, C.lav, C.ppink];
  for (let y = 18; y < 37; y += 5) for (let x = 2; x < 30; x += 7) bed.rect(x, y, 7, 5, q[((x / 7) | 0) + (((y - 18) / 5) | 0) & 3]);
  bed.line(2, 18, 29, 18, C.violet).rect(1, 37, 30, 3, C.brown).line(1, 37, 30, 37, C.tan);
  add('in_bed', 'interior', bed.outline());
  const ns = new G(16, 24);
  ns.rect(2, 12, 12, 11, C.tan).line(2, 12, 13, 12, C.ltan).line(3, 17, 12, 17, C.brown).set(8, 15, C.yellow).set(8, 20, C.yellow).rect(7, 9, 2, 3, C.brown);
  for (let y = 4; y < 9; y++) ns.rect(5 - ((y - 4) >> 1), y, 6 + ((y - 4) >> 1) * 2, 1, y < 6 ? C.pyellow : C.yellow);
  add('in_nightstand', 'interior', ns.outline());
  const dr = new G(32, 24);
  dr.rect(1, 6, 30, 17, C.tan).line(1, 6, 30, 6, C.ltan);
  for (const y of [11, 16]) dr.line(2, y, 29, y, C.brown);
  for (const y of [8, 13, 19]) dr.pts([[9, y], [22, y]], C.yellow);
  dr.rect(5, 1, 4, 5, C.lblue).pts([[6, 0], [7, 0], [5, 0]], C.pink).rect(20, 3, 8, 3, C.cream);
  add('in_dresser', 'interior', dr.outline());
  const wd = new G(16, 32);
  wd.rect(1, 3, 14, 28, C.brown).rect(0, 1, 16, 3, C.tan).line(8, 4, 8, 30, C.dbrown).pts([[6, 16], [10, 16]], C.yellow).rect(3, 6, 4, 8, C.tan).rect(10, 6, 3, 8, C.tan);
  add('in_wardrobe', 'interior', wd.outline());

  // kitchen
  const stove = [0, 1].map(f => {
    const g = new G(16, 32);
    g.rect(10, 0, 3, 12, C.dgray).rect(2, 12, 12, 17, C.dgray).rect(1, 11, 14, 2, C.gray).rect(4, 17, 8, 7, C.out);
    g.ellipse(8, 21 + f * 0.4, 3, 2.4, C.orange).ellipse(8, 22, 1.6, 1.4, C.yellow);
    g.rect(3, 7, 6, 4, C.gray).line(3, 7, 8, 7, C.lgray).rect(2, 29, 2, 2, C.dgray).rect(12, 29, 2, 2, C.dgray);
    return g.outline();
  });
  add('in_stove', 'interior', stove, 3);
  const cab = top => { const g = new G(16, 24); g.rect(1, 9, 14, 14, C.tan).rect(3, 12, 10, 9, C.ltan).set(11, 16, C.brown).rect(0, 7, 16, 3, C.vlgray).line(0, 7, 15, 7, C.white); top(g); return g.outline(); };
  add('in_counter', 'interior', cab(g => g.rect(3, 5, 7, 2, C.ltan).ellipse(12, 5, 2, 1.6, C.red).set(12, 3, C.green)));
  add('in_sink', 'interior', cab(g => g.rect(3, 7, 10, 2, C.lgray).rect(4, 8, 8, 1, C.lblue).rect(7, 2, 2, 5, C.gray).rect(7, 2, 4, 1, C.gray)));
  const ice = new G(16, 32);
  ice.rect(2, 2, 12, 29, C.white).rect(2, 2, 12, 1, C.vlgray).line(2, 13, 13, 13, C.lgray).line(13, 3, 13, 30, C.vlgray).rect(11, 6, 1, 4, C.gray).rect(11, 17, 1, 5, C.gray);
  add('in_icebox', 'interior', ice.outline());
  const pa = new G(16, 32);
  pa.rect(1, 2, 14, 29, C.tan).rect(3, 4, 10, 25, C.brown);
  for (const sy of [12, 20, 28]) { pa.rect(3, sy, 10, 1, C.ltan); [[3, C.lav], [7, C.orange], [10, C.green]].forEach(([x, c], k) => pa.rect(x + (sy % 3), sy - 5, 3, 5, c).rect(x + (sy % 3), sy - 6, 3, 1, k % 2 ? C.red : C.cream)); }
  add('in_pantry', 'interior', pa.outline());

  // wall hangings (16x16)
  const win = new G(16, 16);
  win.rect(1, 1, 14, 13, C.tan); clearRect(win, 3, 3, 10, 9); win.line(8, 3, 8, 11, C.tan).line(3, 7, 12, 7, C.tan).rect(0, 13, 16, 3, C.ltan).line(0, 15, 15, 15, C.tan);
  add('in_window', 'interior', win.outline());
  const pt = (inner) => { const g = new G(16, 16); g.rect(1, 2, 14, 12, C.orange).rect(2, 3, 12, 10, C.yellow).rect(3, 4, 10, 8, C.pblue); inner(g); return g.outline(); };
  add('in_painting_lake', 'interior', pt(g => g.rect(3, 8, 10, 2, C.green).rect(3, 10, 10, 2, C.blue).pts([[5, 7], [6, 6], [7, 7], [9, 7], [10, 6], [11, 7]], C.green1).set(11, 5, C.yellow)));
  add('in_painting_cats', 'interior', pt(g => { g.rect(3, 4, 10, 8, C.ppink).ellipse(8, 9, 3.5, 3, C.orange).pts([[5, 6], [5, 5], [11, 6], [11, 5]], C.orange).pts([[7, 9], [9, 9]], C.out).set(8, 10, C.pink); }));
  const clk = new G(16, 16);
  clk.ellipse(8, 8, 6.5, 6.5, C.tan).ellipse(8, 8, 5, 5, C.cream).line(8, 8, 8, 4, C.out).line(8, 8, 11, 8, C.out).pts([[8, 3], [13, 8], [8, 13], [3, 8]], C.brown);
  add('in_clock', 'interior', clk.outline());
  const sh = new G(16, 16);
  sh.rect(1, 11, 14, 2, C.tan).pts([[2, 13], [13, 13], [2, 14], [13, 14]], C.brown).rect(3, 7, 4, 4, C.coral).ellipse(5, 5, 2.5, 2, C.green).rect(9, 8, 4, 3, C.lblue).ellipse(11, 6, 1.8, 2.5, C.lgreen);
  add('in_wall_shelf', 'interior', sh.outline());
  const mi = new G(16, 16);
  mi.ellipse(8, 8, 5.5, 7, C.yellow).ellipse(8, 8, 4, 5.5, C.pblue).line(6, 5, 9, 2, C.white).line(6, 8, 10, 4, C.white);
  add('in_mirror', 'interior', mi.outline());
  const bu = new G(16, 16);
  for (let x = 0; x < 16; x++) bu.set(x, 3 + Math.round(Math.sin(x / 15 * Math.PI) * 2), C.brown);
  [[1, C.red], [6, C.yellow], [11, C.lblue]].forEach(([x, c]) => { const y = 4 + Math.round(Math.sin((x + 2) / 15 * Math.PI) * 2); for (let k = 0; k < 4; k++) bu.rect(x + k / 2, y + k, 4 - k, 1, c); });
  add('in_bunting', 'interior', bu);
  const wr = new G(16, 16);
  wr.ellipse(8, 8, 6.5, 6.5, C.green); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + 0.5 - 8) ** 2 + (y + 0.5 - 8) ** 2 <= 12) wr.p[y * 16 + x] = -1; wr.pts([[3, 6], [12, 5], [11, 11], [5, 12], [8, 2]], C.red).pts([[4, 9], [13, 8], [7, 13]], C.lgreen).pts([[7, 13], [9, 13], [6, 14], [10, 14], [8, 13]], C.red);
  add('in_wreath', 'interior', wr.outline());
}

/* ------------------------------------------------------------ swap sets */
const swaps = {
  roof: { indices: [17, 18, 19], options: { red: [17, 18, 19], blue: [13, 14, 15], green: [8, 9, 10], plum: [1, 23, 24], slate: [28, 29, 30], gold: [3, 20, 21], teal: [13, 15, 16], rose: [17, 26, 27], moss: [8, 9, 11] } },
  wall: { indices: [3, 4, 5], options: { oak: [3, 4, 5], birch: [4, 5, 6], walnut: [1, 2, 3], driftwood: [29, 30, 31], cherry: [17, 19, 20] } },
  // Colour slots: these palette indices get replaced by per-player / per-cat colours.
  player: { slots: { hair: 2, hairHi: 3, skin: 5, skinShade: 4, shirt: 14, shirtShade: 13, pants: 28, accent: 10 } },
  cat: { slots: { coat: 20, shade: 19, marking: 3, belly: 6, eye: 11 } },
};

// Imported art (e.g. tools/import_sheet.py) lives in data/custom-sprites.json and always wins.
const CUSTOM = path.join(__dirname, '..', 'data', 'custom-sprites.json');
if (fs.existsSync(CUSTOM)) Object.assign(sprites, JSON.parse(fs.readFileSync(CUSTOM, 'utf8')).sprites || {});
const out = { version: 1, tile: 16, palette: PALETTE, swaps, sprites };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${Object.keys(sprites).length} sprites to ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
