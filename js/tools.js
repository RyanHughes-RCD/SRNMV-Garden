// Tool upgrades (data/tools.json). Every tool goes Basic -> Copper -> Silver -> Gold, and each level
// makes it better at its own job. Upgrades are yours: the cats work at their own pace.
import { G, rand } from './game.js';
import { DATA } from './data.js';
import { canAfford, pay } from './economy.js';
import { toast } from './ui.js';
import { hasSprite } from './sprites.js';

const T = () => DATA.tools || { levels: ['Basic'], costs: [null], tools: {} };
export const toolLevel = id => G.state?.player?.toolLevels?.[id] || 0;
export const maxLevel = () => T().levels.length - 1;
export function stat(id, key, lv = toolLevel(id)) {
  const v = T().tools[id]?.[key];
  return Array.isArray(v) ? v[Math.min(lv, v.length - 1)] : v ?? 0;
}
export const levelName = (id, lv = toolLevel(id)) => T().levels[lv] || '';
// "Copper hoe", "Gold watering can"; a basic tool just goes by its name
export function toolTitle(t, lv = toolLevel(t.id)) { return lv ? `${T().levels[lv]} ${t.name.toLowerCase()}` : t.name; }
export const upgradable = id => !!T().tools[id]; // hands don't upgrade
export const upgradeCost = id => (upgradable(id) ? T().costs[toolLevel(id) + 1] || null : null);
// The tool's picture for its level (tool_can, tool_can_1, ...)
export const toolIcon = (t, lv = toolLevel(t.id)) => (lv && hasSprite(`${t.icon}_${lv}`) ? `${t.icon}_${lv}` : t.icon);

const pct = v => `${Math.round(v * 100)}%`, times = v => `${+v.toFixed(1)}×`;
// What a tool does at a level, in words.
export function effectText(id, lv = toolLevel(id)) {
  const s = k => stat(id, k, lv);
  switch (id) {
    case 'hand': return 'Harvests, picks, pets and opens';
    case 'axe': return `Clears and chops ${times(s('speed'))} as fast${s('bonusDrop') ? ` · ${pct(s('bonusDrop'))} chance of extra wood or stone` : ''}`;
    case 'hoe': return `Tills ${times(s('speed'))} as fast`;
    case 'seeds': return s('saveSeed') ? `${pct(s('saveSeed'))} chance to keep the seed when you plant` : 'Plants the seeds you hold';
    case 'can': { const a = s('area'); return `Waters ${times(s('speed'))} as fast · water lasts ${times(s('duration'))} as long · waters ${a >= 9 ? 'a 3×3 patch' : a >= 3 ? 'a row of 3' : 'one tile'}`; }
    case 'shovel': return `Digs ${times(s('speed'))} as fast${s('luck') ? ` · finds more bugs, and rarer ones (+${pct(s('luck'))})` : ''}`;
    case 'rod': return `${times(s('window'))} as long to pull the fish in${s('rareBonus') ? ` · better odds of rare fish · ${pct(s('saveBait'))} chance to keep your bait` : ''}`;
  }
  return '';
}
export function upgradeTool(id) {
  const cost = upgradeCost(id);
  if (!cost || !canAfford(cost)) return false;
  pay(cost);
  const p = G.state.player;
  (p.toolLevels ||= {})[id] = toolLevel(id) + 1;
  return true;
}

/* ------------------------------------------------------------- effects */
// How much faster you work at a job with the tool in your hand.
export const workSpeed = (tool, type) => (tool?.allow?.includes(type) ? stat(tool.id, 'speed') || 1 : 1);

// After you water a crop or tree with an upgraded can: longer-lasting water, and a row or patch around it.
export function waterAround(tile) {
  const st = G.state, w = st.map.w, area = stat('can', 'area'), until = st.simTime + DATA.balance.farm.waterDurationSec * stat('can', 'duration');
  const offs = area >= 9 ? [-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => [dx, dy])) : area >= 3 ? [[-1, 0], [0, 0], [1, 0]] : [[0, 0]];
  for (const [dx, dy] of offs) {
    const t = tile + dy * w + dx, c = st.crops[t] || st.trees?.[t];
    if (c && !(c.wetUntil > until)) c.wetUntil = until;
  }
}
// Clearing tools and seed bag bonuses, for jobs you finish yourself.
export function initToolEffects() {
  G.on('jobDone', e => {
    if (e.worker !== 'player') return;
    const st = G.state;
    if (e.job.type === 'clear' && e.drops && rand() < stat('axe', 'bonusDrop')) {
      for (const k of Object.keys(e.drops)) { st.mats[k] = (st.mats[k] || 0) + 1; e.drops[k]++; }
    }
    if (e.job.type === 'plant' && e.crop && rand() < stat('seeds', 'saveSeed')) {
      const k = e.job.seedKey || '';
      if (k.startsWith('u:')) (st.inv.unknown[k.slice(2)] ||= []).push(e.crop); else st.inv.seeds[e.crop] = (st.inv.seeds[e.crop] || 0) + 1;
      if (!G.offline) toast('Your seed bag kept the seed!', 'tool_seeds', 1500);
    }
  });
}
