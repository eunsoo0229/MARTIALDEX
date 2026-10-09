"""MARTIALDEX fighter — signed-distance body definition + surface-nets mesher.

The body is a list of SDF primitives combined with polynomial smooth-min, so
muscles/joints/face features blend into one organic surface instead of
looking like stuck-on balls. Everything is plain numpy (Blender's bundled
python has no scipy/skimage).

Coordinates: metres, Z-up, character faces -Y, left side is +X (A-pose rest,
same frame as skeleton.py).
"""
import math

import numpy as np
from mathutils import Vector

import skeleton as SK

J = SK.joints()


def A(v):
    return np.asarray(tuple(v), dtype=np.float64)


# ------------------------------------------------------------ sdf primitives
def sd_round_cone(P, a, b, r1, r2):
    """Inigo Quilez' exact round cone (capsule with two radii)."""
    a, b = A(a), A(b)
    ba = b - a
    l2 = ba @ ba
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = P - a
    y = pa @ ba
    z = y - l2
    q = pa * l2 - np.outer(y, ba)
    x2 = np.einsum("ij,ij->i", q, q)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d_mid = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d_b = np.sqrt(x2 + z2) * il2 - r2
    d_a = np.sqrt(x2 + y2) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d_b, np.where(np.sign(y) * a2 * y2 < k, d_a, d_mid))


def _basis(axis, side):
    z = Vector(axis).normalized()
    x = Vector(side) if side is not None else (Vector((0, 0, 1)) if abs(z.z) < 0.9 else Vector((1, 0, 0)))
    x = (x - z * x.dot(z)).normalized()
    y = z.cross(x)
    return np.array([x, y, z])  # rows = local axes


def sd_ellipsoid(P, c, radii, axis=None, side=None):
    """Approximate ellipsoid distance; radii in a local frame whose Z is `axis`."""
    L = P - A(c)
    if axis is not None:
        L = L @ _basis(axis, side).T
    r = A(radii)
    k0 = np.linalg.norm(L / r, axis=1)
    k1 = np.linalg.norm(L / (r * r), axis=1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def sd_round_box(P, c, half, r, axes):
    """axes: 3x3 rows = local x,y,z world directions."""
    L = (P - A(c)) @ np.asarray(axes).T
    q = np.abs(L) - A(half)
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(axis=1), 0) - r


def sd_vloft(P, rings, n):
    """Vertical loft of super-ellipse rings: rings = [(z, rx, front, back, yc)].

    'front' extends toward -Y. Distance is measured radially inside each
    z-slice and capped at both ends.
    """
    R = np.asarray(rings, dtype=np.float64)
    z = P[:, 2]
    rx = np.interp(z, R[:, 0], R[:, 1])
    fr = np.interp(z, R[:, 0], R[:, 2])
    bk = np.interp(z, R[:, 0], R[:, 3])
    yc = np.interp(z, R[:, 0], R[:, 4])
    x = P[:, 0]
    y = P[:, 1] - yc
    ry = np.where(y < 0, fr, bk)
    rho = (np.abs(x / rx) ** n + np.abs(y / ry) ** n) ** (1.0 / n)
    rad = np.sqrt(x * x + y * y)
    d2 = rad * (1.0 - 1.0 / np.maximum(rho, 1e-6))
    # inside near the axis, approximate with the scaled normalised radius
    d2 = np.where(rho < 0.3, (rho - 1.0) * np.minimum(rx, ry), d2)
    return np.maximum(d2, np.maximum(R[0, 0] - z, z - R[-1, 0]))


def half_space(P, co, no):
    """Negative on the side the normal points to."""
    return -((P - A(co)) @ A(no))


# ------------------------------------------------------------ smooth ops
def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


class Op:
    """One primitive + how it combines with the field so far."""

    def __init__(self, fn, lo, hi, k=0.0, mode="union"):
        self.fn, self.k, self.mode = fn, k, mode
        m = max(k, 0.0) + 0.004
        self.lo, self.hi = np.asarray(lo) - m, np.asarray(hi) + m


