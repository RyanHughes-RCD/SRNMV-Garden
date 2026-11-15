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
   - **The land:** your clearing sits in the woods. Below it is a band of forest, then a sandy beach on the lake, which runs to the bottom of the map. A river runs down past the clearing's left side into the lake. Chop through the trees to reach the beach. Water can't be walked on, built on or planted.
   - **Grow the clearing.** You start in a small clearing deep in the woods. Hold **A** on a tree at the edge to chop it, or use Plan mode's *Chop trees* tab to mark a whole stretch. Each tree gives wood and leaves a stump to clear. Cats can only reach trees on the clearing's edge, so they work outward row by row. The outermost woods always stay.
2. **Make a plot.** In Plan mode switch to *New plot* (LB/RB), press **A** on one corner and **A** on the other. The cats clear and till it.
3. **Plant.** Each plot grows the seed chosen for it. New plots start with whatever seed you're holding (your mystery seeds at first). Cats plant, and you can too (hold **A** on tilled soil).
   - **Growing takes a while:** a crop takes about **6 hours (commons) to 10 hours (mysticals)** to fully grow while it's kept watered, which the cats mostly handle. Left dry, it grows noticeably slower. These times are `growMinutes` in `data/crops.json`.
4. **Wait for the moment.** When something grows, the game chimes: *"The garden grew!"*. Unknown plants show as **???** with a hint at each stage. Guess what they are!
5. **Harvest.** Only you can do this. Harvesting reveals the crop, adds it to the Almanac, and gives back its seeds (usually 1, sometimes 2). The cats replant the plot automatically.
6. **Sell and buy.** Drop crops in the **shipping crate** for coins. The **seed board** sells mystery packs by rarity: Common, Uncommon, Rare, Legendary and Mystical.
7. **Make it yours.** Build paths, fences, lanterns, benches and more (*Menu → Build & decorate*), and recolour the cabin (walk up to it and press **A**).
8. **Pet the cats** (A next to them). They purr and work faster for a while.

You can swap who's playing any time (hold Back/Share). Only the character changes; the garden is shared.

The game autosaves every 30 seconds. While you're away (tab closed, TV off), it catches up on up to 24 hours of growth and cat work, then tells you what happened.

---

## Decorating

*Menu → Build & decorate* lists everything by section. Pick an item and a ghost of it follows a cursor: **A** places (you can keep placing), **X** picks something up for a full refund, **LB/RB** switch items, **B** finishes. Bigger items (pond, hammock, cat houses, shed, greenhouse) show their full footprint.

| Section | Items |
|---|---|
| Paths & floors | Stone/wood paths, stepping stones, flower beds (pink, yellow, blue, white), picnic blanket |
| Fences & hedges | Fences and hedges that join up with their neighbours, a walk-through gate, a garden arch |
| Garden | Flower pot, rock garden, birdbath, bird feeder (birds visit and sing more), scarecrow, gnome, beehive (+15% growth nearby), 2×2 pond, wishing well (a gift once a day) |
| For the cats | Cat bed, scratching post, cat tree (they perch on top), food & water bowls (a snack restores energy), sunny cushion (afternoon sunbathing), yarn ball (playtime), **cat houses** |
| Lights | Lantern, string lights, campfire (crackles; cats gather there at night) |
| Cozy | Bench, hammock, signpost (write a name on it), mailbox (letters, sometimes with a gift), wheelbarrow, watering can stand, crate of produce |
| Resources | **Quarry Rock** grows a new rock beside it every ~25 min, and **Wild Meadow** regrows weeds and bushes every ~20 min. The cats clear them automatically, so stone and fiber never run out |
| On the water | **Dock** (3 wide, 5 long): build it with its top row on the beach and the rest over the lake, then walk out to the end. Found under *Paths & floors* |
| Big projects | Greenhouse (crops within 6 tiles grow 25% faster), garden shed (cats work 10% faster) |

**Seashells:** five kinds (scallop, cowrie, conch, moon snail and the rare sand dollar) wash up on the sand next to the water, about one every 20 minutes and up to 4 at a time. Press A to pick one up. The first of each kind gets a "New shell found!" moment, the inventory tracks your collection, and you can sell spares at the shipping crate. Tuning is in `data/shells.json`.

The clearing also slowly grows back a little wild debris (weeds, twigs, the odd bush or rock) on its own.

**Cat houses (2×2):** build one, then choose which cat it belongs to and decorate it: roof colour, wall wood, door shape (round, square, heart, kitty ears) and a flower box, bow or fish sign. Decorating is free. Each cat naps at their own house; without one they use a cat bed, or nap wherever they are.

**The cabin** (walk up and press A) now also has a chimney style, curtains, a welcome mat, a porch swing and a porch deck, plus more roof colours and two new doors.

