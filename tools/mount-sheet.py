"""Montarias a partir da folha do dono (docs/art-direction/fontes-montarias/montarias-folha-1.jpg: lobo, cavalo e grifo em 3 poses de asas, fundo BRANCO com sombra).
Recorta cada montaria, remove o fundo e a sombra do chão (preenchimento a partir da borda: o contorno escuro da arte barra o vazamento; buracos fechados
entre pernas/cauda/crina são removidos se forem claros e lisos), limpa a borda (sem halo branco: a cor das bordas vem do interior) e grava
  public/assets/mounts/<id>.webp        (alta, ~256 px no maior lado do quadro)   + <id>-lo.webp (baixa, ~160 px)
  public/assets/mounts/<id>.json        (quadros e âncoras em FRAÇÃO do quadro: valem para as duas resoluções)
Grifo: 3 quadros lado a lado (asas abertas, erguidas, fechadas) alinhados pelo corpo. Lobo e cavalo: 1 quadro. Todos olham para a direita (a esquerda é espelho no jogo).
Determinístico. Uso: python tools/mount-sheet.py [--preview pasta]   (depois: node tools/bump-assets.mjs). Precisa de Pillow, numpy, scipy."""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'art-direction', 'fontes-montarias', 'montarias-folha-1.jpg')
OUT = os.path.join(ROOT, 'public', 'assets', 'mounts')
HI, LO = 256, 160
PAD = 6

# caixas de recorte na folha (x0, y0, x1, y1)
BOXES = {
    'wolf': [(180, 40, 850, 606)],       # patas vão até y~600; a asa do grifo vizinho começa em y~606
    'horse': [(1200, 20, 1830, 640)],    # cascos chegam a y~620
    'gryphon': [(50, 590, 660, 1100), (730, 480, 1300, 1100), (1370, 650, 1900, 1100)],
}
# retângulos apagados (branco) na folha antes do recorte: pontas de asa do grifo vizinho que invadem o cavalo
ERASE = {'horse': [(1190, 470, 1296, 660)]}
# âncoras medidas na folha (coordenadas da folha): pés = centro da base das patas no chão; sela = onde o herói senta
ANCH = {
    'wolf': {'feet': (520, 540), 'seat': (500, 235), 'shadow': (500, 545, 230, 40)},
    'horse': {'feet': (1510, 570), 'seat': (1560, 262), 'shadow': (1520, 575, 190, 34)},
    # grifo: âncoras do quadro 3 (fechado); os outros quadros são alinhados a ele
    'gryphon': {'feet': (1640, 1060), 'seat': (1640, 770), 'shadow': (1640, 1065, 220, 36)},
}


def bg_mask(rgb):
    """Pixels 'de fundo' (claros e pouco saturados: branco e sombra suave do chão)."""
    mx = rgb.max(2).astype(np.float32); mn = rgb.min(2).astype(np.float32)
    lum = rgb.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    sat = (mx - mn) / np.maximum(mx, 1)
    return (lum > 196) & (sat < 0.075)


def cut(rgb):
    """Devolve (rgb_limpo, alfa_float) do recorte."""
    h, w = rgb.shape[:2]
    bg = bg_mask(rgb)
    lab, n = ndi.label(bg)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])); border = border[border > 0]
    outside = np.isin(lab, border)
    fg = ~outside
    # buracos fechados: componentes de fundo que não tocam a borda; só saem se forem grandes e quase brancos puros (entre pernas, cauda e crina)
    cnt = np.bincount(lab.ravel(), minlength=n + 1)
    bset = set(border.tolist())
    big = [i for i in range(1, n + 1) if cnt[i] >= 160 and i not in bset]  # só componentes grandes (o resto é ruído do JPEG)
    for i in big:
        comp = lab == i
        if rgb[comp].astype(np.float32).mean(0).min() > 238: fg &= ~comp
    # fecha pequenas lacunas e remove ilhas soltas (restos da sombra)
    fg = ndi.binary_opening(fg, iterations=1)
    lab2, n2 = ndi.label(fg)
    if n2 > 1:
        sizes = ndi.sum(fg, lab2, range(1, n2 + 1)); keep = [i + 1 for i, s in enumerate(sizes) if s > 0.015 * sizes.max()]
        fg = np.isin(lab2, keep)
    core = ndi.binary_erosion(fg, iterations=2)
    # cor das bordas vem do interior: preenche tudo fora do núcleo com a cor do pixel de núcleo mais próximo
    idx = ndi.distance_transform_edt(~core, return_distances=False, return_indices=True)
    clean = rgb[idx[0], idx[1]]
    # alfa: máscara em 1 px de erosão (corta o anel claro do antialias) e suavizada
    m = ndi.binary_erosion(fg, iterations=1).astype(np.float32)
    a = ndi.gaussian_filter(m, 0.8)
    a = np.clip((a - 0.25) / 0.6, 0, 1)
    return clean, a


