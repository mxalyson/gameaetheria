"""Kit de sprites de efeito (VFX) do Aetheria, gerado de forma DETERMINISTICA (sementes fixas).
Saida: public/assets/vfx/vfx.webp (atlas RGBA) + vfx.json (retangulos).
Cada sprite guarda a INTENSIDADE (0..1) nos canais RGB (cinza) e a opacidade no alfa; o jogo (render/skill-vfx.js) pinta com uma
rampa de cor por paleta (borda escura -> cor -> cor clara -> branco no nucleo), por isso o mesmo sprite serve ao fogo laranja, a brasa vermelha, etc.
Uso: python tools/vfx-kit.py [--preview caminho.png]
Arte pintada do dono: tools/vfx-sheet.py (parte deste kit e troca os sprites que as folhas cobrem).
"""
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'vfx')
f32 = np.float32


def ss(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def grid(w, h):
    y, x = np.mgrid[0:h, 0:w].astype(f32)
    return (x + .5) / w * 2 - 1, (y + .5) / h * 2 - 1


def fbm(h, w, seed, octv=5, base=3, pers=.55, off=(0, 0)):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), f32)
    amp = 1.
    tot = 0.
    m = max(h, w)
    for o in range(octv):
        n = base * 2 ** o
        gx, gy = max(2, int(n * w / m) + 2), max(2, int(n * h / m) + 2)
        g = r.random((gy, gx)).astype(f32)
        a = np.asarray(Image.fromarray(g, 'F').resize((w, h), Image.BICUBIC))
        if off != (0, 0):
            a = np.roll(a, (int(off[1] * h), int(off[0] * w)), (0, 1))
        out += a * amp
        tot += amp
        amp *= pers
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-9)


def warp(a, seed, amt, scale=3):
    h, w = a.shape
    dx = (fbm(h, w, seed, 3, scale) - .5) * amt * w
    dy = (fbm(h, w, seed + 91, 3, scale) - .5) * amt * h
    y, x = np.mgrid[0:h, 0:w].astype(f32)
    return map_coordinates(a, [np.clip(y + dy, 0, h - 1), np.clip(x + dx, 0, w - 1)], order=1)


def canvas_draw(w, h, fn, k=4):
    im = Image.new('L', (w * k, h * k), 0)
    d = ImageDraw.Draw(im)
    fn(d, k)
    return np.asarray(im.resize((w, h), Image.LANCZOS), f32) / 255.


def fin(I, A=None):
    I = np.clip(I, 0, 1)
    A = np.clip(I * 1.25 if A is None else A, 0, 1)
    return I, A


S = {}  # nome -> (I, A, ancora|None)


def put(name, I, A=None, anchor=None):
    I, A = fin(I, A)
    S[name] = (I, A, anchor)


# ---------- brilhos ----------
def g_glow(n):
    x, y = grid(n, n)
    r = np.hypot(x, y)
    I = np.exp(-(r / .42) ** 2 * 2.2) * ss(1, .55, r)
    put('glow', I * 1.05, I)


def g_ring(n):
    x, y = grid(n, n)
    r = np.hypot(x, y)
    nz = fbm(n, n, 11, 4, 4)
    I = np.exp(-((r - .66) / .06) ** 2) * (0.75 + .5 * (nz - .5)) + .28 * np.exp(-((r - .66) / .2) ** 2) * ss(.95, .5, r)
    put('ring', I * ss(1, .9, r), np.clip(I * 1.1, 0, 1) * ss(1, .9, r))


def g_shock(n):
    x, y = grid(n, n)
    r = np.hypot(x, y)
    th = np.arctan2(y, x)
    pn = fbm(n, n, 21, 5, 14)
    rr = r + (pn - .5) * .1
    edge = np.exp(-((rr - .8) / .045) ** 2)
    body = ss(.25, .8, rr) * ss(.93, .8, rr) * (0.2 + .8 * fbm(n, n, 22, 5, 10) ** 1.5)
    streak = np.abs(np.sin(th * 23 + pn * 6)) ** 6 * ss(.4, .8, rr) * ss(.9, .78, rr) * .6
    I = edge * (.8 + .5 * pn) + body * .5 + streak
    put('shock', I * ss(1.0, .86, r), np.clip(I * 1.2, 0, 1) * ss(1.0, .86, r))


