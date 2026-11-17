// Boot, title screen, main loop, global controls, feedback, autosave, wake lock, offline catch-up.
import { G, TILE, fmtTime, clamp } from './game.js';
import { DATA, loadData, applyOverrides } from './data.js';
import { input } from './input.js';
import { resetSpriteCache, iconHTML } from './sprites.js';
import { newGame, loadGame, saveGame, loadSettings, saveSettings } from './state.js';
import { initRender, renderWorld, clampCamera, getCtx, beginFrame } from './render.js';
import { updateSpirits, spiritHUD } from './spirits.js';
import { initWeather, updateWeather, weatherHUD } from './weather.js';
import { isInside, updateInside, updateDecorate, renderInterior, insideAction, furnitureMenu } from './interior.js';
import { rebuildJobIndex, updateJobs, JOB_VERB } from './jobs.js';
import * as farm from './farm.js';
import { syncCats, updateCats } from './cats.js';
import { updatePlayer, switchPlayer, cycleSeed, selectedSeedKey, TOOLS, currentAction, playerName, playerCfg } from './player.js';
import { updatePlan, updatePlace, updatePlant, enterPlan, cursorPx } from './modes.js';
import { initAudio, applyVolumes, sfx, updateAmbience } from './audio.js';
import { updateParticles, sparkle, burst, emit } from './particles.js';
import { clockLabel, phaseLabel, hourOfDay } from './daytime.js';
import * as ui from './ui.js';
import * as menus from './menus.js';
import { tx, ty } from './world.js';
import { updateShells } from './decorations.js';
import { updateTrees } from './orchard.js';
import { updateFishing, fishingMessage, playerSpot as fishSpot } from './fishing.js';
import * as tree from './orchard.js';
import { updateDecor, updateMail, updateDecorFx, nearFire, birdBoost, decorState, readLetter, makeWish, markDirty } from './decorations.js';

const $ = id => document.getElementById(id);
const B = () => DATA.balance;

/* ------------------------------------------------------------------ boot */
async function boot() {
  try { await loadData(); }
  catch (e) { $('title').innerHTML = `<div class="title-box"><h1>Oops</h1><p>${ui.esc(e.message)}</p><p>If you opened index.html directly from disk, run a local web server instead (see README).</p></div>`; return; }
  G.settings = loadSettings();
  input.setBindings(G.settings.bindings);
  initRender($('screen'));
  initWeather();
  G.state = loadGame() || newGame();
  G.isNewGame = !G.state.simTime;
  rebuildJobIndex();
  syncCats();
  const p = G.state.player;
  G.camera.x = p.x - G.view.w / 2; G.camera.y = p.y - G.view.h / 2; clampCamera();
  wireEvents();
  G.mode = 'title';
  titleScreen();
  lastFrame = performance.now();
  requestAnimationFrame(frame);
  window.__game = G; // handy for debugging and tests
}

