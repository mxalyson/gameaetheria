# Moldura de painel pintada (docs/art-direction/fontes-ui/painel-moldura-1.png) -> peças para o jogo:
#   public/assets/ui/panel-9.webp  (moldura sem a plaqueta, pronta para border-image 9 fatias)
#   public/assets/ui/plaque.webp   (plaqueta com asas, sobreposta ao centro do topo)
# Uso: python tools/ui-frame-from-sheet.py  (precisa de Pillow). As medidas foram ajustadas à mão sobre a imagem original.
from PIL import Image, ImageDraw
import os
root = os.path.join(os.path.dirname(__file__), '..')
src = Image.open(os.path.join(root, 'docs/art-direction/fontes-ui/painel-moldura-1.png')).convert('RGBA')
key = (255, 0, 255); t = src.convert('RGB')
for s in [(0, 0), (src.width - 1, 0), (0, src.height - 1), (src.width - 1, src.height - 1), (src.width // 2, 0), (src.width // 2, src.height - 1), (0, src.height // 2), (src.width - 1, src.height // 2)]:
    ImageDraw.floodfill(t, s, key, thresh=22)
a = Image.new('L', src.size, 255); px = t.load(); ap = a.load()
for y in range(src.height):
    for x in range(src.width):
        if px[x, y] == key: ap[x, y] = 0
cut = src.copy(); cut.putalpha(a); cut = cut.crop(a.getbbox())            # 894×521, com asas no topo
W, H = cut.size
plaque = cut.crop((190, 0, 706, 125)); plaque.save(os.path.join(root, 'public/assets/ui/plaque.webp'), 'WEBP', quality=94, method=6)
# faixa de cima sem plaqueta: usa a faixa de baixo espelhada (pedra por fora, ouro por dentro nos dois casos)
base = cut.copy(); clear = Image.new('RGBA', (625, 121), (0, 0, 0, 0)); base.paste(clear, (135, 0))
band = cut.crop((135, 440, 760, 521)).transpose(Image.FLIP_TOP_BOTTOM); base.alpha_composite(band, (135, 40))
base = base.crop((0, 40, W, H))                                           # tira a margem transparente (asas)
base.save(os.path.join(root, 'public/assets/ui/panel-9.webp'), 'WEBP', quality=94, method=6)
print('ok', base.size, plaque.size)
