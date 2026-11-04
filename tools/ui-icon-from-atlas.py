# Recorta sprites 3D do atlas do cenário (public/assets/nature/meshy.webp + .json) e salva ícones de interface centralizados em public/assets/icons/ui/.
# Uso: python tools/ui-icon-from-atlas.py            (gera todos os ícones da lista ICONS)
#      python tools/ui-icon-from-atlas.py <sprite> <saida.webp> [lado=96]
# O ícone vai sem moldura: o medalhão pintado (assets/ui/medal-*.webp) é a moldura, feito em CSS. Sem arte de brasa/gelo própria, esses ficam de fora (ver docs/roadmap/pendencias.md).
import json, sys, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ATLAS = os.path.join(ROOT, 'public/assets/nature/meshy')
OUT = os.path.join(ROOT, 'public/assets/icons/ui')
# saída -> (sprite do atlas, lado em px, preenchimento da caixa 0..1)
ICONS = {
  'home': ('house_thatch', 96, 0.86),
  'save-point': ('crystal_2', 96, 0.9), # Pedra de Retorno: botão de interagir (touch.js)
  'zone-town': ('house_thatch', 64, 0.9),
  'zone-forest': ('cherry_1', 64, 0.9),
  'zone-plains': ('crystal_4', 64, 0.9),
  'zone-ruins': ('arch_broken', 64, 0.9),
  'zone-glacier': ('crystal_3', 64, 0.9),
}

def crop(atlas, meta, name, side, fill):
  s = meta['sprites'][name]
  im = atlas.crop((s['x'], s['y'], s['x'] + s['w'], s['y'] + s['h']))
  bb = im.getbbox()  # só os pixels desenhados (sem margem transparente)
  if bb: im = im.crop(bb)
  k = side * fill / max(im.size)
  im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
  out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
  out.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
  return out

def main():
  atlas = Image.open(ATLAS + '.webp').convert('RGBA'); meta = json.load(open(ATLAS + '.json'))
  os.makedirs(OUT, exist_ok=True)
  if len(sys.argv) >= 3:
    crop(atlas, meta, sys.argv[1], int(sys.argv[3]) if len(sys.argv) > 3 else 96, 0.9).save(sys.argv[2], 'WEBP', quality=90, method=6); return
  for name, (spr, side, fill) in ICONS.items():
    crop(atlas, meta, spr, side, fill).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6); print(name, '<-', spr)

main()
