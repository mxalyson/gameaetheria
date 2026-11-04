"""Atlas de VFX com os efeitos PINTADOS das folhas de IA do dono (docs/art-direction/fontes-vfx/vfx-folha-1.jpg e vfx-folha-2.jpg, branco sobre preto).
Determinístico: parte do kit procedural (tools/vfx-kit.py), SUBSTITUI os sprites que a folha cobre e mantém o resto (folhas, pedras, vento, cruz, bolha, fitas, brasas, brilho, anel, fiapos...).
Folha 3 (principal): gelo (cristais, espinhos, floco), luz (rays, burst, burst2, star8, spark, twinkle0..3), fumaça, impacto (shock, shock2, slash0..1), runas, chamas pequenas (flamelet0..3). Folha 2: raio (bolt0..2, 512 px) e fogo grande (flame0..3), mais detalhados que os da 3. Folha 1: só histórica (subconjunto da 3).
Cada sprite guarda INTENSIDADE (cinza) + ALFA (derivado do brilho; preto vira transparente, núcleo branco preservado) para a rampa por paleta do jogo.
Uso: python tools/vfx-sheet.py [--preview caminho.png]   (grava public/assets/vfx/vfx.webp + vfx.json; depois: node tools/bump-assets.mjs)"""
import importlib.util, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'art-direction', 'fontes-vfx')
OUT = os.path.join(ROOT, 'public', 'assets', 'vfx')
spec = importlib.util.spec_from_file_location('vfxkit', os.path.join(ROOT, 'tools', 'vfx-kit.py'))
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)
f32 = np.float32


def load(n):
    return np.asarray(Image.open(os.path.join(SRC, n)).convert('L'), f32)


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def region(im, box, thr=30, grow=5, keep=None):
    """Recorta box (x0,y0,x1,y1); mantém só o que está perto de conteúdo (corta vizinhos): devolve lum e máscara de pertencimento."""
    x0, y0, x1, y1 = box
    L = im[y0:y1, x0:x1].copy()
    m = ndi.binary_dilation(L > thr, iterations=grow)
    lab, n = ndi.label(m)
    if keep is not None and n:  # keep = 'largest' ou lista de índices por ordem de centroide x
        sizes = ndi.sum(m, lab, range(1, n + 1))
        if keep == 'largest':
            sel = [int(np.argmax(sizes)) + 1]
        elif isinstance(keep, tuple):  # ('size', k): k-ésimo componente por tamanho (0 = maior)
            sel = [int(np.argsort(-sizes)[keep[1]]) + 1]
        else:
            sel = [i + 1 for i in range(n) if sizes[i] > 200]
            sel.sort(key=lambda i: ndi.center_of_mass(m, lab, i)[1])
            sel = [sel[k] for k in keep]
        m = np.isin(lab, sel)
    return L, ndi.binary_dilation(m, iterations=3)


def to_IA(L, m, a=6, b=44, gamma=.8, norm=None):
    """luminância -> (intensidade, alfa). Alfa sobe rápido (não come ramos finos) e a intensidade é normalizada pelo núcleo."""
    A = ss(a, b, L) * m
    hi = np.percentile(L[(L > 60) & m], 99.5) if norm is None else norm
    I = np.clip(L / max(hi, 1), 0, 1) ** gamma
    return I.astype(f32), A.astype(f32)


def rot(I, A, deg):
    P = Image.fromarray(I * A, 'F').rotate(deg, Image.BICUBIC, expand=True)
    Q = Image.fromarray(A, 'F').rotate(deg, Image.BICUBIC, expand=True)
    P, Q = np.asarray(P), np.asarray(Q)
    return np.where(Q > 1e-3, P / np.maximum(Q, 1e-3), 0).astype(f32), Q.astype(f32)


