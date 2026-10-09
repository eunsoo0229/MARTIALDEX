"""MARTIALDEX fighter — stage-2 position library for 상황판단 training.

SINGLE_POSES: one fighter at the origin facing -Y (Blender) = +Z (glTF).
PAIR_POSES:   two fighters authored together in one shared frame; each role
              becomes its own clip (e.g. "Mount_Top", "Mount_Bottom"). Load the
              same model twice at the same origin and play one clip on each —
              the clips carry the absolute pelvis placement, so the pair lines
              up without any extra transform.
SCENARIOS:    the training situations (manifest rows) built from those clips,
              tagged with the app's SituationCategory ids
              (src/lib/situationRecommend/types.ts).
"""
import math

from mathutils import Vector

from pose_lib import (V, guard_hands, legs_stance, mx, other, stance, strike, yawdir, chin,
                      head_front)

# ============================================================ single poses


def pose_stance_southpaw(P):
    stance(P, "Right")
    P.ground()


def pose_jab(P, lead="Left"):
    m = mx(lead)
    stance(P, lead, guard=False)
    P.spine(0, -10 * m, 0)
    P.look(V(0.05 * m, -1, -0.05), up=V(0, -0.15, 1))
    guard_hands(P, lead)
    c = chin(P)
    strike(P, lead, c + P.Wd(V(0.10 * m, -0.60, 0.04)), P.Wd(V(0.3 * m, 0.2, -1)))
    P.ground()


def pose_cross(P, lead="Left"):
    m = mx(lead)
    rear = other(lead)
    P.place(V(0, -0.02, 0.885), up=V(0, -0.16, 1), front=yawdir(-6 * m))
    P.spine(6, 14 * m, 0)
    P.reach(lead, "leg", P.W(V(0.11 * m, -0.30, 0.095)), P.Wd(V(0.25 * m, -1, 0)))
    P.reach(rear, "leg", P.W(V(-0.15 * m, 0.24, 0.14)), P.Wd(V(0.2 * m, -1, 0)))
    P.foot_flat(lead, yaw=-6 * m)
    P.foot_flat(rear, yaw=-10 * m, heel_up=0.9)
    P.look(V(-0.05 * m, -1, -0.05), up=V(0, -0.12, 1))
    guard_hands(P, lead)
    c = chin(P)
    strike(P, rear, c + P.Wd(V(0.02 * m, -0.66, 0.03)), P.Wd(V(-0.3 * m, 0.2, -1)))
    P.ground()


def pose_high_guard(P, lead="Left"):
    m = mx(lead)
    stance(P, lead, crouch=0.09, lean=0.16, guard=False)
    P.spine(6, 0, 0)
    P.look(V(0, -1, -0.25), up=V(0, -0.3, 1))
    guard_hands(P, lead, high=True)
    P.ground()


def pose_teep(P, lead="Left"):
    """Lead-leg push kick (teep / front kick) at belly height."""
    m = mx(lead)
    rear = other(lead)
    P.place(V(0, 0.06, 0.93), up=V(0.0, 0.30, 1), front=yawdir(-15 * m))
    P.spine(4, 0, 0)
    P.reach(rear, "leg", P.W(V(-0.10 * m, 0.10, 0.09)), P.Wd(V(-0.2 * m, -1, 0)))
    P.foot_flat(rear, yaw=-40 * m)
    P.aim_l(f"{lead}UpLeg", V(0.06 * m, -1, 0.22), V(0, 0, 1))
    P.aim_l(f"{lead}Leg", V(0.04 * m, -1, 0.02), V(0, 0, 1))
    P.foot_point(lead, V(0, -0.15, 1), V(0, 1, 0.1))
    P.look(V(0, -1, -0.1), up=V(0, 0.0, 1))
    guard_hands(P, lead)
    P.ground()