def bbox(a, thr=0.05):
    ys, xs = np.where(a > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def shift_to_match(ref, mov, region, rad=14, step=4):
    """Acha (dx, dy) em px que, aplicado a `mov`, casa com `ref` na região (y0,y1,x0,x1). Busca grossa em máscaras reduzidas e refino fino."""
    y0, y1, x0, x1 = region
    r = ref[y0:y1, x0:x1] > 0.5

    def score(dx, dy):
        m = np.roll(np.roll(mov, dy, 0), dx, 1)[y0:y1, x0:x1] > 0.5
        return (r & m).sum() / max(1, (r | m).sum())
    best, bd = -1, (0, 0)
    for dy in range(-rad * step, rad * step + 1, step):
        for dx in range(-rad * step, rad * step + 1, step):
            sc = score(dx, dy)
            if sc > best: best, bd = sc, (dx, dy)
    cx, cy = bd
    for dy in range(cy - step, cy + step + 1):
        for dx in range(cx - step, cx + step + 1):
            sc = score(dx, dy)
            if sc > best: best, bd = sc, (dx, dy)
    return bd


def main():
    prev = None
    if '--preview' in sys.argv: prev = sys.argv[sys.argv.index('--preview') + 1]; os.makedirs(prev, exist_ok=True)
    sheet = np.asarray(Image.open(SRC).convert('RGB'))
    os.makedirs(OUT, exist_ok=True)
    for mid, boxes in BOXES.items():
        frames = []  # (rgb, alfa, box)
        for bx in boxes:
            x0, y0, x1, y1 = bx
            crop = sheet[y0:y1, x0:x1].copy()
            for ex0, ey0, ex1, ey1 in ERASE.get(mid, []):
                crop[max(0, ey0 - y0):max(0, ey1 - y0), max(0, ex0 - x0):max(0, ex1 - x0)] = 255
            rgb, a = cut(crop)
            frames.append((rgb, a, bx))
        anc = ANCH[mid]
        # canvas comum em coordenadas da folha: alinha quadros do grifo pelo corpo (região baixa: patas e peito)
        if len(frames) > 1:
            ref_i = len(frames) - 1
            # canvas local (cobre a união das caixas), em coordenadas da folha
            gx0 = min(f[2][0] for f in frames); gy0 = min(f[2][1] for f in frames)
            gx1 = max(f[2][2] for f in frames); gy1 = max(f[2][3] for f in frames)
            gx0 -= 400; gy0 -= 200; gx1 += 400; gy1 += 200  # folga para os deslocamentos não darem a volta
            GW, GH = gx1 - gx0, gy1 - gy0
            full = []
            for rgb, a, (x0, y0, x1, y1) in frames:
                A = np.zeros((GH, GW), np.float32); R = np.zeros((GH, GW, 3), np.uint8)
                A[y0 - gy0:y1 - gy0, x0 - gx0:x1 - gx0] = a; R[y0 - gy0:y1 - gy0, x0 - gx0:x1 - gx0] = rgb; full.append([R, A])
            refA = full[ref_i][1]
            fx0, fy0, fx1, fy1 = frames[ref_i][2]
            reg = (fy0 - gy0 + int((fy1 - fy0) * 0.55), fy1 - gy0, fx0 - gx0, fx1 - gx0)
            for i in range(len(full) - 1):
                R, A = full[i]
                def lowfront(A):  # base (garras) e frente da metade baixa (garras da frente)
                    ys, xs = np.where(A > 0.5); yb = ys.max(); low = A[yb - 120:yb] > 0.5
                    return yb, np.where(low)[1].max()
                yr, xr = lowfront(refA); ym, xm = lowfront(A)
                dx0, dy0 = int(xr - xm), int(yr - ym)
                A0 = np.roll(np.roll(A, dy0, 0), dx0, 1)
                dx, dy = shift_to_match(refA, A0, reg)
                sx, sy = dx0 + dx, dy0 + dy
                full[i][0] = np.roll(np.roll(R, sy, 0), sx, 1); full[i][1] = np.roll(np.roll(A, sy, 0), sx, 1)
                print(mid, 'quadro', i, 'desloca', (sx, sy))
            ux0 = min(bbox(A)[0] for _, A in full); uy0 = min(bbox(A)[1] for _, A in full)
            ux1 = max(bbox(A)[2] for _, A in full); uy1 = max(bbox(A)[3] for _, A in full)
            crops = [(R[uy0:uy1, ux0:ux1], A[uy0:uy1, ux0:ux1]) for R, A in full]
            org = (ux0 + gx0, uy0 + gy0)
        else:
            rgb, a, (x0, y0, x1, y1) = frames[0]
            bx0, by0, bx1, by1 = bbox(a)
            crops = [(rgb[by0:by1, bx0:bx1], a[by0:by1, bx0:bx1])]
            org = (x0 + bx0, y0 + by0)
        ch, cw = crops[0][1].shape
        # moldura com PAD e escala para HI/LO no maior lado da CÉLULA
        cw2, ch2 = cw + 2 * PAD, ch + 2 * PAD
        def rgba(R, A):
            im = np.zeros((ch2, cw2, 4), np.uint8)
            im[PAD:PAD + ch, PAD:PAD + cw, :3] = R; im[PAD:PAD + ch, PAD:PAD + cw, 3] = np.round(A * 255)
            # cor dos pixels transparentes = a mais próxima do corpo (sem branco/preto sujo ao filtrar)
            solid = im[:, :, 3] > 8
            idx = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
            im[:, :, :3] = im[idx[0], idx[1], :3]
            return im
        cells = [rgba(R, A) for R, A in crops]
        meta = {'frames': len(cells), 'names': ['open', 'raised', 'closed'] if len(cells) == 3 else ['still'], 'sizes': {}}
        # âncoras em fração da célula (coordenadas da folha -> célula)
        def frac(px, py): return [round((px - org[0] + PAD) / cw2, 4), round((py - org[1] + PAD) / ch2, 4)]
        meta['feet'] = frac(*anc['feet']); meta['seat'] = frac(*anc['seat'])
        sx, sy, srx, sry = anc['shadow']
        meta['shadow'] = frac(sx, sy) + [round(srx / cw2, 4), round(sry / ch2, 4)]  # centro + raios em fração do quadro
        meta['aspect'] = round(cw2 / ch2, 4)
        for tag, target in (('hi', HI), ('lo', LO)):
            s = target / max(cw2, ch2)
            w, h = max(1, round(cw2 * s)), max(1, round(ch2 * s))
            sheetim = Image.new('RGBA', (w * len(cells), h))
            for i, c in enumerate(cells):
                im = Image.fromarray(c, 'RGBA')
                # reduz em RGB e alfa separados (a cor limpa não é contaminada pelo alfa)
                rgbp = im.convert('RGB').resize((w, h), Image.LANCZOS)
                al = im.getchannel('A').resize((w, h), Image.LANCZOS)
                rgbp.putalpha(al); sheetim.paste(rgbp, (i * w, 0))
            name = f'{mid}.webp' if tag == 'hi' else f'{mid}-lo.webp'
            sheetim.save(os.path.join(OUT, name), 'WEBP', lossless=True, quality=100, method=6, exact=True)
            meta['sizes'][tag] = {'file': name, 'w': w, 'h': h, 'bytes_decoded': w * h * 4 * len(cells)}
            print(mid, tag, (w, h), 'x', len(cells), os.path.getsize(os.path.join(OUT, name)), 'bytes')
            if prev and tag == 'hi':
                for bgc, tg in (((26, 22, 40), 'dark'), ((236, 228, 200), 'light')):
                    cv = Image.new('RGBA', sheetim.size, bgc + (255,)); cv.alpha_composite(sheetim); cv.convert('RGB').save(os.path.join(prev, f'{mid}-{tg}.png'))
        with open(os.path.join(OUT, f'{mid}.json'), 'w') as f:
            json.dump(meta, f, indent=1)


if __name__ == '__main__':
    main()
