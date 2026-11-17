"""Import the tool sheet (art/tools-sheet.png, an 8x8 grid of 32x32 cells) as tool icons.

    python3 tools/import_tools.py

Each tool gets tool_<id> (Basic) and tool_<id>_1/_2/_3 (Copper, Silver, Gold), cropped to the
picture, with ax/ay set to the grip: where the hand holds it when your character carries it.
Which cell is which is in TOOLS below; the hoe has one picture, so its tiers are recoloured.
Then run `node tools/gen-sprites.mjs`. Needs Pillow.
"""
import json, os, colorsys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CELL = 32
CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
# tool id -> cells (row, col) for Basic, Copper, Silver, Gold; grip in the 32x32 cell
TOOLS = {
    'hand':   ([(0, 0)], (16, 26)),
    'axe':    ([(2, 6), (2, 3), (2, 2), (2, 4)], (9, 23)),
    'hoe':    ([(1, 7)] * 4, (9, 23)),
    'seeds':  ([(3, 0), (3, 7), (3, 5), (3, 4)], (16, 8)),
    'can':    ([(7, 5), (4, 2), (4, 0), (4, 6)], (16, 8)),
    'shovel': ([(5, 5), (5, 6), (5, 0), (5, 3)], (21, 12)),  # held on the shaft, near the handle
    'rod':    ([(6, 0), (6, 2), (6, 3), (6, 4)], (8, 25)),
}
# Pictures drawn facing the other way: cans whose spout points left are mirrored so every spout
# points forward. Shovels are drawn blade-down-left (the other tools point up-right), so they're
# marked face: left and the game turns them round when you hold one.
MIRROR = {(7, 5), (4, 2), (4, 6)}
FACE_LEFT = {'shovel'}
# the hoe's blade, recoloured per tier: (hue in degrees or None for grey, saturation, brightness x)
HOE_METAL = [(None, 0, 0.7), (25, 0.55, 1.0), (None, 0, 1.15), (46, 0.8, 1.15)]

def metal(im, tier):
    hue, sat, val = HOE_METAL[tier]
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 128: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s > 0.18 or v < 0.2: continue  # wood and outlines stay
            nh = (hue / 360) if hue is not None else h
            nr, ng, nb = colorsys.hsv_to_rgb(nh, sat if hue is not None else s, min(1, v * val))
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return im

def to_sprite(im, grip):
    bb = im.getbbox(); im = im.crop(bb); w, h = im.size
    px = [im.getpixel((x, y)) for y in range(h) for x in range(w)]
    cols = sorted({p[:3] for p in px if p[3] >= 128})
    if len(cols) > len(CH): raise SystemExit('too many colours')
    idx = {c: i for i, c in enumerate(cols)}
    rows = [''.join(CH[idx[px[y * w + x][:3]]] if px[y * w + x][3] >= 128 else '.' for x in range(w)) for y in range(h)]
    return {'w': w, 'h': h, 'cat': 'ui', 'fps': 0, 'ax': grip[0] - bb[0], 'ay': grip[1] - bb[1], 'pal': ['#%02x%02x%02x' % c for c in cols], 'frames': [rows]}

def main():
    sheet = Image.open(os.path.join(ROOT, 'art', 'tools-sheet.png')).convert('RGBA')
    p = os.path.join(ROOT, 'data', 'custom-sprites.json'); data = json.load(open(p))
    for tid, (cells, grip) in TOOLS.items():
        for tier, (r, c) in enumerate(cells):
            im = sheet.crop((c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL))
            g = grip
            if (r, c) in MIRROR: im = im.transpose(Image.FLIP_LEFT_RIGHT); g = (CELL - 1 - grip[0], grip[1])
            if tid == 'hoe': im = metal(im, tier)
            spr = to_sprite(im, g)
            if tid in FACE_LEFT: spr['face'] = 'left'
            data['sprites'][f'tool_{tid}' + (f'_{tier}' if tier else '')] = spr
    json.dump(data, open(p, 'w'))
    print(f'imported {sum(len(c) for c, _ in TOOLS.values())} tool icons')

if __name__ == '__main__':
    main()
