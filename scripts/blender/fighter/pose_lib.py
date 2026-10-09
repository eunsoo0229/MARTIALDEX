"""MARTIALDEX fighter — pose authoring toolkit + stage-1 poses.

A pose is a function(P) (or (PA, PB) for two-fighter positions) that drives a
PoseBuilder. Every builder has its own *origin* (position + yaw), and pose
code is written in that fighter's LOCAL frame: metres, Z-up, the fighter
faces -Y, its left side is +X. P.W()/P.Wd() convert local points/directions
to world, so the same stance code works for a fighter placed anywhere.

Tools
  P.place(pos, up, front)        put the pelvis: position, spine direction, belly direction
  P.rot(bone, x, y, z)           local Euler offset (deg). Spine/legs: +X bends forward,
                                 +Y twists the front toward the fighter's left, +Z bends right.
  P.aim(bone, dir, z_hint)       point a bone along a direction (world)
  P.reach(side, limb, target, pole, end_dir=None, end_hint=None)
                                 analytic two-bone IK: wrist/ankle to `target`, elbow/knee
                                 pointing toward `pole` (world)
  P.look(face_dir, up=None)      orient the head
  P.fist(side) / P.open_hand(side)
  P.ground()                     drop/raise the fighter so its lowest vertex touches the floor
Bones must be posed parent-first; every call refreshes the depsgraph.
"""
import math

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

SIDES = ("Left", "Right")
FINGER_NAMES = ("Index", "Middle", "Ring", "Pinky")


def V(x, y, z):
    return Vector((x, y, z))


def mx(side):
    """+1 for Left, -1 for Right (X mirror factor)."""
    return 1.0 if side == "Left" else -1.0


def other(side):
    return "Right" if side == "Left" else "Left"


def yawdir(deg):
    """Local horizontal direction: 0 = straight ahead (-Y), + = turned toward the fighter's left."""
    r = math.radians(deg)
    return V(math.sin(r), -math.cos(r), 0)


