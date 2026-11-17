// The inventory screen (a toolbar of your tools, then a grid of item slots) and the chest in the
// cabin, which stores items out of your bag. Both your bag (state.inv) and the chest (state.chest)
// are "stores" with the same shape, so items move between them unchanged.
import { G } from './game.js';
import { DATA, RARITY_ORDER } from './data.js';
import { iconHTML } from './sprites.js';
import { openMenu, closeAllMenus, toast } from './ui.js';
import { sfx } from './audio.js';
import * as farm from './farm.js';
import { TOOLS } from './player.js';
import { enterPlant } from './modes.js';
import { toolLevel, toolTitle, effectText, upgradeCost, upgradeTool, levelName } from './tools.js';
import { canAfford, costHTML, costLabel } from './economy.js';

const COLS = 8, MIN_SLOTS = 32;
export const emptyStore = () => ({ crops: {}, seeds: {}, unknown: {}, saplings: {}, fruit: {}, fish: {}, bugs: {}, shells: {} });
const rarity = r => DATA.rarities[r]?.name || r;

/* ---------------------------------------------------------------- stacks */
// Every kind of item in a store, as { kind, id, n, name, icon, desc }, in a tidy order.
export function stacks(store) {
  const out = [], add = (kind, id, n, name, icon, desc) => { if (n > 0) out.push({ kind, id, n, name, icon, desc }); };
  for (const g of farm.UNKNOWN_GROUPS) add('seeds', 'u:' + g, store.unknown?.[g]?.length || 0, farm.seedLabel('u:' + g), farm.seedIcon('u:' + g), 'Seeds that keep their secret until they grow. Plant them to find out!');
  for (const r of RARITY_ORDER) for (const c of DATA.crops) if (c.rarity === r) add('seeds', 'c:' + c.id, store.seeds?.[c.id] || 0, `${c.name} seeds`, `seed_${c.id}`, `${rarity(r)} seeds. Each crop sells for ${c.price}.`);
  for (const t of DATA.trees) add('saplings', t.id, store.saplings?.[t.id] || 0, `${t.name} sapling`, `sapling_${t.id}`, t.desc || '');
  for (const r of RARITY_ORDER) for (const c of DATA.crops) if (c.rarity === r) add('crops', c.id, store.crops?.[c.id] || 0, c.name, `item_${c.id}`, `${rarity(r)} crop. Sells for ${c.price} each, or throw it in the water as bait.`);
  for (const t of DATA.trees) if (!t.decorative) add('fruit', t.id, store.fruit?.[t.id] || 0, t.fruit, `fruit_${t.id}`, `Sells for ${t.fruitPrice} each. Leave one on the Great Stump as an offering.`);
  for (const f of DATA.fish) add('fish', f.id, store.fish?.[f.id] || 0, f.name, `fish_${f.id}`, `${rarity(f.rarity)} fish. Sells for ${f.price}.`);
  for (const b of DATA.bugs) add('bugs', b.id, store.bugs?.[b.id] || 0, b.name, `bug_${b.id}`, `Fishing bait, value ${b.price}. The better the bait, the rarer the fish.`);
  for (const s of DATA.shells) add('shells', s.id, store.shells?.[s.id] || 0, s.name, `shell_${s.id}`, `${s.desc || ''} Sells for ${s.price ?? 1}.`);
  return out;
}
export function count(store, kind, id) {
  if (kind === 'seeds') return id.startsWith('u:') ? store.unknown?.[id.slice(2)]?.length || 0 : store.seeds?.[id.slice(2)] || 0;
  return store[kind]?.[id] || 0;
}
// Moves up to n of an item from one store to the other. Returns how many moved.
export function move(from, to, kind, id, n) {
  n = Math.min(n, count(from, kind, id));
  if (n <= 0) return 0;
  if (kind === 'seeds' && id.startsWith('u:')) {
    const g = id.slice(2), list = from.unknown[g];
    (to.unknown[g] ||= []).push(...list.splice(0, n));
    if (!list.length) delete from.unknown[g];
    return n;
  }
  const [bucket, key] = kind === 'seeds' ? ['seeds', id.slice(2)] : [kind, id];
  from[bucket][key] -= n; if (!from[bucket][key]) delete from[bucket][key];
  (to[bucket] ||= {})[key] = (to[bucket][key] || 0) + n;
  return n;
}

/* ------------------------------------------------------------- the grid */
const slot = (s, extra = {}) => ({ label: `<b class="cnt">${s.n}</b>`, iconHTML: iconHTML(s.icon, 'ico'), stack: s, ...extra });
function padSlots(out, used) {
  const total = Math.max(MIN_SLOTS, Math.ceil(used / COLS) * COLS);
  for (let k = used; k < total; k++) out.push({ blank: true });
  return out;
}
function stackDetail(s, extra = '') {
  return `<div class="inv-detail">${iconHTML(s.icon, 'ico huge')}<h3>${s.name}</h3><p>×${s.n}</p><p class="muted">${s.desc}</p>${extra}</div>`;
}

