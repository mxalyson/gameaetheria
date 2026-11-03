# Rig + animação procedural no Blender (headless) para os GLBs "chibi" do laboratório.
# Uso: blender -b --python rig_animate.py -- <glb> <spec.json> <saida.glb> [preview_dir]
# 1) importa o GLB, 2) cria um esqueleto a partir de pontos marcados na vista frontal (pixels da imagem do probe.py),
# 3) calcula pesos por distância às cápsulas dos ossos (robusto para malhas de IA, sem "bone heat"), 4) cria 5 clipes (idle, walk, attack, skill, hit)
# com poses de FK por código e 5) exporta GLB com pele + animações. As animações vivem em ações do Blender (fps 24).
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector, Quaternion

args = sys.argv[sys.argv.index('--') + 1:]
glb, spec_path, out_glb = args[:3]
preview = args[3] if len(args) > 3 else None
spec = json.load(open(spec_path))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
mesh = [o for o in sc.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in list(sc.objects):
    if o.type == 'EMPTY':
        bpy.data.objects.remove(o)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

V = len(mesh.data.vertices)
co = np.empty(V * 3, dtype=np.float32); mesh.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
mn, mx = co.min(0), co.max(0)
h = float(mx[2] - mn[2]); cx = float((mn[0] + mx[0]) / 2); zc = float((mn[2] + mx[2]) / 2)
S = 800.0 / (h * 1.2)  # px por unidade na imagem do probe.py (ortográfica, 1.2*h de campo)
def w(p, y=0.0):  # pixel (frontal) -> mundo (x, y profundidade, z)
    return Vector((cx + (p[0] - 400) / S, y, zc - (p[1] - 400) / S))

cut = spec.get('cut', 0)
if cut > 0:  # remove pedestais (vértices abaixo de cut*h)
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < mn[2] + cut * h], context='VERTS')
    bm.to_mesh(mesh.data); bm.free()
    V = len(mesh.data.vertices)
    co = np.empty(V * 3, dtype=np.float32); mesh.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)

P = spec['points']
yb = spec.get('depth', 0.0)
pt = {k: w(v, yb) for k, v in P.items()}
# --- ossos: (nome, pai, cabeça, cauda, raio_px)
def seg(a, b): return (pt[a], pt[b])
bones = [
    ('hips', None, pt['hip'], pt['hip'] + Vector((0, 0, 0.1)), spec['r'].get('hips', 100)),
    ('spine', 'hips', pt['hip'] + Vector((0, 0, 0.1)), pt['neck'], spec['r'].get('spine', 110)),
    ('neck', 'spine', pt['neck'], pt['chin'], 40),
    ('head', 'neck', pt['chin'], pt['top'], spec['r'].get('head', 150)),
]
for s in ('R', 'L'):
    el, wr = pt['el_' + s], pt['wr_' + s]
    bones += [
        ('upper_arm.' + s, 'spine', pt['sh_' + s], el, spec['r'].get('arm', 45)),
        ('fore_arm.' + s, 'upper_arm.' + s, el, wr, spec['r'].get('arm', 45)),
        ('hand.' + s, 'fore_arm.' + s, wr, wr + (wr - el) * 0.4, spec['r'].get('hand', 40)),
        ('thigh.' + s, 'hips', pt['hipj_' + s], pt['kn_' + s], spec['r'].get('leg', 45)),
        ('shin.' + s, 'thigh.' + s, pt['kn_' + s], pt['an_' + s], spec['r'].get('leg', 45)),
        ('foot.' + s, 'shin.' + s, pt['an_' + s], pt['an_' + s] + Vector((0, -0.14, -0.02)), spec['r'].get('foot', 45)),
    ]
for wp in spec.get('weapons', []):  # armas/adereços presos a uma mão (ou a outro osso)
    dy = wp.get('dy', 0.0)  # profundidade própria do adereço (a vista frontal não separa frente/trás)
    bones.append((wp['name'], wp['parent'], w(wp['a'], yb + wp.get('ay', dy)), w(wp['b'], yb + wp.get('by', dy)), wp['r']))  # ay/by: profundidade de cada ponta (ex.: espada que aponta para a frente)

arm_data = bpy.data.armatures.new('Rig'); arm = bpy.data.objects.new('Rig', arm_data)
sc.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for name, parent, hd, tl, r in bones:
    b = arm_data.edit_bones.new(name); b.head = hd
    b.tail = tl if (tl - hd).length > 1e-4 else hd + Vector((0, 0, 0.02))
    b.roll = 0
    eb[name] = b
for name, parent, hd, tl, r in bones:
    if parent: eb[name].parent = eb[parent]
