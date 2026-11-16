// Inside the cabin: rooms (living room, plus a kitchen and bedroom you can build), floors and
// wallpaper, furniture placement, walking around, and the bits of furniture that do something
// (cook a feast for the cats on the stove, the cats napping on the bed, the window, the clock).
//
// The interior is its own little tile grid. Rooms sit side by side along the back wall:
// [bedroom] | [living room] | [kitchen], each with two rows of wall above its floor, joined by
// doorways. Furniture positions are stored relative to their room, so rooms can grow and the
// furniture stays put. While you're inside, the garden keeps running as normal.
import { G, TILE, clamp } from './game.js';
import { DATA } from './data.js';
import { input } from './input.js';
import { drawSprite, frameCanvas, iconHTML, animFrame } from './sprites.js';
import { lighting, hourOfDay, clockLabel, phaseLabel } from './daytime.js';
import { drawPlayer, anim } from './player.js';
import { drawCatSprite, catSpriteName } from './cats.js';
import { openMenu, closeMenu, closeAllMenus, toast, setModePanel } from './ui.js';
import { canAfford, pay, refund, costLabel, costHTML } from './economy.js';
import { sfx } from './audio.js';

const VOID = 0, FLOOR = 1, DOOR = 2, EXIT = 3;
// Each room is drawn this many pixels wider on its left and right than its tile grid, so furniture
// that's a little wider than its tiles still sits on the floor at the edge of a room.
const EDGE = 3;
const I = () => DATA.interior;

/* ------------------------------------------------------------------ state */
export function homeDefaults() {
  const d = DATA.interior?.defaults || { floor: {}, wall: {} };
  // a new cabin comes with a chair, a rug and a window so the first look inside isn't bare
  const items = [{ id: 'window', room: 'living', x: 2, y: -1 }, { id: 'window', room: 'living', x: 6, y: -1 }, { id: 'armchair', room: 'living', x: 1, y: 1 }, { id: 'rug_round', room: 'living', x: 3, y: 2 }].filter(it => DATA.interior?.items?.[it.id]);
  return { inside: false, me: null, living: 0, kitchen: false, bedroom: false, floor: { ...d.floor }, wall: { ...d.wall }, items, feastUntil: 0 };
}
export function fixHome(s) {
  const d = homeDefaults();
  s.home = { ...d, ...(s.home || {}) };
  s.home.floor = { ...d.floor, ...s.home.floor };
  s.home.wall = { ...d.wall, ...s.home.wall };
  s.home.items = (s.home.items || []).filter(it => DATA.interior?.items?.[it.id]);
  s.home.living = clamp(s.home.living | 0, 0, (DATA.interior?.living?.sizes?.length || 1) - 1);
}
const home = () => G.state.home;
export const isInside = () => !!G.state?.home?.inside && G.mode !== 'title';
export const hasBed = () => !!G.state?.home?.items?.some(i => DATA.interior.items[i.id]?.napBed);
export const feastActive = () => (G.state?.home?.feastUntil || 0) > (G.state?.simTime || 0);
export const feastMult = () => (feastActive() ? I().feast.workMult : 1);
export const bedNapMult = () => (hasBed() ? I().bedNapMult : 1);

/* ----------------------------------------------------------------- layout */
let LC = { key: null, L: null };
export function layout() {
  const h = home(), key = `${h.living}|${h.bedroom}|${h.kitchen}`;
  if (LC.key === key) return LC.L;
  const D = I(), rooms = [];
  let x = 1;
  const side = id => { const [w, hh] = D.sideRooms[id].size; rooms.push({ id, name: D.sideRooms[id].name, x, y: 2, w, h: hh }); x += w + 1; };
  if (h.bedroom) side('bedroom');
  const [lw, lh] = D.living.sizes[h.living];
  rooms.push({ id: 'living', name: 'Living room', x, y: 2, w: lw, h: lh }); x += lw + 1;
  if (h.kitchen) side('kitchen');
  const W = x, H = 2 + Math.max(...rooms.map(r => r.h)) + 1;
  const kind = new Uint8Array(W * H), roomOf = new Array(W * H).fill(null);
  for (const r of rooms) for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) { kind[yy * W + xx] = FLOOR; roomOf[yy * W + xx] = r.id; }
  const liv = rooms.find(r => r.id === 'living'), doors = [];
  for (const r of rooms) {
    if (r === liv) continue;
    const dx = r.x < liv.x ? r.x + r.w : r.x - 1, dy = r.y + r.h - 2;
    kind[dy * W + dx] = DOOR; roomOf[dy * W + dx] = 'living'; doors.push({ x: dx, y: dy });
  }
  const exit = { x: liv.x + Math.floor(liv.w / 2), y: liv.y + liv.h };
  kind[exit.y * W + exit.x] = EXIT; roomOf[exit.y * W + exit.x] = 'living';
  const L = { W, H, rooms, kind, roomOf, doors, exit, room: id => rooms.find(r => r.id === id) };
  LC = { key, L };
  return L;
}
const cellKind = (L, x, y) => (x < 0 || y < 0 || x >= L.W || y >= L.H ? VOID : L.kind[y * L.W + x]);