def rc_op(a, b, r1, r2, k):
    a, b = A(a), A(b)
    r = max(r1, r2)
    return Op(lambda P: sd_round_cone(P, a, b, r1, r2), np.minimum(a, b) - r, np.maximum(a, b) + r, k)


def el_op(c, radii, k, axis=None, side=None, mode="union"):
    c = A(c)
    r = max(radii)
    return Op(lambda P: sd_ellipsoid(P, c, radii, axis, side), c - r, c + r, k, mode)


def chain_ops(pts, radii, k, k_inner=None):
    """Tapered limb through several points (round cones blended together)."""
    ops = []
    for i in range(len(pts) - 1):
        ops.append(rc_op(pts[i], pts[i + 1], radii[i], radii[i + 1], k if i == 0 else (k_inner if k_inner is not None else k)))
    return ops


def lerp(a, b, t):
    return Vector(a) + (Vector(b) - Vector(a)) * t


# ------------------------------------------------------------ body definition
TORSO = [  # z, rx, front, back, y_centre
    (0.780, 0.090, 0.060, 0.070, 0.000),
    (0.820, 0.150, 0.088, 0.100, 0.000),
    (0.870, 0.180, 0.100, 0.112, 0.000),
    (0.950, 0.176, 0.098, 0.106, 0.000),
    (1.000, 0.163, 0.096, 0.095, 0.000),
    (1.060, 0.150, 0.096, 0.090, 0.000),
    (1.130, 0.156, 0.100, 0.093, -0.002),
    (1.200, 0.167, 0.106, 0.099, -0.005),
    (1.270, 0.176, 0.110, 0.103, -0.006),
    (1.340, 0.180, 0.106, 0.103, -0.004),
    (1.405, 0.174, 0.096, 0.098, 0.000),
    (1.450, 0.145, 0.078, 0.090, 0.008),
    (1.490, 0.085, 0.060, 0.072, 0.015),
    (1.520, 0.064, 0.057, 0.060, 0.020),
    (1.580, 0.057, 0.052, 0.056, 0.018),
    (1.625, 0.050, 0.045, 0.050, 0.015),
]
HEAD = [  # z, rx, front, back, y_centre
    (1.548, 0.018, 0.016, 0.014, -0.074),
    (1.560, 0.034, 0.036, 0.030, -0.058),
    (1.580, 0.054, 0.060, 0.058, -0.037),
    (1.605, 0.062, 0.080, 0.080, -0.020),
    (1.630, 0.068, 0.090, 0.098, -0.010),
    (1.660, 0.073, 0.096, 0.104, -0.001),
    (1.690, 0.077, 0.098, 0.107, 0.000),
    (1.720, 0.077, 0.097, 0.107, 0.000),
    (1.748, 0.073, 0.090, 0.101, 0.001),
    (1.772, 0.064, 0.076, 0.087, 0.003),
    (1.790, 0.048, 0.054, 0.064, 0.005),
    (1.800, 0.026, 0.028, 0.034, 0.006),
    (1.804, 0.006, 0.006, 0.008, 0.006),
]

# shorts hem position along the thigh (0 = hip joint, 1 = knee)
SHORTS_T = 0.59


def body_ops():
    ops = []
    ops.append(Op(lambda P: sd_vloft(P, TORSO, 2.4), (-0.2, -0.13, 0.77), (0.2, 0.13, 1.63), 0.0))
    ops.append(Op(lambda P: sd_vloft(P, HEAD, 2.3), (-0.09, -0.12, 1.54), (0.09, 0.12, 1.81), 0.03))
    ops += face_ops()
    for s in (1, -1):
        ops += torso_muscles(s)
        ops += arm_ops(s)
        ops += leg_ops(s)
    return ops


def M(v, s):
    return SK.mirror(Vector(v), s)


