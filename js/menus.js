// Every menu screen: pause, inventory, plots, shop, selling, build, cabin, almanac, cats, settings, debug.
import { G, fmtTime } from './game.js';
import { DATA, RARITY_ORDER } from './data.js';
import { input, ACTIONS, ACTION_LABELS, PAD_BUTTON_NAMES, DEFAULT_BINDINGS } from './input.js';
import { iconHTML, slotSwap, optionSwap } from './sprites.js';
import { openMenu, closeMenu, closeAllMenus, confirmDialog, textInput, toast, refreshMenu, esc, catPortrait, playerPortrait, replaceMenu } from './ui.js';
import * as farm from './farm.js';
import { saveSettings, saveGame, exportSave, importSaveFile, deleteSave } from './state.js';
import { applyVolumes, sfx } from './audio.js';
import { enterPlace, enterPlant } from './modes.js';
import { canAfford, pay, costHTML, costLabel } from './economy.js';
import { decorState, catHouseLook, catHouseOf, drawCatHouse } from './decorations.js';
import { buySapling, sellFruit, stageSec, fruitSec } from './orchard.js';
import { baitOf, baitQuality, rarityOdds, baitItems, addBait, sellFish } from './fishing.js';
import { switchPlayer, playerName, TOOLS } from './player.js';
import { plotTiles } from './world.js';
import { JOB_VERB } from './jobs.js';
import * as brain from './catbrain.js';
import { isInside, furnitureMenu, surfacesMenu, upgradesMenu, leaveCabin } from './interior.js';
import { arrive as spiritArrive } from './spirits.js';
import { DEBUG_WEATHERS } from './weather.js';
import { inventoryScreen } from './inventory.js';

const pct = v => `${Math.round(v * 100)}%`;
const bar = (v, max = 1) => `<span class="bar"><span style="width:${Math.round(Math.max(0, Math.min(100, (v / max) * 100)) / 5) * 5}%"></span></span>`;
const rarityName = r => DATA.rarities[r]?.name || r;
const rarityTag = r => `<span class="rar rar-${r}">${rarityName(r)}</span>`;

/* ---------------------------------------------------------------- pause */
export function pauseMenu() {
  const pl = DATA.playersConfig.players;
  openMenu({
    title: 'Garden menu', icon: 'tool_seeds',
    items: () => [
      ...(isInside() ? [
        { label: 'Back to the cabin', icon: 'in_armchair', onSelect: closeAllMenus },
        { label: 'Decorate the cabin', icon: 'in_sofa', sub: 'Furniture, rugs and things for the walls (or press Ⓨ)', onSelect: furnitureMenu },
        { label: 'Floors & walls', icon: 'in_floor_oak_0', onSelect: surfacesMenu },
        { label: 'Cabin rooms', icon: 'in_bed', sub: 'Bigger living room, kitchen, bedroom', onSelect: upgradesMenu },
        { label: 'Go outside', icon: 'in_exit', onSelect: () => { closeAllMenus(); leaveCabin(); } },
      ] : [{ label: 'Back to the garden', icon: 'tool_hand', onSelect: closeAllMenus }]),
      { label: 'Inventory', icon: 'tool_seeds', sub: 'Your tools and everything in your bag', onSelect: inventoryScreen },
      { label: 'Garden plots', icon: 'tool_hoe', sub: 'Choose what each plot grows', onSelect: plotsMenu },
      { label: 'Seed shop', icon: 'shop', sub: 'Mystery seed packs', onSelect: shopMenu },
      { label: 'Sell crops', icon: 'crate', onSelect: sellMenu },
      { label: 'Build & decorate', icon: 'decor_lantern', onSelect: buildMenu },
      { label: 'Cabin', icon: 'cabin_door_0', onSelect: cabinMenu },
      { label: 'Almanac', icon: 'item_carrot', right: `${Object.keys(G.state.discovered).length + Object.keys(G.state.fishFound || {}).length}/${DATA.crops.length + DATA.fish.length}`, onSelect: almanacMenu },
      { label: 'Cats', iconHTML: catPortrait(DATA.catsConfig.cats[0] || {}), onSelect: catsMenu },
      { label: `Switch player`, iconHTML: playerPortrait(pl[(G.state.activePlayer + 1) % pl.length]), sub: `Now playing: ${esc(playerName())}`, onSelect: () => { closeAllMenus(); switchPlayer(); } },
      { label: 'Settings', icon: 'tool_hand', onSelect: settingsMenu },
      { label: 'How to play', icon: 'icon_question', onSelect: helpMenu },
    ],
  });
}


