"""Ad-hoc close-up renders: ... --python debug_render.py -- out_prefix action "name:tx,ty,tz:dist:yaw:pitch:lens" ..."""
import os, sys
import bpy
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import render_util as RU
argv = sys.argv[sys.argv.index("--") + 1:]
prefix, action, views = argv[0], argv[1], argv[2:]
rig = bpy.data.objects["FighterRig"]
if action != "none":
    if rig.animation_data is None: rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(1)
RU.setup(res=(700, 700))
for v in views:
    name, t, dist, yaw, pitch, lens = v.split(":")
    RU.orbit([float(a) for a in t.split(",")], float(dist), float(yaw), float(pitch), float(lens))
    RU.render(f"{prefix}_{name}.png")
