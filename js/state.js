// Game state creation, save/load (versioned with migrations), export/import, settings.
import { G, randInt, pickWeighted, hash2 } from './game.js';
import { DATA, readLS, writeLS } from './data.js';
import { DEFAULT_BINDINGS } from './input.js';

export const SAVE_KEY = 'srnmv.save';
export const SETTINGS_KEY = 'srnmv.settings';
export const SAVE_VERSION = 1;

// Each migration upgrades a save from version i to i+1.
const MIGRATIONS = [
  // 0 -> 1: initial schema (nothing to do)
  s => s,
];

export function defaultSettings() {
  return {
    timeMode: 'real', // real clock or 'fast'
    master: 0.8, ambient: 0.7, sfx: 0.8, quiet: false,
    hudAutoHide: true, cameraDrift: true, showControllerOverlay: false,
    bindings: structuredClone(DEFAULT_BINDINGS),
  };
}
export function loadSettings() {
  const s = { ...defaultSettings(), ...(readLS(SETTINGS_KEY) || {}) };
  s.bindings = { pad: { ...DEFAULT_BINDINGS.pad, ...(s.bindings?.pad || {}) }, keys: { ...DEFAULT_BINDINGS.keys, ...(s.bindings?.keys || {}) } };
  return s;
}
export function saveSettings() { writeLS(SETTINGS_KEY, G.settings); }

/* ----------------------------------------------------------- new game */
export function newGame() {
  const B = DATA.balance;
  const w = B.map.width, h = B.map.height;
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  const ground = new Array(w * h).fill('g');
  const obj = new Array(w * h).fill(null);
  const fd = B.map.forestDepth;
  // forest ring with a wobbly inner edge
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.min(x, y, w - 1 - x, h - 1 - y);
    const wobble = Math.floor(hash2(Math.floor(x / 3), Math.floor(y / 3), seed) * 2.2);
    if (d < fd + wobble) ground[y * w + x] = 'f';
  }
  // cabin and props
  const cx = Math.floor(w / 2) - 1, cy = fd + 4;
  for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 3; x++) obj[y * w + x] = 'cabin';
  // clear the forest above the cabin roof so it doesn't clip into trees
  for (let y = cy - 2; y < cy + 4; y++) for (let x = cx - 3; x < cx + 6; x++) ground[y * w + x] = 'g';
  const crate = { x: cx + 4, y: cy + 1 }, shop = { x: cx - 2, y: cy + 1 };
  obj[crate.y * w + crate.x] = 'crate';
  obj[shop.y * w + shop.x] = 'shop';
  // a short stone path from the door
  for (let y = cy + 2; y < cy + 4; y++) ground[y * w + cx + 1] = 'path_stone';
  // debris
  const R = B.map.clearRadiusAroundCabin;
  const weights = Object.entries(DATA.debris).map(([k, d]) => [k, d.weight]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (ground[i] !== 'g' || obj[i]) continue;
    if (Math.abs(x - (cx + 1)) <= R && y >= cy - 1 && y <= cy + R) continue;
    if (Math.random() < B.map.debrisDensity) obj[i] = 'd:' + pickWeighted(weights);
  }
  const E = B.economy;
  const unknown = {};
  for (let p = 0; p < E.startMysteryPacks; p++) {
    const r = pickWeighted(Object.entries(E.mysteryRarityWeights));
    const pool = DATA.crops.filter(c => c.rarity === r);
    const crop = pool[randInt(0, pool.length - 1)].id;
    for (let k = 0; k < E.mysteryPackSeeds; k++) (unknown.mystery ||= []).push(crop);
  }
  return {
    version: SAVE_VERSION,
    created: Date.now(),
    lastSaved: Date.now(),
    simTime: 0,
    activePlayer: 0,
    player: { x: (cx + 1) * 16 + 8, y: (cy + 3) * 16 + 12, dir: 'down', tool: 0, seedSel: 0 },
    coins: E.startCoins,
    mats: { wood: 0, stone: 0, fiber: 0 },
    inv: { crops: {}, seeds: {}, unknown },
    discovered: {},
    map: { w, h, ground, obj },
    cabin: { x: cx, y: cy, roof: 'red', wall: 'oak', door: 0, windowBoxes: false },
    props: { crate, shop },
    plots: [],
    nextPlotId: 1,
    crops: {},       // tileIndex -> { id, stage, g, wetUntil, hidden }
    lastCrop: {},    // tileIndex -> cropId harvested there last
    jobs: [],
    nextJobId: 1,
    cats: {},        // catId -> { x, y, energy, done:{type:n} }
    stats: { harvested: 0, cleared: 0, tilled: 0, planted: 0, watered: 0, sold: 0, earned: 0 },
  };
}

/* ------------------------------------------------------------ save/load */
export function serialize() {
  const s = G.state;
  s.lastSaved = Date.now();
  // persist cat positions/energy
  for (const c of G.cats) s.cats[c.id] = { x: Math.round(c.x), y: Math.round(c.y), energy: +c.energy.toFixed(3), done: c.done };
  return JSON.stringify(s);
}
export function saveGame() {
  if (!G.state || G.noSave || G.mode === 'boot' || G.offline) return false;
  try { localStorage.setItem(SAVE_KEY, serialize()); return true; } catch (e) { console.warn('save failed', e); return false; }
}
export function migrate(s) {
  if (!s || typeof s !== 'object') throw new Error('Not a save file');
  let v = s.version ?? 0;
  if (v > SAVE_VERSION) throw new Error('Save is from a newer version of the game');
  while (v < SAVE_VERSION) { s = MIGRATIONS[v](s); v++; s.version = v; }
  validate(s);
  return s;
}
function validate(s) {
  const ok = s.map && Array.isArray(s.map.ground) && s.map.ground.length === s.map.w * s.map.h && Array.isArray(s.map.obj) && s.inv && s.player;
  if (!ok) throw new Error('Save file is damaged');
  s.jobs ||= []; s.plots ||= []; s.crops ||= {}; s.lastCrop ||= {}; s.discovered ||= {}; s.cats ||= {};
  s.inv.crops ||= {}; s.inv.seeds ||= {}; s.inv.unknown ||= {};
  s.mats ||= { wood: 0, stone: 0, fiber: 0 };
  s.stats ||= {};
  // drop crops/jobs that reference data that no longer exists
  for (const [k, c] of Object.entries(s.crops)) if (!DATA.cropById[c.id]) delete s.crops[k];
  for (const k of Object.keys(s.inv.seeds)) if (!DATA.cropById[k]) delete s.inv.seeds[k];
  for (const [g, list] of Object.entries(s.inv.unknown)) s.inv.unknown[g] = list.filter(id => DATA.cropById[id]);
}
export function loadGame() {
  const raw = (() => { try { return localStorage.getItem(SAVE_KEY); } catch { return null; } })();
  if (!raw) return null;
  try { return migrate(JSON.parse(raw)); } catch (e) { console.warn('load failed', e); return null; }
}
export function exportSave() {
  const blob = new Blob([serialize()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `garden-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function importSaveFile() {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try { const s = migrate(JSON.parse(await inp.files[0].text())); localStorage.setItem(SAVE_KEY, JSON.stringify(s)); resolve(s); }
      catch (e) { reject(e); }
    };
    inp.click();
  });
}
export function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
