# Ícone do botão de chat no mesmo aro dos ícones do menu (assets/icons/menu): reaproveita o aro de bronze com rubi de menu-party.webp,
# repinta o miolo azul-escuro e desenha um balão de fala em pergaminho (tons do menu-map). Gera public/assets/icons/menu/menu-chat.webp.
# Uso: python tools/make-chat-icon.py  (depois: node tools/bump-assets.mjs)
from PIL import Image, ImageDraw, ImageFilter
import math

SRC = 'public/assets/icons/menu/menu-party.webp'
OUT = 'public/assets/icons/menu/menu-chat.webp'
base = Image.open(SRC).convert('RGBA')
W, H = base.size
CX, CY, R = 129, 136, 84          # miolo do aro (medido nos ícones do menu)
K = 4                             # desenha em 4x e reduz (bordas lisas)

# 1) miolo: degradê radial azul-escuro como o dos outros ícones
inner = Image.new('RGBA', (W * K, H * K), (0, 0, 0, 0))
d = ImageDraw.Draw(inner)
for i in range(R * K, 0, -2):
    t = i / (R * K)
    c = (int(18 + 14 * (1 - t)), int(24 + 16 * (1 - t)), int(38 + 20 * (1 - t)), 255)
    d.ellipse([CX * K - i, CY * K - i, CX * K + i, CY * K + i], fill=c)

# 2) balão de fala em pergaminho com sombra, contorno marrom e brilho
def bubble(draw, ox, oy, fill, outline=None, width=0):
    x0, y0, x1, y1 = (CX - 56) * K + ox, (CY - 46) * K + oy, (CX + 56) * K + ox, (CY + 30) * K + oy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=26 * K, fill=fill, outline=outline, width=width)
    tail = [((CX - 30) * K + ox, (CY + 22) * K + oy), ((CX - 6) * K + ox, (CY + 26) * K + oy), ((CX - 40) * K + ox, (CY + 52) * K + oy)]
    draw.polygon(tail, fill=fill, outline=outline)
    if width:
        draw.line([tail[0], tail[2], tail[1]], fill=outline, width=width, joint='curve')

shadow = Image.new('RGBA', inner.size, (0, 0, 0, 0))
bubble(ImageDraw.Draw(shadow), 5 * K, 7 * K, (0, 0, 0, 150))
inner.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5 * K)))
paper = Image.new('RGBA', inner.size, (0, 0, 0, 0))
bubble(ImageDraw.Draw(paper), 0, 0, (236, 214, 160, 255), (92, 58, 28, 255), 5 * K)
# degradê do pergaminho: mais claro em cima, tostado embaixo (como o mapa)
grad = Image.new('RGBA', inner.size, (0, 0, 0, 0)); g = ImageDraw.Draw(grad)
for y in range(inner.size[1]):
    t = min(1, max(0, (y / K - (CY - 46)) / 98))
    g.line([(0, y), (inner.size[0], y)], fill=(255, 246, 214, int(90 * (1 - t))) if t < .5 else (150, 104, 52, int(110 * (t - .5) * 2)))
mask = paper.split()[3]
tone = Image.composite(grad, Image.new('RGBA', inner.size, (0, 0, 0, 0)), mask)
paper.alpha_composite(tone)
inner.alpha_composite(paper)
# três pontos (marrom do contorno) e um brilho no canto
dd = ImageDraw.Draw(inner)
for dx in (-26, 0, 26):
    x, y, r = (CX + dx) * K, (CY - 8) * K, 9 * K
    dd.ellipse([x - r, y - r, x + r, y + r], fill=(92, 58, 28, 255))
    dd.ellipse([x - r // 2.4, y - r // 1.6, x + r // 6, y - r // 6], fill=(170, 120, 70, 255))
dd.arc([(CX - 46) * K, (CY - 40) * K, (CX + 10) * K, (CY + 4) * K], 185, 245, fill=(255, 250, 230, 200), width=4 * K)

small = inner.resize((W, H), Image.LANCZOS)
# 3) só o miolo muda: fora do raio fica o aro original (bronze + rubi)
circle = Image.new('L', (W, H), 0)
ImageDraw.Draw(circle).ellipse([CX - R, CY - R, CX + R, CY + R], fill=255)
circle = circle.filter(ImageFilter.GaussianBlur(1.2))
out = Image.composite(small, base, circle)
out.save(OUT, 'WEBP', quality=92, method=6)
print('gerado', OUT, out.size)
