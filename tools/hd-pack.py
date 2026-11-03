# Monta o atlas HD (alta densidade) public/assets/nature/hd.webp + hd.json (nomes hd_*) a partir dos bakes HD em public/labs/iso-poc/art-local/hd-bake/
# (node tools/nature-bake.mjs 26 40 hd; node tools/glb-bake.mjs 380 40 Cozy_Medieval_Village 1,4,7,9 hd; node tools/glb-bake.mjs 340 40 Cherry_Blossom_Trio 0,1,2 hd;
#  node tools/glb-dirs.mjs Meshy_AI_Cozy_Medieval_Village_1101193940_texture.glb bridge 8 580 40 hd). Orçamento: <= 4 MiB decodificados (1024 x H x 4).
# hd_X substitui X (Quaternius) e m_X (Meshy): hd_CommonTree_1 <-> CommonTree_1, hd_house_tile <-> m_house_tile. A janela do bake é a mesma do atlas normal, então o sprite
# HD cobre exatamente o mesmo retângulo do mundo; cada peça é reduzida para `cap` px de altura (ponte: de largura) com LANCZOS.
from PIL import Image
import json, os
root = os.path.join(os.path.dirname(__file__), '..'); B = os.path.join(root, 'public/labs/iso-poc/art-local/hd-bake/'); out = os.path.join(root, 'public/assets/nature/')
CAP_TREE, CAP_CHERRY, CAP_HOUSE, CAP_BRIDGE_W = 290, 270, 320, 400
items = []  # (nome, imagem, ax, ay, ppm, size)
for m in json.load(open(B + 'nature/meta.json')):
    items.append(('hd_' + m['name'], Image.open(B + 'nature/' + m['name'] + '.png').convert('RGBA'), m['ax'], m['ay'], m['ppm'], m['size'], CAP_TREE, 'h'))
HOUSE = {'Cozy_Medieval_Village_1': 'house_thatch', 'Cozy_Medieval_Village_4': 'house_tile', 'Cozy_Medieval_Village_7': 'house_big', 'Cozy_Medieval_Village_9': 'house_porch',
         'Cherry_Blossom_Trio_0': 'cherry_1', 'Cherry_Blossom_Trio_1': 'cherry_2', 'Cherry_Blossom_Trio_2': 'cherry_3'}
for m in json.load(open(B + 'glb/meta.json')):
    n = HOUSE.get(m['name'])
    if n: items.append(('hd_' + n, Image.open(B + 'glb/' + m['name'] + '.png').convert('RGBA'), m['ax'], m['ay'], m['ppm'], m['size'], CAP_CHERRY if n.startswith('cherry') else CAP_HOUSE, 'h'))
dm = json.load(open(B + 'dirs/bridge.json')); cw, ch = dm['cell']; k = 2  # giro 2 (leste): a ponte de frente, como no atlas normal
cell = Image.open(B + 'dirs/bridge.png').convert('RGBA').crop(((k % dm['cols']) * cw, (k // dm['cols']) * ch, (k % dm['cols'] + 1) * cw, (k // dm['cols'] + 1) * ch))
bb = cell.split()[3].getbbox()
items.append(('hd_bridge', cell.crop(bb), dm['ax'] - bb[0], dm['ay'] - bb[1], dm['ppm'], dm['size'], CAP_BRIDGE_W, 'w'))

def build(f):
    place = []; sprites = {}
    for name, im, ax, ay, ppm, size, cap, by in items:
        s = min(1.0, cap * f / (im.height if by == 'h' else im.width))
        w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
        place.append((name, im.resize((w, h), Image.LANCZOS), ax * w / im.width, ay * h / im.height, ppm * w / im.width, size))
    place.sort(key=lambda t: -t[1].height)
    GAP, W = 2, 1024; x = y = GAP; rowh = 0; pos = []
    for name, im, ax, ay, ppm, size in place:
        if x + im.width + GAP > W: x = GAP; y += rowh + GAP; rowh = 0
        pos.append((name, im, ax, ay, ppm, size, x, y)); x += im.width + GAP; rowh = max(rowh, im.height)
    return pos, W, y + rowh + GAP
f = 1.0
while True:
    pos, W, H = build(f)
    if H <= 1024: break
    f -= 0.02
H = (H + 3) // 4 * 4
atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sprites = {}
for name, im, ax, ay, ppm, size, x, y in pos:
    atlas.alpha_composite(im, (x, y))
    sprites[name] = {'x': x, 'y': y, 'w': im.width, 'h': im.height, 'ax': round(ax), 'ay': round(ay), 'ppm': round(ppm, 3), 'mx': size[0], 'my': size[1], 'mz': size[2]}
atlas.save(out + 'hd.webp', 'WEBP', quality=90, method=6)
json.dump({'size': [W, H], 'sprites': sprites}, open(out + 'hd.json', 'w'), indent=1)
print('hd', W, H, round(W * H * 4 / 1048576, 2), 'MiB', len(sprites), 'sprites', round(os.path.getsize(out + 'hd.webp') / 1024), 'KB', 'fator', round(f, 2))
for n, s in sprites.items(): print(' ', n, s['w'], s['h'])