// grid cells covered by an item ({ id, room, x, y } in room-local tiles; wall items have y = -1)
function cellsOf(it, L) {
  const d = I().items[it.id], r = L.room(it.room);
  if (!d || !r) return [];
  if (d.wall) return [{ x: r.x + it.x, y: r.y - 1 }];
  const [w, h] = d.size || [1, 1], out = [];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) out.push({ x: r.x + it.x + xx, y: r.y + it.y + yy });
  return out;
}
function occupancy(L, skip = null) {
  const solid = new Map(), rug = new Map(), wall = new Map();
  for (const it of home().items) {
    if (it === skip) continue;
    const d = I().items[it.id];
    const m = d.wall ? wall : d.rug ? rug : solid;
    for (const c of cellsOf(it, L)) m.set(c.y * L.W + c.x, it);
  }
  return { solid, rug, wall };
}
const walkable = (L, occ, x, y) => { const k = cellKind(L, x, y); return (k === FLOOR || k === DOOR || k === EXIT) && !occ.solid.has(y * L.W + x); };

// Is every doorway and the way out still reachable (and the player not boxed in)?
function connected(L, occ) {
  const start = { x: L.exit.x, y: L.exit.y - 1 };
  if (!walkable(L, occ, start.x, start.y)) return false;
  const seen = new Uint8Array(L.W * L.H), q = [start]; seen[start.y * L.W + start.x] = 1;
  while (q.length) {
    const c = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= L.W || ny >= L.H || seen[ny * L.W + nx] || !walkable(L, occ, nx, ny)) continue;
      seen[ny * L.W + nx] = 1; q.push({ x: nx, y: ny });
    }
  }
  if (L.doors.some(d => !seen[d.y * L.W + d.x])) return false;
  const me = home().me;
  if (home().inside && me) { const mx = Math.floor(me.x / TILE), my = Math.floor((me.y - 3) / TILE); if (cellKind(L, mx, my) === FLOOR && !occ.solid.has(my * L.W + mx) && !seen[my * L.W + mx]) return false; }
  return true;
}

// Why can't this item go here? (null = it can)
export function itemProblem(it, skip = null) {
  const L = layout(), d = I().items[it.id], r = L.room(it.room);
  if (!d || !r) return 'Not inside a room';
  if (d.room && d.room !== it.room) return `This goes in the ${I().sideRooms[d.room]?.name.toLowerCase() || d.room}`;
  const occ = occupancy(L, skip);
  if (d.wall) {
    if (it.y !== -1 || it.x < 0 || it.x >= r.w) return 'Hang it on the back wall';
    return occ.wall.has((r.y - 1) * L.W + r.x + it.x) ? 'Something already hangs there' : null;
  }
  const [w, h] = d.size || [1, 1];
  if (it.x < 0 || it.y < 0 || it.x + w > r.w || it.y + h > r.h) return 'It has to fit inside the room';
  if (d.back && it.y !== 0) return 'This stands against the back wall';
  const cells = cellsOf(it, L);
  if (cells.some(c => (d.rug ? occ.rug : occ.solid).has(c.y * L.W + c.x))) return 'Something is already there';
  if (d.rug) return null;
  const keep = [{ x: L.exit.x, y: L.exit.y - 1 }, ...L.doors.flatMap(dd => [{ x: dd.x - 1, y: dd.y }, { x: dd.x + 1, y: dd.y }])];
  if (cells.some(c => keep.some(k => k.x === c.x && k.y === c.y))) return 'Keep the doorways clear';
  const me = home().me;
  if (home().inside && me) {
    const px = me.x, py = me.y - 3;
    if (cells.some(c => px + 5 > c.x * TILE && px - 5 < (c.x + 1) * TILE && py + 3 > c.y * TILE && py - 3 < (c.y + 1) * TILE)) return "You're standing there";
  }
  for (const c of cells) occ.solid.set(c.y * L.W + c.x, it);
  return connected(L, occ) ? null : 'That would block the way through';
}

