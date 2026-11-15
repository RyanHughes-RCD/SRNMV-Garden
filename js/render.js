// World rendering: ground, y-sorted objects, entities, lighting.
import { G, TILE, hash2, clamp } from './game.js';
import { DATA } from './data.js';
import { drawSprite, frameCanvas, optionSwap, mergeSwaps, animFrame, hasSprite } from './sprites.js';
import { idx, tx, ty } from './world.js';
import { lighting, isNight, hourOfDay } from './daytime.js';
import { drawParticles, drawCritters, emit } from './particles.js';
import { drawCats } from './cats.js';
import { drawPlayer, playerLight } from './player.js';
import { drawModeOverlay } from './modes.js';
import { jobsAtTile } from './jobs.js';
import { drawDecor, overlaySprite, lightsFrom } from './decorations.js';

let canvas, ctx, lightCanvas, lctx;
export function initRender(c) {
  canvas = c; ctx = c.getContext('2d', { alpha: false });
  lightCanvas = document.createElement('canvas'); lctx = lightCanvas.getContext('2d');
  addEventListener('resize', resize);
  resize();
}
export function resize() {
  const W = innerWidth, H = innerHeight;
  const s = Math.max(1, Math.floor(Math.min(W / 480, H / 270)));
  G.view.scale = s;
  G.view.w = Math.floor(W / s); G.view.h = Math.floor(H / s);
  canvas.width = G.view.w; canvas.height = G.view.h;
  canvas.style.width = `${G.view.w * s}px`; canvas.style.height = `${G.view.h * s}px`;
  lightCanvas.width = G.view.w; lightCanvas.height = G.view.h;
  ctx.imageSmoothingEnabled = false;
  document.documentElement.style.setProperty('--scale', s);
}

export function clampCamera() {
  const mw = G.state.map.w * TILE, mh = G.state.map.h * TILE;
  const cam = G.camera;
  cam.x = mw <= G.view.w ? (mw - G.view.w) / 2 : clamp(cam.x, 0, mw - G.view.w);
  cam.y = mh <= G.view.h ? (mh - G.view.h) / 2 : clamp(cam.y, 0, mh - G.view.h);
}

// How many grass_N textures exist (12 by default; add more in the Workshop data and they're used automatically).
let grassCount = 0, grassFor = null;
function grassLooks() {
  if (grassFor !== DATA.sprites) { grassFor = DATA.sprites; grassCount = 0; while (hasSprite(`grass_${grassCount}`)) grassCount++; grassCount ||= 1; }
  return grassCount;
}

function groundSprite(i, x, y) {
  const g = G.state.map.ground[i];
  if (g === 'g') { const h = hash2(x, y, 7); return h < 0.05 ? 'grass_flowers' : `grass_${Math.floor(hash2(x, y, 3) * grassLooks())}`; }
  if (g === 'f') return `forest_${Math.floor(hash2(x, y, 5) * 3)}`;
  if (g === 't') { const c = G.state.crops[i]; return c && c.wetUntil > G.state.simTime ? 'soil_wet' : 'soil'; }
  const dd = DATA.decor[g];
  if (dd?.ground) return dd.overlay ? `grass_${Math.floor(hash2(x, y, 3) * grassLooks())}` : dd.sprite;
  return g;
}

const drawList = [];
function pushDraw(y, fn) { drawList.push({ y, fn }); }

export function cabinSwap() { const c = G.state.cabin; return mergeSwaps(optionSwap('roof', c.roof), optionSwap('wall', c.wall)); }

