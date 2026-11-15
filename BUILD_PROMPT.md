# Build prompt: cozy garden idle game (+ sprite workshop)

Build a cozy, always-on, top-down pixel-art gardening idle game that my girlfriend and I will leave running on our TV. Our three cats help out around the garden. Build it in this repo, host it on GitHub Pages, and make it playable with a game controller. Also build a **Sprite & Cat Workshop** page so I can redraw every sprite and set up our cats' personalities.

Work in the milestones listed at the end. Commit after each one and keep the game playable at every commit.

---

## 1. Tech constraints (non-negotiable)

- **Hosting:** static GitHub Pages site served from this repo, with no backend. Prefer vanilla JS (ES modules) + HTML5 Canvas with **no build step**, so the repo root is the site. If you decide a bundler is truly needed, add a GitHub Actions workflow that builds and deploys to Pages. All asset paths must be **relative** because the site lives at `https://<user>.github.io/SRNMV-Garden/`.
- **Rendering:** Fixed low internal resolution (e.g. 480×270) scaled up by an **integer factor** to fill a 1080p/4K TV, with `image-rendering: pixelated` and no smoothing. Tiles are 16×16. Fullscreen on a button press.
- **Controller is plug-and-play** through the browser **Gamepad API** (`standard` mapping). It must work with an Xbox controller and a PS4 DualShock 4 (USB or Bluetooth) in Chrome/Edge on Windows **without DS4Windows**. Show a "Press any button to start" screen, because browsers only expose gamepads (and allow audio) after an input. Handle connect and disconnect events, apply a stick dead-zone, and offer a keyboard fallback (WASD/arrows, E/Space, Q, Tab, Esc). Every action must be reachable with the controller. Never require a mouse in-game.
  - Default mapping: Left stick / D-pad = move & navigate menus · A/✕ = interact/confirm · B/○ = cancel/back · X/□ = cycle tool · Y/△ = open build/designate menu · LB/RB = cycle selected seed · Start/Options = pause menu · Back/Share = toggle HUD (hold for 1s = switch player).
  - Make the mapping rebindable in settings and save it.
- **Always-on/TV friendly:**
  - Use the Screen Wake Lock API, and re-request it whenever the page becomes visible again.
  - Prevent burn-in: the HUD auto-hides after ~20s idle, the camera drifts slowly along a gentle path when idle, and no bright static UI elements stay on screen.
  - Text must be readable from a couch, about 3 m away.
  - Performance must stay stable for days. That means no memory leaks, no unbounded arrays, and pooled particles. Throttle to ~30fps when idle.
- **Persistence:** Autosave to `localStorage` every ~30s and on `visibilitychange`, with a versioned save schema plus migrations. Include an Export/Import save (JSON file) in settings.
- **Offline progress:** On load, simulate elapsed real time, capped (e.g. 24h). Run it in large ticks, and show a cozy "While you were away…" summary of what grew and what the cats did.
- **Data-driven:** crops, debris, cats, jobs, prices, sprites and balance numbers live in JSON/JS data files (`/data`), not in game logic. Put every tuning number in one `balance` file.
- **Debug:** Add a hidden debug menu (e.g. a key or button combo) with a time-scale multiplier (×1/×10/×100/×1000), add-coins, reveal-all, and reset-save options, so the game can be tested quickly.

## 2. World & setting

- The game opens in a **forest clearing** around a small, cute, cozy **cabin**. Trees ring the map edge. The clearing is covered in **debris**: twigs, rocks, bushes, small stumps, big stumps and boulders. Each has a different amount of "work" needed to clear it.
- Clearing debris drops **wood / stone / fiber**, which are used for cabin customization and building.
- **Cabin customization:** roof color, wall color, door style, window boxes/flowers, chimney (smoke at night), path tiles, fences, lanterns, benches and a few garden decorations. Pay with coins and materials through a simple build menu, using controller-driven placement on a grid.
- **Day/night cycle:** synced to the real local clock by default, with an option for an accelerated cycle. It has smooth palette-tinted lighting for dawn, day, dusk and night. At night the cabin windows glow, lanterns light up, there are fireflies, and the cats sleep more.
- **Ambient audio:** generate it procedurally with the Web Audio API so there are no licensing issues. Birds by day, crickets and an owl by night, soft wind, and a gentle crackle near the cabin. Add soft UI chimes and a special "something grew!" chime. Volume sliders go in settings, and a "TV quiet mode" option sets audio low by default.
- Optional weather (light rain that waters crops) is welcome but not required.

## 3. Player & the architect/builder loop

We control **one character**: the architect. There are **two of us, and we pass one controller back and forth**.