bpy.ops.object.mode_set(mode='OBJECT')

# --- pesos por capsula: d_eff = max(0, dist_segmento - raio); w ~ 1/(d_eff+eps)^3, 4 maiores influências
n = len(bones)
D = np.zeros((V, n), dtype=np.float32); RAW = np.zeros((V, n), dtype=np.float32)
for i, (name, parent, hd, tl, r) in enumerate(bones):
    a = np.array(hd, dtype=np.float32); b = np.array(tl, dtype=np.float32)
    ab = b - a; L2 = max(float(ab @ ab), 1e-8)
    t = np.clip(((co - a) @ ab) / L2, 0, 1)
    proj = a + t[:, None] * ab
    RAW[:, i] = np.linalg.norm(co - proj, axis=1)
    D[:, i] = np.maximum(0, RAW[:, i] - r / S)
Wt = 1.0 / (D + 0.01) ** 4
Wt /= Wt.sum(1, keepdims=True)
# suaviza os pesos ao longo da malha (vértices com a mesma posição, ex.: cortes de UV, são fundidos para não abrir costuras)
key = np.round(co * 1e5).astype(np.int64)
_, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
inv = inv.reshape(-1)
E = np.empty(len(mesh.data.edges) * 2, dtype=np.int32); mesh.data.edges.foreach_get('vertices', E); E = inv[E.reshape(-1, 2)]
E = E[E[:, 0] != E[:, 1]]
U = len(first); deg = np.bincount(E.ravel(), minlength=U).astype(np.float32)[:, None] + 1e-6
Wu = np.zeros((U, Wt.shape[1]), dtype=np.float32); Wu[inv] = Wt
for _ in range(spec.get('smooth', 3)):
    Sn = np.zeros_like(Wu)
    np.add.at(Sn, E[:, 0], Wu[E[:, 1]]); np.add.at(Sn, E[:, 1], Wu[E[:, 0]])
    Wu = 0.5 * Wu + 0.5 * Sn / deg
Wt = Wu[inv]
# adereços rígidos (espada, escudo, cajado...): vértices dentro da cápsula e mais perto dela que de qualquer osso do corpo ficam 100% no adereço
yb_ = spec.get('depth', 0.0)
wnames = {wp['name'] for wp in spec.get('weapons', [])}
body_idx = [i for i, b in enumerate(bones) if b[0] not in wnames]
body_raw = RAW[:, body_idx].min(1)
for i, (name, parent, hd, tl, r) in enumerate(bones):
    if name in wnames:
        wp = next(w_ for w_ in spec['weapons'] if w_['name'] == name)
        inside = RAW[:, i] < r / S
        if not wp.get('rigid'): inside &= RAW[:, i] < body_raw * 0.8   # rigid: tudo dentro da cápsula é 100% do adereço (sem 'mole')
        if 'ymax' in wp: inside &= co[:, 1] <= yb_ + wp['ymax']          # corte por profundidade (ex.: escudo só a parte à frente do peito)
        if 'ymin' in wp: inside &= co[:, 1] >= yb_ + wp['ymin']
        if 'xmin_px' in wp: inside &= co[:, 0] >= cx + (wp['xmin_px'] - 400) / S   # corte lateral (pixel da vista frontal): ex.: escudo não pega o ombro do mesmo lado
        Wt[inside] = 0; Wt[inside, i] = 1.0
keep = np.argsort(-Wt, axis=1)[:, :4]
mask = np.zeros_like(Wt, dtype=bool); np.put_along_axis(mask, keep, True, axis=1)
Wt = np.where(mask, Wt, 0); Wt /= Wt.sum(1, keepdims=True)
groups = [mesh.vertex_groups.new(name=b[0]) for b in bones]
for i, g in enumerate(groups):
    idx = np.nonzero(Wt[:, i] > 0.004)[0]
    # agrupa por peso arredondado para reduzir chamadas
    vals = np.round(Wt[idx, i], 3)
    for wv in np.unique(vals):
        g.add([int(k) for k in idx[vals == wv]], float(wv), 'REPLACE')
mesh.parent = arm
mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = arm

# --- animação (FK por código)
sc.render.fps = 24
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
pb = arm.pose.bones
AX, AY, AZ = (1, 0, 0), (0, 1, 0), (0, 0, 1)
for b in pb: b.rotation_mode = 'QUATERNION'

def q(name, *rots):  # rotações em eixos do MUNDO -> quaternion no espaço local do osso (repouso)
    R = pb[name].bone.matrix_local.to_3x3().inverted()
    out = Quaternion((1, 0, 0, 0))
    for ax, ang in rots:
        out = out @ Quaternion((R @ Vector(ax)).normalized(), ang)
    return out

