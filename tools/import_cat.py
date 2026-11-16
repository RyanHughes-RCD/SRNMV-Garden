"""Import a 32x32-frame cat sheet (8x8 grid) as a cat sprite set.

    python3 tools/import_cat.py art/vyke-sheet.png vyke
    python3 tools/import_cat.py art/mika-sheet.png mika --grid -7.4,-5.5,25.71,25.33 --layout trimmed

--grid x,y,pitchX,pitchY reads a sheet that was resized or cropped: the top-left of cell (0,0)
and the spacing between cells, in the image's pixels. --layout trimmed leaves out frames that
were cut off at the edges of such a sheet (see LAYOUTS).

Then run `node tools/gen-sprites.mjs`, and give the cat `"spriteSet": "vyke"` in data/cats.json
(optionally "spriteScale" to draw big art smaller, e.g. 0.75). Frames keep the sheet's own
colours, so Workshop coat colours don't recolour them. Which cells make which animation is in
ANIMS below; the cell grid is (row, column). Needs Pillow (pip install pillow).
"""
import json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CELL = 32
CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
# animation -> (cells, fps). The game uses walk_down/up/side, sit, sleep and work; the rest are
# extra poses picked by what the cat is doing (see POSES in js/cats.js).
ANIMS = {
    'walk_down':   ([(0, c) for c in range(8)], 8),
    'walk_up':     ([(1, c) for c in range(8)], 8),
    'walk_side':   ([(2, c) for c in range(8)], 10),   # facing right; the game mirrors it for left
    'sit':         ([(4, 0), (4, 1)], 2),
    'sit_back':    ([(4, 2), (4, 3)], 2),
    'sit_side':    ([(4, 4), (4, 5)], 2),
    'sit_side2':   ([(4, 6), (4, 7)], 2),
    'sleep':       ([(5, 0), (5, 1)], 1),
    'sleep_other': ([(5, 2), (5, 3)], 1),
    'sleep_belly': ([(5, 4), (5, 5)], 1),
    'sleep_bed':   ([(5, 6), (5, 7)], 1),
    'laptop':      ([(6, 0), (6, 1)], 3),
    'type':        ([(6, 2), (6, 3)], 4),
    'type_side':   ([(6, 4), (6, 5)], 4),
    'work':        ([(6, 6), (6, 7)], 4),               # sweeping: used for garden jobs
    'read':        ([(7, 0), (7, 1)], 1),
    'write':       ([(7, 2), (7, 3)], 2),
    'eat':         ([(7, 4), (7, 5)], 3),
    'stretch':     ([(7, 6), (7, 7)], 2),
}

# Mika's sheet lost its left column edge, the right edge and most of the bottom row.
TRIMMED = dict(ANIMS)
TRIMMED.update({
    'walk_side': ([(2, c) for c in range(1, 7)], 8),
    'sleep':     ([(5, 2), (5, 3)], 1),
    'sleep_bed': ([(5, 6)], 1),
    'laptop':    ([(6, 1)], 1),
    'write':     ([(6, 2), (6, 3)], 2),
    'type_side': ([(6, 4), (6, 5)], 4),
    'work':      ([(6, 6)], 1),                         # the second sweep frame is cut off
})
for k in ('sleep_other', 'type', 'read', 'eat', 'stretch'): TRIMMED.pop(k)
# Spirit animals (data/spirits.json): side views face right; the game mirrors them for left.
FOX = {
    'walk_side':  ([(0, c) for c in range(8)], 8),
    'idle_side':  ([(1, c) for c in range(8)], 6),
    'walk_down':  ([(4, c) for c in range(8)], 8),
    'idle_front': ([(5, c) for c in range(8)], 6),
    'walk_up':    ([(6, c) for c in range(8)], 8),
    'idle_back':  ([(7, c) for c in range(8)], 6),
}
MOOSE = {
    'walk_side':  ([(0, c) for c in range(8)], 7),
    'idle_side':  ([(4, c) for c in range(8)], 5),
    'idle_front': ([(6, c) for c in range(8)], 5),
    'vanish':     ([(7, 7)], 1),
}
LAYOUTS = {'full': ANIMS, 'trimmed': TRIMMED, 'fox': FOX, 'moose': MOOSE}
CATEGORY = {'fox': 'spirits', 'moose': 'spirits'}

