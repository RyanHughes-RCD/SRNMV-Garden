// Tile queries, collision and A* pathfinding.
import { G, TILE } from './game.js';
import { DATA } from './data.js';

export const W = () => G.state.map.w;
export const H = () => G.state.map.h;
export const idx = (x, y) => y * G.state.map.w + x;
export const tx = i => i % G.state.map.w;
export const ty = i => Math.floor(i / G.state.map.w);
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < G.state.map.w && y < G.state.map.h;
export const ground = i => G.state.map.ground[i];
export const obj = i => G.state.map.obj[i];
export const tileAtPx = (px, py) => ({ x: Math.floor(px / TILE), y: Math.floor(py / TILE) });
export const tileCenter = i => ({ x: tx(i) * TILE + 8, y: ty(i) * TILE + 8 });

export const isWater = i => G.state.map.ground[i] === 'w';
export function debrisAt(i) { const o = obj(i); return o && o.startsWith('d:') ? o.slice(2) : null; }
// A forest tile that can be chopped down (everything except the permanent outer woods).
export function choppable(i) {
  if (G.state.map.ground[i] !== 'f') return false;
  const m = DATA.balance.trees?.permanentBorder ?? 3, x = tx(i), y = ty(i);
  return x >= m && y >= m && x < W() - m && y < H() - m;
}
// Decoration id covering tile i (multi-tile ones store 'p:<anchor>' on their other tiles)
export function decorAt(i) {
  let o = obj(i);
  if (o && o.startsWith('p:')) o = obj(+o.slice(2));
  return o && o.startsWith('x:') ? o.slice(2) : null;
}

export function blocks(i) {
  if (i < 0 || i >= G.state.map.ground.length) return true;
  const gr = G.state.map.ground[i];
  if (gr === 'f' || gr === 'w') return true;
  const o = G.state.map.obj[i];
  if (!o) return false;
  if (o.startsWith('d:')) return !!DATA.debris[o.slice(2)]?.blocks;
  if (o.startsWith('x:') || o.startsWith('p:')) { const d = DATA.decor[decorAt(i)]; return !!d && !d.ground && d.blocks !== false; }
  return true; // cabin, crate, shop
}
export function blocksXY(x, y) { return !inBounds(x, y) || blocks(idx(x, y)); }

// Axis-aligned box vs. blocking tiles (used by the player)
export function boxBlocked(cx, cy, hw, hh) {
  const x0 = Math.floor((cx - hw) / TILE), x1 = Math.floor((cx + hw - 0.01) / TILE);
  const y0 = Math.floor((cy - hh) / TILE), y1 = Math.floor((cy + hh - 0.01) / TILE);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (blocksXY(x, y)) return true;
  return false;
}

export function plotAt(i) {
  const x = tx(i), y = ty(i);
  for (const p of G.state.plots) if (x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h) return p;
  return null;
}
export function plotTiles(p) {
  const out = [];
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) out.push(idx(x, y));
  return out;
}

/* ------------------------------------------------------------- A* path */
class Heap {
  constructor() { this.a = []; }
  push(n, f) { const a = this.a; a.push([f, n]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[1]; }
  get size() { return this.a.length; }
}
// Returns array of tile indices from start (exclusive) to goal (inclusive), or null.
export function findPath(start, goal, maxNodes = 5000) {
  if (start === goal) return [];
  const w = W(), n = G.state.map.ground.length;
  if (blocks(goal)) return null;
  const gScore = new Map([[start, 0]]), came = new Map();
  const gx = tx(goal), gy = ty(goal);
  const h = i => Math.abs(tx(i) - gx) + Math.abs(ty(i) - gy);
  const open = new Heap(); open.push(start, h(start));
  const closed = new Set();
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) {
      const path = [cur]; let c = cur;
      while (came.has(c)) { c = came.get(c); if (c !== start) path.push(c); }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > maxNodes) return null;
    const cx = cur % w;
    for (const nb of [cur - w, cur + w, cx > 0 ? cur - 1 : -1, cx < w - 1 ? cur + 1 : -1]) {
      if (nb < 0 || nb >= n || closed.has(nb) || blocks(nb)) continue;
      const g = gScore.get(cur) + 1;
      if (g < (gScore.get(nb) ?? Infinity)) { gScore.set(nb, g); came.set(nb, cur); open.push(nb, g + h(nb)); }
    }
  }
  return null;
}

// Tile a worker should stand on to work at tile i.
export function workSpots(i) {
  if (!blocks(i)) return [i];
  const w = W(), x = tx(i), y = ty(i), out = [];
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) if (!blocksXY(x + dx, y + dy)) out.push(idx(x + dx, y + dy));
  return out;
}

export function nearestWalkable(i) {
  if (!blocks(i)) return i;
  const x = tx(i), y = ty(i);
  for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (!blocksXY(x + dx, y + dy)) return idx(x + dx, y + dy);
  }
  return i;
}

export function randomWalkableNear(i, r) {
  const x = tx(i), y = ty(i);
  for (let k = 0; k < 20; k++) {
    const nx = x + Math.round((Math.random() * 2 - 1) * r), ny = y + Math.round((Math.random() * 2 - 1) * r);
    if (!blocksXY(nx, ny)) return idx(nx, ny);
  }
  return null;
}

export function cabinDoorFront() { const c = G.state.cabin; return idx(c.x + 1, c.y + 2); }