/* ---------------------------------------------------------------- plots */
export function plotsMenu() {
  openMenu({
    title: 'Garden plots', icon: 'tool_hoe', live: true,
    subtitle: 'Each plot replants its chosen seed after you harvest. Make new plots in Plan mode (Ⓨ).',
    empty: 'No plots yet. Press Ⓨ in the garden, pick "New plot" and choose two corners.',
    items: () => G.state.plots.map(p => {
      const tiles = plotTiles(p), grown = tiles.filter(t => G.state.crops[t]).length, ready = tiles.filter(t => G.state.crops[t]?.stage >= 3).length;
      return { label: esc(p.name), icon: farm.seedIcon(p.seed), sub: `${p.w}×${p.h} · ${farm.seedLabel(p.seed)}${ready ? ` · ${ready} ready!` : ''}`, right: `${grown}/${tiles.length}`, onSelect: () => plotMenu(p) };
    }),
  });
}
function plotMenu(p) {
  openMenu({
    title: () => esc(p.name), icon: 'tool_hoe',
    items: () => [
      { label: 'Seed to grow', icon: farm.seedIcon(p.seed), right: farm.seedLabel(p.seed), sub: p.seed !== 'same' ? `You have ${farm.seedCount(p.seed)}` : 'Harvested crops are replanted with their own seeds', onSelect: () => seedPicker(p) },
      { label: 'Rename', icon: 'icon_mark', onSelect: () => textInput('Name this plot', p.name, t => { p.name = t; refreshMenu(); }) },
      { label: 'Remove plot', icon: 'icon_exclaim', sub: 'Crops stay planted; the cats stop tending it', onSelect: () => confirmDialog(`Remove "${esc(p.name)}"?`, () => { G.state.plots = G.state.plots.filter(q => q !== p); closeMenu(); toast(`Removed ${esc(p.name)}`); }) },
    ],
  });
}
function seedPicker(p) {
  const keys = ['same', ...farm.ownedSeedKeys()];
  if (!keys.includes(p.seed)) keys.push(p.seed);
  openMenu({
    title: 'Choose a seed', icon: 'tool_seeds', sel: Math.max(0, keys.indexOf(p.seed)),
    items: keys.map(k => ({ label: farm.seedLabel(k), icon: farm.seedIcon(k), right: k === 'same' ? '' : `×${farm.seedCount(k)}`, sub: k === p.seed ? 'Current' : '', onSelect: () => { p.seed = k; closeMenu(); toast(`${esc(p.name)} will grow ${farm.seedLabel(k)}`, farm.seedIcon(k)); } })),
  });
}

/* ----------------------------------------------------------------- shop */
export function shopMenu() {
  openMenu({
    title: 'Seed shop', icon: 'shop', live: true,
    subtitle: () => `Packs never say what's inside. Grow them to find out! · ${iconHTML('item_coin', 'ico sm')} ${G.state.coins}`,
    items: () => [{ header: true, label: 'Mystery seed packs' }, ...RARITY_ORDER.map(r => {
      const price = farm.packPrice(r), R = DATA.rarities[r];
      const found = DATA.crops.filter(c => c.rarity === r && G.state.discovered[c.id]).length, total = DATA.crops.filter(c => c.rarity === r).length;
      return {
        label: `${rarityName(r)} seed pack`, icon: `seedpack_${r}`,
        sub: `${R.packSeeds}+ seeds of one mystery crop · found ${found}/${total}`,
        right: `${iconHTML('item_coin', 'ico sm')}${price}`, disabled: G.state.coins < price, why: `Not enough coins (need ${price})`,
        onSelect: () => { const res = farm.buyPack(r); if (res) { sfx('coin'); toast(`Got ${res.n} unknown ${rarityName(r)} seeds!`, `seedpack_${r}`); } },
      };
    }),
    ...[['Fruit tree saplings', false], ['Decorative tree saplings', true]].flatMap(([head, deco]) => [{ header: true, label: head }, ...DATA.trees.filter(t => !!t.decorative === deco).map(t => ({
      label: `${t.name} sapling`, icon: `sapling_${t.id}`,
      sub: deco ? `${t.desc} Full-grown in ~${t.growHours}h · own ${G.state.inv.saplings[t.id] || 0}` : `Full-grown in ~${t.growHours}h, then ${t.yield[0]}-${t.yield[1]} ${(t.fruitPlural || t.fruit).toLowerCase()} every ~${t.fruitHours}h · own ${G.state.inv.saplings[t.id] || 0}`,
      right: `${iconHTML('item_coin', 'ico sm')}${t.saplingPrice}`, disabled: G.state.coins < t.saplingPrice, why: `Not enough coins (need ${t.saplingPrice})`,
      onSelect: () => { if (buySapling(t.id)) { sfx('coin'); toast(`Bought a ${t.name.toLowerCase()} sapling. Plant it from your inventory`, `sapling_${t.id}`); } },
    }))])],
  });
}
export function sellMenu() {
  openMenu({
    title: 'Shipping crate', icon: 'crate', live: true,
    subtitle: () => `${iconHTML('item_coin', 'ico sm')} ${G.state.coins} coins`,
    empty: 'Nothing to sell yet. Harvest some crops first!',
    items: () => {
      const crops = Object.entries(G.state.inv.crops).filter(([, n]) => n > 0);
      const shells = [...fishSellItems(), ...fruitSellItems(), ...shellSellItems()];
      if (!crops.length) return shells;
      const total = crops.reduce((a, [id, n]) => a + n * DATA.cropById[id].price, 0);
      return [
        { label: 'Sell all crops', icon: 'item_coin', right: `+${total}`, onSelect: () => { const c = farm.sellAll(); if (c) { sfx('coin'); toast(`Sold everything for ${c} coins`, 'item_coin'); } } },
        ...shells,
        ...crops.map(([id, n]) => { const c = DATA.cropById[id]; return { label: c.name, icon: `item_${id}`, sub: `${c.price} each · Ⓐ sell one · Ⓧ sell all`, right: `×${n}`, xLabel: 'sell all', onSelect: () => { if (farm.sell(id, 1)) sfx('coin'); }, onX: () => { const v = farm.sell(id, n); if (v) { sfx('coin'); toast(`Sold ${n} ${c.name} for ${v} coins`, `item_${id}`); } } }; }),
      ];
    },
  });
}

