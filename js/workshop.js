// Sprite & Cat Workshop: pixel editor, palette, live previews, cat personalities, player profiles.
// Edits are saved as overrides in localStorage, which the running game picks up live.
import { DATA, loadData, OVERRIDE_KEYS, writeLS } from './data.js';
import { frameCanvas, resetSpriteCache, slotSwap, optionSwap, hexToRgb } from './sprites.js';
import * as brain from './catbrain.js';

// palette index characters: up to 62 colours per palette ('.' = transparent)
const CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));

let BASE, SPR, CATS, PLAYERS;
const W = {
  sel: null, float: null, clip: null, // selection {x,y,w,h}, pixels being moved, copied pixels
  tab: 'sprites', name: null, frame: 0, tool: 'pencil', left: '0', right: '.', zoom: 16,
  mirror: false, onion: false, grid: true, history: {}, cat: 0, swap: {}, filter: { q: '', cat: 'all', changed: false },
};

/* ------------------------------------------------------------- startup */
async function start() {
  await loadData();
  BASE = clone(DATA.base.sprites);
  SPR = clone(DATA.sprites);
  DATA.sprites = SPR; // sprites.js renders from this object
  CATS = clone(DATA.catsConfig);
  PLAYERS = clone(DATA.playersConfig);
  setSaveState('All changes saved', true);
  $('version').textContent = 'v' + (document.querySelector('meta[name=game-version]')?.content || 'dev');
  initTabs(); initTopbar();
  initSprites(); initCats(); renderPlayers();
  const first = Object.keys(SPR.sprites).find(n => n.startsWith('crop_')) || Object.keys(SPR.sprites)[0];
  renderThumbs();
  selectSprite(first);
  requestAnimationFrame(animLoop);
}

/* ------------------------------------------------------------- saving */
const timers = {};
function scheduleSave(kind) {
  setSaveState('Saving...', false);
  clearTimeout(timers[kind]);
  timers[kind] = setTimeout(() => save(kind), 250);
}
function spriteOverrides() {
  const ov = { sprites: {} };
  if (JSON.stringify(SPR.palette) !== JSON.stringify(BASE.palette)) ov.palette = SPR.palette;
  if (JSON.stringify(SPR.swaps) !== JSON.stringify(BASE.swaps)) ov.swaps = SPR.swaps;
  for (const [k, v] of Object.entries(SPR.sprites)) if (!BASE.sprites[k] || JSON.stringify(v) !== JSON.stringify(BASE.sprites[k])) ov.sprites[k] = v;
  const deleted = Object.keys(BASE.sprites).filter(k => !SPR.sprites[k]);
  if (deleted.length) ov.deleted = deleted;
  return ov;
}
function save(kind) {
  let ok = true;
  if (kind === 'sprites') { const ov = spriteOverrides(); ok = writeLS(OVERRIDE_KEYS.sprites, Object.keys(ov.sprites).length || ov.palette || ov.swaps || ov.deleted ? ov : null); }
  if (kind === 'cats') ok = writeLS(OVERRIDE_KEYS.cats, CATS);
  if (kind === 'players') ok = writeLS(OVERRIDE_KEYS.players, PLAYERS);
  setSaveState(ok ? 'Saved ✓  The game updates live' : 'Could not save (browser storage full?)', ok);
}
function setSaveState(t, ok) { const el = $('savestate'); el.textContent = t; el.classList.toggle('saved', !!ok); }
const isChanged = n => !BASE.sprites[n] || JSON.stringify(SPR.sprites[n]) !== JSON.stringify(BASE.sprites[n]);

function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600); }

/* --------------------------------------------------------- top bar */
function initTabs() {
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    showTab(b.dataset.tab);
  });
}
function showTab(t) {
  W.tab = t;
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === t);
  for (const s of document.querySelectorAll('.tab-page')) s.classList.toggle('on', s.id === 'tab-' + t);
  if (t === 'cats') renderCats();
  if (t === 'players') renderPlayers();
  if (t === 'sprites') { renderThumbs(); renderAll(); }
}
function initTopbar() {
  const menu = $('export-menu');
  $('btn-export').onclick = e => { e.stopPropagation(); menu.classList.toggle('open'); };
  document.addEventListener('click', () => menu.classList.remove('open'));
  menu.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.export === 'sprites') download('sprites.json', { version: SPR.version || 1, tile: SPR.tile || 16, palette: SPR.palette, swaps: SPR.swaps, sprites: SPR.sprites });
    if (b.dataset.export === 'cats') download('cats.json', CATS, true);
    if (b.dataset.export === 'players') download('players.json', PLAYERS, true);
    if (b.dataset.reset === 'all' && confirm('Discard ALL workshop changes (sprites, palette, cats, players) and go back to the defaults?')) {
      writeLS(OVERRIDE_KEYS.sprites, null); writeLS(OVERRIDE_KEYS.cats, null); writeLS(OVERRIDE_KEYS.players, null); location.reload();
    }
  });
  $('btn-import').onclick = () => $('file-input').click();
  $('file-input').onchange = async e => {
    for (const f of e.target.files) {
      try {
        const obj = JSON.parse(await f.text());
        if (obj.sprites && obj.palette) { SPR.palette = obj.palette; SPR.swaps = obj.swaps || SPR.swaps; SPR.sprites = obj.sprites; resetSpriteCache(); save('sprites'); toast(`Imported sprites from ${f.name}`); }
        else if (Array.isArray(obj.cats)) { CATS = obj; save('cats'); toast(`Imported cats from ${f.name}`); }
        else if (Array.isArray(obj.players)) { PLAYERS = obj; save('players'); toast(`Imported players from ${f.name}`); }
        else toast(`${f.name} doesn't look like a game data file`);
      } catch (err) { toast(`Couldn't read ${f.name}: ${err.message}`); }
    }
    e.target.value = '';
    W.cat = 0; buildCategories(); renderThumbs(); if (!SPR.sprites[W.name]) W.name = Object.keys(SPR.sprites)[0]; selectSprite(W.name); renderCats(); renderPlayers();
  };
}
function download(name, obj, pretty) {
  const text = name === 'sprites.json' ? spritesJSON(obj) : JSON.stringify(obj, null, pretty ? 2 : 0) + '\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Downloaded ${name}. Put it in the repo's data/ folder to make it the default.`);
}
// one sprite per line keeps git diffs readable
function spritesJSON(o) {
  const lines = Object.entries(o.sprites).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n  "version": ${o.version},\n  "tile": ${o.tile},\n  "palette": ${JSON.stringify(o.palette)},\n  "swaps": ${JSON.stringify(o.swaps)},\n  "sprites": {\n${lines.join(',\n')}\n  }\n}\n`;
}

/* ===================================================== SPRITE EDITOR */
const def = () => SPR.sprites[W.name];
function ensureOwn() { // edits never touch the pristine base copy
  if (SPR.sprites[W.name] === BASE.sprites[W.name]) SPR.sprites[W.name] = clone(BASE.sprites[W.name]);
}
function gridOf(d, f) { return d.frames[f].map(r => r.padEnd(d.w, '.').slice(0, d.w).split('')); }
function writeGrid(g) { ensureOwn(); def().frames[W.frame] = g.map(r => r.join('')); }