def reset():
    for b in pb:
        b.rotation_quaternion = Quaternion((1, 0, 0, 0)); b.location = (0, 0, 0)

def pose(rot=None, hipz=0.0, hipy=0.0):
    reset()
    for name, rots in (rot or {}).items():
        pb[name].rotation_quaternion = q(name, *rots)
    R = pb['hips'].bone.matrix_local.to_3x3().inverted()
    pb['hips'].location = R @ Vector((0, hipy * h, hipz * h))

WS = spec.get('weapon_side', 'R')        # lado do braço da arma principal
OS = 'L' if WS == 'R' else 'R'
STYLE = spec.get('style', 'slash')
AMP = spec.get('arm_amp', 1.0)           # < 1 em personagens de manga larga/vestido: o pano acompanha o braço e 'balança' estranho
LEG = spec.get('leg_swing', 1.0)         # 0.4 para personagens de manto/vestido (evita deformar a roupa)
FPS = {'idle': 6, 'walk': 8, 'attack': 6, 'skill': 8, 'hit': 3, 'dash': 4}

def idle(f, n):
    p = 2 * math.pi * f / n
    return dict(rot={'spine': [(AX, 0.03 * math.sin(p + 0.5))], 'head': [(AX, 0.03 * math.sin(p + 1.0))],
                     'upper_arm.R': [(AY, -0.05 + 0.04 * math.sin(p))], 'upper_arm.L': [(AY, 0.05 - 0.04 * math.sin(p))]}, hipz=0.012 * math.sin(p))

def walk(f, n):
    p = 2 * math.pi * f / n; s = math.sin(p); c = math.cos(p)
    rot = {'hips': [(AX, 0.08), (AZ, 0.08 * s)], 'spine': [(AZ, -0.08 * s)],
           'thigh.R': [(AX, -0.7 * LEG * s)], 'thigh.L': [(AX, 0.7 * LEG * s)],
           'shin.R': [(AX, 0.8 * LEG * max(0, c))], 'shin.L': [(AX, 0.8 * LEG * max(0, -c))],
           'upper_arm.R': [(AX, 0.5 * AMP * s)], 'upper_arm.L': [(AX, -0.5 * AMP * s)], 'head': [(AX, -0.05)]}
    return dict(rot=rot, hipz=0.035 * abs(s))

def swing(arr, f): return arr[f]

def attack(f, n, big=False):
    k = 1.25 if big else 1.0
    W, O = 'upper_arm.' + WS, 'upper_arm.' + OS
    if STYLE == 'slash':   # espada: levanta atrás e corta para frente
        a = [0.3, 1.0, -0.3, -1.3, -0.9, -0.2]
        fa = [-0.2, -0.9, -0.4, -0.2, -0.3, -0.2]
        lean = [0.0, -0.1, 0.1, 0.3, 0.2, 0.05]; twist = [0, -0.25, 0.1, 0.4, 0.2, 0]
        o = [-0.3, -0.5, -0.6, -0.6, -0.5, -0.3]
    elif STYLE == 'cast':  # varinha: ergue e aponta
        a = [-0.2, -0.9, -1.5, -1.95, -1.4, -0.5]
        fa = [-0.2, -0.6, -0.5, -0.3, -0.3, -0.2]
        lean = [0, -0.1, -0.05, 0.18, 0.1, 0.0]; twist = [0, -0.15, 0.0, 0.2, 0.1, 0]
        o = [-0.4, -0.8, -1.1, -1.3, -1.0, -0.5]
    elif STYLE == 'shoot':  # rifle: mira firme, coice no disparo
        a = [-0.6, -1.1, -1.25, -0.45, -0.9, -0.8]
        fa = [-0.5, -0.8, -0.8, -0.3, -0.6, -0.5]
        lean = [0, 0.1, 0.12, -0.3, -0.1, 0]; twist = [0, 0.1, 0.1, -0.15, 0, 0]
        o = [-0.6, -1.1, -1.25, -0.45, -0.9, -0.8]
    else:                  # 'pray': cajado sobe e bate no chão
        a = [-0.2, -0.9, -1.4, -1.0, -0.6, -0.2]
        fa = [-0.2, -0.5, -0.7, -0.4, -0.3, -0.2]
        lean = [0, -0.08, -0.12, 0.12, 0.05, 0]; twist = [0, 0, 0, 0, 0, 0]
        o = [-0.2, -0.9, -1.3, -1.1, -0.6, -0.2]
    rot = {W: [(AX, a[f] * k)], 'fore_arm.' + WS: [(AX, fa[f])], O: [(AX, o[f] * AMP)],
           'hips': [(AX, lean[f] * k), (AZ, twist[f] * k)], 'spine': [(AZ, twist[f] * 0.5)]}
    return dict(rot=rot, hipz=0.01 * f / n if f < 4 else 0.0)