/* ---------------------------------------------------------------- build */
function sellShell(id, n) {
  const inv = G.state.inv.shells, have = inv[id] || 0; n = Math.min(n, have);
  if (n <= 0) return 0;
  const coins = n * (DATA.shellById[id]?.price ?? 1);
  inv[id] = have - n; if (!inv[id]) delete inv[id];
  G.state.coins += coins;
  return coins;
}
function fishSellItems() {
  const list = Object.entries(G.state.inv.fish || {}).filter(([, n]) => n > 0);
  if (!list.length) return [];
  return [{ header: true, label: 'Fish' }, ...list.map(([id, n]) => { const f = DATA.fishById[id]; return { label: f.name, icon: `fish_${id}`, sub: `${f.price} each · Ⓐ sell one · Ⓧ sell all`, right: `×${n}`, xLabel: 'sell all', onSelect: () => { if (sellFish(id, 1)) sfx('coin'); }, onX: () => { const v = sellFish(id, n); if (v) { sfx('coin'); toast(`Sold ${n} ${f.name} for ${v} coins`, `fish_${id}`); } } }; })];
}
// Throw harvested crops or dug-up bugs into the water. Better bait, rarer fish.
export function baitMenu(anchor) {
  openMenu({
    title: 'Bait the water', icon: 'fish_perch', live: true, cls: 'wide',
    subtitle: () => {
      const b = baitOf(anchor), q = baitQuality(b), odds = rarityOdds(q), max = DATA.fishCfg.bait.maxPortions;
      const pct = r => `<span class="rar rar-${r}">${rarityName(r)} ${Math.round(odds[r] * 100)}%</span>`;
      return `Bait in the water: <b>${b.portions}/${max}</b>${b.portions ? ` · average value ${Math.round(b.value / b.portions)}` : ''}. Each fish uses one portion.<br>Odds right now: ${RARITY_ORDER.map(pct).join(' ')}`;
    },
    empty: 'Nothing to use as bait. Harvest some crops, or dig up bugs with the shovel!',
    footer: 'Ⓐ throw in one · Ⓧ throw in all of it · Ⓑ done',
    items: () => baitItems().map(it => ({
      label: it.name, icon: it.icon, sub: `worth ${it.price} each`, right: `×${it.n}`, xLabel: 'all',
      onSelect: () => { if (addBait(anchor, it, 1)) sfx('plop'); else { sfx('error'); toast('The water is full of bait already'); } },
      onX: () => { const n = addBait(anchor, it, it.n); if (n) { sfx('plop'); toast(`Threw in ${n} ${it.name.toLowerCase()}`, it.icon); } else { sfx('error'); toast('The water is full of bait already'); } },
    })),
  });
}
function fruitSellItems() {
  const list = Object.entries(G.state.inv.fruit || {}).filter(([, n]) => n > 0);
  if (!list.length) return [];
  return [{ header: true, label: 'Fruit' }, ...list.map(([id, n]) => { const t = DATA.treeById[id]; return { label: t.fruit, icon: `fruit_${id}`, sub: `${t.fruitPrice} each · Ⓐ sell one · Ⓧ sell all`, right: `×${n}`, xLabel: 'sell all', onSelect: () => { if (sellFruit(id, 1)) sfx('coin'); }, onX: () => { const v = sellFruit(id, n); if (v) { sfx('coin'); toast(`Sold ${n} ${(n === 1 ? t.fruit : t.fruitPlural || t.fruit).toLowerCase()} for ${v} coins`, `fruit_${id}`); } } }; })];
}
function shellSellItems() {
  const list = Object.entries(G.state.inv.shells || {}).filter(([, n]) => n > 0);
  if (!list.length) return [];
  return [{ header: true, label: 'Shells' }, ...list.map(([id, n]) => { const s = DATA.shellById[id]; return { label: s?.name || id, icon: `shell_${id}`, sub: `${s?.price ?? 1} each · Ⓐ sell one · Ⓧ sell all`, right: `×${n}`, xLabel: 'sell all', onSelect: () => { if (sellShell(id, 1)) sfx('coin'); }, onX: () => { const v = sellShell(id, n); if (v) { sfx('coin'); toast(`Sold ${n} ${s?.name} for ${v} coins`, `shell_${id}`); } } }; }), { header: true, label: 'Crops' }];
}

