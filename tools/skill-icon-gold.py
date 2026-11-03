"""Ícones provisórios das 4 habilidades de Maestria: recolor leve + moldura dourada com brilho sobre um ícone pintado existente.
Uso: python tools/skill-icon-gold.py   (grava public/assets/icons/skills/<id>.webp)
Provisório: ícones próprios dependem de arte nova (prompts em docs/art-direction/prompts-icones-itens.md, seção Maestria)."""
import os
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'icons', 'skills')
# id novo -> (ícone base, matiz extra: multiplicadores R,G,B)
JOBS = {
  'colossus': ('charge', (1.10, 0.95, 0.80)),
  'meteor': ('fireball', (1.05, 0.90, 0.95)),
  'arrowstorm': ('rain', (1.35, 0.85, 0.55)),   # verde -> brasa
  'intervention': ('holylight', (1.05, 1.0, 0.9)),
}
GOLD, GOLD_DARK, GOLD_LIGHT = (255, 200, 70, 255), (150, 95, 15, 255), (255, 244, 190, 255)

def tint(im, mul):
  r, g, b, a = im.split()
  if mul[0] > 1.3: r, g = g, r  # verde -> laranja: troca os canais antes de ajustar
  r, g, b = (c.point(lambda v, m=m: min(255, int(v * m))) for c, m in zip((r, g, b), mul))
  return Image.merge('RGBA', (r, g, b, a))

def frame(size):
  # moldura dourada em camadas (sombra, ouro, fio claro) + cantos em losango
  f = Image.new('RGBA', (size, size), (0, 0, 0, 0))
  d = ImageDraw.Draw(f)
  rad = int(size * 0.17)
  for inset, w, col in ((2, 10, GOLD_DARK), (5, 7, GOLD), (8, 2, GOLD_LIGHT)):
    d.rounded_rectangle((inset, inset, size - 1 - inset, size - 1 - inset), radius=rad, outline=col, width=w)
  for cx, cy in ((10, 10), (size - 11, 10), (10, size - 11), (size - 11, size - 11)):
    d.polygon([(cx, cy - 9), (cx + 9, cy), (cx, cy + 9), (cx - 9, cy)], fill=GOLD, outline=GOLD_DARK)
  return f

for new, (base, mul) in JOBS.items():
  im = Image.open(os.path.join(ROOT, base + '.webp')).convert('RGBA')
  im = ImageEnhance.Color(tint(im, mul)).enhance(1.15)
  size = im.size[0]
  glow = frame(size).filter(ImageFilter.GaussianBlur(6))
  out = Image.alpha_composite(Image.new('RGBA', im.size, (0, 0, 0, 0)), glow)
  out = Image.alpha_composite(out, im)
  out = Image.alpha_composite(out, frame(size))
  out.save(os.path.join(ROOT, new + '.webp'), 'WEBP', quality=88, method=6)
  print(new, os.path.getsize(os.path.join(ROOT, new + '.webp')))