def pose_low_kick(P, lead="Left"):
    """Rear-leg roundhouse to the opponent's lead thigh."""
    m = mx(lead)
    rear = other(lead)
    P.place(V(0.02 * m, -0.02, 0.93), up=V(0.18 * m, 0.10, 1), front=yawdir(55 * m))
    P.spine(0, -18 * m, 0)
    P.reach(lead, "leg", P.W(V(0.13 * m, -0.05, 0.09)), P.Wd(V(0.6 * m, -0.6, 0)))
    P.foot_flat(lead, yaw=70 * m)
    hip = P.head_of(f"{rear}UpLeg")
    tgt = P.W(V(0.42 * m, -0.66, 0.40))
    P.reach(rear, "leg", tgt, P.Wd(V(0.1 * m, -0.4, 1)))
    shin = (P.tail_of(f"{rear}Leg") - P.head_of(f"{rear}Leg")).normalized()
    P.aim(f"{rear}Foot", shin, P.Wd(V(0, 0.3, 1)))
    P.aim(f"{rear}ToeBase", shin, P.Wd(V(0, 0.3, 1)))
    P.look(V(0.25 * m, -1, -0.2), up=V(0, 0, 1))
    c = chin(P)
    P.reach(lead, "arm", c + P.Wd(V(0.02 * m, -0.14, 0.04)), P.Wd(V(0.4 * m, 0.0, -1)))
    P.reach(rear, "arm", P.W(V(-0.36 * m, 0.30, 0.95)), P.Wd(V(-0.3 * m, 0.4, 0.2)))
    for side in (lead, rear):
        fd = (P.tail_of(f"{side}ForeArm") - P.head_of(f"{side}ForeArm")).normalized()
        P.aim(f"{side}Hand", fd, P.Wd(V(0, -1, 0.3)))
        P.fist(side)
    P.ground()


SINGLE_POSES = {
    "Stance_Southpaw": pose_stance_southpaw,
    "Jab_Orthodox": pose_jab,
    "Cross_Orthodox": pose_cross,
    "Block_HighGuard": pose_high_guard,
    "Teep_Lead": pose_teep,
    "LowKick_Rear": pose_low_kick,
}


# ============================================================ two-fighter positions
# Shared world frame for ground positions: the bottom fighter lies on the
# back along the Y axis, head toward -Y, pelvis at the origin.
SUPINE_UP, SUPINE_FRONT = V(0, -1, 0), V(0, 0, 1)
PELVIS_BACK = 0.118  # hip joint height when lying on the back


def supine(P, knees_up=True, feet_y=0.36, feet_x=0.19, arms=None):
    """Bottom fighter flat on the back. Optionally knees bent, feet flat."""
    P.set_origin((0, 0, 0), 0)
    P.place(V(0, 0, PELVIS_BACK), up=SUPINE_UP, front=SUPINE_FRONT)
    P.spine(-2, 0, 0)
    P.look(V(0, -0.15, 1), up=V(0, -1, 0.1))
    if knees_up:
        for side in ("Left", "Right"):
            s = -mx(side)  # supine: the fighter's left side is world -X
            P.reach(side, "leg", V(s * feet_x, feet_y, 0.09), V(s * 0.35, 0, 1))
            P.aim(f"{side}Foot", V(0, 0.9, -0.42), V(0, 0, 1))
            P.aim(f"{side}ToeBase", V(0, 1, -0.05), V(0, 0, 1))


def kneel_leg(P, side, knee, back, tucked=False):
    """Knee on the mat at world `knee`; shin runs along world `back`.
    tucked=False: instep flat on the mat. tucked=True: shin raised, toes curled under."""
    hip = P.head_of(f"{side}UpLeg")
    fwd = -Vector(back).normalized()
    P.aim(f"{side}UpLeg", Vector(knee) - hip, fwd)
    b = Vector(back).normalized()
    if tucked:
        P.aim(f"{side}Leg", b + V(0, 0, 0.36), V(0, 0, -1))
        P.aim(f"{side}Foot", V(0, 0, -1) - b * 0.15, fwd)
        P.aim(f"{side}ToeBase", fwd + V(0, 0, -0.05), V(0, 0, 1))
    else:
        P.aim(f"{side}Leg", b + V(0, 0, 0.02), V(0, 0, -1))
        P.aim(f"{side}Foot", b + V(0, 0, -0.08), V(0, 0, -1))
        P.aim(f"{side}ToeBase", b + V(0, 0, -0.05), V(0, 0, -1))


