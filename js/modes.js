// Cursor modes: "Plan" (designate clearing, plots, cancel jobs) and "Build" (place decorations).
import { G, TILE } from './game.js';
import { DATA } from './data.js';
import { input } from './input.js';
import { idx, tx, ty, inBounds, debrisAt, decorAt, plotAt, ground, obj, blocks } from './world.js';
import { addJob, getJob, removeJob, jobsAtTile } from './jobs.js';
import { drawSprite } from './sprites.js';
import { facingTile } from './player.js';
import { sfx } from './audio.js';
import { poof } from './particles.js';
import { toast, setModePanel, confirmDialog } from './ui.js';
import { canAfford, pay, refund, costLabel } from './economy.js';
import { selectedSeedKey } from './player.js';

export const PLAN_TABS = [
  { id: 'clear', name: 'Clear', help: 'Mark debris for clearing. The cats will pick it up.' },
  { id: 'plot', name: 'New plot', help: 'Choose two corners to make a garden plot.' },
  { id: 'removePlot', name: 'Remove plot', help: 'Pick a plot to remove (crops stay planted).' },
  { id: 'cancel', name: 'Cancel jobs', help: 'Select an area to cancel queued jobs.' },
];
export const M = { cx: 0, cy: 0, start: null, tab: 0, decor: null, blink: 0 };
let returnTo = 'play';

function startCursor() {
  const t = facingTile();
  const p = G.state.player;
  if (t >= 0) { M.cx = tx(t); M.cy = ty(t); } else { M.cx = Math.floor(p.x / TILE); M.cy = Math.floor(p.y / TILE); }
  M.start = null;
}
export function enterPlan() { startCursor(); G.mode = 'designate'; sfx('confirm'); panel(); }
export function enterPlace(decorId, from = 'play') { startCursor(); M.decor = decorId; G.mode = 'place'; returnTo = from; sfx('confirm'); panel(); }
function exit() { G.mode = 'play'; M.start = null; setModePanel(null); }

function moveCursor() {
  const w = G.state.map.w, h = G.state.map.h;
  if (input.nav('left')) M.cx = Math.max(0, M.cx - 1);
  if (input.nav('right')) M.cx = Math.min(w - 1, M.cx + 1);
  if (input.nav('up')) M.cy = Math.max(0, M.cy - 1);
  if (input.nav('down')) M.cy = Math.min(h - 1, M.cy + 1);
}
export function cursorPx() { return { x: M.cx * TILE + 8, y: M.cy * TILE + 8 }; }

function rect() {
  const a = M.start || { x: M.cx, y: M.cy };
  return { x: Math.min(a.x, M.cx), y: Math.min(a.y, M.cy), w: Math.abs(a.x - M.cx) + 1, h: Math.abs(a.y - M.cy) + 1 };
}
function tilesIn(r) { const out = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(idx(x, y)); return out; }

export function plotProblem(r) {
  const max = DATA.balance.farm.maxPlotSize;
  if (r.w > max || r.h > max) return `Too big (max ${max}×${max})`;
  for (const t of tilesIn(r)) {
    if (plotAt(t)) return 'Overlaps another plot';
    const g = ground(t), o = obj(t);
    if (g === 'f') return 'Too close to the forest';
    if (o && !o.startsWith('d:')) return 'Something is built there';
    if (g !== 'g' && g !== 't') return 'Plots go on grass';
  }
  return null;
}