function initSprites() {
  buildCategories();
  $('search').oninput = e => { W.filter.q = e.target.value.trim().toLowerCase(); renderThumbs(); };
  $('category').onchange = e => { W.filter.cat = e.target.value; renderThumbs(); };
  $('only-changed').onchange = e => { W.filter.changed = e.target.checked; renderThumbs(); };
  $('toolbar').addEventListener('click', e => { const b = e.target.closest('button[data-tool]'); if (b) setTool(b.dataset.tool); });
  $('btn-mirror').onclick = () => { W.mirror = !W.mirror; $('btn-mirror').classList.toggle('on', W.mirror); };
  $('btn-onion').onclick = () => { W.onion = !W.onion; $('btn-onion').classList.toggle('on', W.onion); drawEditor(); };
  $('btn-grid').onclick = () => { W.grid = !W.grid; $('btn-grid').classList.toggle('on', W.grid); drawEditor(); };
  $('btn-undo').onclick = undo; $('btn-redo').onclick = redo;
  $('btn-zoom-in').onclick = () => setZoom(W.zoom + (W.zoom >= 16 ? 4 : 2));
  $('btn-zoom-out').onclick = () => setZoom(W.zoom - (W.zoom > 16 ? 4 : 2));
  $('btn-flip').onclick = () => flip(true);
  $('btn-flip-v').onclick = () => flip(false);
  $('btn-shift').onclick = () => toast('Hold Shift and press the arrow keys to nudge the selection (or the whole frame)');
  $('btn-resize').onclick = () => { const p = $('resize-panel'); p.hidden = !p.hidden; $('rs-w').value = def().w; $('rs-h').value = def().h; };
  $('rs-cancel').onclick = () => { $('resize-panel').hidden = true; };
  $('rs-apply').onclick = () => { const [ax, ay] = $('rs-anchor').value.split(',').map(Number); resizeSprite(+$('rs-w').value, +$('rs-h').value, ax, ay); $('resize-panel').hidden = true; };
  $('btn-add-colour').onclick = addColour;
  $('fps').onchange = e => { pushUndo(); ensureOwn(); def().fps = Math.max(0, Math.min(30, +e.target.value || 0)); committed(); };
  $('btn-reset-sprite').onclick = resetSprite;
  $('btn-frame-add').onclick = () => frameOp('add');
  $('btn-frame-dup').onclick = () => frameOp('dup');
  $('btn-frame-del').onclick = () => frameOp('del');
  $('btn-frame-left').onclick = () => frameOp('left');
  $('btn-frame-right').onclick = () => frameOp('right');
  initCanvas();
  initPalette();
  document.addEventListener('keydown', onKey);
}
function buildCategories() {
  const cats = [...new Set(Object.values(SPR.sprites).map(s => s.cat || 'other'))].sort();
  $('category').innerHTML = `<option value="all">All categories</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  $('category').value = cats.includes(W.filter.cat) ? W.filter.cat : 'all';
}
function setTool(t) { if (t !== 'select') dropFloat(); W.tool = t; $('edit-canvas').classList.toggle('select-tool', t === 'select'); for (const b of $('toolbar').querySelectorAll('button[data-tool]')) b.classList.toggle('on', b.dataset.tool === t); }
function setZoom(z) { W.zoom = Math.max(4, Math.min(40, z)); $('zoom-label').textContent = `${W.zoom}×`; drawEditor(); }

function renderThumbs() {
  const box = $('thumbs'); box.innerHTML = '';
  const { q, cat, changed } = W.filter;
  for (const [n, d] of Object.entries(SPR.sprites)) {
    if (cat !== 'all' && (d.cat || 'other') !== cat) continue;
    if (q && !n.toLowerCase().includes(q)) continue;
    if (changed && !isChanged(n)) continue;
    const el = document.createElement('div');
    el.className = 'thumb' + (n === W.name ? ' sel' : '') + (isChanged(n) ? ' changed' : '');
    el.dataset.name = n; el.title = n;
    const c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
    c.getContext('2d').drawImage(frameCanvas(n, 0, previewSwap(n).swap, previewSwap(n).key), 0, 0);
    el.append(c, Object.assign(document.createElement('span'), { textContent: n }));
    el.onclick = () => selectSprite(n);
    box.appendChild(el);
  }
}
function refreshThumb(n) {
  const el = $('thumbs').querySelector(`.thumb[data-name="${CSS.escape(n)}"]`);
  if (!el) return;
  const c = el.querySelector('canvas'), d = SPR.sprites[n];
  c.width = d.w; c.height = d.h;
  c.getContext('2d').drawImage(frameCanvas(n, 0, previewSwap(n).swap, previewSwap(n).key), 0, 0);
  el.classList.toggle('changed', isChanged(n));
}
function selectSprite(n) {
  if (!SPR.sprites[n]) return;
  dropFloat(); W.sel = null; $('resize-panel').hidden = true;
  W.name = n; W.frame = 0;
  for (const el of $('thumbs').querySelectorAll('.thumb')) el.classList.toggle('sel', el.dataset.name === n);
  const d = def();
  W.zoom = Math.max(6, Math.min(24, Math.floor(420 / Math.max(d.w, d.h))));
  $('zoom-label').textContent = `${W.zoom}×`;
  renderAll();
}
function renderAll() {
  const d = def(); if (!d) return;
  $('sprite-name').textContent = W.name;
  $('sprite-meta').textContent = `${d.w}×${d.h} px · ${d.frames.length} frame${d.frames.length > 1 ? 's' : ''} · ${d.cat || 'other'}${isChanged(W.name) ? ' · edited' : ''}`;
  $('fps').value = d.fps || 0;
  $('btn-reset-sprite').textContent = BASE.sprites[W.name] ? 'Reset sprite' : 'Delete sprite';
  $('btn-reset-sprite').disabled = !isChanged(W.name);
  drawEditor(); renderFrames(); renderSwapRow(); renderStages(); updateUndoButtons(); renderPalette();
}

/* ---- drawing helpers */
let palRGB = [];
function updatePalRGB() { palRGB = SPR.palette.map(hexToRgb); }
// The palette for the selected sprite: its own colours (imported art) or the shared game palette.
const activePal = () => def()?.pal || SPR.palette;
function colorOf(ch, swap, pal = activePal()) {
  const i = CH.indexOf(ch); if (i < 0) return null;
  if (swap && swap[i] && pal === SPR.palette) return swap[i];
  return pal[i];
}
function paintGrid(ctx, g, s, swap, alpha = 1, pal = activePal(), ox = 0, oy = 0) {
  ctx.globalAlpha = alpha;
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
    const c = colorOf(g[y][x], swap, pal); if (!c) continue;
    ctx.fillStyle = c; ctx.fillRect((x + ox) * s, (y + oy) * s, s, s);
  }
  ctx.globalAlpha = 1;
}

/* ---- editor canvas */
let drag = null, preview = null;
function initCanvas() {
  const c = $('edit-canvas');
  c.addEventListener('contextmenu', e => e.preventDefault());
  c.addEventListener('pointerdown', e => {
    c.setPointerCapture(e.pointerId);
    const p = cell(e), ch = e.button === 2 ? W.right : W.left;
    if (!p) return;
    if (e.altKey || W.tool === 'picker') { pick(p, e.button === 2); return; }
    if (W.tool === 'select') { selectDown(p); return; }
    pushUndo();
    const g = gridOf(def(), W.frame);
    drag = { g, ch: W.tool === 'eraser' ? '.' : ch, start: p, last: p };
    if (W.tool === 'pencil' || W.tool === 'eraser') { plot(g, p.x, p.y, drag.ch); drawEditor(g); }
    if (W.tool === 'fill') { flood(g, p.x, p.y, drag.ch); writeGrid(g); drag = null; committed(); }
  });
  c.addEventListener('pointermove', e => {
    const p = cell(e);
    if (W.tool === 'select' && (selDrag || W.float?.moving)) { if (p) selectMove(p); return; }
    if (!drag || !p) { hover = p; drawEditor(); return; }
    if (W.tool === 'pencil' || W.tool === 'eraser') { line(drag.last, p, (x, y) => plot(drag.g, x, y, drag.ch)); drag.last = p; drawEditor(drag.g); }
    if (W.tool === 'line' || W.tool === 'rect') { preview = drag.g.map(r => [...r]); shape(preview, drag.start, p, drag.ch); drawEditor(preview); }
  });
  const up = e => {
    if (W.tool === 'select') { selectUp(cell(e)); return; }
    if (!drag) return;
    const p = cell(e) || drag.last;
    if (W.tool === 'line' || W.tool === 'rect') shape(drag.g, drag.start, p, drag.ch);
    writeGrid(drag.g); drag = null; preview = null; committed();
  };
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
  c.addEventListener('pointerleave', () => { hover = null; if (!drag) drawEditor(); });
  c.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(W.zoom + (e.deltaY < 0 ? 2 : -2)); } }, { passive: false });
}
let hover = null;
function cell(e) {
  const c = $('edit-canvas'), r = c.getBoundingClientRect(), d = def();
  const x = Math.floor((e.clientX - r.left) / r.width * d.w), y = Math.floor((e.clientY - r.top) / r.height * d.h);
  return x >= 0 && y >= 0 && x < d.w && y < d.h ? { x, y } : null;
}
// Inside the selection (if there is one), pixels outside it are protected.
const inSel = (x, y) => !W.sel || (x >= W.sel.x && y >= W.sel.y && x < W.sel.x + W.sel.w && y < W.sel.y + W.sel.h);
function plot(g, x, y, ch) {
  if (g[y] && x >= 0 && x < g[y].length && inSel(x, y)) g[y][x] = ch;
  if (W.mirror) {
    // mirror across the middle of the selection, or of the whole sprite
    const mx = W.sel ? W.sel.x * 2 + W.sel.w - 1 - x : g[0].length - 1 - x;
    if (g[y] && mx >= 0 && mx < g[y].length && inSel(mx, y)) g[y][mx] = ch;
  }
}
function line(a, b, fn) {
  let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) { fn(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}
function shape(g, a, b, ch) {
  if (W.tool === 'line') line(a, b, (x, y) => plot(g, x, y, ch));
  else { const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y); for (let x = x0; x <= x1; x++) { plot(g, x, y0, ch); plot(g, x, y1, ch); } for (let y = y0; y <= y1; y++) { plot(g, x0, y, ch); plot(g, x1, y, ch); } }
}
function flood(g, x, y, ch) {
  const target = g[y][x]; if (target === ch) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cy < 0 || cy >= g.length || cx < 0 || cx >= g[0].length || g[cy][cx] !== target || !inSel(cx, cy)) continue;
    g[cy][cx] = ch;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}
function pick(p, right) {
  const ch = gridOf(def(), W.frame)[p.y][p.x];
  if (right) W.right = ch; else W.left = ch;
  renderPalette();
}
function drawEditor(g) {
  const d = def(); if (!d) return;
  const c = $('edit-canvas'), s = W.zoom;
  c.width = d.w * s; c.height = d.h * s;
  const ctx = c.getContext('2d');
  // checkerboard
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) { ctx.fillStyle = (x + y) % 2 ? '#3a3046' : '#2f2639'; ctx.fillRect(x * s, y * s, s, s); }
  if (W.onion && d.frames.length > 1) paintGrid(ctx, gridOf(d, (W.frame + d.frames.length - 1) % d.frames.length), s, null, 0.28);
  paintGrid(ctx, g || gridOf(d, W.frame), s, null);
  if (W.grid && s >= 6) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 1; x < d.w; x++) { ctx.moveTo(x * s + 0.5, 0); ctx.lineTo(x * s + 0.5, d.h * s); }
    for (let y = 1; y < d.h; y++) { ctx.moveTo(0, y * s + 0.5); ctx.lineTo(d.w * s, y * s + 0.5); }
    ctx.stroke();
    if (d.w > 16 || d.h > 16) { ctx.strokeStyle = 'rgba(247,205,93,0.25)'; ctx.beginPath(); for (let x = 16; x < d.w; x += 16) { ctx.moveTo(x * s + 0.5, 0); ctx.lineTo(x * s + 0.5, d.h * s); } for (let y = 16; y < d.h; y += 16) { ctx.moveTo(0, y * s + 0.5); ctx.lineTo(d.w * s, y * s + 0.5); } ctx.stroke(); }
  }
  if (W.float) paintGrid(ctx, W.float.px.map(r => r.map(c => c)), s, null, 1, activePal(), W.float.x, W.float.y);
  if (W.sel) {
    const r = W.float ? { x: W.float.x, y: W.float.y, w: W.sel.w, h: W.sel.h } : W.sel;
    ctx.save(); ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -(performance.now() / 60) % 10;
    ctx.strokeStyle = '#fffaf0'; ctx.strokeRect(r.x * s + 1, r.y * s + 1, r.w * s - 2, r.h * s - 2);
    ctx.strokeStyle = '#1a1423'; ctx.lineDashOffset += 5; ctx.strokeRect(r.x * s + 1, r.y * s + 1, r.w * s - 2, r.h * s - 2);
    ctx.restore();
  }
  if (hover && !drag) { ctx.strokeStyle = 'rgba(247,205,93,0.9)'; ctx.strokeRect(hover.x * s + 0.5, hover.y * s + 0.5, s - 1, s - 1); if (W.mirror) { const mx = W.sel ? W.sel.x * 2 + W.sel.w - 1 - hover.x : d.w - 1 - hover.x; ctx.strokeRect(mx * s + 0.5, hover.y * s + 0.5, s - 1, s - 1); } }
}

/* ---- commit / undo */
function hist() { return (W.history[W.name] ||= { undo: [], redo: [] }); }
function snapshot() { const d = def(); return JSON.stringify({ frames: d.frames, fps: d.fps }); }
function pushUndo() { const h = hist(); h.undo.push(snapshot()); if (h.undo.length > 100) h.undo.shift(); h.redo.length = 0; updateUndoButtons(); }
function restore(s) { ensureOwn(); const o = JSON.parse(s); def().frames = o.frames; def().fps = o.fps; W.frame = Math.min(W.frame, def().frames.length - 1); committed(); }
function undo() { const h = hist(); if (!h.undo.length) return; h.redo.push(snapshot()); restore(h.undo.pop()); }
function redo() { const h = hist(); if (!h.redo.length) return; h.undo.push(snapshot()); restore(h.redo.pop()); }
function updateUndoButtons() { const h = hist(); $('btn-undo').disabled = !h.undo.length; $('btn-redo').disabled = !h.redo.length; }
function committed() {
  resetSpriteCache();
  refreshThumb(W.name);
  renderAll();
  scheduleSave('sprites');
}
function resetSprite() {
  const n = W.name;
  if (BASE.sprites[n]) { if (!confirm(`Reset "${n}" to the default art?`)) return; pushUndo(); SPR.sprites[n] = clone(BASE.sprites[n]); committed(); }
  else { if (!confirm(`Delete the custom sprite "${n}"?`)) return; delete SPR.sprites[n]; resetSpriteCache(); renderThumbs(); selectSprite(Object.keys(SPR.sprites)[0]); scheduleSave('sprites'); }
}
function frameOp(op) {
  const d = def(); pushUndo(); ensureOwn();
  const f = def().frames, i = W.frame;
  if (op === 'add') { f.splice(i + 1, 0, Array.from({ length: d.h }, () => '.'.repeat(d.w))); W.frame = i + 1; }
  if (op === 'dup') { f.splice(i + 1, 0, [...f[i]]); W.frame = i + 1; }
  if (op === 'del') { if (f.length <= 1) { toast('A sprite needs at least one frame'); hist().undo.pop(); return; } f.splice(i, 1); W.frame = Math.max(0, i - 1); }
  if (op === 'left' && i > 0) { [f[i - 1], f[i]] = [f[i], f[i - 1]]; W.frame = i - 1; }
  if (op === 'right' && i < f.length - 1) { [f[i + 1], f[i]] = [f[i], f[i + 1]]; W.frame = i + 1; }
  committed();
}
function nudge(dx, dy) {
  if (W.sel) { moveSelectionBy(dx, dy); return; }
  const d = def(), g = gridOf(d, W.frame);
  const out = Array.from({ length: d.h }, (_, y) => Array.from({ length: d.w }, (_, x) => g[y - dy]?.[x - dx] ?? '.'));
  pushUndo(); writeGrid(out); committed();
}
function renderFrames() {
  const d = def(), box = $('frame-strip'); box.innerHTML = '';
  d.frames.forEach((_, i) => {
    const c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
    paintGrid(c.getContext('2d'), gridOf(d, i), 1, null);
    if (i === W.frame) c.classList.add('sel');
    c.title = `Frame ${i + 1}`;
    c.onclick = () => { dropFloat(); W.frame = i; renderAll(); };
    box.appendChild(c);
  });
}

/* ---- selection: select, move, flip, copy/paste, delete */
let selDrag = null;
function regionOf(g, r) { return Array.from({ length: r.h }, (_, y) => Array.from({ length: r.w }, (_, x) => g[r.y + y]?.[r.x + x] ?? '.')); }
function stamp(g, px, x0, y0, transparentOnly = false) {
  px.forEach((row, y) => row.forEach((c, x) => { if (transparentOnly && c === '.') return; if (g[y0 + y] && x0 + x >= 0 && x0 + x < g[0].length) g[y0 + y][x0 + x] = c; }));
}
function selectDown(p) {
  dropFloat();
  if (W.sel && p.x >= W.sel.x && p.y >= W.sel.y && p.x < W.sel.x + W.sel.w && p.y < W.sel.y + W.sel.h) {
    // pick up the selected pixels so they can be dragged somewhere else
    pushUndo();
    const g = gridOf(def(), W.frame), px = regionOf(g, W.sel);
    for (let y = 0; y < W.sel.h; y++) for (let x = 0; x < W.sel.w; x++) if (g[W.sel.y + y]) g[W.sel.y + y][W.sel.x + x] = '.';
    writeGrid(g);
    W.float = { px, x: W.sel.x, y: W.sel.y, grab: { x: p.x - W.sel.x, y: p.y - W.sel.y }, moving: true };
    drawEditor(); return;
  }
  selDrag = { a: p, b: p };
  W.sel = { x: p.x, y: p.y, w: 1, h: 1 };
  drawEditor();
}
function selectMove(p) {
  if (W.float?.moving) { W.float.x = p.x - W.float.grab.x; W.float.y = p.y - W.float.grab.y; drawEditor(); return; }
  if (selDrag) { selDrag.b = p; const a = selDrag.a; W.sel = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(a.x - p.x) + 1, h: Math.abs(a.y - p.y) + 1 }; drawEditor(); }
}
function selectUp() {
  if (W.float?.moving) { dropFloat(); return; }
  if (selDrag && selDrag.a.x === selDrag.b.x && selDrag.a.y === selDrag.b.y) W.sel = null; // a click without dragging clears it
  selDrag = null; drawEditor();
}
// Put floating (moved or pasted) pixels down where they are.
function dropFloat() {
  if (!W.float || !def()) { W.float = null; return; }
  const f = W.float; W.float = null;
  const g = gridOf(def(), W.frame);
  stamp(g, f.px, f.x, f.y, true);
  writeGrid(g);
  W.sel = clampRect({ x: f.x, y: f.y, w: f.px[0].length, h: f.px.length });
  committed();
}
function clampRect(r) {
  const d = def(), x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(d.w, r.x + r.w), y1 = Math.min(d.h, r.y + r.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
function moveSelectionBy(dx, dy) {
  if (!W.float) { // lift the pixels
    pushUndo();
    const g = gridOf(def(), W.frame), px = regionOf(g, W.sel);
    for (let y = 0; y < W.sel.h; y++) for (let x = 0; x < W.sel.w; x++) if (g[W.sel.y + y]) g[W.sel.y + y][W.sel.x + x] = '.';
    writeGrid(g);
    W.float = { px, x: W.sel.x, y: W.sel.y };
  }
  W.float.x += dx; W.float.y += dy;
  W.sel = { ...W.sel, x: W.float.x, y: W.float.y };
  drawEditor();
  clearTimeout(moveSelectionBy._t); moveSelectionBy._t = setTimeout(dropFloat, 700);
}
const framesToEdit = () => ($('all-frames').checked ? def().frames.map((_, i) => i) : [W.frame]);
function flip(horizontal) {
  dropFloat(); pushUndo(); ensureOwn();
  const d = def(), r = W.sel || { x: 0, y: 0, w: d.w, h: d.h };
  for (const f of framesToEdit()) {
    const g = gridOf(d, f), px = regionOf(g, r);
    const out = horizontal ? px.map(row => [...row].reverse()) : [...px].reverse();
    stamp(g, out, r.x, r.y);
    d.frames[f] = g.map(row => row.join(''));
  }
  committed();
}
function clearSel() {
  dropFloat(); pushUndo(); ensureOwn();
  const d = def(), r = W.sel;
  for (const f of framesToEdit()) { const g = gridOf(d, f); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (g[r.y + y]) g[r.y + y][r.x + x] = '.'; d.frames[f] = g.map(row => row.join('')); }
  committed();
}
function copySel() { dropFloat(); W.clip = { px: regionOf(gridOf(def(), W.frame), W.sel), x: W.sel.x, y: W.sel.y, pal: activePal() === SPR.palette ? null : W.name }; toast('Copied. Switch frame or sprite and press Ctrl+V'); }
function pasteClip() {
  if (!W.clip) { toast('Select something and press Ctrl+C first'); return; }
  dropFloat(); pushUndo();
  const px = W.clip.px.map(r => [...r]);
  W.float = { px, x: Math.min(W.clip.x, def().w - 1), y: Math.min(W.clip.y, def().h - 1) };
  W.sel = { x: W.float.x, y: W.float.y, w: px[0].length, h: px.length };
  setTool('select'); W.float.moving = false;
  drawEditor();
  toast('Pasted. Drag it with Select, or nudge with Shift+arrows. It sets down when you click elsewhere');
}

/* ---- canvas size */
function resizeSprite(nw, nh, ax, ay) {
  nw = Math.max(1, Math.min(128, Math.round(nw) || 1)); nh = Math.max(1, Math.min(128, Math.round(nh) || 1));
  const d = def();
  if (nw === d.w && nh === d.h) return;
  dropFloat(); W.sel = null; pushUndo(); ensureOwn();
  const dd = def(), dx = Math.round((nw - dd.w) * ax), dy = Math.round((nh - dd.h) * ay);
  dd.frames = dd.frames.map((_, f) => {
    const g = gridOf(dd, f);
    return Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) => g[y - dy]?.[x - dx] ?? '.').join(''));
  });
  if (dd.ax != null) dd.ax += dx;
  if (dd.ay != null) dd.ay += dy;
  dd.w = nw; dd.h = nh;
  W.zoom = Math.max(6, Math.min(24, Math.floor(420 / Math.max(nw, nh))));
  committed();
  toast(`Canvas is now ${nw}×${nh}`);
}

/* ---- add a colour */
function addColour() {
  const own = !!def()?.pal, pal = activePal();
  if (pal.length >= CH.length) { toast(`A palette can hold up to ${CH.length} colours`); return; }
  if (!own && !confirm('This sprite uses the shared game palette, so the new colour will be available to every sprite. Add it?')) return;
  if (own) { ensureOwn(); def().pal.push('#ffffff'); } else SPR.palette.push('#ffffff');
  const i = activePal().length - 1;
  W.left = CH[i];
  updatePalRGB(); resetSpriteCache(); renderPalette(); scheduleSave('sprites');
  const inp = $('color-input'); inp.dataset.i = i; inp.value = '#ffffff'; inp.click();
}

/* ---- palette */
function initPalette() {
  updatePalRGB();
  renderPalette();
  const inp = $('color-input');
  inp.addEventListener('input', () => {
    const i = +inp.dataset.i;
    if (def()?.pal) { ensureOwn(); def().pal[i] = inp.value; } else SPR.palette[i] = inp.value;
    updatePalRGB();
    resetSpriteCache(); renderPalette(); drawEditor(); renderFrames(); renderStages();
    clearTimeout(inp._t); inp._t = setTimeout(() => { renderThumbs(); scheduleSave('sprites'); }, 200);
  });
}
function renderPalette() {
  const box = $('palette'); box.innerHTML = '';
  const mk = (ch, color) => {
    const s = document.createElement('span');
    s.className = 'swatch' + (ch === '.' ? ' transparent' : '') + (W.left === ch ? ' left' : '') + (W.right === ch ? ' right' : '');
    if (color) s.style.background = color;
    s.title = ch === '.' ? 'Transparent' : `Colour ${CH.indexOf(ch)} ${color}`;
    s.onclick = () => { W.left = ch; renderPalette(); };
    s.oncontextmenu = e => { e.preventDefault(); W.right = ch; renderPalette(); };
    s.ondblclick = () => { if (ch === '.') return; const inp = $('color-input'); inp.dataset.i = CH.indexOf(ch); inp.value = activePal()[CH.indexOf(ch)]; inp.click(); };
    box.appendChild(s);
  };
  activePal().forEach((c, i) => mk(CH[i], c));
  mk('.', null);
  const hint = document.querySelector('#palette + .hint');
  if (hint) hint.textContent = def()?.pal ? 'This sprite has its own colours (imported art). Double-click a colour to change it for this sprite only.' : 'Click to choose a colour. Double-click to recolour it everywhere in the game.';
  const setBig = (id, ch) => { const el = $(id); el.className = 'swatch big' + (ch === '.' ? ' transparent' : ''); el.style.background = ch === '.' ? '' : activePal()[CH.indexOf(ch)]; };
  setBig('c-left', W.left); setBig('c-right', W.right);
}

/* ---- keyboard */
function onKey(e) {
  if (W.tab !== 'sprites' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c') { if (W.sel) { e.preventDefault(); copySel(); } return; }
  if ((e.ctrlKey || e.metaKey) && k === 'v') { e.preventDefault(); pasteClip(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); dropFloat(); W.sel = { x: 0, y: 0, w: def().w, h: def().h }; setTool('select'); drawEditor(); return; }
  if (k === 'escape') { dropFloat(); W.sel = null; drawEditor(); return; }
  if ((k === 'delete' || k === 'backspace') && W.sel) { e.preventDefault(); clearSel(); return; }
  if (e.shiftKey && k.startsWith('arrow')) { e.preventDefault(); nudge(k === 'arrowleft' ? -1 : k === 'arrowright' ? 1 : 0, k === 'arrowup' ? -1 : k === 'arrowdown' ? 1 : 0); return; }
  const tools = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker', l: 'line', r: 'rect', s: 'select' };
  if (tools[k]) setTool(tools[k]);
  if (k === 'm') $('btn-mirror').click();
  if (k === 'o') $('btn-onion').click();
  if (k === '#') $('btn-grid').click();
  if (k === '+' || k === '=') setZoom(W.zoom + 2);
  if (k === '-') setZoom(W.zoom - 2);
  if (k === '[' || k === ']') { dropFloat(); const n = def().frames.length; W.frame = (W.frame + (k === ']' ? 1 : n - 1)) % n; renderAll(); }
}

/* ---- previews */
function previewSwap(name) {
  const d = SPR.sprites[name]; if (!d?.swaps) return { swap: null, key: '' };
  if (d.swaps.includes('cat')) { const c = CATS.cats[W.swap.cat ?? 0]; return c ? slotSwap('cat', c.coat) : { swap: null, key: '' }; }
  if (d.swaps.includes('player')) { const set = name.split('_')[0]; const p = PLAYERS.players.find(q => q.spriteSet === set) || PLAYERS.players[0]; return slotSwap('player', p?.colors); }
  if (d.swaps.includes('roof')) { const a = optionSwap('roof', W.swap.roof || 'red'), b = optionSwap('wall', W.swap.wall || 'oak'); return { swap: { ...a.swap, ...b.swap }, key: a.key + b.key }; }
  return { swap: null, key: '' };
}
function renderSwapRow() {
  const d = def(), row = $('swap-row'); row.innerHTML = '';
  $('preview-note').textContent = '';
  if (!d.swaps) return;
  if (d.swaps.includes('cat')) {
    row.innerHTML = `<label>Shown with <select id="sw-cat">${CATS.cats.map((c, i) => `<option value="${i}" ${i === (W.swap.cat ?? 0) ? 'selected' : ''}>${esc(c.name)}'s coat</option>`).join('')}</select></label>`;
    $('sw-cat').onchange = e => { W.swap.cat = +e.target.value; renderThumbs(); renderAll(); };
    $('preview-note').textContent = 'coat colours are set per cat';
  } else if (d.swaps.includes('player')) {
    $('preview-note').textContent = 'outfit colours are set in the Players tab';
  } else if (d.swaps.includes('roof')) {
    const opt = k => Object.keys(SPR.swaps[k].options).map(o => `<option ${o === (W.swap[k] || '') ? 'selected' : ''}>${o}</option>`).join('');
    row.innerHTML = `<label>Roof <select id="sw-roof">${opt('roof')}</select></label><label>Walls <select id="sw-wall">${opt('wall')}</select></label>`;
    $('sw-roof').value = W.swap.roof || 'red'; $('sw-wall').value = W.swap.wall || 'oak';
    $('sw-roof').onchange = e => { W.swap.roof = e.target.value; refreshThumb(W.name); };
    $('sw-wall').onchange = e => { W.swap.wall = e.target.value; refreshThumb(W.name); };
  }
}
function renderStages() {
  const d = def(), box = $('stages'); box.innerHTML = '';
  if (!d.crop) return;
  const id = d.crop;
  for (const [n, f] of [[`crop_${id}`, 0], [`crop_${id}`, 1], [`crop_${id}`, 2], [`crop_${id}`, 3], [`item_${id}`, 0], [`seed_${id}`, 0]]) {
    if (!SPR.sprites[n]) continue;
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    if (n.startsWith('crop_')) ctx.drawImage(frameCanvas('soil', 0), 0, 0);
    ctx.drawImage(frameCanvas(n, f), 0, 0);
    c.title = n.startsWith('crop_') ? `Stage ${f + 1}` : n;
    c.style.cursor = 'pointer';
    c.onclick = () => { selectSprite(n); if (n.startsWith('crop_')) { W.frame = f; renderAll(); } };
    box.appendChild(c);
  }
}

/* ---- animation loop for all previews */
let animT = 0, lastT = performance.now();
const anims = [];
function animLoop(now) {
  requestAnimationFrame(animLoop);
  animT += (now - lastT) / 1000; lastT = now;
  if (W.tab === 'sprites' && def()) drawSpritePreviews();
  if (W.tab === 'sprites' && W.sel && !drag && !selDrag && Math.floor(now / 120) !== animLoop._t) { animLoop._t = Math.floor(now / 120); drawEditor(); }
  for (const a of anims) if (a.c.isConnected) a.draw(animT);
}
function frameAt(d, t) { return d.fps && d.frames.length > 1 ? Math.floor(t * d.fps) % d.frames.length : W.frame; }
function drawSpritePreviews() {
  const d = def(), sw = previewSwap(W.name);
  const f = drag ? W.frame : frameAt(d, animT);
  const tv = $('preview-tv'), one = $('preview-1x');
  const S = d.w > 24 ? 2 : 4;
  tv.width = d.w * S; tv.height = d.h * S; one.width = d.w; one.height = d.h;
  const g = drag ? (preview || drag.g) : null;
  for (const [cv, s] of [[tv, S], [one, 1]]) {
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    if (g && f === W.frame) paintGrid(ctx, g, s, sw.swap); else { ctx.imageSmoothingEnabled = false; ctx.drawImage(frameCanvas(W.name, f, sw.swap, sw.key), 0, 0, d.w * s, d.h * s); }
  }
  // in-context scene: a patch of garden at TV scale
  const cx = $('preview-context'), T = 16, cols = 9, rows = 5, sc = 2;
  cx.width = cols * T * sc; cx.height = rows * T * sc;
  const ctx = cx.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.save(); ctx.scale(sc, sc);
  const isGround = ['tiles'].includes(d.cat) && d.w === 16 && d.h === 16;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const inPatch = isGround && x >= 3 && x <= 5 && y >= 1 && y <= 3;
    ctx.drawImage(inPatch ? frameCanvas(W.name, f, sw.swap, sw.key) : frameCanvas(`grass_${(x * 7 + y * 3) % 12}`, 0), x * T, y * T);
  }
  if (d.crop) for (let x = 2; x <= 6; x++) ctx.drawImage(frameCanvas('soil', 0), x * T, 2 * T);
  if (!isGround) {
    const px = Math.floor((cols * T - d.w) / 2), py = 3 * T - d.h;
    if (d.crop && W.name.startsWith('crop_')) for (let k = 0; k < 4; k++) ctx.drawImage(frameCanvas(W.name, k), (2 + k) * T, 2 * T - 2);
    else ctx.drawImage(frameCanvas(W.name, f, sw.swap, sw.key), px, py + (d.h > 32 ? 16 : 0));
  }
  // scale references: a player and a cat
  const p = PLAYERS.players[0], c = CATS.cats[0];
  if (p) { const s = slotSwap('player', p.colors), pd = SPR.sprites[`${p.spriteSet}_walk_down`]; ctx.drawImage(frameCanvas(`${p.spriteSet}_walk_down`, 0, s.swap, s.key), 1 * T + 8 - (pd?.ax ?? 8), 4 * T + 8 - (pd?.ay ?? 23)); }
  if (c) { const s = slotSwap('cat', c.coat); ctx.drawImage(frameCanvas(`${SPR.sprites[`${c.spriteSet}_sit`] ? c.spriteSet : 'cat'}_sit`, frameAt(SPR.sprites.cat_sit, animT), s.swap, s.key), 7 * T, 4 * T - 16 + 8); }
  ctx.restore();
}

/* ============================================================= CATS */
const JOB_NAMES = { clear: 'Clearing', till: 'Tilling', plant: 'Planting', water: 'Watering', fish: 'Fishing' };
const COAT_SLOTS = [['coat', 'Coat'], ['shade', 'Shading'], ['marking', 'Markings'], ['belly', 'Belly & paws'], ['eye', 'Eyes']];
const PRESETS = {
  'Orange tabby': { coat: '#f29b4b', shade: '#e5735a', marking: '#b8434a', belly: '#f6e7c8', eye: '#8cc65a' },
  'Tuxedo': { coat: '#1a1423', shade: '#3b2a3a', marking: '#1a1423', belly: '#fffaf0', eye: '#f7cd5d' },
  'Grey': { coat: '#b3aeb0', shade: '#7d7a80', marking: '#7d7a80', belly: '#fffaf0', eye: '#7fb3d5' },
  'Black': { coat: '#2b2433', shade: '#1a1423', marking: '#2b2433', belly: '#2b2433', eye: '#f7cd5d' },
  'White': { coat: '#fffaf0', shade: '#dcd6cf', marking: '#fffaf0', belly: '#fffaf0', eye: '#7fb3d5' },
  'Brown tabby': { coat: '#b98352', shade: '#8a5a3b', marking: '#5e3b2e', belly: '#e0b98a', eye: '#8cc65a' },
  'Siamese': { coat: '#f6e7c8', shade: '#e0b98a', marking: '#5e3b2e', belly: '#fffaf0', eye: '#4a6fa5' },
  'Calico': { coat: '#fffaf0', shade: '#dcd6cf', marking: '#f29b4b', belly: '#fffaf0', eye: '#8cc65a' },
};
const TRAITS = [
  ['energy', 'Stamina', 0.3, 2, 'How long they work before needing a nap'],
  ['napFrequency', 'Naps often', 0, 3, 'How tempting a nap is'],
  ['napDuration', 'Long naps', 0.3, 3, 'How long each nap lasts'],
  ['curiosity', 'Curiosity', 0, 3, 'Wanders off to explore'],
  ['zoomies', 'Zoomies', 0, 3, 'Sudden bursts of running'],
  ['lovesPlayer', 'Loves you', 0, 3, 'Comes to hang out with you'],
];

function initCats() {
  $('btn-cat-add').onclick = () => {
    let n = CATS.cats.length + 1, id = `cat${n}`;
    while (CATS.cats.some(c => c.id === id)) id = `cat${++n}`;
    CATS.cats.push({ id, name: `Kitty ${n}`, spriteSet: 'cat', blurb: '', coat: { ...PRESETS['Brown tabby'] }, jobs: Object.fromEntries(CATS.jobTypes.map(j => [j, { speed: 1, affinity: 1 }])), traits: { ...brain.DEFAULT_TRAITS }, weaknesses: { distractible: false, hatesWater: false, refuses: [] } });
    W.cat = CATS.cats.length - 1; scheduleSave('cats'); renderCats();
  };
}
function catSets() { return [...new Set(Object.keys(SPR.sprites).filter(n => n.endsWith('_walk_side') && SPR.sprites[n].cat === 'cats').map(n => n.slice(0, -'_walk_side'.length)))]; }
function catSpriteName(cfg, kind) { const s = cfg.spriteSet || 'cat'; return SPR.sprites[`${s}_${kind}`] ? `${s}_${kind}` : `cat_${kind}`; }
function portrait(canvas, cfg) {
  const s = slotSwap('cat', cfg.coat);
  canvas.width = 16; canvas.height = 16;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 16, 16);
  ctx.drawImage(frameCanvas(catSpriteName(cfg, 'sit'), 0, s.swap, s.key), 0, 0);
}
function renderCatList() {
  const box = $('cat-list'); box.innerHTML = '';
  CATS.cats.forEach((c, i) => {
    const el = document.createElement('div'); el.className = 'entity' + (i === W.cat ? ' sel' : '');
    const cv = document.createElement('canvas'); portrait(cv, c);
    el.append(cv, Object.assign(document.createElement('div'), { innerHTML: `<b>${esc(c.name)}</b><br><small>${esc((c.blurb || '').slice(0, 40))}</small>` }));
    el.onclick = () => { W.cat = i; renderCats(); };
    box.appendChild(el);
  });
}
function slider(label, value, min, max, step, onInput, title = '') {
  const id = 'r' + Math.random().toString(36).slice(2);
  setTimeout(() => {
    const r = $(id); if (!r) return;
    r.oninput = () => { r.nextElementSibling.textContent = (+r.value).toFixed(1); onInput(+r.value); };
  });
  return `<label class="l" title="${esc(title)}">${label}</label><div class="slider"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output>${(+value).toFixed(1)}</output></div>`;
}
function renderCats() {
  anims.length = 0;
  if (W.cat >= CATS.cats.length) W.cat = 0;
  renderCatList();
  const cfg = CATS.cats[W.cat], form = $('cat-form');
  if (!cfg) { form.innerHTML = '<p>No cats! Add one on the left.</p>'; return; }
  cfg.jobs ||= {}; cfg.traits = { ...brain.DEFAULT_TRAITS, ...(cfg.traits || {}) }; cfg.weaknesses ||= { distractible: false, hatesWater: false, refuses: [] }; cfg.weaknesses.refuses ||= [];
  const changed = () => { scheduleSave('cats'); renderCatList(); };
  const sets = catSets();
  form.innerHTML = `
    <section><h3>The basics</h3>
      <div class="grid2">
        <label class="l">Name</label><input type="text" id="cat-name" value="${esc(cfg.name)}" maxlength="20">
        <label class="l">Personality</label><textarea id="cat-blurb" maxlength="200" placeholder="A few words about them...">${esc(cfg.blurb || '')}</textarea>
        <label class="l">Sprite set</label><div class="row"><select id="cat-set">${sets.map(s => `<option ${s === (cfg.spriteSet || 'cat') ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button id="cat-own-set" title="Copy the cat sprites so you can draw this cat's own markings">Give ${esc(cfg.name)} their own sprites</button>
          <button id="cat-edit-set">Edit sprites ▸</button></div>
      </div>
    </section>
    <section><h3>Coat colours</h3>
      <div class="colors">${COAT_SLOTS.map(([k, l]) => `<label><input type="color" data-slot="${k}" value="${cfg.coat?.[k] || '#888888'}">${l}</label>`).join('')}</div>
      <div class="row" style="margin-top:8px">${Object.keys(PRESETS).map(p => `<button data-preset="${p}">${p}</button>`).join('')}</div>
      <div class="anim-row" style="margin-top:10px">${['walk_side', 'walk_down', 'walk_up', 'sit', 'sleep', 'work'].map(k => `<figure><canvas data-anim="${k}"></canvas><figcaption>${k.replace('_', ' ')}</figcaption></figure>`).join('')}</div>
    </section>
    <section><h3>Jobs</h3>
      <table class="jobs-table"><tr><th>Job</th><th>Speed (how fast)</th><th>Preference (how often they pick it)</th><th>Refuses</th></tr>
      ${CATS.jobTypes.map(j => { const jc = cfg.jobs[j] ||= { speed: 1, affinity: 1 }; return `<tr><td>${JOB_NAMES[j] || j}</td>
        <td><div class="slider"><input type="range" data-job="${j}" data-k="speed" min="0.1" max="3" step="0.1" value="${jc.speed ?? 1}"><output>${(jc.speed ?? 1).toFixed(1)}×</output></div></td>
        <td><div class="slider"><input type="range" data-job="${j}" data-k="affinity" min="0" max="3" step="0.1" value="${jc.affinity ?? 1}"><output>${(jc.affinity ?? 1).toFixed(1)}</output></div></td>
        <td><input type="checkbox" data-refuse="${j}" ${cfg.weaknesses.refuses.includes(j) ? 'checked' : ''}></td></tr>`; }).join('')}
      </table>
      <p class="hint">Cats always work much slower than you. Speed 1.0 is a normal cat. Preference sets how often they choose a job when several are waiting.</p>
    </section>
    <section><h3>Personality</h3>
      <div class="grid2">
        ${TRAITS.map(([k, l, mn, mx, tip]) => slider(l, cfg.traits[k], mn, mx, 0.1, v => { cfg.traits[k] = v; changed(); }, tip)).join('')}
        <label class="l">Schedule</label><select id="cat-schedule"><option value="early">Early bird (sleeps at night, busy mornings)</option><option value="neutral">Regular</option><option value="night">Night owl (naps afternoons, busy at night)</option></select>
        <label class="l">Weaknesses</label><div class="row">
          <label class="chk"><input type="checkbox" id="w-distract" ${cfg.weaknesses.distractible ? 'checked' : ''}> Easily distracted</label>
          <label class="chk"><input type="checkbox" id="w-water" ${cfg.weaknesses.hatesWater ? 'checked' : ''}> Hates water</label></div>
      </div>
    </section>
    <section><h3>Simulate a day</h3>
      <p class="hint">Runs 24 hours with every kind of job waiting, to show how ${esc(cfg.name)} would spend the day.</p>
      <button id="cat-sim">Simulate a day</button>
      <div id="sim-out"></div>
    </section>
    <section><button id="cat-remove" class="danger" ${CATS.cats.length <= 1 ? 'disabled' : ''}>Remove ${esc(cfg.name)}</button>
      <span class="hint">Cat id: <code>${esc(cfg.id)}</code></span></section>`;
  $('cat-name').oninput = e => { cfg.name = e.target.value; changed(); };
  $('cat-blurb').oninput = e => { cfg.blurb = e.target.value; changed(); };
  $('cat-set').onchange = e => { cfg.spriteSet = e.target.value; changed(); };
  $('cat-own-set').onclick = () => {
    const from = cfg.spriteSet || 'cat', to = cfg.id.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mycat';
    if (to === from) { toast('Already using their own sprites'); return; }
    let n = 0;
    for (const k of Object.keys(SPR.sprites)) if (k.startsWith(from + '_') && SPR.sprites[k].cat === 'cats') { SPR.sprites[`${to}_${k.slice(from.length + 1)}`] = clone(SPR.sprites[k]); n++; }
    cfg.spriteSet = to; resetSpriteCache(); scheduleSave('sprites'); changed(); renderCats(); buildCategories();
    toast(`Copied ${n} sprites as "${to}_...". Edit them in the Sprites tab.`);
  };
  $('cat-edit-set').onclick = () => { W.filter.q = (cfg.spriteSet || 'cat') + '_'; $('search').value = W.filter.q; W.filter.cat = 'all'; $('category').value = 'all'; showTab('sprites'); const first = Object.keys(SPR.sprites).find(k => k.startsWith(W.filter.q)); if (first) selectSprite(first); };
  for (const inp of form.querySelectorAll('input[data-slot]')) inp.oninput = () => { cfg.coat = { ...(cfg.coat || {}), [inp.dataset.slot]: inp.value }; changed(); };
  for (const b of form.querySelectorAll('button[data-preset]')) b.onclick = () => { cfg.coat = { ...PRESETS[b.dataset.preset] }; changed(); renderCats(); };
  for (const r of form.querySelectorAll('input[data-job]')) r.oninput = () => { const jc = cfg.jobs[r.dataset.job] ||= { speed: 1, affinity: 1 }; jc[r.dataset.k] = +r.value; r.nextElementSibling.textContent = (+r.value).toFixed(1) + (r.dataset.k === 'speed' ? '×' : ''); changed(); };
  for (const c of form.querySelectorAll('input[data-refuse]')) c.onchange = () => { const s = new Set(cfg.weaknesses.refuses); c.checked ? s.add(c.dataset.refuse) : s.delete(c.dataset.refuse); cfg.weaknesses.refuses = [...s]; changed(); };
  $('cat-schedule').value = cfg.traits.schedule || 'neutral';
  $('cat-schedule').onchange = e => { cfg.traits.schedule = e.target.value; changed(); };
  $('w-distract').onchange = e => { cfg.weaknesses.distractible = e.target.checked; changed(); };
  $('w-water').onchange = e => { cfg.weaknesses.hatesWater = e.target.checked; changed(); };
  $('cat-sim').onclick = () => simulate(cfg);
  $('cat-remove').onclick = () => { if (confirm(`Remove ${cfg.name} from the garden?`)) { CATS.cats.splice(W.cat, 1); W.cat = 0; scheduleSave('cats'); renderCats(); } };
  for (const cv of form.querySelectorAll('canvas[data-anim]')) {
    const kind = cv.dataset.anim; cv.width = 16; cv.height = 16;
    anims.push({ c: cv, draw: t => {
      const n = catSpriteName(cfg, kind), d = SPR.sprites[n], s = slotSwap('cat', cfg.coat);
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 16, 16);
      ctx.drawImage(frameCanvas(n, d?.fps ? Math.floor(t * d.fps) % d.frames.length : 0, s.swap, s.key), 0, 0);
    } });
  }
}
function simulate(cfg) {
  const runs = 3, total = { time: {}, work: {}, done: {} };
  for (let r = 0; r < runs; r++) {
    const res = brain.simulateDay(cfg, DATA.balance, CATS.jobTypes);
    for (const [k, v] of Object.entries(res.time)) total.time[k] = (total.time[k] || 0) + v / runs;
    for (const [k, v] of Object.entries(res.workTime)) total.work[k] = (total.work[k] || 0) + v / runs;
    for (const [k, v] of Object.entries(res.done)) total.done[k] = (total.done[k] || 0) + v / runs;
  }
  const segs = [
    ...CATS.jobTypes.map((j, i) => [JOB_NAMES[j] || j, total.work[j] || 0, ['#f7cd5d', '#b98352', '#8cc65a', '#7fb3d5', '#e88fb0'][i % 5]]),
    ['Walking', total.time.walk, '#e0b98a'], ['Napping', total.time.nap, '#5b3a6e'], ['Exploring', total.time.wander, '#c89bd8'],
    ['Zoomies', total.time.zoomies, '#e5735a'], ['With you', total.time.visit, '#f7c6d3'], ['Sitting', total.time.sit + total.time.cabin, '#7d7a80'],
  ];
  const sum = segs.reduce((a, s) => a + (s[1] || 0), 0) || 1;
  $('sim-out').innerHTML = `<div class="simbar">${segs.map(([l, v, c]) => `<span title="${l}" style="width:${(v / sum * 100).toFixed(2)}%;background:${c}"></span>`).join('')}</div>
    <div class="legend">${segs.map(([l, v, c]) => `<span><i style="background:${c}"></i>${l} ${Math.round(v / sum * 100)}%</span>`).join('')}</div>
    <p class="hint">Jobs finished in a day: ${CATS.jobTypes.map(j => `${JOB_NAMES[j] || j} ${Math.round(total.done[j] || 0)}`).join(' · ')} (average of ${runs} simulated days)</p>`;
}

/* ========================================================== PLAYERS */
// Imported characters carry their own colours: every sprite in the set shares one palette.
function setSprites(set) { return Object.keys(SPR.sprites).filter(k => k.startsWith(set + '_') && SPR.sprites[k].pal); }
function setPalette(set) { const n = SPR.sprites[`${set}_walk_down`]?.pal ? `${set}_walk_down` : setSprites(set)[0]; return n ? SPR.sprites[n].pal : null; }
function setSetColour(set, i, hex) {
  for (const k of setSprites(set)) {
    if (SPR.sprites[k] === BASE.sprites[k]) SPR.sprites[k] = clone(BASE.sprites[k]);
    const pal = SPR.sprites[k].pal; while (pal.length <= i) pal.push('#ffffff'); pal[i] = hex;
  }
  resetSpriteCache();
  clearTimeout(setSetColour._t); setSetColour._t = setTimeout(() => { renderThumbs(); scheduleSave('sprites'); }, 250);
}
function resetSetColours(set) {
  for (const k of setSprites(set)) if (BASE.sprites[k]?.pal) { if (SPR.sprites[k] === BASE.sprites[k]) continue; SPR.sprites[k].pal = clone(BASE.sprites[k].pal); }
  resetSpriteCache(); renderThumbs(); scheduleSave('sprites');
}
const PLAYER_SLOTS = [['hair', 'Hair'], ['hairHi', 'Hair shine'], ['skin', 'Skin'], ['skinShade', 'Skin shade'], ['shirt', 'Top'], ['shirtShade', 'Top shade'], ['pants', 'Trousers'], ['accent', 'Hat / clip']];
function playerSets() { return [...new Set(Object.keys(SPR.sprites).filter(n => n.endsWith('_walk_down') && SPR.sprites[n].cat === 'player').map(n => n.slice(0, -'_walk_down'.length)))]; }
function renderPlayers() {
  if (W.tab !== 'players') return;
  anims.length = 0;
  const form = $('player-form'), sets = playerSets();
  form.innerHTML = PLAYERS.players.map((p, i) => `
    <section data-p="${i}"><h3>Player ${i + 1}</h3>
      <div class="grid2">
        <label class="l">Name</label><input type="text" data-name value="${esc(p.name)}" maxlength="16">
        <label class="l">Sprite set</label><div class="row"><select data-set>${sets.map(s => `<option ${s === p.spriteSet ? 'selected' : ''}>${s}</option>`).join('')}</select><button data-edit>Edit sprites ▸</button></div>
      </div>
      ${setPalette(p.spriteSet) ? `<h3 style="margin-top:12px">Colours <small>(all ${setPalette(p.spriteSet).length} colours in this character's sprites)</small></h3>
      <div class="colors all">${setPalette(p.spriteSet).map((c, k) => `<label title="${c}"><input type="color" data-pal="${k}" value="${c}">${k + 1}</label>`).join('')}</div>
      <div class="pal-where"><canvas data-where width="32" height="32"></canvas><span class="hint">Point at a colour to see where it's used.</span></div>
      <div class="row" style="margin-top:8px"><button data-reset-colours>Reset colours</button><span class="hint">Each colour changes every sprite in the "${esc(p.spriteSet)}" set (walking, working, sitting...).</span></div>`
      : `<h3 style="margin-top:12px">Colours</h3>
      <div class="colors">${PLAYER_SLOTS.map(([k, l]) => `<label><input type="color" data-slot="${k}" value="${p.colors?.[k] || '#888888'}">${l}</label>`).join('')}</div>`}
      <div class="anim-row" style="margin-top:12px">${[['walk_down', 'Walk'], ['walk_side', 'Side'], ['walk_up', 'Back'], ['work_side', 'Working']].map(([k, l]) => `<figure><canvas class="tall" data-anim="${k}"></canvas><figcaption>${l}</figcaption></figure>`).join('')}</div>
    </section>`).join('') + `<section><h3>Good to know</h3><p class="hint">The garden is shared: switching player only changes who you see walking around. Swap on the title screen, from the menu, or by holding Back/Share on the controller.</p></section>`;
  for (const sec of form.querySelectorAll('section[data-p]')) {
    const p = PLAYERS.players[+sec.dataset.p];
    const changed = () => scheduleSave('players');
    sec.querySelector('[data-name]').oninput = e => { p.name = e.target.value; changed(); };
    sec.querySelector('[data-set]').onchange = e => { p.spriteSet = e.target.value; changed(); };
    sec.querySelector('[data-edit]').onclick = () => { W.filter.q = p.spriteSet + '_'; $('search').value = W.filter.q; W.filter.cat = 'all'; $('category').value = 'all'; showTab('sprites'); const f = Object.keys(SPR.sprites).find(k => k.startsWith(W.filter.q)); if (f) selectSprite(f); };
    for (const inp of sec.querySelectorAll('input[data-slot]')) inp.oninput = () => { p.colors = { ...(p.colors || {}), [inp.dataset.slot]: inp.value }; changed(); };
    for (const inp of sec.querySelectorAll('input[data-pal]')) inp.oninput = () => { setSetColour(p.spriteSet, +inp.dataset.pal, inp.value); inp.parentElement.title = inp.value; };
    const where = sec.querySelector('canvas[data-where]');
    const showWhere = i => {
      if (!where) return;
      const n = SPR.sprites[`${p.spriteSet}_walk_down`] ? `${p.spriteSet}_walk_down` : setSprites(p.spriteSet)[0], d = SPR.sprites[n];
      if (!d) return;
      where.width = d.w; where.height = d.h;
      const ctx = where.getContext('2d'); ctx.clearRect(0, 0, d.w, d.h);
      d.frames[0].forEach((row, y) => [...row].forEach((ch, x) => {
        const k = CH.indexOf(ch); if (k < 0) return;
        ctx.globalAlpha = i == null || k === i ? 1 : 0.18;
        ctx.fillStyle = k === i ? (Math.floor(performance.now() / 300) % 2 ? '#ff4fd8' : d.pal[k]) : d.pal[k];
        ctx.fillRect(x, y, 1, 1);
      }));
      ctx.globalAlpha = 1;
    };
    showWhere(null);
    for (const lab of sec.querySelectorAll('.colors.all label')) {
      const i = +lab.querySelector('input').dataset.pal;
      lab.addEventListener('mouseenter', () => { clearInterval(where._blink); showWhere(i); where._blink = setInterval(() => showWhere(i), 300); });
      lab.addEventListener('mouseleave', () => { clearInterval(where._blink); showWhere(null); });
    }
    sec.querySelector('[data-reset-colours]')?.addEventListener('click', () => { if (confirm(`Put all of ${p.name}'s colours back to how they were drawn?`)) { resetSetColours(p.spriteSet); renderPlayers(); } });
    for (const cv of sec.querySelectorAll('canvas[data-anim]')) {
      anims.push({ c: cv, draw: t => {
        const n = SPR.sprites[`${p.spriteSet}_${cv.dataset.anim}`] ? `${p.spriteSet}_${cv.dataset.anim}` : `p1_${cv.dataset.anim}`, d = SPR.sprites[n], s = slotSwap('player', p.colors);
        if (d && (cv.width !== d.w || cv.height !== d.h)) { cv.width = d.w; cv.height = d.h; }
        const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(frameCanvas(n, d?.fps ? Math.floor(t * d.fps) % d.frames.length : 0, s.swap, s.key), 0, 0);
      } });
    }
  }
}

start().catch(e => { document.body.innerHTML = `<p style="padding:2em">Couldn't start the workshop: ${esc(e.message)}. Serve the folder with a web server (see README).</p>`; });
