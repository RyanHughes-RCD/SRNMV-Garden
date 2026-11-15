// Crops: seeds, planting, growth, harvest, discovery, the shop and selling.
import { G, randInt, rand } from './game.js';
import { DATA, RARITY_ORDER } from './data.js';
import { plotAt } from './world.js';

/* Seed keys:  'c:<cropId>' known seeds · 'u:<group>' unidentified packets · 'same' replant what was harvested */
export const UNKNOWN_GROUPS = ['mystery', ...RARITY_ORDER];

export function seedCount(k) {
  if (!k || k === 'same') return 0;
  const inv = G.state.inv;
  if (k.startsWith('c:')) return inv.seeds[k.slice(2)] || 0;
  if (k.startsWith('u:')) return inv.unknown[k.slice(2)]?.length || 0;
  return 0;
}
export function seedLabel(k) {
  if (!k) return 'No seed';
  if (k === 'same') return 'Replant same crop';
  if (k.startsWith('c:')) { const c = DATA.cropById[k.slice(2)]; return c ? `${c.name} seeds` : 'Unknown'; }
  const g = k.slice(2);
  return g === 'mystery' ? 'Mystery seeds' : `Unknown ${DATA.rarities[g]?.name || g} seeds`;
}
export function seedIcon(k) {
  if (!k || k === 'same') return 'tool_seeds';
  if (k.startsWith('c:')) return `seed_${k.slice(2)}`;
  return `seedpack_${k.slice(2)}`;
}
export function ownedSeedKeys() {
  const out = [];
  for (const g of UNKNOWN_GROUPS) if (seedCount('u:' + g) > 0) out.push('u:' + g);
  for (const r of RARITY_ORDER) for (const c of DATA.crops) if (c.rarity === r && seedCount('c:' + c.id) > 0) out.push('c:' + c.id);
  return out;
}
function takeSeed(k) {
  const inv = G.state.inv;
  if (k.startsWith('c:')) { const id = k.slice(2); if (!(inv.seeds[id] > 0)) return null; inv.seeds[id]--; if (!inv.seeds[id]) delete inv.seeds[id]; return id; }
  if (k.startsWith('u:')) { const list = inv.unknown[k.slice(2)]; if (!list?.length) return null; const id = list.splice(randInt(0, list.length - 1), 1)[0]; if (!list.length) delete inv.unknown[k.slice(2)]; return id; }
  return null;
}
export function plotSeedKeyForTile(p, tile) {
  const last = G.state.lastCrop[tile];
  if (!p.seed || p.seed === 'same') return last ? 'c:' + last : null;
  if (seedCount(p.seed) <= 0 && last) return 'c:' + last;
  return p.seed;
}

export function plantTile(tile, k) {
  const id = takeSeed(k);
  if (!id) return null;
  G.state.crops[tile] = { id, stage: 0, g: 0, wetUntil: 0 };
  G.state.stats.planted = (G.state.stats.planted || 0) + 1;
  G.emit('planted', { tile, id });
  return id;
}

export const isDiscovered = id => !!G.state.discovered[id];
export const cropName = id => (isDiscovered(id) ? DATA.cropById[id]?.name : '???');
export const stageSeconds = c => (DATA.cropById[c.id]?.growMinutes ?? 30) * 60 / 3;

export function growthRate(c) {
  const st = G.state, def = DATA.cropById[c.id];
  return 1 + (c.wetUntil > st.simTime ? DATA.balance.farm.waterGrowthBonus * (def?.waterMult ?? 1) : 0);
}
export function updateCrops(dt) {
  const st = G.state;
  for (const k in st.crops) {
    const c = st.crops[k];
    if (c.stage >= 3) continue;
    c.g += dt * growthRate(c);
    const ns = Math.min(3, Math.floor(c.g / stageSeconds(c)));
    if (ns > c.stage) { c.stage = ns; G.emit('stage', { tile: +k, crop: c }); }
  }
}
export function timeToNextStage(c) {
  if (c.stage >= 3) return 0;
  return ((c.stage + 1) * stageSeconds(c) - c.g) / growthRate(c);
}

export function harvest(tile) {
  const st = G.state, c = st.crops[tile];
  if (!c || c.stage < 3) return null;
  const def = DATA.cropById[c.id], F = DATA.balance.farm;
  delete st.crops[tile];
  st.lastCrop[tile] = c.id;
  const n = F.cropYield;
  st.inv.crops[c.id] = (st.inv.crops[c.id] || 0) + n;
  const seeds = rand() < F.doubleSeedChance ? 2 : 1;
  st.inv.seeds[c.id] = (st.inv.seeds[c.id] || 0) + seeds;
  st.stats.harvested = (st.stats.harvested || 0) + 1;
  const first = !st.discovered[c.id];
  if (first) st.discovered[c.id] = { at: Date.now(), harvested: 0 };
  st.discovered[c.id].harvested++;
  const res = { tile, id: c.id, def, crops: n, seeds, first };
  G.emit('harvest', res);
  if (first) G.emit('discover', res);
  return res;
}

export function sell(id, n) {
  const inv = G.state.inv.crops, have = inv[id] || 0;
  n = Math.min(n, have);
  if (n <= 0) return 0;
  const coins = n * (DATA.cropById[id]?.price ?? 1);
  inv[id] = have - n; if (!inv[id]) delete inv[id];
  G.state.coins += coins;
  G.state.stats.sold = (G.state.stats.sold || 0) + n;
  G.state.stats.earned = (G.state.stats.earned || 0) + coins;
  G.emit('sold', { id, n, coins });
  return coins;
}
export function sellAll() { let total = 0; for (const id of Object.keys(G.state.inv.crops)) total += sell(id, G.state.inv.crops[id]); return total; }

export function packPrice(r) { return DATA.rarities[r]?.packPrice ?? 999999; }
export function buyPack(r) {
  const st = G.state, price = packPrice(r);
  if (st.coins < price) return null;
  const pool = DATA.crops.filter(c => c.rarity === r);
  if (!pool.length) return null;
  st.coins -= price;
  const id = pool[randInt(0, pool.length - 1)].id;
  let n = DATA.rarities[r].packSeeds ?? 2;
  if (rand() < DATA.balance.economy.packBonusSeedChance) n++;
  for (let k = 0; k < n; k++) (st.inv.unknown[r] ||= []).push(id);
  G.emit('boughtPack', { rarity: r, n });
  return { rarity: r, n };
}

export function stageHint(c) {
  const def = DATA.cropById[c.id];
  if (c.stage >= 3) return isDiscovered(c.id) ? 'Ready to harvest!' : 'Ready to harvest! What could it be?';
  return def?.hints?.[Math.max(0, c.stage - 0)] || 'Growing...';
}
export function cropAtPlot(tile) { return plotAt(tile); }
