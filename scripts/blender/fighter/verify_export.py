"""Verify the exported fighter in a clean Blender session.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python scripts/blender/fighter/verify_export.py -- [glb|fbx] [render_dir]

Checks (prints PASS/FAIL lines, exits non-zero on failure):
  * exactly one armature with the expected humanoid bones
  * a skinned mesh bound to it (armature modifier + weighted vertex groups)
  * every pose clip came through as an animation
  * applying each clip really deforms the mesh (vertex displacement > 0)
Optionally renders each imported clip to render_dir for a visual check.
"""
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_util as RU  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FMT = argv[0] if argv else "glb"
RENDER_DIR = argv[1] if len(argv) > 1 else None
PATH = os.path.join(ROOT, "assets", "3d", "fighter", "export", f"martialdex_fighter.{FMT}")

REQUIRED_BONES = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"] + [
    f"{s}{b}" for s in ("Left", "Right")
    for b in ("Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase",
              "HandThumb1", "HandIndex1", "HandMiddle3", "HandPinky3")
]

failures = []


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def mesh_coords(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    return (np.array(ob.matrix_world) @ np.c_[co.reshape(-1, 3), np.ones(len(co) // 3)].T).T[:, :3]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    check(os.path.exists(PATH), f"file exists {PATH} ({os.path.getsize(PATH) / 1e6:.1f} MB)")
    if FMT == "glb":
        bpy.ops.import_scene.gltf(filepath=PATH)
    else:
        bpy.ops.import_scene.fbx(filepath=PATH, use_anim=True)

    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    check(len(arms) == 1, f"one armature (found {len(arms)})")
    rig = arms[0]
    names = {b.name for b in rig.data.bones}
    missing = [b for b in REQUIRED_BONES if b not in names]
    check(not missing, f"humanoid bones present ({len(names)} bones) missing={missing}")

    skinned = [m for m in meshes if any(md.type == "ARMATURE" and md.object == rig for md in m.modifiers)]
    check(len(skinned) >= 1, f"skinned mesh bound to armature ({[m.name for m in skinned]})")
    body = skinned[0]
    me = body.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    check(len(body.vertex_groups) >= 50, f"vertex groups={len(body.vertex_groups)} verts={len(me.vertices)} tris={tris}")
    check(len(me.materials) >= 3, f"materials={[m.name for m in me.materials]}")
    vcols = list(me.color_attributes.keys()) if hasattr(me, "color_attributes") else list(me.vertex_colors.keys())
    check(len(vcols) >= 1, f"vertex colours={vcols}")
    zs = mesh_coords(body)[:, 2]
    check(1.75 < zs.max() - zs.min() < 1.85, f"height {zs.max() - zs.min():.3f} m")

    acts = list(bpy.data.actions)
    print("ACTIONS", [a.name for a in acts])
    check(len(acts) >= 3, f"animations imported ({len(acts)})")

    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = None
    for tr in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(tr)
    for pb in rig.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    rest = mesh_coords(body)

    if RENDER_DIR:
        os.makedirs(RENDER_DIR, exist_ok=True)
        RU.setup(res=(500, 700))
        RU.floor()
    for act in acts:
        rig.animation_data.action = act
        f0 = int(act.frame_range[0])
        bpy.context.scene.frame_set(f0)
        bpy.context.view_layer.update()
        posed = mesh_coords(body)
        disp = np.linalg.norm(posed - rest, axis=1).max()
        clip = act.name.split("|")[0] if "|" in act.name else act.name
        # the bind pose clip is expected not to move anything
        expect_move = "A_Rest" not in act.name
        check((disp > 0.05) == expect_move, f"clip {act.name}: max vertex displacement {disp:.3f} m")
        if RENDER_DIR:
            hz = rig.pose.bones["Hips"].head
            hips_w = rig.matrix_world @ hz
            tgt = (hips_w.x, hips_w.y, 0.95 if hips_w.z > 0.6 else 0.35)
            RU.orbit(tgt, 4.2 if hips_w.z > 0.6 else 3.6, 30, 10)
            RU.render(os.path.join(RENDER_DIR, f"import_{FMT}_{clip}.png"))

    print("RESULT", "OK" if not failures else f"{len(failures)} FAILURES")
    if failures:
        sys.exit(1)


main()
