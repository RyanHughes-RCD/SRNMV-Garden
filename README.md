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
   - **Growing takes a while:** a crop takes about **8 hours (commons) to 12 hours (mysticals)** to fully grow while it's kept watered, which the cats mostly handle. Left dry, it grows noticeably slower. These times are `growMinutes` in `data/crops.json`.
4. **Wait for the moment.** When something grows, the game chimes: *"The garden grew!"*. Unknown plants show as **???** with a hint at each stage. Guess what they are!
   - **The cats are slow and steady:** the game is about planning and then waiting. A job that takes you a second takes a cat about **5 minutes** (each cat is faster or slower at different jobs). Tilling a tile takes a cat 10-15 minutes, and a big stump about an hour. Tune it with `cats.baseWorkRate` in `data/balance.json`. One watering lasts 3 hours (`farm.waterDurationSec`), so the cats water each crop about 3-4 times while it grows.
5. **Harvest.** Only you can do this. Harvesting reveals the crop, adds it to the Almanac, and gives back its seeds (usually 1, sometimes 2). The cats replant the plot automatically.
6. **Sell and buy.** Drop crops in the **shipping crate** for coins. The **seed board** sells mystery packs by rarity: Common, Uncommon, Rare, Legendary and Mystical.
7. **Make it yours.** Build paths, fences, lanterns, benches and more (*Menu → Build & decorate*), and recolour the cabin (walk up to it and press **A**).
8. **Pet the cats** (A next to them). They purr and work faster for a while.

You can swap who's playing any time (hold Back/Share). Only the character changes; the garden is shared.

The game autosaves every 30 seconds. While you're away (tab closed, TV off), it catches up on up to 24 hours of growth and cat work, then tells you what happened.

---

## The orchard (fruit trees)

Buy saplings at the **seed shop** (bottom section), then open your inventory and pick one to plant it. Plant on grass with two free tiles between trees. Each tree grows through **5 stages** (sapling to full-grown) and then fruits through **4 stages** (blossom, tiny fruit, swelling, ripe). Only you can pick the fruit (press A on the tree). It then blossoms again for the next crop. The cats water trees just like crops, and dry trees grow about 1.6x slower. In planting mode, X digs a tree up and gives you its sapling back.

| Tree | Sapling | Full-grown | Then every | Fruit | Sells for |
|---|---|---|---|---|---|
| Apple | 300 | ~30h | ~10h | 3-5 apples | 22 |
| Pear | 350 | ~34h | ~11h | 3-5 pears | 26 |
| Cherry | 450 | ~38h | ~12h | 4-7 cherries | 30 |
| Peach | 500 | ~40h | ~13h | 3-5 peaches | 34 |
| Plum | 550 | ~42h | ~14h | 4-6 plums | 36 |
| Orange | 650 | ~46h | ~15h | 3-6 oranges | 40 |
| Lemon | 700 | ~50h | ~16h | 3-6 lemons | 42 |
| Fig | 800 | ~56h | ~18h | 3-5 figs | 48 |

Times are while watered. Everything is tunable in `data/trees.json`.

**How the tree art works:** each tree has a puffy, cloud-like canopy (round, tall, wide or soft, in its own leaf colours) on one of **5 trunk styles** shared by all trees: straight, leaning, forked, knotty and gnarled. Each planted tree keeps its style. In the Workshop: `ftree_<tree>` (sapling and canopy stages), `ftrunk_<shape>_0..4` (trunks) and `ffruit_<tree>` (blossom and fruit overlays).

## Cat sprite sheets

A cat can use its own imported sprite sheet (an 8x8 grid of 32x32 frames). All three cats have one: `art/vyke-sheet.png`, `art/noctis-sheet.png` and `art/mika-sheet.png`. If a sheet was resized or cropped, `--grid` and `--layout trimmed` can still read it (see the top of `tools/import_cat.py`).

```
python3 tools/import_cat.py art/vyke-sheet.png vyke
node tools/gen-sprites.mjs
```

Then set the cat's `"spriteSet": "vyke"` in `data/cats.json`. Big, detailed art can be drawn smaller with `"spriteScale"` (all three use 0.75). The game draws at the screen's full resolution, so the art keeps its detail. Which frames make which animation is listed at the top of `tools/import_cat.py`. Besides walking, sitting, sleeping and working (Vyke sweeps), a sheet can have extra poses the cat shows when it's doing something matching: eating a snack, stretching, sitting with its back to you while fishing, curled up in a cat bed, and belly-up when sunbathing.

## The Great Stump and the spirit animals

Somewhere in the forest, a few tiles deep, hides the **Great Stump** (2×2 tiles, in its own little glade). Chop your way to it, then face it and press **A** to leave a **fruit offering** (fruit comes from fruit trees).

- **Every evening between 7 and 9pm** there's a chance a spirit animal answers: about 43% for an apple, up to about 63% for a fig. Finer fruit gives better odds. If no spirit comes, the offering stays for the next evening, and you can take it back.
- **The Fox Spirit or the Moose Spirit** (rarer) wanders the open ground around the stump for **2 to 6 hours**, glowing in the dark. While it's there, **the cats work 25% faster**, and it shows in the cats' panel.
- **When it leaves** it usually leaves a **gift** on the stump: coins, wood and stone, a rare (or even legendary) mystery seed, or a fruit tree sapling. The moose is more generous.