# ---------- fogo ----------
def g_flame(n, seed, fr):
    x, y = grid(n, n)
    t = (y + 1) / 2  # 0 ponta .. 1 base
    o1 = n - int(fr * .22 * n)
    o2 = n - int(fr * .3 * n)
    nz = fbm(2 * n, n, seed, 5, 3, .6)[o1:o1 + n]
    nz2 = fbm(2 * n, n, seed + 5, 4, 6, .5)[o2:o2 + n]
    sway = .2 * np.sin(t * 3.3 + fr * 1.6 + seed) * (1 - t)
    hw = .5 * np.power(np.clip(t, 0, 1), .75) * np.sqrt(np.clip(1 - t ** 5, 0, 1)) + .02
    xx = (x - sway) + (nz - .5) * .55 * (1 - t * .6)
    m = ss(hw + .1, hw - .22, np.abs(xx)) * ss(.0, .1, t) * ss(1.0, .86, t)
    core = np.power(np.clip(1 - np.abs(xx) / (hw + 1e-3), 0, 1), 1.2) * (.35 + .65 * t ** .6)
    I = m * (.28 + .75 * core) * (.65 + .6 * nz2)
    I = np.clip(I + .35 * np.exp(-((x - sway * .4) / .22) ** 2 - ((y - .55) / .3) ** 2) * m, 0, 1)
    A = np.clip(m * (.55 + .7 * nz2) * 1.15, 0, 1)
    put(f'flame{fr}', I, A)


def g_ember(n, seed):
    x, y = grid(n, n)
    r = np.hypot(x, y)
    nz = fbm(n, n, seed, 3, 3)
    I = np.exp(-(r / .22) ** 2 * 2) * (.8 + .4 * nz) + .35 * np.exp(-(r / .6) ** 2 * 2.5)
    put(f'ember{seed % 2}', I * ss(1, .7, r), np.clip(I, 0, 1) * ss(1, .7, r))


# ---------- estrelas / explosao ----------
def g_star(n, name, diag):
    x, y = grid(n, n)
    r = np.hypot(x, y)
    ax, ay = np.abs(x), np.abs(y)
    a = np.exp(-ay * 22) * np.clip(1 - ax, 0, 1) ** 2.2 + np.exp(-ax * 22) * np.clip(1 - ay, 0, 1) ** 2.2
    u, v = (x + y) * .7071, (x - y) * .7071
    au, av = np.abs(u), np.abs(v)
    d = (np.exp(-au * 26) * np.clip(1 - av * 1.1, 0, 1) ** 2.4 + np.exp(-av * 26) * np.clip(1 - au * 1.1, 0, 1) ** 2.4) * diag
    I = a + d + np.exp(-(r / .16) ** 2 * 2) * .9 + .25 * np.exp(-(r / .5) ** 2 * 3)
    put(name, I * ss(1.05, .7, r), np.clip(I, 0, 1) * ss(1.05, .75, r))


def g_burst(n):
    x, y = grid(n, n)
    r = np.hypot(x, y) + 1e-6
    th = np.arctan2(y, x)
    rg = np.random.default_rng(31)
    rays = np.zeros_like(r)
    for i in range(16):
        ang = rg.uniform(-np.pi, np.pi)
        wd = rg.uniform(.035, .09)
        ln = rg.uniform(.55, 1.0)
        dth = np.arctan2(np.sin(th - ang), np.cos(th - ang))
        rays += np.exp(-(dth / wd) ** 2) * np.clip(1 - r / ln, 0, 1) ** 1.3 * rg.uniform(.6, 1.)
    I = rays * .9 + np.exp(-(r / .2) ** 2) * 1.1 + .35 * np.exp(-(r / .55) ** 2 * 2)
    put('burst', I * ss(1.0, .75, r), np.clip(I, 0, 1) * ss(1.0, .8, r))