/* ----------------------------------------------------------------- title */
let titleStep = 0, whoSel = 0;
function titleScreen() {
  const el = $('title');
  el.classList.add('show');
  if (titleStep === 0) {
    const pads = input.connectedPads();
    el.innerHTML = `<div class="title-box">
      <div class="title-logo">${iconHTML('crop_sunflower', 'ico logo', { frame: 3 })}<h1>SRNMV Garden</h1>${iconHTML('cat_sit', 'ico logo')}</div>
      <p class="tagline">a cozy little clearing, tended by cats</p>
      <p class="press blink">Press any button</p>
      <p class="padstatus">${pads.length ? `Controller ready: ${ui.esc(pads[0].id.slice(0, 40))}` : 'Controller not seen yet. Press a button on it (browsers wait for a press), or use the keyboard.'}</p>
    </div>`;
  } else {
    const ps = DATA.playersConfig.players;
    el.innerHTML = `<div class="title-box">
      <h2>Who's playing?</h2>
      <div class="who">${ps.map((p, i) => `<div class="who-card ${i === whoSel ? 'sel' : ''}">${ui.playerPortrait(p)}<div class="who-name">${ui.esc(p.name)}</div></div>`).join('')}</div>
      <p class="press">${ui.glyphs('◂ ▸ choose · Ⓐ start')}</p>
      <p class="padstatus">You can swap any time: hold Back/Share, or use the menu.</p>
    </div>`;
  }
}
function updateTitle() {
  if (titleStep === 0) {
    if (G.realTime % 1 < 0.02) titleScreen();
    if (input.anyPressed) {
      initAudio(); applyVolumes(); requestWakeLock();
      if (!document.fullscreenElement && !input.lastWasPad) document.documentElement.requestFullscreen?.().catch(() => {});
      titleStep = 1; whoSel = G.state.activePlayer || 0; sfx('confirm'); titleScreen(); input.consumeAll();
    }
    return;
  }
  const n = DATA.playersConfig.players.length;
  if (input.nav('left') || input.nav('up')) { whoSel = (whoSel + n - 1) % n; sfx('move'); titleScreen(); }
  if (input.nav('right') || input.nav('down')) { whoSel = (whoSel + 1) % n; sfx('move'); titleScreen(); }
  if (input.pressed('confirm')) {
    G.state.activePlayer = whoSel;
    sfx('confirm');
    $('title').classList.remove('show');
    input.consumeAll();
    startPlaying();
  }
}
function startPlaying() {
  const away = (Date.now() - (G.state.lastSaved || Date.now())) / 1000;
  G.mode = 'play';
  if (G.isNewGame) {
    ui.showCard(`<h2>Welcome home!</h2><p>Your little cabin sits in a clearing full of twigs, rocks and stumps.</p>
      <p>${iconHTML('tool_axe')} Hold Ⓐ on debris to clear it, or press Ⓨ for <b>Plan mode</b> to mark land for the cats.</p>
      <p>${iconHTML('tool_hoe')} In Plan mode choose <b>New plot</b> and pick two corners. The cats will till it.</p>
      <p>${iconHTML('seedpack_mystery')} You have two mystery seed packs. What will grow?</p>`, { cls: 'welcome' });
    G.isNewGame = false;
  } else if (away > 30) {
    catchUp(away, true);
  }
  ui.toast(`Now playing: ${ui.esc(playerName())}`, null);
}

/* ------------------------------------------------------- offline catch-up */
function catchUp(seconds, summary) {
  const cap = B().time.offlineCapHours * 3600;
  const secs = Math.min(seconds, cap);
  if (secs < 1) return;
  const stats = { stages: 0, ready: 0, jobs: {}, cleared: 0 };
  const off = [
    G.on('stage', e => { stats.stages++; if (e.crop.stage >= 3) stats.ready++; }),
    G.on('treeGrew', e => { stats.stages++; if (e.tree.fruit === 3 && e.kind === 'fruit') stats.ready++; }),
    G.on('fishCaught', e => { stats.fish = (stats.fish || 0) + 1; }),
    G.on('jobDone', e => { if (e.worker && e.worker !== 'player') { const c = (stats.jobs[e.worker] ||= {}); c[e.job.type] = (c[e.job.type] || 0) + 1; } if (e.job.type === 'clear') stats.cleared++; }),
  ];
  G.offline = true;
  const step = B().time.offlineStepSec;
  let left = secs;
  while (left > 0) { const dt = Math.min(step, left); simStep(dt); left -= dt; }
  G.offline = false;
  off.forEach(f => f());
  if (!summary || secs < 60) return;
  const lines = [];
  if (stats.stages) lines.push(`${iconHTML('fx_sparkle')} The garden grew ${stats.stages} time${stats.stages > 1 ? 's' : ''}${stats.ready ? `, and <b>${stats.ready}</b> crop${stats.ready > 1 ? 's are' : ' is'} ready to harvest!` : '.'}`);
  for (const cat of G.cats) {
    const j = stats.jobs[cat.id];
    const did = j ? Object.entries(j).map(([t, n]) => `${JOB_VERB[t].toLowerCase()} ${n}×`).join(', ') : null;
    lines.push(`${ui.catPortrait(cat.cfg)} <b>${ui.esc(cat.cfg.name)}</b> ${did ? `was busy: ${did}.` : 'mostly napped. Very important work.'}`);
  }
  if (stats.fish) lines.push(`${iconHTML('fish_perch')} The cats caught <b>${stats.fish}</b> fish off the dock.`);
  if (!lines.length) lines.push('It was a quiet time in the clearing.');
  ui.showCard(`<h2>While you were away</h2><p class="muted">${fmtTime(secs)}${seconds > cap ? ` (counted up to ${B().time.offlineCapHours}h)` : ''}</p>${lines.map(l => `<p>${l}</p>`).join('')}`, { cls: 'away' });
}