Tuning is in `data/spirits.json`. The art: `art/great-stump.png`, `art/fox-spirit-sheet.png` and `art/moose-spirit-sheet.png`.

## Inside the cabin

Stand in front of the cabin door, face it and press **A** to go in. Walk out through the doormat at the bottom to leave. The garden and the cats keep going while you're inside. (Customizing the outside of the cabin is in *Menu → Cabin*.)

- **Decorate:** press **Y** (or *Menu → Decorate the cabin*). This works like building outside: **A** places, **X** picks up for a full refund, **LB/RB** change item, **B** finishes. There are about 70 pieces: five beds, three fireplaces, sofas and armchairs, tables, a piano, an old TV, a grandfather clock, chests, plants, eight rugs, kitchen appliances, and things for the back wall: windows (they show the real sky), paintings, a clock, a mirror, a hanging plant, bunting and a wreath. Napping cats curl up on the beds and in the cat basket. The furniture art is `art/interior-sheet.png`: run `python3 tools/import_interior.py` and then `node tools/gen-sprites.mjs` after changing it. Some furniture has to stand against the back wall, and nothing can block a doorway or the way out.
- **Floors & walls:** each room has its own floor (planks, checker tiles, flagstones, carpet) and wallpaper. 150 coins per change.
- **Cabin rooms (big, expensive projects):**

| Upgrade | Cost | What it does |
|---|---|---|
| Bigger living room | 2,500 coins, 120 wood, 40 stone | Living room grows from 9×6 to 12×7 |
| Kitchen | 4,000 coins, 150 wood, 60 stone | Unlocks the stoves and ovens, counters, sink, fridge and toaster. **Cook a feast** on any stove or oven from 4 of one crop: the cats work 25% faster for 6 hours |
| Bedroom | 5,000 coins, 180 wood, 60 fiber | Unlocks the beds, nightstands, dresser, vanity and wardrobe. With a bed, the cats sneak in to nap (you'll see one curled up on it) and get their energy back 50% faster |
| Grand living room | 8,000 coins, 200 wood, 100 stone | Living room grows again, to 15×8 (needs the bigger living room) |

At night, lamps, the fireplace and the stove light up the rooms. All the numbers and furniture are in `data/interior.json`. The art is in the Workshop under the *interior* category.

## Fishing

Fishing unlocks when you build a **dock** (*Build & decorate → Paths & floors*). The dock is a big goal: 1,000 coins, 250 wood and 60 stone, usually about two or three weeks in. Most of that wood comes from the cats chopping their way through the forest to the beach.

1. **Bait the water.** Stand on the dock facing open water and press **A**, then throw in harvested crops or fruit. **A** throws in one, **X** throws in all of that kind. The water holds up to 30 portions. **The more valuable the bait, the better the odds of rare fish.** The bait menu shows the odds live. Press **X** on the dock any time to add more.
2. **Cast** with **A**. The bobber tugs a few times. **Wait.** When it tugs hardest, a big **!** pops up over your head: press **A** to pull the fish in. Too early and it swims off, too late and it gets away (rarer fish give you less time). **B** reels in.
3. Each fish caught uses one portion of bait.

There are 16 fish, from minnows and perch up to the mystical Moonfish, Starfin and Ghost Koi. The first catch of each gets a discovery card, the **Almanac** has a Fish page (pictures, rarity, price and how many you've caught), and fish sell at the shipping crate.

**The cats fish too.** When a dock has bait in it, they sometimes wander down, sit on the end with a line in the water, and now and then land a fish, using the same bait. Each cat has a *Fishing* speed and preference in the Workshop's Cats tab.

Fish, prices, bite timing and bait odds are in `data/fish.json`.

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
| Paths & floors (extra) | **Bridge** (300 coins, 100 wood, 10 stone): build it across the river, with land at both ends and the 2 water tiles in between, to walk (and let the cats walk) to the other side. There's always a strip of open grass on both banks. |
| Big projects | Greenhouse (crops within 6 tiles grow 25% faster), garden shed (cats work 10% faster) |

**Pacing:** the game runs all the time, so goals are spread over weeks. Paths, fences and flower beds cost only materials and come in the first few days. Small decor costs 30-120 coins (first week). Cat houses, the beehive, the gnome and the wishing well cost 360-900 coins (weeks 1-2). The dock comes around weeks 2-3, and the shed (3,000 coins) and greenhouse (5,000 coins) after a month or two. Twigs rarely grow back, so wood mostly comes from chopping trees. All prices are in `data/decor.json`.

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

The script picks the walk, work, sit, sleep and wave frames (edit `MAP` in the script to change which grid cells are used), keeps the art's own colours, and saves the result as `hero_*` / `hero2_*` sprites in `data/custom-sprites.json` and `data/sprites.json`. Imported sprites keep their own colours. In the Workshop's Players tab, an imported character shows **all** of its colours. Change any of them and it updates every sprite in that character's set; point at a colour to see where it's used, and *Reset colours* puts them back. Re-running `tools/gen-sprites.mjs` keeps imported sprites. To use a different sheet, import it under a new name and pick that sprite set in the Workshop's Players tab.

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

## Releasing updates

Before merging an update, run `node tools/stamp-version.mjs` and commit the result. It stamps `index.html` and `workshop.html` with a new version so TVs and laptops load the new code immediately instead of a cached copy. The current version shows in *Settings* (game) and the Workshop's top bar.

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
