"""Stage 1 — pose test + export of the base fighter.

Run (after build_fighter.py):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      assets/3d/fighter/fighter_base.blend \
      --python scripts/blender/fighter/stage1_pose_export.py -- [--poses stage1|all] [--no-render]

1. Bakes each pose into its own Action (one keyframe, constant interpolation).
2. Renders every pose (front + 3/4) to assets/3d/fighter/renders/.
3. Pushes every action to its own NLA track and exports
   assets/3d/fighter/export/martialdex_fighter.glb (+ .fbx).
4. Saves the posed working file assets/3d/fighter/fighter.blend.
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pose_lib as PL  # noqa: E402
import render_util as RU  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BASE = os.path.join(ROOT, "assets", "3d", "fighter")
RENDERS = os.path.join(BASE, "renders")
EXPORT = os.path.join(BASE, "export")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHICH = argv[argv.index("--poses") + 1] if "--poses" in argv else "stage1"
DO_RENDER = "--no-render" not in argv
ONLY = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None


def pose_table():
    if WHICH == "stage1":
        return dict(PL.STAGE1_POSES)
    import positions  # stage 2 library
    t = dict(PL.STAGE1_POSES)
    t.update(positions.SINGLE_POSES)
    return t


def render_pose(rig, name):
    hips = rig.pose.bones["Hips"].head
    tgt = (hips.x, hips.y, 0.95 if hips.z > 0.6 else 0.35)
    dist = 4.2 if hips.z > 0.6 else 3.6
    RU.orbit(tgt, dist, 0, 4)
    RU.render(os.path.join(RENDERS, f"{name}_front.png"))
    RU.orbit(tgt, dist, 40, 12)
    RU.render(os.path.join(RENDERS, f"{name}_34.png"))


def export(rig, body):
    os.makedirs(EXPORT, exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(o in (rig, body))
    bpy.context.view_layer.objects.active = rig
    glb = os.path.join(EXPORT, "martialdex_fighter.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_nla_strips=True,
        export_force_sampling=True,
        export_def_bones=True,
        export_skins=True,
        export_all_influences=False,
        export_morph=False,
        export_yup=True,
    )
    fbx = os.path.join(EXPORT, "martialdex_fighter.fbx")
    bpy.ops.export_scene.fbx(
        filepath=fbx,
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_actions=True,  # NLA tracks are muted, so export every action
        bake_anim_use_nla_strips=False,
        bake_anim_force_startend_keying=True,
        primary_bone_axis="Y",
        secondary_bone_axis="X",
        armature_nodetype="NULL",
        path_mode="AUTO",
    )
    print("EXPORT glb", os.path.getsize(glb), "fbx", os.path.getsize(fbx))


def main():
    rig = bpy.data.objects["FighterRig"]
    body = bpy.data.objects["FighterBody"]
    os.makedirs(RENDERS, exist_ok=True)
    if DO_RENDER:
        RU.setup()
        RU.floor()
    actions = []
    for name, fn in pose_table().items():
        act = PL.bake_pose(rig, body, name, fn)
        actions.append(act)
        rig.animation_data.action = act
        bpy.context.scene.frame_set(1)
        if DO_RENDER and (ONLY is None or name in ONLY):
            render_pose(rig, name)
        print("POSE", name, "ok")
    RU.remove_helpers()
    PL.push_actions_to_nla(rig, actions)
    PL.PoseBuilder(rig).reset()
    export(rig, body)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BASE, "fighter.blend"), compress=True)


main()