/* -------------------------------------------------------------- the sim */
function simStep(dt) {
  G.state.simTime += dt;
  farm.updateCrops(dt);
  updateJobs(dt);
  updateCats(dt);
  updateDecor(dt);
  updateMail();
  updateShells(dt);
  updateTrees(dt);
  updateSpirits(dt);
}

/* ---------------------------------------------------------------- events */
let lastGrowBanner = -999;
function wireEvents() {
  G.on('stage', ({ tile, crop }) => {
    if (G.offline) return;
    const x = tx(tile) * TILE + 8, y = ty(tile) * TILE + 6;
    sparkle(x, y, 3);
    if (G.realTime - lastGrowBanner > B().farm.growBannerCooldownSec) {
      lastGrowBanner = G.realTime;
      G.hudWake = G.realTime;
      sfx('grow');
      const name = farm.cropName(crop.id);
      const msg = crop.stage >= 3 ? `${name === '???' ? 'Something' : 'A ' + name} is ready to harvest!` : `${name === '???' ? 'A mystery plant' : 'A ' + name} got bigger. ${name === '???' ? 'What could it be?' : ''}`;
      ui.banner(`${iconHTML(`crop_${crop.id}`, 'ico big', { frame: crop.stage })}<div><b>The garden grew!</b><small>${msg}</small></div>`);
    }
  });
  G.on('discover', ({ id, def, tile }) => {
    sfx('discover');
    const x = tx(tile) * TILE + 8, y = ty(tile) * TILE;
    for (let k = 0; k < 24; k++) emit({ x, y, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 80, g: 120, life: 1.4, color: ['#f7cd5d', '#e88fb0', '#8cc65a', '#7fb3d5', '#c89bd8'][k % 5], size: 2, layer: 1 });
    ui.showCard(`<div class="disc">${iconHTML(`item_${id}`, 'ico huge')}</div><h2>New crop discovered!</h2><div class="disc-name">${def.name}</div><span class="rar rar-${def.rarity}">${DATA.rarities[def.rarity].name}</span><p>Sells for ${def.price} coins. You got its seeds back, so you can grow more.</p><p class="muted">Added to the Almanac.</p>`, { cls: 'discover', ms: 15000 });
  });
  G.on('harvest', r => { if (!r.first) ui.toast(`+${r.crops} ${r.def.name} · +${r.seeds} seed${r.seeds > 1 ? 's' : ''}${r.seeds > 1 ? '!' : ''}`, `item_${r.id}`, 2600); });
  G.on('jobDone', e => {
    if (G.offline) return;
    if (e.job.type === 'clear') {
      const x = tx(e.job.tile) * TILE + 8, y = ty(e.job.tile) * TILE + 8;
      burst(x, y, { n: 5, sprite: e.debris === 'rock' || e.debris === 'boulder' ? 'fx_dirt' : 'fx_leaf' });
      if (e.worker === 'player' && e.drops) { const d = Object.entries(e.drops).map(([k, n]) => `+${n} ${k}`).join(' · '); if (d) ui.toast(d, `item_${Object.keys(e.drops)[0]}`, 1800); }
    }
  });
  G.on('treeGrew', ({ tile, tree: tr, kind }) => {
    if (G.offline) return;
    const d = DATA.treeById[tr.id], x = tx(tile) * TILE + 8, y = ty(tile) * TILE - 8;
    sparkle(x, y, 4);
    if (G.realTime - lastGrowBanner > B().farm.growBannerCooldownSec) {
      lastGrowBanner = G.realTime; G.hudWake = G.realTime; sfx('grow');
      const msg = kind === 'stage' ? (tr.stage === 4 ? `The ${d.name.toLowerCase()} is full-grown! Blossoms are coming.` : `The ${d.name.toLowerCase()} grew taller.`)
        : tr.fruit === 0 ? `The ${d.name.toLowerCase()} is blossoming!` : tr.fruit === 3 ? `${d.fruitPlural || d.fruit} are ripe to pick!` : `Little ${(d.fruitPlural || d.fruit).toLowerCase()} ${tr.fruit === 1 ? 'are setting' : 'are swelling'} on the ${d.name.toLowerCase()}.`;
      ui.banner(`${iconHTML(tr.stage === 4 && tr.fruit >= 2 ? `fruit_${tr.id}` : `sapling_${tr.id}`, 'ico big')}<div><b>The orchard grew!</b><small>${msg}</small></div>`);
    }
  });
  G.on('fruitHarvest', r => {
    if (r.first) {
      sfx('discover');
      ui.showCard(`<div class="disc">${iconHTML(`fruit_${r.id}`, 'ico huge')}</div><h2>First ${r.def.fruit.toLowerCase()} harvest!</h2><div class="disc-name">${r.def.name}</div><p>You picked ${r.n}. Each sells for ${r.def.fruitPrice} coins.</p><p class="muted">It will blossom again and grow more.</p>`, { cls: 'discover', ms: 12000 });
    } else ui.toast(`+${r.n} ${r.n === 1 ? r.def.fruit : r.def.fruitPlural || r.def.fruit}`, `fruit_${r.id}`, 2200);
  });
  G.on('fishCaught', r => {
    if (G.offline) return;
    const who = r.by === 'player' ? null : G.cats.find(c => c.id === r.by)?.cfg.name;
    if (r.first) { sfx('discover'); ui.showCard(`<div class="disc">${iconHTML(`fish_${r.id}`, 'ico huge')}</div><h2>${who ? `${ui.esc(who)} caught a new fish!` : 'New fish caught!'}</h2><div class="disc-name">${r.def.name}</div><span class="rar rar-${r.def.rarity}">${DATA.rarities[r.def.rarity]?.name || r.def.rarity}</span><p>${r.def.desc}</p><p class="muted">Sells for ${r.def.price} · Fish found: ${Object.keys(G.state.fishFound).length}/${DATA.fish.length}</p>`, { cls: 'discover', ms: 12000 }); }
    else ui.toast(who ? `${ui.esc(who)} caught a ${r.def.name}!` : `Caught a ${r.def.name}!`, `fish_${r.id}`, 3000);
  });
  G.on('built', ({ id }) => {
    if (DATA.decor[id]?.onWater && !G.state.fishingUnlocked) {
      G.state.fishingUnlocked = true;
      ui.showCard(`<div class="disc">${iconHTML('fish_perch', 'ico huge')}</div><h2>Fishing unlocked!</h2><p>Stand on the dock facing open water and press Ⓐ to bait it with crops or fruit, then Ⓐ again to cast.</p><p>Wait through the little tugs. When the big <b>!</b> pops up, press Ⓐ to pull the fish in. Better bait means rarer fish.</p><p class="muted">The cats will fish off the dock too, using the same bait.</p>`, { cls: 'discover' });
    }
  });
  G.on('shell', r => {
    sfx(r.first ? 'discover' : 'pop');
    if (r.first) ui.showCard(`<div class="disc">${iconHTML(`shell_${r.id}`, 'ico huge')}</div><h2>New shell found!</h2><div class="disc-name">${r.def?.name}</div><p>${r.def?.desc || ''}</p><p class="muted">Shells: ${Object.keys(G.state.shellsFound).length} of ${DATA.shells.length} kinds found</p>`, { cls: 'discover', ms: 12000 });
    else ui.toast(`+1 ${r.def?.name}`, `shell_${r.id}`, 2200);
  });
  G.on('mail', () => { if (!G.offline) { sfx('coin'); ui.toast("You've got mail! Check the mailbox.", 'decor_mailbox', 5000); } });
  G.on('built', ({ id, tile }) => { if (DATA.decor[id]?.interact === 'cathouse') menus.catHouseMenu(tile); });
  G.on('playerSwitched', cfg => ui.toast(`Now playing: ${ui.esc(cfg.name)}`, null, 2500));
  G.on('plotCreated', () => { G.hudWake = G.realTime; });
  addEventListener('gamepadconnected', e => { ui.toast(`Controller connected`, null, 3000); if (G.mode === 'title') titleScreen(); void e; });
  addEventListener('gamepaddisconnected', () => ui.toast('Controller disconnected', null, 4000));
  // Workshop edits arrive live through localStorage
  addEventListener('storage', e => {
    if (!e.key || !e.key.startsWith('srnmv.override.')) return;
    applyOverrides(); resetSpriteCache(); syncCats(); ui.resetHudCache(); markDirty();
    ui.toast('Workshop changes applied', 'fx_sparkle');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveGame(); else { requestWakeLock(); lastFrame = performance.now(); }
  });
  addEventListener('pagehide', () => { if (!G.noSave) saveGame(); });
}