def face_ops():
    ops = []
    ops.append(rc_op((0, -0.097, 1.694), (0, -0.117, 1.634), 0.0070, 0.0095, 0.008))  # nose bridge -> tip
    ops.append(el_op((0, -0.108, 1.625), (0.008, 0.007, 0.005), 0.004))  # columella
    for s in (1, -1):
        ops.append(el_op((0.0115 * s, -0.103, 1.628), (0.0080, 0.0080, 0.0065), 0.006))  # alae
        ops.append(el_op((0.033 * s, -0.088, 1.705), (0.025, 0.009, 0.007), 0.014, axis=(0, 0, 1)))  # brow ridge
        ops.append(el_op((0.050 * s, -0.070, 1.656), (0.018, 0.012, 0.012), 0.03))  # cheekbone
        ops.append(el_op((0.080 * s, 0.010, 1.657), (0.0062, 0.020, 0.029), 0.004, axis=(0.0, 0.0, 1.0),
                         side=(1.0 * s, 0.3, 0.0)))  # ear: thin along x, flared back
        ops.append(rc_op((0.058 * s, 0.024, 1.622), (0.018 * s, -0.048, 1.492), 0.015, 0.013, 0.015))  # SCM
        # eye socket (smooth subtraction)
        ops.append(el_op((0.032 * s, -0.095, 1.6775), (0.0160, 0.020, 0.0066), 0.005, mode="subtract"))
    ops.append(el_op((0, -0.094, 1.567), (0.020, 0.013, 0.015), 0.014))  # chin
    ops.append(el_op((0, -0.097, 1.600), (0.018, 0.006, 0.0042), 0.006))  # upper lip
    ops.append(el_op((0, -0.095, 1.5885), (0.015, 0.0065, 0.0048), 0.006))  # lower lip
    ops.append(el_op((0, -0.110, 1.5945), (0.022, 0.012, 0.0012), 0.002, mode="subtract"))  # mouth line
    ops.append(el_op((0, -0.050, 1.528), (0.011, 0.010, 0.015), 0.012))  # adam's apple
    return ops


def torso_muscles(s):
    ops = []
    ops.append(el_op(M((0.070, -0.072, 1.335), s), (0.078, 0.045, 0.058), 0.035, axis=(0, -1, 0), side=(1, 0, 0.25 * s)))  # pec
    ops.append(el_op(M((0.148, 0.030, 1.270), s), (0.042, 0.070, 0.130), 0.035, axis=(0, 0, 1)))  # lat
    ops.append(el_op(M((0.070, 0.070, 0.875), s), (0.085, 0.060, 0.090), 0.04, axis=(0, 0, 1)))  # glute
    ops.append(rc_op(M((0.030, 0.040, 1.535), s), M((0.160, 0.025, 1.458), s), 0.034, 0.030, 0.035))  # trapezius
    ops.append(el_op(M((0.040, -0.088, 1.140), s), (0.040, 0.030, 0.090), 0.04, axis=(0, 0, 1)))  # abdominal block
    return ops


def arm_frame(s):
    d = SK.mirror(SK.ARM_DIR, s)
    front = (Vector((0, -1, 0)) - d * (-d.y)).normalized()
    up = d.cross(front).normalized()
    if up.z < 0:
        up = -up
    return d, front, up


