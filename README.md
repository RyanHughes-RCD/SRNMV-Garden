# SRNMV Garden

A cozy, always-on, top-down pixel-art gardening idle game, made to live on the TV. You plan the garden, and your three cats slowly do the work: clearing land, tilling, planting and watering. Crops grow in real time, and only you can harvest. Mystery seeds reveal what they are when you grow them.

- **Play:** `index.html`
- **Sprite & Cat Workshop:** `workshop.html` (redraw any sprite, recolour the palette, set up your cats' personalities and the two player characters)

---

## Putting it on GitHub Pages

The game is plain HTML/CSS/JavaScript with no build step, so the repository root *is* the website.

1. Merge this work into your default branch (e.g. `main`).
2. On GitHub, open the repo, then **Settings → Pages**.
3. Under **Build and deployment**, choose **Source: Deploy from a branch**, then **Branch: `main`** and **Folder: `/ (root)`**. Save.
4. After a minute the game is live at `https://<your-github-username>.github.io/SRNMV-Garden/`, and the Workshop at `.../SRNMV-Garden/workshop.html`.

`.nojekyll` is included so GitHub serves every file exactly as-is.

### Running it locally

The game loads its data with `fetch`, so opening `index.html` straight from disk won't work. Serve the folder instead:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

---

## Controllers (plug-and-play, no DS4Windows needed)

The game uses the browser's built-in Gamepad API. In **Chrome or Edge on Windows**, an **Xbox controller** or a **PS4 DualShock 4** (USB or Bluetooth) works directly.

1. Plug the controller in (or pair it over Bluetooth).
2. Open the game and **press any button on the controller**. Browsers don't reveal a controller until it's pressed once. The title screen confirms when it sees it.
3. For a full-screen TV experience press **F11** (or use *Settings → Fullscreen*).

If a button seems wrong, use *Settings → Controller test* to see what the browser receives, and *Settings → Rebind controls* to change it.

| Action | Controller | Keyboard |
|---|---|---|
| Move | Left stick / D-pad | WASD / arrows |
| Interact, harvest, pet. **Hold** to work (clear, till, plant, water) | A / ✕ | E, Space, Enter |
| Back / cancel | B / ○ | Q, Backspace |
| Cycle tool | X / □ | F |
| Plan mode (clear land, make plots) | Y / △ | Tab |
| Choose seed (and switch tabs in Plan/Build mode) | LB / RB (L1 / R1) | Z / C |
| Menu | Start / Options | Esc |
| Tap: hide HUD · **Hold 1s: switch player** | Back / Share | H (P switches player) |
| Debug menu | LB + RB + Start | \` or F9 |

---

## How to play (couch version)

1. **Clear the land.** Hold **A** on twigs, rocks, stumps and bushes, or press **Y** for Plan mode, pick *Clear* and mark a whole area for the cats.
2. **Make a plot.** In Plan mode switch to *New plot* (LB/RB), press **A** on one corner and **A** on the other. The cats clear and till it.
3. **Plant.** Each plot grows the seed chosen for it. New plots start with whatever seed you're holding (your mystery seeds at first). Cats plant, and you can too (hold **A** on tilled soil).
4. **Wait for the moment.** When something grows, the game chimes: *"The garden grew!"*. Unknown plants show as **???** with a hint at each stage. Guess what they are!
5. **Harvest.** Only you can do this. Harvesting reveals the crop, adds it to the Almanac, and gives back its seeds (usually 1, sometimes 2). The cats replant the plot automatically.
6. **Sell and buy.** Drop crops in the **shipping crate** for coins. The **seed board** sells mystery packs by rarity: Common, Uncommon, Rare, Legendary and Mystical.
7. **Make it yours.** Build paths, fences, lanterns, benches and more (*Menu → Build & decorate*), and recolour the cabin (walk up to it and press **A**).
8. **Pet the cats** (A next to them). They purr and work faster for a while.

You can swap who's playing any time (hold Back/Share). Only the character changes; the garden is shared.

The game autosaves every 30 seconds. While you're away (tab closed, TV off), it catches up on up to 24 hours of growth and cat work, then tells you what happened.

---

## Editing sprites and cats (the Workshop)

Open `workshop.html` on the same site (*Settings → Sprite & Cat Workshop* in game, or the URL directly). Use a mouse there.

- **Sprites:** every sprite in the game is editable. Use pencil, fill, line, rectangle, mirror, onion-skin and animation frames, with a live preview at TV scale.
- **Palette:** the whole game shares one 32-colour palette. Edit a colour and everything updates.
- **Cats:** set name, coat colours, a personality blurb, per-job **speed** and **preference**, traits (stamina, naps, curiosity, zoomies, how much they love you, early bird or night owl) and weaknesses (distractible, hates water, refuses a job). *Simulate a day* shows how a cat would spend 24 hours.
- **Players:** set both names and outfit colours, and edit their sprites.

Changes save to the browser and **show up in the running game immediately** (same site, so the TV picks them up live). To make them permanent defaults for everyone, use **Export** in the Workshop and commit the downloaded `sprites.json`, `cats.json` or `players.json` into `data/`.

> Workshop changes are stored per browser. If you edit on a laptop but play on the TV's browser, export from the laptop and commit the files (or import them on the TV).

---

## Tuning

Every balance number (growth bonus from water, cat work speed, seed return chance, prices, map size, autosave interval, offline cap and so on) lives in `data/balance.json`. Crops (names, rarity, growth time, price, hint text) are in `data/crops.json`. Debris and decorations are in `data/debris.json` and `data/decor.json`.

The placeholder art comes from `tools/gen-sprites.mjs` (`node tools/gen-sprites.mjs`). **Don't re-run it after you've started editing in the Workshop.** It overwrites `data/sprites.json`.

## Project layout

```
index.html, workshop.html    the game and the editor
css/                         styles
js/                          game modules (main.js is the entry point)
data/                        all game data (JSON)
tools/                       sprite generator and test scripts
```