def despeck(im, keep=8):
    """Drop little islands of pixels (bits of a neighbouring frame that leaked into the cell)."""
    w, h = im.size; px = im.load(); seen = set()
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or px[x, y][3] < 128: continue
            comp, stack = [], [(x, y)]; seen.add((x, y))
            while stack:
                cx, cy = stack.pop(); comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1), (cx + 1, cy + 1), (cx - 1, cy - 1), (cx + 1, cy - 1), (cx - 1, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny][3] >= 128: seen.add((nx, ny)); stack.append((nx, ny))
            if len(comp) < keep:
                for cx, cy in comp: px[cx, cy] = (0, 0, 0, 0)
    return im

def main(path, set_name, grid=None, layout='full'):
    global ANIMS, CELL
    ANIMS = LAYOUTS[layout]
    sheet = Image.open(path).convert('RGBA')
    if grid:
        gx, gy, px_, py_ = grid
        CELL = int(-(-max(px_, py_) // 1))
        def cut(r, c):
            x0, y0 = round(gx + c * px_), round(gy + r * py_)
            im = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
            im.paste(sheet.crop((x0, y0, x0 + CELL, y0 + CELL)), (0, 0))
            # keep only this cell's pixels (the next cell starts one pitch along)
            w, h = round(gx + (c + 1) * px_) - x0, round(gy + (r + 1) * py_) - y0
            mask = Image.new('L', (CELL, CELL), 0); mask.paste(255, (0, 0, w, h))
            out = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); out.paste(im, (0, 0), mask)
            return out
    else:
        cut = lambda r, c: sheet.crop((c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL))
    cells = {rc: despeck(cut(*rc)) for frames, _ in ANIMS.values() for rc in frames}
    cols = sorted({p[:3] for im in cells.values() for p in im.getdata() if p[3] >= 128})
    if len(cols) > len(CH):
        # weight colours by how often they're used, so the main colours stay exact
        allpx = [p[:3] for im in cells.values() for p in im.getdata() if p[3] >= 128]
        strip = Image.new('RGB', (len(allpx), 1)); strip.putdata(allpx)
        q = strip.quantize(colors=len(CH), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        qp = q.getpalette()[:len(CH) * 3]
        qcols = [tuple(qp[i:i + 3]) for i in range(0, len(qp), 3)]
        remap = {c: min(qcols, key=lambda k: (k[0] - c[0]) ** 2 + (k[1] - c[1]) ** 2 + (k[2] - c[2]) ** 2) for c in cols}
    else:
        remap = {c: c for c in cols}
    pal = sorted(set(remap.values()))
    index = {c: i for i, c in enumerate(pal)}
    out = {}
    for anim, (frames, fps) in ANIMS.items():
        rows_per_frame, bottom = [], 0
        for rc in frames:
            im = cells[rc]; px = im.load()
            rows = []
            for y in range(CELL):
                s = ''
                for x in range(CELL):
                    p = px[x, y]
                    s += CH[index[remap[p[:3]]]] if p[3] >= 128 else '.'
                rows.append(s)
                if any(ch != '.' for ch in s): bottom = max(bottom, y)
            rows_per_frame.append(rows)
        # anchor: centre of the cell, on the lowest drawn row of the animation (the cat's feet)
        out[f'{set_name}_{anim}'] = {'w': CELL, 'h': CELL, 'cat': CATEGORY.get(layout, 'cats'), 'fps': fps, 'ax': CELL // 2, 'ay': bottom, 'pal': ['#%02x%02x%02x' % c for c in pal], 'frames': rows_per_frame}
    p = os.path.join(ROOT, 'data', 'custom-sprites.json')
    data = json.load(open(p)) if os.path.exists(p) else {'sprites': {}}
    data['sprites'].update(out)
    json.dump(data, open(p, 'w'))
    print(f'imported {len(out)} animations as {set_name}_* ({len(pal)} colours)')

if __name__ == '__main__':
    args = sys.argv[1:]
    grid = layout = None
    if '--grid' in args: i = args.index('--grid'); grid = [float(v) for v in args[i + 1].split(',')]; del args[i:i + 2]
    if '--layout' in args: i = args.index('--layout'); layout = args[i + 1]; del args[i:i + 2]
    if len(args) != 2: sys.exit(__doc__)
    main(args[0], args[1], grid, layout or 'full')