def fit(I, A, cell, box, align=('c', 'c'), aniso=False):
    """Escala o conteúdo (bbox do alfa) para caber em box=(x,y,w,h) da célula (cw,ch), preservando proporção; resize em alfa pré-multiplicado."""
    ys, xs = np.where(A > 0.02)
    I, A = I[ys.min():ys.max() + 1, xs.min():xs.max() + 1], A[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = A.shape
    bx, by, bw, bh = box
    if aniso:
        nw, nh = bw, bh
    else:
        s = min(bw / w, bh / h)
        nw, nh = max(1, round(w * s)), max(1, round(h * s))
    P = np.asarray(Image.fromarray(I * A, 'F').resize((nw, nh), Image.LANCZOS))
    Q = np.clip(np.asarray(Image.fromarray(A, 'F').resize((nw, nh), Image.LANCZOS)), 0, 1)
    Ir = np.where(Q > 1e-3, np.clip(P / np.maximum(Q, 1e-3), 0, 1), 0)
    cw, ch = cell
    oI, oA = np.zeros((ch, cw), f32), np.zeros((ch, cw), f32)
    ox = bx + {'c': (bw - nw) // 2, 'l': 0, 'r': bw - nw}[align[0]]
    oy = by + {'c': (bh - nh) // 2, 't': 0, 'b': bh - nh}[align[1]]
    oI[oy:oy + nh, ox:ox + nw], oA[oy:oy + nh, ox:ox + nw] = Ir, Q
    return oI, oA


def put(name, IA, anchor=None):
    kit.S[name] = (IA[0], IA[1], anchor)


def build():
    kit.build()  # procedurais (base)
    s1, s2, s3 = load('vfx-folha-1.jpg'), load('vfx-folha-2.jpg'), load('vfx-folha-3.jpg')  # prioridade 3 > 2 > 1 (a 1 fica só de fonte histórica)

    # ---- FOGO (folha 2): 4 quadros 128x128, ponta para cima, base alinhada embaixo
    for i, box in enumerate([(55, 350, 195, 565), (314, 350, 452, 565), (566, 350, 710, 565), (828, 350, 962, 565)]):
        L, m = region(s2, box, 28, 4, 'largest')
        I, A = to_IA(L, m, 5, 40, .85)
        put(f'flame{i}', fit(I, A, (128, 128), (4, 2, 120, 124), ('c', 'b')), (64, 64))

    # chamas pequenas (folha 3): flamelet0..3
    for i, box in enumerate([(118, 12, 192, 122), (260, 10, 338, 122), (398, 8, 468, 122), (522, 12, 590, 118)]):
        L, m = region(s3, box, 28, 3, 'largest')
        put(f'flamelet{i}', fit(*to_IA(L, m, 5, 40, .85), (64, 64), (2, 1, 60, 62), ('c', 'b')), (32, 32))

    # ---- RAIO (folha 2): 3 relâmpagos 512x72, proporção ~8:1 (ramos finos preservados: alfa baixo, gama que levanta o brilho do halo)
    for i, box in enumerate([(66, 50, 962, 142), (60, 142, 962, 236), (60, 236, 962, 332)]):
        L, m = region(s2, box, 22, 3)
        m = ndi.binary_dilation(L > 12, iterations=2)
        if i == 2:
            L[80:, :190] = 0; m[80:, :190] = False  # título 'FOGO (ANIMAÇÃO)' invade o recorte
        I, A = to_IA(L, m, 4, 60, .6)
        put(f'bolt{i}', fit(I, A, (512, 72), (4, 2, 504, 68)), (256, 36))

    # ---- GELO (folha 3): 3 cristais (separados por componentes de alta luminância), espinhos de gelo (spikes) e floco
    L, m = region(s3, (598, 40, 790, 232), 30, 3)
    I, A = to_IA(L, m, 6, 44, .8)
    core = ndi.binary_opening(L > 70, iterations=2)
    lab, n = ndi.label(core)
    comps = sorted([i for i in range(1, n + 1) if (lab == i).sum() > 150], key=lambda i: ndi.center_of_mass(lab == i)[1])
    for k, i in enumerate(comps[:3]):
        own = ndi.binary_dilation(lab == i, iterations=9) & m
        for j in comps[:3]:
            if j != i:
                own &= ~ndi.binary_dilation(lab == j, iterations=2) | (lab == i)
        put(f'crystal{k}', fit(I, A * own, (112, 112), (5, 3, 102, 106)), (56, 56))
    L, m = region(s3, (770, 100, 892, 240), 30, 3, 'largest')
    put('spikes', fit(*to_IA(L, m, 6, 44, .8), (112, 112), (4, 6, 104, 102), ('c', 'b')), (56, 56))
    L, m = region(s3, (890, 30, 990, 140), 30, 4, 'largest')
    put('flake', fit(*to_IA(L, m, 6, 44, .8), (112, 112), (5, 5, 102, 102)), (56, 56))

    # ---- LUZ SAGRADA (folha 3): starburst + cintilas de vários tamanhos
    L, m = region(s3, (20, 268, 280, 515), 24, 4, 'largest')
    put('rays', fit(*to_IA(L, m, 5, 40, .8), (192, 192), (4, 4, 184, 184)), (96, 96))
    sp = {'spark': (296, 295, 412, 410, 96), 'star8': (376, 335, 498, 458, 96), 'twinkle0': (494, 276, 575, 354, 64), 'twinkle1': (494, 355, 576, 437, 64),
          'twinkle2': (302, 408, 392, 498, 64), 'twinkle3': (382, 446, 454, 520, 64)}
    for nme, (x0, y0, x1, y1, c) in sp.items():
        L, m = region(s3, (x0, y0, x1, y1), 24, 3, 'largest')
        put(nme, fit(*to_IA(L, m, 5, 40, .8), (c, c), (2, 2, c - 4, c - 4)), (c // 2, c // 2))

    # ---- VENENO / FUMAÇA (folha 3)
    for i, box in enumerate([(580, 280, 710, 500), (712, 285, 855, 500)]):
        L, m = region(s3, box, 26, 5, 'largest')
        put(f'wisp{i}', fit(*to_IA(L, m, 5, 40, .85), (112, 112), (4, 4, 104, 104)), (56, 56))
    for i, box in enumerate([(866, 298, 1006, 492), (1006, 305, 1167, 480), (1168, 305, 1352, 482)]):
        L, m = region(s3, box, 30, 4, 'largest')
        put(f'smoke{i}', fit(*to_IA(L, m, 6, 50, .9), (112, 112), (4, 4, 104, 104)), (56, 56))

    # ---- IMPACTO (folha 3): anel grande (shock), anel pequeno (shock2), estrela grande (burst), média (burst2), 2 cortes em meia-lua
    L, m = region(s3, (30, 538, 250, 758), 30, 4, 'largest')
    put('shock', fit(*to_IA(L, m, 6, 44, .8), (192, 192), (16, 16, 160, 160)), (96, 96))
    L, m = region(s3, (226, 484, 340, 600), 45, 1, 'largest')
    yy, xx = np.mgrid[0:L.shape[0], 0:L.shape[1]]
    m &= (xx + 226 - 283) ** 2 + (yy + 484 - 541) ** 2 < 62 ** 2  # só o anel (a ponta da estrela vizinha invade o recorte)
    put('shock2', fit(*to_IA(L, m, 6, 44, .8), (128, 128), (10, 10, 108, 108)), (64, 64))
    L, m = region(s3, (283, 540, 490, 720), 45, 1, 'largest')
    yy, xx = np.mgrid[0:L.shape[0], 0:L.shape[1]]
    m &= (xx - 0) ** 2 + (yy - 1) ** 2 > 64 ** 2  # fora do anel pequeno vizinho
    put('burst', fit(*to_IA(L, m, 5, 40, .8), (160, 160), (4, 4, 152, 152)), (80, 80))
    L, m = region(s3, (456, 486, 580, 610), 24, 3, 'largest')
    put('burst2', fit(*to_IA(L, m, 5, 40, .8), (112, 112), (4, 4, 104, 104)), (56, 56))
    for i, keep in enumerate([('size', 0), ('size', 1)]):
        L, m = region(s3, (515, 538, 866, 750), 40, 2, keep)
        I, A = to_IA(L, m, 6, 44, .8)
        ys, xs = np.where(A > 0.3)
        w_, v = np.linalg.eigh(np.cov(np.vstack([xs, ys])))
        ax = v[:, 1]
        ang = np.degrees(np.arctan2(ax[1], ax[0]))
        I2, A2 = rot(I, A, ang - 90)
        ys, xs = np.where(A2 > 0.3)
        top, bot = ys.min(), ys.max()
        ends_x = (xs[ys < top + 6].mean() + xs[ys > bot - 6].mean()) / 2
        if xs.mean() < ends_x:
            I2, A2 = rot(I2, A2, 180)
        put(f'slash{i}', fit(I2, A2, (128, 192), (24, 8, 100, 176), ('l', 'c'), aniso=True), (24, 96))

    # ---- RUNAS (folha 3): 2 círculos 192
    for i, box in enumerate([(900, 526, 1131, 756), (1134, 526, 1364, 756)]):
        L, m = region(s3, box, 24, 4, 'largest')
        put(f'rune{i}', fit(*to_IA(L, m, 5, 36, .8), (192, 192), (2, 2, 188, 188)), (96, 96))


kit.PREV.update({'spikes': 'ice', 'flamelet': 'fire', 'twinkle': 'gold', 'shock2': 'fire', 'burst2': 'fire'})


def main():
    build()
    atlas, meta, W, H = kit.pack()
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(atlas, 'RGBA').save(os.path.join(OUT, 'vfx.webp'), quality=92, alpha_quality=100, method=6)
    json.dump({'size': [W, H], 'sprites': meta}, open(os.path.join(OUT, 'vfx.json'), 'w'), separators=(',', ':'))
    print('atlas', W, H, 'MiB decodificado', round(W * H * 4 / 1048576, 2), 'webp bytes', os.path.getsize(os.path.join(OUT, 'vfx.webp')), 'sprites', len(meta))
    if '--preview' in sys.argv:
        kit.preview(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
