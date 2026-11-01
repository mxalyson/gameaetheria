# Recorta os ícones das duas folhas geradas (docs/art-direction/fontes-icones/) e grava public/assets/icons/**.webp (256×256, fundo transparente).
# Uso: python tools/skill-icons-from-sheets.py   (precisa de Pillow). As caixas foram ajustadas à mão sobre as folhas originais.
from PIL import Image, ImageDraw, ImageFilter
import os
root = os.path.join(os.path.dirname(__file__), '..')
src = os.path.join(root, 'docs/art-direction/fontes-icones/')
a = Image.open(src + 'folha-1-8-icones.jpg').convert('RGB'); b = Image.open(src + 'folha-2-4-icones.jpg').convert('RGB')
cols = [(100, 475), (578, 953), (1056, 1431), (1534, 1909)]; rows = [(55, 455), (535, 925), (1005, 1395)]
tiles = {}
ids7 = [['whirlwind', 'charge', 'warcry', 'fireball'], ['frostnova', None, 'rain', None], [None, 'holylight', 'divineshield', 'potion']]
for r, (y0, y1) in enumerate(rows):
    for c, (x0, x1) in enumerate(cols):
        if ids7[r][c]: tiles[ids7[r][c]] = a.crop((x0, y0, x1, y1))
for k, bx in {'blink': (45, 45, 490, 495), 'pierce': (532, 45, 985, 495), 'roll': (45, 525, 490, 975), 'judgement': (532, 525, 985, 975)}.items(): tiles[k] = b.crop(bx)

def cut(im):
    w, h = im.size; key = (255, 0, 255); t = im.copy()
    for s in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if t.getpixel(s) != key: ImageDraw.floodfill(t, s, key, thresh=38)
    mask = Image.new('L', (w, h), 255); px = t.load(); mp = mask.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == key: mp[x, y] = 0
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert('RGBA'); out.putalpha(mask)
    bb = out.getbbox(); out = out.crop(bb)
    s = max(out.size); sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(out, ((s - out.size[0]) // 2, (s - out.size[1]) // 2))
    return sq.resize((256, 256), Image.LANCZOS)

for k, im in tiles.items():
    dest = 'icons/status/potion.webp' if k == 'potion' else f'icons/skills/{k}.webp'
    cut(im).save(os.path.join(root, 'public/assets', dest), 'WEBP', quality=92, method=6)
    print('ok', dest)
