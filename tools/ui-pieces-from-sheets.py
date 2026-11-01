# Recorta as peças de interface pintadas (docs/art-direction/fontes-ui/) em arquivos com fundo transparente: public/assets/ui/*.webp
# Uso: python tools/ui-pieces-from-sheets.py   (precisa de Pillow, numpy e scipy). Cada folha tem fundo cinza-chumbo liso; peças iguais (estados) recebem a MESMA janela de corte.
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage as ndi
import os
root = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(root, 'docs/art-direction/fontes-ui/'); OUT = os.path.join(root, 'public/assets/ui/')
os.makedirs(OUT, exist_ok=True)

def components(rgb, tol=16, min_area=4000):
    """caixas (x0,y0,x1,y1) das peças separadas sobre o fundo liso"""
    a = rgb.astype(int); bg = np.median(np.concatenate([a[:6, :6].reshape(-1, 3), a[:6, -6:].reshape(-1, 3), a[-6:, :6].reshape(-1, 3), a[-6:, -6:].reshape(-1, 3)]), axis=0)
    diff = np.abs(a - bg).sum(axis=2) > tol
    diff = ndi.binary_closing(diff, iterations=6)
    lab, n = ndi.label(diff)
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        area = (lab[sl] == i).sum()
        if area >= min_area: boxes.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
    return sorted(boxes, key=lambda b: (b[1] // 200, b[0])), bg

def cut(im, box, bg, tol=16, hole=None, pad=4):
    """recorta a peça, deixa transparente o que é fundo (e, se `hole`, o miolo vazio partindo desse ponto)"""
    x0, y0, x1, y1 = box; x0 = max(0, x0 - pad); y0 = max(0, y0 - pad); x1 = min(im.width, x1 + pad); y1 = min(im.height, y1 + pad)
    crop = im.crop((x0, y0, x1, y1)).convert('RGB'); a = np.asarray(crop).astype(int)
    solid = np.abs(a - bg).sum(axis=2) > tol
    solid = ndi.binary_closing(solid, iterations=3)
    outside = ~ndi.binary_fill_holes(solid)                      # fundo ligado às bordas
    alpha = (~outside).astype(np.uint8) * 255
    if hole is not None:                                         # miolo liso (ex.: mapa do minimapa): transparente a partir do ponto dado
        seed = (int(hole[1] * crop.height), int(hole[0] * crop.width)); ref = a[seed]
        near = np.abs(a - ref).sum(axis=2) < 38
        lab, _ = ndi.label(near); mid = lab == lab[seed]
        mid = ndi.binary_erosion(mid, iterations=2); alpha[mid] = 0
    m = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.9))
    out = crop.convert('RGBA'); out.putalpha(m); return out

# tamanho máximo (lado maior) por peça: o HUD mostra cada uma com 40–230 px CSS; 3× de densidade basta. Botões ficam inteiros (usados em 9 fatias por pixel).
MAXPX = {'hero-card': 480, 'vial-': 520, 'minimap-ring': 380, 'medal-': 200, 'rarity-': 240, 'tip': 520, 'banner': 640, 'dialog': 640}

def save(img, name):
    for k, n in MAXPX.items():
        if name.startswith(k): r = n / max(img.size); img = img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS) if r < 1 else img; break
    img.save(OUT + name, 'WEBP', quality=92, method=6); print('ok', name, img.size)