- There are two selectable player profiles, **Player 1** and **Player 2**. Their names are editable, and I'll set them.
- Pick who's playing on the start screen ("Who's playing?"). You can also swap at any time from the pause menu or with a quick shortcut, e.g. holding Back/Share for 1 second.
- Switching players **only changes the player sprite** (and the name shown on the HUD). The farm, inventory, coins, plots, cats and progress are all **shared**. No separate stats, saves or abilities.
- Swapping is instant. Show a small poof/sparkle and a "Now playing: <name>" toast. The sprite changes in place, with no teleport and no menu reload.
- The save remembers which player was active last.

The core idea is **we designate, the cats do the work**. Any task we designate goes on a shared **job queue**. The player can do a job directly, and does it fast (e.g. a few seconds of holding A). The cats pick up queued jobs on their own and do them **much slower**. That makes our input meaningful while the garden still progresses when we're away.

1. **Clear the land:** mark debris for removal, or clear it ourselves.
2. **Make a garden plot:** select a rectangle of cleared tiles to create a named **plot** (with a min/max size). Then queue **tilling** for its tiles. Tilling takes time per tile.
3. **Plant:** each plot has a **selected seed type**. Planting consumes a seed from the inventory. Cats can plant.
4. **Water:** watering speeds up growth by a set multiplier for a period. The cats mostly do it, and we can too.
5. **Harvest:** **only the player can harvest**. After a harvest, the tile automatically queues a **replant** job using the plot's selected seed (if we have that seed). Cats do the replanting.

**Cat rules:**
- Cats CAN clear debris, till, plant/replant and water.
- Cats CANNOT harvest, buy things, or designate.
- Later (fishing phase) they can catch fish, but cannot prepare rods or bait the water.

## 4. Cats (3 of them, fully configurable)

- Load cats from `/data/cats.json`, which the Workshop edits. Each cat has: name, sprite set, coat colors, and a personality blurb.
  - **Per-job-type stats:** work speed multiplier, and a **preference/affinity weight**, i.e. the likelihood of choosing that job type.
  - **Traits:** energy/stamina, nap frequency and duration, wander/curiosity, zoomies chance, how much they like being near the player, and night-owl vs. early-bird.
  - **Weaknesses:** e.g. gets distracted mid-task, hates water (slow at watering), or refuses certain jobs.
  - The job types must be an extensible list: `clear`, `till`, `plant`, `water` now, then `fish`, `tend_tree` and others later.
- **Cat AI:** a small state machine: idle → choose job (weighted by affinity, distance and how long the job has waited) → walk (tile pathfinding, A*) → work (progress bar) → maybe nap/groom/zoomies/visit player → repeat.
  - A cat reserves a job so two cats don't take the same one.
  - Cats should feel alive even with nothing queued: stretching, sitting in windows, chasing butterflies, sleeping by the fire at night.
- **Petting:** pressing A next to a cat pets it, with a heart and purr, and gives it a small temporary work buff.
- Ship 3 placeholder cats with distinct default personalities. I'll replace names, looks and stats in the Workshop.

## 5. Crops, seeds & discovery

- **Rarities:** Common, Uncommon, Rare, Legendary, Mystical. Create **~4–5 crops per rarity at launch** (around 20–25 total). Commons are familiar vegetables like carrot, radish and lettuce. Mysticals are whimsical, e.g. a moonbloom or starfruit vine.
- Each crop has a growth time, sell price, water multiplier, and seed yield.
  - Growth time scales with rarity, with real-time targets like ~20–45 min for common up to several hours for mystical. Keep these in `balance`.
- **Growth stages:** each crop has **3 growth stages + 1 harvest-ready stage** (4 sprites), plus a seed-packet icon and a harvested-item icon. Early stages should be *ambiguous but hinting*, so we can guess what's growing.
- **Starting state:** we begin with a couple of **Mystery Seed Packs** that roll common/uncommon crops.
- **Seed packs:** bought at a shop (a mailbox or wandering-merchant board near the cabin) for **expensive** coin prices, one tier per rarity.
  - Pack contents are **hidden**. Inventory shows them as e.g. "Unknown Rare Seed ×3" until the crop is grown and identified.
  - Packs roll weighted within their tier, with a small chance of a bonus seed.
- **Harvesting** yields the crop item plus seeds of the same type: **usually 1, occasionally 2** (e.g. 15% chance, set in `balance`). This keeps expansion slow and meaningful.
- **Selling:** put harvested crops in a **shipping crate** by the cabin to earn coins.
- **Discovery moments (very important):**
  - When any plant advances a stage, play a soft chime, show a small "🌱 The garden grew!" banner, and do a brief sparkle on that tile. The HUD briefly wakes up so it's noticeable from the couch.
  - Unknown crops show "???" when inspected, with a fun hint line per stage.
  - The **first harvest of a new crop type** gets a big discovery card ("New crop discovered: Carrot! — Common"), confetti, and an entry in the **Almanac**. The Almanac is a collection book showing discovered and silhouetted undiscovered crops per rarity.
