# Monta o atlas das peças dos GLB do Meshy: test-results/glb-bake/*.png (+ meta.json de tools/glb-bake.mjs) -> public/assets/nature/meshy.webp + meshy.json
# As peças escolhidas e seus nomes ficam em KEEP (as outras são lascas/manchas do modelo e ficam de fora).
from PIL import Image
import json, os
root = os.path.join(os.path.dirname(__file__), '..')
src = os.path.join(root, 'test-results/glb-bake/'); out = os.path.join(root, 'public/assets/nature/')
KEEP = {
    'Cherry_Blossom_Trio_0': 'cherry_1', 'Cherry_Blossom_Trio_1': 'cherry_2', 'Cherry_Blossom_Trio_2': 'cherry_3',
    'Pastel_Crystal_Cluste_0': 'crystal_1', 'Pastel_Crystal_Cluste_1': 'crystal_2', 'Pastel_Crystal_Cluste_2': 'crystal_3', 'Pastel_Crystal_Cluste_3': 'crystal_4', 'Pastel_Crystal_Cluste_4': 'crystal_5',
    'Overgrown_Ruins_Set_1': 'pillar_1', 'Overgrown_Ruins_Set_2': 'pillar_2', 'Overgrown_Ruins_Set_6': 'arch_broken', 
    'Overgrown_Ruins_Set_8': 'boulder', 'Overgrown_Ruins_Set_9': 'slab',
    'Mossbound_Sentinels_0': 'statue_knight', 'Mossbound_Sentinels_1': 'statue_owl',
    'Cozy_Medieval_Village_1': 'house_thatch', 'Cozy_Medieval_Village_2': 'lamp', 'Cozy_Medieval_Village_3': 'sign',
    'Cozy_Medieval_Village_4': 'house_tile', 'Cozy_Medieval_Village_5': 'stump', 'Cozy_Medieval_Village_6': 'log', 'Cozy_Medieval_Village_7': 'house_big',
    'Cozy_Medieval_Village_9': 'house_porch', 
}
meta = {m['name']: m for m in json.load(open(src + 'meta.json'))}
GAP = 2; W = 1024
items = sorted(((KEEP[n], meta[n], Image.open(src + n + '.png').convert('RGBA')) for n in KEEP), key=lambda t: -t[2].height)
x = y = GAP; rowh = 0; place = []
for name, m, im in items:
    if x + im.width + GAP > W: x = GAP; y += rowh + GAP; rowh = 0
    place.append((name, m, im, x, y)); x += im.width + GAP; rowh = max(rowh, im.height)
H = 1
while H < y + rowh + GAP: H *= 2
atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sprites = {}
for name, m, im, px, py in place:
    atlas.alpha_composite(im, (px, py))
    sprites[name] = {'x': px, 'y': py, 'w': im.width, 'h': im.height, 'ax': m['ax'], 'ay': m['ay'], 'ppm': round(m['ppm'], 3), 'mx': m['size'][0], 'my': m['size'][1], 'mz': m['size'][2]}
atlas.save(out + 'meshy.webp', 'WEBP', quality=88, method=6)
json.dump({'size': [W, H], 'sprites': sprites}, open(out + 'meshy.json', 'w'), indent=1)
print('atlas', W, H, len(sprites), 'sprites', round(os.path.getsize(out + 'meshy.webp') / 1024), 'KB')
