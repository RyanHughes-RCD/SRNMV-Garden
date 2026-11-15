// DOM UI: HUD, toasts, banners, cards, the controller-driven menu stack, on-screen keyboard.
import { G, clamp } from './game.js';
import { DATA } from './data.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { iconHTML, slotSwap, frameCanvas } from './sprites.js';

const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Button glyphs: shows pad buttons, or keyboard keys if the keyboard was used last.
const GLYPH = { 'Ⓐ': ['A', 'E', 'a'], 'Ⓑ': ['B', 'Q', 'b'], 'Ⓧ': ['X', 'F', 'x'], 'Ⓨ': ['Y', 'Tab', 'y'] };
export function glyphs(html) {
  return String(html).replace(/[ⒶⒷⓍⓎ]/g, g => { const [p, k, c] = GLYPH[g]; const pad = input.lastWasPad || !input.everKey; return `<span class="btn ${pad ? c : 'key'}">${pad ? p : k}</span>`; })
    .replace(/\bLB\/RB\b/g, () => (input.lastWasPad || !input.everKey ? '<span class="btn">LB</span>/<span class="btn">RB</span>' : '<span class="btn key">Z</span>/<span class="btn key">C</span>'));
}
addEventListener('keydown', () => { input.everKey = true; });

/* -------------------------------------------------------------- toasts */
export function toast(html, icon, ms = 3800) {
  if (G.offline) return;
  const box = $('toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = (icon ? iconHTML(icon) : '') + `<span>${glyphs(html)}</span>`;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, ms);
}
let bannerTimer = null;
export function banner(html, ms = 4500) {
  if (G.offline) return;
  const el = $('banner');
  el.innerHTML = html; el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), ms);
}
export function setModePanel(html) { const el = $('modepanel'); el.innerHTML = html ? glyphs(html) : ''; el.classList.toggle('show', !!html); }

/* --------------------------------------------------------------- cards */
const cards = [];
export function showCard(html, { ms = 0, cls = '', onClose } = {}) {
  cards.push({ html, ms, cls, onClose });
  if (cards.length === 1) renderCard();
}
let cardTimer = 0;
function renderCard() {
  const el = $('card'), c = cards[0];
  if (!c) { el.classList.remove('show'); el.innerHTML = ''; return; }
  el.className = 'show ' + c.cls;
  el.innerHTML = `<div class="card-inner">${glyphs(c.html)}<div class="card-foot">${glyphs('Ⓐ continue')}</div></div>`;
  cardTimer = c.ms ? c.ms / 1000 : 0;
}
export const cardOpen = () => cards.length > 0;
export function updateCard(dt) {
  if (!cards.length) return false;
  if (cardTimer > 0) { cardTimer -= dt; if (cardTimer <= 0) { closeCard(); return true; } }
  if (input.pressed('confirm') || input.pressed('cancel') || input.pressed('pause')) { sfx('confirm'); closeCard(); input.consumeAll(); }
  return true;
}
function closeCard() { const c = cards.shift(); c?.onClose?.(); renderCard(); }

/* --------------------------------------------------------------- menus */
const stack = [];
export const menuOpen = () => stack.length > 0;
export const topMenu = () => stack.at(-1);
const itemsOf = m => (typeof m.items === 'function' ? m.items() : m.items) || [];

export function openMenu(m) {
  if (!stack.length) G.menuReturn = G.mode === 'menu' ? 'play' : G.mode;
  m.sel ??= 0;
  stack.push(m);
  G.mode = 'menu';
  fixSel(m);
  renderMenu();
  sfx('confirm');
  return m;
}
export function closeMenu() {
  const m = stack.pop();
  m?.onClose?.();
  if (!stack.length) { G.mode = G.menuReturn || 'play'; $('menus').innerHTML = ''; }
  else { fixSel(stack.at(-1)); renderMenu(); }
}
export function closeAllMenus() { while (stack.length) stack.pop()?.onClose?.(); G.mode = 'play'; $('menus').innerHTML = ''; }
export function replaceMenu(m) { stack.pop(); m.sel ??= 0; stack.push(m); fixSel(m); renderMenu(); }
export function refreshMenu() { if (stack.length) { fixSel(stack.at(-1)); renderMenu(); } }

function fixSel(m) {
  const its = itemsOf(m);
  if (!its.length) { m.sel = 0; return; }
  m.sel = clamp(m.sel, 0, its.length - 1);
  if (its[m.sel].header) { const n = its.findIndex((it, i) => i > m.sel && !it.header); m.sel = n >= 0 ? n : its.findIndex(it => !it.header); if (m.sel < 0) m.sel = 0; }
}

