# Animação v2 (FK por código) dos heróis em miniatura. Executado por rig_animate.py (compartilha pb, q, spec, AX/AY/AZ, h, WS...).
# Princípios (o que o Bruxo já tinha e os outros não):
#  - a ARMA fica presa ao corpo: o braço da arma balança pouco e a mão contra-gira (weapon hold), sem efeito pêndulo;
#  - o CORPO inteiro conta o movimento: bob vertical, inclinação do tronco, giro do quadril/ombros, deslocamento para a frente/trás, squash/stretch do tronco;
#  - ataque: antecipação (recuo) -> golpe rápido -> impacto no quadro 'release' -> recuperação; skill é outra pose (carga + golpe forte), não "braços para cima";
#  - capa/asas: osso próprio com balanço ATRASADO e pequeno (mola), nunca rasgam porque são rígidos.
# Convenção dos eixos do mundo: X = direita da tela (esquerda do personagem), Y = profundidade (o personagem olha para -Y), Z = cima.
#  AX>0: ponta de osso que aponta para baixo vai PARA TRÁS; tronco/cabeça inclinam para a FRENTE. AZ>0: gira o corpo para a esquerda do personagem.
#  AY>0: braço direito (R) abre para fora; braço esquerdo (L) fecha.
M = 1 if WS == 'R' else -1                 # espelho do lado da arma para giros/aberturas
WA = spec.get('w_amp', 1.0)                # amplitude do braço da arma em ataque/skill (arma grande = menor)
OA = spec.get('o_amp', 1.0)                # amplitude do braço livre em ataque/skill
HOLD = spec.get('hold', 0.9)               # fração da rotação do braço que a mão desfaz na caminhada (arma estável)
BOB = spec.get('bob', 1.0)
SEC = spec.get('secondary', {})            # osso -> ganho do balanço atrasado (ex.: {"cape": 0.8})
for _n in ('cape', 'wing_L', 'wing_R'):
    if _n in pb and _n not in SEC: SEC[_n] = 0.8
LK = spec.get('lean_k', 1.0)                # escala da inclinação/agachamento em ataque e skill (robes longos: menor)
SK = spec.get('stance_k', 1.0)             # escala da passada em ataque e skill
LEGS_VIS = spec.get('legs_visible', True)
def _order(ax): return 0 if ax is AZ else (1 if ax is AY else 2)
def _arm_axes(side):
    # eixo de balanço frente/trás e de abertura do braço, conforme a direção de repouso (braço pendurado: AX/AY; braço aberto na horizontal: Z/Y)
    d = (pt['el_' + side] - pt['sh_' + side]).normalized()
    sx = d.cross(Vector((0, 1, 0)))
    if sx.length < 0.3: return AX, AY
    sx.normalize()
    if sx.dot(Vector(AX)) > 0.9: return AX, AY
    return sx, sx.cross(d)
SW = {}; AB = {}
for _s in ('R', 'L'): SW[_s], AB[_s] = _arm_axes(_s)
OBL = 'upper_arm.' + OS                    # braço livre
WUA, WFA, WHD = 'upper_arm.' + WS, 'fore_arm.' + WS, 'hand.' + WS
OUA, OFA, OHD = 'upper_arm.' + OS, 'fore_arm.' + OS, 'hand.' + OS
SPEC_HOLD_O = spec.get('hold_free', 0.0)   # >0 quando o braço livre segura algo (escudo): mão contra-gira
CAPE_G = spec.get('cape_gain', 1.0)        # ganho da mola da capa/asas (1 = normal)
# v3: mais quadros e duração por quadro. Estes números TÊM de bater com a tabela CLIPS (v2) de render3d.html e com hero-sprites.js (clip.dur).
FPS.update({'idle': 10, 'walk': 10})       # quadros-chave no Blender (idle é amostrado a cada 2: 5 quadros no atlas)
PLAY = {'idle': 6.0, 'walk': 16.0, 'attack': 18.0, 'skill': 16.0, 'hit': 12.0, 'dash': 12.0}   # fps de exibição no jogo
DUR = {'attack': [1.5, 1.6, 0.55, 0.6, 1.2, 1.5],                      # ritmo irregular: carrega devagar, golpe rápido, volta elástica
       'skill': [1.2, 1.3, 1.5, 1.0, 0.6, 0.9, 1.3, 1.6],
       'hit': [0.6, 1.0, 1.8], 'dash': [0.9, 1.0, 1.0, 1.4]}
