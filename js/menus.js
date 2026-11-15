// Every menu screen: pause, inventory, plots, shop, selling, build, cabin, almanac, cats, settings, debug.
import { G, fmtTime } from './game.js';
import { DATA, RARITY_ORDER } from './data.js';
import { input, ACTIONS, ACTION_LABELS, PAD_BUTTON_NAMES, DEFAULT_BINDINGS } from './input.js';
import { iconHTML, slotSwap, optionSwap } from './sprites.js';
import { openMenu, closeMenu, closeAllMenus, confirmDialog, textInput, toast, refreshMenu, esc, catPortrait, playerPortrait, replaceMenu } from './ui.js';
import * as farm from './farm.js';
import { saveSettings, saveGame, exportSave, importSaveFile, deleteSave } from './state.js';
import { applyVolumes, sfx } from './audio.js';
import { enterPlace } from './modes.js';
import { canAfford, pay, costHTML, costLabel } from './economy.js';
import { switchPlayer, playerName, TOOLS } from './player.js';
import { plotTiles } from './world.js';
import { JOB_VERB } from './jobs.js';
import * as brain from './catbrain.js';

const pct = v => `${Math.round(v * 100)}%`;
const bar = (v, max = 1) => `<span class="bar"><span style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></span></span>`;
const rarityName = r => DATA.rarities[r]?.name || r;
const rarityTag = r => `<span class="rar rar-${r}">${rarityName(r)}</span>`;

/* ---------------------------------------------------------------- pause */
export function pauseMenu() {
  const pl = DATA.playersConfig.players;
  openMenu({
    title: 'Garden menu', icon: 'tool_seeds',
    items: () => [
      { label: 'Back to the garden', icon: 'tool_hand', onSelect: closeAllMenus },
      { label: 'Inventory', icon: 'tool_seeds', sub: 'Crops, seeds and materials', onSelect: inventoryMenu },
      { label: 'Garden plots', icon: 'tool_hoe', sub: 'Choose what each plot grows', onSelect: plotsMenu },
      { label: 'Seed shop', icon: 'shop', sub: 'Mystery seed packs', onSelect: shopMenu },
      { label: 'Sell crops', icon: 'crate', onSelect: sellMenu },
      { label: 'Build & decorate', icon: 'decor_lantern', onSelect: buildMenu },
      { label: 'Cabin', icon: 'cabin_door_0', onSelect: cabinMenu },
      { label: 'Almanac', icon: 'item_carrot', sub: () => '', right: `${Object.keys(G.state.discovered).length}/${DATA.crops.length}`, onSelect: almanacMenu },
      { label: 'Cats', iconHTML: catPortrait(DATA.catsConfig.cats[0] || {}), onSelect: catsMenu },
      { label: `Switch player`, iconHTML: playerPortrait(pl[(G.state.activePlayer + 1) % pl.length]), sub: `Now playing: ${esc(playerName())}`, onSelect: () => { closeAllMenus(); switchPlayer(); } },
      { label: 'Settings', icon: 'tool_hand', onSelect: settingsMenu },
      { label: 'How to play', icon: 'icon_question', onSelect: helpMenu },
    ],
  });
}

/* ------------------------------------------------------------ inventory */
export function inventoryMenu() {
  openMenu({
    title: 'Inventory', icon: 'tool_seeds', live: true,
    subtitle: () => `${iconHTML('item_coin', 'ico sm')} ${G.state.coins} coins`,
    items: () => {
      const st = G.state, out = [];
      const crops = Object.entries(st.inv.crops).filter(([, n]) => n > 0);
      out.push({ header: true, label: 'Harvest' });
      if (!crops.length) out.push({ label: 'Nothing harvested yet', disabled: true });
      for (const [id, n] of crops) { const c = DATA.cropById[id]; out.push({ label: c.name, icon: `item_${id}`, sub: `Sells for ${c.price} each`, right: `×${n}`, onSelect: sellMenu }); }
      out.push({ header: true, label: 'Seeds (Ⓐ to hold)' });
      const keys = farm.ownedSeedKeys();
      if (!keys.length) out.push({ label: 'No seeds - visit the shop!', disabled: true });
      for (const k of keys) out.push({ label: farm.seedLabel(k), icon: farm.seedIcon(k), right: `×${farm.seedCount(k)}`, sub: st.player.seedKey === k ? 'In your seed bag' : '', onSelect: () => { st.player.seedKey = k; st.player.tool = 0; toast(`Holding ${farm.seedLabel(k)}`, farm.seedIcon(k)); } });
      out.push({ header: true, label: 'Materials' });
      for (const m of ['wood', 'stone', 'fiber']) out.push({ label: m[0].toUpperCase() + m.slice(1), icon: `item_${m}`, right: `×${st.mats[m] || 0}` });
      return out;
    },
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
    items: () => RARITY_ORDER.map(r => {
      const price = farm.packPrice(r), R = DATA.rarities[r];
      const found = DATA.crops.filter(c => c.rarity === r && G.state.discovered[c.id]).length, total = DATA.crops.filter(c => c.rarity === r).length;
      return {
        label: `${rarityName(r)} seed pack`, icon: `seedpack_${r}`,
        sub: `${R.packSeeds}+ seeds of one mystery crop · found ${found}/${total}`,
        right: `${iconHTML('item_coin', 'ico sm')}${price}`, disabled: G.state.coins < price, why: `Not enough coins (need ${price})`,
        onSelect: () => { const res = farm.buyPack(r); if (res) { sfx('coin'); toast(`Got ${res.n} unknown ${rarityName(r)} seeds!`, `seedpack_${r}`); } },
      };
    }),
  });
}
export function sellMenu() {
  openMenu({
    title: 'Shipping crate', icon: 'crate', live: true,
    subtitle: () => `${iconHTML('item_coin', 'ico sm')} ${G.state.coins} coins`,
    empty: 'Nothing to sell yet. Harvest some crops first!',
    items: () => {
      const crops = Object.entries(G.state.inv.crops).filter(([, n]) => n > 0);
      if (!crops.length) return [];
      const total = crops.reduce((a, [id, n]) => a + n * DATA.cropById[id].price, 0);
      return [
        { label: 'Sell everything', icon: 'item_coin', right: `+${total}`, onSelect: () => { const c = farm.sellAll(); if (c) { sfx('coin'); toast(`Sold everything for ${c} coins`, 'item_coin'); } } },
        ...crops.map(([id, n]) => { const c = DATA.cropById[id]; return { label: c.name, icon: `item_${id}`, sub: `${c.price} each · Ⓐ sell one · Ⓧ sell all`, right: `×${n}`, xLabel: 'sell all', onSelect: () => { if (farm.sell(id, 1)) sfx('coin'); }, onX: () => { const v = farm.sell(id, n); if (v) { sfx('coin'); toast(`Sold ${n} ${c.name} for ${v} coins`, `item_${id}`); } } }; }),
      ];
    },
  });
}

