"""Import one picture as a single-frame sprite, cropped to its visible pixels.

    python3 tools/import_sprite.py art/bridge.png decor_bridge decor

The sprite keeps its own colours (up to 62) and is stored in data/custom-sprites.json, which
tools/gen-sprites.mjs keeps; run `node tools/gen-sprites.mjs` afterwards. Needs Pillow.
"""
import json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

def main(path, name, cat):
    im = Image.open(path).convert('RGBA')
    im = im.crop(im.getbbox())
    w, h = im.size
    px = [im.getpixel((x, y)) for y in range(h) for x in range(w)]
    cols = sorted({p[:3] for p in px if p[3] >= 128})
    if len(cols) > len(CH): sys.exit(f'{len(cols)} colours; reduce to {len(CH)} or fewer first')
    index = {c: i for i, c in enumerate(cols)}
    rows = [''.join(CH[index[px[y * w + x][:3]]] if px[y * w + x][3] >= 128 else '.' for x in range(w)) for y in range(h)]
    p = os.path.join(ROOT, 'data', 'custom-sprites.json')
    data = json.load(open(p)) if os.path.exists(p) else {'sprites': {}}
    data['sprites'][name] = {'w': w, 'h': h, 'cat': cat, 'fps': 0, 'pal': ['#%02x%02x%02x' % c for c in cols], 'frames': [rows]}
    json.dump(data, open(p, 'w'))
    print(f'imported {name}: {w}x{h}, {len(cols)} colours')

if __name__ == '__main__':
    if len(sys.argv) != 4: sys.exit(__doc__)
    main(*sys.argv[1:])