/* ------------------------------------------------------- inventory screen */
export function inventoryScreen() {
  const st = G.state;
  openMenu({
    title: 'Inventory', icon: 'tool_seeds', cls: 'inventory', columns: COLS, live: true,
    subtitle: () => `${iconHTML('item_coin', 'ico sm')} ${st.coins} · ${iconHTML('item_wood', 'ico sm')} ${st.mats.wood || 0} · ${iconHTML('item_stone', 'ico sm')} ${st.mats.stone || 0} · ${iconHTML('item_fiber', 'ico sm')} ${st.mats.fiber || 0}`,
    items: () => {
      const out = TOOLS.map((t, i) => ({
        label: `<span class="pips">${'◆'.repeat(toolLevel(t.id))}</span>`, iconHTML: iconHTML(t.icon, 'ico'), cls: `tool lv${toolLevel(t.id)}` + (st.player.tool === i ? ' equipped' : ''), tool: t,
        onSelect: () => { st.player.tool = i; sfx('move'); toast(`Tool: ${toolTitle(t)}`, t.icon, 1400); },
        onX: () => {
          const cost = upgradeCost(t.id);
          if (!cost) { sfx('error'); toast(`Your ${toolTitle(t).toLowerCase()} is fully upgraded`); return; }
          if (!upgradeTool(t.id)) { sfx('error'); toast(`Need ${costLabel(cost)}`); return; }
          sfx('build'); toast(`Upgraded to the ${toolTitle(t).toLowerCase()}!`, t.icon, 3500);
        },
        xLabel: 'upgrade',
      }));
      while (out.length % COLS) out.push({ blank: true, cls: 'gap' });
      const list = stacks(st.inv);
      for (const s of list) {
        let act;
        if (s.kind === 'seeds') act = () => { st.player.seedKey = s.id; st.player.tool = TOOLS.findIndex(t => t.id === 'seeds'); sfx('move'); toast(`Holding ${s.name}`, s.icon, 1400); };
        if (s.kind === 'saplings') act = () => { closeAllMenus(); enterPlant(s.id); };
        out.push(slot(s, { onSelect: act }));
      }
      return padSlots(out, list.length);
    },
    detail: it => {
      if (it.tool) {
        const t = it.tool, lv = toolLevel(t.id), cost = upgradeCost(t.id);
        const next = cost ? `<p><b>${levelName(t.id, lv + 1)}:</b> ${effectText(t.id, lv + 1)}</p><p>Ⓧ upgrade: ${costHTML(cost)}${canAfford(cost) ? '' : ' <span class="muted">(not enough yet)</span>'}</p>` : '<p class="muted">Fully upgraded!</p>';
        return `<div class="inv-detail">${iconHTML(t.icon, 'ico huge')}<h3>${toolTitle(t)}</h3><p class="muted">${TOOL_HELP[t.id] || ''}</p><p><b>Now:</b> ${effectText(t.id)}</p>${next}<p class="act">${it.cls.includes('equipped') ? 'Equipped' : 'Ⓐ equip'}</p></div>`;
      }
      const s = it.stack; if (!s) return '';
      const act = s.kind === 'seeds' ? (st.player.seedKey === s.id ? 'In your seed bag' : 'Ⓐ put in your seed bag') : s.kind === 'saplings' ? 'Ⓐ plant it' : '';
      return stackDetail(s, act ? `<p class="act">${act}</p>` : '');
    },
    empty: 'Your bag is empty.',
    footer: () => 'Ⓐ use · Ⓧ upgrade a tool · Ⓑ close',
  });
}
const TOOL_HELP = {
  hand: 'Pick, pet, open, harvest. Works with anything.',
  axe: 'Clear debris and chop trees (hold Ⓐ).',
  hoe: 'Till soil in a plot (hold Ⓐ).',
  seeds: 'Plant the seeds you\'re holding (LB/RB to change seeds).',
  can: 'Water crops and fruit trees (hold Ⓐ).',
  shovel: 'Dig open grass for bugs, which are fishing bait (hold Ⓐ).',
  rod: 'Cast your line off the dock once the water is baited.',
};

/* ---------------------------------------------------------- the chest */
export function chestScreen() {
  const st = G.state;
  st.chest ||= emptyStore();
  G.chestOpen = true;
  const m = {
    side: 'bag',
    title: () => (m.side === 'bag' ? 'Chest · from your bag' : 'Chest · stored inside'),
    icon: 'in_treasure_chest', cls: 'inventory chest', columns: COLS, live: true,
    subtitle: () => (m.side === 'bag' ? 'Pick things to put away in the chest. Stored items are safe from selling and baiting.' : 'Pick things to take back out into your bag.') + ' LB/RB switch sides.',
    items: () => {
      const src = m.side === 'bag' ? st.inv : st.chest, dst = m.side === 'bag' ? st.chest : st.inv;
      const list = stacks(src), out = list.map(s => slot(s, {
        onSelect: () => { if (move(src, dst, s.kind, s.id, 1)) sfx('pop'); },
        onX: () => { const n = move(src, dst, s.kind, s.id, s.n); if (n) { sfx('pop'); toast(`${m.side === 'bag' ? 'Stored' : 'Took out'} ${n} ${s.name.toLowerCase()}`, s.icon, 1600); } },
        xLabel: m.side === 'bag' ? 'store all' : 'take all',
      }));
      return padSlots(out, list.length);
    },
    detail: it => { const s = it.stack; if (!s) return ''; return stackDetail(s, `<p class="muted">In your bag: ${count(st.inv, s.kind, s.id)} · In the chest: ${count(st.chest, s.kind, s.id)}</p>`); },
    empty: 'Nothing here.',
    footer: () => (m.side === 'bag' ? 'Ⓐ store one · Ⓧ store all · LB/RB bag ⇄ chest · Ⓑ close' : 'Ⓐ take one · Ⓧ take all · LB/RB bag ⇄ chest · Ⓑ close'),
    onPrev: () => { m.side = m.side === 'bag' ? 'chest' : 'bag'; m.sel = 0; },
    onNext: () => { m.side = m.side === 'bag' ? 'chest' : 'bag'; m.sel = 0; },
    onClose: () => { G.chestOpen = false; sfx('cancel'); },
  };
  sfx('confirm');
  openMenu(m);
}