/* ------------------------------------------------------- entering, leaving */
export function enterCabin() {
  const h = home(), L = layout();
  h.inside = true;
  h.me = { x: L.exit.x * TILE + 8, y: (L.exit.y - 1) * TILE + 12, dir: 'up' };
  sfx('confirm');
  G.emit('enteredCabin');
}
export function leaveCabin() {
  const h = home(), c = G.state.cabin, p = G.state.player;
  h.inside = false;
  p.x = (c.x + 1) * TILE + 8; p.y = (c.y + 2) * TILE + 12; p.dir = 'down';
  sfx('cancel');
}

/* --------------------------------------------------------- walking around */
function boxBlockedIn(L, occ, cx, cy, hw, hh) {
  const x0 = Math.floor((cx - hw) / TILE), x1 = Math.floor((cx + hw - 0.01) / TILE);
  const y0 = Math.floor((cy - hh) / TILE), y1 = Math.floor((cy + hh - 0.01) / TILE);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!walkable(L, occ, x, y)) return true;
  return false;
}
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
let lastAction = null;
export const insideAction = () => lastAction;

function resolveInside(L, occ) {
  const me = home().me, [dx, dy] = DIRV[me.dir];
  const fx = Math.floor((me.x + dx * 12) / TILE), fy = Math.floor((me.y - 4 + dy * 12) / TILE);
  if (cellKind(L, fx, fy) === EXIT) return { kind: 'exit', label: 'Go outside' };
  let it = occ.solid.get(fy * L.W + fx);
  if (!it && me.dir === 'up' && cellKind(L, fx, fy) === VOID) {
    const r = L.rooms.find(rr => fx >= rr.x && fx < rr.x + rr.w && (fy === rr.y - 1 || fy === rr.y - 2));
    if (r) it = occ.wall.get((r.y - 1) * L.W + fx);
  }
  if (!it) return null;
  const d = I().items[it.id];
  if (d.action === 'cook') return { kind: 'cook', label: feastActive() ? `Stove · the cats are well fed for ${fmtLeft()}` : 'Cook a feast for the cats' };
  if (d.action === 'nap') { const c = catOn(it); return { kind: 'nap', item: it, label: c ? `${c.cfg.name} is napping here` : `${d.name} · the cats nap here` }; }
  if (it.id === 'cat_basket') { const c = catOn(it); return { kind: 'info', label: c ? `${c.cfg.name} is curled up in the basket` : 'Cat basket' }; }
  if (d.action === 'look') return { kind: 'look', label: 'Look outside' };
  if (d.action === 'clock') return { kind: 'info', label: `The clock says ${clockLabel(hourOfDay())}` };
  return { kind: 'info', label: d.name };
}
const fmtLeft = () => { const s = Math.max(0, home().feastUntil - G.state.simTime), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60); return hh ? `${hh}h ${mm}m` : `${mm}m`; };

