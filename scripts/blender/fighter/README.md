# MARTIALDEX fighter (Blender 3.4)

Procedural, rigged 3D fighter built from `assets/3d/fighter/reference/meshy_reference.png`,
plus the pose/position library for 상황판단 training.

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
# 1. model + rig  -> assets/3d/fighter/fighter_base.blend   (~2 min)
$B -b --factory-startup --python scripts/blender/fighter/build_fighter.py
# 2. all poses/positions -> renders, export/martialdex_fighter.glb|fbx, export/positions.json, fighter.blend
$B -b --factory-startup assets/3d/fighter/fighter_base.blend --python scripts/blender/fighter/stage2_positions.py
#    (stage1_pose_export.py = the stage-1 subset: A_Rest / Idle_Reference / Stance_Orthodox)
# 3. verify the export in a clean session (bones, skin, materials, colours, every clip deforms)
$B -b --factory-startup --python scripts/blender/fighter/verify_export.py -- glb
python3 scripts/blender/fighter/inspect_glb.py assets/3d/fighter/export/martialdex_fighter.glb
```

| File | Role |
|---|---|
| `skeleton.py` | joint positions (A-pose rest), proportions measured from the reference |
| `sdf_body.py` | anatomy as smooth-blended signed-distance primitives + surface-nets mesher |
| `build_fighter.py` | mesh, clothing cuts, hair/face colours, decimation, armature, auto weights |
| `pose_lib.py` | pose toolkit (`place`, `aim`, `rot`, two-bone `reach` IK, `look`, `fist`, `ground`) |
| `positions.py` | single poses, two-fighter positions, training scenarios (manifest rows) |
| `stage2_positions.py` | bakes every pose to an Action, renders previews, exports, writes manifest |

Adding a position: write `pose_x(P)` (single) or `pair_x(A, B)` (two fighters) in `positions.py`,
register it in `SINGLE_POSES` / `PAIR_POSES`, add a `SCENARIOS` row, rerun step 2.
Change the body: edit `sdf_body.py` / `skeleton.py`, rerun steps 1–2 (poses are re-baked onto the new rig).

Model: 1.81 m, ~53k tris, 52 bones (Mixamo-style names without prefix: Hips, Spine…Head,
Left/RightShoulder/Arm/ForeArm/Hand, 15 finger bones per hand, UpLeg/Leg/Foot/ToeBase).
glTF is the primary format; FBX carries the same mesh/rig/clips, but the vertex-colour tint
(hair, brows, lips) is not wired to the material on FBX import.