def arm_ops(s):
    ops = []
    S, E, W = M(J["shoulder"], s), M(J["elbow"], s), M(J["wrist"], s)
    d, front, up = arm_frame(s)
    fd = SK.mirror(SK.FOREARM_DIR, s)
    w = SK.mirror(SK.HAND_W, s)
    p = SK.mirror(SK.HAND_P, s)
    ops += chain_ops([S - d * 0.025, lerp(S, E, 0.45), E], [0.050, 0.046, 0.040], 0.03, 0.02)
    ops.append(el_op(S + d * 0.030 + up * 0.012, (0.058, 0.055, 0.080), 0.03, axis=d, side=front))  # deltoid
    ops.append(el_op(lerp(S, E, 0.56) + front * 0.020, (0.034, 0.031, 0.088), 0.025, axis=d, side=front))  # biceps
    ops.append(el_op(lerp(S, E, 0.42) - front * 0.022, (0.035, 0.034, 0.095), 0.025, axis=d, side=front))  # triceps
    ops += chain_ops([E, lerp(E, W, 0.3), W], [0.041, 0.042, 0.027], 0.02)
    ops.append(el_op(lerp(E, W, 0.25) + up * 0.010 + w * 0.006, (0.033, 0.030, 0.088), 0.025, axis=fd, side=w))  # flexors
    ops.append(el_op(W + fd * 0.005, (0.031, 0.019, 0.022), 0.012, axis=fd, side=w))  # flat wrist

    # hand: palm box in (w, a, p) frame
    a = fd
    axes = np.array([w, a, p])
    pc = W + a * 0.048 + p * 0.001
    ops.append(Op(lambda P, c=pc: sd_round_box(P, c, (0.032, 0.040, 0.0055), 0.0095, axes),
                  A(pc) - 0.07, A(pc) + 0.07, 0.008))
    ops.append(el_op(W + a * 0.030 + w * 0.024 + p * 0.010, (0.015, 0.013, 0.028), 0.012, axis=a, side=w))  # thenar
    ops.append(el_op(W + a * 0.040 - w * 0.026 + p * 0.008, (0.012, 0.010, 0.032), 0.010, axis=a, side=w))  # hypothenar
    for name, *_r in SK.FINGERS:
        pts = [M(q, s) for q in J[f"finger_{name}"]]
        r = _r[-1]
        radii = [r, r * 0.93, r * 0.86, r * 0.78]
        ops += chain_ops(pts, radii, 0.006, 0.002)
    tp = [M(q, s) for q in J["finger_Thumb"]]
    rr = SK.THUMB["radii"]
    ops += chain_ops(tp, [rr[0], rr[1], rr[2], rr[2] * 0.88], 0.012, 0.002)
    return ops


def leg_ops(s):
    ops = []
    H, K, Ak = M(J["hip"], s), M(J["knee"], s), M(J["ankle"], s)
    F = Vector((0, -1, 0))
    X = Vector((s, 0, 0))
    td = (K - H).normalized()
    sd = (Ak - K).normalized()
    ops += chain_ops([H + Vector((0, 0, 0.03)), lerp(H, K, 0.45), K], [0.092, 0.078, 0.053], 0.04, 0.03)
    ops.append(el_op(lerp(H, K, 0.52) + F * 0.030, (0.056, 0.046, 0.14), 0.03, axis=td, side=X))  # quads
    ops.append(el_op(lerp(H, K, 0.50) - F * 0.030, (0.050, 0.040, 0.13), 0.03, axis=td, side=X))  # hamstrings
    ops.append(el_op(lerp(H, K, 0.80) + F * 0.012 - X * 0.028, (0.030, 0.028, 0.065), 0.025, axis=td, side=X))  # VMO
    ops.append(el_op(K + F * 0.040 + Vector((0, 0, 0.005)), (0.024, 0.014, 0.027), 0.012))  # patella
    ops += chain_ops([K, lerp(K, Ak, 0.35), Ak], [0.050, 0.045, 0.031], 0.025, 0.03)
    ops.append(el_op(lerp(K, Ak, 0.28) - F * 0.028 + X * 0.012, (0.040, 0.037, 0.10), 0.03, axis=sd, side=X))  # calf lat
    ops.append(el_op(lerp(K, Ak, 0.31) - F * 0.026 - X * 0.015, (0.043, 0.040, 0.11), 0.03, axis=sd, side=X))  # calf med
    ops.append(el_op(Ak + X * 0.020, (0.008, 0.011, 0.010), 0.008))  # malleoli
    ops.append(el_op(Ak - X * 0.018 + Vector((0, 0, 0.006)), (0.008, 0.011, 0.010), 0.008))

    # foot (clipped flat at the sole afterwards)
    heel, ball = M(J["heel"], s), M(J["ball"], s)
    ops.append(el_op(heel + Vector((0, -0.005, 0.0)), (0.030, 0.038, 0.034), 0.02))
    ops.append(rc_op(heel, ball, 0.030, 0.022, 0.02))
    ops.append(rc_op(Ak + Vector((0, -0.010, -0.02)), M((0.132, -0.075, 0.034), s), 0.034, 0.024, 0.025))  # instep
    ops.append(el_op(ball + Vector((0, 0.0, 0.002)), (0.045, 0.024, 0.021), 0.02, axis=(0, 0, 1)))
    ops.append(el_op(M((0.165, -0.04, 0.024), s), (0.020, 0.06, 0.020), 0.02, axis=(0, 0, 1)))  # lateral edge
    toes = [  # x, base y, tip y, radius
        (0.113, -0.140, -0.205, 0.0125),
        (0.133, -0.146, -0.196, 0.0088),
        (0.149, -0.143, -0.187, 0.0080),
        (0.162, -0.137, -0.175, 0.0074),
        (0.173, -0.128, -0.161, 0.0068),
    ]
    for x, y0, y1, r in toes:
        ops.append(rc_op(M((x, y0, 0.021), s), M((x + 0.003 * s * 0, y1, 0.015), s), r, r * 0.95, 0.004))
    # sole: clip everything below the floor
    ops.append(Op(lambda P: half_space(P, (0, 0, 0.003), (0, 0, 1)),
                  M((0.06, -0.24, -0.02), s), M((0.20, 0.12, 0.02), s), 0.006, "clip"))

    # loose shorts leg (flat hem)
    hem = lerp(H, K, SHORTS_T)
    top = M((0.085, 0.0, 0.94), s)
    hn = (H - K).normalized()

    def shorts(P, top=A(top), hem=A(hem), hn=A(hn)):
        return np.maximum(sd_round_cone(P, top, hem - hn * 0.02, 0.110, 0.090), half_space(P, hem, hn))

    ops.append(Op(shorts, np.minimum(A(top), A(hem)) - 0.12, np.maximum(A(top), A(hem)) + 0.12, 0.006))
    return ops


