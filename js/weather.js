// Live weather, following the real weather in the city set in data/weather.json (Toronto).
//
// Every few minutes the game asks Open-Meteo (free, no key, works from the browser) for the
// current conditions there. The garden then shows them: clouds drifting over, an overcast grey,
// rain slanting with the real wind, snow falling, snow lying on the ground when there's real snow
// on the ground, fog, and thunderstorms with lightning. Rain also waters the crops, so the cats get
// a break. The last report is cached, so a dropped connection doesn't change anything; with live
// weather off (Settings) it's always fair. Everything visual eases in and out over ~20 seconds.
import { G, TILE, rand, randRange, clamp } from './game.js';
import { DATA, readLS, writeLS } from './data.js';
import { iconHTML } from './sprites.js';
import { lighting } from './daytime.js';
import { sfx, setRain } from './audio.js';

const CACHE_KEY = 'srnmv.weather';
const CFG = () => DATA.weather || {};

// WMO weather codes -> what we draw
const CODES = {
  0: ['clear', 0, 'Clear'], 1: ['clear', 0, 'Mostly clear'], 2: ['cloudy', 0, 'Partly cloudy'], 3: ['cloudy', 0, 'Overcast'],
  45: ['fog', 0.7, 'Fog'], 48: ['fog', 0.8, 'Freezing fog'],
  51: ['rain', 0.2, 'Light drizzle'], 53: ['rain', 0.3, 'Drizzle'], 55: ['rain', 0.45, 'Heavy drizzle'], 56: ['rain', 0.3, 'Freezing drizzle'], 57: ['rain', 0.45, 'Freezing drizzle'],
  61: ['rain', 0.4, 'Light rain'], 63: ['rain', 0.7, 'Rain'], 65: ['rain', 1, 'Heavy rain'], 66: ['rain', 0.5, 'Freezing rain'], 67: ['rain', 0.9, 'Freezing rain'],
  71: ['snow', 0.4, 'Light snow'], 73: ['snow', 0.7, 'Snow'], 75: ['snow', 1, 'Heavy snow'], 77: ['snow', 0.3, 'Snow grains'],
  80: ['rain', 0.5, 'Light showers'], 81: ['rain', 0.75, 'Showers'], 82: ['rain', 1, 'Heavy showers'], 85: ['snow', 0.5, 'Snow showers'], 86: ['snow', 0.9, 'Heavy snow showers'],
  95: ['storm', 1, 'Thunderstorm'], 96: ['storm', 1, 'Thunderstorm with hail'], 99: ['storm', 1, 'Thunderstorm with hail'],
};
// Weathers you can force from the debug menu ('live' = the real thing).
export const DEBUG_WEATHERS = ['live', 'clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];
const FAKE = { clear: 0, cloudy: 3, rain: 63, storm: 95, snow: 73, fog: 45 };

// The latest report, and the smoothed values we actually draw with.
export const weather = { code: 0, kind: 'clear', label: 'Clear', temp: null, cloud: 0, wind: 8, windDir: 270, snowDepth: 0, source: 'none', at: 0 };
const cur = { cloud: 0, rain: 0, snow: 0, fog: 0, storm: 0, cover: 0 };

/* -------------------------------------------------------------- fetching */
let nextFetch = 0, fetching = false, snapNext = false;
// Jump straight to the current weather (no fade) - on the first report after loading, and when forced.
export function snapWeather() { snapNext = true; }
function apply(c, source) {
  if (weather.source === 'none' || source.startsWith('debug') || weather.source.startsWith('debug')) snapNext = true;
  const [kind, level, label] = CODES[c.weather_code] || ['clear', 0, 'Clear'];
  Object.assign(weather, { code: c.weather_code, kind, level, label, temp: c.temperature_2m ?? null, cloud: (c.cloud_cover ?? (kind === 'clear' ? 0 : 80)) / 100, wind: c.wind_speed_10m ?? 8, windDir: c.wind_direction_10m ?? 270, snowDepth: c.snow_depth ?? 0, source, at: Date.now() });
}
async function refresh() {
  if (fetching) return;
  const C = CFG();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${C.latitude}&longitude=${C.longitude}&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,snow_depth&timezone=${encodeURIComponent(C.timezone || 'auto')}`;
  fetching = true;
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`weather ${r.status}`);
    const j = await r.json();
    if (!j.current || j.current.weather_code == null) throw new Error('no current weather');
    apply(j.current, 'live');
    writeLS(CACHE_KEY, { current: j.current, at: Date.now() });
  } catch (e) {
    console.warn('weather: keeping the last report', e?.message || e);
  } finally { fetching = false; }
}
export function initWeather() {
  const c = readLS(CACHE_KEY);
  if (c?.current && Date.now() - c.at < 6 * 3600e3) apply(c.current, 'cached');
  nextFetch = 0;
}
function liveOn() { return G.settings?.liveWeather !== false; }

/* ---------------------------------------------------------------- update */
let rainWaterT = 0, flash = 0, nextBolt = 0;
const drops = [], flakes = [], clouds = [], fogBands = [];
export function updateWeather(dt) {
  const now = Date.now();
  const forced = G.weatherOverride && G.weatherOverride !== 'live' ? G.weatherOverride : null;
  if (forced) { if (weather.source !== 'debug:' + forced) apply({ weather_code: FAKE[forced], temperature_2m: forced === 'snow' ? -3 : 12, cloud_cover: forced === 'clear' ? 0 : forced === 'cloudy' ? 60 : 95, wind_speed_10m: forced === 'storm' ? 35 : 12, wind_direction_10m: 260, snow_depth: forced === 'snow' ? 0.1 : 0 }, 'debug:' + forced); }
  else if (liveOn()) { if (now >= nextFetch) { nextFetch = now + (CFG().refreshMinutes ?? 15) * 60e3; refresh(); } }
  else if (weather.source !== 'off') apply({ weather_code: 0, temperature_2m: null, cloud_cover: 0 }, 'off');
  // targets for the drawn weather
  const k = weather.kind, lv = weather.level || 0;
  const tgt = {
    cloud: k === 'clear' ? Math.min(weather.cloud, 0.3) : Math.max(weather.cloud, k === 'cloudy' ? 0.3 : 0.75),
    rain: k === 'rain' ? lv : k === 'storm' ? 1 : 0, snow: k === 'snow' ? lv : 0, fog: k === 'fog' ? lv : 0, storm: k === 'storm' ? 1 : 0,
    cover: clamp((weather.snowDepth || 0) / (CFG().snowDepthFull ?? 0.05), 0, 1) || (k === 'snow' ? Math.max(cur.cover, 0.35) : 0),
  };
  const e = snapNext ? 1 : Math.min(1, dt / 20), ec = snapNext ? 1 : Math.min(1, dt / 120);
  snapNext = false;
  for (const key of ['cloud', 'rain', 'snow', 'fog', 'storm']) cur[key] += (tgt[key] - cur[key]) * e;
  cur.cover += (tgt.cover - cur.cover) * ec;
  setRain(cur.rain, !!G.state?.home?.inside);
  // rain waters the garden (outdoor crops and fruit trees)
  if (G.state && cur.rain > 0.15 && !G.offline) {
    rainWaterT -= dt;
    if (rainWaterT <= 0) {
      rainWaterT = 20;
      const st = G.state, until = st.simTime + (CFG().rainWaterSec ?? 3600);
      for (const c of Object.values(st.crops)) if (!(c.wetUntil > until)) c.wetUntil = until;
      for (const t of Object.values(st.trees || {})) if (!(t.wetUntil > until)) t.wetUntil = until;
    }
  }
  // lightning
  if (cur.storm > 0.5 && now > nextBolt) { nextBolt = now + randRange(9, 30) * 1000; flash = 1; setTimeout(() => sfx('thunder'), randRange(300, 2500)); }
  flash = Math.max(0, flash - dt * 2.2);
}

/* ---------------------------------------------------------------- queries */
export const sunFactor = () => 1 - cur.cloud * 0.85 - cur.fog * 0.5;    // dims sun shadows
export const snowCover = () => cur.cover;
export const weatherLevels = () => cur;
export function weatherIcon() {
  const k = weather.kind, night = lighting().dark > 0.3;
  if (k === 'storm') return 'wx_storm';
  if (k === 'snow') return 'wx_snow';
  if (k === 'rain') return 'wx_rain';
  if (k === 'fog') return 'wx_fog';
  if (k === 'cloudy') return weather.cloud > 0.85 ? 'wx_cloud' : night ? 'wx_cloud' : 'wx_partly';
  return night ? 'wx_moon' : 'wx_sun';
}
export function weatherHUD() {
  if (weather.source === 'none' || weather.source === 'off') return '';
  const t = weather.temp == null ? '' : `${Math.round(weather.temp)}°C · `;
  return `<div class="weather-hud">${iconHTML(weatherIcon(), 'ico sm')}${t}${weather.label}</div>`;
}
// For the cabin windows.
export function skyTint(base) {
  if (cur.storm > 0.4 || cur.rain > 0.5) return '#5f6b7a';
  if (cur.snow > 0.3 || cur.fog > 0.4) return '#c9d2dc';
  if (cur.cloud > 0.6) return '#8fa3b5';
  return base;
}

/* ---------------------------------------------------------------- drawing */
// Drawn over the world (screen space, in game pixels) before the night lighting, so night darkens it.
export function drawWeather(ctx, ox, oy, t, dt) {
  const vw = G.view.w, vh = G.view.h;
  const sun = 1 - lighting().dark;
  // cloud shadows drifting over on partly cloudy days
  const want = cur.cloud > 0.15 && cur.cloud < 0.9 ? 7 : 0;
  while (clouds.length < want) clouds.push({ x: rand() * 1400 - 200, y: rand() * 900 - 100, r: randRange(70, 140), s: randRange(0.6, 1.2) });
  if (clouds.length > want) clouds.length = want;
  const windDx = Math.sin((weather.windDir || 270) * Math.PI / 180) * -1; // blowing toward
  for (const c of clouds) {
    c.x += windDx * (4 + weather.wind * 0.3) * c.s * dt;
    if (c.x > 1400) c.x = -300; if (c.x < -300) c.x = 1400;
    const a = 0.24 * Math.min(1, cur.cloud * 2) * (1 - Math.max(0, cur.cloud - 0.6) * 2.5) * sun;
    if (a < 0.01) continue;
    const x = c.x - ox * 0.2 - 0, y = c.y - oy * 0.2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, c.r);
    g.addColorStop(0, `rgba(20,30,60,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(20,30,60,0)');
    ctx.fillStyle = g; ctx.fillRect(x - c.r, y - c.r, c.r * 2, c.r * 2);
  }
  // overcast and rain greyness
  const grey = Math.max(0, cur.cloud - 0.5) * 0.22 + cur.rain * 0.12 + cur.storm * 0.12;
  if (grey > 0.01) { ctx.fillStyle = `rgba(70,80,100,${grey.toFixed(3)})`; ctx.fillRect(0, 0, vw, vh); }
  // fog: a pale haze with slow bands
  if (cur.fog > 0.02) {
    ctx.fillStyle = `rgba(215,222,232,${(cur.fog * 0.32).toFixed(3)})`; ctx.fillRect(0, 0, vw, vh);
    while (fogBands.length < 5) fogBands.push({ y: rand() * vh, s: randRange(3, 8), x: rand() * vw, h: randRange(20, 50) });
    for (const b of fogBands) { b.x = (b.x + b.s * dt) % (vw + 200); const g = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h); g.addColorStop(0, 'rgba(230,235,242,0)'); g.addColorStop(0.5, `rgba(230,235,242,${(cur.fog * 0.25).toFixed(3)})`); g.addColorStop(1, 'rgba(230,235,242,0)'); ctx.fillStyle = g; ctx.fillRect(0, b.y - b.h, vw, b.h * 2); }
  }
  // rain, slanting with the wind
  const nRain = Math.round(cur.rain * 520);
  const slant = clamp(windDx * weather.wind / 25, -0.8, 0.8);
  while (drops.length < nRain) drops.push({ x: rand() * vw, y: rand() * vh, v: randRange(260, 340), l: randRange(4, 8) });
  if (drops.length > nRain) drops.length = nRain;
  if (drops.length) {
    ctx.strokeStyle = 'rgba(200,218,245,0.7)'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (const d of drops) {
      d.y += d.v * dt; d.x += d.v * slant * dt;
      if (d.y > vh) { d.y = -d.l; d.x = rand() * vw; if (rand() < 0.3) splash(ctx, rand() * vw, rand() * vh); }
      if (d.x > vw) d.x -= vw; if (d.x < 0) d.x += vw;
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - slant * d.l, d.y - d.l);
    }
    ctx.stroke();
    // little splashes on the ground
    ctx.fillStyle = 'rgba(210,225,245,0.5)';
    for (let k = 0; k < cur.rain * 14; k++) { const x = rand() * vw, y = rand() * vh; ctx.fillRect(x, y, 1.5, 0.5); }
  }
  // snow, drifting
  const nSnow = Math.round(cur.snow * 260);
  while (flakes.length < nSnow) flakes.push({ x: rand() * vw, y: rand() * vh, v: randRange(14, 30), s: rand() < 0.3 ? 1.5 : 1, p: rand() * 6 });
  if (flakes.length > nSnow) flakes.length = nSnow;
  if (flakes.length) {
    ctx.fillStyle = 'rgba(250,252,255,0.9)';
    for (const f of flakes) {
      f.y += f.v * dt; f.x += (Math.sin(t * 1.3 + f.p) * 8 + windDx * weather.wind * 0.4) * dt;
      if (f.y > vh) { f.y = -2; f.x = rand() * vw; } if (f.x > vw) f.x -= vw; if (f.x < 0) f.x += vw;
      ctx.fillRect(f.x, f.y, f.s, f.s);
    }
  }
}
function splash(ctx, x, y) { ctx.fillStyle = 'rgba(210,225,245,0.6)'; ctx.fillRect(x - 1, y, 3, 0.6); }
// Lightning: a quick white flash over everything (after the night lighting).
export function drawWeatherFlash(ctx) {
  if (flash <= 0.01) return;
  const a = flash > 0.8 ? 0.55 : flash > 0.6 ? 0.1 : flash > 0.45 ? 0.4 : flash * 0.3;
  ctx.fillStyle = `rgba(235,240,255,${a.toFixed(3)})`; ctx.fillRect(0, 0, G.view.w, G.view.h);
}
// Snow lying on the ground: whitens grass, paths and soil (not water) in view.
export function drawSnowGround(ctx, x0, y0, x1, y1) {
  if (cur.cover < 0.02) return;
  const m = G.state.map;
  ctx.fillStyle = `rgba(226,235,246,${(cur.cover * 0.62).toFixed(3)})`;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const g = m.ground[y * m.w + x]; if (g && g !== 'w') ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
}