def g_rays(n):
    x, y = grid(n, n)
    r = np.hypot(x, y) + 1e-6
    th = np.arctan2(y, x)
    rg = np.random.default_rng(41)
    rays = np.zeros_like(r)
    N = 14
    for i in range(N):
        ang = i * 2 * np.pi / N + rg.uniform(-.08, .08)
        wd = rg.uniform(.05, .11) * (1.6 if i % 2 else 1)
        ln = rg.uniform(.7, 1) if i % 2 == 0 else rg.uniform(.45, .7)
        dth = np.arctan2(np.sin(th - ang), np.cos(th - ang))
        rays += np.exp(-(dth / (wd * (1.4 - r))) ** 2) * np.clip(1 - r / ln, 0, 1) ** 1.1 * ss(.04, .22, r)
    nz = fbm(n, n, 42, 4, 5)
    I = rays * (.7 + .5 * nz) + .8 * np.exp(-(r / .18) ** 2) + .3 * np.exp(-(r / .5) ** 2 * 2)
    put('rays', I * ss(1.0, .8, r), np.clip(I, 0, 1) * ss(1.0, .85, r))


# ---------- gelo / cristal ----------
def g_crystal(n, seed, name):
    rg = np.random.default_rng(seed)
    wd = rg.uniform(.2, .3)
    sk = rg.uniform(-.08, .08)
    tip = rg.uniform(.9, .97)

    def draw(d, k):
        s = n * k / 2
        P = lambda px, py: (s + (px + sk * py) * s, s + py * s)
        tp = P(sk * .3, -tip)
        d.polygon([tp, P(-wd, -.28), P(0, -.12)], fill=150)
        d.polygon([P(-wd, -.28), P(0, -.12), P(0, .82), P(-wd * 1.05, .55)], fill=105)
        d.polygon([tp, P(wd, -.3), P(0, -.12)], fill=235)
        d.polygon([P(wd, -.3), P(0, -.12), P(0, .82), P(wd * 1.1, .52)], fill=190)
        d.line([tp, P(0, -.12), P(0, .82)], fill=255, width=int(2.2 * k))
        d.line([tp, P(-wd, -.28), P(-wd * 1.05, .55), P(0, .82), P(wd * 1.1, .52), P(wd, -.3), tp], fill=255, width=int(1.6 * k))
    base = canvas_draw(n, n, draw)
    nz = fbm(n, n, seed + 3, 4, 5)
    I = base * (.85 + .3 * (nz - .5))
    halo = gaussian_filter((base > 0).astype(f32), n * .05) * .38
    put(name, np.maximum(I, halo * .7), np.clip(np.maximum((base > 0.02).astype(f32), halo * 1.5), 0, 1))


def g_flake(n):
    def draw(d, k):
        c = n * k / 2
        for i in range(6):
            a = i * np.pi / 3
            ex, ey = c + np.cos(a) * c * .86, c + np.sin(a) * c * .86
            d.line([(c, c), (ex, ey)], fill=255, width=int(2.4 * k))
            for f in (.5, .72):
                px, py = c + np.cos(a) * c * .86 * f, c + np.sin(a) * c * .86 * f
                for sg in (-1, 1):
                    b = a + sg * .75
                    d.line([(px, py), (px + np.cos(b) * c * .24, py + np.sin(b) * c * .24)], fill=255, width=int(1.8 * k))
    b = canvas_draw(n, n, draw)
    gl = gaussian_filter(b, n * .035)
    put('flake', b + gl * .9, np.clip(b + gl * 1.2, 0, 1))


# ---------- raio ----------
def g_bolt(w, h, seed, name):
    rg = np.random.default_rng(seed)

    def disp(p0, p1, amp, depth):
        if depth == 0:
            return [p0, p1]
        m = ((p0[0] + p1[0]) / 2 + rg.normal() * amp * .25, (p0[1] + p1[1]) / 2 + rg.normal() * amp)
        return disp(p0, m, amp / 1.9, depth - 1)[:-1] + disp(m, p1, amp / 1.9, depth - 1)

    def draw(d, k):
        pts = disp((4 * k, h * k / 2), ((w - 4) * k, h * k / 2), h * k * .32, 6)
        d.line(pts, fill=255, width=int(3.4 * k), joint='curve')
        for i in rg.choice(len(pts) - 8, 3, replace=False):
            if i < 4:
                continue
            p = pts[i]
            br = disp(p, (p[0] + rg.uniform(20, 55) * k, p[1] + rg.choice([-1, 1]) * rg.uniform(10, 24) * k), h * k * .12, 4)
            d.line(br, fill=190, width=int(1.4 * k), joint='curve')
    b = canvas_draw(w, h, draw)
    gl = gaussian_filter(b, 2.2)
    xs = np.linspace(0, 1, w, dtype=f32)[None, :]
    fade = ss(0, .08, xs) * ss(1, .88, xs)
    put(name, (b + gl * 1.3) * fade, np.clip(b + gl * 1.5, 0, 1) * fade)