class PoseBuilder:
    def __init__(self, rig, body=None, origin=(0, 0, 0), yaw=0.0):
        self.rig = rig
        self.body = body
        self.pb = rig.pose.bones
        self.set_origin(origin, yaw)

    def set_origin(self, origin=(0, 0, 0), yaw=0.0):
        self.O = Vector(origin)
        self.Rz = Matrix.Rotation(math.radians(yaw), 3, "Z")

    # -- frames --------------------------------------------------------------
    def W(self, v):
        return self.O + self.Rz @ Vector(v)

    def Wd(self, v):
        return self.Rz @ Vector(v)

    def L(self, v):
        """world point -> local"""
        return self.Rz.inverted() @ (Vector(v) - self.O)

    def refresh(self):
        bpy.context.view_layer.update()

    def reset(self):
        for p in self.pb:
            p.rotation_mode = "QUATERNION"
            p.rotation_quaternion = (1, 0, 0, 0)
            p.location = (0, 0, 0)
            p.scale = (1, 1, 1)
        self.refresh()

    # -- root ----------------------------------------------------------------
    def place(self, pos, up=(0, 0, 1), front=(0, -1, 0)):
        """Pelvis joint at local `pos`; spine points along `up`, belly faces `front`."""
        p = self.pb["Hips"]
        Y = self.Wd(up).normalized()
        Z = self.Wd(front)
        Z = (Z - Y * Z.dot(Y)).normalized()
        M = Matrix((Y.cross(Z), Y, Z)).transposed().to_4x4()
        M.translation = self.W(pos)
        p.matrix = M
        self.refresh()

    def body_dir(self):
        """3x3 rotation from rest to the current pelvis orientation (world)."""
        return self.pb["Hips"].matrix.to_3x3() @ self.pb["Hips"].bone.matrix_local.to_3x3().inverted()

    # -- bones ---------------------------------------------------------------
    def aim(self, bone, direction, z_hint):
        p = self.pb[bone]
        Y = Vector(direction).normalized()
        Z = Vector(z_hint)
        Z = Z - Y * Z.dot(Y)
        if Z.length < 1e-6:
            Z = Y.orthogonal()
        Z.normalize()
        M = Matrix((Y.cross(Z), Y, Z)).transposed().to_4x4()
        M.translation = p.head
        p.matrix = M
        self.refresh()

    def aim_l(self, bone, direction, z_hint):
        """aim() with local-frame vectors."""
        self.aim(bone, self.Wd(direction), self.Wd(z_hint))

    def rot(self, bone, x=0.0, y=0.0, z=0.0):
        p = self.pb[bone]
        q = Euler((math.radians(x), math.radians(y), math.radians(z)), "XYZ").to_quaternion()
        p.rotation_quaternion = p.rotation_quaternion @ q
        self.refresh()

    def spine(self, x=0.0, y=0.0, z=0.0):
        """Distribute a bend/twist over Spine, Spine1, Spine2."""
        for b, w in (("Spine", 0.3), ("Spine1", 0.35), ("Spine2", 0.35)):
            self.rot(b, x * w, y * w, z * w)

    def look(self, face_dir, up=None, neck_share=0.45):
        """Point the face along local `face_dir`. The neck takes part of the turn."""
        f = self.Wd(face_dir).normalized()
        u = self.Wd(up).normalized() if up is not None else Vector((0, 0, 1))
        u = (u - f * u.dot(f)).normalized()
        # neck: halfway between the chest direction and the head direction
        chest_up = (self.pb["Spine2"].tail - self.pb["Spine2"].head).normalized()
        chest_f = self.body_dir_bone("Spine2")
        n_up = (chest_up * (1 - neck_share) + u * neck_share).normalized()
        n_f = (chest_f * (1 - neck_share) + f * neck_share).normalized()
        self.aim("Neck", n_up, n_f)
        self.aim("Head", u, f)

    def body_dir_bone(self, bone):
        """World direction of the bone's local +Z (front for spine bones)."""
        return (self.pb[bone].matrix.to_3x3() @ Vector((0, 0, 1))).normalized()

    def reach(self, side, limb, target, pole, end_dir=None, end_hint=None):
        """Two-bone IK in world space. limb = 'arm' or 'leg'."""
        if limb == "arm":
            b1, b2, b3 = f"{side}Arm", f"{side}ForeArm", f"{side}Hand"
        else:
            b1, b2, b3 = f"{side}UpLeg", f"{side}Leg", f"{side}Foot"
        S = self.pb[b1].head.copy()
        L1 = self.pb[b1].bone.length
        L2 = self.pb[b2].bone.length
        T = Vector(target)
        d = T - S
        dist = max(min(d.length, (L1 + L2) * 0.999), abs(L1 - L2) + 1e-3)
        dn = d.normalized()
        a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist)
        h = math.sqrt(max(L1 * L1 - a * a, 0.0))
        pn = Vector(pole)
        pn = (pn - dn * pn.dot(dn)).normalized()
        E = S + dn * a + pn * h
        Wp = S + dn * dist
        self.aim(b1, E - S, pn)
        self.aim(b2, Wp - E, pn)
        if end_dir is not None:
            self.aim(b3, end_dir, end_hint)
        return E, Wp

    # -- hands / feet -----------------------------------------------------------
    def fist(self, side, tight=1.0):
        for f in FINGER_NAMES:
            self.rot(f"{side}Hand{f}1", -80 * tight, 0, 0)
            self.rot(f"{side}Hand{f}2", -95 * tight, 0, 0)
            self.rot(f"{side}Hand{f}3", -70 * tight, 0, 0)
        self.rot(f"{side}HandThumb1", -10 * tight, 0, 0)
        self.rot(f"{side}HandThumb2", -35 * tight, 0, 0)
        self.rot(f"{side}HandThumb3", -40 * tight, 0, 0)

    def open_hand(self, side, curl=0.0):
        for f in FINGER_NAMES:
            for i in (1, 2, 3):
                self.rot(f"{side}Hand{f}{i}", -curl, 0, 0)

    def grip(self, side):
        """Cupped hand for grabbing (wrists, collar, legs)."""
        for f in FINGER_NAMES:
            self.rot(f"{side}Hand{f}1", -45, 0, 0)
            self.rot(f"{side}Hand{f}2", -55, 0, 0)
            self.rot(f"{side}Hand{f}3", -35, 0, 0)
        self.rot(f"{side}HandThumb2", -20, 0, 0)

    def foot_flat(self, side, yaw=0.0, heel_up=0.0):
        """Foot pointing along local yaw (deg, + = toward the fighter's left), sole on the floor."""
        f = yawdir(yaw)
        drop = 0.42 + heel_up
        self.aim(f"{side}Foot", self.Wd(f * 1.0 + V(0, 0, -drop)), self.Wd(V(0, 0, 1)))
        self.aim(f"{side}ToeBase", self.Wd(f + V(0, 0, -0.05)), self.Wd(V(0, 0, 1)))

    def foot_point(self, side, direction, top):
        """Foot extended along `direction` (local), dorsum facing `top` (local)."""
        self.aim_l(f"{side}Foot", direction, top)
        self.aim_l(f"{side}ToeBase", direction, top)

    def toes_tucked(self, side, toward_knee):
        """Kneeling with toes curled under: sole vertical, toes flat pointing at the knee (local dir)."""
        k = Vector(toward_knee).normalized()
        self.aim_l(f"{side}Foot", V(0, 0, -1), k)
        self.aim_l(f"{side}ToeBase", k + V(0, 0, -0.05), V(0, 0, 1))

    # -- world queries -------------------------------------------------------------
    def head_of(self, bone):
        return self.pb[bone].head.copy()

    def tail_of(self, bone):
        return self.pb[bone].tail.copy()

    def mesh_points(self):
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.body.evaluated_get(dg)
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        ev.to_mesh_clear()
        M = np.array(self.body.matrix_world)
        co = co.reshape(-1, 3)
        return co @ M[:3, :3].T + M[:3, 3]

    def ground(self, floor=0.0):
        """Shift the fighter vertically so its lowest vertex sits on the floor."""
        if self.body is None:
            return
        dz = self.mesh_points()[:, 2].min() - floor
        p = self.pb["Hips"]
        M = p.matrix.copy()
        M.translation.z -= dz
        p.matrix = M
        self.refresh()
        return dz


