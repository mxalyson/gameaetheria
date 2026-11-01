# Monta o atlas dos sprites de cenário: test-results/nature-bake/*.png (+ meta.json) -> public/assets/nature/atlas.webp + atlas.json
# Uso: node tools/nature-bake.mjs && python tools/nature-pack.py   (precisa de Pillow)
from PIL import Image
import json, os, sys
ground = len(sys.argv) > 1 and sys.argv[1] == 'chao'  # 'chao': monta ground.webp/json a partir de nature-ground
root = os.path.join(os.path.dirname(__file__), '..')
src = os.path.join(root, 'test-results/nature-ground/' if ground else 'test-results/nature-bake/'); out = os.path.join(root, 'public/assets/nature/')
os.makedirs(out, exist_ok=True)
meta = json.load(open(src + 'meta.json')); GAP = 2; W = 1024
items = sorted(((m, Image.open(src + m['name'] + '.png').convert('RGBA')) for m in meta), key=lambda t: -t[1].height)
x = y = GAP; rowh = 0; place = []
for m, im in items:
    if x + im.width + GAP > W: x = GAP; y += rowh + GAP; rowh = 0
    place.append((m, im, x, y)); x += im.width + GAP; rowh = max(rowh, im.height)
H = 1
while H < y + rowh + GAP: H *= 2
atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sprites = {}
for m, im, px, py in place:
    atlas.alpha_composite(im, (px, py))
    sprites[m['name']] = {'x': px, 'y': py, 'w': im.width, 'h': im.height, 'ax': m['ax'], 'ay': m['ay'], 'ppm': round(m['ppm'], 3), 'mx': m['size'][0], 'my': m['size'][1], 'mz': m['size'][2]}
name = 'ground' if ground else 'atlas'
atlas.save(out + name + '.webp', 'WEBP', quality=90, method=6)
json.dump({'size': [W, H], 'sprites': sprites}, open(out + name + '.json', 'w'), indent=1)
print('atlas', W, H, len(sprites), 'sprites', round(os.path.getsize(out + name + '.webp') / 1024), 'KB')
