# Gera variantes tingidas de recortes pintados da UI (sem arte nova do zero):
#   vial-xp.webp  = frasco azul (vial-mp) girado para ouro/violeta, para a barra de XP não parecer mana
#   zone-ember.webp = ícone das Ruínas tingido de brasa (Cinzas Ardentes)
# Uso: python tools/ui-tint.py   (rodar na raiz do projeto)
import colorsys
from PIL import Image, ImageOps

def hue_shift(im, to_h, sat_mul=1.0, val_mul=1.0):
    im = im.convert('RGBA'); px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0: continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < 0.12:  # vidro/brilho neutro fica como está
                continue
            r2, g2, b2 = colorsys.hsv_to_rgb(to_h, min(1, s * sat_mul), min(1, v * val_mul))
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return im

xp = hue_shift(Image.open('public/assets/ui/vial-mp.webp'), 0.12, 1.05, 1.08)  # ouro quente
xp.save('public/assets/ui/vial-xp.webp', quality=92, method=6)

ruins = Image.open('public/assets/icons/ui/zone-ruins.webp').convert('RGBA')
a = ruins.getchannel('A')
grey = ImageOps.autocontrast(ruins.convert('L'))
col = ImageOps.colorize(grey, black=(28, 4, 2), mid=(214, 74, 22), white=(255, 214, 120), midpoint=120).convert('RGBA')
col.putalpha(a)
col.save('public/assets/icons/ui/zone-ember.webp', quality=92, method=6)
print('ok')

# porto (cidade nova): casa da Vila girada para azul-petróleo
harbor = hue_shift(Image.open('public/assets/icons/ui/zone-town.webp'), 0.53, 1.1, 1.0)
harbor.save('public/assets/icons/ui/zone-harbor.webp', quality=92, method=6)
