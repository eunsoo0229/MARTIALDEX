"""Jab form-comparison QA fixtures (reference vs user video).

Animates the existing MARTIALDEX fighter rig with the stage-1/2 pose library
(pose_lib.stance / guard_hands / chin, same targets as positions.pose_jab) and
renders short WebM clips into .devtools/fixtures-form/.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b assets/3d/fighter/fighter.blend \
      --python scripts/blender/form_fixtures/render_jab_fixtures.py -- [--only jab_reference,jab_wrong]

The source .blend is never saved.
"""
import glob
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts", "blender", "fighter"))
import pose_lib as PL  # noqa: E402
import render_util as RU  # noqa: E402
from pose_lib import V, chin, guard_hands, stance  # noqa: E402

OUT = os.path.join(ROOT, ".devtools", "fixtures-form")
FPS = 24
LEAD, REAR = "Left", "Right"

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None


# ------------------------------------------------------------------ timing
def timeline(idle0, ext, hold, ret, idle1):
    """-> (n_frames, e(frame) in [0,1], phase ranges). Frames are 1-based."""
    b1 = idle0                # last idle frame
    b2 = b1 + ext             # frame where full extension is reached
    b3 = b2 + hold            # last frame of the hold
    b4 = b3 + ret             # frame back in guard
    n = b4 + idle1

    def ss(x):
        x = min(max(x, 0.0), 1.0)
        return x * x * (3 - 2 * x)

    def e(f):
        if f <= b1:
            return 0.0
        if f <= b2:
            return ss((f - b1) / ext)
        if f <= b3:
            return 1.0
        if f <= b4:
            return 1.0 - ss((f - b3) / ret)
        return 0.0

    ranges = {
        "idle_start": [1, b1],
        "extend": [b1 + 1, b2],
        "hold_at_extension": [b2 + 1, b3] if hold else None,
        "retract": [b3 + 1, b4],
        "idle_end": [b4 + 1, n],
    }
    return n, e, ranges


REF_T = (15, 12, 4, 14, 15)          # 60 f = 2.50 s
SLOW_T = (36, 19, 6, 22, 15)         # 1.5 s idle, punch phases x1.6, 98 f = 4.08 s


# ------------------------------------------------------------------ poses
def lerp(a, b, t):
    return a + (b - a) * t


def lead_hand_orient(P, e):
    """Blend guard_hands' fist orientation (e=0) into strike()'s palm-down fist (e=1)."""
    m = PL.mx(LEAD)
    fd = (P.tail_of(f"{LEAD}ForeArm") - P.head_of(f"{LEAD}ForeArm")).normalized()
    d = fd + P.Wd(V(0, 0.15, 0)) * (1 - e)
    hint = P.Wd(V(0.35 * m, -1, 0)).lerp(P.Wd(V(0, 0, 1)), e)
    P.aim(f"{LEAD}Hand", d, hint)
    P.fist(LEAD)


def rear_hand_orient(P):
    s = -PL.mx(LEAD)
    fd = (P.tail_of(f"{REAR}ForeArm") - P.head_of(f"{REAR}ForeArm")).normalized()
    P.aim(f"{REAR}Hand", fd + P.Wd(V(0, 0.15, 0)), P.Wd(V(0.35 * s, -1, 0)))
    P.fist(REAR)


def pose_good(P, e):
    """Clean jab at progress e (0 = guard, 1 = full extension). e=1 reproduces Jab_Orthodox."""
    m = PL.mx(LEAD)
    stance(P, LEAD, guard=False)
    P.spine(0, -10 * m * e, 0)                      # slight shoulder turn
    P.look(V(0.05 * m * e, -1, -0.05), up=V(0, -0.12 - 0.03 * e, 1))
    guard_hands(P, LEAD)                            # rear hand stays at the chin
    c = chin(P)
    g = c + P.Wd(V(0.06 * m, -0.20, 0.05))          # guard target (guard_hands)
    j = c + P.Wd(V(0.10 * m, -0.60, 0.04))          # jab target (pose_jab)
    pole = P.Wd(V(0.35 * m, 0.25, -1)).lerp(P.Wd(V(0.3 * m, 0.2, -1)), e)
    P.reach(LEAD, "arm", g.lerp(j, e), pole)
    lead_hand_orient(P, e)
    P.ground()


MEDIUM_REACH = 0.62   # fraction of the guard->jab target distance reached at the peak