- Design the crop/plant system so **fruit trees** (multi-harvest, long-lived) can be added later as another plant category without rewrites.

## 6. HUD & menus

- Minimal HUD: coins, materials, time of day, the selected tool/seed, and small cat portraits showing each cat's current activity (e.g. "Mochi: tilling", "napping 💤").
- Menus, all fully controller-navigable with large focus highlights: Inventory, Plots (rename, set seed per plot), Shop, Build/Customize, Almanac, Cats (view stats and moods), Settings.

## 7. Art direction

- Cute, cozy, soft palette: warm greens, browns and creams, with gentle outlines. Pick one **limited master palette** (~32 colors) so everything is cohesive.
- **All sprites must be defined in a single editable data format** that both the game and the Workshop use. Use palette-indexed pixel grids stored in `/data/sprites.json`, with named sprites and frames for animation. Draw cute placeholder pixel art for everything yourself:
  - tiles (grass variants, tilled/watered soil, paths, forest edge)
  - debris
  - cabin and its customization variants
  - **two** player characters, one for each of us (4 directions × walk frames + tool actions). Make them visually distinct and keep the same frame list for both, so they're interchangeable.
  - 3 cats (idle, walk 4-dir, work, sleep, zoomies)
  - every crop stage, seed packets, items, UI icons and particles
- **Sprite overrides:** at runtime, the game loads `sprites.json`, then applies any **overrides saved in `localStorage` by the Workshop**. The Workshop is hosted on the same GitHub Pages origin, so edits show up in the game immediately.

## 8. Sprite & Cat Workshop (`/workshop.html`, same site)

A separate page in the same repo. It's used with a mouse/keyboard, so controller support is not needed here.

- **Sprite browser:** search and filter by category (tiles, cats, player, crops, debris, cabin, UI). Thumbnail grid.
- **Pixel editor:** zoomable grid with pencil, eraser, fill, eyedropper, line, rect, mirror-X, undo/redo, onion-skin for animation frames, add/duplicate/reorder frames, and a live animation preview at game speed and scale.
- **Palette editor:** edit the master palette, with live recolor across all sprites. Support per-sprite palette swaps (useful for cat coats and cabin colors).
- **In-context preview:** shows the sprite on a grass tile next to other sprites at TV scale, to check cohesion. Crop pages show all 4 stages side by side.
- **Player editor:** for each of the two player profiles, set the name and edit the sprite set (with palette swaps for hair, skin and outfit). Show the two players side by side, both animated.
- **Cat editor:** name, coat (sprite/palette swap), personality blurb, and per-job sliders for speed and affinity. Also trait sliders (energy, nap frequency, curiosity, zoomies, loves-player) and weakness toggles. A small "simulate a day" preview shows how the cat would split its time across jobs.
- **Save/export:**
  - Save to `localStorage`, which the game picks up live.
  - **Export** `sprites.json` / `cats.json` files so I can commit them to the repo as the new defaults.
  - Import those files back in.
  - Reset an individual sprite to its default.
- Link to the Workshop from the game's settings menu, and from the Workshop back to the game.

## 9. Future phases (design for them now; don't build yet)

- **Phase 2 – Orchard:** fruit trees with multi-year growth stages and repeat harvests. Cats can tend trees but not harvest them.
- **Phase 3 – Fishing pond:** the player builds a pond, prepares rods and baits the water. Cats can catch fish from prepared spots. Fish have rarities and an Almanac section.
- Keep the job system, plant system, Almanac and save schema generic enough that these slot in cleanly.

## 10. Milestones (commit after each)

1. **Foundation:** project skeleton, render loop, integer scaling, input (gamepad + keyboard) with a controller test overlay, tilemap, camera, player movement/collision, two-player profile select & swap, save/load, the Pages deploy, and README instructions (how to enable Pages and connect a controller).
2. **Clearing & jobs:** debris, designation, the job queue, player work, and materials.
3. **Cats:** data-driven cats, AI state machine, pathfinding, job selection by affinity, idle behaviors, and petting.
4. **Farming:** plots, tilling, planting, watering, growth stages, harvest, seed returns, auto-replant, the shipping crate, coins, the shop with hidden seed packs, discovery moments, and the Almanac.
5. **Atmosphere:** day/night lighting, procedural ambient audio, cabin customization, HUD auto-hide, burn-in drift, wake lock, and the "while you were away" summary.
6. **Workshop:** full sprite/palette/cat editor with live localStorage overrides and export/import.
7. **Polish pass:**
   - Balance tuning for an always-on pace. Something should grow or happen roughly every 5–15 minutes early on.
   - A 24h+ soak test run at high time-scale, checking memory and save integrity.
   - Controller-only playthrough of every menu.
   - A final README covering controls, how to edit sprites and cats, and how to deploy.

When you finish, give me the live GitHub Pages URL format, the steps to enable Pages for this repo, and a short "how to play" for the couch.