export function renderWorld(t) {
  const st = G.state, cam = G.camera, vw = G.view.w, vh = G.view.h;
  const ox = Math.round(cam.x), oy = Math.round(cam.y);
  ctx.fillStyle = '#2e4a3a'; ctx.fillRect(0, 0, vw, vh);
  ctx.save();
  ctx.translate(-ox, -oy);
  const x0 = Math.max(0, Math.floor(ox / TILE) - 1), y0 = Math.max(0, Math.floor(oy / TILE) - 1);
  const x1 = Math.min(st.map.w - 1, Math.ceil((ox + vw) / TILE) + 1), y1 = Math.min(st.map.h - 1, Math.ceil((oy + vh) / TILE) + 2);
  // ground
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * st.map.w + x;
    drawSprite(ctx, groundSprite(i, x, y), 0, x * TILE, y * TILE);
    const ov = overlaySprite(st.map.ground[i]);
    if (ov) drawSprite(ctx, ov, 0, x * TILE, y * TILE);
  }
  // pending till jobs + plot outlines
  ctx.fillStyle = 'rgba(138,90,59,0.28)';
  for (const p of st.plots) {
    ctx.strokeStyle = 'rgba(255,248,220,0.45)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(p.x * TILE + 0.5, p.y * TILE + 0.5, p.w * TILE - 1, p.h * TILE - 1);
    ctx.setLineDash([]);
  }
  drawCabinGround();
  for (const j of st.jobs) if (j.type === 'till') ctx.fillRect(tx(j.tile) * TILE + 1, ty(j.tile) * TILE + 1, 14, 14);

  // y-sorted drawables
  drawList.length = 0;
  for (let y = y0; y <= y1 + 1 && y < st.map.h; y++) for (let x = x0; x <= x1; x++) {
    const i = y * st.map.w + x;
    const o = st.map.obj[i];
    if (st.map.ground[i] === 'f') {
      const h = hash2(x, y, 11);
      const edge = st.map.ground[i + 1] !== 'f' || st.map.ground[i - 1] !== 'f' || st.map.ground[i + st.map.w] !== 'f' || st.map.ground[i - st.map.w] !== 'f';
      if (edge || h > 0.55) {
        const tree = treeSprite(x, y);
        const jx = Math.round((hash2(x, y, 13) - 0.5) * 6);
        pushDraw(y * TILE + 15, () => drawSprite(ctx, tree, 0, x * TILE - 4 + jx, y * TILE - 16));
      }
    }
    if (o) {
      if (o.startsWith('d:')) { const name = debrisSprite(o.slice(2), x, y); pushDraw(y * TILE + 12, () => drawSprite(ctx, name, 0, x * TILE, y * TILE)); }
      else if (o === 'crate' || o === 'shop') pushDraw(y * TILE + 13, () => drawSprite(ctx, o, 0, x * TILE, y * TILE));
    }
    const crop = st.crops[i];
    if (crop) pushDraw(y * TILE + 10, () => drawCrop(crop, x, y, t));
  }
  // cabin
  const cb = st.cabin;
  pushDraw((cb.y + 2) * TILE - 1, () => drawCabin(t));
  drawDecor(pushDraw, ctx, t, x0, y0, x1, y1);
  drawCats(pushDraw, ctx, t);
  drawPlayer(pushDraw, ctx, t);
  drawList.sort((a, b) => a.y - b.y);
  for (const d of drawList) d.fn();

  // job markers + progress
  for (const j of st.jobs) {
    const x = tx(j.tile) * TILE, y = ty(j.tile) * TILE;
    if (x < ox - 16 || x > ox + vw || y < oy - 16 || y > oy + vh) continue;
    if (j.type === 'clear' && j.marked) drawSprite(ctx, 'icon_mark', 0, x + 10, y - 3);
    if (j.progress > 0) {
      const f = Math.min(1, j.progress / j.work);
      ctx.fillStyle = 'rgba(26,20,35,0.75)'; ctx.fillRect(x + 1, y - 2, 14, 3);
      ctx.fillStyle = j.type === 'water' ? '#7fb3d5' : j.type === 'plant' ? '#8cc65a' : '#f7cd5d';
      ctx.fillRect(x + 2, y - 1, Math.max(1, Math.round(12 * f)), 1);
    }
  }
  drawParticles(ctx, t, 0);
  drawCritters(ctx, t, false);
  drawModeOverlay(ctx, t);
  ctx.restore();

  renderLighting(t, ox, oy);
  ctx.save(); ctx.translate(-ox, -oy); drawCritters(ctx, t, true); drawParticles(ctx, t, 1); ctx.restore();
}

// Forest mix: round, pine, birch, wide cloud, tall cloud, spruce and old oak trees.
// Weights live in balance.json (trees.mix) so you can change the feel of the woods.
const DEFAULT_TREE_MIX = [34, 20, 10, 10, 8, 10, 8];
export function treeSprite(x, y) {
  const mix = DATA.balance.trees?.mix || DEFAULT_TREE_MIX;
  let total = 0; for (const w of mix) total += w;
  let r = hash2(x, y, 23) * total;
  for (let k = 0; k < mix.length; k++) { r -= mix[k]; if (r < 0) return hasSprite(`tree_${k}`) ? `tree_${k}` : 'tree_0'; }
  return 'tree_0';
}

// Each debris type has several looks; pick one per tile (stable, so it never flickers).
const DEBRIS_LOOKS = 5;
export function debrisSprite(type, x, y) {
  const v = Math.floor(hash2(x, y, 17) * DEBRIS_LOOKS);
  return v && hasSprite(`debris_${type}_${v}`) ? `debris_${type}_${v}` : `debris_${type}`;
}

function drawCrop(crop, x, y, t) {
  const st = G.state;
  const ready = crop.stage >= 3;
  const bob = ready ? Math.round(Math.sin(t * 2 + x + y) * 0.6) : 0;
  drawSprite(ctx, `crop_${crop.id}`, crop.stage, x * TILE, y * TILE - 2 + bob);
  if (ready && Math.sin(t * 1.3 + x * 3 + y * 7) > 0.97 && Math.random() < 0.3) emit({ x: x * TILE + 4 + Math.random() * 6, y: y * TILE - 4, vy: -6, life: 0.7, sprite: 'fx_sparkle', frameRate: 6, fade: false });
  if (crop.wetUntil > st.simTime && crop.stage < 3 && Math.random() < 0.002) emit({ x: x * TILE + 8, y: y * TILE + 12, vy: -4, life: 0.6, color: '#b7e0ef', size: 1 });
}

