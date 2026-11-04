"""Medalhão do ataque básico: aro original de cada classe (docs/art-direction/fontes-icones/atk-aros/) + arte nova do dono (folha-ataque-basico.jpg: espada, orbe, arco, maça) no miolo.
Uso: python tools/atk-medallion.py   (grava public/assets/icons/attack/atk-<classe>.webp, alfa; precisa de Pillow)"""
import os
from PIL import Image, ImageDraw, ImageFilter
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = os.path.join(root, 'docs/art-direction/fontes-icones/')
sheet = Image.open(src + 'folha-ataque-basico.jpg').convert('RGB')
# classe -> (centro x do círculo na folha, raio do miolo no aro em px do aro, raio do recorte na folha)
JOBS = {'warrior': (310, 208), 'mage': (770, 150), 'archer': (1230, 200), 'cleric': (1690, 152)}
CY, CROP = 545, 168
for cls, (cx, rad) in JOBS.items():
  ring = Image.open(src + f'atk-aros/atk-{cls}.webp').convert('RGBA')
  w, h = ring.size; r = rad * w / 512
  art = sheet.crop((cx - CROP, CY - CROP, cx + CROP, CY + CROP)).resize((int(2 * r), int(2 * r)), Image.LANCZOS).convert('RGBA')
  s = 4  # máscara em 4x para borda sem serrilhado
  m = Image.new('L', (art.width * s, art.height * s), 0); ImageDraw.Draw(m).ellipse((0, 0, m.width - 1, m.height - 1), fill=255)
  m = m.resize(art.size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
  # sombra interna suave: escurece a borda do miolo para encaixar no aro
  vig = Image.new('L', art.size, 0); ImageDraw.Draw(vig).ellipse((0, 0, art.width - 1, art.height - 1), outline=255, width=max(2, int(r * 0.07)))
  vig = vig.filter(ImageFilter.GaussianBlur(r * 0.05)).point(lambda v: int(v * 0.55))
  art = Image.composite(Image.new('RGBA', art.size, (10, 6, 4, 255)), art, vig); art.putalpha(m)
  out = ring.copy(); c = (w / 2, h / 2)
  out.alpha_composite(art, (round(c[0] - art.width / 2), round(c[1] - art.height / 2)))
  dest = os.path.join(root, 'public/assets/icons/attack', f'atk-{cls}.webp')
  out.save(dest, 'WEBP', quality=92, method=6); print(cls, out.size, os.path.getsize(dest))
