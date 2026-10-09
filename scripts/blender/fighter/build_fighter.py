"""MARTIALDEX fighter — base model + rig builder.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python scripts/blender/fighter/build_fighter.py

Output: assets/3d/fighter/fighter_base.blend  (mesh "FighterBody" skinned to
armature "FighterRig", A-pose rest)

Pipeline
  1. sdf_body.py: anatomical signed-distance primitives blended with
     smooth-min, meshed with surface nets and projected onto the surface.
  2. Clothing borders cut with planes (crisp shirt hem / sleeves / crew
     neckline / shorts hem) and cloth materials assigned per body region.
  3. Hair volume added by displacement; hair, brows, lips and beard shadow
     are painted as smooth vertex colours (exported as glTF COLOR_0).
  4. Decimated to a real-time budget, keeping cloth borders dense.
  5. Eyeballs, humanoid armature (Mixamo-style names, no prefix), automatic
     weights.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sdf_body  # noqa: E402
import skeleton as SK  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "assets", "3d", "fighter")
OUT_BLEND = os.path.join(OUT_DIR, "fighter_base.blend")

GRID = 0.0025  # surface-nets cell size (m)
TARGET_FACES = 26000  # quads before triangulation (~52k tris final)

J = SK.joints()

MAT_SKIN, MAT_SHIRT, MAT_SHORTS, MAT_EYE, MAT_IRIS = range(5)

# linear-space colours
SKIN = (0.64, 0.36, 0.25)
HAIR = (0.016, 0.011, 0.008)
LIPS = (0.46, 0.21, 0.17)
SHIRT = (0.010, 0.010, 0.012)
SHORTS = (0.018, 0.018, 0.020)
EYE_WHITE = (0.80, 0.77, 0.73)
IRIS = (0.045, 0.026, 0.015)


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


# ---------------------------------------------------------------- body mesh
def build_body_sdf():
    F, origin = sdf_body.grid_field(GRID)
    verts, quads = sdf_body.surface_nets(F, origin, GRID)
    del F
    print("surface nets:", len(verts), "verts", len(quads), "quads")
    verts = sdf_body.project(verts, iters=2)
    me = bpy.data.meshes.new("FighterBody")
    me.from_pydata(verts.tolist(), [], quads.tolist())
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("FighterBody", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    for md in list(ob.modifiers):
        ob.modifiers.remove(md)
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)


def get_co_nor(me):
    n = len(me.vertices)
    co = np.empty(n * 3)
    nor = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    me.vertices.foreach_get("normal", nor)
    return co.reshape(-1, 3), nor.reshape(-1, 3)


# ---------------------------------------------------------------- regions
def seg_dist(P, a, b):
    a, b = np.array(a), np.array(b)
    ab = b - a
    t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def segments():
    segs = [  # (label, side, a, b, radius)
        ("torso", 0, (0, 0, 0.82), (0, 0, 1.44), 0.14),
        ("neck", 0, (0, 0.02, 1.47), (0, 0.015, 1.58), 0.058),
        ("head", 0, (0, 0.0, 1.62), (0, 0.0, 1.73), 0.085),
    ]
    for s in (1, -1):
        m = lambda v: tuple(SK.mirror(Vector(v), s))  # noqa: E731
        segs += [
            ("upperarm", s, m(J["shoulder"]), m(J["elbow"]), 0.048),
            ("forearm", s, m(J["elbow"]), m(J["wrist"]), 0.036),
            ("hand", s, m(J["wrist"]), m(J["finger_Middle"][-1]), 0.03),
            ("thigh", s, m(J["hip"]), m(J["knee"]), 0.075),
            ("shin", s, m(J["knee"]), m(J["ankle"]), 0.045),
            ("foot", s, m(J["heel"]), m(J["toe"]), 0.035),
        ]
    return segs


def label_points(P):
    segs = segments()
    D = np.stack([seg_dist(P, a, b) - r for (_l, _s, a, b, r) in segs], axis=1)
    return [segs[i] for i in np.argmin(D, axis=1)]


HEM_Z = 0.950
NECK_P, NECK_N = Vector((0, -0.05, 1.488)), Vector((0, -0.25, 1)).normalized()
SLEEVE_T = 0.165  # metres down the upper arm from the shoulder joint


def sleeve_plane(s):
    d = SK.mirror(SK.ARM_DIR, s)
    return SK.mirror(J["shoulder"], s) + d * SLEEVE_T, d


def shorts_plane(s):
    H, K = SK.mirror(J["hip"], s), SK.mirror(J["knee"], s)
    return lerp(H, K, sdf_body.SHORTS_T) + (H - K).normalized() * 0.001, (H - K).normalized()


def classify_face(c, lab):
    label, side = lab[0], lab[1]
    above_neck = (c - NECK_P).dot(NECK_N) > 0
    if label == "head":
        return MAT_SKIN
    if label == "neck":
        return MAT_SKIN if above_neck else MAT_SHIRT
    if label in ("torso", "thigh"):
        if above_neck:
            return MAT_SKIN
        if c.z > HEM_Z:
            return MAT_SHIRT
        if label == "thigh":
            p, n = shorts_plane(side)
            return MAT_SHORTS if (c - p).dot(n) > 0 else MAT_SKIN
        return MAT_SHORTS
    if label == "upperarm":
        p, n = sleeve_plane(side)
        return MAT_SHIRT if (c - p).dot(n) < 0 else MAT_SKIN
    return MAT_SKIN


def cut_and_assign(ob):
    """Bisect the surface along every clothing border, then assign cloth
    materials by region so borders are straight lines, not voxel stairs."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)

    def cut(labels, sides, co, no):
        bm.faces.ensure_lookup_table()
        C = np.array([f.calc_center_median() for f in bm.faces])
        labs = label_points(C)
        faces = [f for f, l in zip(bm.faces, labs) if l[0] in labels and (sides is None or l[1] in sides)]
        geom = list({e for f in faces for e in f.edges}) + faces + list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-5)

    cut({"torso", "thigh"}, None, Vector((0, 0, HEM_Z)), Vector((0, 0, 1)))
    cut({"torso", "neck"}, None, NECK_P, NECK_N)
    for s in (1, -1):
        p, n = sleeve_plane(s)
        cut({"upperarm"}, {s}, p, n)
        p, n = shorts_plane(s)
        cut({"thigh"}, {s}, p, n)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])

    bm.faces.ensure_lookup_table()
    C = np.array([f.calc_center_median() for f in bm.faces])
    for f, c, l in zip(bm.faces, C, label_points(C)):
        f.material_index = classify_face(Vector(c), l)
    bm.to_mesh(me)
    bm.free()


