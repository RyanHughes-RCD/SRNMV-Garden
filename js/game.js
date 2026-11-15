// The shared game object. Every module imports G to reach state and events.
export const G = {
  state: null,        // the saved game state (see state.js)
  settings: null,     // device settings (separate from the save)
  timeScale: 1,       // debug fast-forward
  offline: false,     // true while catching up on time spent away
  realTime: 0,        // seconds since page load (real clock, unscaled)
  mode: 'boot',       // boot | title | play | menu | designate | place | catchup
  view: { w: 480, h: 270, scale: 4 },
  camera: { x: 0, y: 0, tx: 0, ty: 0 },
  lastInput: 0,       // G.realTime of the most recent input
  cats: [],           // runtime cat entities (cats.js)
  _handlers: {},
  on(name, fn) { (this._handlers[name] ||= []).push(fn); return () => this.off(name, fn); },
  off(name, fn) { const l = this._handlers[name]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
  emit(name, data) { const l = this._handlers[name]; if (l) for (const fn of [...l]) fn(data); },
};

export const TILE = 16;
export const rand = Math.random;
export const randRange = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function pickWeighted(entries) { // [[item, weight], ...]
  let total = 0; for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return entries.length ? entries[0][0] : null;
  let r = Math.random() * total;
  for (const [item, w] of entries) { r -= Math.max(0, w); if (r <= 0) return item; }
  return entries[entries.length - 1][0];
}
export function hash2(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); return `${h}h ${m % 60}m`;
}