def _fix_bbox(op):
    lo, hi = np.minimum(op.lo, op.hi), np.maximum(op.lo, op.hi)
    op.lo, op.hi = lo, hi
    return op


OPS = None


def ops():
    global OPS
    if OPS is None:
        OPS = [_fix_bbox(o) for o in body_ops()]
    return OPS


def apply_op(F, P, op):
    """Combine op into field F (in place) for points P (both flat)."""
    m = np.all((P >= op.lo) & (P <= op.hi), axis=1)
    if op.mode == "clip":
        # clip only applies within its box; full-strength intersection
        idx = np.nonzero(m)[0]
        if len(idx):
            F[idx] = smax(F[idx], op.fn(P[idx]), op.k)
        return
    idx = np.nonzero(m)[0]
    if not len(idx):
        return
    d = op.fn(P[idx])
    if op.mode == "subtract":
        F[idx] = smax(F[idx], -d, op.k)
    else:
        F[idx] = smin(F[idx], d, op.k)


def field(P):
    P = np.asarray(P, dtype=np.float64)
    F = np.full(len(P), 1.0)
    for op in ops():
        apply_op(F, P, op)
    return F


# ------------------------------------------------------------ meshing
def grid_field(h):
    los = np.array([o.lo for o in ops() if o.mode == "union"]).min(axis=0) - 2 * h
    his = np.array([o.hi for o in ops() if o.mode == "union"]).max(axis=0) + 2 * h
    los[2] = max(los[2], -2 * h)
    shape = np.ceil((his - los) / h).astype(int) + 1
    print("grid", shape, shape.prod() / 1e6, "M points")
    F = np.ones(tuple(shape), dtype=np.float32)
    xs = los[0] + h * np.arange(shape[0])
    ys = los[1] + h * np.arange(shape[1])
    zs = los[2] + h * np.arange(shape[2])
    for op in ops():
        i0 = np.searchsorted(xs, op.lo[0]); i1 = np.searchsorted(xs, op.hi[0], "right")
        j0 = np.searchsorted(ys, op.lo[1]); j1 = np.searchsorted(ys, op.hi[1], "right")
        k0 = np.searchsorted(zs, op.lo[2]); k1 = np.searchsorted(zs, op.hi[2], "right")
        if i0 >= i1 or j0 >= j1 or k0 >= k1:
            continue
        X, Y, Z = np.meshgrid(xs[i0:i1], ys[j0:j1], zs[k0:k1], indexing="ij")
        P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
        sub = F[i0:i1, j0:j1, k0:k1].astype(np.float64).ravel()
        d = op.fn(P)
        if op.mode == "subtract":
            sub = smax(sub, -d, op.k)
        elif op.mode == "clip":
            sub = smax(sub, d, op.k)
        else:
            sub = smin(sub, d, op.k)
        F[i0:i1, j0:j1, k0:k1] = sub.reshape(X.shape)
    return F, los


