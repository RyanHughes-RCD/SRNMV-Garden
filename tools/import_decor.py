"""Import the outdoor decoration sheet (art/decor-sheet.png, an 8x8 grid of 32x32 cells).

    python3 tools/import_decor.py

Each cell becomes decor2_<name> in data/custom-sprites.json (cropped to the picture, own colours).
CELLS says which cell is which; data/decor.json says which decoration uses it, its size on the map
and how big it's drawn ("scale"). Then run `node tools/gen-sprites.mjs`. Needs Pillow.
"""
import json, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CELL = 32
CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
CELLS = [
    ['campfire', 'fire_pit_day', 'fire_pit_night', 'roasting_spit', 'stone_oven', 'grill', 'chopping_block', 'woodshed'],
    ['beehive', 'painted_hive', 'skep', 'gnome', 'scarecrow', 'pumpkin_scarecrow', 'birdhouse', 'compost_bin'],
    ['wild_pond', 'pond', 'birdbath', 'bird_fountain', 'wishing_well', 'ivy_well', 'water_pump', 'rain_barrel'],
    ['greenhouse', 'glasshouse', 'rose_arch', 'trellis', 'raised_bed', 'flower_planter', 'flower_barrow', 'wheelbarrow'],
    ['picnic_table', 'patio_table', 'bench', 'stone_bench', 'log_seat', 'hammock', 'garden_swing', 'bistro_set'],
    ['stone_arch', 'rustic_gate', 'statue', 'sundial', 'windmill', 'weathervane', 'mailbox', 'clothesline'],
    ['tool_rack', 'can_stand', 'seed_sacks', 'garden_cart', 'crate_stack', 'tool_bin', 'hay_bale', 'haystack'],
    ['tent', 'bedrolls', 'kennel', 'lamp_post', 'garden_torch', 'mossy_boulder', 'old_stump', 'hanging_post'],
]

def to_sprite(im):
    im = im.crop(im.getbbox()); w, h = im.size
    px = [im.getpixel((x, y)) for y in range(h) for x in range(w)]
    cols = sorted({p[:3] for p in px if p[3] >= 128})
    remap = {c: c for c in cols}
    if len(cols) > len(CH):
        allpx = [p[:3] for p in px if p[3] >= 128]
        strip = Image.new('RGB', (len(allpx), 1)); strip.putdata(allpx)
        q = strip.quantize(colors=len(CH), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        qp = q.getpalette()[:len(CH) * 3]; qc = [tuple(qp[i:i + 3]) for i in range(0, len(qp), 3)]
        remap = {c: min(qc, key=lambda k: sum((a - b) ** 2 for a, b in zip(k, c))) for c in cols}
    pal = sorted(set(remap.values())); idx = {c: i for i, c in enumerate(pal)}
    rows = [''.join(CH[idx[remap[px[y * w + x][:3]]]] if px[y * w + x][3] >= 128 else '.' for x in range(w)) for y in range(h)]
    return {'w': w, 'h': h, 'cat': 'decor', 'fps': 0, 'pal': ['#%02x%02x%02x' % c for c in pal], 'frames': [rows]}

def main():
    sheet = Image.open(os.path.join(ROOT, 'art', 'decor-sheet.png')).convert('RGBA')
    p = os.path.join(ROOT, 'data', 'custom-sprites.json'); data = json.load(open(p))
    for r, row in enumerate(CELLS):
        for c, name in enumerate(row):
            data['sprites'][f'decor2_{name}'] = to_sprite(sheet.crop((c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL)))
    json.dump(data, open(p, 'w'))
    print(f'imported {sum(len(r) for r in CELLS)} decorations')

if __name__ == '__main__':
    main()