// Is there water within a few tiles of the player? (checked a few times a second)
let waterCheckT = 0, waterNear = false;
function nearWater(p) {
  waterCheckT -= 1;
  if (waterCheckT > 0) return waterNear;
  waterCheckT = 15;
  const m = G.state.map, px = Math.floor(p.x / TILE), py = Math.floor(p.y / TILE);
  waterNear = false;
  for (let y = py - 5; y <= py + 5 && !waterNear; y++) for (let x = px - 5; x <= px + 5; x++) if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.ground[y * m.w + x] === 'w') { waterNear = true; break; }
  return waterNear;
}

/* ------------------------------------------------- decoration actions */
const decorHandlers = {
  crate: () => menus.sellMenu(),
  shop: () => menus.shopMenu(),
  cabin: () => menus.cabinMenu(),
  sign: a => ui.textInput('Write on the sign', decorState(a).text || '', t => { decorState(a).text = t; ui.toast(`The sign now says "${ui.esc(t)}"`, 'decor_signpost'); }),
  letter: a => { const r = readLetter(a); sfx('confirm'); ui.showCard(`<h2>A letter!</h2><p class="letter">${ui.esc(r.text)}</p>${r.gift ? `<p>Tucked inside: <b>${r.gift}</b></p>` : ''}`, { cls: 'letter' }); },
  wish: a => {
    const g = makeWish(a); sfx('discover');
    sparkle(tx(a) * TILE + 8, ty(a) * TILE + 4, 8);
    ui.showCard(`<div class="disc">${iconHTML('decor_well', 'ico huge')}</div><h2>You made a wish...</h2><p>The well gives you <b>${g}</b>.</p><p class="muted">Come back tomorrow for another wish.</p>`, { cls: 'discover' });
  },
  catHouse: a => menus.catHouseMenu(a),
  bait: a => menus.baitMenu(a),
};