export function buildMenu() {
  openMenu({
    title: 'Build & decorate', icon: 'decor_lantern', live: true,
    subtitle: () => `${iconHTML('item_wood', 'ico sm')}${G.state.mats.wood || 0} ${iconHTML('item_stone', 'ico sm')}${G.state.mats.stone || 0} ${iconHTML('item_fiber', 'ico sm')}${G.state.mats.fiber || 0} ${iconHTML('item_coin', 'ico sm')}${G.state.coins}`,
    items: () => {
      const out = [], cats = DATA.decorCategories.length ? DATA.decorCategories : [...new Set(Object.values(DATA.decor).map(d => d.cat || 'Other'))];
      for (const c of cats) {
        const list = Object.entries(DATA.decor).filter(([, d]) => (d.cat || 'Other') === c);
        if (!list.length) continue;
        out.push({ header: true, label: c });
        for (const [id, d] of list) out.push({
          label: d.name, icon: d.sprite, right: costHTML(d.cost), cls: canAfford(d.cost) ? '' : 'cant',
          sub: d.desc || (d.light ? 'Glows at night' : d.ground ? 'Floor tile' : ''),
          onSelect: () => { closeAllMenus(); enterPlace(id); },
        });
      }
      return out;
    },
  });
}
export function cabinMenu() {
  const opts = DATA.cabinOptions;
  openMenu({
    title: 'Cabin', icon: 'cabin_door_0', live: true,
    items: () => [{ label: 'Rooms inside', icon: 'in_bed', sub: 'Bigger living room, kitchen and bedroom upgrades', onSelect: upgradesMenu }, { header: true, label: 'Outside' }, ...Object.entries(opts).map(([key, o]) => {
      const cur = G.state.cabin[key];
      const label = o.labels ? o.labels[o.options.indexOf(cur)] : String(cur);
      return { label: o.name, right: cap(label), onSelect: () => cabinChoice(key, o) };
    })],
  });
}
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
function cabinChoice(key, o) {
  openMenu({
    title: o.name, icon: 'cabin_door_0', sel: Math.max(0, o.options.indexOf(G.state.cabin[key])),
    subtitle: () => `Each change costs ${costHTML(o.cost)}`,
    items: () => o.options.map((v, i) => {
      const cur = G.state.cabin[key] === v;
      let icon = null, iconOpts = {};
      if (key === 'door') icon = `cabin_door_${v}`;
      if (key === 'roof' || key === 'wall') { icon = 'cabin'; const sw = optionSwap(key, v); iconOpts = { swap: sw.swap, swapKey: sw.key }; }
      if (key === 'windowBoxes') icon = v ? 'cabin_windowbox' : null;
      if (key === 'chimney') icon = v === 'stone' ? null : `cabin_chimney_${v}`;
      if (key === 'curtains' && o.colors?.[v]) { icon = 'cabin_curtains'; iconOpts = { swap: { 26: o.colors[v][0], 27: o.colors[v][1] }, swapKey: 'curt:' + v }; }
      if (key === 'welcomeMat') icon = v ? 'cabin_mat' : null;
      if (key === 'porchSwing') icon = v ? 'cabin_swing' : null;
      if (key === 'porch') icon = v ? 'cabin_porch' : null;
      return {
        label: cap(o.labels ? o.labels[i] : v), icon, iconOpts, cls: icon === 'cabin' ? 'big-ico' : '', right: cur ? '✓ current' : '',
        disabled: !cur && !canAfford(o.cost), why: `Need ${costLabel(o.cost)}`,
        onSelect: () => { if (cur) return; pay(o.cost); G.state.cabin[key] = v; sfx('build'); toast(`${o.name}: ${cap(o.labels ? o.labels[i] : v)}`); closeMenu(); },
      };
    }),
  });
}