def same_window(pieces):
    """peças iguais (estados): mesma largura/altura, centradas na própria caixa"""
    w = max(p[2] - p[0] for p in pieces); h = max(p[3] - p[1] for p in pieces); out = []
    for x0, y0, x1, y1 in pieces:
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2; out.append((cx - w // 2, cy - h // 2, cx - w // 2 + w, cy - h // 2 + h))
    return out

def sheet(name):
    im = Image.open(SRC + name).convert('RGB'); boxes, bg = components(np.asarray(im)); return im, boxes, bg

# botões: 2×2 (normal, pressionado / desativado, principal em ouro)
im, boxes, bg = sheet('botoes-4-estados.jpg')
for (n, b) in zip(['btn-normal', 'btn-pressed', 'btn-disabled', 'btn-primary'], same_window(boxes[:4])): save(cut(im, b, bg), n + '.webp')
# cartão do herói (moldura + suportes das barras)
im, boxes, bg = sheet('cartao-heroi.png'); save(cut(im, boxes[0], bg), 'hero-card.webp')
# barras: tubo vazio / vida / mana, MESMA janela (o líquido é mostrado até a porcentagem)
im, boxes, bg = sheet('barras-pocao-vazio-vida-mana.jpg')
for (n, b) in zip(['vial-empty', 'vial-hp', 'vial-mp'], same_window(boxes[:3])): save(cut(im, b, bg), n + '.webp')
# minimapa redondo (miolo transparente)
im, boxes, bg = sheet('minimapa-redondo.jpg'); save(cut(im, boxes[0], bg, hole=(0.5, 0.5)), 'minimap-ring.webp')
# medalhão de botão (3 estados), miolo escuro mantido (o ícone vai por cima)
im, boxes, bg = sheet('medalhao-3-estados.png')
for (n, b) in zip(['medal-normal', 'medal-pressed', 'medal-disabled'], same_window(boxes[:3])): save(cut(im, b, bg), n + '.webp')

# ---- segunda leva: dica/faixa/diálogo, raridades (com brilho), ataques básicos e ícones de menu ----
def cut_soft(im, box, bg, pad=10):
    """peças com BRILHO ao redor (raridades): o brilho vira transparência suave; a moldura e o miolo ficam opacos"""
    x0, y0, x1, y1 = box; x0 = max(0, x0 - pad); y0 = max(0, y0 - pad); x1 = min(im.width, x1 + pad); y1 = min(im.height, y1 + pad)
    crop = im.crop((x0, y0, x1, y1)).convert('RGB'); a = np.asarray(crop).astype(int)
    d = np.abs(a - bg).sum(axis=2)
    strong = ndi.binary_closing(d > 70, iterations=3); filled = ndi.binary_fill_holes(strong)
    soft = np.clip((d - 14) / 90.0, 0, 1)
    alpha = np.maximum(filled.astype(float), soft * (~filled)) * 255
    out = crop.convert('RGBA'); out.putalpha(Image.fromarray(alpha.astype(np.uint8))); return out

def fit(img, n=256):
    """reduz para no máximo n px (o botão de ataque aparece com ~84 px; 256 cobre telas 3×)"""
    r = n / max(img.size); return img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS) if r < 1 else img

def save_to(img, folder, name):
    os.makedirs(os.path.join(root, 'public/assets', folder), exist_ok=True)
    img.save(os.path.join(root, 'public/assets', folder, name), 'WEBP', quality=94, method=6); print('ok', folder + '/' + name, img.size)

im, boxes, bg = sheet('dica-faixa-dialogo.png')
for n, b in zip(['tip', 'banner', 'dialog'], boxes[:3]): save(cut(im, b, bg), n + '.webp')
im, _, bg = sheet('raridades-7.jpg')
# caixas fixas (os brilhos juntam as molduras na detecção automática): 0 comum · 1 verde/folhas · 2 lilás · 3 musgo · 4 prata com cristais · 5 ouro com asas e chamas · 6 roxa com runas
RARITY_BOXES = [(70, 85, 325, 335), (355, 50, 665, 350), (700, 85, 955, 335), (40, 360, 350, 660), (370, 370, 660, 660), (660, 340, 990, 650), (350, 670, 670, 975)]
for i, b in enumerate(RARITY_BOXES): save(cut_soft(im, b, bg, pad=0), f'rarity-{i}.webp')
im, boxes, bg = sheet('ataques-4-classes.jpg')
for n, b in zip(['warrior', 'mage', 'archer', 'cleric'], boxes[:4]): save_to(fit(cut(im, b, bg)), 'icons/attack', f'atk-{n}.webp')
im, boxes, bg = sheet('menu-7-icones.jpg')
for n, b in zip(['bag', 'hero', 'spirits', 'journal', 'map', 'party', 'settings'], boxes[:7]): save_to(fit(cut(im, b, bg)), 'icons/menu', f'menu-{n}.webp')