def dts(name, n): return [d / PLAY[name] for d in DUR.get(name, [1.0] * n)]
def ssmooth(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def SP(arr, dt, w, z, loop=False):
    """Filtro de mola de 2ª ordem (frequência w rad/s, amortecimento z): a curva segue a pose-alvo com ATRASO e passa um pouco do ponto (follow-through/overshoot)."""
    x = arr[0]; v = 0.0; out = []
    for _ in range(3 if loop else 1):
        out = []
        for i, T in enumerate(arr):
            steps = max(1, int(dt[i] / 0.004)); hh = dt[i] / steps
            for _s in range(steps):
                v += (w * w * (T - x) - 2 * z * w * v) * hh; x += v * hh
            out.append(x)
    return out

class Pz:
    def __init__(s):
        s.rot = {}; s.hx = s.hy = s.hz = s.sq = 0.0; s.sc = {}; s.drv = 0.0
    def r(s, bone, ax, ang):
        if bone in pb and abs(ang) > 1e-6: s.rot.setdefault(bone, []).append((ax, ang))
        return s
    def get(s, bone, ax):
        return sum(a for x, a in s.rot.get(bone, []) if x is ax)

def K(*v): return list(v)

def legs_walk(P, th, fl_R, fl_L, kf=0.6):
    """th: ângulo da coxa R (negativo = para frente); L é o oposto. fl_*: flexão do joelho."""
    thR, thL = -th * LEG, th * LEG
    P.r('thigh.R', AX, thR).r('thigh.L', AX, thL)
    P.r('shin.R', AX, fl_R * LEG).r('shin.L', AX, fl_L * LEG)
    if LEGS_VIS:  # pé acompanha o chão: desfaz parte da rotação de coxa+canela
        P.r('foot.R', AX, -(thR + fl_R * LEG) * kf).r('foot.L', AX, -(thL + fl_L * LEG) * kf)

def idle2(f, n):
    """Respiração em dois tempos (peito sobe, ombros acompanham atrasados), troca de peso lenta e olhar que passeia; nada em fase exata."""
    u = f / n; p = 2 * math.pi * u
    br = math.sin(p - 0.5) * 0.5 + 0.5; br = br * br * (3 - 2 * br)      # inspira ease-in/out
    P = Pz()
    P.hz = 0.008 * BOB * (br - 0.5) + 0.004 * BOB * math.sin(p)
    P.sq = 0.026 * (br - 0.45)                                               # peito estica ao inspirar
    P.hx = 0.004 * math.sin(p + 1.1)
    P.r('hips', AY, 0.02 * math.sin(p + 0.3)).r('hips', AZ, 0.018 * math.sin(p + 2.0))   # troca de peso lenta
    P.r('spine', AX, 0.035 * (br - 0.4)).r('spine', AY, 0.012 * math.sin(p + 0.8)).r('spine', AZ, -0.02 * math.sin(p + 2.0))
    P.r('head', AX, 0.03 * math.sin(p - 0.2) - 0.015 * (br - 0.4)).r('head', AZ, 0.07 * math.sin(p + 1.2) + 0.03 * math.sin(2 * p + 0.4)).r('head', AY, 0.02 * math.sin(p + 2.2))
    # ombros/braços: sobem um pouco com o ar e voltam atrasados; mão da arma contra-gira
    sh = math.sin(p - 0.9) * 0.5 + 0.5
    P.r(WUA, SW[WS], 0.05 * math.sin(p + 0.2) - 0.02).r(OUA, SW[OS], -0.06 * math.sin(p + 0.5) + 0.01)
    P.r(OUA, AB[OS], M * -(0.025 + 0.035 * sh)).r(WUA, AB[WS], M * (0.015 + 0.025 * sh)).r(OFA, SW[OS], -0.05 - 0.05 * sh)
    for lg in 'RL': P.r('thigh.' + lg, AX, 0.012 * math.sin(p + (0.0 if lg == 'R' else 1.5)))
    P.hold = 0.9
    return P

def leg_cycle(u, A):
    """Um ciclo de perna (u em 0..1; contato do calcanhar em u=0). Apoio ~56%: perna vai para trás quase em velocidade constante (pé desliza menos);
    balanço ~44% com ease-in-out e joelho que SOBE cedo. Retorna (coxa à frente, flexão do joelho, fração do pé plantado)."""
    st = 0.56
    if u < st:
        x = u / st; e = 0.78 * x + 0.22 * ssmooth(x)
        th = A * (1 - 2 * e)
        kn = 0.20 * math.sin(math.pi * min(x / 0.32, 1.0)) + 0.30 * x ** 4      # amortece no contato; dobra ao desprender
        return th, kn, 1.0 - 0.45 * x ** 4
    x = (u - st) / (1 - st); e = ssmooth(x)
    th = A * (-1 + 2 * e)
    kn = 1.12 * math.sin(math.pi * x ** 0.78) ** 1.1 + 0.30 * (1 - x) ** 3      # joelho levanta cedo, estende antes de pousar
    return th, kn, 0.0

def walk2(f, n):
    u = f / n; tau = 2 * math.pi * u
    P = Pz()
    s = math.cos(tau); c = -math.sin(tau)
    sl = lambda d: math.cos(tau - d)        # seno atrasado: tronco/cabeça/braços chegam DEPOIS dos quadris (movimento sobreposto)
    # pernas com amplitude levemente diferente por lado (assimetria) e fase do joelho ligeiramente deslocada
    for lg, ph, A in (('R', 0.0, 0.88 * 1.0), ('L', 0.5, 0.88 * 0.93)):
        th, kn, plant = leg_cycle((u + ph + (0.012 if lg == 'L' else 0.0)) % 1.0, A)
        P.r('thigh.' + lg, AX, -th * LEG).r('shin.' + lg, AX, (kn * (1.0 if lg == 'R' else 0.94) + 0.06) * LEG)
        if LEGS_VIS: P.r('foot.' + lg, AX, -(-th * LEG + (kn + 0.06) * LEG) * (0.25 + 0.6 * plant))   # pé plano no apoio, ponta cai no balanço
    # corpo: desce e amassa nos contatos (pico), sobe e estica na passagem; desvia para o lado do apoio
    k = abs(math.cos(tau))   # |cos(2πu)|: 1 nos contatos (u=0, .5), 0 na passagem
    P.hz = BOB * (0.004 + 0.026 * (1 - k ** 1.7)); P.sq = 0.034 * (1 - 2 * k ** 1.5)
    P.hx = 0.013 * BOB * c; P.drv = 0.5 * math.cos(2 * tau - 0.5)       # surto de velocidade a cada passo (alimenta a capa)
    P.r('hips', AX, 0.07 + 0.02 * math.cos(2 * tau - 0.3)).r('hips', AZ, 0.10 * s).r('hips', AY, -0.034 * c)
    P.r('spine', AZ, -0.16 * sl(0.45)).r('spine', AY, 0.05 * math.cos(tau + 1.57 - 0.5)).r('spine', AX, 0.03 * math.cos(2 * tau + 0.1))
    P.r('head', AX, -0.05 + 0.045 * math.cos(2 * tau - 1.4)).r('head', AZ, 0.075 * sl(0.95)).r('head', AY, -0.035 * math.cos(tau + 1.57 - 1.1))
    # braço livre: oposto à perna; cotovelo dobra mais ao ir para a frente; ombro balança contra o quadril
    sgnO = 1 if OS == 'R' else -1
    ao = 0.55 * AMP * sl(0.32) * sgnO
    P.r(OUA, SW[OS], ao).r(OFA, SW[OS], -0.22 * AMP - 0.4 * AMP * max(0, -sl(0.9) * sgnO))
    P.r(OUA, AB[OS], M * (0.04 + 0.015 * math.cos(2 * tau)))
    P.r(WUA, SW[WS], 0.12 * sl(0.32) * (1 if WS == 'R' else -1)).r(WUA, AB[WS], M * 0.012 * math.cos(2 * tau + 0.5))
    P.hold = HOLD
    P.hold_o = SPEC_HOLD_O
    return P

def finish_hold(P):
    """Mãos contra-giram a rotação dos braços (arma/escudo seguros pelo pulso)."""
    k = getattr(P, 'hold', 0.0)
    if k: P.r(WHD, SW[WS], -(P.get(WUA, SW[WS]) + P.get(WFA, SW[WS])) * k)
    ko = getattr(P, 'hold_o', 0.0)
    if ko: P.r(OHD, SW[OS], -(P.get(OUA, SW[OS]) + P.get(OFA, SW[OS])) * ko)
    return P

# ---------------------------------------------------------------- ataques (6 quadros; golpe no quadro 3 = release)
def stance(P, stride, rear=0.0):
    """Passada de apoio: perna da frente (oposta à mão da arma para espada) avança; recuo dobra o joelho."""
    lead = 'L' if WS == 'R' else 'R'; back = 'R' if lead == 'L' else 'L'
    P.r('thigh.' + lead, AX, -stride * LEG).r('thigh.' + back, AX, stride * 0.6 * LEG)
    P.r('shin.' + back, AX, (abs(stride) * 0.8 + rear) * LEG).r('shin.' + lead, AX, (abs(stride) * 0.3) * LEG)
    if LEGS_VIS:
        P.r('foot.' + lead, AX, stride * LEG * 0.4).r('foot.' + back, AX, -stride * 0.5 * LEG)

def attack2(f, n, big=False):
    k = 1.2 if big else 1.0
    P = Pz()
    st = STYLE
    if st == 'slash':       # espada/machado: recuo (arma atrás e acima) -> corte diagonal rápido -> continuação -> volta
        wu = K(0.55, 2.35, -1.9, -1.15, -0.45, 0.0); wf = K(-0.35, -1.0, -0.5, -0.2, -0.2, -0.25); wab = K(0.15, 0.55, 0.2, -0.1, 0.0, 0.0)
        ou = K(-0.35, -0.55, -0.85, -1.05, -0.65, -0.35); of = K(-0.5, -0.7, -0.6, -0.5, -0.4, -0.4)
        tw = K(-0.12, -0.45, 0.0, 0.42, 0.3, 0.08); stw = K(-0.08, -0.25, 0.12, 0.3, 0.2, 0.05)
        ln = K(0.0, -0.14, 0.15, 0.26, 0.2, 0.08); sln = K(0.0, -0.08, 0.08, 0.14, 0.1, 0.03)
        hy = K(0.0, 0.03, -0.03, -0.075, -0.05, -0.01); hz = K(-0.014, -0.022, 0.004, -0.03, -0.014, 0.0)
        sq = K(-0.03, -0.05, 0.05, -0.04, 0.0, 0.0); sd = K(0.1, 0.0, 0.2, 0.5, 0.4, 0.1)
        hd = K(0.04, -0.14, 0.08, 0.14, 0.08, 0.0)
        hold = K(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    elif st == 'smash':     # maça/martelo: ergue sobre o ombro e bate para baixo
        wu = K(0.3, 2.0, -1.5, -0.8, -0.4, 0.0); wf = K(-0.3, -1.1, -0.4, -0.2, -0.2, -0.2); wab = K(0.1, 0.4, 0.1, 0.0, 0.0, 0.0)
        ou = K(-0.3, -0.5, -0.7, -0.9, -0.6, -0.3); of = K(-0.4, -0.6, -0.5, -0.4, -0.4, -0.4)
        tw = K(-0.1, -0.3, 0.1, 0.3, 0.2, 0.05); stw = K(-0.05, -0.15, 0.1, 0.2, 0.1, 0.03)
        ln = K(0.02, -0.16, 0.2, 0.4, 0.28, 0.1); sln = K(0.0, -0.1, 0.1, 0.2, 0.1, 0.03)
        hy = K(0.0, 0.03, -0.03, -0.06, -0.04, -0.01); hz = K(-0.012, -0.02, 0.0, -0.035, -0.014, 0.0)
        sq = K(-0.02, -0.05, 0.05, -0.05, 0.0, 0.0); sd = K(0.1, 0.0, 0.15, 0.4, 0.3, 0.1)
        hd = K(0.03, -0.16, 0.08, 0.16, 0.08, 0.0); hold = K(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    elif st == 'cast':      # cajado de mago: recolhe o cajado e aponta/estoca para a frente
        wu = K(-0.15, 0.05, -1.3, -1.65, -1.1, -0.4); wf = K(-0.25, -1.25, -0.35, -0.2, -0.3, -0.25); wab = K(0.1, 0.25, 0.0, -0.05, 0.0, 0.0)
        ou = K(-0.35, -0.8, -1.25, -1.5, -1.1, -0.5); of = K(-0.4, -0.5, -0.4, -0.3, -0.3, -0.35)
        tw = K(-0.06, -0.22, 0.05, 0.2, 0.12, 0.03); stw = K(-0.04, -0.12, 0.05, 0.12, 0.08, 0.02)
        ln = K(0.0, -0.12, 0.08, 0.22, 0.14, 0.04); sln = K(0.0, -0.06, 0.04, 0.12, 0.06, 0.02)
        hy = K(0.0, 0.025, -0.01, -0.045, -0.03, -0.005); hz = K(-0.008, -0.016, 0.004, 0.012, 0.004, 0.0)
        sq = K(-0.02, -0.04, 0.03, 0.05, 0.01, 0.0); sd = K(0.0, 0.1, 0.15, 0.3, 0.2, 0.05)
        hd = K(0.0, -0.12, 0.06, 0.12, 0.06, 0.0); hold = K(0.3, 0.3, 0.3, 0.3, 0.3, 0.3)
    elif st == 'shoot':     # arco/besta: mira, puxa, solta (coice no quadro 3)
        wu = K(-0.9, -1.15, -1.3, -1.45, -1.2, -0.9); wf = K(-0.45, -0.35, -0.3, -0.25, -0.3, -0.4); wab = K(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        ou = K(-0.7, -1.0, -1.25, -1.3, -0.9, -0.7); of = K(-0.9, -1.4, -1.9, -1.0, -1.1, -1.0)
        tw = K(-0.12, -0.25, -0.3, -0.12, -0.15, -0.1); stw = K(-0.08, -0.14, -0.14, -0.06, -0.08, -0.05)
        ln = K(0.0, -0.06, -0.1, -0.2, -0.1, 0.0); sln = K(0.0, -0.04, -0.06, -0.12, -0.04, 0.0)
        hy = K(0.0, 0.01, 0.025, 0.045, 0.02, 0.0); hz = K(-0.006, -0.012, -0.018, -0.006, -0.002, 0.0)
        sq = K(0.0, -0.02, -0.04, 0.03, 0.01, 0.0); sd = K(0.0, 0.1, 0.2, 0.15, 0.1, 0.05)
        hd = K(0.0, -0.05, -0.12, 0.1, 0.04, 0.0); hold = K(0.9, 0.9, 0.9, 0.9, 0.9, 0.9)
        wab = K(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        oab = K(0.1, 0.3, 0.5, 0.2, 0.1, 0.1)
    else:                   # 'pray' (cajado cerimonial): ergue à frente e bate no chão
        wu = K(-0.2, -0.9, -1.4, -1.0, -0.6, -0.2); wf = K(-0.2, -0.5, -0.7, -0.4, -0.3, -0.2); wab = K(0, 0, 0, 0, 0, 0)
        ou = K(-0.2, -0.9, -1.3, -1.1, -0.6, -0.2); of = K(-0.3, -0.5, -0.5, -0.4, -0.3, -0.3)
        tw = K(0, 0, 0, 0, 0, 0); stw = K(0, 0, 0, 0, 0, 0); ln = K(0, -0.08, -0.12, 0.12, 0.05, 0); sln = K(0, 0, 0, 0, 0, 0)
        hy = K(0, 0, 0, 0, 0, 0); hz = K(0, 0, 0, 0, 0, 0); sq = K(0, 0, 0, 0, 0, 0); sd = K(0, 0, 0, 0, 0, 0); hd = K(0, 0, 0, 0, 0, 0)
        hold = K(0.3, 0.3, 0.3, 0.3, 0.3, 0.3)
    oab = locals().get('oab', K(0.0, 0.0, 0.0, 0.0, 0.0, 0.0))
    # follow-through: antebraço, tronco, cabeça e braço livre ficam ATRASADOS em relação ao golpe e passam um pouco do ponto (mola); a arma e os quadris seguem a tabela
    dt = dts('attack', 6)
    wf = SP(wf, dt, 30, 0.40); ou = SP(ou, dt, 34, 0.50); of = SP(of, dt, 26, 0.40)
    tw = SP(tw, dt, 44, 0.55); stw = SP(stw, dt, 30, 0.45); hd = SP(hd, dt, 20, 0.35); sln = SP(sln, dt, 28, 0.45)
    # tabelas de giro são escritas para quem usa a mão direita; espelha para o outro lado (exceto 'shoot', que já gira para o lado do arco)
    mm = M if st != 'shoot' else 1
    P.r(WUA, SW[WS], wu[f] * k * WA).r(WUA, AB[WS], M * wab[f] * (1 if WS == 'R' else 1)).r(WFA, SW[WS], wf[f])
    P.r(OUA, SW[OS], ou[f] * OA).r(OFA, SW[OS], of[f]).r(OUA, AB[OS], M * oab[f] * -1 if False else -M * oab[f])
    P.r('hips', AZ, tw[f] * k * mm).r('spine', AZ, stw[f] * k * mm)
    P.r('hips', AX, ln[f] * k * LK).r('spine', AX, sln[f] * k * LK).r('head', AX, hd[f] * 0.8)
    P.hy = hy[f] * k * LK; P.hz = hz[f] * k * LK; P.sq = sq[f] * k
    stance(P, sd[f] * 0.5 * k * SK)
    P.hold = hold[f]
    P.hold_o = SPEC_HOLD_O
    return P

# ---------------------------------------------------------------- skill (8 quadros; golpe forte no quadro 4 = release)
def skill2(f, n):
    P = Pz(); st = STYLE
    if st in ('slash', 'smash'):   # salto + golpe forte: agacha, gira e sobe, cai com a arma
        wu = K(0.35, 1.7, 2.6, 3.0, -1.0, -0.8, -0.35, 0.0); wf = K(-0.3, -0.9, -0.7, -0.4, -0.2, -0.2, -0.2, -0.2); wab = K(0.1, 0.6, 0.6, 0.35, 0.0, 0.0, 0.0, 0.0)
        ou = K(-0.3, -0.5, -0.9, -1.2, -1.0, -0.8, -0.4, -0.2); of = K(-0.4, -0.6, -0.6, -0.5, -0.5, -0.4, -0.4, -0.4)
        tw = K(-0.1, -0.55, -0.4, 0.2, 0.55, 0.45, 0.15, 0.0); stw = K(-0.05, -0.3, -0.2, 0.12, 0.3, 0.25, 0.08, 0.0)
        ln = K(0.0, -0.15, -0.05, 0.05, 0.3, 0.26, 0.12, 0.04); sln = K(0.0, -0.1, -0.05, 0.0, 0.14, 0.1, 0.05, 0.0)
        hy = K(0.0, 0.03, 0.0, -0.03, -0.1, -0.08, -0.03, 0.0); hz = K(-0.01, -0.03, 0.05, 0.1, -0.05, -0.04, -0.01, 0.0)
        sq = K(-0.03, -0.09, 0.05, 0.08, -0.09, -0.04, 0.02, 0.0); sd = K(0.0, 0.0, 0.3, 0.6, 1.0, 0.7, 0.3, 0.0)
        hd = K(0.0, 0.1, -0.12, -0.18, 0.2, 0.12, 0.04, 0.0); hold = [0.0] * 8
    elif st == 'shoot':            # tiro potente: arco levantado, puxada completa, tremor, solta com coice grande
        wu = K(-0.9, -1.2, -1.45, -1.55, -1.7, -1.3, -1.0, -0.9); wf = K(-0.4, -0.3, -0.25, -0.25, -0.2, -0.3, -0.35, -0.4); wab = [0.0] * 8
        ou = K(-0.7, -1.1, -1.3, -1.35, -1.0, -0.9, -0.8, -0.7); of = K(-1.0, -1.7, -2.05, -2.1, -0.5, -1.0, -1.0, -1.0)
        tw = K(-0.1, -0.3, -0.4, -0.42, -0.1, -0.12, -0.1, -0.08); stw = K(-0.06, -0.15, -0.2, -0.22, -0.05, -0.06, -0.05, -0.04)
        ln = K(0.0, -0.1, -0.16, -0.18, -0.3, -0.15, -0.05, 0.0); sln = K(0.0, -0.06, -0.1, -0.12, -0.2, -0.08, -0.03, 0.0)
        hy = K(0.0, 0.02, 0.035, 0.04, 0.07, 0.04, 0.015, 0.0); hz = K(-0.006, -0.02, -0.03, -0.034, 0.0, -0.01, -0.004, 0.0)
        sq = K(0.0, -0.04, -0.06, -0.07, 0.06, 0.02, 0.0, 0.0); sd = K(0.0, 0.2, 0.4, 0.45, 0.5, 0.3, 0.1, 0.0)
        hd = K(0.0, -0.06, -0.15, -0.18, 0.12, 0.06, 0.02, 0.0); hold = [0.9] * 8
        oab = K(0.0, 0.3, 0.6, 0.7, 0.2, 0.1, 0.0, 0.0)
    else:                          # cajado: concentra (abre o braço livre, estica o corpo) e conjura / bate no quadro 4
        wu = K(-0.2, -0.7, -1.0, -1.1, -1.5, -0.9, -0.5, -0.2); wf = K(-0.3, -0.8, -1.0, -1.0, -0.4, -0.3, -0.3, -0.2); wab = K(0.0, 0.1, 0.15, 0.15, 0.0, 0.0, 0.0, 0.0)
        ou = K(-0.2, -0.6, -1.0, -1.1, -1.6, -1.0, -0.5, -0.2); of = K(-0.3, -0.5, -0.5, -0.5, -0.3, -0.3, -0.3, -0.3)
        tw = K(0.0, -0.1, -0.15, -0.12, 0.2, 0.14, 0.05, 0.0); stw = K(0.0, -0.05, -0.08, -0.06, 0.1, 0.07, 0.03, 0.0)
        ln = K(0.0, -0.1, -0.2, -0.22, 0.34, 0.22, 0.08, 0.0); sln = K(0.0, -0.05, -0.1, -0.1, 0.16, 0.1, 0.04, 0.0)
        hy = K(0.0, 0.015, 0.03, 0.03, -0.05, -0.03, -0.01, 0.0); hz = K(-0.01, -0.03, 0.03, 0.05, -0.035, -0.02, 0.0, 0.0)
        sq = K(-0.03, -0.07, 0.04, 0.07, -0.07, -0.02, 0.0, 0.0); sd = K(0.0, 0.0, 0.0, 0.0, 0.5, 0.3, 0.1, 0.0)
        hd = K(0.0, 0.1, -0.15, -0.2, 0.18, 0.1, 0.03, 0.0); hold = [0.3] * 8
        oab = K(0.0, 0.5, 0.9, 1.0, 0.1, 0.1, 0.0, 0.0)
    oab = locals().get('oab', [0.0] * 8)
    dt = dts('skill', 8)   # mesmo follow-through do ataque; a antecipação teatral vem dos quadros longos (DUR) e do agachar
    wf = SP(wf, dt, 28, 0.40); ou = SP(ou, dt, 30, 0.50); of = SP(of, dt, 24, 0.40)
    tw = SP(tw, dt, 40, 0.55); stw = SP(stw, dt, 28, 0.45); hd = SP(hd, dt, 18, 0.35); sln = SP(sln, dt, 26, 0.45)
    mm = M if st != 'shoot' else 1
    P.r(WUA, SW[WS], wu[f] * WA).r(WUA, AB[WS], M * wab[f]).r(WFA, SW[WS], wf[f])
    P.r(OUA, SW[OS], ou[f] * OA).r(OFA, SW[OS], of[f]).r(OUA, AB[OS], -M * oab[f])
    P.r('hips', AZ, tw[f] * mm).r('spine', AZ, stw[f] * mm)
    P.r('hips', AX, ln[f] * LK).r('spine', AX, sln[f] * LK).r('head', AX, hd[f])
    P.hy = hy[f] * LK; P.hz = hz[f] * LK; P.sq = sq[f]
    stance(P, (sd[f] if 'sd' in locals() else 0.0) * 0.45 * SK)
    if st not in ('slash', 'smash', 'shoot'):   # conjuradores agacham levemente na carga
        P.r('thigh.R', AX, -0.1 * (1 if f in (1, 2, 3) else 0)).r('thigh.L', AX, -0.1 * (1 if f in (1, 2, 3) else 0))
    P.hold = hold[f]; P.hold_o = SPEC_HOLD_O
    return P

def hit2(f, n):
    # recuo imediato (pico no 1º quadro), segura e volta com overshoot para a frente (o corpo "recupera" passando do ponto)
    t = [1.0, 0.78, -0.2][f]
    P = Pz()
    P.r('hips', AX, -0.28 * t).r('spine', AX, -0.14 * t - (0.05 if f == 2 else 0)).r('head', AX, -0.32 * t * (1.0 if f < 2 else 1.4)).r('hips', AZ, 0.12 * t * M).r('hips', AY, 0.06 * t)
    P.r(WUA, SW[WS], 0.35 * t).r(OUA, SW[OS], 0.45 * t).r(OUA, AB[OS], -M * 0.45 * t).r(OFA, SW[OS], -0.3 * t)
    P.r('thigh.R', AX, 0.15 * t).r('thigh.L', AX, -0.1 * t).r('shin.R', AX, 0.2 * abs(t)).r('shin.L', AX, 0.1 * abs(t))
    P.hy = 0.05 * t; P.hz = -0.012 * abs(t); P.sq = [-0.07, -0.03, 0.04][f]
    P.hold = 0.8
    return P

def dash2(f, n):  # investida: agacha no 1º quadro (antecipação), estica o corpo todo (stretch), passada larga, capa voa para trás
    ln = [0.18, 0.42, 0.48, 0.30][f]; stride = [-0.35, -1.1, 0.85, -0.7][f]; knee = [0.9, 1.0, 0.4, 0.8][f]
    P = Pz()
    P.r('hips', AX, ln).r('hips', AZ, [0.0, -0.08, 0.08, -0.04][f]).r('spine', AX, [0.05, 0.12, 0.12, 0.08][f]).r('head', AX, [-0.1, -0.3, -0.3, -0.2][f])
    P.r('thigh.R', AX, stride * LEG).r('thigh.L', AX, -stride * 0.9 * LEG).r('shin.R', AX, knee * LEG).r('shin.L', AX, (1.2 - knee) * LEG)
    if LEGS_VIS: P.r('foot.R', AX, -(stride + knee) * LEG * 0.4).r('foot.L', AX, (stride * 0.9 - (1.2 - knee)) * LEG * 0.4)
    P.r(WUA, SW[WS], 0.35 * WA).r(WFA, SW[WS], -0.5).r(OUA, SW[OS], 0.5 * AMP + 0.2).r(OFA, SW[OS], -0.4)
    P.hz = [-0.04, 0.0, 0.025, -0.005][f]; P.hy = [0.02, -0.06, -0.08, -0.03][f]; P.sq = [-0.09, 0.12, 0.10, 0.02][f]
    P.hold = 0.6; P.hold_o = SPEC_HOLD_O
    return P

# ---------------------------------------------------------------- capa/asas: cadeia de molas e montagem final
RAW = {'idle': idle2, 'walk': walk2, 'attack': attack2, 'skill': skill2, 'hit': hit2, 'dash': dash2}
LOOPS = ('idle', 'walk')
DRAG = {'idle': 0.03, 'walk': 0.20, 'attack': 0.10, 'skill': 0.13, 'hit': -0.18, 'dash': 0.95}   # inclinação de repouso da capa para TRÁS (rad) em cada clipe

def pitch_of(P):  # inclinação total do tronco (rad, + = para a frente)
    return P.get('hips', AX) + P.get('spine', AX)

_SEC_CACHE = {}
def sec_chain(name, n, K, gain, w0=15.0, z=0.32):
    """Simula a cadeia de capa/asa (K segmentos) em ângulos ABSOLUTOS (rad, + = ponta para trás) com molas acopladas: cada segmento persegue o anterior
    com mais atraso. Entradas: arrasto do clipe (DRAG), inclinação do tronco, velocidade para a frente (hy), surto por passo (drv) e velocidade vertical.
    Em clipes em loop roda 3 voltas (regime). Devolve, por quadro, a rotação de cada osso RELATIVA ao pai."""
    key = (name, n, K, gain, w0, z)
    if key in _SEC_CACHE: return _SEC_CACHE[key]
    Ps = [finish_hold(RAW[name](i, n)) for i in range(n)]
    loop = name in LOOPS; dt = dts(name, n)
    pit = [pitch_of(P) for P in Ps]
    def der(a, i):  # derivada por quadro, diferença central (cíclica em loops)
        j = (i + 1) % n if loop else min(i + 1, n - 1)
        k = (i - 1) % n if loop else max(i - 1, 0)
        span = (dt[i] + dt[k]) * 0.5 + (dt[j] + dt[i]) * 0.5 if (j != i and k != i) else max(dt[i], 1e-3)
        return (a[j] - a[k]) / span
    fwd = [-der([P.hy for P in Ps], i) for i in range(n)]    # + = o corpo avança (hy negativo = frente)
    vz = [der([P.hz for P in Ps], i) for i in range(n)]
    drag = DRAG[name] * gain
    x = [drag] * K; v = [0.0] * K
    out = None
    for _ in range(3 if loop else 1):
        out = []
        for i in range(n):
            steps = max(1, int(dt[i] / 0.004)); hh = dt[i] / steps
            T0 = drag + 0.55 * pit[i] + gain * (0.55 * fwd[i] + 0.35 * Ps[i].drv - 1.6 * vz[i])
            for _s in range(steps):
                for k in range(K):
                    T = T0 if k == 0 else x[k - 1] + 0.06 * drag
                    w_ = w0 * (1 - 0.13 * k)
                    v[k] += (w_ * w_ * (T - x[k]) - 2 * z * w_ * v[k]) * hh
                    x[k] += v[k] * hh
            rel = []; prev = pit[i]
            for k in range(K):
                r = max(-0.45, min(1.0, x[k] - prev)); rel.append(r); prev = prev + r
            out.append(rel)
    _SEC_CACHE[key] = out
    return out

def build(name, f, n):
    P = finish_hold(RAW[name](f, n))
    for b, g in SEC.items():
        if b not in pb: continue
        names = [b] + [f'{b}.{i}' for i in range(1, 8) if f'{b}.{i}' in pb]
        K = len(names)
        rel = sec_chain(name, n, K, g * CAPE_G, w0=(15.0 if K > 1 else 11.0))[f % n]
        for nm, r in zip(names, rel): P.r(nm, AX, r)
        if K > 1:   # balanço lateral leve, atrasado, ao longo da cadeia (acompanha o giro dos quadris)
            twv = P.get('hips', AZ) + P.get('spine', AZ)
            for i, nm in enumerate(names): P.r(nm, AY, max(-0.12, min(0.12, -0.25 * twv)) * (0.5 + 0.25 * i))
        if b.startswith('wing'):
            P.r(b, AZ, (0.06 if b.endswith('R') else -0.06) * math.sin(2 * math.pi * f / n * (1 if name in LOOPS else 0.5)) * g)
    return P

def pose2(P):
    reset()
    for name, rots in P.rot.items():
        pb[name].rotation_quaternion = q(name, *sorted(rots, key=lambda t: _order(t[0])))
    R = pb['hips'].bone.matrix_local.to_3x3().inverted()
    pb['hips'].location = R @ Vector((P.hx * h, P.hy * h, P.hz * h))
    if abs(P.sq) > 1e-6 and 'spine' in pb:   # squash/stretch no tronco (preserva volume); o osso aponta para +Y local
        pb['spine'].scale = (1 - P.sq * 0.5, 1 + P.sq, 1 - P.sq * 0.5)

CLIPS2 = {n_: (lambda f, n, _n=n_: build(_n, f, n)) for n_ in RAW}