export function updateInside(dt) {
  const h = home(), me = h.me, L = layout(), occ = occupancy(L);
  anim.t += dt; anim.moving = false; anim.working = false;
  if (G.mode !== 'play') { lastAction = null; return; }
  const speed = DATA.balance.player.speedTilesPerSec * TILE;
  const { x: ax, y: ay } = input.axis;
  if (Math.abs(ax) > 0.05 || Math.abs(ay) > 0.05) {
    const nx = me.x + ax * speed * dt, ny = me.y + ay * speed * dt;
    if (!boxBlockedIn(L, occ, nx, me.y - 3, 5, 3)) me.x = nx;
    if (!boxBlockedIn(L, occ, me.x, ny - 3, 5, 3)) me.y = ny;
    me.dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
    anim.moving = true;
  }
  if (cellKind(L, Math.floor(me.x / TILE), Math.floor((me.y - 1) / TILE)) === EXIT) { leaveCabin(); return; }
  lastAction = resolveInside(L, occ);
  if (!lastAction || !input.pressed('confirm')) return;
  switch (lastAction.kind) {
    case 'exit': leaveCabin(); break;
    case 'cook': cookMenu(); break;
    case 'nap': { const c = catOn(lastAction.item); sfx('pop'); toast(c ? `Shh... ${c.cfg.name} is fast asleep` : 'A cozy bed. The cats sneak in here to nap and get their energy back faster', I().items[lastAction.item.id].sprite); break; }
    case 'look': { const hr = hourOfDay(); sfx('pop'); toast(`${phaseLabel(hr)} outside. ${G.cats.map(c => `${c.cfg.name}: ${c.activity.toLowerCase()}`).join(' · ')}`, 'in_window', 6000); break; }
  }
}
// Napping cats curl up on the beds and cat baskets indoors (one cat per spot).
function napSpots() { return home().items.filter(i => I().items[i.id]?.napBed || i.id === 'cat_basket'); }
function nappers() { const spots = napSpots(), cats = G.cats.filter(c => c.state === 'nap'); return spots.slice(0, cats.length).map((s, k) => ({ spot: s, cat: cats[k] })); }
function catOn(it) { return nappers().find(n => n.spot === it)?.cat || null; }

/* ------------------------------------------------------------ decorating */
export const IM = { cx: 0, cy: 0, id: null };
export function enterDecorate(id) {
  const L = layout(), me = home().me;
  IM.id = id;
  IM.cx = clamp(Math.floor(me.x / TILE), 0, L.W - 1); IM.cy = clamp(Math.floor((me.y - 3) / TILE) - 1, 0, L.H - 1);
  G.mode = 'iplace'; sfx('confirm'); decoratePanel();
}
// the item that would be placed at the cursor, in room-local coordinates
function placementAt(L) {
  const d = I().items[IM.id];
  let r = L.rooms.find(rr => IM.cx >= rr.x && IM.cx < rr.x + rr.w);
  if (!r) return null;
  if (d.wall) return { id: IM.id, room: r.id, x: IM.cx - r.x, y: -1 };
  return { id: IM.id, room: r.id, x: IM.cx - r.x, y: IM.cy - r.y };
}
export function updateDecorate() {
  const L = layout(), ids = Object.keys(I().items), d = I().items[IM.id];
  if (input.nav('left')) IM.cx = Math.max(0, IM.cx - 1);
  if (input.nav('right')) IM.cx = Math.min(L.W - 1, IM.cx + 1);
  if (input.nav('up')) IM.cy = Math.max(0, IM.cy - 1);
  if (input.nav('down')) IM.cy = Math.min(L.H - 1, IM.cy + 1);
  if (d.wall) IM.cy = 1;
  if (input.pressed('seedPrev') || input.pressed('seedNext')) {
    const i = ids.indexOf(IM.id); IM.id = ids[(i + (input.pressed('seedNext') ? 1 : ids.length - 1)) % ids.length];
    if (I().items[IM.id].wall) IM.cy = 1; else if (IM.cy < 2) IM.cy = 2;
    sfx('move'); decoratePanel();
  }
  if (input.pressed('cancel') || input.pressed('pause') || input.pressed('designate')) { sfx('cancel'); G.mode = 'play'; setModePanel(null); return; }
  if (input.pressed('tool')) { // pick up, full refund
    const occ = occupancy(L), i = IM.cy * L.W + IM.cx;
    const it = (IM.cy <= 1 ? occ.wall.get(L.W + IM.cx) : null) || occ.solid.get(i) || occ.rug.get(i);
    if (!it) { sfx('error'); return; }
    home().items.splice(home().items.indexOf(it), 1);
    refund(I().items[it.id].cost); sfx('cancel'); toast(`Picked up the ${I().items[it.id].name.toLowerCase()}`, I().items[it.id].sprite);
    decoratePanel(); return;
  }
  if (input.pressed('confirm')) {
    const it = placementAt(L);
    const why = it ? itemProblem(it) : 'Not inside a room';
    if (why) { sfx('error'); toast(why); return; }
    if (!canAfford(d.cost)) { sfx('error'); toast(`Need ${costLabel(d.cost)}`); return; }
    pay(d.cost); home().items.push(it); sfx('build');
    G.emit('builtInside', it);
    decoratePanel();
  }
}
function decoratePanel() {
  const d = I().items[IM.id];
  const where = d.wall ? 'Hangs on the back wall' : d.back ? 'Stands against the back wall' : d.rug ? 'A rug: furniture can stand on it' : '';
  const room = d.room ? `${I().sideRooms[d.room].name} only` : '';
  setModePanel(`<div class="mp-title">Decorate: ${d.name}</div><div class="mp-help">Cost: ${costLabel(d.cost)}${[where, room, d.desc].filter(Boolean).map(s => ' · ' + s).join('')}</div><div class="mp-keys">Ⓐ place · Ⓧ pick up · LB/RB change item · Ⓑ done</div>`);
}