# ---------------------------------------------------------------- head masks
def head_masks(co):
    """Soft 0..1 masks for hair, brows, lips and beard shadow."""
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    front = smoothstep((-0.055 - y) / 0.015)
    phi = np.arctan2(np.abs(x), -(y - 0.005))  # 0 = front, pi = back
    hl = np.interp(phi, [0.0, 0.7, 1.15, 1.45, 1.9, 2.4, math.pi],
                   [1.745, 1.738, 1.712, 1.692, 1.684, 1.640, 1.608])
    e = np.sqrt(((np.abs(x) - 0.080) / 0.022) ** 2 + ((y - 0.010) / 0.032) ** 2 + ((z - 1.657) / 0.040) ** 2)
    ear = smoothstep((1.25 - e) / 0.3)
    hair = smoothstep((z - hl) / 0.005 + 0.5) * (z > 1.58) * (1 - ear)
    brow = np.zeros(len(co))
    for s in (1, -1):
        u = (x - 0.034 * s) / 0.025
        arch = 1.704 + 0.004 * (1 - u ** 2)
        thick = 0.0055 - 0.002 * np.clip(u * s, 0, 1)
        r = np.sqrt(u * u + ((z - arch) / thick) ** 2)
        brow = np.maximum(brow, smoothstep((1.0 - r) / 0.45) * front)
    lips = np.zeros(len(co))
    for zc, rx, rz in ((1.600, 0.018, 0.0048), (1.5885, 0.015, 0.0055)):
        r = np.sqrt((x / rx) ** 2 + ((z - zc) / rz) ** 2)
        lips = np.maximum(lips, smoothstep((1.0 - r) / 0.35) * (y < -0.088))
    beard = smoothstep((1.622 - z) / 0.02) * smoothstep((z - 1.548) / 0.01) * smoothstep((-0.02 - y) / 0.03)
    beard *= 1 - lips
    return hair, brow, lips, beard


def sculpt(ob):
    """Hair volume (short textured crop, a bit fuller on top) + brow lift."""
    me = ob.data
    co, nor = get_co_nor(me)
    hair, brow, _lips, _beard = head_masks(co)
    top = smoothstep((co[:, 2] - 1.70) / 0.08)
    co += nor * (hair * (0.0035 + 0.0070 * top) + brow * 0.0012)[:, None]
    me.vertices.foreach_set("co", co.ravel())
    me.update()


