// Loads the JSON data files and applies any Workshop overrides from localStorage.
export const DATA = {};
export const OVERRIDE_KEYS = {
  sprites: 'srnmv.override.sprites',
  cats: 'srnmv.override.cats',
  players: 'srnmv.override.players',
};
const FILES = ['balance', 'crops', 'debris', 'decor', 'cats', 'players', 'sprites'];

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
  DATA.decor = b.decor.decor;
  DATA.cabinOptions = b.decor.cabin;
  DATA.sprites = mergeSprites(b.sprites, readLS(OVERRIDE_KEYS.sprites));
  const cats = readLS(OVERRIDE_KEYS.cats);
  DATA.catsConfig = cats && Array.isArray(cats.cats) ? cats : b.cats;
  const players = readLS(OVERRIDE_KEYS.players);
  DATA.playersConfig = players && Array.isArray(players.players) ? players : b.players;
}

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary', 'mystical'];