/* ------------------------------------------------------- room changes */
export function upgradeState(u) {
  const h = home();
  if (u.id === 'living1') return h.living >= 1;
  if (u.id === 'living2') return h.living >= 2;
  return !!h[u.id];
}
export function buyUpgrade(u) {
  if (upgradeState(u) || !canAfford(u.cost)) return false;
  if (u.needs && !upgradeState(I().upgrades.find(x => x.id === u.needs))) return false;
  pay(u.cost);
  const h = home();
  if (u.id === 'living1') h.living = 1; else if (u.id === 'living2') h.living = 2; else h[u.id] = true;
  afterLayoutChange();
  sfx('build');
  return true;
}
// Rooms changed shape: anything that no longer fits goes back to your pocket (full refund).
function afterLayoutChange() {
  const h = home(), L = layout();
  const back = [];
  for (const it of [...h.items]) if (itemProblem(it, it)) { h.items.splice(h.items.indexOf(it), 1); refund(I().items[it.id].cost); back.push(I().items[it.id].name); }
  if (back.length) toast(`Moved out of the way (refunded): ${back.join(', ')}`);
  if (h.inside && h.me) {
    const occ = occupancy(L);
    if (boxBlockedIn(L, occ, h.me.x, h.me.y - 3, 5, 3)) { h.me.x = L.exit.x * TILE + 8; h.me.y = (L.exit.y - 1) * TILE + 12; }
  }
}

