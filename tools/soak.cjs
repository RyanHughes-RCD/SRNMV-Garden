// Soak test: runs the game at x1000 speed for a while and checks memory, entity counts
// and save integrity. Needs Playwright (npm i -D playwright) and a local server:
//   python3 -m http.server 8000
//   node tools/soak.cjs http://localhost:8000/ 3      (URL, real minutes)
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8000/';
const MINUTES = +(process.argv[3] || 3);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1200);
  for (const k of ['Space', 'KeyE', 'KeyE']) { await page.keyboard.press(k); await page.waitForTimeout(150); }

  // A busy garden: every bit of debris marked, three plots, seeds of everything.
  await page.evaluate(async () => {
    const G = window.__game, st = G.state;
    const jobs = await import('./js/jobs.js');
    st.coins = 50000;
    for (let i = 0; i < st.map.obj.length; i++) if (st.map.obj[i]?.startsWith('d:')) jobs.addJob('clear', i, { marked: true });
    const cx = st.cabin.x;
    st.plots.push({ id: 101, name: 'Soak A', x: cx - 8, y: st.cabin.y + 4, w: 6, h: 4, seed: 'same' });
    st.plots.push({ id: 102, name: 'Soak B', x: cx + 4, y: st.cabin.y + 4, w: 6, h: 4, seed: 'same' });
    st.plots.push({ id: 103, name: 'Soak C', x: cx - 3, y: st.cabin.y + 9, w: 8, h: 5, seed: 'same' });
    for (const c of window.__game.state ? (await import('./js/data.js')).DATA.crops : []) st.inv.seeds[c.id] = 20;
    st.plots[0].seed = 'c:carrot'; st.plots[1].seed = 'c:tomato'; st.plots[2].seed = 'c:moonbloom';
    const D = await import('./js/decorations.js');
    const w = st.map.w, cy = st.cabin.y;
    for (const [id, dx, dy] of [['quarry', -10, 0], ['meadow', 10, 0], ['mailbox', -3, 2], ['wishing_well', 3, 2], ['cat_bed', -6, 2], ['cat_tree', 6, 2], ['campfire', 0, -3], ['beehive', -12, 6], ['cat_house', 12, 6]]) {
      const t = (cy + dy) * w + cx + dx; for (const f of D.footprint(t, id)) { st.map.ground[f] = 'g'; st.map.obj[f] = null; } D.markDirty();
      if (!D.placeProblem(id, t)) D.placeDecor(id, t);
    }
    G.timeScale = 1000;
  });

  const metric = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map(x => [x.name, x.value]));
    const s = await page.evaluate(async () => {
      const G = window.__game, st = G.state;
      const farm = await import('./js/farm.js');
      // act like a player: harvest everything ready, sell, buy a pack now and then
      let harvested = 0;
      for (const k of Object.keys(st.crops)) if (st.crops[k].stage >= 3 && farm.harvest(+k)) harvested++;
      farm.sellAll();
      if (st.coins > 2000) farm.buyPack('rare');
      const { serialize, migrate } = await import('./js/state.js');
      let saveOk = true, saveKB = 0;
      try { const raw = serialize(); saveKB = raw.length / 1024; migrate(JSON.parse(raw)); } catch { saveOk = false; }
      return {
        simHours: st.simTime / 3600, jobs: st.jobs.length, crops: Object.keys(st.crops).length, harvested,
        debris: st.map.obj.filter(o => o?.startsWith('d:')).length, coins: st.coins, cats: G.cats.map(c => c.state).join(','),
        dom: document.getElementsByTagName('*').length, saveOk, saveKB,
      };
    });
    return { heapMB: m.JSHeapUsedSize / 1048576, nodes: m.Nodes, listeners: m.JSEventListeners, ...s };
  };

  const rows = [];
  const end = Date.now() + MINUTES * 60e3;
  while (Date.now() < end) {
    await page.waitForTimeout(15000);
    const r = await metric();
    rows.push(r);
    console.log(`sim ${r.simHours.toFixed(1).padStart(6)}h | heap ${r.heapMB.toFixed(1).padStart(5)}MB | DOM ${r.dom} | jobs ${r.jobs} | debris ${r.debris} | crops ${r.crops} | harvested ${r.harvested} | coins ${r.coins} | save ${r.saveKB.toFixed(0)}KB ${r.saveOk ? 'ok' : 'BROKEN'} | cats ${r.cats}`);
  }
  await browser.close();

  const warm = rows[Math.min(2, rows.length - 1)], last = rows[rows.length - 1];
  const growth = last.heapMB - warm.heapMB;
  const problems = [];
  if (errors.length) problems.push(`${errors.length} page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
  if (rows.some(r => !r.saveOk)) problems.push('a save failed to round-trip');
  if (growth > 25) problems.push(`heap grew ${growth.toFixed(1)}MB after warm-up`);
  if (last.dom > warm.dom + 200) problems.push(`DOM grew from ${warm.dom} to ${last.dom} nodes`);
  console.log(`\nSimulated ${last.simHours.toFixed(1)} hours in ${MINUTES} minutes. Heap change after warm-up: ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}MB.`);
  console.log(problems.length ? 'PROBLEMS:\n- ' + problems.join('\n- ') : 'PASS: no errors, stable memory, saves round-trip.');
  process.exit(problems.length ? 1 : 0);
})();