/* ------------------------------------------------------------ wake lock */
let wakeLock = null;
async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !document.hidden && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { wakeLock = null; }
}

/* ----------------------------------------------------------- main loop */
let lastFrame = 0, wallLast = Date.now(), frameSkip = false, autosaveT = 0, hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastFrame) / 1000; lastFrame = now;
  // real elapsed time (handles the tab sleeping)
  const wall = Date.now(), wallDt = (wall - wallLast) / 1000; wallLast = wall;
  if (G.state && G.mode !== 'title' && G.mode !== 'boot' && wallDt > 2) { catchUp(wallDt, wallDt > 300); dt = 0.016; }
  // idle frame throttle (~30fps) to keep the TV box cool
  if (G.realTime - G.lastInput > B().tv.idleFpsAfterSec) { frameSkip = !frameSkip; if (frameSkip) { pendingDt += dt; return; } }
  dt = Math.min(dt + pendingDt, 0.1); pendingDt = 0;
  G.realTime += dt;
  update(dt);
  beginFrame();
  if (G.state && isInside()) renderInterior(getCtx(), G.realTime); else renderWorld(G.realTime);
  input.afterFrame();
}
let pendingDt = 0;

function update(dt) {
  input.update(dt);
  if (input.anyPressed || Math.hypot(input.axis.x, input.axis.y) > 0.1) G.lastInput = G.realTime;
  if (G.mode === 'title') { updateTitle(); updateParticles(dt); idleCamera(dt, true); return; }

  // sim (scaled by debug time scale, in small steps)
  const simDt = dt * G.timeScale;
  const steps = Math.ceil(simDt / B().time.maxSimStepSec);
  for (let i = 0; i < steps; i++) simStep(simDt / steps);

  updateWeather(dt);
  const cardActive = ui.updateCard(dt);
  if (!cardActive) {
    if (G.mode === 'menu') ui.updateMenus(dt);
    else if (G.mode === 'designate') updatePlan();
    else if (G.mode === 'place') updatePlace();
    else if (G.mode === 'plant') updatePlant();
    else if (G.mode === 'iplace') updateDecorate();
    else if (G.mode === 'fishing') { updateFishing(dt); ui.setTooltip(fishingMessage()); }
    else if (G.mode === 'play') globalControls();
  }
  if (isInside()) updateInside(cardActive ? 0 : dt); else updatePlayer(cardActive ? 0 : dt, decorHandlers);
  updateDecorFx(dt);
  updateParticles(dt);
  updateCamera(dt);
  const p = G.state.player, c = G.state.cabin;
  if (isInside()) updateAmbience(dt, true, false);
  else updateAmbience(dt, Math.hypot(p.x - (c.x + 1.5) * TILE, p.y - (c.y + 1) * TILE) < 7 * TILE || nearFire(p.x, p.y), nearWater(p));
  hudT -= dt; if (hudT <= 0) { hudT = 0.25; updateHUD(); G.birdBoost = birdBoost(); }
  autosaveT += dt; if (autosaveT > B().tv.autosaveSec) { autosaveT = 0; if (!G.noSave) saveGame(); }
  updatePadOverlay();
}