# ============================================================ shared building blocks
def stance(P, lead="Left", crouch=0.065, yaw=30.0, lean=0.10, guard=True):
    """MMA/boxing fighting stance. lead='Left' = orthodox, 'Right' = southpaw."""
    m = mx(lead)
    rear = other(lead)
    P.place(V(0, 0.01, 0.94 - crouch), up=V(0, -lean, 1), front=yawdir(-yaw * m))
    P.spine(8, 0, 0)
    legs_stance(P, lead)
    P.look(V(0.0, -1, -0.05), up=V(0, -0.12, 1))
    if guard:
        guard_hands(P, lead)


def legs_stance(P, lead, width=0.26, depth=0.52, rear_heel=0.10):
    m = mx(lead)
    rear = other(lead)
    hz = P.head_of("Hips").z
    P.reach(lead, "leg", P.W(V(0.11 * m, -depth * 0.55, 0.095)), P.Wd(V(0.25 * m, -1, 0)))
    P.reach(rear, "leg", P.W(V(-(width - 0.11) * m, depth * 0.45, 0.10 + rear_heel * 0.5)), P.Wd(V(-0.45 * m, -1, 0)))
    P.foot_flat(lead, yaw=-8 * m)
    P.foot_flat(rear, yaw=-45 * m, heel_up=rear_heel * 4)


def chin(P):
    """World position just in front of the chin."""
    h = P.pb["Head"]
    Mh = h.matrix.to_3x3()
    return h.head + Mh @ V(0, -0.045, 0.085)  # local: Y = up the head, Z = face


