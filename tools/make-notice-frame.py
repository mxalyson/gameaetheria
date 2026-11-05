# Moldura dos avisos laterais (public/assets/ui/notice.webp): a mesma moldura pintada dos avisos do centro (tip.webp), sem a seta de baixo
# (a seta é de balão de dica; esticada num aviso pequeno ficava torta). Copia um trecho liso da borda de baixo por cima da seta e corta a sobra.
# Uso: python tools/make-notice-frame.py  (depois: node tools/bump-assets.mjs)
from PIL import Image
src = Image.open('public/assets/ui/tip.webp').convert('RGBA')
w, h = src.size
BOTTOM = 180                               # a moldura (sem a seta) termina aqui
out = src.crop((0, 0, w, BOTTOM)).copy()
seg = src.crop((70, 120, 110, BOTTOM))     # trecho liso da borda de baixo (40 px), à esquerda da seta
for x in range(100, 182, 40): out.paste(seg, (x, 120))
out.save('public/assets/ui/notice.webp', 'WEBP', quality=92, method=6)
print('gerado public/assets/ui/notice.webp', out.size)
