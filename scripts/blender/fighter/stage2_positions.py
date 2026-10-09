"""Stage 2 — MARTIALDEX 상황판단 position library: bake, render, export, manifest.

Run (after build_fighter.py):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      assets/3d/fighter/fighter_base.blend \
      --python scripts/blender/fighter/stage2_positions.py -- [--no-render] [--only Mount,Jab_Orthodox]

Outputs
  assets/3d/fighter/export/martialdex_fighter.glb   one skinned model, one clip per pose
  assets/3d/fighter/export/martialdex_fighter.fbx
  assets/3d/fighter/export/positions.json           scenario manifest for the app
  assets/3d/fighter/renders/*.png                   preview of every pose / pair
  assets/3d/fighter/fighter.blend                   working file with all actions
"""
import json
import os
import sys

import bpy
import mathutils
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pose_lib as PL  # noqa: E402
import positions as POS  # noqa: E402
import render_util as RU  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BASE = os.path.join(ROOT, "assets", "3d", "fighter")
RENDERS = os.path.join(BASE, "renders")
EXPORT = os.path.join(BASE, "export")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DO_RENDER = "--no-render" not in argv
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None


def make_opponent(rig, body):
    """Second fighter for authoring/rendering pairs (shares mesh + armature data)."""
    rigB = rig.copy()
    rigB.name = "FighterRig_B"
    rigB.animation_data_clear()
    bodyB = body.copy()
    bodyB.name = "FighterBody_B"
    bodyB.parent = rigB
    for md in bodyB.modifiers:
        if md.type == "ARMATURE":
            md.object = rigB
    for o in (rigB, bodyB):
        bpy.context.scene.collection.objects.link(o)
    # blue shirt on the opponent in previews only (object-linked material slot)
    shirt = bpy.data.materials["Shirt_Compression"].copy()
    shirt.name = "_Shirt_Opponent"
    shirt.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02, 0.05, 0.16, 1)
    idx = list(bodyB.data.materials).index(bpy.data.materials["Shirt_Compression"])
    bodyB.material_slots[idx].link = "OBJECT"
    bodyB.material_slots[idx].material = shirt
    return rigB, bodyB


def show(objs, visible):
    for o in objs:
        o.hide_render = not visible
        o.hide_viewport = not visible


def bvh(body):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    M = body.matrix_world
    verts = [M @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


def pair_overlap(bodyA, bodyB):
    return len(bvh(bodyA).overlap(bvh(bodyB)))


def render_single(rig, name):
    hips = rig.pose.bones["Hips"].head
    tgt = (hips.x, hips.y, 0.95)
    RU.orbit(tgt, 4.4, 25, 8)
    RU.render(os.path.join(RENDERS, f"{name}_34.png"))
    RU.orbit(tgt, 4.4, 90, 4)
    RU.render(os.path.join(RENDERS, f"{name}_side.png"))


def render_pair(name, standing):
    tgt = (0, 0, 0.85 if standing else 0.35)
    d = 4.6 if standing else 3.8
    RU.orbit(tgt, d, 55, 18)
    RU.render(os.path.join(RENDERS, f"pair_{name}_34.png"))
    RU.orbit(tgt, d, 95, 8)
    RU.render(os.path.join(RENDERS, f"pair_{name}_side.png"))
    RU.orbit(tgt, d, -30, 35)
    RU.render(os.path.join(RENDERS, f"pair_{name}_top.png"))


def apply_action(rig, act):
    rig.animation_data.action = act
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def main():
    rig = bpy.data.objects["FighterRig"]
    body = bpy.data.objects["FighterBody"]
    rigB, bodyB = make_opponent(rig, body)
    os.makedirs(RENDERS, exist_ok=True)
    if DO_RENDER:
        RU.setup(res=(640, 640))
        RU.floor(size=8)
    if rig.animation_data is None:
        rig.animation_data_create()
    if rigB.animation_data is None:
        rigB.animation_data_create()

    actions = []
    report = {}

    singles = dict(PL.STAGE1_POSES)
    singles.update(POS.SINGLE_POSES)
    show((rigB, bodyB), False)
    for name, fn in singles.items():
        act = PL.bake_pose(rig, body, name, fn)
        actions.append(act)
        apply_action(rig, act)
        if DO_RENDER and (ONLY is None or name in ONLY):
            render_single(rig, name)
        print("POSE", name)

    show((rigB, bodyB), True)
    for name, (fn, clip_a, clip_b) in POS.PAIR_POSES.items():
        A = PL.PoseBuilder(rig, body)
        B = PL.PoseBuilder(rigB, bodyB)
        A.reset()
        B.reset()
        fn(A, B)
        ov = pair_overlap(body, bodyB)
        report[name] = ov
        act_a = PL.key_pose(rig, clip_a)
        act_b = PL.key_pose(rigB, clip_b)
        actions += [act_a, act_b]
        apply_action(rig, act_a)
        apply_action(rigB, act_b)
        standing = rig.pose.bones["Hips"].head.z > 0.6 and rigB.pose.bones["Hips"].head.z > 0.6
        if DO_RENDER and (ONLY is None or name in ONLY):
            render_pair(name, standing)
        print("PAIR", name, "overlapping triangle pairs:", ov)

    # export: only fighter A (the clips are skeleton-compatible for both roles)
    rig.animation_data.action = None
    rigB.animation_data.action = None
    for o in (rigB, bodyB):
        bpy.data.objects.remove(o)
    RU.remove_helpers()
    PL.push_actions_to_nla(rig, actions)
    PL.PoseBuilder(rig, body).reset()
    export(rig, body)
    write_manifest([a.name for a in actions], report)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BASE, "fighter.blend"), compress=True)


def export(rig, body):
    os.makedirs(EXPORT, exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(o in (rig, body))
    bpy.context.view_layer.objects.active = rig
    glb = os.path.join(EXPORT, "martialdex_fighter.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format="GLB", use_selection=True, export_apply=False,
        export_animations=True, export_nla_strips=True, export_force_sampling=True,
        export_def_bones=True, export_skins=True, export_all_influences=False,
        export_morph=False, export_yup=True,
    )
    fbx = os.path.join(EXPORT, "martialdex_fighter.fbx")
    bpy.ops.export_scene.fbx(
        filepath=fbx, use_selection=True, object_types={"ARMATURE", "MESH"}, add_leaf_bones=False,
        bake_anim=True, bake_anim_use_all_actions=True, bake_anim_use_nla_strips=False,
        bake_anim_force_startend_keying=True, primary_bone_axis="Y", secondary_bone_axis="X",
        armature_nodetype="NULL", path_mode="AUTO",
    )
    print("EXPORT glb", os.path.getsize(glb), "fbx", os.path.getsize(fbx))


def write_manifest(clips, overlap):
    pairs = {k: {"clips": [a, b]} for k, (_fn, a, b) in POS.PAIR_POSES.items()}
    data = {
        "model": "martialdex_fighter.glb",
        "coordinateSystem": "glTF: Y-up, metres; a fighter with yaw 0 faces +Z",
        "usage": ("Load the model once per fighter. Single clips are authored at the origin; place them with "
                  "position/yawDeg. Pair clips are authored in one shared frame: load both fighters at the "
                  "origin with no extra transform and play one clip on each."),
        "clips": clips,
        "pairs": pairs,
        "scenarios": POS.SCENARIOS,
        "qa": {"pairMeshOverlapTrianglePairs": overlap},
    }
    with open(os.path.join(EXPORT, "positions.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("MANIFEST", len(clips), "clips", len(POS.SCENARIOS), "scenarios")


main()
