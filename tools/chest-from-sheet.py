# Recorta o baú pintado da folha de itens (docs/art-direction/fontes-icones/itens-consumiveis.jpg, fundo verde) e grava o sprite do mundo:
#   public/assets/props/chest.webp  (baú fechado, fundo transparente, base na borda de baixo, 160 px de largura)
# Uso: python tools/chest-from-sheet.py
# Não existe arte de baú ABERTO (a folha só tem baús fechados): o jogo escurece este mesmo sprite para o baú já saqueado (ver docs/roadmap/pendencias.md).
import os
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
im = Image.open(os.path.join(ROOT, 'docs/art-direction/fontes-icones/itens-consumiveis.jpg')).convert('RGB')
box = (20, 335, 385, 655)  # primeiro baú da folha
c = im.crop(box); px = c.load(); out = Image.new('RGBA', c.size)
po = out.load()
for y in range(c.height):
  for x in range(c.width):
    r, g, b = px[x, y]
    gr = g - max(r, b)  # quão "verde puro" é o pixel (chroma key)
    a = 1.0 if gr < 20 else max(0.0, 1 - (gr - 20) / 60)
    if a < 1: g = min(g, max(r, b) + 8)  # tira o respingo verde da borda
    po[x, y] = (r, g, b, int(255 * a))
bb = out.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
out = out.crop(bb)
k = 160 / out.width
out = out.resize((160, round(out.height * k)), Image.LANCZOS)
os.makedirs(os.path.join(ROOT, 'public/assets/props'), exist_ok=True)
out.save(os.path.join(ROOT, 'public/assets/props/chest.webp'), 'WEBP', quality=90, method=6)
print('chest.webp', out.size)
