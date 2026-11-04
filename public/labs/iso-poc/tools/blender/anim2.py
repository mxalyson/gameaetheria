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

class Pz:
    def __init__(s):
        s.rot = {}; s.hx = s.hy = s.hz = s.sq = 0.0; s.sc = {}
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
    p = 2 * math.pi * f / n
    P = Pz()
    P.hz = 0.010 * BOB * math.sin(p); P.sq = 0.018 * math.sin(p + 0.4)
    P.r('spine', AX, 0.03 * math.sin(p + 0.5)).r('head', AX, 0.03 * math.sin(p + 1.2)).r('hips', AY, 0.012 * math.sin(p))
    # braços relaxados: balanço mínimo; mão da arma contra-gira
    P.r(WUA, SW[WS], 0.03 * math.sin(p + 0.8)).r(OUA, SW[OS], -0.04 * math.sin(p + 0.3))
    P.r(OUA, AB[OS], M * -0.03 * math.sin(p)).r(OHD, SW[OS], 0.0)
    P.hold = 0.9
    return P

def walk2(f, n):
    p = 2 * math.pi * f / n; s = math.sin(p); c = math.cos(p)
    P = Pz()
    # bob: o corpo desce nos contatos (|s|=1) e sobe na passagem (s=0)
    P.hz = BOB * (0.006 + 0.02 * math.cos(2 * p)); P.hx = 0.012 * c * BOB
    P.sq = 0.03 * math.cos(2 * p)          # stretch na passagem, squash no contato
    legs_walk(P, 0.85 * s, 1.0 * max(0, c) ** 1.2 + 0.1, 1.0 * max(0, -c) ** 1.2 + 0.1)
    # tronco: inclina para a frente, gira contra o quadril, balança de lado
    P.r('hips', AX, 0.07).r('hips', AZ, 0.10 * s).r('hips', AY, -0.03 * c)
    P.r('spine', AZ, -0.16 * s).r('spine', AY, 0.05 * c).r('spine', AX, 0.03 * math.cos(2 * p + 0.5))
    P.r('head', AX, -0.05 + 0.03 * math.cos(2 * p + 0.9)).r('head', AZ, 0.07 * s).r('head', AY, -0.03 * c)
    # braço livre: balança oposto à perna do mesmo lado; cotovelo dobra quando o braço vai para a frente
    sgnO = 1 if OS == 'R' else -1            # R: +s é para trás
    ao = 0.55 * AMP * s * sgnO
    P.r(OUA, SW[OS], ao).r(OFA, SW[OS], -0.25 * AMP - 0.35 * AMP * max(0, -ao))
    P.r(OUA, AB[OS], M * 0.04)
    # braço da arma: amplitude pequena (a arma não varre o corpo), a mão contra-gira
    wa = -0.12 * s * sgnO * (1 if WS == 'R' else -1) * -1
    wa = 0.12 * s * (1 if WS == 'R' else -1)
    P.r(WUA, SW[WS], wa)
    P.hold = HOLD
    # braço livre com escudo/objeto: mão contra-gira
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
    t = [0.7, 1.0, 0.35][f]
    P = Pz()
    P.r('hips', AX, -0.28 * t).r('spine', AX, -0.12 * t).r('head', AX, -0.3 * t).r('hips', AZ, 0.12 * t * M).r('hips', AY, 0.06 * t)
    P.r(WUA, SW[WS], 0.35 * t).r(OUA, SW[OS], 0.45 * t).r(OUA, AB[OS], -M * 0.45 * t).r(OFA, SW[OS], -0.3 * t)
    P.r('thigh.R', AX, 0.15 * t).r('thigh.L', AX, -0.1 * t).r('shin.R', AX, 0.2 * t).r('shin.L', AX, 0.1 * t)
    P.hy = 0.05 * t; P.hz = -0.012 * t; P.sq = -0.05 * t
    P.hold = 0.8
    return P

def dash2(f, n):  # investida: corpo baixo e inclinado, passada larga, braço da arma recolhido, capa para trás
    ln = [0.25, 0.42, 0.46, 0.34][f]; stride = [-0.5, -1.05, 0.8, -0.8][f]; knee = [0.7, 1.0, 0.4, 0.9][f]
    P = Pz()
    P.r('hips', AX, ln).r('hips', AZ, [0.0, -0.08, 0.08, -0.04][f]).r('spine', AX, 0.1).r('head', AX, -0.28)
    P.r('thigh.R', AX, stride * LEG).r('thigh.L', AX, -stride * 0.9 * LEG).r('shin.R', AX, knee * LEG).r('shin.L', AX, (1.2 - knee) * LEG)
    if LEGS_VIS: P.r('foot.R', AX, -(stride + knee) * LEG * 0.4).r('foot.L', AX, (stride * 0.9 - (1.2 - knee)) * LEG * 0.4)
    P.r(WUA, SW[WS], 0.35 * WA).r(WFA, SW[WS], -0.5).r(OUA, SW[OS], 0.5 * AMP + 0.2).r(OFA, SW[OS], -0.4)
    P.hz = [-0.03, 0.0, 0.025, -0.005][f]; P.hy = [0.0, -0.04, -0.06, -0.02][f]; P.sq = [-0.05, 0.05, 0.04, 0.0][f]
    P.hold = 0.6; P.hold_o = SPEC_HOLD_O
    return P

# ---------------------------------------------------------------- balanço atrasado de capa/asas e montagem final
RAW = {'idle': idle2, 'walk': walk2, 'attack': attack2, 'skill': skill2, 'hit': hit2, 'dash': dash2}
LOOPS = ('idle', 'walk')

def pitch_of(P):  # inclinação total do tronco (rad, + = para a frente) + bob vertical convertido em "aceleração"
    return P.get('hips', AX) + P.get('spine', AX)

def lagged(name, f, n):
    """mola de 1ª ordem sobre o pitch do tronco: devolve (lag - atual), o quanto a capa fica para trás."""
    seq = [pitch_of(finish_hold(RAW[name](i % n, n))) for i in range(n)]
    a = 0.5; s = seq[0]
    steps = (list(range(n)) * 3 + list(range(f + 1))) if name in LOOPS else list(range(f + 1))
    if name in LOOPS: steps = list(range(n)) * 3 + list(range(f + 1))
    for i in steps: s += (seq[i] - s) * a
    return s - seq[f], seq

def build(name, f, n):
    P = finish_hold(RAW[name](f, n))
    if SEC:
        d, seq = lagged(name, f, n)
        nxt = seq[(f + 1) % n] - seq[f]
        for b, g in SEC.items():
            if b in pb:
                # atraso do pitch + um pouco de vento/arrasto no passo (cabelo/capa seguem o movimento do corpo)
                ang = max(-0.22, min(0.22, d * g * 1.4))
                P.r(b, AX, ang)
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
