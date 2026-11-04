# Separa o GLB com 3 heróis em 3 GLBs (por ilha de malha + faixas em X) e descarta peças soltas.
# uso: blender -b --python split.py -- <chibi_heroes.glb> <saida_dir> [--list]
import bpy, sys, numpy as np, bmesh, os
a = sys.argv[sys.argv.index('--')+1:]
glb, outd = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
src=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
bpy.context.view_layer.objects.active=src; src.select_set(True)
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me=src.data; V=len(me.vertices)
co=np.empty(V*3,dtype=np.float32); me.vertices.foreach_get('co',co); w=co.reshape(-1,3)
bm=bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
seen=set(); isl=[]
for v in bm.verts:
    if v.index in seen: continue
    st=[v]; seen.add(v.index); comp=[]
    while st:
        x=st.pop(); comp.append(x.index)
        for ed in x.link_edges:
            b=ed.other_vert(x)
            if b.index not in seen: seen.add(b.index); st.append(b)
    isl.append(np.array(comp))
def hero_of(cx): return 'inquisitor_nv25' if cx < -0.37 else ('arcane_nv25' if cx < 0.25 else 'paladin_nv25')
# ilhas pequenas e isoladas (sem vizinha por perto) = soltas
info=[]
for i,c in enumerate(isl):
    p=w[c]; info.append((i,len(c),p.min(0),p.max(0),p.mean(0)))
drop=set()
CR=np.array([0.164,0.0,0.01])
for i,n,mn,mx,mu in info:
    if 0.14<=mn[0] and mx[0]<=0.19 and -0.06<=mn[2] and mx[2]<=0.07 and mx[1]<-0.03 and n<300:
        print('CANDIDATO solto (cristal flutuante?)', i, n, mn.round(3), mx.round(3))
        if '--list' not in a: drop.add(i)
vh=np.empty(V,dtype=object)
for i,c in enumerate(isl):
    vh[c]='drop' if i in drop else hero_of(info[i][4][0])
os.makedirs(outd,exist_ok=True)
for name in ('inquisitor_nv25','arcane_nv25','paladin_nv25'):
    if '--list' in a: break
    dup=src.copy(); dup.data=src.data.copy(); bpy.context.scene.collection.objects.link(dup)
    b2=bmesh.new(); b2.from_mesh(dup.data); b2.verts.ensure_lookup_table()
    bmesh.ops.delete(b2, geom=[b2.verts[k] for k in range(V) if vh[k]!=name], context='VERTS')
    b2.to_mesh(dup.data); b2.free()
    dup.name=name
    # um GLB por herói
    bpy.ops.object.select_all(action='DESELECT'); dup.select_set(True); bpy.context.view_layer.objects.active=dup
    pts=np.array([dup.matrix_world@v.co for v in dup.data.vertices])
    print('HERO',name,len(dup.data.vertices),'min',pts.min(0).round(3),'max',pts.max(0).round(3))
    bpy.ops.export_scene.gltf(filepath=os.path.join(outd,name+'.glb'),export_format='GLB',use_selection=True,export_animations=False)
    bpy.data.objects.remove(dup)