def hands_to(P, side, target, pole, grip=True, palm=None):
    P.reach(side, "arm", target, pole)
    fd = (P.tail_of(f"{side}ForeArm") - P.head_of(f"{side}ForeArm")).normalized()
    P.aim(f"{side}Hand", fd, palm if palm is not None else pole)
    if grip:
        P.grip(side)


def pair_closed_guard(A, B):
    """A = top (kneeling in the guard, posture up), B = bottom (closed guard)."""
    supine(B, knees_up=False)
    B.ground()
    # A kneels between B's legs, facing B's head (-Y), sitting back toward the heels
    A.set_origin((0, 0, 0), 0)
    A.place(V(0, 0.40, 0.44), up=V(0, -0.30, 1), front=V(0, -1, 0))
    A.spine(10, 0, 0)
    for side in ("Left", "Right"):
        s = mx(side)
        kneel_leg(A, side, V(0.20 * s, 0.17, 0.06), V(0.03 * s, 1, 0))
    A.ground()
    A.look(V(0, -1, -0.5), up=V(0, -0.3, 1))
    belt = B.head_of("Spine") + V(0, 0.02, 0.12)
    for side in ("Left", "Right"):
        s = mx(side)
        hands_to(A, side, belt + V(0.11 * s, 0.0, 0.0), V(0.8 * s, 0.4, -0.2), palm=V(0, 0, 1))
    # B's legs wrap A's waist, ankles crossed behind A's back
    waist = A.head_of("Spine")
    for side, cross in (("Left", 1), ("Right", -1)):
        s = -mx(side)
        ankle = waist + V(0.05 * cross, 0.17, -0.10)
        B.reach(side, "leg", ankle, V(s * 1.0, -0.2, 0.2))
        sd = (B.tail_of(f"{side}Leg") - B.head_of(f"{side}Leg")).normalized()
        B.aim(f"{side}Foot", sd, V(0, 0, 1))
        B.aim(f"{side}ToeBase", sd, V(0, 0, 1))
    for side in ("Left", "Right"):
        s = -mx(side)
        w = A.head_of(f"{'Right' if side == 'Left' else 'Left'}Hand")
        hands_to(B, side, w + V(0, -0.03, 0.05), V(s, 0, -0.3))


def pair_mount(A, B):
    """A = top (mounted, ground-and-pound ready), B = bottom (framing on the hips)."""
    supine(B, knees_up=True, feet_y=0.34)
    B.ground()
    A.set_origin((0, 0, 0), 0)
    A.place(V(0, -0.10, 0.31), up=V(0, -0.22, 1), front=V(0, -1, 0))
    A.spine(10, 0, 0)
    for side in ("Left", "Right"):
        s = mx(side)
        kneel_leg(A, side, V(0.33 * s, -0.24, 0.06), V(-0.25 * s, 1, 0))
    A.ground()
    A.look(V(0, -0.6, -1), up=V(0, -1, 0.4))
    chest = B.head_of("Spine2")
    hands_to(A, "Left", chest + V(0.05, 0.0, 0.17), V(0.6, 0.3, 0), grip=False, palm=V(0, 0, 1))
    A.open_hand("Left", 15)
    # right fist cocked for ground-and-pound
    sh = A.head_of("RightArm")
    A.reach("Right", "arm", sh + V(-0.10, 0.06, 0.08), V(-0.4, 0.6, -0.6))
    fd = (A.tail_of("RightForeArm") - A.head_of("RightForeArm")).normalized()
    A.aim("RightHand", fd, V(0, -1, 0))
    A.fist("Right")
    # B frames on A's hips
    for side in ("Left", "Right"):
        s = -mx(side)
        tgt = A.head_of(f"{'Right' if side == 'Left' else 'Left'}UpLeg") + V(0, -0.05, 0.02)
        hands_to(B, side, tgt, V(s, 0.2, -0.2), palm=V(0, -1, 0))


