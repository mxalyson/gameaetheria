# Pega a vista de FRENTE (célula 0 da grade 4x2 do mob-bake) de um NPC fotografado e grava public/assets/npcs/<id>.webp + .json (âncora nos pés).
# Uso: node tools/mob-bake.mjs meshy-mobs/x.glb zz-<id> <peças> 260 "" 6 34   e depois   python tools/npc-from-glb.py <id> [...]
# Escala comum: todos os NPCs de um mesmo GLB saem com 200 px por unidade do modelo (alturas proporcionais entre eles).
import sys, os, json, time
import numpy as np
from PIL import Image
root = os.path.join(os.path.dirname(__file__), '..')
out = os.path.join(root, 'public/assets/npcs'); os.makedirs(out, exist_ok=True)
for spec in sys.argv[1:]:
    id_, _, hpx = spec.partition(':')  # id ou id:altura-em-px (para GLBs separados, cada um normalizado pelo próprio tamanho)
    meta = json.load(open(os.path.join(root, f'public/assets/mobs/zz-{id_}.json')))
    sheet = Image.open(os.path.join(root, f'test-results/mob-bake/zz-{id_}.png')).convert('RGBA')
    cw, ch = meta['cell']; cell = sheet.crop((0, 0, cw, ch))
    bb = cell.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox(); x0, y0, x1, y1 = bb
    c = cell.crop(bb); k = (int(hpx) / c.height) if hpx else 200 / meta['ppm']
    r = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)
    ax = round((meta['ax'] - x0) * k); ay = round((meta['ay'] - y0) * k)
    r.save(os.path.join(out, id_ + '.webp'), 'WEBP', quality=90, method=6)
    json.dump({'id': id_, 'w': r.width, 'h': r.height, 'ax': ax, 'ay': min(ay, r.height), 'v': int(time.time())}, open(os.path.join(out, id_ + '.json'), 'w'))
    print(id_, r.size, 'âncora', ax, ay)
