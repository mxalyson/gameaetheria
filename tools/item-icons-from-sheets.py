# Recorta os ícones de equipamento das folhas geradas (fundo verde #00ff00) -> public/assets/icons/item/item-<tipo>.webp
# Uso: python tools/item-icons-from-sheets.py <folha-espada.jpg> <folha-8-itens.jpg>
# Fontes ficam em docs/art-direction/fontes-icones/ (copiadas por este script).
import sys, os, shutil
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

root = os.path.join(os.path.dirname(__file__), '..')
out = os.path.join(root, 'public/assets/icons/item'); os.makedirs(out, exist_ok=True)
src = os.path.join(root, 'docs/art-direction/fontes-icones'); os.makedirs(src, exist_ok=True)
MAXPX = 168  # a célula do jogo tem até 56 px css; 3x para telas densas


def key(im):
    a = np.array(im.convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = np.clip((g - np.maximum(r, b) - 40) / 80.0, 0, 1)  # 0 = objeto, 1 = fundo
    alpha = 1 - green
    # remove o halo verde nas bordas (despill): limita G ao maior de R/B
    gg = np.minimum(g, np.maximum(r, b) + 12 * (1 - alpha) * 0)
    rgb = np.stack([r, np.where(alpha < 0.999, np.minimum(g, np.maximum(r, b)), g), b], -1).clip(0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA'), alpha


def crop_save(im, mask, name, pad=0.06):
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    c = im.crop((x0, y0, x1, y1))
    # zera os pixels de outros objetos que cabem na caixa
    m = np.array(Image.fromarray((mask[y0:y1, x0:x1] * 255).astype(np.uint8)).filter(__import__('PIL.ImageFilter', fromlist=['x']).MaxFilter(5)))
    arr = np.array(c); arr[..., 3] = np.where(m > 0, arr[..., 3], 0); c = Image.fromarray(arr, 'RGBA')
    s = max(c.size); p = int(s * pad); sq = Image.new('RGBA', (s + 2 * p, s + 2 * p), (0, 0, 0, 0))
    sq.alpha_composite(c, (p + (s - c.width) // 2, p + (s - c.height) // 2))
    sq = sq.resize((MAXPX, MAXPX), Image.LANCZOS)
    sq.save(os.path.join(out, f'item-{name}.webp'), 'WEBP', quality=92, method=6)
    print(name, c.size, '->', MAXPX)


sword, sheet = sys.argv[1], sys.argv[2]
shutil.copy(sword, os.path.join(src, 'item-sword.jpg')); shutil.copy(sheet, os.path.join(src, 'itens-equipamentos.jpg'))

im, al = key(Image.open(sword)); crop_save(im, al > 0.5, 'sword')

im, al = key(Image.open(sheet))
solid = ndi.binary_closing(al > 0.5, iterations=3)
lab, n = ndi.label(ndi.binary_dilation(solid, iterations=3))
H, W = al.shape
rows = []
for i in range(1, n + 1):
    m = lab == i
    if m.sum() < 4000: continue
    ys, xs = np.where(m); rows.append((i, xs.mean() / W, ys.mean() / H, m.sum()))


def pick(cond):
    c = [r for r in rows if cond(r)]
    return c[0][0] if c else None


names = {}
names['staff'] = pick(lambda r: r[2] < 0.5 and r[1] < 0.3)
names['bow'] = pick(lambda r: r[2] < 0.55 and 0.3 <= r[1] < 0.6)
names['mace'] = pick(lambda r: r[2] < 0.42 and r[1] >= 0.5)
names['helm'] = pick(lambda r: 0.42 <= r[2] < 0.65 and r[1] >= 0.75)
names['armor'] = pick(lambda r: r[2] >= 0.6 and r[1] < 0.3)
names['boots'] = pick(lambda r: r[2] >= 0.6 and 0.3 <= r[1] < 0.52)
names['ring'] = pick(lambda r: r[2] >= 0.6 and 0.52 <= r[1] < 0.8)
names['amulet'] = pick(lambda r: r[2] >= 0.55 and r[1] >= 0.78)
print('componentes', [(r[0], round(r[1], 2), round(r[2], 2)) for r in rows], names)
for k, i in names.items():
    if i is None: print('FALTOU', k); continue
    crop_save(im, (lab == i) & (al > 0.05), k)