/* ----------------------------------------------------------------- menus */
const matsLine = () => `${iconHTML('item_wood', 'ico sm')}${G.state.mats.wood || 0} ${iconHTML('item_stone', 'ico sm')}${G.state.mats.stone || 0} ${iconHTML('item_fiber', 'ico sm')}${G.state.mats.fiber || 0} ${iconHTML('item_coin', 'ico sm')}${G.state.coins}`;
export function furnitureMenu() {
  openMenu({
    title: 'Decorate the cabin', icon: 'in_armchair', live: true, subtitle: matsLine,
    items: () => {
      const out = [], D = I(), L = layout();
      for (const c of D.categories) {
        const list = Object.entries(D.items).filter(([, d]) => d.cat === c);
        out.push({ header: true, label: c });
        for (const [id, d] of list) {
          const locked = d.room && !L.room(d.room);
          out.push({
            label: d.name, icon: d.sprite, right: costHTML(d.cost), cls: canAfford(d.cost) && !locked ? '' : 'cant',
            sub: locked ? `Build the ${D.sideRooms[d.room].name.toLowerCase()} first (Cabin rooms)` : d.desc || (d.light ? 'Glows at night' : d.wall ? 'Hangs on the wall' : d.rug ? 'Rug' : ''),
            disabled: locked, why: `Build the ${D.sideRooms[d.room]?.name.toLowerCase()} first`,
            onSelect: () => { closeAllMenus(); enterDecorate(id); },
          });
        }
      }
      return out;
    },
  });
}
export function upgradesMenu() {
  openMenu({
    title: 'Cabin rooms', icon: 'cabin_door_0', live: true, subtitle: matsLine,
    items: () => [{ header: true, label: `Now: ${I().living.names[home().living]}${home().bedroom ? ' · bedroom' : ''}${home().kitchen ? ' · kitchen' : ''}` },
      ...I().upgrades.map(u => {
        const done = upgradeState(u), need = u.needs && !upgradeState(I().upgrades.find(x => x.id === u.needs));
        return {
          label: u.name, sub: u.desc, right: done ? '✓ built' : costHTML(u.cost), cls: done || (canAfford(u.cost) && !need) ? '' : 'cant',
          disabled: done || need || !canAfford(u.cost), why: done ? 'Already built' : need ? `Build the ${I().upgrades.find(x => x.id === u.needs).name.toLowerCase()} first` : `Need ${costLabel(u.cost)}`,
          onSelect: () => { if (buyUpgrade(u)) toast(`Built: ${u.name}!`, 'fx_sparkle', 5000); },
        };
      })],
  });
}
export function surfacesMenu() {
  openMenu({
    title: 'Floors & walls', icon: 'in_floor_oak_0',
    items: () => layout().rooms.flatMap(r => [
      { header: true, label: r.name },
      { label: 'Floor', icon: `in_floor_${home().floor[r.id]}_0`, right: I().floors[home().floor[r.id]], onSelect: () => surfaceChoice(r, 'floor') },
      { label: 'Walls', icon: `in_wall_${home().wall[r.id]}`, right: I().walls[home().wall[r.id]], onSelect: () => surfaceChoice(r, 'wall') },
    ]),
  });
}
function surfaceChoice(r, kind) {
  const opts = kind === 'floor' ? I().floors : I().walls, cost = I().surfaceCost;
  openMenu({
    title: `${r.name}: ${kind === 'floor' ? 'floor' : 'walls'}`, icon: kind === 'floor' ? 'in_floor_oak_0' : 'in_wall_cream',
    subtitle: () => `Each change costs ${costHTML(cost)}`,
    items: () => Object.entries(opts).map(([id, name]) => {
      const cur = home()[kind][r.id] === id;
      return {
        label: name, icon: kind === 'floor' ? `in_floor_${id}_0` : `in_wall_${id}`, right: cur ? '✓ current' : '',
        disabled: !cur && !canAfford(cost), why: `Need ${costLabel(cost)}`,
        onSelect: () => { if (cur) return; pay(cost); home()[kind][r.id] = id; sfx('build'); toast(`${r.name}: ${name.toLowerCase()}`); closeMenu(); },
      };
    }),
  });
}
export function cookMenu() {
  const F = I().feast;
  openMenu({
    title: 'Cook a feast', icon: 'in_stove', live: true,
    subtitle: () => feastActive() ? `The cats are well fed for another ${fmtLeft()}. Cooking again adds ${F.hours}h.` : `Turn ${F.crops} of one crop into a feast: the cats work ${Math.round((F.workMult - 1) * 100)}% faster for ${F.hours} hours.`,
    empty: `You need ${F.crops} of one kind of crop. Harvest some first!`,
    items: () => Object.entries(G.state.inv.crops).filter(([, n]) => n >= F.crops).map(([id, n]) => {
      const c = DATA.cropById[id];
      return {
        label: `${c.name} feast`, icon: `item_${id}`, sub: `Uses ${F.crops} ${c.name.toLowerCase()} (worth ${c.price * F.crops} coins)`, right: `×${n}`,
        onSelect: () => {
          G.state.inv.crops[id] -= F.crops;
          const h = home(); h.feastUntil = Math.max(h.feastUntil || 0, G.state.simTime) + F.hours * 3600;
          sfx('harvest'); closeAllMenus();
          toast(`You cooked a ${c.name.toLowerCase()} feast! The cats are well fed for ${fmtLeft()}`, `item_${id}`, 5000);
        },
      };
    }),
  });
}

/* ----------------------------------------------------------------- drawing */
let litCanvas = null, lctx = null;
const cam = { x: 0, y: 0 };
const skyColour = h => { const L = lighting(h); if (L.dark > 0.4) return '#1d2a52'; if (L.tintA > 0.1) return '#f2a37a'; return '#9fd3ef'; };