/* ---------------------------------------------------------------- build */
export function buildMenu() {
  openMenu({
    title: 'Build & decorate', icon: 'decor_lantern', live: true,
    subtitle: () => `${iconHTML('item_wood', 'ico sm')}${G.state.mats.wood || 0} ${iconHTML('item_stone', 'ico sm')}${G.state.mats.stone || 0} ${iconHTML('item_fiber', 'ico sm')}${G.state.mats.fiber || 0} ${iconHTML('item_coin', 'ico sm')}${G.state.coins}`,
    items: () => Object.entries(DATA.decor).map(([id, d]) => ({
      label: d.name, icon: d.sprite, right: costHTML(d.cost), sub: d.light ? 'Glows at night' : d.ground ? 'Ground tile' : '',
      onSelect: () => { closeAllMenus(); enterPlace(id); },
    })),
  });
}
export function cabinMenu() {
  const opts = DATA.cabinOptions;
  openMenu({
    title: 'Cabin', icon: 'cabin_door_0', live: true,
    items: () => Object.entries(opts).map(([key, o]) => {
      const cur = G.state.cabin[key];
      const label = o.labels ? o.labels[o.options.indexOf(cur)] : String(cur);
      return { label: o.name, right: cap(label), onSelect: () => cabinChoice(key, o) };
    }),
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
      return {
        label: cap(o.labels ? o.labels[i] : v), icon, iconOpts, cls: icon === 'cabin' ? 'big-ico' : '', right: cur ? '✓ current' : '',
        disabled: !cur && !canAfford(o.cost), why: `Need ${costLabel(o.cost)}`,
        onSelect: () => { if (cur) return; pay(o.cost); G.state.cabin[key] = v; sfx('build'); toast(`${o.name}: ${cap(o.labels ? o.labels[i] : v)}`); closeMenu(); },
      };
    }),
  });
}

/* -------------------------------------------------------------- almanac */
export function almanacMenu() {
  const list = [...DATA.crops].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  openMenu({
    title: () => `Almanac · ${Object.keys(G.state.discovered).length}/${DATA.crops.length} discovered`, icon: 'item_carrot', columns: 6, cls: 'almanac',
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
        <p>Grows in about ${fmtTime(c.growMinutes * 60)} · sells for ${c.price}</p><p>Harvested ${d.harvested} time${d.harvested === 1 ? '' : 's'}</p><p class="hint">"${c.hints[1]}"</p>`;
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
    items: () => [
      { header: true, label: 'Time' },
      { label: 'Day / night', sub: S.timeMode === 'real' ? 'Follows your real clock' : `A full day every ${DATA.balance.time.fastDayLengthSec / 60} minutes`, right: S.timeMode === 'real' ? 'Real clock' : 'Fast', onLeft: () => { S.timeMode = S.timeMode === 'real' ? 'fast' : 'real'; saveSettings(); }, onRight: () => { S.timeMode = S.timeMode === 'real' ? 'fast' : 'real'; saveSettings(); } },
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
      { label: 'Reveal all crops', onSelect: () => { for (const c of DATA.crops) G.state.discovered[c.id] ||= { at: Date.now(), harvested: 0 }; } },
      { label: 'Toggle day/night speed', right: G.settings.timeMode, onSelect: () => { G.settings.timeMode = G.settings.timeMode === 'real' ? 'fast' : 'real'; } },
      { label: 'Reset save', cls: 'danger', onSelect: () => confirmDialog('Reset the save?', () => { deleteSave(); G.noSave = true; location.reload(); }) },
    ],
  });
}
export { replaceMenu, TOOLS };
