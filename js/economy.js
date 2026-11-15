// Costs in coins and materials.
import { G } from './game.js';
import { iconHTML } from './sprites.js';

const RES = { coins: 'item_coin', wood: 'item_wood', stone: 'item_stone', fiber: 'item_fiber' };
const have = k => (k === 'coins' ? G.state.coins : G.state.mats[k] || 0);
export function canAfford(cost) { return !cost || Object.entries(cost).every(([k, v]) => have(k) >= v); }
export function pay(cost) {
  if (!canAfford(cost)) return false;
  for (const [k, v] of Object.entries(cost || {})) { if (k === 'coins') G.state.coins -= v; else G.state.mats[k] -= v; }
  return true;
}
export function refund(cost, mult = 1) {
  for (const [k, v] of Object.entries(cost || {})) { const n = Math.floor(v * mult); if (k === 'coins') G.state.coins += n; else G.state.mats[k] = (G.state.mats[k] || 0) + n; }
}
export function costLabel(cost) { return Object.entries(cost || {}).map(([k, v]) => `${v} ${k === 'coins' ? 'coins' : k}`).join(', ') || 'free'; }
export function costHTML(cost) {
  return Object.entries(cost || {}).map(([k, v]) => `<span class="cost ${have(k) >= v ? '' : 'short'}">${iconHTML(RES[k], 'ico sm')}${v}</span>`).join(' ') || 'free';
}
