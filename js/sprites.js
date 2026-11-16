// Turns palette-indexed sprite data into cached canvases.
import { DATA } from './data.js';

// palette index characters: up to 62 colours per palette ('.' = transparent)
const CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cache = new Map();
const urlCache = new Map();
let palRGB = null;

export function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function resetSpriteCache() { cache.clear(); urlCache.clear(); palRGB = null; }
export function spriteDef(name) { return DATA.sprites.sprites[name]; }
export function hasSprite(name) { return !!DATA.sprites.sprites[name]; }

function missing(w = 16, h = 16) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#e88fb0'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1423'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
  return c;
}

// swap: { paletteIndex: '#hex' } — recolours those indices for this draw only.
export function frameCanvas(name, frame = 0, swap = null, swapKey = '', silhouette = false) {
  const key = `${name}|${frame}|${swapKey}|${silhouette ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  const def = spriteDef(name);
  if (!def) { c = missing(); cache.set(key, c); return c; }
  if (!palRGB) palRGB = DATA.sprites.palette.map(hexToRgb);
  const rows = def.frames[((frame % def.frames.length) + def.frames.length) % def.frames.length];
  c = document.createElement('canvas'); c.width = def.w; c.height = def.h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(def.w, def.h);
  // a sprite may carry its own colours (imported art); palette swaps only apply to shared-palette sprites
  const pal = def.pal ? def.pal.map(hexToRgb) : palRGB;
  const swapRGB = swap && !def.pal ? Object.fromEntries(Object.entries(swap).map(([k, v]) => [k, hexToRgb(v)])) : null;
  for (let y = 0; y < def.h; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < def.w; x++) {
      const ch = row[x];
      if (!ch || ch === '.') continue;
      const idx = CH.indexOf(ch);
      if (idx < 0) continue;
      const rgb = silhouette ? [40, 32, 52] : (swapRGB && swapRGB[idx]) || pal[idx] || [255, 0, 255];
      const o = (y * def.w + x) * 4;
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}

export function animFrame(name, t, fpsOverride) {
  const d = spriteDef(name);
  if (!d || d.frames.length < 2) return 0;
  const fps = fpsOverride ?? d.fps ?? 0;
  if (!fps) return 0;
  return Math.floor(t * fps) % d.frames.length;
}

// While shadowPass.ctx is set, drawSprite paints a slanted copy of the sprite into the shadow
// layer instead: rows above the ground line (shadowPass.foot) are pushed sideways (sx) and
// down (sy) in proportion to their height, like a shadow lying on the grass.
export const shadowPass = { ctx: null, foot: 0, sx: 0, sy: 0, ox: 0, oy: 0 };
export function drawSprite(ctx, name, frame, x, y, opts = {}) {
  const c = frameCanvas(name, frame, opts.swap, opts.swapKey || '', opts.silhouette);
  // scale draws big art smaller (e.g. a detailed cat); it may land between game pixels
  const s = opts.scale ?? 1;
  if (s === 1) { x = Math.round(x); y = Math.round(y); } else { x = Math.round(x * 4) / 4; y = Math.round(y * 4) / 4; }
  const sp = shadowPass;
  if (sp.ctx) {
    if (opts.noShadow) return c;
    const H = sp.foot, f = opts.flip ? -s : s;
    sp.ctx.setTransform(f, 0, -sp.sx * s, -sp.sy * s, x + (opts.flip ? c.width * s : 0) + (H - y) * sp.sx - sp.ox, H + (H - y) * sp.sy - sp.oy);
    sp.ctx.drawImage(c, 0, 0);
    return c;
  }
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.flip) { ctx.save(); ctx.translate(x + c.width * s, y); ctx.scale(-s, s); ctx.drawImage(c, 0, 0); ctx.restore(); }
  else if (s !== 1) ctx.drawImage(c, x, y, c.width * s, c.height * s);
  else ctx.drawImage(c, x, y);
  if (opts.alpha != null) ctx.globalAlpha = 1;
  return c;
}

// Data URL for DOM icons (menus, HUD).
export function iconURL(name, frame = 0, opts = {}) {
  const key = `${name}|${frame}|${opts.swapKey || ''}|${opts.silhouette ? 1 : 0}`;
  let u = urlCache.get(key);
  if (u) return u;
  u = frameCanvas(name, frame, opts.swap, opts.swapKey || '', opts.silhouette).toDataURL();
  urlCache.set(key, u);
  return u;
}
export function iconHTML(name, cls = 'ico', opts = {}) {
  return `<img class="${cls}" src="${iconURL(name, opts.frame || 0, opts)}" alt="">`;
}

// Swap built from named colour slots, e.g. a cat's coat or a player's outfit.
export function slotSwap(slotSet, colors) {
  const def = DATA.sprites.swaps?.[slotSet];
  if (!def?.slots || !colors) return { swap: null, key: '' };
  const swap = {};
  for (const [slot, idx] of Object.entries(def.slots)) if (colors[slot]) swap[idx] = colors[slot];
  return { swap, key: slotSet + ':' + Object.values(swap).join(',') };
}
// Swap built from a named option of a palette-index swap set (cabin roof etc).
export function optionSwap(setName, option) {
  const def = DATA.sprites.swaps?.[setName];
  if (!def?.indices || !def.options?.[option]) return { swap: null, key: '' };
  const pal = DATA.sprites.palette, swap = {};
  def.indices.forEach((idx, i) => { const t = def.options[option][i]; if (t != null && pal[t]) swap[idx] = pal[t]; });
  return { swap, key: `${setName}:${option}` };
}
export function mergeSwaps(...list) {
  const swap = {}; let key = '';
  for (const s of list) if (s?.swap) { Object.assign(swap, s.swap); key += s.key + ';'; }
  return { swap: key ? swap : null, key };
}