let hudSwitchFired = false;
function globalControls() {
  if ((input.pressed('debug')) || (input.down('seedPrev') && input.down('seedNext') && input.pressed('pause'))) { menus.debugMenu(); return; }
  if (input.pressed('pause')) { menus.pauseMenu(); return; }
  if (input.pressed('switchPlayer')) switchPlayer();
  if (isInside()) { if (input.pressed('designate')) { furnitureMenu(); return; } hudControls(); return; } // Ⓨ decorates indoors; no tools or seeds
  if (input.pressed('designate')) { enterPlan(); return; }
  if (input.pressed('tool') && fishSpot()) { menus.baitMenu(fishSpot().anchor); return; }
  if (input.pressed('tool')) {
    const p = G.state.player; p.tool = (p.tool + 1) % TOOLS.length; sfx('move');
    ui.toast(`Tool: ${TOOLS[p.tool].name}`, TOOLS[p.tool].icon, 1400);
  }
  if (input.pressed('seedPrev') || input.pressed('seedNext')) {
    const k = cycleSeed(input.pressed('seedNext') ? 1 : -1);
    if (k) { sfx('move'); ui.toast(`${farm.seedLabel(k)} ×${farm.seedCount(k)}`, farm.seedIcon(k), 1400); } else { sfx('error'); ui.toast('No seeds yet', null, 1400); }
  }
  hudControls();
}
function hudControls() {
  // Back/Share: tap toggles HUD, hold 1s switches player
  if (input.down('hud') && input.held('hud') > 1 && !hudSwitchFired) { hudSwitchFired = true; switchPlayer(); }
  if (input.released('hud')) { if (!hudSwitchFired) { G.hudHidden = !G.hudHidden; ui.toast(G.hudHidden ? 'HUD hidden (tap again to show)' : 'HUD shown', null, 1500); } hudSwitchFired = false; }
}

/* --------------------------------------------------------------- camera */
let driftT = 0;
function idleCamera(dt, force) {
  driftT += dt;
  const st = G.state;
  const cx = (st.cabin.x + 1.5) * TILE, cy = (st.cabin.y + 4) * TILE;
  const tx_ = cx + Math.sin(driftT / 47) * 140 - G.view.w / 2;
  const ty_ = cy + Math.sin(driftT / 61 + 1) * 70 - G.view.h / 2;
  const k = Math.min(1, dt * (force ? 0.5 : 0.25));
  G.camera.x += (tx_ - G.camera.x) * k; G.camera.y += (ty_ - G.camera.y) * k;
  clampCamera();
}
function updateCamera(dt) {
  if (isInside()) return; // the interior keeps its own camera
  const idle = G.realTime - G.lastInput;
  if (G.mode === 'play' && G.settings.cameraDrift && idle > B().tv.idleDriftAfterSec && !ui.cardOpen()) return idleCamera(dt);
  let tgt;
  if (G.mode === 'designate' || G.mode === 'place' || G.mode === 'plant') tgt = cursorPx();
  else { const p = G.state.player; tgt = { x: p.x, y: p.y - 8 }; }
  const k = Math.min(1, dt * 6);
  G.camera.x += (tgt.x - G.view.w / 2 - G.camera.x) * k;
  G.camera.y += (tgt.y - G.view.h / 2 - G.camera.y) * k;
  clampCamera();
}

