// Digging for bugs. With the shovel you (or a cat, via Plan mode) dig a patch of open grass: it
// may turn up a bug (data/bugs.json) and always leaves a mound of dirt, which is debris to clear.
// Bugs are fishing bait (fishing.js), and rarer bugs make better bait.
import { G, rand, pickWeighted } from './game.js';
import { DATA } from './data.js';
import { isNight } from './daytime.js';

const an = s => (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;
export const bugName = (id, article = false) => { const n = DATA.bugById[id]?.name || id; return article ? an(n.toLowerCase()) : n; };

// Can this tile be dug? Open grass with nothing on it (not in a plot).
export function diggable(st, t, plotAt) {
  return st.map.ground[t] === 'g' && !st.map.obj[t] && !st.crops[t] && !plotAt(t);
}

// The dig is done: leave dirt behind and maybe find a bug. Returns { bug, first }.
export function digUp(tile, luck = 0) {
  const st = G.state, cfg = DATA.bugsCfg;
  st.map.obj[tile] = 'd:dirt';
  st.stats.dug = (st.stats.dug || 0) + 1;
  if (rand() >= Math.min(0.95, (cfg.findChance ?? 0.75) + luck * 0.5)) return { bug: null };
  const night = isNight();
  const pool = DATA.bugs.filter(b => !b.time || (b.time === 'night') === night);
  // luck (an upgraded shovel) tips the odds toward the rarer, more valuable bugs
  const bug = pickWeighted(pool.map(b => [b.id, b.weight * (1 + luck * 4 * Math.log10(Math.max(10, b.price)) / 3)]));
  st.inv.bugs[bug] = (st.inv.bugs[bug] || 0) + 1;
  const first = !st.bugsFound[bug];
  st.bugsFound[bug] = (st.bugsFound[bug] || 0) + 1;
  return { bug, first };
}
