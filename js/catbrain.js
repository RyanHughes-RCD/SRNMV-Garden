// Pure cat decision logic, shared by the game and the Workshop's "simulate a day".
// No DOM, no game state: everything comes in through arguments.

export const DEFAULT_TRAITS = { energy: 1, napFrequency: 1, napDuration: 1, curiosity: 1, zoomies: 1, lovesPlayer: 1, schedule: 'neutral' };
export const traits = cfg => ({ ...DEFAULT_TRAITS, ...(cfg.traits || {}) });

export function refuses(cfg, type) { return !!cfg.weaknesses?.refuses?.includes(type); }
export function affinity(cfg, type) { return refuses(cfg, type) ? 0 : (cfg.jobs?.[type]?.affinity ?? 1); }
export function workRate(cfg, type, B, buff = 1) {
  let s = cfg.jobs?.[type]?.speed ?? 1;
  if (type === 'water' && cfg.weaknesses?.hatesWater) s *= 0.5;
  return s * B.cats.baseWorkRate * buff;
}
export function jobScore(cfg, type, waitSec, dist, B) {
  const a = affinity(cfg, type);
  if (a <= 0) return 0;
  return a * (1 + Math.min(waitSec, 1800) * B.cats.jobWaitBonusPerSec) / (1 + dist / 8);
}

// How sleepy the schedule makes the cat at this hour (1 = normal).
export function sleepiness(schedule, hour) {
  const night = hour < 6 || hour >= 21;
  if (schedule === 'early') return night || hour >= 19.5 ? 3.2 : hour < 10 ? 0.5 : 1;
  if (schedule === 'night') return hour >= 11 && hour < 17 ? 2.2 : night ? 0.7 : 1;
  return night ? 2.4 : 1;
}

// Weights for what to do next when idle.
export function idleWeights(cfg, { energy, hour, jobsAvailable }) {
  const t = traits(cfg);
  const sleepy = sleepiness(t.schedule, hour);
  const night = hour < 6 || hour >= 21;
  return {
    work: jobsAvailable ? (1.2 + energy * 1.8) / Math.max(0.6, sleepy * 0.8) : 0,
    nap: 0.16 * t.napFrequency * sleepy * (1.35 - energy),
    wander: 0.22 * t.curiosity,
    zoomies: 0.05 * t.zoomies * energy * (night && t.schedule !== 'night' ? 0.3 : 1),
    visit: 0.14 * t.lovesPlayer,
    sit: 0.2,
    cabin: night ? 0.25 : 0.08,
  };
}
export const napSeconds = (cfg, B, sleepy = 1) => B.cats.baseNapSec * traits(cfg).napDuration * (0.6 + Math.random() * 0.8) * Math.min(2.5, sleepy);
export const energyDrain = (cfg, B) => B.cats.energyDrainPerWorkSec / Math.max(0.2, traits(cfg).energy);
export const DISTRACT_PER_SEC = 0.006;

function pick(weights) {
  let total = 0; for (const v of Object.values(weights)) total += Math.max(0, v);
  let r = Math.random() * total;
  for (const [k, v] of Object.entries(weights)) { r -= Math.max(0, v); if (r <= 0) return k; }
  return Object.keys(weights)[0];
}
export { pick as pickWeight };

// Rough 24h simulation with jobs of every type always available.
export function simulateDay(cfg, B, jobTypes, startHour = 0) {
  const time = { nap: 0, wander: 0, zoomies: 0, visit: 0, sit: 0, cabin: 0, walk: 0 };
  const done = {}; const workTime = {};
  for (const j of jobTypes) { done[j] = 0; workTime[j] = 0; }
  const amounts = { clear: 6, till: B.work.till, plant: B.work.plant, water: B.work.water };
  let t = 0, energy = 0.8;
  const walkSpeed = B.cats.walkTilesPerSec;
  while (t < 86400) {
    const hour = (startHour + t / 3600) % 24;
    const w = idleWeights(cfg, { energy, hour, jobsAvailable: true });
    if (energy < 0.15) { w.nap = 99; }
    const choice = pick(w);
    if (choice === 'work') {
      const scored = jobTypes.map(type => [type, jobScore(cfg, type, 120, 3 + Math.random() * 10, B)]);
      const tot = scored.reduce((a, [, s]) => a + s, 0);
      if (tot <= 0) { time.sit += 20; t += 20; continue; }
      let r = Math.random() * tot, type = scored[0][0];
      for (const [k, s] of scored) { r -= s; if (r <= 0) { type = k; break; } }
      const walk = (3 + Math.random() * 10) / walkSpeed;
      let dur = amounts[type] / workRate(cfg, type, B);
      let finished = true;
      if (cfg.weaknesses?.distractible) { const quit = -Math.log(Math.random()) / DISTRACT_PER_SEC; if (quit < dur) { dur = quit; finished = false; } }
      time.walk += walk; workTime[type] += dur; t += walk + dur;
      energy = Math.max(0, energy - dur * energyDrain(cfg, B));
      if (finished) done[type]++;
      continue;
    }
    let dur;
    if (choice === 'nap') { dur = napSeconds(cfg, B, sleepiness(traits(cfg).schedule, hour)); energy = Math.min(1, energy + dur * B.cats.energyRegenPerNapSec); }
    else if (choice === 'zoomies') dur = 6;
    else if (choice === 'visit') dur = 25;
    else if (choice === 'cabin') dur = 40 + Math.random() * 60;
    else dur = 8 + Math.random() * 18;
    time[choice] += dur; t += dur;
  }
  const total = Object.values(time).reduce((a, b) => a + b, 0) + Object.values(workTime).reduce((a, b) => a + b, 0);
  return { time, workTime, done, total };
}
