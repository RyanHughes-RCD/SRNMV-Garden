// Time of day, lighting keyframes.
import { G, lerp } from './game.js';
import { DATA } from './data.js';

// Returns hour of day as a float 0..24
export function hourOfDay() {
  if (G.debugHour != null) return G.debugHour;
  if (G.settings?.timeMode === 'fast') {
    const len = DATA.balance.time.fastDayLengthSec;
    return ((G.state.simTime / len) * 24 + 8) % 24;
  }
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
export const isNight = (h = hourOfDay()) => h < 6 || h >= 20.5;
export function clockLabel(h = hourOfDay()) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const ap = hh < 12 ? 'am' : 'pm', h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}
export function phaseLabel(h = hourOfDay()) {
  if (h < 5) return 'Night'; if (h < 7.5) return 'Dawn'; if (h < 11.5) return 'Morning'; if (h < 14) return 'Midday';
  if (h < 17.5) return 'Afternoon'; if (h < 20.5) return 'Dusk'; return 'Night';
}
// [hour, darkness alpha, tint r,g,b, tint alpha]
const KEYS = [
  [0, 0.62, 20, 22, 70, 0.0],
  [4.5, 0.6, 20, 22, 70, 0.0],
  [6, 0.32, 60, 40, 90, 0.10],
  [7, 0.1, 255, 170, 120, 0.2],
  [8.5, 0, 255, 230, 200, 0.0],
  [17, 0, 255, 220, 170, 0.0],
  [18.5, 0.1, 255, 130, 70, 0.22],
  [19.6, 0.32, 170, 70, 110, 0.18],
  [20.8, 0.55, 30, 28, 80, 0.02],
  [24, 0.62, 20, 22, 70, 0.0],
];
export function lighting(h = hourOfDay()) {
  let a = KEYS[0], b = KEYS[1];
  for (let i = 0; i < KEYS.length - 1; i++) if (h >= KEYS[i][0] && h <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  const t = (h - a[0]) / Math.max(0.0001, b[0] - a[0]);
  return { dark: lerp(a[1], b[1], t), tint: [lerp(a[2], b[2], t), lerp(a[3], b[3], t), lerp(a[4], b[4], t)], tintA: lerp(a[5], b[5], t) };
}
