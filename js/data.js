// Loads the JSON data files and applies any Workshop overrides from localStorage.
export const DATA = {};
export const OVERRIDE_KEYS = {
  sprites: 'srnmv.override.sprites',
  cats: 'srnmv.override.cats',
  players: 'srnmv.override.players',
};
const FILES = ['balance', 'crops', 'debris', 'decor', 'cats', 'players', 'sprites', 'shells'];

export function readLS(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
export function writeLS(key, value) { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

export async function loadData(base = '') {
  const res = await Promise.all(FILES.map(f => fetch(`${base}data/${f}.json`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`Could not load data/${f}.json`); return r.json(); })));
  FILES.forEach((f, i) => { DATA.base ||= {}; DATA.base[f] = res[i]; });
  applyOverrides();
}

export function mergeSprites(base, ov) {
  const out = { ...base, palette: [...base.palette], swaps: { ...base.swaps }, sprites: { ...base.sprites } };
  if (ov) {
    if (Array.isArray(ov.palette) && ov.palette.length === base.palette.length) out.palette = [...ov.palette];
    if (ov.swaps) Object.assign(out.swaps, ov.swaps);
    if (ov.sprites) for (const [k, v] of Object.entries(ov.sprites)) out.sprites[k] = v;
    if (ov.deleted) for (const k of ov.deleted) delete out.sprites[k];
  }
  return out;
}

export function applyOverrides() {
  const b = DATA.base;
  DATA.balance = b.balance;
  DATA.crops = b.crops.crops;
  DATA.rarities = b.crops.rarities;
  DATA.cropById = Object.fromEntries(DATA.crops.map(c => [c.id, c]));
  DATA.debris = b.debris.debris;
  DATA.shells = b.shells?.shells || [];
  DATA.shellById = Object.fromEntries(DATA.shells.map(s => [s.id, s]));
  DATA.shellWashUp = b.shells?.washUp || { everySec: 1200, maxOnBeach: 4 };
  DATA.decor = b.decor.decor;
  DATA.decorCategories = b.decor.categories || [];
  DATA.letters = b.decor.letters || [];
  DATA.catHouse = b.decor.catHouse || {};
  DATA.cabinOptions = b.decor.cabin;
  DATA.sprites = mergeSprites(b.sprites, readLS(OVERRIDE_KEYS.sprites));
  const cats = readLS(OVERRIDE_KEYS.cats);
  DATA.catsConfig = cats && Array.isArray(cats.cats) ? cats : b.cats;
  const players = readLS(OVERRIDE_KEYS.players);
  if (players && Array.isArray(players.players) && (players.spritesVersion || 0) < (b.players.spritesVersion || 0)) {
    // The default character art changed since these profiles were saved in the Workshop:
    // switch them to the new sprite sets, keeping names and colours.
    for (const pl of players.players) { const def = b.players.players.find(q => q.id === pl.id); if (def) pl.spriteSet = def.spriteSet; }
    players.spritesVersion = b.players.spritesVersion;
    writeLS(OVERRIDE_KEYS.players, players);
  }
  DATA.playersConfig = players && Array.isArray(players.players) ? players : b.players;
}

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary', 'mystical'];