# ---------- fitas / vento / folhas ----------
def g_ribbon(w, h, seed, name, beads=False):
    x, y = grid(w, h)
    nz = np.asarray(Image.fromarray(fbm(h * 4, w, seed, 5, 6), 'F').resize((w, h), Image.BICUBIC))
    prof = np.exp(-(np.abs(y) / .55) ** 2 * 1.6) * (.7 + .6 * nz) + .25 * np.exp(-(np.abs(y) / .9) ** 2)
    along = ss(-1, .75, x) ** 1.2 * ss(1.02, .9, x)
    I = prof * along
    if beads:
        I *= .75 + .4 * np.sin(x * 40 + nz * 4)
    put(name, I, np.clip(I * 1.1, 0, 1))


def g_streak(w, h, seed, name):
    x, y = grid(w, h)
    cy = .35 * np.sin(x * 2.4 + 1.0) * (1 - x * .3)
    prof = np.exp(-((y - cy) / (.09 + .1 * (1 - np.abs(x)))) ** 2) * ss(-1, -.6, x) * ss(1, .6, x)
    nz = fbm(h, w, seed, 4, 5)
    put(name, prof * (.75 + .5 * nz), np.clip(prof * 1.3, 0, 1))


def g_leaf(n, seed, name):
    rg = np.random.default_rng(seed)
    cv = rg.uniform(.12, .3)
    x, y = grid(n, n)
    ang = rg.uniform(-.5, .5)
    xr = x * np.cos(ang) - y * np.sin(ang)
    yr = x * np.sin(ang) + y * np.cos(ang)
    t = (yr + .8) / 1.6
    hw = .36 * np.sin(np.clip(t, 0, 1) * np.pi) ** .85 * (1 - .25 * t)
    cx = cv * np.sin(t * np.pi) - cv * .3
    d = xr - cx
    m = ss(hw, hw - .05, np.abs(d)) * ss(0, .03, t) * ss(1, .97, t)
    vein = np.exp(-(d / .014) ** 2) + .2 * np.exp(-(np.sin(t * 14 - np.abs(d) * 9)) ** 2 * 6) * ss(hw, 0, np.abs(d))
    half = np.where(d > 0, 1., .78)
    I = m * (.32 + .5 * np.clip(t, 0, 1) ** .6 * half) + m * vein * .35 + (m - ss(hw - .09, hw - .04, np.abs(d)) * m) * .25
    put(name, I * (.85 + .3 * fbm(n, n, seed + 2, 3, 6)), m)


def g_smoke(n, seed, fr):
    x, y = grid(n, n)
    r = np.hypot(x, y)
    nz = fbm(2 * n, n, seed, 5, 3, .6)[n - int(fr * .12 * n):2 * n - int(fr * .12 * n)]
    nz = warp(nz, seed + 3, .35)
    m = ss(.95, .15, r + (nz - .5) * .55)
    I = m * (.35 + .55 * nz) * ss(1, .5, r)
    put(f'smoke{fr}', I, np.clip(I * 1.15, 0, 1) * .9)


def g_wisp(n, seed, name):
    rg = np.random.default_rng(seed)

    def draw(d, k):
        c = n * k / 2
        pts = []
        ph = rg.uniform(0, 6)
        for i in range(60):
            t = i / 59
            a = ph + t * 5.2
            rr = (.12 + t * .75) * c * (1 - .2 * t)
            pts.append((c + np.cos(a) * rr * .95, c * 1.1 - t * c * .75 + np.sin(a) * rr * .4))
        for i in range(59):
            t = i / 59
            d.line([pts[i], pts[i + 1]], fill=int(255 * (1 - t * .55)), width=max(1, int((9 * (1 - t) + 2.5) * k)))
        for _ in range(2):
            bx, by = rg.uniform(.15, .85) * n * k, rg.uniform(.15, .85) * n * k
            br = rg.uniform(3, 6) * k
            d.ellipse([bx - br, by - br, bx + br, by + br], outline=230, width=int(1.4 * k))
    b = canvas_draw(n, n, draw)
    b = warp(b, seed + 7, .12, 4)
    gl = gaussian_filter(b, n * .035)
    put(name, b * (.7 + .5 * fbm(n, n, seed + 9, 3, 5)) + gl * .7, np.clip(b + gl * 1.2, 0, 1))


