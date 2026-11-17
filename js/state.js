// Game state creation, save/load (versioned with migrations), export/import, settings.
import { G, randInt, pickWeighted, hash2 } from './game.js';
import { DATA, readLS, writeLS } from './data.js';
import { DEFAULT_BINDINGS } from './input.js';
import { homeDefaults, fixHome } from './interior.js';
import { spiritDefaults, placeStump } from './spirits.js';
import { emptyStore } from './inventory.js';

export const SAVE_KEY = 'srnmv.save';
export const SETTINGS_KEY = 'srnmv.settings';
export const SAVE_VERSION = 3;

// Each migration upgrades a save from version i to i+1.
const MIGRATIONS = [
  // 0 -> 1: initial schema (nothing to do)
  s => s,
  // 1 -> 2: clear a tile of riverbank on both sides of the river so a bridge can be built
  s => { clearRiverBanks(s.map); return s; },
  // 2 -> 3: hide the Great Stump somewhere in the forest
  s => { s.spirit = { ...spiritDefaults(), stump: placeStump(s.map) }; return s; },
];

// Turns the forest (and any debris) on the tile either side of the river into open grass, so
// there's always room to build a bridge across. The river is the narrow run of water in each
// row above the lake; the lake's own rows (and the few just above, where its shore wobbles)
// are left alone.
export function clearRiverBanks(map, stopAt = Infinity) {
  const { w, h, ground, obj } = map;
  let lakeStart = h;
  for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (ground[y * w + x] === 'w') n++; if (n > w / 2) { lakeStart = y; break; } }
  for (let y = 0; y < Math.min(lakeStart - 3, stopAt); y++) {
    for (let x = 0; x < w; x++) {
      if (ground[y * w + x] !== 'w' || (x > 0 && ground[y * w + x - 1] === 'w')) continue;
      let len = 0; while (x + len < w && ground[y * w + x + len] === 'w') len++;
      if (len > 4) continue;
      for (const bx of [x - 1, x + len]) {
        if (bx < 0 || bx >= w) continue;
        const i = y * w + bx;
        if (ground[i] === 'f') ground[i] = 'g';
        if (obj[i] && obj[i].startsWith('d:')) obj[i] = null;
      }
    }
  }
}

export const CABIN_DEFAULTS = { roof: 'red', wall: 'oak', door: 0, windowBoxes: false, chimney: 'stone', curtains: 'none', welcomeMat: false, porchSwing: false, porch: false };

