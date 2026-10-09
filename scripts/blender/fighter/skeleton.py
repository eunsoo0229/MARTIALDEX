"""MARTIALDEX fighter — shared skeleton definition.

Single source of truth for joint positions (rest pose = A-pose, metres,
Blender Z-up, character faces -Y, character's LEFT side is +X). Both the
body-mesh generator and the armature builder read from here, so mesh and
rig always line up.

Proportions were measured from assets/3d/fighter/reference/meshy_reference.png
(1.80 m tall, ~7.5 heads, 0.50 m deltoid width, 0.30 m waist).
"""
from mathutils import Vector

HEIGHT = 1.80

# A-pose upper-arm direction (left side) — 45 deg below horizontal, a hair forward.
ARM_DIR = Vector((0.70, -0.03, -0.71)).normalized()
FOREARM_DIR = Vector((0.69, -0.08, -0.72)).normalized()

UPPER_ARM_LEN = 0.300
FOREARM_LEN = 0.255
PALM_LEN = 0.092

# Hand frame (left side, rest). a = along hand, w = toward thumb/index (front),
# p = palm normal (pointing out of the palm, toward the thigh when arms hang).
HAND_A = FOREARM_DIR
HAND_W = (Vector((0, -1, 0)) - HAND_A * Vector((0, -1, 0)).dot(HAND_A)).normalized()
HAND_P = HAND_A.cross(HAND_W).normalized()
if HAND_P.x > 0:  # palm must face inward/down (toward body, -X for the left hand)
    HAND_P = -HAND_P

# name, knuckle offset along w, knuckle setback along a, spread, segment lengths, base radius
FINGERS = [
    ("Index", 0.031, -0.004, 0.15, (0.044, 0.026, 0.022), 0.0092),
    ("Middle", 0.010, 0.000, 0.04, (0.048, 0.030, 0.023), 0.0094),
    ("Ring", -0.011, -0.004, -0.08, (0.045, 0.028, 0.022), 0.0088),
    ("Pinky", -0.031, -0.014, -0.20, (0.035, 0.021, 0.019), 0.0078),
]
THUMB = {
    "lengths": (0.045, 0.032, 0.028),
    "radii": (0.0125, 0.0108, 0.0098),
}


def mirror(v, side):
    """side = +1 for left, -1 for right."""
    return Vector((v.x * side, v.y, v.z))


def joints():
    """Return dict of joint positions for the LEFT side + centre line."""
    J = {}
    # centre line
    J["hips"] = Vector((0, 0.010, 0.940))
    J["spine"] = Vector((0, 0.015, 1.040))
    J["spine1"] = Vector((0, 0.020, 1.150))
    J["spine2"] = Vector((0, 0.020, 1.275))
    J["neck"] = Vector((0, 0.020, 1.475))
    J["head"] = Vector((0, 0.012, 1.600))
    J["head_top"] = Vector((0, 0.012, 1.800))

    # left arm
    J["clavicle"] = Vector((0.025, -0.005, 1.455))
    J["shoulder"] = Vector((0.180, 0.010, 1.430))
    J["elbow"] = J["shoulder"] + ARM_DIR * UPPER_ARM_LEN
    J["wrist"] = J["elbow"] + FOREARM_DIR * FOREARM_LEN
    J["knuckles"] = J["wrist"] + HAND_A * PALM_LEN

    # fingers
    for name, ow, oa, spread, lens, _r in FINGERS:
        k = J["wrist"] + HAND_A * (PALM_LEN + oa) + HAND_W * ow - HAND_P * 0.002
        d = (HAND_A + HAND_W * spread + HAND_P * 0.06).normalized()
        pts = [k]
        for i, L in enumerate(lens):
            d = (d + HAND_P * 0.10 * (i + 1)).normalized()  # relaxed curl
            pts.append(pts[-1] + d * L)
        J[f"finger_{name}"] = pts
    t0 = J["wrist"] + HAND_A * 0.022 + HAND_W * 0.024 + HAND_P * 0.008
    dirs = [
        (HAND_A * 0.75 + HAND_W * 0.55 + HAND_P * 0.35).normalized(),
        (HAND_A * 0.85 + HAND_W * 0.35 + HAND_P * 0.45).normalized(),
        (HAND_A * 0.85 + HAND_W * 0.25 + HAND_P * 0.55).normalized(),
    ]
    pts = [t0]
    for d, L in zip(dirs, THUMB["lengths"]):
        pts.append(pts[-1] + d * L)
    J["finger_Thumb"] = pts

    # left leg
    J["hip"] = Vector((0.090, 0.005, 0.905))
    J["knee"] = Vector((0.108, -0.010, 0.480))
    J["ankle"] = Vector((0.122, 0.025, 0.088))
    J["ball"] = Vector((0.136, -0.115, 0.022))
    J["toe"] = Vector((0.142, -0.190, 0.018))
    J["heel"] = Vector((0.120, 0.070, 0.035))
    return J


# Bone table: name, head joint key, tail joint key, parent, roll hint (world vector, left side)
# Roll hint = where the bone's local +Z should point. Chosen so that the main
# flexion of every joint is a rotation about the bone's local X axis.
FWD = Vector((0, -1, 0))
BACK = Vector((0, 1, 0))
UP = Vector((0, 0, 1))
