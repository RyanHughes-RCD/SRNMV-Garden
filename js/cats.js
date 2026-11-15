// Cat entities: state machine, pathfinding, job picking, idle life, petting.
import { G, TILE, rand, randRange, pickWeighted } from './game.js';
import { DATA } from './data.js';
import { drawSprite, animFrame, slotSwap, hasSprite } from './sprites.js';
import { idx, tx, ty, findPath, workSpots, blocks, randomWalkableNear, cabinDoorFront, nearestWalkable } from './world.js';
import { jobAlive, isJobValid, workJob, JOB_VERB, jobLabel } from './jobs.js';
import * as brain from './catbrain.js';
import { hourOfDay, isNight } from './daytime.js';
import { emit, floatIcon } from './particles.js';
import { sfx } from './audio.js';
import { catFurniture, nearestCatSpot, catHouseOf, catHouseDoorstep, catWorkMult } from './decorations.js';

const tileOf = c => idx(Math.floor(c.x / TILE), Math.floor((c.y - 2) / TILE));

export function syncCats() {
  const cfgs = DATA.catsConfig.cats || [];
  const st = G.state;
  // remove cats that are no longer configured
  for (let i = G.cats.length - 1; i >= 0; i--) if (!cfgs.find(c => c.id === G.cats[i].id)) { release(G.cats[i]); G.cats.splice(i, 1); }
  cfgs.forEach((cfg, n) => {
    let cat = G.cats.find(c => c.id === cfg.id);
    if (!cat) {
      const saved = st.cats[cfg.id];
      const spawn = nearestWalkable(cabinDoorFront() + n - 1);
      cat = {
        id: cfg.id, x: saved?.x ?? tx(spawn) * TILE + 8, y: saved?.y ?? ty(spawn) * TILE + 12,
        dir: 'right', state: 'idle', timer: randRange(1, 4), path: null, job: null, onArrive: null,
        energy: saved?.energy ?? 0.9, done: saved?.done || {}, emote: null, emoteT: 0, buffUntil: 0, petAt: -99,
        activity: 'Stretching', anim: 'sit', t: rand() * 10, zoomLeft: 0, unreachable: new Map(),
      };
      if (blocks(tileOf(cat))) { const s = nearestWalkable(tileOf(cat)); cat.x = tx(s) * TILE + 8; cat.y = ty(s) * TILE + 12; }
      G.cats.push(cat);
    }
    cat.cfg = cfg;
    cat.swap = slotSwap('cat', cfg.coat);
  });
}

function release(cat) { if (cat.job && cat.job.reservedBy === cat.id) cat.job.reservedBy = null; cat.job = null; }
function setEmote(cat, sprite, sec = 2) { if (G.offline) return; cat.emote = sprite; cat.emoteT = sec; }

function goIdle(cat, sec, anim = 'sit', activity) {
  release(cat);
  cat.state = 'idle'; cat.timer = sec ?? randRange(...DATA.balance.cats.decideIntervalSec); cat.anim = anim; cat.path = null;
  if (activity) cat.activity = activity;
}

function walkTo(cat, tile, onArrive, activity) {
  cat.perch = null;
  const start = tileOf(cat);
  const path = findPath(start, tile);
  if (!path) return false;
  cat.path = path; cat.onArrive = onArrive; cat.state = 'walk'; cat.anim = 'walk';
  if (activity) cat.activity = activity;
  return true;
}

function pickJob(cat) {
  const st = G.state, B = DATA.balance, here = tileOf(cat);
  const hx = tx(here), hy = ty(here);
  const cands = [];
  for (const j of st.jobs) {
    if (j.reservedBy && j.reservedBy !== cat.id) continue;
    if ((cat.unreachable.get(j.id) || 0) > st.simTime) continue;
    const d = Math.abs(tx(j.tile) - hx) + Math.abs(ty(j.tile) - hy);
    const s = brain.jobScore(cat.cfg, j.type, st.simTime - j.created, d, B) * (0.7 + rand() * 0.6);
    if (s > 0) cands.push([j, s]);
  }
  cands.sort((a, b) => b[1] - a[1]);
  for (const [j] of cands.slice(0, 6)) {
    const spots = workSpots(j.tile);
    for (const spot of spots) {
      if (walkTo(cat, spot, () => startWork(cat, j), `Heading off: ${jobLabel(j).toLowerCase()}`)) {
        j.reservedBy = cat.id; cat.job = j;
        return true;
      }
    }
    cat.unreachable.set(j.id, st.simTime + 90);
  }
  if (cat.unreachable.size > 200) cat.unreachable.clear();
  return false;
}