def cloth_offset(ob, amount=0.0015):
    """Lift the compression shirt off the skin a hair so hem/sleeve/neckline
    read as a fabric edge."""
    me = ob.data
    shirt = np.zeros(len(me.vertices), bool)
    other = np.zeros(len(me.vertices), bool)
    for poly in me.polygons:
        vs = list(poly.vertices)
        if poly.material_index == MAT_SHIRT:
            shirt[vs] = True
        else:
            other[vs] = True
    co, nor = get_co_nor(me)
    co += nor * ((shirt & ~other) * amount)[:, None]
    me.vertices.foreach_set("co", co.ravel())
    me.update()


def keep_group(ob):
    """Vertex group of cloth borders (+1 ring), fingers/toes and face, used to
    protect detail from decimation."""
    me = ob.data
    mats = {}
    for poly in me.polygons:
        for v in poly.vertices:
            mats.setdefault(v, set()).add(poly.material_index)
    border = [v for v, s in mats.items() if len(s) > 1]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    ring = set(border)
    for v in border:
        for e in bm.verts[v].link_edges:
            ring.add(e.other_vert(bm.verts[v]).index)
    bm.free()
    vg = ob.vertex_groups.new(name="_keep")
    vg.add(list(ring), 1.0, "REPLACE")
    co, _ = get_co_nor(me)
    labs = label_points(co)
    detail = [i for i, l in enumerate(labs) if l[0] in ("hand", "foot")]
    head = np.where(co[:, 2] > 1.53)[0].tolist()
    vg.add(detail + head, 0.5, "ADD")


# ---------------------------------------------------------------- materials
def make_materials():
    specs = [
        ("Skin", (1.0, 1.0, 1.0), 0.55, True),
        ("Shirt_Compression", SHIRT, 0.42, False),
        ("Shorts", SHORTS, 0.78, False),
        ("Eye_White", EYE_WHITE, 0.15, False),
        ("Eye_Iris", IRIS, 0.10, False),
    ]
    mats = []
    for name, col, rough, use_vcol in specs:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*col, 1)
        bsdf.inputs["Roughness"].default_value = rough
        if use_vcol:
            # hair / brows / lips / beard shadow live in the vertex colours
            vc = nt.nodes.new("ShaderNodeVertexColor")
            vc.layer_name = "Col"
            vc.location = (-300, 200)
            nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        mat.diffuse_color = (*(c ** (1 / 2.2) for c in col), 1)
        mat.roughness = rough
        mats.append(mat)
    return mats


def paint_vertex_colors(ob):
    """Per-vertex colour (POINT domain, exported as glTF COLOR_0).

    glTF viewers multiply COLOR_0 into every material's base colour, so the
    attribute is a tint: skin/hair/brows/lips/beard shadow on the body and
    white on the eyeballs. Cloth borders keep crisp edges because cloth colour
    comes from the cloth materials (near-black base colour), not from here.
    (Corner-domain colours get scrambled across primitives by the Blender 3.4
    glTF exporter, so POINT domain is required.)
    """
    me = ob.data
    co, _ = get_co_nor(me)
    hair, brow, lips, beard = head_masks(co)
    col = np.array(SKIN)[None, :] * (1 - 0.18 * beard)[:, None]
    col = lerp(col, np.array(LIPS)[None, :], lips[:, None])
    col = lerp(col, np.array(HAIR)[None, :], np.maximum(hair, brow * 0.92)[:, None])
    eye = np.zeros(len(co), bool)
    for poly in me.polygons:
        if poly.material_index in (MAT_EYE, MAT_IRIS):
            eye[list(poly.vertices)] = True
    col[eye] = 1.0
    for name in list(me.color_attributes.keys()):
        me.color_attributes.remove(me.color_attributes[name])
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    rgba = np.ones((len(co), 4))
    rgba[:, :3] = col
    attr.data.foreach_set("color", rgba.ravel())
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.active_color_index


# ---------------------------------------------------------------- eyes
EYE_C = (0.032, -0.0775, 1.677)
EYE_R = 0.0122


