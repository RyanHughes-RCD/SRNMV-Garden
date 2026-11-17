"""Import the fruit tree sheet (art/fruit-trees-sheet.png): 8 trees, each drawn young and full-grown.

    python3 tools/import_fruit_trees.py

Each picture on the sheet is found automatically (left to right, top to bottom) and paired up as
young -> grown in ORDER below. Stored as ftree2_<tree>_young / ftree2_<tree>_grown in
data/custom-sprites.json; tools/gen-sprites.mjs then adds blossom and fruit overlays that sit on
each grown tree's leaves. Needs Pillow.
"""
import json, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
# pairs on the sheet, in reading order: (young, grown) for each fruit tree
ORDER = ['apple', 'pear', 'cherry', 'plum', 'orange', 'lemon', 'peach', 'fig']

def components(im):
    W, H = im.size; px = im.load(); seen = set(); out = []
    for y in range(H):
        for x in range(W):
            if (x, y) in seen or px[x, y][3] < 128: continue
            st = [(x, y)]; seen.add((x, y)); xs = []; ys = []
            while st:
                cx, cy = st.pop(); xs.append(cx); ys.append(cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1), (cx + 1, cy + 1), (cx - 1, cy - 1), (cx + 1, cy - 1), (cx - 1, cy + 1)):
                    if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and px[nx, ny][3] >= 128: seen.add((nx, ny)); st.append((nx, ny))
            if len(xs) > 30: out.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    rows = sorted(out, key=lambda b: b[3])
    # group into rows by their bottoms, then left to right
    grouped, cur = [], []
    for b in rows:
        if cur and b[3] - cur[-1][3] > 12: grouped.append(cur); cur = []
        cur.append(b)
    grouped.append(cur)
    return [b for row in grouped for b in sorted(row)]

def to_sprite(im):
    w, h = im.size
    px = [im.getpixel((x, y)) for y in range(h) for x in range(w)]
    cols = sorted({p[:3] for p in px if p[3] >= 128})
    remap = {c: c for c in cols}
    if len(cols) > len(CH):
        allpx = [p[:3] for p in px if p[3] >= 128]
        strip = Image.new('RGB', (len(allpx), 1)); strip.putdata(allpx)
        q = strip.quantize(colors=len(CH), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        qp = q.getpalette()[:len(CH) * 3]; qc = [tuple(qp[i:i + 3]) for i in range(0, len(qp), 3)]
        remap = {c: min(qc, key=lambda k: sum((a - b) ** 2 for a, b in zip(k, c))) for c in cols}
    pal = sorted(set(remap.values())); index = {c: i for i, c in enumerate(pal)}
    rows = [''.join(CH[index[remap[px[y * w + x][:3]]]] if px[y * w + x][3] >= 128 else '.' for x in range(w)) for y in range(h)]
    # anchor: the middle of the bottom (the patch of ground under the trunk)
    bottom = [x for x in range(w) if px[(h - 1) * w + x][3] >= 128]
    ax = (bottom[0] + bottom[-1]) // 2 if bottom else w // 2
    return {'w': w, 'h': h, 'cat': 'trees', 'fps': 0, 'ax': ax, 'ay': h - 3, 'pal': ['#%02x%02x%02x' % c for c in pal], 'frames': [rows]}

def main():
    sheet = Image.open(os.path.join(ROOT, 'art', 'fruit-trees-sheet.png')).convert('RGBA')
    boxes = components(sheet)
    if len(boxes) != len(ORDER) * 2: raise SystemExit(f'found {len(boxes)} pictures, expected {len(ORDER) * 2}')
    p = os.path.join(ROOT, 'data', 'custom-sprites.json')
    data = json.load(open(p))
    for k, tree in enumerate(ORDER):
        for j, stage in enumerate(('young', 'grown')):
            data['sprites'][f'ftree2_{tree}_{stage}'] = to_sprite(sheet.crop(boxes[k * 2 + j]))
    json.dump(data, open(p, 'w'))
    print(f'imported {len(ORDER)} fruit trees (young + grown)')

if __name__ == '__main__':
    main()
