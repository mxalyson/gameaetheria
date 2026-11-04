# Mestres de classe: pega o quadro parado de frente (vista 0, idle, quadro 0) do atlas de cada herói e grava public/assets/npcs/master_<classe>.webp + .json (âncora nos pés).
# Uso: python tools/npc-from-heroes.py   (lê os atlas do disco, sem navegador). Escala comum: todos saem com K px por px do atlas (alturas proporcionais).
import os, json, time
from PIL import Image
root = os.path.join(os.path.dirname(__file__), '..')
rig = os.path.join(root, 'public/labs/iso-poc/art-local/atlas-rig')
out = os.path.join(root, 'public/assets/npcs'); os.makedirs(out, exist_ok=True)
K = 1.9  # herói em jogo: ~125 px de atlas × 0,9/1,25 ≈ 90 do mundo; NPC = 125×K×0,4 ≈ 95 (um pouco maior que o jogador)
HEROES = {'warrior': 'paladino', 'mage': 'aprendiz', 'archer': 'franco', 'cleric': 'sacerdote'}
import sys
# Mentores de especialização (Porto de Marfim): mesmo recorte, com o atlas Nv 25 de cada especialização. Uso: python tools/npc-from-heroes.py mentors
MENTORS = {'paladin': 'paladin_nv25', 'berserker': 'berserker_nv25', 'arcane': 'arcane_nv25', 'warlock': 'warlock_nv25', 'sniper': 'sniper_nv25', 'gunslinger': 'gunslinger_nv25', 'guardian': 'guardian_nv25', 'inquisitor': 'inquisitor_nv25'}
ONLY_MENTORS = 'mentors' in sys.argv[1:]
for cls, hero in ({('mentor_' + k): v for k, v in MENTORS.items()} if ONLY_MENTORS else HEROES).items():
    meta = json.load(open(os.path.join(rig, hero, hero + '.json')))
    sheet = Image.open(os.path.join(rig, hero, 'idle.png')).convert('RGBA')
    fr = meta['clips']['idle']['frames']; rows = meta.get('rows', meta['views'])
    cw, ch = sheet.width // fr, sheet.height // rows
    cell = sheet.crop((0, 0, cw, ch))  # vista 0 (frente), quadro 0
    K2 = K * meta.get('sizeMul', 1) if ONLY_MENTORS else K
    sc = cw / meta['frame']['w']  # px do atlas por unidade lógica
    px, py = meta['pivot']['x'] * sc, meta['pivot']['y'] * sc
    x0, y0, x1, y1 = cell.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    c = cell.crop((x0, y0, x1, y1))
    r = c.resize((max(1, round(c.width * K2)), max(1, round(c.height * K2))), Image.LANCZOS)
    ax = round((px - x0) * K2); ay = min(round((py - y0) * K2), r.height)
    id_ = cls if ONLY_MENTORS else 'master_' + cls
    r.save(os.path.join(out, id_ + '.webp'), 'WEBP', quality=92, method=6)
    json.dump({'id': id_, 'w': r.width, 'h': r.height, 'ax': ax, 'ay': ay, 'v': int(time.time())}, open(os.path.join(out, id_ + '.json'), 'w'))
    print(id_, r.size, 'âncora', ax, ay)