/* ------------------------------------------------------------ cat houses */
function housePreview(a) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  drawCatHouse(c.getContext('2d'), a, 0, 0);
  return `<img class="ico huge" src="${c.toDataURL()}" alt="">`;
}
export function catHouseMenu(a) {
  const CH = DATA.catHouse;
  const cyc = (key, list) => {
    const step = d => { const s = decorState(a), cur = catHouseLook(a)[key]; s[key] = list[(list.indexOf(cur) + d + list.length) % list.length]; };
    return { onLeft: () => step(-1), onRight: () => step(1) };
  };
  openMenu({
    icon: 'cathouse', cls: 'wide',
    title: () => { const c = G.cats.find(k => k.id === decorState(a).owner); return c ? `${esc(c.cfg.name)}'s house` : 'Cat house'; },
    subtitle: 'Decorating is free. Each cat naps at their own house. Use ◂ ▸ to change things.',
    detail: () => `<div class="al-row" style="justify-content:center">${housePreview(a)}</div>`,
    items: () => {
      const L = catHouseLook(a), owner = G.cats.find(k => k.id === L.owner);
      return [
        { label: 'Belongs to', iconHTML: owner ? catPortrait(owner.cfg) : '', right: owner ? esc(owner.cfg.name) : 'Nobody yet', onSelect: () => ownerPicker(a) },
        { label: 'Roof', right: cap(L.roof), ...cyc('roof', CH.roof) },
        { label: 'Walls', right: cap(L.wall), ...cyc('wall', CH.wall) },
        { label: 'Door', right: CH.door[L.door] || L.door, ...cyc('door', CH.door.map((_, i) => i)) },
        { label: 'Decoration', right: CH.accentLabels[CH.accent.indexOf(L.accent)] || L.accent, ...cyc('accent', CH.accent) },
      ];
    },
  });
}
function ownerPicker(a) {
  const pick = id => {
    const s = decorState(a);
    if (id) { const old = catHouseOf(id); if (old && old.i !== a) { decorState(old.i).owner = null; toast(`${esc(G.cats.find(k => k.id === id)?.cfg.name)} moved house!`); } }
    s.owner = id; closeMenu();
  };
  openMenu({
    title: 'Whose house is it?', icon: 'cathouse',
    items: () => [
      ...G.cats.map(c => { const h = catHouseOf(c.id); return { label: esc(c.cfg.name), iconHTML: catPortrait(c.cfg), sub: h && h.i !== a ? 'Already has a house (they will move in here)' : h ? 'Lives here' : 'Needs a home', onSelect: () => pick(c.id) }; }),
      { label: 'Nobody (empty)', onSelect: () => pick(null) },
    ],
  });
}

