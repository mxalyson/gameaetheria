# Recorta os retratos gerados (fundo verde #00ff00) -> public/assets/portraits/{npc-<id>,class-<classe>}.webp
# Uso: python tools/portraits-from-sheets.py <folha-6-npcs.jpg> <folha-4-classes.jpg>
# NPCs (3x2): guarda, Doran(arena), herbalista / mercadora, sábia, ferreiro. Classes (2x2): guerreiro, arqueiro / mago, clérigo.
import sys, os, shutil
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

root = os.path.join(os.path.dirname(__file__), '..')
out = os.path.join(root, 'public/assets/portraits'); os.makedirs(out, exist_ok=True)
src = os.path.join(root, 'docs/art-direction/fontes-icones'); os.makedirs(src, exist_ok=True)
H_OUT = 256  # o maior uso é ~64 css px; 256 cobre 3x e o cartão


def key(im):
    a = np.array(im.convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = 1 - np.clip((g - np.maximum(r, b) - 40) / 80.0, 0, 1)
    g2 = np.where(alpha < 0.999, np.minimum(g, np.maximum(r, b)), g)  # remove o halo verde
    return Image.fromarray(np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA'), alpha


def save(im, alpha, name):
    lab, n = ndi.label(ndi.binary_dilation(alpha > 0.5, iterations=10))
    big = 1 + int(np.argmax(ndi.sum(np.ones_like(lab), lab, range(1, n + 1))))
    keep = ndi.binary_dilation(lab == big, iterations=2)
    arr = np.array(im); arr[..., 3] = np.where(keep, arr[..., 3], 0)
    ys, xs = np.where(arr[..., 3] > 8)
    c = Image.fromarray(arr, 'RGBA').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = max(c.size); p = int(s * 0.04); sq = Image.new('RGBA', (s + 2 * p, s + 2 * p), (0, 0, 0, 0))
    sq.alpha_composite(c, (p + (s - c.width) // 2, p + (s - c.height) // 2))
    sq.resize((H_OUT, H_OUT), Image.LANCZOS).save(os.path.join(out, name + '.webp'), 'WEBP', quality=92, method=6)
    print(name, c.size)


def grid(path, cols, rows, names):
    im, al = key(Image.open(path)); H, W = al.shape
    for i, n in enumerate(names):
        r, c = divmod(i, cols)
        box = (c * W // cols, r * H // rows, (c + 1) * W // cols, (r + 1) * H // rows)
        save(im.crop(box), al[box[1]:box[3], box[0]:box[2]], n)


npcs, classes = sys.argv[1], sys.argv[2]
shutil.copy(npcs, os.path.join(src, 'retratos-npcs.jpg')); shutil.copy(classes, os.path.join(src, 'retratos-classes.jpg'))
grid(npcs, 3, 2, ['npc-guard', 'npc-arena', 'npc-herbalist', 'npc-merchant', 'npc-sage', 'npc-smith'])
grid(classes, 2, 2, ['class-warrior', 'class-archer', 'class-mage', 'class-cleric'])