def pose_medium(P, e):
    """Half-hearted jab: lead arm stops short (elbow bent), rear hand sinks to the chest."""
    m = PL.mx(LEAD)
    stance(P, LEAD, guard=False)
    P.spine(0, -6 * m * e, 0)
    P.look(V(0.03 * m * e, -1, -0.05), up=V(0, -0.12, 1))
    guard_hands(P, LEAD)
    c = chin(P)
    g = c + P.Wd(V(0.06 * m, -0.20, 0.05))
    j = c + P.Wd(V(0.10 * m, -0.60, 0.04))
    P.reach(LEAD, "arm", g.lerp(j, MEDIUM_REACH * e), P.Wd(V(0.40 * m, 0.25, -1)))
    lead_hand_orient(P, e * 0.6)
    rg = c + P.Wd(V(-0.09 * m, -0.07, 0.02))        # rear guard (guard_hands)
    rd = c + P.Wd(V(-0.11 * m, -0.16, -0.30))       # chest height
    P.reach(REAR, "arm", rg.lerp(rd, e), P.Wd(V(-0.40 * m, 0.25, -1)))
    rear_hand_orient(P)
    P.ground()


def pose_wrong(P, e):
    """Bad 'jab': looping hook-like lead arm with the elbow flared, both hands low,
    head lunging forward past the lead knee."""
    m = PL.mx(LEAD)
    stance(P, LEAD, guard=False, lean=0.10 + 0.55 * e)
    P.spine(32 * e, -14 * m * e, 0)
    P.look(V(0.05 * m * e, -1, -0.05 - 0.45 * e), up=V(0, -0.12 - 0.5 * e, 1))
    guard_hands(P, LEAD)
    c = chin(P)
    g = c + P.Wd(V(0.06 * m, -0.20, 0.05))
    out = c + P.Wd(V(0.62 * m, -0.18, -0.14))       # swings wide to the lead side
    end = c + P.Wd(V(0.12 * m, -0.36, -0.20))       # finishes in front, below the chin
    # quadratic Bezier guard -> wide -> end (looping arc)
    a = g.lerp(out, e)
    b = out.lerp(end, e)
    tgt = a.lerp(b, e)
    pole = P.Wd(V(0.35 * m, 0.25, -1)).lerp(P.Wd(V(1.0 * m, 0.15, 0.55)), min(1.0, e * 2.5))
    P.reach(LEAD, "arm", tgt, pole)
    fd = (P.tail_of(f"{LEAD}ForeArm") - P.head_of(f"{LEAD}ForeArm")).normalized()
    P.aim(f"{LEAD}Hand", fd, P.Wd(V(0.35 * m, -1, 0)).lerp(P.Wd(V(0, 0, 1)), e))
    P.fist(LEAD)
    rg = c + P.Wd(V(-0.09 * m, -0.07, 0.02))
    rd = c + P.Wd(V(-0.14 * m, -0.10, -0.38))       # rear hand dropped to the chest/belly
    P.reach(REAR, "arm", rg.lerp(rd, e), P.Wd(V(-0.50 * m, 0.25, -1)))
    rear_hand_orient(P)
    P.ground()


def pose_still(P, e):
    stance(P, LEAD)
    P.ground()


# ------------------------------------------------------------------ scene
STUDIO_BG = (0.80, 0.80, 0.80)
ALT_BG = (0.10, 0.22, 0.45)


def setup_scene(bg, floor_col):
    RU.setup(res=(640, 480), bg=bg)
    scn = bpy.context.scene
    scn.render.fps = FPS
    scn.render.fps_base = 1.0
    scn.eevee.taa_render_samples = 12
    scn.render.use_motion_blur = False
    w = scn.world.node_tree.nodes["Background"]
    w.inputs["Color"].default_value = (*bg, 1)
    fl = bpy.data.objects.get("_Floor")
    if fl is None:
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
        fl = bpy.context.active_object
        fl.name = "_Floor"
        mat = bpy.data.materials.new("_FixtureFloor")
        mat.use_nodes = True
        fl.data.materials.append(mat)
    p = fl.data.materials[0].node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*floor_col, 1)
    p.inputs["Roughness"].default_value = 0.95
    p.inputs["Specular"].default_value = 0.1


ORIG = {}


def set_look(alt):
    mats = bpy.data.materials
    cols = {"Shirt_Compression": (0.60, 0.03, 0.03), "Shorts": (0.85, 0.80, 0.20)}
    for name, col in cols.items():
        p = mats[name].node_tree.nodes["Principled BSDF"].inputs["Base Color"]
        ORIG.setdefault(name, tuple(p.default_value))
        p.default_value = (*col, 1) if alt else ORIG[name]
    # skin: multiply the vertex-colour tint by a darker tone in the alt look
    skin = mats["Skin"].node_tree
    mix = skin.nodes.get("_AltTint")
    bsdf = skin.nodes["Principled BSDF"]
    if mix is None:
        src = bsdf.inputs["Base Color"].links[0].from_socket
        mix = skin.nodes.new("ShaderNodeMixRGB")
        mix.name = "_AltTint"
        mix.blend_type = "MULTIPLY"
        mix.inputs[2].default_value = (0.55, 0.40, 0.30, 1)
        skin.links.new(src, mix.inputs[1])
        skin.links.new(mix.outputs[0], bsdf.inputs["Base Color"])
    mix.inputs[0].default_value = 1.0 if alt else 0.0


def front_cam(dist):
    return RU.orbit((0, 0, 0.90), dist, 0, 3)