export function updateMenus(dt) {
  const m = stack.at(-1);
  if (!m) return;
  const its = itemsOf(m);
  const cols = m.columns || 1;
  const step = d => {
    if (!its.length) return;
    let i = m.sel;
    for (let k = 0; k < its.length; k++) { i = cols > 1 ? clamp(i + d, 0, its.length - 1) : (i + d + its.length) % its.length; if (!its[i].header) break; }
    if (i !== m.sel) { m.sel = i; sfx('move'); renderMenu(); }
  };
  if (input.nav('up')) step(-cols);
  if (input.nav('down')) step(cols);
  const it = its[m.sel];
  if (cols > 1) { if (input.nav('left')) step(-1); if (input.nav('right')) step(1); }
  else {
    if (input.nav('left') && it?.onLeft) { it.onLeft(it); sfx('move'); refreshMenu(); }
    if (input.nav('right') && it?.onRight) { it.onRight(it); sfx('move'); refreshMenu(); }
  }
  if (input.pressed('confirm') && it) {
    if (it.disabled) { sfx('error'); if (it.why) toast(it.why); }
    else if (it.onSelect) { it.onSelect(it); if (stack.includes(m)) refreshMenu(); }
    else if (it.onRight) { it.onRight(it); sfx('move'); refreshMenu(); }
  }
  if (input.pressed('tool') && it?.onX) { it.onX(it); if (stack.includes(m)) refreshMenu(); }
  if (input.pressed('cancel') || (input.pressed('pause') && !m.noPauseClose)) { sfx('cancel'); if (m.onBack) m.onBack(); else closeMenu(); }
  m._t = (m._t || 0) + dt;
  if (m.live && m._t > 0.5) { m._t = 0; renderMenu(); }
}