/* --------------------------------------------------------------- plan */
export function updatePlan() {
  moveCursor();
  if (input.pressed('seedPrev')) { M.tab = (M.tab + PLAN_TABS.length - 1) % PLAN_TABS.length; M.start = null; sfx('move'); panel(); }
  if (input.pressed('seedNext')) { M.tab = (M.tab + 1) % PLAN_TABS.length; M.start = null; sfx('move'); panel(); }
  if (input.pressed('cancel') || input.pressed('designate') || input.pressed('pause')) {
    if (M.start && input.pressed('cancel')) { M.start = null; sfx('cancel'); panel(); return; }
    sfx('cancel'); exit(); return;
  }
  if (!input.pressed('confirm')) return;
  const tab = PLAN_TABS[M.tab].id;
  if (tab === 'removePlot') {
    const p = plotAt(idx(M.cx, M.cy));
    if (!p) { sfx('error'); return; }
    confirmDialog(`Remove "${p.name}"? Planted crops stay where they are.`, () => {
      G.state.plots = G.state.plots.filter(q => q !== p);
      for (const j of [...G.state.jobs]) if ((j.type === 'till' || j.type === 'plant') && !plotAt(j.tile)) removeJob(j);
      toast(`Removed ${p.name}`); sfx('cancel');
    });
    return;
  }
  if (!M.start) { M.start = { x: M.cx, y: M.cy }; sfx('move'); panel(); return; }
  const r = rect();
  M.start = null;
  if (tab === 'clear') commitClear(r);
  else if (tab === 'plot') commitPlot(r);
  else if (tab === 'cancel') commitCancel(r);
  panel();
}
function commitClear(r) {
  const tiles = tilesIn(r).filter(t => debrisAt(t));
  if (!tiles.length) { sfx('error'); toast('No debris there'); return; }
  const allMarked = tiles.every(t => getJob('clear', t)?.marked);
  let n = 0;
  for (const t of tiles) {
    if (allMarked) { const j = getJob('clear', t); if (j && !plotAt(t)) { removeJob(j); n++; } }
    else if (addJob('clear', t, { marked: true })) n++;
  }
  sfx('confirm');
  toast(allMarked ? `Unmarked ${n} for clearing` : `Marked ${n} for clearing`, 'icon_mark');
}
function commitPlot(r) {
  const why = plotProblem(r);
  if (why) { sfx('error'); toast(why); return; }
  const st = G.state, n = st.nextPlotId++;
  const seed = selectedSeedKey() || 'same';
  st.plots.push({ id: n, name: `Plot ${n}`, x: r.x, y: r.y, w: r.w, h: r.h, seed });
  sfx('build');
  toast(`Made ${`Plot ${n}`} (${r.w}×${r.h}). The cats will clear and till it.`, 'tool_hoe');
  G.emit('plotCreated', st.plots.at(-1));
}
function commitCancel(r) {
  let n = 0;
  for (const t of tilesIn(r)) for (const j of jobsAtTile(t)) { removeJob(j); n++; }
  sfx(n ? 'cancel' : 'error');
  toast(n ? `Cancelled ${n} job${n > 1 ? 's' : ''} (plots re-queue their own work)` : 'No jobs there');
}

/* -------------------------------------------------------------- build */
export function placeProblem(id, t) {
  const d = DATA.decor[id];
  if (!d) return 'Unknown item';
  if (!inBounds(tx(t), ty(t))) return 'Out of bounds';
  const g = ground(t), o = obj(t);
  if (g === 'f') return 'Too deep in the forest';
  if (o) return 'Something is already there';
  if (d.ground) { if (g === 't') return 'Not on tilled soil'; if (g === id) return 'Already a path'; return null; }
  if (plotAt(t)) return 'Not inside a plot';
  const p = G.state.player;
  if (Math.floor(p.x / TILE) === tx(t) && Math.floor((p.y - 3) / TILE) === ty(t)) return 'You are standing there';
  const c = G.state.cabin; if (tx(t) === c.x + 1 && ty(t) === c.y + 2) return 'Keep the door clear';
  return null;
}
export function updatePlace() {
  moveCursor();
  const ids = Object.keys(DATA.decor);
  if (input.pressed('seedPrev') || input.pressed('seedNext')) { const i = ids.indexOf(M.decor); M.decor = ids[(i + (input.pressed('seedNext') ? 1 : ids.length - 1)) % ids.length]; sfx('move'); panel(); }
  if (input.pressed('cancel') || input.pressed('pause') || input.pressed('designate')) { sfx('cancel'); exit(); return; }
  const t = idx(M.cx, M.cy);
  if (input.pressed('tool')) { // pick up
    const dId = decorAt(t);
    const pathId = ['path_stone', 'path_wood'].includes(ground(t)) ? ground(t) : null;
    if (dId) { G.state.map.obj[t] = null; refund(DATA.decor[dId]?.cost); poof(M.cx * TILE + 8, M.cy * TILE + 12); sfx('cancel'); toast(`Picked up ${DATA.decor[dId]?.name}`); }
    else if (pathId && !(tx(t) === G.state.cabin.x + 1 && ty(t) > G.state.cabin.y + 1 && ty(t) <= G.state.cabin.y + 3)) { G.state.map.ground[t] = 'g'; refund(DATA.decor[pathId]?.cost); sfx('cancel'); }
    else sfx('error');
    panel(); return;
  }
  if (input.pressed('confirm')) {
    const why = placeProblem(M.decor, t);
    const d = DATA.decor[M.decor];
    if (why) { sfx('error'); toast(why); return; }
    if (!canAfford(d.cost)) { sfx('error'); toast(`Need ${costLabel(d.cost)}`); return; }
    pay(d.cost);
    if (d.ground) G.state.map.ground[t] = M.decor; else G.state.map.obj[t] = 'x:' + M.decor;
    poof(M.cx * TILE + 8, M.cy * TILE + 12); sfx('build');
    G.emit('built', { id: M.decor, tile: t });
    panel();
  }
}

