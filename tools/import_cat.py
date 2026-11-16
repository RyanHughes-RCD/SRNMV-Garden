"""Import a 32x32-frame cat sheet (8x8 grid) as a cat sprite set.

    python3 tools/import_cat.py art/vyke-sheet.png vyke

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

def main(path, set_name):
    sheet = Image.open(path).convert('RGBA')
    cells = {rc: sheet.crop((rc[1] * CELL, rc[0] * CELL, rc[1] * CELL + CELL, rc[0] * CELL + CELL)) for frames, _ in ANIMS.values() for rc in frames}
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
        out[f'{set_name}_{anim}'] = {'w': CELL, 'h': CELL, 'cat': 'cats', 'fps': fps, 'ax': CELL // 2, 'ay': bottom, 'pal': ['#%02x%02x%02x' % c for c in pal], 'frames': rows_per_frame}
    p = os.path.join(ROOT, 'data', 'custom-sprites.json')
    data = json.load(open(p)) if os.path.exists(p) else {'sprites': {}}
    data['sprites'].update(out)
    json.dump(data, open(p, 'w'))
    print(f'imported {len(out)} animations as {set_name}_* ({len(pal)} colours)')

if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
