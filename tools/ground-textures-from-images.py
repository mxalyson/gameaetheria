# Prepara as texturas de chão geradas por IA: torna cada uma SEM EMENDA (mistura com a própria cópia deslocada) e reduz para o peso de celular.
# Saída: public/assets/ground/{forest,plains,ruins,town,water-lake,water-crystal,sand-dirt,sand-plains,slabs}.webp
# Uso: python tools/ground-textures-from-images.py <pasta-com-31.jpg..40.jpg>   (ordem: floresta, vila, trilha-terra, trilha-lajes, planície, ruínas, margem, água A, terra B, água B)
import sys, os, shutil
import numpy as np
from PIL import Image

root = os.path.join(os.path.dirname(__file__), '..')
out = os.path.join(root, 'public/assets/ground'); os.makedirs(out, exist_ok=True)
src = os.path.join(root, 'docs/art-direction/fontes-cenario'); os.makedirs(src, exist_ok=True)
D = sys.argv[1]


def seamless(a, wx=True, wy=True):
    """Janela 0 nas bordas e 1 no centro; a cópia deslocada de meia largura cobre as bordas -> as bordas opostas ficam iguais."""
    h, w, _ = a.shape
    wxv = np.sin(np.pi * (np.arange(w) + 0.5) / w) ** 2 if wx else np.ones(w)
    wyv = np.sin(np.pi * (np.arange(h) + 0.5) / h) ** 2 if wy else np.ones(h)
    win = (wyv[:, None] * wxv[None, :])[..., None]
    rolled = np.roll(np.roll(a, h // 2 if wy else 0, axis=0), w // 2 if wx else 0, axis=1)
    return a * win + rolled * (1 - win)


def load(n): return np.array(Image.open(os.path.join(D, f'{n}.jpg')).convert('RGB')).astype(np.float32)


def save(a, name, size=None, q=82):
    im = Image.fromarray(a.clip(0, 255).astype(np.uint8))
    if size: im = im.resize(size, Image.LANCZOS)
    im.save(os.path.join(out, name + '.webp'), 'WEBP', quality=q, method=6)
    print(name, im.size, round(os.path.getsize(os.path.join(out, name + '.webp')) / 1024), 'KB')


for n, name in ((31, 'forest'), (35, 'plains'), (36, 'ruins'), (32, 'town'), (40, 'water-lake'), (38, 'water-crystal')):
    shutil.copy(os.path.join(D, f'{n}.jpg'), os.path.join(src, f'chao-{name}.jpg'))
    save(seamless(load(n)), name, (512, 512))
# faixas de trilha: recorta a parte central (o caminho, sem as bordas de grama) e deixa sem emenda nos dois eixos
for n, name, r0, r1 in ((33, 'sand-dirt', 70, 190), (39, 'sand-plains', 70, 190), (34, 'slabs', 60, 200)):
    shutil.copy(os.path.join(D, f'{n}.jpg'), os.path.join(src, f'chao-{name}.jpg'))
    save(seamless(load(n)[r0:r1]), name, (640, int(640 * (r1 - r0) / 1024)))
shutil.copy(os.path.join(D, '37.jpg'), os.path.join(src, 'chao-shore.jpg'))  # margem: guardada, ainda sem uso