/* ------------------------------------------------------------ overlay */
export function drawModeOverlay(ctx, t) {
  if (G.mode !== 'designate' && G.mode !== 'place') return;
  const blink = 0.55 + 0.45 * Math.sin(t * 6);
  if (G.mode === 'designate') {
    const tab = PLAN_TABS[M.tab].id;
    const r = rect();
    let col = '255,248,220';
    if (tab === 'plot') col = plotProblem(r) ? '229,115,90' : '140,198,90';
    if (tab === 'cancel' || tab === 'removePlot') col = '229,115,90';
    if (tab === 'removePlot') { const p = plotAt(idx(M.cx, M.cy)); if (p) { r.x = p.x; r.y = p.y; r.w = p.w; r.h = p.h; } }
    ctx.fillStyle = `rgba(${col},${M.start || tab === 'removePlot' ? 0.25 : 0.12})`;
    ctx.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
    ctx.strokeStyle = `rgba(${col},${blink})`; ctx.lineWidth = 1;
    ctx.strokeRect(r.x * TILE + 0.5, r.y * TILE + 0.5, r.w * TILE - 1, r.h * TILE - 1);
    if (tab === 'clear') for (const ti of tilesIn(r)) if (debrisAt(ti)) { ctx.fillStyle = `rgba(247,205,93,${0.35 * blink})`; ctx.fillRect(tx(ti) * TILE + 2, ty(ti) * TILE + 2, 12, 12); }
  } else {
    const d = DATA.decor[M.decor], ti = idx(M.cx, M.cy);
    const ok = !placeProblem(M.decor, ti) && canAfford(d.cost);
    ctx.globalAlpha = 0.65;
    drawSprite(ctx, d.sprite, 0, M.cx * TILE, M.cy * TILE);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? `rgba(140,198,90,${blink})` : `rgba(229,115,90,${blink})`;
    ctx.strokeRect(M.cx * TILE + 0.5, M.cy * TILE + 0.5, 15, 15);
  }
  // cursor corners
  const x = M.cx * TILE, y = M.cy * TILE;
  ctx.fillStyle = '#fffaf0';
  for (const [cx, cy] of [[x - 1, y - 1], [x + 13, y - 1], [x - 1, y + 13], [x + 13, y + 13]]) { ctx.fillRect(cx, cy, 4, 1); ctx.fillRect(cx + (cx > x ? 3 : 0), cy, 1, 4); ctx.fillRect(cx, cy + (cy > y ? 3 : 0), 4, 1); }
}

function panel() {
  if (G.mode === 'designate') {
    const tabs = PLAN_TABS.map((tb, i) => `<span class="tab ${i === M.tab ? 'on' : ''}">${tb.name}</span>`).join('');
    const tab = PLAN_TABS[M.tab];
    const step = tab.id === 'removePlot' ? 'Ⓐ choose plot' : M.start ? 'Ⓐ second corner · Ⓑ restart' : 'Ⓐ first corner';
    setModePanel(`<div class="mp-title">Plan mode</div><div class="tabs"><span class="btn">LB</span>${tabs}<span class="btn">RB</span></div><div class="mp-help">${tab.help}</div><div class="mp-keys">${step} · Ⓨ/Ⓑ exit</div>`);
  } else if (G.mode === 'place') {
    const d = DATA.decor[M.decor];
    setModePanel(`<div class="mp-title">Build: ${d.name}</div><div class="mp-help">Cost: ${costLabel(d.cost)}</div><div class="mp-keys">Ⓐ place · Ⓧ pick up · LB/RB change item · Ⓑ done</div>`);
  }
}
export { panel as refreshModePanel };
export const placingBlocked = blocks;
