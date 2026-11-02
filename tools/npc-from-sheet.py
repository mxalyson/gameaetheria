# Recorta os NPCs (e o golem) de uma folha 3D com fundo cinza liso -> public/assets/npcs/<id>.webp + .json (vista de frente, âncora nos pés).
# Uso: python tools/npc-from-sheet.py <folha.webp>   (ordem da esquerda p/ direita: golem, guarda, sábia, mercadora, Doran, ferreiro)
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

root = os.path.join(os.path.dirname(__file__), '..')
out = os.path.join(root, 'public/assets/npcs'); os.makedirs(out, exist_ok=True)
IDS = ['golem', 'guard', 'sage', 'merchant', 'arena', 'smith']
H_OUT = 220  # altura do maior personagem (px); os outros mantêm a proporção da folha

im = Image.open(sys.argv[1]).convert('RGB'); a = np.array(im).astype(np.float32); H, W, _ = a.shape
# 1) modelo do fundo: média ponderada (convolução normalizada) dos pixels que certamente são fundo (faixas livres), depois refinada com o que ficou perto do modelo
seed = np.zeros((H, W), bool); seed[:40] = True; seed[:, :25] = True; seed[:, -25:] = True; seed[760:] = True; seed[:, :0] = True
seed[820:, 1500:] = False  # marca d'água
def model(m):
    num = np.stack([ndi.gaussian_filter(a[..., c] * m, 40) for c in range(3)], -1); den = ndi.gaussian_filter(m.astype(np.float32), 40)[..., None]
    return num / np.maximum(den, 1e-4)
bg = model(seed)
for _ in range(3):
    d = np.abs(a - bg).max(-1)
    bg = model((d < 10) & (ndi.binary_erosion(d < 10, iterations=3)))
d = np.abs(a - bg).max(-1)
fg = d > 16
ratio = a / np.maximum(bg, 1); spread = ratio.max(-1) - ratio.min(-1)
# a sombra do chão fica abaixo/ao lado dos pés: corta tudo abaixo da última linha que ainda difere MUITO do fundo (dentro de cada faixa)
fg = ndi.binary_opening(fg, iterations=2); fg = ndi.binary_closing(fg, iterations=2); fg = ndi.binary_fill_holes(fg)
fg[820:, 1500:] = False
Image.fromarray((fg * 255).astype(np.uint8)).save(os.path.join(root, 'test-results/npc/mask.png'))
# um recorte por faixa vertical da folha (limites entre os personagens); em cada faixa fica só o maior objeto
CUTS = [0, 540, 860, 1160, 1440, 1670, W]
big = []
for k in range(6):
    sl = np.zeros_like(fg); sl[:, CUTS[k]:CUTS[k + 1]] = fg[:, CUTS[k]:CUTS[k + 1]]
    strong = np.zeros_like(fg); strong[:, CUTS[k]:CUTS[k + 1]] = d[:, CUTS[k]:CUTS[k + 1]] > 48
    foot = np.where(strong.any(1))[0].max(); sl[foot + 3:] = False
    # sombra projetada: cinza neutro (mesma razão nos 3 canais) só nas últimas linhas acima dos pés
    sh = (spread < 0.115) & (ratio.mean(-1) > 0.62) & (ratio.mean(-1) < 0.99) & (a.mean(-1) > 115); sh[:foot - 45] = False
    sl &= ~ndi.binary_dilation(sh, iterations=1)
    sl = ndi.binary_opening(sl, iterations=2)
    l2, n2 = ndi.label(ndi.binary_dilation(sl, iterations=4)); sz = ndi.sum(np.ones_like(l2), l2, range(1, n2 + 1))
    big.append(ndi.binary_dilation(sl, iterations=1) & (l2 == 1 + int(np.argmax(sz))))
sheet = []
for id_, m in zip(IDS, big):
    ys, xs = np.where(m)
    # remove a sombra do chão: abaixo de 97% da altura, só o que é bem mais escuro/colorido que o fundo
    alpha = ndi.gaussian_filter(m.astype(np.float32), 0.8)
    rgba = np.dstack([a.clip(0, 255), alpha * 255]).astype(np.uint8)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    c = Image.fromarray(rgba, 'RGBA').crop((x0, y0, x1, y1)); sheet.append((id_, c, x1 - x0, y1 - y0))
    print(id_, c.size)
hmax = max(h for *_, h in sheet); k = H_OUT / hmax
for id_, c, w, h in sheet:
    r = c.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS); r.save(os.path.join(out, id_ + '.webp'), 'WEBP', quality=90, method=6)
    json.dump({'id': id_, 'w': r.width, 'h': r.height, 'ax': r.width // 2, 'ay': r.height - 2, 'v': int(__import__('time').time())}, open(os.path.join(out, id_ + '.json'), 'w'))
Image.open(sys.argv[1]).save(os.path.join(root, 'docs/art-direction/fontes-icones/npcs-folha.png')) if os.path.isdir(os.path.join(root, 'docs/art-direction/fontes-icones')) else None