/* -------------------------------------------------------------- almanac */
// The Almanac: one page per collection.
export function almanacMenu() {
  const st = G.state;
  openMenu({
    title: 'Almanac', icon: 'item_carrot',
    items: () => [
      { label: 'Crops', icon: 'item_carrot', sub: 'Everything you can grow from seed', right: `${Object.keys(st.discovered).length}/${DATA.crops.length}`, onSelect: almanacCrops },
      { label: 'Fish', icon: 'fish_perch', sub: st.fishingUnlocked || Object.keys(st.fishFound || {}).length ? 'Everything that swims in the lake' : 'Build a dock to start fishing', right: `${Object.keys(st.fishFound || {}).length}/${DATA.fish.length}`, onSelect: almanacFish },
    ],
  });
}
function almanacFish() {
  const list = [...DATA.fish].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.price - b.price);
  openMenu({
    title: () => `Fish · ${Object.keys(G.state.fishFound || {}).length}/${DATA.fish.length} caught`, icon: 'fish_perch', columns: 6, cls: 'almanac',
    footer: 'Move with the stick · Ⓑ back',
    items: list.map(f => {
      const n = G.state.fishFound?.[f.id];
      return { label: n ? f.name : '???', iconHTML: iconHTML(`fish_${f.id}`, 'ico big', { silhouette: !n }), cls: `rar-b-${f.rarity}`, fish: f };
    }),
    detail: it => {
      const f = it.fish, n = G.state.fishFound?.[f.id];
      if (!n) return `<div class="al-name">???</div>${rarityTag(f.rarity)}<p>Not caught yet. ${f.rarity === 'common' ? 'Any bait will do.' : `Better bait makes ${rarityName(f.rarity).toLowerCase()} fish more likely.`}</p>`;
      return `<div class="al-row">${iconHTML(`fish_${f.id}`, 'ico huge')}</div>
        <div class="al-name">${f.name}</div>${rarityTag(f.rarity)}
        <p>Sells for ${f.price}</p><p>Caught ${n} time${n === 1 ? '' : 's'}</p><p class="hint">"${f.desc}"</p>`;
    },
  });
}
function almanacCrops() {
  const list = [...DATA.crops].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  openMenu({
    title: () => `Crops · ${Object.keys(G.state.discovered).length}/${DATA.crops.length} discovered`, icon: 'item_carrot', columns: 6, cls: 'almanac',
    footer: 'Move with the stick · Ⓑ back',
    items: list.map(c => {
      const d = G.state.discovered[c.id];
      return { label: d ? c.name : '???', iconHTML: iconHTML(`item_${c.id}`, 'ico big', { silhouette: !d }), cls: `rar-b-${c.rarity}`, crop: c };
    }),
    detail: it => {
      const c = it.crop, d = G.state.discovered[c.id];
      if (!d) return `<div class="al-name">???</div>${rarityTag(c.rarity)}<p>Not discovered yet. Grow a ${rarityName(c.rarity).toLowerCase()} seed to find it!</p>`;
      return `<div class="al-row">${iconHTML(`crop_${c.id}`, 'ico big', { frame: 0 })}${iconHTML(`crop_${c.id}`, 'ico big', { frame: 1 })}${iconHTML(`crop_${c.id}`, 'ico big', { frame: 2 })}${iconHTML(`crop_${c.id}`, 'ico big', { frame: 3 })}</div>
        <div class="al-name">${c.name}</div>${rarityTag(c.rarity)}
        <p>Grows in about ${fmtTime(c.growMinutes * 60)} when watered · sells for ${c.price}</p><p>Harvested ${d.harvested} time${d.harvested === 1 ? '' : 's'}</p><p class="hint">"${c.hints[1]}"</p>`;
    },
  });
}

/* ----------------------------------------------------------------- cats */
export function catsMenu() {
  openMenu({
    title: 'The cats', live: true, iconHTML: '',
    subtitle: 'Edit names, looks and personalities in the Sprite & Cat Workshop.',
    items: () => G.cats.map(c => ({ label: esc(c.cfg.name), iconHTML: catPortrait(c.cfg), sub: esc(c.activity), right: `${bar(c.energy)}`, onSelect: () => catDetail(c) })),
  });
}
function catDetail(cat) {
  const B = DATA.balance;
  openMenu({
    title: () => esc(cat.cfg.name), live: true, cls: 'wide',
    subtitle: () => `<i>${esc(cat.cfg.blurb || '')}</i>`,
    items: () => {
      const cfg = cat.cfg, t = brain.traits(cfg);
      const out = [{ header: true, label: `Right now: ${esc(cat.activity)}` }];
      out.push({ label: 'Energy', right: bar(cat.energy) });
      out.push({ header: true, label: 'Jobs (speed · how much they like it · done)' });
      for (const j of DATA.catsConfig.jobTypes) {
        const jc = cfg.jobs?.[j] || {};
        out.push({ label: JOB_VERB[j] || j, right: `${(jc.speed ?? 1).toFixed(1)}× · ${bar(brain.affinity(cfg, j), 3)} · ${cat.done[j] || 0}`, sub: brain.refuses(cfg, j) ? 'Refuses this job' : j === 'water' && cfg.weaknesses?.hatesWater ? 'Hates water' : '' });
      }
      out.push({ header: true, label: 'Personality' });
      for (const [k, lbl] of [['energy', 'Stamina'], ['napFrequency', 'Naps often'], ['napDuration', 'Long naps'], ['curiosity', 'Curiosity'], ['zoomies', 'Zoomies'], ['lovesPlayer', 'Loves you']]) out.push({ label: lbl, right: bar(t[k], 2) });
      out.push({ label: 'Schedule', right: { early: 'Early bird', night: 'Night owl', neutral: 'Regular' }[t.schedule] || t.schedule });
      if (cfg.weaknesses?.distractible) out.push({ label: 'Easily distracted', right: '✓' });
      void B;
      return out;
    },
  });
}