// Things on the ground in front of the cabin (under people and cats)
function drawCabinGround() {
  const cb = G.state.cabin, sx = cb.x * TILE, fy = (cb.y + 2) * TILE;
  if (cb.porch) drawSprite(ctx, 'cabin_porch', 0, sx - 2, fy - 3);
  if (cb.welcomeMat) drawSprite(ctx, 'cabin_mat', 0, sx + 18, fy + 1);
}

function drawCabin(t) {
  const cb = G.state.cabin;
  const sx = cb.x * TILE, sy = (cb.y + 2) * TILE - 48;
  const sw = cabinSwap();
  drawSprite(ctx, 'cabin', 0, sx, sy, { swap: sw.swap, swapKey: sw.key });
  drawSprite(ctx, `cabin_door_${cb.door}`, 0, sx + 19, sy + 30);
  if (cb.curtains && cb.curtains !== 'none') {
    const cols = DATA.cabinOptions.curtains?.colors?.[cb.curtains];
    if (cols) { const swap = { 26: cols[0], 27: cols[1] }, key = 'curt:' + cb.curtains; drawSprite(ctx, 'cabin_curtains', 0, sx + 6, sy + 27, { swap, swapKey: key }); drawSprite(ctx, 'cabin_curtains', 0, sx + 33, sy + 27, { swap, swapKey: key }); }
  }
  if (cb.windowBoxes) { drawSprite(ctx, 'cabin_windowbox', 0, sx + 5, sy + 37); drawSprite(ctx, 'cabin_windowbox', 0, sx + 32, sy + 37); }
  if (cb.chimney && cb.chimney !== 'stone') drawSprite(ctx, `cabin_chimney_${cb.chimney}`, 0, sx + 33, sy);
  if (cb.porchSwing) drawSprite(ctx, 'cabin_swing', 0, sx + 2, sy + 42);
  // chimney smoke (evening, night, early morning)
  const h = hourOfDay();
  if ((h > 17 || h < 9) && Math.random() < 0.04) emit({ x: sx + 34 + Math.random() * 3, y: sy - 4, vx: 3 + Math.random() * 3, vy: -9, life: 3.2, sprite: 'fx_smoke' });
}

function cut(x, y, r, strength = 1) {
  const g = lctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(0.6, `rgba(0,0,0,${strength * 0.55})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  lctx.fillStyle = g; lctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function glow(x, y, r, a, col = '255,190,100') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
export function lightSources() {
  const st = G.state, out = [];
  const cb = st.cabin, sx = cb.x * TILE, sy = (cb.y + 2) * TILE - 48;
  out.push({ x: sx + 11, y: sy + 33, r: 34, win: [sx + 7, sy + 28, 8, 8] }, { x: sx + 38, y: sy + 33, r: 34, win: [sx + 34, sy + 28, 8, 8] });
  out.push(...lightsFrom());
  const pl = playerLight(); if (pl) out.push(pl);
  return out;
}
let lightsCache = [], lightsAt = -99;
function renderLighting(t, ox, oy) {
  const L = lighting();
  const vw = G.view.w, vh = G.view.h;
  if (L.dark > 0.01) {
    if (G.realTime - lightsAt > 1) { lightsCache = lightSources(); lightsAt = G.realTime; }
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, vw, vh);
    lctx.fillStyle = `rgba(12,14,40,${L.dark.toFixed(3)})`;
    lctx.fillRect(0, 0, vw, vh);
    lctx.globalCompositeOperation = 'destination-out';
    const flick = 1 + Math.sin(t * 7) * 0.03 + Math.sin(t * 13) * 0.02;
    const fireFlick = 1 + Math.sin(t * 11) * 0.06 + Math.sin(t * 17) * 0.04;
    for (const s of lightsCache) cut(s.x - ox, s.y - oy, s.r * (s.fire ? fireFlick : flick), 0.95);
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCanvas, 0, 0);
    const a = Math.min(1, L.dark * 1.6);
    ctx.globalCompositeOperation = 'lighter';
    for (const s of lightsCache) {
      glow(s.x - ox, s.y - oy, s.r * 0.6 * (s.fire ? fireFlick : flick), (s.fire ? 0.3 : 0.18) * a, s.fire ? '255,150,60' : undefined);
      if (s.win) { ctx.fillStyle = `rgba(255,205,110,${(0.55 * a).toFixed(3)})`; ctx.fillRect(s.win[0] - ox, s.win[1] - oy, s.win[2], s.win[3]); }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (L.tintA > 0.005) {
    ctx.fillStyle = `rgba(${L.tint.map(Math.round).join(',')},${L.tintA.toFixed(3)})`;
    ctx.fillRect(0, 0, vw, vh);
  }
}

export function getCtx() { return ctx; }
export function getCanvas() { return canvas; }
export { frameCanvas, animFrame, idx };