def side_cam(dist):
    return RU.orbit((0, -0.15, 0.90), dist, 90, 3)


# ------------------------------------------------------------------ bake + render
def bake(rig, body, fn, n, e):
    act = bpy.data.actions.new("_fixture")
    rig.animation_data_create()
    rig.animation_data.action = None
    P = PL.PoseBuilder(rig, body)
    qa = []
    for f in range(1, n + 1):
        bpy.context.scene.frame_set(f)
        rig.animation_data.action = None
        P.reset()
        fn(P, e(f))
        rig.animation_data.action = act
        for pb in rig.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=f, group=pb.name)
            pb.keyframe_insert("location", frame=f, group=pb.name)
            pb.keyframe_insert("scale", frame=f, group=pb.name)
        qa.append(measure(P))
    rig.animation_data.action = act
    return act, qa


def measure(P):
    pb = P.pb
    S = pb[f"{LEAD}Arm"].head
    E = pb[f"{LEAD}ForeArm"].head
    W = pb[f"{LEAD}ForeArm"].tail
    a = (S - E).normalized().dot((W - E).normalized())
    elbow = math.degrees(math.acos(max(-1, min(1, a))))
    reach = (W - S).length / (pb[f"{LEAD}Arm"].bone.length + pb[f"{LEAD}ForeArm"].bone.length)
    c = chin(P)
    return {
        "lead_elbow_deg": round(elbow, 1),
        "lead_reach_frac": round(reach, 3),
        "lead_elbow_x": round(E.x, 3),
        "lead_wrist_minus_chin_z": round(W.z - c.z, 3),
        "rear_wrist_minus_chin_z": round(pb[f"{REAR}ForeArm"].tail.z - c.z, 3),
        "head_y": round(pb["Head"].head.y, 3),
        "head_top_y": round(pb["Head"].tail.y, 3),
        "lead_knee_y": round(pb[f"{LEAD}Leg"].head.y, 3),
    }


def render_movie(name, n):
    scn = bpy.context.scene
    scn.frame_start, scn.frame_end = 1, n
    r = scn.render
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format = "WEBM"
    r.ffmpeg.codec = "WEBM"          # VP9
    r.ffmpeg.constant_rate_factor = "MEDIUM"
    r.ffmpeg.ffmpeg_preset = "GOOD"
    r.ffmpeg.gopsize = 12
    r.ffmpeg.audio_codec = "NONE"
    r.use_file_extension = True
    tmp = os.path.join(OUT, f"_tmp_{name}_")
    for old in glob.glob(tmp + "*"):
        os.remove(old)
    r.filepath = tmp
    bpy.ops.render.render(animation=True)
    produced = glob.glob(tmp + "*")
    assert len(produced) == 1, produced
    dst = os.path.join(OUT, f"{name}.webm")
    os.replace(produced[0], dst)
    return dst


FIXTURES = {
    # name: (pose fn, timing, look, camera)
    "jab_reference": (pose_good, REF_T, "studio", ("front", 4.4)),
    "jab_good": (pose_good, SLOW_T, "studio", ("front", 4.4)),
    "jab_good_altlook": (pose_good, REF_T, "alt", ("front", 5.4)),
    "jab_medium": (pose_medium, REF_T, "studio", ("front", 4.4)),
    "jab_wrong": (pose_wrong, REF_T, "studio", ("front", 4.4)),
    "still_noaction": (pose_still, None, "studio", ("front", 4.4)),
    "jab_reference_side": (pose_good, REF_T, "studio", ("side", 4.4)),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    rig = bpy.data.objects["FighterRig"]
    body = bpy.data.objects["FighterBody"]
    manifest_path = os.path.join(OUT, "fixtures.json")
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as fh:
            manifest = json.load(fh)
    for name, (fn, timing, look, (view, dist)) in FIXTURES.items():
        if ONLY and name not in ONLY:
            continue
        if timing is None:
            n, e, ranges = 72, (lambda f: 0.0), {"idle_start": [1, 72]}
        else:
            n, e, ranges = timeline(*timing)
        alt = look == "alt"
        setup_scene(ALT_BG if alt else STUDIO_BG, (0.10, 0.20, 0.38) if alt else (0.50, 0.50, 0.50))
        set_look(alt)
        (front_cam if view == "front" else side_cam)(dist)
        act, qa = bake(rig, body, fn, n, e)
        peak = max(range(n), key=lambda i: e(i + 1))
        path = render_movie(name, n)
        manifest[name] = {
            "file": os.path.basename(path), "frames": n, "fps": FPS, "duration_s": round(n / FPS, 3),
            "resolution": [640, 480], "camera": view, "camera_distance_m": dist, "look": look,
            "frame_ranges_1based": ranges, "peak_frame": peak + 1,
            "qa_guard_frame1": qa[0], "qa_peak": qa[peak],
        }
        print("FIXTURE", name, json.dumps(manifest[name]))
        rig.animation_data.action = None
        bpy.data.actions.remove(act)
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=2)


main()