All costs and effects are in `data/decor.json`. Regrowth, mail and wishing-well timings are in `data/balance.json` (`regrow`, `mailbox`, `wishingWell`).

## Editing sprites and cats (the Workshop)

Open `workshop.html` on the same site (*Settings → Sprite & Cat Workshop* in game, or the URL directly). Use a mouse there.

- **Sprites:** every sprite in the game is editable. Each debris type has five looks (`debris_rock`, `debris_rock_1` ... `debris_rock_4`), and the game picks one per tile for variety. Use pencil, fill, line, rectangle, mirror, onion-skin and animation frames, with a live preview at TV scale.
- **Select tool (S):** drag a box to select a region. While it's selected:
  - **Flip H / Flip V** flip just that region. Tick *All frames* to do it on every frame, e.g. to mirror only the legs on a walk cycle.
  - Drag inside it to move those pixels, or nudge with Shift+arrows.
  - Ctrl+C / Ctrl+V copy and paste, also across frames and sprites. Delete clears it, and Esc deselects.
  - Drawing, fill and *Mirror* only affect pixels inside the selection, and Mirror reflects across the selection's middle.
- **Canvas size…:** set a new width and height (up to 128) and choose which edge stays pinned. *Bottom* keeps a character's feet in place, and the game keeps them standing on the ground.
- **Palette:** the shared palette starts with 32 colours. Edit a colour and everything updates. **+ Add colour** adds a new one (up to 62). Imported sprites have their own colours, and for those the new colour only belongs to that sprite.
- **Cats:** set name, coat colours, a personality blurb, per-job **speed** and **preference**, traits (stamina, naps, curiosity, zoomies, how much they love you, early bird or night owl) and weaknesses (distractible, hates water, refuses a job). *Simulate a day* shows how a cat would spend 24 hours.
- **Players:** set both names and outfit colours, and edit their sprites.

Changes save to the browser and **show up in the running game immediately** (same site, so the TV picks them up live). To make them permanent defaults for everyone, use **Export** in the Workshop and commit the downloaded `sprites.json`, `cats.json` or `players.json` into `data/`.

> Workshop changes are stored per browser. If you edit on a laptop but play on the TV's browser, export from the laptop and commit the files (or import them on the TV).

---

### Importing your own character sheet

Player 1 and Player 2 use custom characters from `art/player1-sheet.png` and `art/player2-sheet.png` (8×8 grids of 32×32 frames). They were brought in with:

```bash
python3 tools/import_sheet.py art/player1-sheet.png hero
python3 tools/import_sheet.py art/player2-sheet.png hero2
```

The script picks the walk, work, sit, sleep and wave frames (edit `MAP` in the script to change which grid cells are used), keeps the art's own colours, and saves the result as `hero_*` / `hero2_*` sprites in `data/custom-sprites.json` and `data/sprites.json`. Imported sprites keep their own colours, so the outfit colour pickers in the Workshop's Players tab don't change them. Edit the pixels or colours in the Sprites tab instead. Re-running `tools/gen-sprites.mjs` keeps imported sprites. To use a different sheet, import it under a new name and pick that sprite set in the Workshop's Players tab.

## Tuning

Every balance number (growth bonus from water, cat work speed, seed return chance, prices, map size, autosave interval, offline cap and so on) lives in `data/balance.json`. Crops (names, rarity, growth time, price, hint text) are in `data/crops.json`. Debris and decorations are in `data/debris.json` and `data/decor.json`.

The placeholder art comes from `tools/gen-sprites.mjs` (`node tools/gen-sprites.mjs`). **Don't re-run it after you've started editing in the Workshop.** It overwrites `data/sprites.json`.

## Testing and debugging

- **Debug menu:** press **LB + RB + Start** on the controller (or \` / F9). It has time speed ×1/×10/×100/×1000, add coins and materials, give seeds, grow everything, reveal all crops, and reset the save.
- **Soak test:** runs the game at ×1000 for a few real minutes (days of game time) and checks memory, DOM size and save integrity:

  ```bash
  npm i -D playwright && npx playwright install chromium
  python3 -m http.server 8000 &
  node tools/soak.cjs http://localhost:8000/ 4
  ```

## Credits

The font is **Pixeloid Sans** by GGBotNet (https://ggbot.net/fonts/), used under the SIL Open Font License 1.1. The licence is in `fonts/Pixeloid-OFL.txt`.

## Project layout

```
index.html, workshop.html    the game and the editor
fonts/                       Pixeloid Sans (OFL)
art/                         source character sheets
css/                         styles
js/                          game modules (main.js is the entry point)
data/                        all game data (JSON)
tools/                       sprite generator and test scripts
```
