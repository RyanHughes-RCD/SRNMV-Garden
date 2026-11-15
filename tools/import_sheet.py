"""Import a 32x32-frame character sheet as a player sprite set.

    python3 tools/import_sheet.py art/player1-sheet.png hero

Frames are picked from the sheet's 8x8 grid (row, column) using the MAP below,
reduced to at most 32 colours, and stored with the sprite's own palette in
data/custom-sprites.json (kept when tools/gen-sprites.mjs is re-run) and in
data/sprites.json (what the game loads). Needs Pillow (pip install pillow).
"""
import json, sys, os
from PIL import Image

CELL = 32
# name suffix -> list of (row, col, flipX) frames, and fps
MAP = {
    'walk_down': ([(0, 0, 0), (0, 1, 0), (0, 0, 0), (0, 2, 0)], 8),
    'walk_up':   ([(2, 0, 0), (2, 2, 0), (2, 0, 0), (2, 2, 1)], 8),
    'walk_side': ([(4, 0, 0), (4, 1, 0), (4, 0, 0), (4, 2, 0)], 8),
    'work_down': ([(0, 4, 0), (1, 3, 0)], 5),
    'work_up':   ([(2, 4, 0), (2, 3, 0)], 5),
    'work_side': ([(5, 6, 0), (5, 5, 0)], 5),
    'sit':       ([(0, 7, 0), (1, 7, 0)], 2),
    'sleep':     ([(6, 6, 0), (6, 7, 0)], 1),
    'wave':      ([(0, 5, 0), (1, 5, 0)], 4),
}
CH = '0123456789abcdefghijklmnopqrstuv'
ROOT = os.path.join(os.path.dirname(__file__), '..')

def main(path, set_name):
    sheet = Image.open(path).convert('RGBA')
    cells = {}
    for frames, _ in MAP.values():
        for r, c, f in frames:
            im = sheet.crop((c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL))
            cells[(r, c, f)] = im.transpose(Image.FLIP_LEFT_RIGHT) if f else im
    # one shared palette for the whole set (opaque pixels only), max 32 colours
    opaque = [p[:3] for im in cells.values() for p in im.getdata() if p[3] >= 128]
    strip = Image.new('RGB', (len(opaque), 1)); strip.putdata(opaque)
    q = strip.quantize(colors=32, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:32 * 3]
    colours = [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]
    def nearest(rgb):
        return min(range(len(colours)), key=lambda i: sum((a - b) ** 2 for a, b in zip(rgb, colours[i])))
    cache = {}
    def rows_of(im):
        out = []
        for y in range(CELL):
            s = ''
            for x in range(CELL):
                p = im.getpixel((x, y))
                if p[3] < 128: s += '.'; continue
                k = p[:3]
                if k not in cache: cache[k] = nearest(k)
                s += CH[cache[k]]
            out.append(s)
        return out
    # feet line: lowest opaque row of the standing frame
    idle = cells[(0, 0, 0)]
    feet = max(y for y in range(CELL) for x in range(CELL) if idle.getpixel((x, y))[3] >= 128)
    hexpal = ['#%02x%02x%02x' % c for c in colours]
    sprites = {}
    for suffix, (frames, fps) in MAP.items():
        sprites[f'{set_name}_{suffix}'] = {'w': CELL, 'h': CELL, 'cat': 'player', 'fps': fps, 'ax': CELL // 2, 'ay': feet,
                                            'pal': hexpal, 'frames': [rows_of(cells[k]) for k in frames]}
    for fname in ['custom-sprites.json', 'sprites.json']:
        p = os.path.join(ROOT, 'data', fname)
        data = json.load(open(p)) if os.path.exists(p) else {'sprites': {}}
        data.setdefault('sprites', {}).update(sprites)
        json.dump(data, open(p, 'w'), separators=(',', ':'))
    print(f'imported {len(sprites)} sprites as "{set_name}_*" with {len(hexpal)} colours, feet at y={feet}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'hero')