export function renderInterior(ctx, t) {
  const L = layout(), h = home(), vw = G.view.w, vh = G.view.h, D = I();
  const PW = L.W * TILE, PH = L.H * TILE;
  const focus = G.mode === 'iplace' ? { x: IM.cx * TILE + 8, y: IM.cy * TILE + 8 } : { x: h.me.x, y: h.me.y - 12 };
  const tx_ = PW <= vw ? (PW - vw) / 2 : clamp(focus.x - vw / 2, 0, PW - vw);
  const ty_ = PH <= vh ? (PH - vh) / 2 : clamp(focus.y - vh / 2, 0, PH - vh);
  cam.x += (tx_ - cam.x) * 0.2; cam.y += (ty_ - cam.y) * 0.2;
  if (Math.abs(cam.x - tx_) > vw) { cam.x = tx_; cam.y = ty_; }
  const ox = Math.round(cam.x), oy = Math.round(cam.y);
  ctx.fillStyle = '#1e1520'; ctx.fillRect(0, 0, vw, vh);
  ctx.save(); ctx.translate(-ox, -oy);
  // floors
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    const k = L.kind[y * L.W + x];
    if (k === VOID) continue;
    const room = L.roomOf[y * L.W + x];
    const fc = drawSprite(ctx, `in_floor_${h.floor[room] || 'oak'}_${(x * 7 + y * 3) % 5 === 0 ? 1 : 0}`, 0, x * TILE, y * TILE);
    if (k === EXIT) { drawSprite(ctx, 'in_exit', 0, x * TILE, y * TILE); continue; }
    if (cellKind(L, x - 1, y) === VOID) ctx.drawImage(fc, TILE - EDGE, 0, EDGE, TILE, x * TILE - EDGE, y * TILE, EDGE, TILE);
    if (cellKind(L, x + 1, y) === VOID) ctx.drawImage(fc, 0, 0, EDGE, TILE, (x + 1) * TILE, y * TILE, EDGE, TILE);
  }
  // back walls, then the edges of each room
  for (const r of L.rooms) {
    const wy = (r.y - 2) * TILE, x0 = r.x * TILE - EDGE, x1 = (r.x + r.w) * TILE + EDGE;
    let wc = null;
    for (let x = r.x; x < r.x + r.w; x++) wc = drawSprite(ctx, `in_wall_${h.wall[r.id] || 'cream'}`, 0, x * TILE, wy);
    ctx.drawImage(wc, TILE - EDGE, 0, EDGE, 2 * TILE, x0, wy, EDGE, 2 * TILE);
    ctx.drawImage(wc, 0, 0, EDGE, 2 * TILE, x1 - EDGE, wy, EDGE, 2 * TILE);
    ctx.fillStyle = '#5e3b2e'; ctx.fillRect(x0 - 2, wy, 2, 2 * TILE); ctx.fillRect(x1, wy, 2, 2 * TILE);
    ctx.fillStyle = 'rgba(30,21,32,0.35)'; ctx.fillRect(x0, r.y * TILE, x1 - x0, 3);
  }
  ctx.fillStyle = '#5e3b2e';
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    const k = L.kind[y * L.W + x];
    if (k === VOID) continue;
    if (k === EXIT) continue;
    const lv = cellKind(L, x - 1, y) === VOID, rv = cellKind(L, x + 1, y) === VOID;
    if (lv) ctx.fillRect(x * TILE - EDGE - 2, y * TILE, 2, TILE);
    if (rv) ctx.fillRect((x + 1) * TILE + EDGE, y * TILE, 2, TILE);
    if (cellKind(L, x, y + 1) === VOID) { const a = lv ? EDGE + 2 : 0, b = rv ? EDGE + 2 : 0; ctx.fillRect(x * TILE - a, y * TILE + TILE - 2, TILE + a + b, 2); }
  }
  // wall hangings (a window shows the sky)
  const sky = skyColour(hourOfDay());
  for (const it of h.items) {
    const d = D.items[it.id]; if (!d.wall) continue;
    const { x, y } = wallPos(it, d, L);
    if (it.id === 'window') { ctx.fillStyle = sky; ctx.fillRect(x + 3, y + 3, 10, 9); }
    drawSprite(ctx, d.sprite, 0, x, y);
  }
  // rugs lie flat under everything
  for (const it of h.items) { const d = D.items[it.id]; if (d.rug) drawItem(ctx, it, d, L, t); }
  // furniture, a napping cat and you, sorted by depth
  const list = [];
  for (const it of h.items) { const d = D.items[it.id]; if (!d.rug && !d.wall) { const r = L.room(it.room); list.push({ y: (r.y + it.y + (d.size?.[1] || 1)) * TILE - 1, fn: () => drawItem(ctx, it, d, L, t) }); } }
  for (const { spot, cat } of nappers()) {
    const r = L.room(spot.room), [w, hh] = D.items[spot.id].size || [1, 1], sp = catSpriteName(cat, 'sleep');
    const fx = (r.x + spot.x) * TILE + w * 8, fy = (r.y + spot.y) * TILE + (hh > 1 ? 22 : 13);
    list.push({ y: (r.y + spot.y + hh) * TILE, fn: () => drawCatSprite(ctx, cat, sp, animFrame(sp, t), fx, fy) });
  }
  drawPlayer((y, fn) => list.push({ y, fn }), ctx, t, h.me);
  list.sort((a, b) => a.y - b.y);
  for (const e of list) e.fn();
  if (G.mode === 'iplace') drawDecorateOverlay(ctx, t, L);
  ctx.restore();
  renderInsideLight(ctx, t, ox, oy, L);
}
// Wall hangings sit on the wall above the chair rail; tall ones (a hanging plant) stay under the ceiling.
function wallPos(it, d, L) {
  const r = L.room(it.room), def = DATA.sprites.sprites[d.sprite], sw = def?.w ?? 16, sh = def?.h ?? 16;
  const top = (r.y - 2) * TILE, bottom = top + 22;
  return { x: (r.x + it.x) * TILE + Math.round((TILE - sw) / 2), y: Math.max(top + 2, bottom - sh) };
}
function drawItem(ctx, it, d, L, t) {
  const r = L.room(it.room), [w, hh] = d.size || [1, 1];
  const def = DATA.sprites.sprites[d.sprite], sw = def?.w ?? 16, sh = def?.h ?? 16;
  const x = (r.x + it.x) * TILE + Math.round((w * TILE - sw) / 2), y = (r.y + it.y + hh) * TILE - sh;
  // rugs are centred on their tiles; everything else stands on the bottom of its footprint
  drawSprite(ctx, d.sprite, def?.fps ? animFrame(d.sprite, t) : 0, x, d.rug ? (r.y + it.y) * TILE + Math.round((hh * TILE - sh) / 2) : y);
}
function drawDecorateOverlay(ctx, t, L) {
  const d = I().items[IM.id], it = placementAt(L), blink = 0.55 + 0.45 * Math.sin(t * 6);
  const ok = it && !itemProblem(it) && canAfford(d.cost);
  const [w, hh] = d.wall ? [1, 1] : d.size || [1, 1];
  ctx.globalAlpha = 0.65;
  if (it) { if (d.wall) { const p = wallPos(it, d, L); drawSprite(ctx, d.sprite, 0, p.x, p.y); } else drawItem(ctx, it, d, L, t); }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ok ? `rgba(140,198,90,${blink})` : `rgba(229,115,90,${blink})`;
  const cy = d.wall ? 0 : IM.cy, ch = d.wall ? 2 : hh;
  ctx.strokeRect(IM.cx * TILE + 0.5, cy * TILE + 0.5, w * TILE - 1, ch * TILE - 1);
}
function renderInsideLight(ctx, t, ox, oy, L) {
  const Lt = lighting(), vw = G.view.w, vh = G.view.h;
  const dark = Lt.dark * 0.6; // indoors is a little cosier than the dark garden
  if (dark < 0.02) return;
  if (!litCanvas) { litCanvas = document.createElement('canvas'); lctx = litCanvas.getContext('2d'); }
  if (litCanvas.width !== vw || litCanvas.height !== vh) { litCanvas.width = vw; litCanvas.height = vh; }
  const lights = [];
  for (const it of home().items) {
    const d = I().items[it.id]; if (!d.light) continue;
    const r = L.room(it.room), [w] = d.size || [1, 1];
    lights.push({ x: (r.x + it.x) * TILE + w * 8 - ox, y: (r.y + it.y) * TILE + (d.fire ? 6 : -4) - oy, r: d.light, fire: !!d.fire });
  }
  lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, vw, vh);
  lctx.fillStyle = `rgba(12,14,40,${dark.toFixed(3)})`; lctx.fillRect(0, 0, vw, vh);
  lctx.globalCompositeOperation = 'destination-out';
  const flick = 1 + Math.sin(t * 11) * 0.05 + Math.sin(t * 17) * 0.03;
  for (const s of lights) {
    const rr = s.r * (s.fire ? flick : 1), g = lctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rr);
    g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g; lctx.fillRect(s.x - rr, s.y - rr, rr * 2, rr * 2);
  }
  lctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(litCanvas, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const s of lights) {
    const rr = s.r * 0.6, g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rr);
    g.addColorStop(0, `rgba(${s.fire ? '255,150,60' : '255,190,100'},${(0.22 * Math.min(1, dark * 1.6)).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(s.x - rr, s.y - rr, rr * 2, rr * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}