def head_front(P, up=0.06, fwd=0.11):
    h = P.pb["Head"]
    Mh = h.matrix.to_3x3()
    return h.head + Mh @ V(0, up, fwd)


def guard_hands(P, lead, high=False):
    m = mx(lead)
    rear = other(lead)
    c = chin(P)
    if high:
        f = head_front(P, up=0.11, fwd=0.07)
        lt = f + P.Wd(V(0.07 * m, -0.07, 0.0))
        rt = f + P.Wd(V(-0.07 * m, -0.07, 0.0))
    else:
        lt = c + P.Wd(V(0.06 * m, -0.20, 0.05))
        rt = c + P.Wd(V(-0.09 * m, -0.07, 0.02))
    P.reach(lead, "arm", lt, P.Wd(V(0.35 * m, 0.25, -1)))
    P.reach(rear, "arm", rt, P.Wd(V(-0.40 * m, 0.25, -1)))
    for side, s in ((lead, m), (rear, -m)):
        fd = (P.tail_of(f"{side}ForeArm") - P.head_of(f"{side}ForeArm")).normalized()
        P.aim(f"{side}Hand", fd + P.Wd(V(0, 0.15, 0)), P.Wd(V(0.35 * s, -1, 0)))
        P.fist(side)


def strike(P, side, target, pole, palm_down=True):
    """Straight punch: arm extended to world `target`, fist horizontal."""
    P.reach(side, "arm", target, pole)
    fd = (P.tail_of(f"{side}ForeArm") - P.head_of(f"{side}ForeArm")).normalized()
    P.aim(f"{side}Hand", fd, P.Wd(V(0, 0, 1)) if palm_down else P.Wd(V(-mx(side), 0, 0)))
    P.fist(side)


# ============================================================ stage-1 poses
def pose_a_rest(P):
    """Bind pose (A-pose) — identity."""


def pose_idle_reference(P):
    """Recreates the Meshy reference image: relaxed stance, arms at the sides."""
    for side in SIDES:
        s = mx(side)
        P.aim(f"{side}Arm", P.Wd(V(0.20 * s, 0.02, -1)), P.Wd(V(0, 1, 0)))
        P.aim(f"{side}ForeArm", P.Wd(V(0.08 * s, -0.06, -1)), P.Wd(V(0, 1, 0)))
        P.aim(f"{side}Hand", P.Wd(V(0.02 * s, -0.04, -1)), P.Wd(V(s, 0.25, 0)))
        P.open_hand(side, curl=10)
    P.ground()


def pose_stance_orthodox(P):
    stance(P, "Left")
    P.ground()


STAGE1_POSES = {
    "A_Rest": pose_a_rest,
    "Idle_Reference": pose_idle_reference,
    "Stance_Orthodox": pose_stance_orthodox,
}


# ============================================================ action baking
def key_pose(rig, name, frame=1):
    """Store the rig's current pose as a single-keyframe Action named `name`."""
    act = bpy.data.actions.get(name) or bpy.data.actions.new(name)
    act.use_fake_user = True
    act.fcurves.clear()
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = act
    for p in rig.pose.bones:
        p.keyframe_insert("rotation_quaternion", frame=frame, group=p.name)
        p.keyframe_insert("location", frame=frame, group=p.name)
        p.keyframe_insert("scale", frame=frame, group=p.name)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT"
    rig.animation_data.action = None
    return act


def bake_pose(rig, body, name, fn):
    P = PoseBuilder(rig, body)
    P.reset()
    fn(P)
    return key_pose(rig, name)


def push_actions_to_nla(rig, actions):
    """One NLA track per pose so exporters write one animation clip per pose."""
    ad = rig.animation_data or rig.animation_data_create()
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    for act in actions:
        tr = ad.nla_tracks.new()
        tr.name = act.name
        tr.strips.new(act.name, 1, act)
        tr.mute = True
    ad.action = None