/* ------------------------------------------------------------------ HUD */
function updateHUD() {
  const st = G.state, S = G.settings;
  const idle = G.realTime - Math.max(G.lastInput, G.hudWake || 0);
  const visible = G.mode !== 'title' && !G.hudHidden && !(S.hudAutoHide && idle > B().tv.hudAutoHideSec);
  const tool = TOOLS[st.player.tool] || TOOLS[0];
  const sk = selectedSeedKey();
  const h = hourOfDay();
  ui.updateHUD({
    visible,
    res: `<span>${iconHTML('item_coin')}${st.coins}</span><span>${iconHTML('item_wood')}${st.mats.wood || 0}</span><span>${iconHTML('item_stone')}${st.mats.stone || 0}</span><span>${iconHTML('item_fiber')}${st.mats.fiber || 0}</span>`,
    clock: `<div class="clock">${clockLabel(h)}</div><div class="phase">${phaseLabel(h)}${G.timeScale > 1 ? ` · ×${G.timeScale}` : ''}</div>${weatherHUD()}<div class="who-hud">${ui.playerPortrait(playerCfg())}${ui.esc(playerName())}</div>`,
    tool: `<div class="slot">${iconHTML(tool.icon)}<span>Ⓧ ${tool.name}</span></div><div class="slot">${iconHTML(farm.seedIcon(sk))}<span>LB/RB ${sk ? `${farm.seedLabel(sk)} ×${farm.seedCount(sk)}` : 'No seeds'}</span></div>`,
    cats: G.cats.map(c => `<div class="cat-row">${ui.catPortrait(c.cfg)}<div><b>${ui.esc(c.cfg.name)}</b><small>${ui.esc(c.activity)}</small></div></div>`).join('') + spiritHUD(),
  });
  // tooltip for what Ⓐ will do
  let tip = G.mode === 'fishing' ? fishingMessage() : '';
  if (G.mode === 'play' && !ui.cardOpen() && isInside()) { const a = insideAction(); tip = a ? (a.kind === 'info' ? a.label : `Ⓐ ${a.label}`) : ''; }
  else if (G.mode === 'play' && !ui.cardOpen() && G.realTime - G.lastInput < B().tv.hudAutoHideSec) {
    const a = currentAction();
    if (a) {
      const crop = a.crop || (a.tile != null ? st.crops[a.tile] : null);
      let extra = '';
      if (crop) {
        const wet = crop.wetUntil > st.simTime;
        extra = `<small>${crop.stage >= 3 ? '' : `Stage ${crop.stage + 1}/4 · next in ~${fmtTime(farm.timeToNextStage(crop, a.tile))}${wet ? ' · watered' : ''} · `}"${farm.stageHint(crop)}"</small>`;
      }
      if (a.tree) {
        const tr = a.tree, nxt = tree.timeToNext(tr, a.tile);
        extra = `<small>${tree.treeStatus(tr)}${nxt > 0 ? ` · next in ~${fmtTime(nxt)}` : ''}${tree.isWet(tr) ? ' · watered' : ''}</small>`;
      }
      if (a.kind === 'work') { const prog = st.jobs.find(j => j.type === a.type && j.tile === a.tile); tip = `Ⓐ hold: ${a.label}${prog ? ` (${Math.floor(prog.progress / prog.work * 100)}%)` : ''}${extra}`; }
      else if (a.kind === 'inspect' || a.kind === 'info') tip = `${a.label}${extra}`;
      else tip = `Ⓐ ${a.label}${extra}`;
    }
  }
  ui.setTooltip(tip);
}

/* --------------------------------------------------- controller overlay */
function updatePadOverlay() {
  const el = $('padtest');
  if (!G.settings.showControllerOverlay) { if (el.innerHTML) { el.innerHTML = ''; el.classList.remove('show'); } return; }
  el.classList.add('show');
  const pads = input.connectedPads();
  el.innerHTML = pads.length ? pads.map(p => `<div><b>${ui.esc(p.id.slice(0, 48))}</b> (${p.mapping || 'non-standard'})<br>Buttons: ${p.buttons.map((b, i) => (b.pressed ? i : null)).filter(v => v != null).join(', ') || 'none'}<br>Stick: ${p.axes.slice(0, 2).map(a => a.toFixed(2)).join(', ')}</div>`).join('') : 'No controller detected. Press a button on it.';
}

void clamp; void saveSettings;
boot();