/* ------------------------------------------------------------- settings */
export function settingsMenu() {
  const S = G.settings;
  const vol = key => ({ right: pct(S[key]), onLeft: () => { S[key] = Math.max(0, +(S[key] - 0.1).toFixed(2)); applyVolumes(); saveSettings(); }, onRight: () => { S[key] = Math.min(1, +(S[key] + 0.1).toFixed(2)); applyVolumes(); saveSettings(); } });
  const tog = key => ({ right: S[key] ? 'On' : 'Off', onLeft: () => { S[key] = !S[key]; saveSettings(); applyVolumes(); }, onRight: () => { S[key] = !S[key]; saveSettings(); applyVolumes(); } });
  openMenu({
    title: 'Settings', icon: 'tool_hand',
    subtitle: `Version ${document.querySelector('meta[name=game-version]')?.content || 'dev'}`,
    items: () => [
      { header: true, label: 'Time' },
      { label: 'Day / night', sub: S.timeMode === 'real' ? 'Follows your real clock' : `A full day every ${DATA.balance.time.fastDayLengthSec / 60} minutes`, right: S.timeMode === 'real' ? 'Real clock' : 'Fast', onLeft: () => { S.timeMode = S.timeMode === 'real' ? 'fast' : 'real'; saveSettings(); }, onRight: () => { S.timeMode = S.timeMode === 'real' ? 'fast' : 'real'; saveSettings(); } },
      { label: `Live weather (${DATA.weather?.city || 'your city'})`, sub: 'Rain, snow, fog and storms follow the real weather. Rain waters the garden', ...tog('liveWeather') },
      { header: true, label: 'Sound' },
      { label: 'Master volume', ...vol('master') },
      { label: 'Ambience', ...vol('ambient') },
      { label: 'Effects', ...vol('sfx') },
      { label: 'TV quiet mode', sub: 'Keeps everything soft for background play', ...tog('quiet') },
      { header: true, label: 'TV' },
      { label: 'Auto-hide HUD', sub: `After ${DATA.balance.tv.hudAutoHideSec}s without input`, ...tog('hudAutoHide') },
      { label: 'Idle camera drift', sub: 'Slowly pans when idle (prevents burn-in)', ...tog('cameraDrift') },
      { label: 'Fullscreen', onSelect: () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen needs a click or key press')); } },
      { header: true, label: 'Controls' },
      { label: 'Button labels', sub: 'Which controller the on-screen prompts show', right: S.padStyle === 'xbox' ? 'Xbox (A B X Y)' : 'PlayStation (✕ ○ □ △)', onLeft: () => { S.padStyle = S.padStyle === 'xbox' ? 'playstation' : 'xbox'; saveSettings(); }, onRight: () => { S.padStyle = S.padStyle === 'xbox' ? 'playstation' : 'xbox'; saveSettings(); } },
      { label: 'Rebind controls', onSelect: rebindMenu },
      { label: 'Controller test', ...tog('showControllerOverlay') },
      { header: true, label: 'Save' },
      { label: 'Save now', onSelect: () => { saveGame(); toast('Saved!'); } },
      { label: 'Export save file', sub: 'Downloads a backup', onSelect: () => { saveGame(); exportSave(); } },
      { label: 'Import save file', sub: 'Needs a mouse or keyboard', onSelect: () => importSaveFile().then(() => location.reload(), e => toast(`Import failed: ${esc(e.message)}`)) },
      { label: 'Sprite & Cat Workshop', sub: 'Opens the editor (use a mouse)', onSelect: () => { saveGame(); location.href = 'workshop.html'; } },
      { label: 'Start over', sub: 'Deletes this garden', cls: 'danger', onSelect: () => confirmDialog('Delete the whole garden and start over?', () => confirmDialog('Really? This cannot be undone.', () => { deleteSave(); G.noSave = true; location.reload(); }, { yesLabel: 'Delete it' })) },
    ],
  });
}
function rebindMenu() {
  openMenu({
    title: 'Rebind controls',
    subtitle: 'Ⓐ then press the new button or key. Movement is always the left stick, D-pad, WASD or arrows.',
    items: () => [
      ...ACTIONS.map(a => ({ label: ACTION_LABELS[a], sub: input.bindingLabel(a), onSelect: () => capture(a) })),
      { label: 'Reset to defaults', onSelect: resetBindings },
    ],
  });
}
function capture(action) {
  toast(`Press a button or key for "${ACTION_LABELS[action]}"...`, null, 5000);
  input.captureNext(ev => {
    const b = G.settings.bindings;
    if (ev.pad != null) b.pad[action] = [ev.pad]; else if (ev.key) b.keys[action] = [ev.key];
    input.setBindings(b); saveSettings(); refreshMenu();
    toast(`${ACTION_LABELS[action]}: ${ev.pad != null ? PAD_BUTTON_NAMES[ev.pad] || 'Button ' + ev.pad : ev.key}`);
  });
}
function resetBindings() {
  G.settings.bindings = structuredClone(DEFAULT_BINDINGS);
  input.setBindings(G.settings.bindings); saveSettings(); refreshMenu(); toast('Controls reset');
}

/* ----------------------------------------------------------------- help */
export function helpMenu() {
  const rows = [
    ['Move', 'Left stick / D-pad'], ['Interact, harvest, pet (hold to work)', 'Ⓐ'], ['Back / cancel', 'Ⓑ'],
    ['Cycle tool', 'Ⓧ'], ['Plan mode: clear land, make plots', 'Ⓨ'], ['Choose seed', 'LB/RB'],
    ['Menu', 'Start / Options'], ['Hide HUD (hold: switch player)', 'Back / Share'],
  ];
  openMenu({
    title: 'How to play', cls: 'wide', icon: 'icon_question',
    subtitle: 'You plan the garden; the cats do the slow work. Clear the land, make a plot, plant your mystery seeds, and harvest when they\'re ready. Harvests give seeds back. Sell crops for coins and buy mystery packs to discover new plants.',
    items: rows.map(([a, b]) => ({ label: a, right: b })),
  });
}

/* ---------------------------------------------------------------- debug */
export function debugMenu() {
  const scales = [1, 10, 100, 1000];
  openMenu({
    title: 'Debug', icon: 'icon_exclaim', cls: 'debug',
    items: () => [
      { label: 'Time scale', right: `×${G.timeScale}`, onLeft: () => { G.timeScale = scales[(scales.indexOf(G.timeScale) + scales.length - 1) % scales.length]; }, onRight: () => { G.timeScale = scales[(scales.indexOf(G.timeScale) + 1) % scales.length]; } },
      { label: '+1000 coins', onSelect: () => { G.state.coins += 1000; } },
      { label: '+50 wood, stone, fiber', onSelect: () => { for (const m of ['wood', 'stone', 'fiber']) G.state.mats[m] = (G.state.mats[m] || 0) + 50; } },
      { label: '+3 seeds of every crop', onSelect: () => { for (const c of DATA.crops) G.state.inv.seeds[c.id] = (G.state.inv.seeds[c.id] || 0) + 3; } },
      { label: '+1 unknown pack of each rarity', onSelect: () => { for (const r of RARITY_ORDER) { const pool = DATA.crops.filter(c => c.rarity === r); (G.state.inv.unknown[r] ||= []).push(pool[Math.floor(Math.random() * pool.length)].id); } } },
      { label: 'Grow every crop to ready', onSelect: () => { for (const c of Object.values(G.state.crops)) { c.g = 3 * farm.stageSeconds(c); } } },
      { label: '+1 sapling of every fruit tree', onSelect: () => { for (const t of DATA.trees) G.state.inv.saplings[t.id] = (G.state.inv.saplings[t.id] || 0) + 1; } },
      { label: 'Weather', sub: 'Force a weather to preview it (Live = the real weather)', right: G.weatherOverride || 'live', onLeft: () => { const L = DEBUG_WEATHERS; G.weatherOverride = L[(L.indexOf(G.weatherOverride || 'live') + L.length - 1) % L.length]; }, onRight: () => { const L = DEBUG_WEATHERS; G.weatherOverride = L[(L.indexOf(G.weatherOverride || 'live') + 1) % L.length]; } },
      { label: 'Summon a spirit to the Great Stump', sub: 'Fox or moose, as if an offering was answered', onSelect: () => { if (G.state.spirit?.stump >= 0) { G.state.spirit.visit = null; spiritArrive(); } } },
      { label: 'Grow every fruit tree to ripe', onSelect: () => { for (const t of Object.values(G.state.trees)) { t.stage = 4; t.g = 4 * stageSec(t); t.fruit = 3; t.fg = 3 * fruitSec(t); } } },
      { label: 'Reveal all crops', onSelect: () => { for (const c of DATA.crops) G.state.discovered[c.id] ||= { at: Date.now(), harvested: 0 }; } },
      { label: 'Toggle day/night speed', right: G.settings.timeMode, onSelect: () => { G.settings.timeMode = G.settings.timeMode === 'real' ? 'fast' : 'real'; } },
      { label: 'Reset save', cls: 'danger', onSelect: () => confirmDialog('Reset the save?', () => { deleteSave(); G.noSave = true; location.reload(); }) },
    ],
  });
}
export { replaceMenu, TOOLS };
