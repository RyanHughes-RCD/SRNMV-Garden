// Pooled particles + ambient critters (butterflies by day, fireflies by night).
import { G, randRange, rand } from './game.js';
import { drawSprite, animFrame } from './sprites.js';
import { isNight } from './daytime.js';

const MAX = 240;
const pool = Array.from({ length: MAX }, () => ({ alive: false }));
export function emit(p) {
  for (const s of pool) if (!s.alive) {
    Object.assign(s, { alive: true, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 1, max: 1, sprite: null, color: null, size: 1, frameRate: 0, glow: false, fade: true, layer: 0 }, p);
    s.max = s.life;
    return s;
  }
  return null;
}
export function burst(x, y, opts = {}) {
  const n = opts.n ?? 6;
  for (let k = 0; k < n; k++) emit({ x, y, vx: randRange(-30, 30) * (opts.spread ?? 1), vy: randRange(-50, -10) * (opts.up ?? 1), g: opts.g ?? 90, life: randRange(0.4, 0.9) * (opts.lifeMul ?? 1), sprite: opts.sprite, color: opts.color, size: opts.size ?? 1 });
}
export function sparkle(x, y, n = 4) { for (let k = 0; k < n; k++) emit({ x: x + randRange(-6, 6), y: y + randRange(-8, 2), vy: -8, life: 0.7 + rand() * 0.4, sprite: 'fx_sparkle', frameRate: 6, fade: false }); }
export function poof(x, y) { emit({ x: x - 8, y: y - 10, life: 0.4, sprite: 'fx_poof', frameRate: 10, fade: false }); }
export function floatIcon(x, y, sprite) { emit({ x: x - 4, y: y - 8, vy: -14, life: 1.3, sprite }); }

const critters = [];
export function updateParticles(dt) {
  for (const s of pool) {
    if (!s.alive) continue;
    s.life -= dt;
    if (s.life <= 0) { s.alive = false; continue; }
    s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt;
  }
  // ambient critters
  const night = isNight();
  const want = night ? 18 : 4;
  const kind = night ? 'firefly' : 'butterfly';
  for (let i = critters.length - 1; i >= 0; i--) if (critters[i].kind !== kind && rand() < dt * 0.2) critters.splice(i, 1);
  if (critters.filter(c => c.kind === kind).length < want && rand() < dt * 0.5) {
    const cam = G.camera;
    critters.push({ kind, x: cam.x + rand() * G.view.w, y: cam.y + rand() * G.view.h, t: rand() * 10, vx: 0, vy: 0, sp: ['fx_butterfly_a', 'fx_butterfly_b', 'fx_butterfly_c'][(rand() * 3) | 0] });
  }
  for (const c of critters) {
    c.t += dt;
    const sp = c.kind === 'firefly' ? 6 : 14;
    c.vx += (rand() - 0.5) * 60 * dt; c.vy += (rand() - 0.5) * 60 * dt;
    const m = Math.hypot(c.vx, c.vy); if (m > sp) { c.vx *= sp / m; c.vy *= sp / m; }
    c.x += c.vx * dt; c.y += c.vy * dt;
  }
  // keep critters near the view
  for (let i = critters.length - 1; i >= 0; i--) {
    const c = critters[i];
    if (c.x < G.camera.x - 60 || c.x > G.camera.x + G.view.w + 60 || c.y < G.camera.y - 60 || c.y > G.camera.y + G.view.h + 60) critters.splice(i, 1);
  }
}
export function critterList() { return critters; }
export function drawParticles(ctx, t, layer = 0) {
  for (const s of pool) {
    if (!s.alive || s.layer !== layer) continue;
    const a = s.fade ? Math.min(1, s.life / s.max * 1.5) : 1;
    if (s.sprite) {
      const f = s.frameRate ? Math.min(Math.floor((s.max - s.life) * s.frameRate), 99) : 0;
      drawSprite(ctx, s.sprite, f, s.x, s.y, { alpha: a });
    } else if (s.color) {
      ctx.globalAlpha = a; ctx.fillStyle = s.color; ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size); ctx.globalAlpha = 1;
    }
  }
}
export function drawCritters(ctx, t, glowPass) {
  for (const c of critters) {
    if (c.kind === 'butterfly' && !glowPass) drawSprite(ctx, c.sp, animFrame(c.sp, c.t), c.x - 4, c.y - 4 - Math.abs(Math.sin(c.t * 3)) * 2);
    if (c.kind === 'firefly' && glowPass) {
      const a = 0.5 + 0.5 * Math.sin(c.t * 2.3 + c.x);
      ctx.fillStyle = `rgba(250,240,140,${(a * 0.25).toFixed(3)})`; ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 3, 3);
      ctx.fillStyle = `rgba(255,250,190,${a.toFixed(3)})`; ctx.fillRect(Math.round(c.x), Math.round(c.y), 1, 1);
    }
  }
}