function startWork(cat, j) {
  if (!jobAlive(j) || !isJobValid(j)) { goIdle(cat, 1); return; }
  cat.state = 'work'; cat.anim = 'work'; cat.job = j; j.reservedBy = cat.id;
  cat.activity = jobLabel(j);
  const jx = tx(j.tile) * TILE + 8;
  if (Math.abs(jx - cat.x) > 2) cat.dir = jx > cat.x ? 'right' : 'left';
}

function decide(cat) {
  const st = G.state, B = DATA.balance, cfg = cat.cfg;
  const hour = hourOfDay();
  if (cat.energy < 0.15) return nap(cat, hour);
  cat.perch = null; cat.napBonus = 1; cat.zoomCenter = null;
  const jobsAvailable = st.jobs.some(j => !j.reservedBy && brain.affinity(cfg, j.type) > 0);
  const here = tileOf(cat);
  const w = brain.idleWeights(cfg, { energy: cat.energy, hour, jobsAvailable, furn: catFurniture(here) });
  if (!G.state || G.offline) w.visit = 0;
  const choice = pickWeighted(Object.entries(w));
  if (choice === 'work' && pickJob(cat)) return;
  switch (choice) {
    case 'nap': return nap(cat, hour);
    case 'wander': {
      const t = randomWalkableNear(tileOf(cat), 6);
      if (t != null && walkTo(cat, t, () => goIdle(cat, randRange(2, 6), rand() < 0.5 ? 'sit' : 'sit', 'Looking around'), 'Exploring')) return;
      break;
    }
    case 'zoomies': {
      cat.zoomLeft = 4 + Math.floor(rand() * 3);
      return zoom(cat);
    }
    case 'visit': {
      const p = G.state.player;
      const t = randomWalkableNear(idx(Math.floor(p.x / TILE), Math.floor((p.y - 2) / TILE)), 1);
      const who = DATA.playersConfig.players[st.activePlayer]?.name || 'you';
      if (t != null && walkTo(cat, t, () => { goIdle(cat, randRange(6, 14), 'sit', `Hanging out with ${who}`); setEmote(cat, 'icon_heart', 1.5); }, `Following ${who}`)) return;
      break;
    }
    case 'scratch': case 'perch': case 'snack': {
      const role = { scratch: 'post', perch: 'tree', snack: 'bowls' }[choice], spot = nearestCatSpot(role, here);
      if (!spot) break;
      const nb = workSpots(spot.i).find(t => t !== spot.i) ?? workSpots(spot.i)[0];
      const label = { scratch: 'Off to the scratching post', perch: 'Climbing the cat tree', snack: 'Snack time!' }[choice];
      if (nb != null && walkTo(cat, nb, () => {
        cat.dir = tx(spot.i) * TILE + 8 > cat.x ? 'right' : 'left';
        if (choice === 'scratch') { goIdle(cat, randRange(5, 8), 'work', 'Scratching the post'); setEmote(cat, 'icon_note', 1.5); }
        if (choice === 'perch') { goIdle(cat, randRange(30, 70), 'sit', 'Perched on the cat tree'); cat.perch = { x: tx(spot.i) * TILE + 8, y: ty(spot.i) * TILE - 9, sortY: (ty(spot.i) + 1) * TILE + 1 }; }
        if (choice === 'snack') { goIdle(cat, 5, 'sit', 'Having a snack'); cat.energy = Math.min(1, cat.energy + 0.25); setEmote(cat, 'icon_heart', 1.5); }
      }, label)) return;
      break;
    }
    case 'sunbathe': {
      const spot = nearestCatSpot('cushion', here);
      if (spot && walkTo(cat, spot.i, () => startNap(cat, 1.3, 'Sunbathing on the cushion', randRange(40, 90)), 'Heading for a sunny spot')) return;
      break;
    }
    case 'play': {
      const spot = nearestCatSpot('yarn', here);
      if (spot) { cat.zoomLeft = 4 + Math.floor(rand() * 3); cat.zoomCenter = spot.i; setEmote(cat, 'icon_exclaim', 1); return zoom(cat); }
      break;
    }
    case 'cabin': {
      const fire = isNight() ? nearestCatSpot('fire', here) : null;
      if (fire) {
        const ft = randomWalkableNear(fire.i, 1);
        if (ft != null && walkTo(cat, ft, () => goIdle(cat, randRange(40, 90), 'sleep', 'Warming up by the campfire'), 'Heading to the campfire')) return;
      }
      const t = randomWalkableNear(cabinDoorFront(), 1);
      const warm = isNight();
      if (t != null && walkTo(cat, t, () => goIdle(cat, randRange(30, 80), warm ? 'sleep' : 'sit', warm ? 'Warming up by the cabin' : 'Sitting on the porch'), 'Heading home')) return;
      break;
    }
  }
  goIdle(cat, randRange(4, 12), 'sit', rand() < 0.3 ? 'Grooming' : 'Sitting pretty');
}