def pair_side_control(A, B):
    """A = top (side control from B's right side, crossface), B = bottom (framing)."""
    supine(B, knees_up=True, feet_y=0.34)
    B.look(V(-0.5, -0.1, 1), up=V(0, -1, 0))  # face turned away from the top player
    A.set_origin((0, 0, 0), 0)
    A.place(V(0.47, -0.22, 0.30), up=V(-1, -0.22, 0.30), front=V(0, 0, -1))
    A.spine(16, 0, 0)
    for side in ("Left", "Right"):
        ky = -0.42 if side == "Left" else -0.05  # A's left side faces B's head (-Y)
        kneel_leg(A, side, V(0.34, ky, 0.06), V(1, 0.15 if side == "Right" else -0.15, 0), tucked=True)
    B.ground()
    A.ground()
    A.look(V(-1, 0.0, -0.4), up=V(-0.3, 0, 1))
    head = B.head_of("Head")
    hands_to(A, "Left", head + V(-0.13, -0.06, 0.0), V(0.2, -1, 0.4), palm=V(0, -1, 0))
    hip_far = B.head_of("LeftUpLeg")
    hands_to(A, "Right", hip_far + V(-0.10, 0.02, -0.06), V(0.2, 1, 0.5), grip=False, palm=V(0, 0, 1))
    A.open_hand("Right", 20)
    # B frames: right forearm against A's hip, left hand on A's neck
    hands_to(B, "Right", A.head_of("Hips") + V(-0.12, 0.02, -0.02), V(0.6, 0.3, -0.4))
    hands_to(B, "Left", A.head_of("Neck") + V(0.0, -0.06, 0.06), V(-0.4, -0.4, 0.4))


def pair_back_control(A, B):
    """A = back control (hooks in, seatbelt), B = in front, seated, defending hands."""
    B.set_origin((0, 0, 0), 0)
    B.place(V(0, -0.02, 0.125), up=V(0, 0.38, 1), front=V(0, -1, 0.35))
    B.spine(10, 0, 0)
    for side in ("Left", "Right"):
        s = mx(side)
        B.reach(side, "leg", V(0.24 * s, -0.66, 0.09), V(0.5 * s, 0, 1))
        B.foot_flat(side, yaw=25 * s)
    B.look(V(0, -1, -0.15), up=V(0, 0.1, 1))
    A.set_origin((0, 0, 0), 0)
    A.place(V(0, 0.27, 0.125), up=V(0, 0.08, 1), front=V(0, -1, 0))
    A.spine(10, 0, 0)
    for side in ("Left", "Right"):
        s = mx(side)
        bknee = B.tail_of(f"{side}UpLeg")
        hook = bknee + V(-0.07 * s, 0.10, -0.06)
        A.reach(side, "leg", hook, V(0.9 * s, 0, 0.6))
        sd = (A.tail_of(f"{side}Leg") - A.head_of(f"{side}Leg")).normalized()
        A.aim(f"{side}Foot", sd + V(0.6 * s, 0, 0), V(0, -0.3, 1))
        A.aim(f"{side}ToeBase", sd + V(0.8 * s, 0, 0), V(0, -0.3, 1))
    A.look(V(-0.3, -1, -0.3), up=V(0, 0.1, 1))
    # seatbelt: right arm over B's right shoulder, left arm under B's left armpit
    knot = B.head_of("Spine2") + V(0.07, -0.13, 0.02)
    hands_to(A, "Right", knot + V(0.0, 0.0, 0.03), V(-0.6, 0.3, 1.0), palm=V(0, -1, 0))
    hands_to(A, "Left", knot + V(0.02, 0.01, -0.04), V(0.9, 0.3, -0.6), palm=V(0, -1, 0))
    # B fights the choking arm
    w = A.head_of("RightHand")
    elbow = A.tail_of("RightArm")
    hands_to(B, "Left", w + V(0.01, -0.05, 0.03), V(0.6, -0.2, -1))
    hands_to(B, "Right", (w + elbow) * 0.5 + V(0, -0.06, 0.02), V(-0.6, -0.2, -1))
    B.ground()
    A.ground()