def surface_nets(F, origin, h):
    """Naive surface nets: one vertex per sign-changing cell, one quad per
    sign-changing grid edge. Returns (verts (n,3), quads (m,4))."""
    nx, ny, nz = F.shape
    inside = F < 0
    cell_ids_all = []
    pos_all = []
    # crossings on edges along each axis, accumulated into the 4 adjacent cells
    quads = []
    for axis in range(3):
        sl0 = [slice(None)] * 3
        sl1 = [slice(None)] * 3
        sl0[axis] = slice(0, -1)
        sl1[axis] = slice(1, None)
        ch = inside[tuple(sl0)] != inside[tuple(sl1)]
        e = np.argwhere(ch)  # edge start indices
        f0 = F[tuple(sl0)][ch].astype(np.float64)
        f1 = F[tuple(sl1)][ch].astype(np.float64)
        t = f0 / (f0 - f1)
        pos = e.astype(np.float64)
        pos[:, axis] += t
        o1, o2 = [a for a in range(3) if a != axis]
        flip = inside[tuple(sl0)][ch]
        cells = []
        for d1, d2 in ((0, 0), (1, 0), (1, 1), (0, 1)):
            c = e.copy()
            c[:, o1] -= d1
            c[:, o2] -= d2
            cells.append(c)
        valid = np.all([(c[:, o1] >= 0) & (c[:, o2] >= 0) & (c[:, o1] < F.shape[o1] - 1) & (c[:, o2] < F.shape[o2] - 1)
                        for c in cells], axis=0)
        for c in cells:
            cid = (c[:, 0] * (ny - 1) + c[:, 1]) * (nz - 1) + c[:, 2]
            cell_ids_all.append(cid[valid])
            pos_all.append(pos[valid])
        cid4 = np.stack([((c[:, 0] * (ny - 1) + c[:, 1]) * (nz - 1) + c[:, 2]) for c in cells], axis=1)[valid]
        fl = flip[valid]
        if axis == 1:
            fl = ~fl
        cid4[fl] = cid4[fl][:, ::-1]
        quads.append(cid4)
    cid = np.concatenate(cell_ids_all)
    pos = np.concatenate(pos_all)
    uniq, inv = np.unique(cid, return_inverse=True)
    acc = np.zeros((len(uniq), 3))
    np.add.at(acc, inv, pos)
    cnt = np.bincount(inv, minlength=len(uniq))[:, None]
    verts = origin + h * (acc / cnt)
    Q = np.concatenate(quads)
    Q = np.searchsorted(uniq, Q)
    return verts, Q


def project(verts, iters=2, eps=4e-4):
    """Newton-project vertices onto the zero level set."""
    V = verts.copy()
    for _ in range(iters):
        f = field(V)
        g = np.zeros_like(V)
        for a in range(3):
            o = np.zeros(3)
            o[a] = eps
            g[:, a] = (field(V + o) - field(V - o)) / (2 * eps)
        gl = np.einsum("ij,ij->i", g, g)
        step = (f / np.maximum(gl, 1e-6))[:, None] * g
        step = np.clip(step, -0.002, 0.002)
        V -= step
    return V