def build_eyes(mats):
    bm = bmesh.new()
    for s in (1, -1):
        c = Vector((EYE_C[0] * s, EYE_C[1], EYE_C[2]))
        ret = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=EYE_R)
        R = Matrix.Rotation(math.radians(90), 4, "X")  # pole -> -Y (looking forward)
        bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ R, verts=ret["verts"])
    me = bpy.data.meshes.new("Eyes")
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
        c = Vector((EYE_C[0] * (1 if p.center.x > 0 else -1), EYE_C[1], EYE_C[2]))
        p.material_index = MAT_IRIS if (p.center - c).normalized().y < -0.80 else MAT_EYE
    ob = bpy.data.objects.new("Eyes", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- armature
def bone_table():
    """(name, head, tail, parent, z-hint). Z-hints make local X the main
    flexion axis for every joint (see pose_lib.py)."""
    t = [
        ("Hips", J["hips"], J["spine"], None, SK.FWD),
        ("Spine", J["spine"], J["spine1"], "Hips", SK.FWD),
        ("Spine1", J["spine1"], J["spine2"], "Spine", SK.FWD),
        ("Spine2", J["spine2"], J["neck"], "Spine1", SK.FWD),
        ("Neck", J["neck"], J["head"], "Spine2", SK.FWD),
        ("Head", J["head"], J["head_top"], "Neck", SK.FWD),
    ]
    for s, side in ((1, "Left"), (-1, "Right")):
        m = lambda v: SK.mirror(Vector(v), s)  # noqa: E731
        dorsal = -SK.mirror(SK.HAND_P, s)
        t += [
            (f"{side}Shoulder", m(J["clavicle"]), m(J["shoulder"]), "Spine2", SK.UP),
            (f"{side}Arm", m(J["shoulder"]), m(J["elbow"]), f"{side}Shoulder", SK.BACK),
            (f"{side}ForeArm", m(J["elbow"]), m(J["wrist"]), f"{side}Arm", SK.BACK),
            (f"{side}Hand", m(J["wrist"]), m(J["knuckles"]), f"{side}ForeArm", dorsal),
        ]
        for fname in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
            pts = [m(q) for q in J[f"finger_{fname}"]]
            parent = f"{side}Hand"
            for i in range(3):
                bn = f"{side}Hand{fname}{i + 1}"
                t.append((bn, pts[i], pts[i + 1], parent, dorsal))
                parent = bn
        t += [
            (f"{side}UpLeg", m(J["hip"]), m(J["knee"]), "Hips", SK.FWD),
            (f"{side}Leg", m(J["knee"]), m(J["ankle"]), f"{side}UpLeg", SK.FWD),
            (f"{side}Foot", m(J["ankle"]), m(J["ball"]), f"{side}Leg", SK.UP),
            (f"{side}ToeBase", m(J["ball"]), m(J["toe"]), f"{side}Foot", SK.UP),
        ]
    return t


def build_armature():
    arm = bpy.data.armatures.new("FighterRig")
    arm.display_type = "OCTAHEDRAL"
    ob = bpy.data.objects.new("FighterRig", arm)
    bpy.context.scene.collection.objects.link(ob)
    ob.show_in_front = True
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    for name, h, tl, parent, zh in bone_table():
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = Vector(h), Vector(tl)
        eb.align_roll(Vector(zh))
        if parent:
            eb.parent = arm.edit_bones[parent]
            eb.use_connect = (eb.parent.tail - eb.head).length < 1e-4
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def skin(body, rig):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


# ---------------------------------------------------------------- main
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"

    body = build_body_sdf()
    sm = body.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.3
    sm.iterations = 2
    apply_modifiers(body)
    print("body:", len(body.data.vertices), "verts")

    mats = make_materials()
    for m in mats:
        body.data.materials.append(m)
    sculpt(body)
    cut_and_assign(body)
    cloth_offset(body)

    keep_group(body)
    dec = body.modifiers.new("Decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, TARGET_FACES / len(body.data.polygons))
    dec.use_collapse_triangulate = True
    dec.vertex_group = "_keep"  # the group marks where decimation is allowed, so invert it
    dec.invert_vertex_group = True
    apply_modifiers(body)
    body.vertex_groups.remove(body.vertex_groups["_keep"])
    for p in body.data.polygons:
        p.use_smooth = True
    print("decimated:", len(body.data.polygons), "faces")

    rig = build_armature()
    skin(body, rig)

    eyes = build_eyes(mats)
    eyes.vertex_groups.new(name="Head").add(list(range(len(eyes.data.vertices))), 1.0, "REPLACE")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    eyes.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    paint_vertex_colors(body)

    rig.name = "FighterRig"
    body.name = "FighterBody"
    report(body, rig)
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
    print("saved", OUT_BLEND)


def report(body, rig):
    from collections import Counter
    me = body.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    print(f"REPORT verts={len(me.vertices)} tris={tris} bones={len(rig.data.bones)} "
          f"groups={len(body.vertex_groups)} mats={[m.name for m in me.materials]}")
    unweighted = sum(1 for v in me.vertices if not any(g.weight > 0.001 for g in v.groups))
    print(f"REPORT unweighted_verts={unweighted}")
    zs = [v.co.z for v in me.vertices]
    print(f"REPORT height={max(zs) - min(zs):.3f} min_z={min(zs):.3f}")
    print("REPORT faces_per_material", sorted(Counter(p.material_index for p in me.polygons).items()))


if __name__ == "__main__":
    main()