export function defaultSettings() {
  return {
    timeMode: 'real', // real clock or 'fast'
    master: 0.8, ambient: 0.7, sfx: 0.8, quiet: false,
    hudAutoHide: true, cameraDrift: true, showControllerOverlay: false,
    liveWeather: true, // follow the real weather (data/weather.json)
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
  // a small oval clearing with a wobbly edge in the middle of the woods; chop trees to grow it
  const mx = w / 2, my = h / 2, RX = B.map.clearingRadiusX, RY = B.map.clearingRadiusY, wob = B.map.edgeWobble ?? 0.2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + 0.5 - mx) / RX, dy = (y + 0.5 - my) / RY;
    const noise = (hash2(Math.floor(x / 2), Math.floor(y / 2), seed) - 0.5) * 2 * wob;
    if (Math.hypot(dx, dy) > 1 + noise) ground[y * w + x] = 'f';
  }
  // below the clearing: a band of forest (chop through it), then a sandy beach, then the lake to the bottom edge
  const L = B.map.lake || {}, Rv = B.map.river || {};
  const Bc = B.map.beach || {}, bMin = Bc.minDepth ?? 2, bMax = Bc.maxDepth ?? 3;
  const lakeTop = Math.floor(my + RY) + (L.forestBelowClearing ?? 2) + bMax + 1;
  const beachTop = new Array(w).fill(h);
  const shoreAt = x => lakeTop + Math.round(Math.sin(x / 4.3 + seed % 5) * (L.shoreWobble ?? 1.4) + (hash2(Math.floor(x / 3), 9, seed) - 0.5) * 1.6);
  for (let x = 0; x < w; x++) {
    const shore = Math.max(0, shoreAt(x));
    for (let y = shore; y < h; y++) ground[y * w + x] = 'w';
    const depth = bMin + Math.round((Math.sin(x / 5 + seed % 3) * 0.5 + 0.5) * (bMax - bMin) * 0.6 + hash2(Math.floor(x / 2), 21, seed) * (bMax - bMin) * 0.4);
    for (let y = Math.max(0, shore - depth); y < shore; y++) ground[y * w + x] = 's';
    beachTop[x] = Math.max(0, shore - depth);
  }
  // a river from the top edge, down the left side of the clearing, into the lake
  const rw = Rv.width ?? 2, riverX = Math.floor(mx - RX) - (Rv.gapLeftOfClearing ?? 1) - rw;
  for (let y = 0; y < h; y++) {
    const x0 = Math.round(riverX + Math.sin(y / 5 + seed % 7) * (Rv.meander ?? 1.4));
    let reached = false;
    for (let x = x0; x < x0 + rw; x++) { if (ground[y * w + x] === 'w' && y > lakeTop - 3) reached = true; ground[y * w + x] = 'w'; }
    if (reached) break;
  }
  // cabin and props, a little north of the middle
  const cx = Math.floor(mx) - 2, cy = Math.floor(my) - 4;
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
  // the beach starts out of reach: at least minForestToBeach rows of trees above it in every column
  // (the river keeps flowing through; its open banks stop at the trees, too)
  const band = L.minForestToBeach ?? 5;
  for (let x = 0; x < w; x++) for (let y = Math.max(0, beachTop[x] - band); y < beachTop[x]; y++) { const i = y * w + x; if (ground[i] !== 'w') { ground[i] = 'f'; obj[i] = null; } }
  clearRiverBanks({ w, h, ground, obj }, Math.min(...beachTop) - band);
  const stump = placeStump({ w, h, ground, obj });
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
    player: { x: (cx + 1) * 16 + 8, y: (cy + 3) * 16 + 12, dir: 'down', tool: 0, seedSel: 0, toolLevels: {} },
    coins: E.startCoins,
    mats: { wood: 0, stone: 0, fiber: 0 },
    inv: { crops: {}, seeds: {}, unknown, shells: {}, saplings: {}, fruit: {}, fish: {}, bugs: {} },
    bugsFound: {},
    chest: emptyStore(), // the chest in the cabin (inventory.js)
    fishFound: {},
    trees: {},
    fruitFound: {},
    shellsFound: {},
    discovered: {},
    map: { w, h, ground, obj },
    cabin: { x: cx, y: cy, ...CABIN_DEFAULTS },
    home: homeDefaults(), // inside the cabin (interior.js)
    spirit: { ...spiritDefaults(), stump }, // the Great Stump and visiting spirits (spirits.js)
    props: { crate, shop },
    plots: [],
    nextPlotId: 1,
    crops: {},       // tileIndex -> { id, stage, g, wetUntil, hidden }
    lastCrop: {},    // tileIndex -> cropId harvested there last
    jobs: [],
    nextJobId: 1,
    cats: {},        // catId -> { x, y, energy, done:{type:n} }
    decorState: {},
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
  s.inv.crops ||= {}; s.inv.seeds ||= {}; s.inv.unknown ||= {}; s.inv.shells ||= {}; s.shellsFound ||= {};
  s.inv.saplings ||= {}; s.inv.fruit ||= {}; s.inv.fish ||= {}; s.inv.bugs ||= {}; s.bugsFound ||= {};
  s.chest = { ...emptyStore(), ...(s.chest || {}) };
  s.player.toolLevels ||= {}; s.fishFound ||= {}; s.trees ||= {}; s.fruitFound ||= {};
  for (const [k, t] of Object.entries(s.trees)) { if (t.v == null) t.v = Math.abs((+k * 2654435761) | 0) % 5; delete t.flip; }
  for (const [k, t] of Object.entries(s.trees)) if (!DATA.treeById[t.id]) { delete s.trees[k]; if (s.map.obj[k]?.startsWith('o:')) s.map.obj[k] = null; }
  s.mats ||= { wood: 0, stone: 0, fiber: 0 };
  s.stats ||= {};
  s.decorState ||= {};
  s.cabin = { ...CABIN_DEFAULTS, ...s.cabin };
  fixHome(s);
  s.spirit = { ...spiritDefaults(), ...(s.spirit || {}) };
  if (s.spirit.visit && !DATA.spirits.animals[s.spirit.visit.animal]) s.spirit.visit = null;
  for (let i = 0; i < s.map.obj.length; i++) { const o = s.map.obj[i]; if (o && o.startsWith('x:') && !DATA.decor[o.slice(2)]) s.map.obj[i] = null; }
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