def g_shard(n, seed, name):
    rg = np.random.default_rng(seed)
    angs = np.sort(rg.uniform(0, 2 * np.pi, 8))
    rad = rg.uniform(.42, .8, 8)
    P = [(.5 + np.cos(a) * r * .55, .5 + np.sin(a) * r * .55) for a, r in zip(angs, rad)]
    cen = (.5 + rg.uniform(-.08, .08), .5 + rg.uniform(-.08, .08))

    def draw(d, k):
        for i in range(8):
            p, q = P[i], P[(i + 1) % 8]
            mx = (p[0] + q[0]) / 2 - cen[0]
            my = (p[1] + q[1]) / 2 - cen[1]
            light = (-mx * .7 - my * .7) / (np.hypot(mx, my) + 1e-6)
            v = int(np.clip(125 + 100 * light + rg.uniform(-15, 15), 40, 240))
            d.polygon([(p[0] * n * k, p[1] * n * k), (q[0] * n * k, q[1] * n * k), (cen[0] * n * k, cen[1] * n * k)], fill=v)
        d.line([(p[0] * n * k, p[1] * n * k) for p in P + [P[0]]], fill=255, width=int(1.5 * k))
    b = canvas_draw(n, n, draw)
    m = (gaussian_filter((b > .01).astype(f32), 1.0) > .5).astype(f32)
    put(name, b * (.85 + .3 * fbm(n, n, seed, 4, 6)), m)


def g_cross(n):
    x, y = grid(n, n)
    ax, ay = np.abs(x), np.abs(y)
    arm = ss(.34, .26, ax) * ss(.78, .7, ay) + ss(.34, .26, ay) * ss(.78, .7, ax)
    m = np.clip(arm, 0, 1)
    gl = gaussian_filter(m, n * .06)
    I = m * (.42 + .3 * ss(.8, 0, np.hypot(x, y))) * (.85 + .3 * fbm(n, n, 71, 3, 4)) + gl * .55
    put('cross', I, np.clip(m + gl, 0, 1))


def g_bubble(n):
    x, y = grid(n, n)
    r = np.hypot(x, y)
    fres = np.exp(-((r - .9) / .09) ** 2) + .25 * ss(.4, .9, r) * ss(1, .88, r)
    hl = np.exp(-(((x + .35) / .22) ** 2 + ((y + .4) / .1) ** 2)) * .9
    I = fres * (.8 + .4 * fbm(n, n, 61, 3, 4)) + hl + .1 * ss(1, .5, r)
    put('bubble', I * ss(1.0, .93, r), np.clip(I, 0, 1) * ss(1.0, .93, r))