// Cats prefer to nap at their own house, then in a cat bed, then wherever they are.
function nap(cat, hour) {
  release(cat);
  const home = catHouseOf(cat.id), here = tileOf(cat);
  if (home) {
    const step = catHouseDoorstep(home.i);
    if (step === here) return startNap(cat, 1.5, isNight() ? 'Asleep at home' : 'Napping at home');
    if (!blocks(step) && walkTo(cat, step, () => startNap(cat, 1.5, isNight() ? 'Asleep at home' : 'Napping at home'), 'Heading home for a nap')) return;
  }
  const bed = nearestCatSpot('bed', here);
  if (bed) {
    if (bed.i === here) return startNap(cat, 1.5, 'Curled up in the cat bed');
    if (walkTo(cat, bed.i, () => startNap(cat, 1.5, 'Curled up in the cat bed'), 'Off to the cat bed')) return;
  }
  void hour;
  startNap(cat, 1, isNight() ? 'Asleep' : 'Napping');
}
function startNap(cat, bonus = 1, activity = 'Napping', seconds) {
  const B = DATA.balance, t = brain.traits(cat.cfg);
  release(cat);
  cat.state = 'nap'; cat.anim = 'sleep'; cat.path = null; cat.napBonus = bonus;
  cat.timer = seconds ?? brain.napSeconds(cat.cfg, B, brain.sleepiness(t.schedule, hourOfDay()));
  cat.activity = activity;
}

function zoom(cat) {
  if (cat.zoomLeft-- <= 0) { goIdle(cat, randRange(3, 6), 'sit', 'Catching their breath'); return; }
  const t = randomWalkableNear(cat.zoomCenter ?? tileOf(cat), cat.zoomCenter != null ? 2 : 5);
  if (t == null || !walkTo(cat, t, () => zoom(cat), cat.zoomCenter != null ? 'Playing with the yarn' : 'Zoomies!')) goIdle(cat, 2);
  cat.state = cat.state === 'walk' ? 'zoom' : cat.state;
}

function moveAlong(cat, dt, speed) {
  let dist = speed * dt;
  while (dist > 0 && cat.path && cat.path.length) {
    const next = cat.path[0];
    if (blocks(next)) { // something got built in the way
      const goal = cat.path[cat.path.length - 1], cb = cat.onArrive;
      if (!walkTo(cat, goal, cb)) { goIdle(cat, 1); return; }
      continue;
    }
    const nx = tx(next) * TILE + 8, ny = ty(next) * TILE + 12;
    const dx = nx - cat.x, dy = ny - cat.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) cat.dir = dx > 0 ? 'right' : 'left'; else if (d > 0.1) cat.dir = dy > 0 ? 'down' : 'up';
    if (d <= dist) { cat.x = nx; cat.y = ny; cat.path.shift(); dist -= d; }
    else { cat.x += dx / d * dist; cat.y += dy / d * dist; dist = 0; }
  }
  if (cat.path && !cat.path.length) { cat.path = null; const cb = cat.onArrive; cat.onArrive = null; if (cb) cb(); else goIdle(cat); }
}