export function renderMenu() {
  const m = stack.at(-1), root = $('menus');
  if (!m) { root.innerHTML = ''; return; }
  const its = itemsOf(m);
  const cols = m.columns || 1;
  const title = typeof m.title === 'function' ? m.title() : m.title;
  const sub = typeof m.subtitle === 'function' ? m.subtitle() : m.subtitle;
  const cur = its[m.sel];
  let h = `<div class="menu ${m.cls || ''}">`;
  h += `<div class="menu-title">${m.icon ? iconHTML(m.icon) : ''}<span>${title}</span></div>`;
  if (sub) h += `<div class="menu-sub">${glyphs(sub)}</div>`;
  h += `<div class="menu-body"><div class="menu-items ${cols > 1 ? 'grid' : ''}" style="--cols:${cols}">`;
  its.forEach((it, i) => {
    if (it.header) { h += `<div class="mi hdr">${it.label}</div>`; return; }
    const cl = ['mi', i === m.sel ? 'sel' : '', it.disabled ? 'dis' : '', it.cls || ''].join(' ');
    const ico = it.iconHTML || (it.icon ? iconHTML(it.icon, 'ico', it.iconOpts || {}) : '');
    if (cols > 1) h += `<div class="${cl}" data-i="${i}">${ico}<span class="lbl">${it.label}</span></div>`;
    else h += `<div class="${cl}" data-i="${i}">${ico}<span class="lbl">${it.label}${it.sub ? `<small>${glyphs(it.sub)}</small>` : ''}</span>${it.right != null ? `<span class="right">${it.onLeft ? '◂ ' : ''}${it.right}${it.onRight ? ' ▸' : ''}</span>` : ''}</div>`;
  });
  if (!its.length) h += `<div class="mi dis">${m.empty || 'Nothing here yet.'}</div>`;
  h += `</div>`;
  if (m.detail && cur) h += `<div class="menu-detail">${m.detail(cur)}</div>`;
  h += `</div><div class="menu-foot">${glyphs(m.footer || (cur?.onX ? 'Ⓐ select · Ⓧ ' + (cur.xLabel || 'more') + ' · Ⓑ back' : 'Ⓐ select · Ⓑ back'))}</div></div>`;
  root.innerHTML = h;
  const sel = root.querySelector('.mi.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}
// mouse support for menus (handy when testing on a laptop)
addEventListener('DOMContentLoaded', () => {
  $('menus')?.addEventListener('click', e => {
    const el = e.target.closest('.mi[data-i]'); const m = stack.at(-1);
    if (!el || !m) return;
    const i = +el.dataset.i, it = itemsOf(m)[i];
    if (m.sel !== i) { m.sel = i; renderMenu(); return; }
    if (it && !it.disabled && it.onSelect) { it.onSelect(it); if (stack.includes(m)) refreshMenu(); }
  });
});

export function confirmDialog(text, yes, { yesLabel = 'Yes', noLabel = 'No' } = {}) {
  openMenu({ title: text, cls: 'small', sel: 1, items: [
    { label: yesLabel, onSelect: () => { closeMenu(); yes(); } },
    { label: noLabel, onSelect: () => closeMenu() },
  ] });
}

/* ------------------------------------------------- on-screen keyboard */
const OSK_ROWS = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ-\'!&', '0123456789'];
export function textInput(title, initial, onDone, max = 18) {
  let text = initial || '', lower = false;
  const keyHandler = e => {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { if (text.length < max) text += e.key; refreshMenu(); }
    else if (e.key === 'Backspace') { text = text.slice(0, -1); refreshMenu(); }
    else if (e.key === 'Enter') done();
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  };
  const done = () => { removeEventListener('keydown', keyHandler, true); closeMenu(); onDone(text.trim() || initial); };
  addEventListener('keydown', keyHandler, true);
  openMenu({
    title, cls: 'osk', columns: 10, noPauseClose: true,
    subtitle: () => `<div class="osk-text">${esc(text)}<span class="caret">_</span></div>`,
    footer: 'Ⓐ type · Ⓧ backspace · Ⓑ cancel',
    onBack: () => { removeEventListener('keydown', keyHandler, true); closeMenu(); },
    items: () => [
      ...OSK_ROWS.join('').split('').map(ch => { const c = lower ? ch.toLowerCase() : ch; return { label: c, onSelect: () => { if (text.length < max) text += c; }, onX: () => { text = text.slice(0, -1); } }; }),
      { label: '␣', onSelect: () => { if (text.length < max) text += ' '; }, onX: () => { text = text.slice(0, -1); } },
      { label: '⌫', onSelect: () => { text = text.slice(0, -1); }, onX: () => { text = text.slice(0, -1); } },
      { label: lower ? 'ABC' : 'abc', onSelect: () => { lower = !lower; } },
      { label: 'Clear', onSelect: () => { text = ''; } },
      { label: '✓ OK', cls: 'ok', onSelect: done },
    ],
  });
}

/* ----------------------------------------------------------------- HUD */
let hudCache = {};
function setHTML(id, html) { if (hudCache[id] !== html) { hudCache[id] = html; $(id).innerHTML = html; } }
export function resetHudCache() { hudCache = {}; portraitCache.clear(); }
export function catPortrait(cfg) {
  const set = cfg.spriteSet || 'cat';
  const name = DATA.sprites.sprites[`${set}_sit`] ? `${set}_sit` : 'cat_sit';
  const sw = slotSwap('cat', cfg.coat);
  return iconHTML(name, 'ico portrait', { swap: sw.swap, swapKey: sw.key });
}
// Player portraits are trimmed to the visible character, so art with empty space around it
// (like 32x32 imported frames) shows at a similar size to the built-in characters.
const portraitCache = new Map();
export function playerPortrait(cfg) {
  const name = DATA.sprites.sprites[`${cfg.spriteSet}_walk_down`] ? `${cfg.spriteSet}_walk_down` : 'p1_walk_down';
  const sw = slotSwap('player', cfg.colors), key = name + '|' + sw.key;
  let url = portraitCache.get(key);
  if (!url) {
    const src = frameCanvas(name, 0, sw.swap, sw.key), d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const c = document.createElement('canvas');
    if (x1 < 0) { c.width = 1; c.height = 1; } else { c.width = x1 - x0 + 1; c.height = y1 - y0 + 1; c.getContext('2d').drawImage(src, -x0, -y0); }
    url = c.toDataURL(); portraitCache.set(key, url);
  }
  return `<img class="ico portrait tall" src="${url}" alt="">`;
}
export function updateHUD(info) {
  const hud = $('hud');
  hud.classList.toggle('hidden', !info.visible);
  if (!info.visible) return;
  setHTML('hud-res', info.res);
  setHTML('hud-clock', info.clock);
  setHTML('hud-tool', glyphs(info.tool));
  setHTML('hud-cats', info.cats);
}
export function setTooltip(html) {
  const el = $('tooltip');
  const v = html ? glyphs(html) : '';
  if (hudCache.tooltip !== v) { hudCache.tooltip = v; el.innerHTML = v; el.classList.toggle('show', !!v); }
}
