#!/bin/bash
# Quick visual check: stage-1 export + close-ups -> contact sheet at $1
set -e
B=/Applications/Blender.app/Contents/MacOS/Blender
D=scripts/blender/fighter
S=${2:-/tmp}
$B -b --factory-startup assets/3d/fighter/fighter_base.blend --python $D/stage1_pose_export.py >/dev/null 2>&1
$B -b assets/3d/fighter/fighter.blend --python $D/debug_render.py -- $S/d Idle_Reference "face:0,0,1.67:0.55:0:0:50" "face34:0,0,1.67:0.55:35:0:50" "torso:0,0,1.2:1.6:0:0:50" "back:0,0,1.0:3.2:180:0:50" "side:0,0,1.0:3.2:90:0:50" >/dev/null 2>&1
$B -b assets/3d/fighter/fighter.blend --python $D/debug_render.py -- $S/d A_Rest "hand:0.62,-0.03,0.98:0.45:30:0:50" "foot:0.13,-0.05,0.08:0.6:30:10:50" >/dev/null 2>&1
R=assets/3d/fighter/renders
python3 $D/contact_sheet.py $1 assets/3d/fighter/reference/meshy_reference.png $R/Idle_Reference_front.png $R/Guard_Orthodox_front.png $R/Guard_Orthodox_34.png $S/d_face.png $S/d_face34.png $S/d_torso.png $S/d_back.png $S/d_side.png $S/d_hand.png $S/d_foot.png
