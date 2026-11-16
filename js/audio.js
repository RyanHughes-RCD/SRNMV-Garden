// Procedural Web Audio: ambience (wind, birds, crickets, owl, fire crackle) and soft SFX.
// Nothing is loaded from files, so there are no licensing concerns.
import { G } from './game.js';
import { hourOfDay } from './daytime.js';

let ac = null, master, ambBus, sfxBus, noiseBuf, wind, windGain, fireGain, waterGain;
let nextBird = 0, nextCricket = 0, nextOwl = 0, nextCrackle = 0;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; return; }
  const comp = ac.createDynamicsCompressor();
  comp.connect(ac.destination);
  master = ac.createGain(); master.connect(comp);
  ambBus = ac.createGain(); ambBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5; } // brown-ish noise
  // wind bed
  wind = ac.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  windGain = ac.createGain(); windGain.gain.value = 0.05;
  wind.connect(lp); lp.connect(windGain); windGain.connect(ambBus); wind.start();
  fireGain = ac.createGain(); fireGain.gain.value = 0; fireGain.connect(ambBus);
  // soft lapping water near the lake and river
  const ws = ac.createBufferSource(); ws.buffer = noiseBuf; ws.loop = true; ws.playbackRate.value = 0.7;
  const wf = ac.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.8;
  waterGain = ac.createGain(); waterGain.gain.value = 0;
  ws.connect(wf); wf.connect(waterGain); waterGain.connect(ambBus); ws.start();
  applyVolumes();
}
export function applyVolumes() {
  if (!ac) return;
  const s = G.settings;
  const q = s.quiet ? 0.35 : 1;
  master.gain.setTargetAtTime(s.master * q, ac.currentTime, 0.1);
  ambBus.gain.setTargetAtTime(s.ambient, ac.currentTime, 0.1);
  sfxBus.gain.setTargetAtTime(s.sfx, ac.currentTime, 0.1);
}

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, bus = sfxBus, attack = 0.01, slide = null } = {}) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  env(g, t, attack, vol, dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { vol = 0.2, at = 0, freq = 1000, q = 1, type = 'bandpass', bus = sfxBus, attack = 0.005 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); env(g, t, attack, vol, dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
export function sfx(name) {
  if (!ac || G.offline) return;
  switch (name) {
    case 'move': tone(880, 0.05, { vol: 0.04, type: 'triangle' }); break;
    case 'confirm': tone(660, 0.08, { vol: 0.08, type: 'triangle' }); tone(990, 0.12, { vol: 0.07, type: 'triangle', at: 0.06 }); break;
    case 'cancel': tone(520, 0.08, { vol: 0.06, type: 'triangle' }); tone(390, 0.12, { vol: 0.05, type: 'triangle', at: 0.06 }); break;
    case 'error': tone(220, 0.15, { vol: 0.08, type: 'square', slide: 180 }); break;
    case 'chop': noise(0.08, { vol: 0.25, freq: 900, q: 2 }); tone(180, 0.06, { vol: 0.08, type: 'triangle' }); break;
    case 'dig': noise(0.12, { vol: 0.25, freq: 400, q: 0.8 }); break;
    case 'water': noise(0.35, { vol: 0.12, freq: 2500, q: 0.6, attack: 0.05 }); break;
    case 'plant': tone(440, 0.08, { vol: 0.08, type: 'sine', slide: 660 }); break;
    case 'pop': tone(500, 0.06, { vol: 0.08, type: 'sine', slide: 900 }); break;
    case 'harvest': [0, 2, 4].forEach((n, i) => tone(PENTA[n], 0.18, { vol: 0.09, type: 'triangle', at: i * 0.06 })); break;
    case 'coin': tone(1318, 0.08, { vol: 0.07, type: 'square' }); tone(1760, 0.18, { vol: 0.06, type: 'square', at: 0.07 }); break;
    case 'grow': [0, 2, 4, 7].forEach((n, i) => { tone(PENTA[n], 0.9, { vol: 0.06, type: 'sine', at: i * 0.12, attack: 0.01 }); tone(PENTA[n] * 2, 0.5, { vol: 0.015, type: 'sine', at: i * 0.12 }); }); break;
    case 'discover': [0, 2, 4, 5, 7].forEach((n, i) => tone(PENTA[n], 0.5, { vol: 0.08, type: 'triangle', at: i * 0.1 })); tone(PENTA[7] * 2, 1.2, { vol: 0.04, at: 0.55 }); break;
    case 'purr': {
      const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
      const g = ac.createGain(); g.gain.value = 0;
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 24; lg.gain.value = 0.35;
      lfo.connect(lg); lg.connect(g.gain);
      const out = ac.createGain(); env(out, t, 0.2, 0.9, 1.6);
      s.connect(f); f.connect(g); g.connect(out); out.connect(sfxBus);
      s.start(t); lfo.start(t); s.stop(t + 1.7); lfo.stop(t + 1.7);
      tone(700, 0.25, { vol: 0.04, type: 'sine', slide: 520, at: 0.05 });
      break;
    }
    case 'swap': [4, 2, 0, 4].forEach((n, i) => tone(PENTA[n], 0.12, { vol: 0.06, type: 'triangle', at: i * 0.05 })); break;
    case 'cast': noise(0.18, { vol: 0.12, freq: 2200, q: 0.8, attack: 0.02 }); tone(900, 0.15, { vol: 0.04, type: 'sine', slide: 500 }); break;
    case 'plop': tone(420, 0.09, { vol: 0.08, type: 'sine', slide: 220 }); noise(0.06, { vol: 0.06, freq: 900, q: 1 }); break;
    case 'bite': noise(0.2, { vol: 0.25, freq: 700, q: 0.7 }); tone(1046, 0.12, { vol: 0.09, type: 'square' }); tone(1318, 0.16, { vol: 0.08, type: 'square', at: 0.1 }); break;
    case 'reel': [0, 2, 4, 7].forEach((n, i) => tone(PENTA[n] * 1.5, 0.09, { vol: 0.07, type: 'triangle', at: i * 0.05 })); noise(0.25, { vol: 0.15, freq: 1500, q: 0.6, at: 0.15 }); break;
    case 'build': noise(0.1, { vol: 0.2, freq: 600 }); tone(330, 0.1, { vol: 0.07, type: 'triangle', at: 0.05 }); break;
  }
}

// Called every frame: schedules ambient sounds based on time of day.
export function updateAmbience(dt, nearCabin, nearWater = false) {
  if (!ac || ac.state !== 'running') return;
  const now = ac.currentTime, h = hourOfDay();
  const night = h < 5.5 || h >= 20.5, day = h >= 6 && h < 19.5;
  windGain.gain.setTargetAtTime(0.035 + 0.025 * Math.sin(now / 9) + 0.015 * Math.sin(now / 3.7), now, 1.5);
  if (day && now > nextBird) {
    nextBird = now + (2.5 + Math.random() * 7) / (G.birdBoost || 1);
    const base = 1800 + Math.random() * 1600, notes = 2 + Math.floor(Math.random() * 4), vol = 0.025 + Math.random() * 0.03;
    for (let i = 0; i < notes; i++) tone(base * (1 + (Math.random() - 0.5) * 0.25), 0.09, { vol, at: i * (0.1 + Math.random() * 0.05), slide: base * (1.2 + Math.random() * 0.4), bus: ambBus });
  }
  if (night && now > nextCricket) {
    nextCricket = now + 0.8 + Math.random() * 2.2;
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) tone(f, 0.04, { vol: 0.012, at: i * 0.07, type: 'sine', bus: ambBus });
  }
  if (night && now > nextOwl) {
    nextOwl = now + 40 + Math.random() * 80;
    if (Math.random() < 0.7) { tone(390, 0.35, { vol: 0.04, attack: 0.08, slide: 350, bus: ambBus }); tone(380, 0.55, { vol: 0.04, attack: 0.08, slide: 330, at: 0.5, bus: ambBus }); }
  }
  waterGain.gain.setTargetAtTime(nearWater ? 0.05 + 0.035 * Math.sin(now / 2.7) + 0.02 * Math.sin(now / 1.3) : 0, now, 0.6);
  const fireTarget = nearCabin ? (night || h > 18 ? 0.5 : 0.18) : 0;
  fireGain.gain.setTargetAtTime(fireTarget, now, 0.8);
  if (fireTarget > 0.01 && now > nextCrackle) {
    nextCrackle = now + 0.05 + Math.random() * 0.35;
    noise(0.03, { vol: 0.08 + Math.random() * 0.1, freq: 1500 + Math.random() * 3000, q: 3, bus: fireGain });
  }
}
export const audioReady = () => !!ac && ac.state === 'running';