def pair_clinch(A, B):
    """A = Thai plum (double collar tie), B = tied up, posture broken."""
    A.set_origin((0, 0.26, 0), 0)
    B.set_origin((0, -0.26, 0), 180)
    # B bent forward toward A, head pulled down
    B.place(V(0, 0.10, 0.88), up=V(0, -0.45, 1), front=V(0, -1, 0))
    B.spine(14, 0, 0)
    legs_stance(B, "Left", width=0.30, depth=0.46)
    B.look(V(0, -0.35, -1), up=V(0, -1, 0.4))
    # A tall posture, hands locked behind B's head
    A.place(V(0, 0.03, 0.91), up=V(0, -0.05, 1), front=V(0, -1, 0))
    A.spine(4, 0, 0)
    legs_stance(A, "Left", width=0.28, depth=0.42)
    A.look(V(0, -1, -0.3), up=V(0, -0.2, 1))
    bh = B.pb["Head"]
    back_of_head = bh.head + bh.matrix.to_3x3() @ V(0, 0.09, -0.07)
    for side in ("Left", "Right"):
        s = mx(side)
        tgt = back_of_head + A.Wd(V(0.025 * s, 0.0, 0.03))
        hands_to(A, side, tgt, A.Wd(V(0.15 * s, 0.25, -1)), palm=A.Wd(V(0, 1, 0.2)))
    # B frames: hands on A's biceps
    for side in ("Left", "Right"):
        s = mx(side)
        other_side = "Right" if side == "Left" else "Left"
        bic = (A.head_of(f"{other_side}ForeArm") + A.head_of(f"{other_side}Arm")) * 0.5
        hands_to(B, side, bic + B.Wd(V(0, -0.02, -0.03)), B.Wd(V(0.4 * s, 0.4, -1)))
    A.ground()
    B.ground()


def pair_double_leg(A, B):
    """A = double-leg shot (penetration step), B = defending, hips back, hands down."""
    A.set_origin((0, 0.58, 0), 0)
    B.set_origin((0, -0.42, 0), 180)
    # B: wide base, hips back, chest coming over
    B.place(V(0, 0.12, 0.80), up=V(0, -0.65, 1), front=V(0, -1, 0))
    B.spine(10, 0, 0)
    legs_stance(B, "Left", width=0.36, depth=0.58, rear_heel=0.12)
    B.look(V(0, -0.4, -1), up=V(0, -1, 0.2))
    # A: deep shot, lead knee on the mat between B's feet
    A.place(V(0.03, -0.20, 0.55), up=V(0, -1, 0.65), front=V(0, -0.5, -1))
    A.spine(-6, 0, 0)
    knee = A.W(V(0.09, -0.36, 0.06))
    hip = A.head_of("LeftUpLeg")
    A.aim("LeftUpLeg", knee - hip, A.Wd(V(0, -1, 0)))
    A.aim("LeftLeg", A.Wd(V(0.04, 1, -0.10)), A.Wd(V(0, 0, -1)))
    A.toes_tucked("Left", V(0, -1, 0))
    A.reach("Right", "leg", A.W(V(-0.22, 0.50, 0.10)), A.Wd(V(-0.2, -0.3, -1)))
    A.foot_flat("Right", yaw=-30, heel_up=0.9)
    A.look(V(-0.3, -1, 0.15), up=V(0, -0.2, 1))
    # arms wrap behind B's knees
    for side in ("Left", "Right"):
        s = mx(side)
        bside = "Right" if side == "Left" else "Left"  # facing each other: A's left meets B's right
        bk = B.tail_of(f"{bside}UpLeg")
        tgt = bk + A.Wd(V(0.02 * s, -0.13, 0.03))
        hands_to(A, side, tgt, A.Wd(V(0.6 * s, 0.2, -0.4)), palm=A.Wd(V(-s, 0, 0)))
    # B pushes A's head / shoulders down
    hands_to(B, "Left", A.head_of("Head") + V(0.0, 0.05, 0.10), B.Wd(V(0.6, 0.2, 0.2)), grip=False,
             palm=V(0, 0, 1))
    B.open_hand("Left", 15)
    hands_to(B, "Right", A.head_of("LeftArm") + V(0.0, 0.0, 0.08), B.Wd(V(-0.6, 0.2, 0.2)), grip=False,
             palm=V(0, 0, 1))
    B.open_hand("Right", 15)
    A.ground()
    B.ground()