def skill(f, n):
    up = [0, -0.04, 0.04, 0.12, 0.08, 0.0, 0.0, 0.0]
    arms = [-0.2, -0.4, -0.9, -1.5, -1.3, -0.7, -0.3, -0.1]
    lean = [0, -0.1, -0.2, 0.0, 0.3, 0.15, 0.05, 0]
    crouch = [0, 0.5, 0.2, 0, 0.2, 0.3, 0.1, 0]
    rot = {'upper_arm.R': [(AX, arms[f])], 'upper_arm.L': [(AX, arms[f])], 'hips': [(AX, lean[f])],
           'thigh.R': [(AX, -crouch[f])], 'thigh.L': [(AX, -crouch[f])], 'shin.R': [(AX, crouch[f] * 1.6)], 'shin.L': [(AX, crouch[f] * 1.6)],
           'head': [(AX, -0.1 if f < 3 else 0.1)]}
    return dict(rot=rot, hipz=up[f])

def hit(f, n):
    t = [0.6, 1.0, 0.3][f]
    rot = {'hips': [(AX, -0.3 * t)], 'head': [(AX, -0.25 * t)], 'upper_arm.R': [(AX, 0.4 * t)], 'upper_arm.L': [(AX, 0.4 * t)]}
    return dict(rot=rot, hipy=0.04 * t, hipz=-0.01 * t)

def dash(f, n):  # investida / rolamento: corpo baixo e inclinado, passada larga, braços para trás
    lean = [0.2, 0.4, 0.45, 0.35][f]; stride = [-0.4, -1.0, 0.7, -0.9][f]; knee = [0.6, 1.0, 0.4, 0.9][f]; arms = [0.25, 0.55, 0.6, 0.45][f]  # braços pouco para trás: a capa/poncho acompanha os braços e rasga se eles vão longe
    rot = {'hips': [(AX, lean), (AZ, [0.0, -0.1, 0.1, -0.05][f])], 'spine': [(AX, 0.1)], 'head': [(AX, -0.25)],
           'thigh.R': [(AX, stride * LEG)], 'thigh.L': [(AX, -stride * 0.9 * LEG)], 'shin.R': [(AX, knee * LEG)], 'shin.L': [(AX, (1.2 - knee) * LEG)],
           'upper_arm.R': [(AX, arms)], 'upper_arm.L': [(AX, arms)], 'fore_arm.R': [(AX, -0.3)], 'fore_arm.L': [(AX, -0.3)]}
    return dict(rot=rot, hipz=[-0.03, 0.0, 0.02, 0.0][f])

CLIPS = {'idle': idle, 'walk': walk, 'attack': attack, 'skill': skill, 'hit': hit, 'dash': dash}
arm.animation_data_create()
for cname, fn in CLIPS.items():
    n = FPS[cname]
    act = bpy.data.actions.new(cname); act.use_fake_user = True
    arm.animation_data.action = act
    loop = cname in ('idle', 'walk')
    for f in range(n + (1 if loop else 0)):
        pose(**fn(f % n, n))
        for b in pb:
            b.keyframe_insert('rotation_quaternion', frame=f)
            b.keyframe_insert('location', frame=f)
    if preview:  # imagens de conferência: um quadro de cada clipe
        pass
bpy.ops.object.mode_set(mode='OBJECT')

if preview:
    os.makedirs(preview, exist_ok=True)
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x = sc.render.resolution_y = 500
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = h * 1.4
    cam.location = (cx, -10, zc); cam.rotation_euler = (1.5708, 0, 0)
    for cname, frames in (('walk', (0, 2, 4)), ('attack', (1, 3, 4)), ('skill', (1, 3, 4)), ('hit', (1,))):
        arm.animation_data.action = bpy.data.actions[cname]
        for f in frames:
            sc.frame_set(f)
            sc.render.filepath = os.path.join(preview, f'{cname}_{f}.png')
            bpy.ops.render.render(write_still=True)

# exporta tudo: seleciona malha + esqueleto
os.makedirs(os.path.dirname(out_glb), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True); arm.select_set(True)
arm.animation_data.action = None
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_skins=True, export_force_sampling=True, export_frame_range=False)
print('RIG done', out_glb, 'verts', V, 'bones', n)
