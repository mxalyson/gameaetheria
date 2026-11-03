# Mestres de classe: pega o quadro parado de frente (vista 0, idle, quadro 0) do atlas de cada herói e grava public/assets/npcs/master_<classe>.webp + .json (âncora nos pés).
# Uso: python tools/npc-from-heroes.py   (lê os atlas do disco, sem navegador). Escala comum: todos saem com K px por px do atlas (alturas proporcionais).
import os, json, time
from PIL import Image
root = os.path.join(os.path.dirname(__file__), '..')
rig = os.path.join(root, 'public/labs/iso-poc/art-local/atlas-rig')
out = os.path.join(root, 'public/assets/npcs'); os.makedirs(out, exist_ok=True)
K = 1.9  # herói em jogo: ~125 px de atlas × 0,9/1,25 ≈ 90 do mundo; NPC = 125×K×0,4 ≈ 95 (um pouco maior que o jogador)
HEROES = {'warrior': 'paladino', 'mage': 'aprendiz', 'archer': 'franco', 'cleric': 'sacerdote'}
for cls, hero in HEROES.items():
    meta = json.load(open(os.path.join(rig, hero, hero + '.json')))
    sheet = Image.open(os.path.join(rig, hero, 'idle.png')).convert('RGBA')
    fr = meta['clips']['idle']['frames']; rows = meta.get('rows', meta['views'])
    cw, ch = sheet.width // fr, sheet.height // rows
    cell = sheet.crop((0, 0, cw, ch))  # vista 0 (frente), quadro 0
    sc = cw / meta['frame']['w']  # px do atlas por unidade lógica
    px, py = meta['pivot']['x'] * sc, meta['pivot']['y'] * sc
    x0, y0, x1, y1 = cell.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    c = cell.crop((x0, y0, x1, y1))
    r = c.resize((max(1, round(c.width * K)), max(1, round(c.height * K))), Image.LANCZOS)
    ax = round((px - x0) * K); ay = min(round((py - y0) * K), r.height)
    id_ = 'master_' + cls
    r.save(os.path.join(out, id_ + '.webp'), 'WEBP', quality=92, method=6)
    json.dump({'id': id_, 'w': r.width, 'h': r.height, 'ax': ax, 'ay': ay, 'v': int(time.time())}, open(os.path.join(out, id_ + '.json'), 'w'))
    print(id_, r.size, 'âncora', ax, ay)
