# Importa um GLB no Blender e renderiza vistas ortográficas simples (Workbench) para planejar o esqueleto.
# Uso: blender -b --python probe.py -- <glb> <saida_dir>
import bpy, sys, os, mathutils
glb, out = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
print('PROBE meshes', len(meshes), 'verts', sum(len(o.data.vertices) for o in meshes), 'min', tuple(round(v, 3) for v in mn), 'max', tuple(round(v, 3) for v in mx))
h = mx.z - mn.z
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 800
sc.render.film_transparent = False
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = h * 1.2
cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
for name, loc, rot in (('front', (cx, cy - 10, mn.z + h / 2), (1.5708, 0, 0)), ('side', (cx + 10, cy, mn.z + h / 2), (1.5708, 0, 1.5708))):
    cam.location = loc; cam.rotation_euler = rot
    sc.render.filepath = os.path.join(out, f'{name}.png')
    bpy.ops.render.render(write_still=True)
print('PROBE done')