export function updateCats(dt) {
  const B = DATA.balance, st = G.state;
  for (const cat of G.cats) {
    cat.t += dt;
    if (cat.emoteT > 0) { cat.emoteT -= dt; if (cat.emoteT <= 0) cat.emote = null; }
    const buff = st.simTime < cat.buffUntil ? B.cats.petBuffMult : 1;
    switch (cat.state) {
      case 'idle':
        cat.timer -= dt;
        if (cat.timer <= 0) decide(cat);
        break;
      case 'walk': case 'zoom': {
        const sp = B.cats.walkTilesPerSec * TILE * (cat.state === 'zoom' ? B.cats.zoomiesSpeedMult : 1) * (buff > 1 ? 1.15 : 1);
        moveAlong(cat, dt, sp);
        if (cat.job && !jobAlive(cat.job) && cat.state === 'walk') goIdle(cat, 1);
        break;
      }
      case 'work': {
        const j = cat.job;
        if (!jobAlive(j) || !isJobValid(j)) { goIdle(cat, randRange(1, 3)); break; }
        const done = workJob(j, brain.workRate(cat.cfg, j.type, B, buff * catWorkMult()) * dt, cat.id);
        cat.energy = Math.max(0, cat.energy - brain.energyDrain(cat.cfg, B) * dt);
        if (!G.offline && rand() < dt * 2) {
          if (j.type === 'water') emit({ x: tx(j.tile) * TILE + 8 + randRange(-4, 4), y: ty(j.tile) * TILE + 4, vy: 20, g: 60, life: 0.4, color: '#7fb3d5' });
          else emit({ x: cat.x + (cat.dir === 'left' ? -6 : 6), y: cat.y - 2, vx: randRange(-20, 20), vy: -30, g: 120, life: 0.4, sprite: j.type === 'clear' ? 'fx_leaf' : 'fx_dirt' });
        }
        if (done) {
          cat.done[j.type] = (cat.done[j.type] || 0) + 1;
          cat.job = null;
          setEmote(cat, 'icon_note', 1.2);
          goIdle(cat, randRange(1, 3), 'sit', `Proud of their ${JOB_VERB[j.type].toLowerCase()}`);
        } else if (cat.cfg.weaknesses?.distractible && rand() < brain.DISTRACT_PER_SEC * dt) {
          setEmote(cat, 'icon_question', 2);
          goIdle(cat, 0.5, 'sit', 'Got distracted!');
          const t = randomWalkableNear(tileOf(cat), 4);
          if (t != null) walkTo(cat, t, () => goIdle(cat, randRange(4, 10), 'sit', 'Watching a butterfly'), 'Chasing something');
        } else if (j.type === 'water' && cat.cfg.weaknesses?.hatesWater && rand() < 0.01 * dt) {
          setEmote(cat, 'icon_exclaim', 1.5);
          goIdle(cat, randRange(3, 6), 'sit', 'Shaking water off their paws');
        }
        break;
      }
      case 'nap': {
        cat.timer -= dt;
        cat.energy = Math.min(1, cat.energy + B.cats.energyRegenPerNapSec * (cat.napBonus || 1) * dt);
        if (!G.offline && rand() < dt * 0.25) floatIcon(cat.x + 2, cat.y - 10, 'icon_zzz');
        if (cat.timer <= 0) goIdle(cat, randRange(1, 3), 'sit', 'Waking up');
        break;
      }
      case 'pet':
        cat.timer -= dt;
        if (cat.timer <= 0) goIdle(cat, randRange(2, 5), 'sit', 'Feeling loved');
        break;
    }
  }
}

export function catNear(px, py, r = 13) {
  let best = null, bd = r;
  for (const c of G.cats) { const d = Math.hypot(c.x - px, c.y - 4 - py); if (d < bd) { bd = d; best = c; } }
  return best;
}
export function petCat(cat) {
  cat.perch = null;
  const st = G.state, B = DATA.balance;
  if (G.realTime - cat.petAt < 0.6) return;
  cat.petAt = G.realTime;
  release(cat);
  cat.state = 'pet'; cat.anim = 'sit'; cat.timer = 1.8; cat.path = null;
  cat.buffUntil = st.simTime + B.cats.petBuffSec;
  cat.energy = Math.min(1, cat.energy + 0.05);
  cat.activity = 'Being petted';
  for (let k = 0; k < 3; k++) emit({ x: cat.x - 4 + randRange(-5, 5), y: cat.y - 16, vx: randRange(-6, 6), vy: -18, life: 1.1, sprite: 'icon_heart' });
  sfx('purr');
  G.emit('petted', { cat });
}

function spriteName(cat) {
  const set = cat.cfg.spriteSet || 'cat';
  let n, flip = false;
  if (cat.anim === 'walk' || cat.state === 'walk' || cat.state === 'zoom') {
    if (cat.dir === 'up') n = 'walk_up'; else if (cat.dir === 'down') n = 'walk_down'; else { n = 'walk_side'; flip = cat.dir === 'left'; }
  } else if (cat.anim === 'work') { n = 'work'; flip = cat.dir === 'left'; }
  else if (cat.anim === 'sleep') { n = 'sleep'; flip = cat.dir === 'left'; }
  else { n = 'sit'; flip = cat.dir === 'left'; }
  const name = hasSprite(`${set}_${n}`) ? `${set}_${n}` : `cat_${n}`;
  return { name, flip };
}
export function drawCats(push, ctx, t) {
  for (const cat of G.cats) {
    const at = cat.perch || cat;
    push(cat.perch ? cat.perch.sortY : cat.y, () => {
      const { name, flip } = spriteName(cat);
      const fps = cat.state === 'zoom' ? 16 : undefined;
      drawSprite(ctx, name, animFrame(name, cat.t, fps), at.x - 8, at.y - 15, { flip, swap: cat.swap.swap, swapKey: cat.swap.key });
      if (cat.emote) drawSprite(ctx, cat.emote, 0, at.x - 4, at.y - 25 + Math.round(Math.sin(G.realTime * 5)));
    });
  }
}
