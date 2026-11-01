# Recorta os spirits gerados (fundo verde #00ff00) -> public/assets/icons/spirit/spirit-<tipo>.webp (forma 1), -2.webp (forma evoluída) e spirit-egg.webp
# Uso: python tools/spirit-icons-from-images.py <ember.jpg> <undine.jpg> <terra.jpg> <zephyr.jpg> <ovo.jpg> <folha-4-evoluidos.jpg>
# A folha dos evoluídos segue a ordem: fogo (alto-esq), água (alto-dir), terra (baixo-esq), vento (baixo-dir).
import sys, os, shutil
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

root = os.path.join(os.path.dirname(__file__), '..')
out = os.path.join(root, 'public/assets/icons/spirit'); os.makedirs(out, exist_ok=True)
src = os.path.join(root, 'docs/art-direction/fontes-icones'); os.makedirs(src, exist_ok=True)
SIZE = 192  # a menor exibição é ~40 px css; 192 cobre 3x e o cartão grande


def key(im):
    a = np.array(im.convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = 1 - np.clip((g - np.maximum(r, b) - 40) / 80.0, 0, 1)
    g2 = np.where(alpha < 0.999, np.minimum(g, np.maximum(r, b)), g)  # tira o halo verde das bordas
    return Image.fromarray(np.dstack([r, g2, b, (alpha * 255)]).clip(0, 255).astype(np.uint8), 'RGBA'), alpha


def save(im, alpha, name):
    # une o corpo e as partículas próximas (dilatação) e fica com o maior grupo; descarta o resto do quadro
    lab, n = ndi.label(ndi.binary_dilation(alpha > 0.5, iterations=14))
    if n == 0: print('vazio', name); return
    big = 1 + int(np.argmax(ndi.sum(np.ones_like(lab), lab, range(1, n + 1))))
    keep = ndi.binary_dilation(lab == big, iterations=2)
    arr = np.array(im); arr[..., 3] = np.where(keep, arr[..., 3], 0)
    ys, xs = np.where(arr[..., 3] > 8)
    c = Image.fromarray(arr, 'RGBA').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = max(c.size); p = int(s * 0.06); sq = Image.new('RGBA', (s + 2 * p, s + 2 * p), (0, 0, 0, 0))
    sq.alpha_composite(c, (p + (s - c.width) // 2, p + (s - c.height) // 2))
    sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, name + '.webp'), 'WEBP', quality=92, method=6)
    print(name, c.size)


ember, undine, terra, zephyr, egg, sheet = sys.argv[1:7]
for f, n in ((ember, 'ember'), (undine, 'undine'), (terra, 'terra'), (zephyr, 'zephyr'), (egg, 'egg')):
    shutil.copy(f, os.path.join(src, f'spirit-{n}.jpg'))
    im, al = key(Image.open(f)); save(im, al, f'spirit-{n}')
shutil.copy(sheet, os.path.join(src, 'spirits-evoluidos.jpg'))
im, al = key(Image.open(sheet)); H, W = al.shape
for n, (y0, x0) in {'ember': (0, 0), 'undine': (0, 1), 'terra': (1, 0), 'zephyr': (1, 1)}.items():
    ys, xs = slice(y0 * H // 2, (y0 + 1) * H // 2), slice(x0 * W // 2, (x0 + 1) * W // 2)
    save(im.crop((xs.start, ys.start, xs.stop, ys.stop)), al[ys, xs], f'spirit-{n}-2')