PAIR_POSES = {
    # name: (fn, role A clip, role B clip)
    "ClosedGuard": (pair_closed_guard, "ClosedGuard_Top", "ClosedGuard_Bottom"),
    "Mount": (pair_mount, "Mount_Top", "Mount_Bottom"),
    "SideControl": (pair_side_control, "SideControl_Top", "SideControl_Bottom"),
    "BackControl": (pair_back_control, "BackControl_Back", "BackControl_Front"),
    "Clinch": (pair_clinch, "Clinch_Plum", "Clinch_Tied"),
    "DoubleLeg": (pair_double_leg, "DoubleLeg_Shot", "DoubleLeg_Defend"),
}


# ============================================================ training scenarios
# Positions/yaw are in glTF space (Y-up, metres; yaw about +Y in degrees).
# A fighter with yaw 0 faces +Z. "me" = the learner, "opp" = the opponent.
def _single(clip, z, yaw):
    return {"clip": clip, "position": [0.0, 0.0, z], "yawDeg": yaw}


GAP = 0.80  # half the distance between two standing fighters at striking range

SCENARIOS = [
    {"id": "range_striking", "category": "distance", "label": "타격 거리 대치",
     "situation": "서로 오소독스 스탠스로 타격 거리에서 마주 섰다.",
     "fighters": {"me": _single("Stance_Orthodox", -GAP, 0), "opp": _single("Stance_Orthodox", GAP, 180)}},
    {"id": "southpaw_opponent", "category": "distance", "label": "사우스포 상대",
     "situation": "상대가 사우스포 스탠스로 서 있다.",
     "fighters": {"me": _single("Stance_Orthodox", -GAP, 0), "opp": _single("Stance_Southpaw", GAP, 180)}},
    {"id": "opp_jab", "category": "defense", "label": "상대의 잽",
     "situation": "상대가 리드 잽을 던진다.",
     "fighters": {"me": _single("Stance_Orthodox", -GAP, 0), "opp": _single("Jab_Orthodox", GAP, 180)}},
    {"id": "opp_cross", "category": "counter", "label": "상대의 크로스",
     "situation": "상대가 뒷손 스트레이트(크로스)를 던진다.",
     "fighters": {"me": _single("Block_HighGuard", -GAP, 0), "opp": _single("Cross_Orthodox", GAP, 180)}},
    {"id": "opp_teep", "category": "distance", "label": "상대의 앞차기",
     "situation": "상대가 리드 다리로 앞차기(팁)를 찬다.",
     "fighters": {"me": _single("Stance_Orthodox", -GAP - 0.1, 0), "opp": _single("Teep_Lead", GAP, 180)}},
    {"id": "opp_low_kick", "category": "defense", "label": "상대의 로우킥",
     "situation": "상대가 뒷다리 로우킥으로 내 앞다리를 노린다.",
     "fighters": {"me": _single("Stance_Orthodox", -GAP + 0.05, 0), "opp": _single("LowKick_Rear", GAP - 0.05, 180)}},
    {"id": "me_jab_open", "category": "attack", "label": "내 잽 공격",
     "situation": "내가 잽으로 거리를 잡는다. 상대는 하이가드.",
     "fighters": {"me": _single("Jab_Orthodox", -GAP, 0), "opp": _single("Block_HighGuard", GAP, 180)}},
    {"id": "clinch_plum", "category": "clinch", "label": "상대에게 목 클린치 당함",
     "situation": "상대가 양손으로 내 뒷머리를 잡았다(플럼).", "pair": "Clinch",
     "fighters": {"me": {"clip": "Clinch_Tied"}, "opp": {"clip": "Clinch_Plum"}}},
    {"id": "takedown_double_leg", "category": "takedown", "label": "더블레그 테이크다운 방어",
     "situation": "상대가 더블레그로 깊게 파고들었다.", "pair": "DoubleLeg",
     "fighters": {"me": {"clip": "DoubleLeg_Defend"}, "opp": {"clip": "DoubleLeg_Shot"}}},
    {"id": "guard_bottom", "category": "guard", "label": "클로즈드 가드(하위)",
     "situation": "나는 클로즈드 가드, 상대는 가드 안에서 자세를 세웠다.", "pair": "ClosedGuard",
     "fighters": {"me": {"clip": "ClosedGuard_Bottom"}, "opp": {"clip": "ClosedGuard_Top"}}},
    {"id": "guard_top", "category": "guard", "label": "클로즈드 가드 안(상위)",
     "situation": "상대의 클로즈드 가드 안에 있다. 패스가 필요하다.", "pair": "ClosedGuard",
     "fighters": {"me": {"clip": "ClosedGuard_Top"}, "opp": {"clip": "ClosedGuard_Bottom"}}},
    {"id": "mount_bottom", "category": "escape", "label": "마운트 당함",
     "situation": "상대가 마운트를 잡고 파운딩을 준비한다.", "pair": "Mount",
     "fighters": {"me": {"clip": "Mount_Bottom"}, "opp": {"clip": "Mount_Top"}}},
    {"id": "mount_top", "category": "ground", "label": "마운트 상위",
     "situation": "내가 마운트를 잡았다. 상대는 엉덩이를 밀어낸다.", "pair": "Mount",
     "fighters": {"me": {"clip": "Mount_Top"}, "opp": {"clip": "Mount_Bottom"}}},
    {"id": "side_control_bottom", "category": "escape", "label": "사이드 컨트롤 하위",
     "situation": "상대가 사이드 컨트롤에서 크로스페이스를 건다.", "pair": "SideControl",
     "fighters": {"me": {"clip": "SideControl_Bottom"}, "opp": {"clip": "SideControl_Top"}}},
    {"id": "side_control_top", "category": "transition", "label": "사이드 컨트롤 상위",
     "situation": "내가 사이드 컨트롤을 잡았다. 다음 전환은?", "pair": "SideControl",
     "fighters": {"me": {"clip": "SideControl_Top"}, "opp": {"clip": "SideControl_Bottom"}}},
    {"id": "back_taken", "category": "escape", "label": "백 컨트롤 당함",
     "situation": "상대가 등 뒤에서 훅을 넣고 시트벨트 그립을 잡았다.", "pair": "BackControl",
     "fighters": {"me": {"clip": "BackControl_Front"}, "opp": {"clip": "BackControl_Back"}}},
    {"id": "back_take", "category": "transition", "label": "백 컨트롤 상위",
     "situation": "내가 백을 잡았다. 초크로 마무리할 수 있을까?", "pair": "BackControl",
     "fighters": {"me": {"clip": "BackControl_Back"}, "opp": {"clip": "BackControl_Front"}}},
]