# ---------- runas e cortes ----------
def g_rune(n, seed, name, tri):
    rg = np.random.default_rng(seed)

    def draw(d, kk):
        c = n * kk / 2
        R = lambda f: f * c
        for f, wd in ((.96, 3.2), (.86, 1.8), (.62, 1.6), (.36, 1.2)):
            d.ellipse([c - R(f), c - R(f), c + R(f), c + R(f)], outline=255, width=int(wd * kk))
        N = 18
        for i in range(N):
            a0 = i * 2 * np.pi / N
            ca, sa = np.cos(a0), np.sin(a0)
            pt = lambda rr, tt: (c + ca * R(rr) - sa * R(rr) * tt, c + sa * R(rr) + ca * R(rr) * tt)
            kind = rg.integers(0, 4)
            if kind == 0:
                d.line([pt(.66, 0), pt(.82, 0)], fill=255, width=int(2.4 * kk))
                d.line([pt(.74, -.07), pt(.74, .07)], fill=255, width=int(2 * kk))
            elif kind == 1:
                d.line([pt(.66, -.06), pt(.82, .0), pt(.66, .06)], fill=255, width=int(2.2 * kk))
            elif kind == 2:
                d.line([pt(.67, -.05), pt(.81, .05)], fill=255, width=int(2.2 * kk))
                d.line([pt(.67, .05), pt(.81, -.05)], fill=255, width=int(2.2 * kk))
            else:
                q = pt(.74, 0)
                rr = 3.2 * kk
                d.ellipse([q[0] - rr, q[1] - rr, q[0] + rr, q[1] + rr], fill=255)
                d.line([pt(.66, 0), pt(.7, 0)], fill=255, width=int(2 * kk))
            if i % 2 == 0:
                d.line([pt(.88, 0), pt(.95, 0)], fill=255, width=int(1.6 * kk))
        if tri:
            pts = [(c + np.cos(j * 4 * np.pi / 5 - np.pi / 2) * R(.6), c + np.sin(j * 4 * np.pi / 5 - np.pi / 2) * R(.6)) for j in range(6)]
            d.line(pts, fill=255, width=int(1.6 * kk))
        else:
            pts = [(c + np.cos(j * np.pi / 3 - np.pi / 2) * R(.6), c + np.sin(j * np.pi / 3 - np.pi / 2) * R(.6)) for j in range(7)]
            d.line(pts, fill=255, width=int(1.6 * kk))
            for j in range(3):
                a = j * 2 * np.pi / 3 - np.pi / 2
                d.line([(c + np.cos(a) * R(.6), c + np.sin(a) * R(.6)), (c + np.cos(a + 2.094) * R(.6), c + np.sin(a + 2.094) * R(.6))], fill=200, width=int(1.4 * kk))
        d.ellipse([c - R(.08), c - R(.08), c + R(.08), c + R(.08)], outline=255, width=int(2 * kk))
    b = canvas_draw(n, n, draw, 4)
    gl = gaussian_filter(b, n * .02)
    gl2 = gaussian_filter(b, n * .06)
    nz = fbm(n, n, seed + 4, 4, 5)
    x, y = grid(n, n)
    r = np.hypot(x, y)
    I = b * (.75 + .5 * nz) + gl * .8 + gl2 * .55 + .12 * ss(.98, .4, r) * (.6 + .6 * nz)
    I = np.minimum(I, .78)  # linhas das runas ficam na cor da paleta (nao estouram para branco)
    put(name, I * ss(1.02, .94, r), np.clip(I * 1.5, 0, 1) * ss(1.02, .94, r))


