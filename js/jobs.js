// The shared job queue. The player designates, the player or the cats do the work.
import { G, randInt } from './game.js';
import { DATA } from './data.js';
import { debrisAt, plotAt, plotTiles, ground, obj, tx, ty, choppable } from './world.js';
import * as farm from './farm.js';
import { needsWater } from './orchard.js';

export const JOB_TYPES = ['clear', 'till', 'plant', 'water'];
export const JOB_VERB = { clear: 'Clearing', till: 'Tilling', plant: 'Planting', water: 'Watering', fish: 'Fishing' };
const byKey = new Map();
const key = (t, i) => t + ':' + i;

export function rebuildJobIndex() {
  byKey.clear();
  for (const j of G.state.jobs) { j.reservedBy = null; byKey.set(key(j.type, j.tile), j); }
}
export const getJob = (type, tile) => byKey.get(key(type, tile));
export const jobsAtTile = tile => JOB_TYPES.map(t => byKey.get(key(t, tile))).filter(Boolean);
export const jobAlive = j => !!j && byKey.get(key(j.type, j.tile)) === j;

export function workAmount(type, tile) {
  const B = DATA.balance;
  if (type === 'clear') return debrisAt(tile) ? DATA.debris[debrisAt(tile)]?.work ?? 3 : B.trees?.work ?? 12;
  return B.work[type] ?? 2;
}

export function isJobValid(j) {
  const st = G.state;
  switch (j.type) {
    case 'clear': return !!debrisAt(j.tile) || choppable(j.tile);
    case 'till': return ground(j.tile) === 'g' && !obj(j.tile) && !!plotAt(j.tile);
    case 'plant': {
      if (ground(j.tile) !== 't' || st.crops[j.tile]) return false;
      if (j.manual) return farm.seedCount(j.seedKey) > 0;
      const p = plotAt(j.tile);
      return !!p && farm.plotSeedKeyForTile(p, j.tile) === j.seedKey && farm.seedCount(j.seedKey) > 0;
    }
    case 'water': { const t = st.trees?.[j.tile]; if (t) return needsWater(t); const c = st.crops[j.tile]; return !!c && c.stage < 3 && !(c.wetUntil > st.simTime); }
  }
  return false;
}

export function addJob(type, tile, extra = {}) {
  const existing = getJob(type, tile);
  if (existing) { Object.assign(existing, extra); return existing; }
  const st = G.state;
  const j = { id: st.nextJobId++, type, tile, work: workAmount(type, tile), progress: 0, created: st.simTime, reservedBy: null, ...extra };
  if (!isJobValid(j)) return null;
  st.jobs.push(j);
  byKey.set(key(type, tile), j);
  return j;
}
export function removeJob(j) {
  const st = G.state, i = st.jobs.indexOf(j);
  if (i >= 0) st.jobs.splice(i, 1);
  if (byKey.get(key(j.type, j.tile)) === j) byKey.delete(key(j.type, j.tile));
}

// Adds work; returns true when the job finished.
export function workJob(j, amount, worker) {
  if (!jobAlive(j)) return true;
  if (!isJobValid(j)) { removeJob(j); return true; }
  j.progress += amount;
  if (j.progress >= j.work) { completeJob(j, worker); return true; }
  return false;
}

function completeJob(j, worker) {
  const st = G.state;
  removeJob(j);
  const res = { job: j, worker };
  switch (j.type) {
    case 'clear': {
      if (!debrisAt(j.tile)) { // chopping a tree: the clearing grows and a stump is left behind
        const T = DATA.balance.trees || {};
        st.map.ground[j.tile] = 'g';
        st.map.obj[j.tile] = 'd:' + (Math.random() < (T.bigStumpChance ?? 0.6) ? 'stump_big' : 'stump_small');
        const got = {};
        for (const [m, [a, b]] of Object.entries(T.drops || { wood: [3, 5] })) { const n = randInt(a, b); if (n > 0) { st.mats[m] = (st.mats[m] || 0) + n; got[m] = n; } }
        st.stats.chopped = (st.stats.chopped || 0) + 1;
        res.tree = true; res.drops = got;
        if (j.marked) addJob('clear', j.tile, { marked: true }); // the cats will clear the stump next
        break;
      }
      const d = debrisAt(j.tile), def = DATA.debris[d];
      st.map.obj[j.tile] = null;
      const got = {};
      for (const [m, [a, b]] of Object.entries(def?.drops || {})) { const n = randInt(a, b); if (n > 0) { st.mats[m] = (st.mats[m] || 0) + n; got[m] = n; } }
      st.stats.cleared = (st.stats.cleared || 0) + 1;
      res.debris = d; res.drops = got;
      break;
    }
    case 'till': st.map.ground[j.tile] = 't'; st.stats.tilled = (st.stats.tilled || 0) + 1; break;
    case 'plant': res.crop = farm.plantTile(j.tile, j.seedKey); break;
    case 'water': { const c = st.crops[j.tile] || st.trees?.[j.tile]; if (c) c.wetUntil = st.simTime + DATA.balance.farm.waterDurationSec; st.stats.watered = (st.stats.watered || 0) + 1; break; }
  }
  G.emit('jobDone', res);
}

let genTimer = 0;
export function updateJobs(dt) {
  genTimer -= dt;
  if (genTimer > 0) return;
  genTimer = DATA.balance.farm.jobGenIntervalSec;
  // prune jobs that no longer make sense
  for (let i = G.state.jobs.length - 1; i >= 0; i--) { const j = G.state.jobs[i]; if (!isJobValid(j)) removeJob(j); }
  generate();
}

// Plots look after themselves: clear debris, till, plant the chosen seed, water.
export function generate() {
  const st = G.state;
  // fruit trees get watered too
  for (const k in st.trees || {}) if (needsWater(st.trees[k]) && !getJob('water', +k)) addJob('water', +k);
  const pending = {};
  for (const j of st.jobs) if (j.type === 'plant') pending[j.seedKey] = (pending[j.seedKey] || 0) + 1;
  for (const p of st.plots) {
    if (p.seed?.startsWith('u:') && farm.seedCount(p.seed) <= 0) p.seed = 'same';
    for (const t of plotTiles(p)) {
      if (debrisAt(t)) { addJob('clear', t, { marked: true }); continue; }
      const g = ground(t);
      if (g === 'g' && !obj(t)) { addJob('till', t); continue; }
      if (g !== 't') continue;
      const c = st.crops[t];
      if (!c) {
        if (getJob('plant', t)) continue;
        const k = farm.plotSeedKeyForTile(p, t);
        if (!k) continue;
        if (farm.seedCount(k) - (pending[k] || 0) <= 0) continue;
        if (addJob('plant', t, { seedKey: k })) pending[k] = (pending[k] || 0) + 1;
      } else if (c.stage < 3 && !(c.wetUntil > st.simTime) && !getJob('water', t)) addJob('water', t);
    }
  }
}

export function jobLabel(j) {
  if (j.type === 'clear' && !debrisAt(j.tile)) return 'Chopping a tree';
  if (j.type === 'clear') return `Clearing ${DATA.debris[debrisAt(j.tile)]?.name?.toLowerCase() || 'debris'}`;
  return JOB_VERB[j.type];
}
export function tileXY(j) { return { x: tx(j.tile), y: ty(j.tile) }; }
