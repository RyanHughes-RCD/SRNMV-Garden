"""Import the cabin furniture sheet (art/interior-sheet.png, an 8x8 grid of 32x32 cells).

    python3 tools/import_interior.py

Each cell is cropped to its object, keeps up to 62 of its own colours, and is stored as
`in_<id>` in data/custom-sprites.json (kept when tools/gen-sprites.mjs is re-run). Then
run `node tools/gen-sprites.mjs` to rebuild data/sprites.json. Which cell is which piece of
furniture lives in CELLS below; the furniture's rules and prices are in data/interior.json.
Needs Pillow (pip install pillow).
"""
import json, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CELL = 32
CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
# (row, col) -> sprite id (in_<id>)
CELLS = {
    (0, 0): 'bed_red', (0, 1): 'bed', (0, 2): 'crib', (0, 3): 'nest_bed', (0, 4): 'bed_purple', (0, 5): 'cushion', (0, 6): 'canopy_bed', (0, 7): 'cat_basket',
    (1, 0): 'brick_fireplace', (1, 1): 'fireplace', (1, 2): 'stove', (1, 3): 'log_rack', (1, 4): 'fire_pit', (1, 5): 'radiator', (1, 6): 'hearth', (1, 7): 'bread_oven',
    (2, 0): 'wardrobe', (2, 1): 'dresser', (2, 2): 'vanity', (2, 3): 'small_chest', (2, 4): 'treasure_chest', (2, 5): 'cabinet', (2, 6): 'bookshelf', (2, 7): 'nightstand',
    (3, 0): 'dining_table', (3, 1): 'side_table', (3, 2): 'round_table', (3, 3): 'desk', (3, 4): 'counter', (3, 5): 'sink', (3, 6): 'coffee_table', (3, 7): 'breakfast_set',
    (4, 0): 'chair', (4, 1): 'armchair', (4, 2): 'sofa_red', (4, 3): 'sofa', (4, 4): 'stool', (4, 5): 'rocking_chair', (4, 6): 'bench', (4, 7): 'cushion_chair',
    (5, 0): 'rug_round', (5, 1): 'rug_long', (5, 2): 'welcome_mat', (5, 3): 'rug_stripes', (5, 4): 'rug_persian', (5, 5): 'rug_heart', (5, 6): 'rug_patchwork', (5, 7): 'doormat',
    (6, 0): 'grandfather_clock', (6, 1): 'floor_lamp', (6, 2): 'table_lamp', (6, 3): 'piano', (6, 4): 'tv', (6, 5): 'radio', (6, 6): 'range', (6, 7): 'fridge',
    (7, 0): 'houseplant', (7, 1): 'hanging_plant', (7, 2): 'cactus', (7, 3): 'book_stack', (7, 4): 'toaster', (7, 5): 'clock', (7, 6): 'easel', (7, 7): 'teddy_globe',
}

def to_sprite(im):
    bb = im.getbbox()
    im = im.crop(bb)
    w, h = im.size
    px = list(im.getdata())
    cols = sorted({p[:3] for p in px if p[3] >= 128})
    if len(cols) > len(CH):  # too many colours: reduce, keeping the look
        strip = Image.new('RGB', (len(cols), 1)); strip.putdata(cols)
        q = strip.quantize(colors=len(CH), method=Image.Quantize.MEDIANCUT).convert('RGB')
        remap = dict(zip(cols, q.getdata()))
        px = [(*remap[p[:3]], p[3]) if p[3] >= 128 else p for p in px]
        cols = sorted({p[:3] for p in px if p[3] >= 128})
    index = {c: i for i, c in enumerate(cols)}
    rows = [''.join(CH[index[px[y * w + x][:3]]] if px[y * w + x][3] >= 128 else '.' for x in range(w)) for y in range(h)]
    return {'w': w, 'h': h, 'cat': 'interior', 'fps': 0, 'pal': ['#%02x%02x%02x' % c for c in cols], 'frames': [rows]}

def main():
    sheet = Image.open(os.path.join(ROOT, 'art', 'interior-sheet.png')).convert('RGBA')
    path = os.path.join(ROOT, 'data', 'custom-sprites.json')
    data = json.load(open(path)) if os.path.exists(path) else {'sprites': {}}
    for (r, c), sid in CELLS.items():
        data['sprites'][f'in_{sid}'] = to_sprite(sheet.crop((c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL)))
    json.dump(data, open(path, 'w'))
    print(f'imported {len(CELLS)} furniture sprites into data/custom-sprites.json')

if __name__ == '__main__':
    main()