def g_slash(w, h, seed, name, arcdeg, thick):
    x, y = grid(w, h)
    ax0 = 24
    px = (x + 1) / 2 * w - ax0
    py = y * h / 2
    R = w - ax0 - 8
    r = np.hypot(px, py)
    th = np.arctan2(py, px)
    amax = np.deg2rad(arcdeg)
    k = np.clip(1 - np.abs(th) / amax, 0, 1)
    tk = thick * R * k ** .75
    d = (r - (R - tk)) / (tk + 1e-3)
    nz = fbm(h, w, seed, 5, 7)
    st = np.abs(np.sin(th * 40 + nz * 7)) ** 3
    body = np.clip(d, 0, 1) ** .7 * (d <= 1) * (.55 + .5 * st) * (.75 + .5 * nz) * .95
    rim = np.exp(-((d - 1) / .09) ** 2) * k ** .5
    I = (body + rim * 1.1) * (k > 0.02)
    put(name, I, np.clip(I * 1.9, 0, 1), anchor=(ax0, h // 2))


def build():
    g_glow(96)
    g_ring(112)
    g_shock(192)
    for fr in range(4):
        g_flame(112, 3, fr)
    g_ember(64, 2)
    g_ember(64, 3)
    g_star(96, 'spark', .35)
    g_star(96, 'star8', 1.0)
    g_burst(96)
    g_rays(192)
    for i in range(3):
        g_crystal(112, 70 + i * 5, f'crystal{i}')
    g_flake(96)
    for i in range(3):
        g_bolt(256, 64, 80 + i * 7, f'bolt{i}')
    g_ribbon(256, 32, 90, 'ribbon0')
    g_ribbon(256, 32, 95, 'ribbon1', True)
    g_streak(128, 48, 99, 'wind')
    for i in range(2):
        g_leaf(96, 110 + i * 3, f'leaf{i}')
    for fr in range(3):
        g_smoke(96, 130, fr)
    for i in range(2):
        g_wisp(96, 140 + i * 9, f'wisp{i}')
    for i in range(2):
        g_shard(96, 150 + i * 4, f'shard{i}')
    g_cross(96)
    g_bubble(96)
    g_rune(192, 160, 'rune0', False)
    g_rune(192, 170, 'rune1', True)
    g_slash(128, 192, 180, 'slash0', 50, .5)
    g_slash(128, 192, 190, 'slash1', 42, .34)


def pack():
    items = sorted(S.items(), key=lambda kv: -kv[1][0].shape[0])
    W = 1024
    pad = 2
    x = y = rowh = 0
    pos = {}
    for name, (I, A, anc) in items:
        h, w = I.shape
        if x + w + pad > W:
            x = 0
            y += rowh + pad
            rowh = 0
        pos[name] = (x, y)
        x += w + pad
        rowh = max(rowh, h)
    H = y + rowh + pad
    atlas = np.zeros((H, W, 4), np.uint8)
    meta = {}
    for name, (I, A, anc) in S.items():
        px, py = pos[name]
        h, w = I.shape
        atlas[py:py + h, px:px + w, :3] = (I * 255).astype(np.uint8)[:, :, None]
        atlas[py:py + h, px:px + w, 3] = (A * 255).astype(np.uint8)
        meta[name] = [px, py, w, h] + (list(anc) if anc else [w // 2, h // 2])
    return atlas, meta, W, H


def ramp(I, pal):  # igual a render/skill-vfx.js (so para a previa)
    c0, c1, c2 = [np.array(p, f32) for p in pal]
    w = np.array([255, 255, 255], f32)
    t = I[..., None]
    out = np.where(t < .45, c0 + (c1 - c0) * (t / .45), np.where(t < .8, c1 + (c2 - c1) * ((t - .45) / .35), c2 + (w - c2) * ((t - .8) / .2)))
    return np.clip(out, 0, 255)


PAL = {'fire': ((120, 25, 8), (255, 110, 30), (255, 200, 90)), 'ice': ((20, 60, 130), (70, 190, 240), (200, 245, 255)),
       'gold': ((140, 80, 5), (255, 190, 50), (255, 240, 170)), 'toxic': ((20, 80, 20), (110, 215, 70), (210, 255, 150)),
       'violet': ((60, 25, 130), (150, 100, 255), (225, 205, 255))}
PREV = {'flame': 'fire', 'ember': 'fire', 'burst': 'fire', 'shock': 'fire', 'slash': 'fire', 'crystal': 'ice', 'flake': 'ice', 'bolt': 'violet', 'ribbon': 'ice',
        'rays': 'gold', 'rune': 'gold', 'spark': 'gold', 'star8': 'gold', 'cross': 'toxic', 'leaf': 'toxic', 'wisp': 'toxic', 'smoke': 'violet',
        'shard': 'fire', 'wind': 'toxic', 'bubble': 'gold', 'glow': 'violet', 'ring': 'gold'}


def preview(path):
    names = list(S)
    cols, cell = 6, 200
    rows = (len(names) + cols - 1) // cols
    bg = Image.new('RGBA', (cols * cell, rows * cell), (18, 22, 30, 255))
    for i, nme in enumerate(names):
        I, A, _ = S[nme]
        key = next((k for k in PREV if nme.startswith(k)), 'fire')
        rgb = ramp(I, PAL[PREV[key]])
        im = Image.fromarray(np.dstack([rgb, A * 255]).astype(np.uint8), 'RGBA')
        sc = min((cell - 8) / im.width, (cell - 8) / im.height)
        im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
        bg.alpha_composite(im, ((i % cols) * cell + 4, (i // cols) * cell + 4))
    bg.convert('RGB').save(path)
    print('previa salva')


if __name__ == '__main__':
    build()
    atlas, meta, W, H = pack()
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(atlas, 'RGBA').save(os.path.join(OUT, 'vfx.webp'), quality=90, alpha_quality=100, method=6)
    json.dump({'size': [W, H], 'sprites': meta}, open(os.path.join(OUT, 'vfx.json'), 'w'), separators=(',', ':'))
    print('atlas', W, H, 'MiB decodificado', round(W * H * 4 / 1048576, 2), 'webp bytes', os.path.getsize(os.path.join(OUT, 'vfx.webp')), 'sprites', len(meta))
    if '--preview' in sys.argv:
        preview(sys.argv[sys.argv.index('--preview') + 1])
