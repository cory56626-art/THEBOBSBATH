"""Procedural skinwalker model.

Builds a fully rigged creature out of Roblox parts:
  * invisible, world-aligned bone parts linked by Motor6Ds named "Joint"
    (so a script can animate any bone via bone.Joint.Transform)
  * visible flesh / bone / pelt pieces welded to those bones.

The creature stands at the origin, facing -Z (Roblox "forward").
"""
from __future__ import annotations

import math
import random

from rbx import CF, Inst, add, cross, dot, length, lerp, motor, mul, norm, part, sub, v, weld

# ---------------------------------------------------------------- palette
MUSCLE = (88, 17, 16)
MUSCLE_DK = (50, 9, 9)
MUSCLE_LT = (118, 30, 25)
SINEW = (132, 92, 74)
BONE = (186, 174, 146)
BONE_DIRTY = (132, 117, 92)
TOOTH = (222, 208, 172)
CAVITY = (30, 5, 5)
BLOOD = (98, 3, 5)
BLOOD_DRY = (55, 7, 7)
PELT = (88, 78, 64)
PELT_DK = (56, 49, 40)
SKIN_PALE = (128, 104, 88)
CLAW = (22, 18, 16)
EYE = (255, 176, 96)  # amber eyeshine
TENDRIL = (40, 9, 9)
TENDRIL_DK = (22, 6, 6)

X = (1.0, 0.0, 0.0)
UP = (0.0, 1.0, 0.0)


class Rig:
    def __init__(self, model: Inst, rng: random.Random):
        self.model = model
        self.rng = rng
        self.bones: dict[str, Inst] = {}
        self.count = 0

    # ---------------------------------------------------------- bones
    def bone(self, name, pos, parent=None, anchored=False):
        b = part(name, CF(pos), (0.2, 0.2, 0.2), (0, 0, 0), transparency=1.0,
                 anchored=anchored, shadow=False, query=False)
        b.meta["hidden"] = True
        b.meta["parent"] = parent
        b.meta["joint"] = pos
        if parent is not None:
            b.add(motor("Joint", self.bones[parent], b))
        self.bones[name] = b
        self.model.add(b)
        return name

    # ---------------------------------------------------------- pieces
    def _attach(self, bone, p):
        p.meta["bone"] = bone
        p.add(weld("Weld", self.bones[bone], p))
        self.model.add(p)
        self.count += 1
        return p

    def seg(self, bone, a, b, d, color, mat="SmoothPlastic", name="Flesh", refl=0.0):
        """Cylinder from a to b."""
        if length(sub(b, a)) < 1e-3:
            return None
        cf = CF.along(a, b)
        return self._attach(bone, part(name, cf, (length(sub(b, a)), d, d), color, mat,
                                       shape="Cylinder", reflectance=refl))

    def ball(self, bone, c, d, color, mat="SmoothPlastic", name="Flesh", refl=0.0):
        return self._attach(bone, part(name, CF(c), (d, d, d), color, mat, shape="Ball", reflectance=refl))

    def blob(self, bone, cf, size, color, mat="SmoothPlastic", name="Flesh", refl=0.0):
        """Ellipsoid with the given CFrame and size."""
        return self._attach(bone, part(name, cf, size, color, mat, ellipsoid=True, reflectance=refl))

    def blob_along(self, bone, a, b, w, h, color, mat="SmoothPlastic", name="Flesh", refl=0.0, up=UP):
        """Ellipsoid stretched from a to b (w = side width, h = height)."""
        cf = CF.along(a, b, up)
        return self.blob(bone, cf, (length(sub(b, a)), h, w), color, mat, name, refl)

    def fibers(self, bone, a, b, thick, n=5, name="Muscle", colors=(MUSCLE, MUSCLE_DK, MUSCLE_LT), core=True):
        """A bundle of stringy muscle fibres from a to b instead of one smooth blob."""
        r = self.rng
        d = norm(sub(b, a))
        p1 = norm(cross(d, UP if abs(dot(d, UP)) < 0.9 else X))
        p2 = cross(d, p1)
        L = length(sub(b, a))
        if core:
            self.blob_along(bone, a, b, thick * 0.62, thick * 0.62, MUSCLE_DK, "Fabric", name)
        for i in range(n):
            ang = 2 * math.pi * i / n + r.uniform(-0.4, 0.4)
            off = add(mul(p1, math.cos(ang) * thick * 0.24), mul(p2, math.sin(ang) * thick * 0.24))
            sa = add(add(a, mul(off, 0.6)), mul(d, r.uniform(-0.04, 0.12) * L))
            sb = add(add(b, mul(off, 0.7)), mul(d, -r.uniform(0.0, 0.14) * L))
            w = thick * r.uniform(0.32, 0.5)
            wet = r.random() < 0.35
            self.blob_along(bone, sa, sb, w, w * r.uniform(0.75, 1.1), r.choice(colors),
                            "SmoothPlastic" if wet else "Fabric", name, refl=0.12 if wet else 0.0)

    def wedge(self, bone, cf, size, color, mat="Fabric", name="Pelt"):
        return self._attach(bone, part(name, cf, size, color, mat, cls="WedgePart"))

    def drip(self, bone, top, length_, d=0.07):
        bottom = add(top, (0.0, -length_, 0.0))
        self.seg(bone, top, bottom, d, BLOOD, name="Blood", refl=0.3)
        self.ball(bone, bottom, d * 1.7, BLOOD, name="Blood", refl=0.3)

    def j(self, s=0.05):
        r = self.rng
        return (r.uniform(-s, s), r.uniform(-s, s), r.uniform(-s, s))


def spine_back(d):
    """Unit vector pointing out of the creature's back for a spine direction d."""
    return norm(cross(X, d))


def build_creature(seed=1313) -> tuple[Inst, Rig]:
    rng = random.Random(seed)
    model = Inst("Model", "Skinwalker")
    rig = Rig(model, rng)

    # ---------------------------------------------------------- joint layout
    P = {
        "pelvis": v(0, 6.0, 0.25),
        "waist": v(0, 7.2, 0.05),
        "chest": v(0, 8.5, -0.75),
        "neck": v(0, 9.55, -2.15),
        "head": v(0, 9.7, -3.75),
        "jaw": v(0, 9.38, -4.12),
    }

    rig.bone("HumanoidRootPart", P["pelvis"], anchored=True)
    rig.bone("Pelvis", P["pelvis"], "HumanoidRootPart")
    rig.bone("Abdomen", P["waist"], "Pelvis")
    rig.bone("Chest", P["chest"], "Abdomen")
    rig.bone("Neck", P["neck"], "Chest")
    rig.bone("Head", P["head"], "Neck")
    rig.bone("Jaw", P["jaw"], "Head")

    build_spine(rig, P)
    build_torso(rig, P)
    build_head(rig, P)
    for side in (-1, 1):
        build_arm(rig, side)
        build_leg(rig, side)
    build_tendrils(rig, P)
    build_pelt(rig, P)

    model.set("PrimaryPart", "Ref", rig.bones["HumanoidRootPart"])
    return model, rig


# ================================================================== spine
def build_spine(rig: Rig, P):
    chain = [("Pelvis", P["pelvis"], P["waist"]), ("Abdomen", P["waist"], P["chest"]),
             ("Chest", P["chest"], P["neck"]), ("Neck", P["neck"], P["head"])]
    for bone, a, b in chain:
        d = norm(sub(b, a))
        back = spine_back(d)
        n = max(2, int(length(sub(b, a)) / 0.36))
        for i in range(n):
            t = (i + 0.5) / n
            c = add(lerp(a, b, t), mul(back, 0.5 if bone != "Neck" else 0.28))
            rig.blob(bone, CF.along(sub(c, mul(d, 0.15)), add(c, mul(d, 0.15)), back),
                     (0.3, 0.3, 0.42), BONE_DIRTY, "Concrete", "Vertebra")
            # spinous process jutting out of the skin
            tip = add(c, mul(back, 0.32 if bone != "Neck" else 0.18))
            rig.seg(bone, c, add(tip, rig.j(0.04)), 0.12, BONE, "Concrete", "Vertebra")


# ================================================================== torso
def build_torso(rig: Rig, P):
    # pelvis
    rig.blob("Pelvis", CF(add(P["pelvis"], v(0, 0.1, 0.2))), (1.6, 0.85, 1.0), MUSCLE_DK, "Fabric", "Hips")
    for s in (-1, 1):  # stringy groin / hip flexor fibres
        rig.fibers("Pelvis", add(P["pelvis"], v(s * 0.3, 0.45, -0.1)), add(P["pelvis"], v(s * 0.85, -0.35, -0.05)),
                   0.45, 3, "HipFlexor", core=False)
    for s in (-1, 1):
        rig.blob("Pelvis", CF.angles(0, 0, s * 0.35, add(P["pelvis"], v(s * 0.85, 0.35, 0.35))),
                 (0.85, 0.42, 0.85), BONE_DIRTY, "Concrete", "HipBone")
        rig.fibers("Pelvis", add(P["pelvis"], v(s * 0.35, 0.35, 0.7)), add(P["pelvis"], v(s * 0.8, -0.55, 0.65)),
                   0.85, 4, "Glute")

    # sunken abdomen with stretched muscle strands
    rig.blob_along("Abdomen", v(0, 6.35, 0.25), v(0, 8.35, -0.5), 1.05, 0.7, MUSCLE_DK, "Fabric", "Gut")
    for s in (-1, 1):
        rig.seg("Abdomen", v(s * 0.22, 6.55, -0.22), v(s * 0.3, 8.1, -1.0), 0.17, MUSCLE_LT, "Fabric", "Abs")
        rig.seg("Abdomen", v(s * 0.55, 6.6, 0.0), v(s * 0.75, 8.0, -0.6), 0.14, SINEW, "SmoothPlastic", "Oblique")

    # ribcage along the upper spine
    a, b = P["chest"], P["neck"]
    d = norm(sub(b, a))
    back = spine_back(d)
    ribs = 7
    for i in range(ribs):
        t = 0.02 + i / (ribs - 1) * 0.82
        spine_pt = lerp(add(a, mul(d, -0.55)), b, t)
        centre = sub(spine_pt, mul(back, 0.85))
        ax = 1.05 * (0.72 + 0.38 * math.sin(math.pi * (0.2 + 0.7 * t)))
        an = 0.88
        droop = 0.45
        for s in (-1, 1):
            end = 2.65 if rig.rng.random() > 0.18 else rig.rng.uniform(1.4, 2.1)  # some ribs snapped
            pts = []
            steps = 6
            for k in range(steps + 1):
                th = 0.25 + (end - 0.25) * k / steps
                p = add(centre, mul(back, an * math.cos(th)))
                p = add(p, mul(X, s * ax * math.sin(th)))
                p = add(p, mul(d, -droop * (1 - math.cos(th)) / 2))
                pts.append(p)
            for k in range(steps):
                rig.seg("Chest", pts[k], pts[k + 1], 0.13, BONE, "Concrete", "Rib")
            if end < 2.2:  # jagged broken end with a bit of blood
                rig.ball("Chest", pts[-1], 0.17, BLOOD_DRY, refl=0.2, name="Blood")
        # flesh between the ribs on the flanks (so the body is not see-through)
        for s in (-1, 1):
            if i % 2 == 0:
                c = add(centre, mul(X, s * ax * 0.78))
                rig.blob("Chest", CF.from_axes(c, X, d, back), (0.3, 0.55, 1.35), MUSCLE, "Fabric", "Intercostal")
    # dark chest cavity seen through the torn-open front
    mid = sub(lerp(a, b, 0.4), mul(back, 0.82))
    rig.blob("Chest", CF.from_axes(add(mid, mul(back, 0.12)), X, d, back), (1.7, 1.8, 1.05), CAVITY, "Fabric", name="Cavity")
    for k in range(5):  # torn sinew strands stretched across the opening
        y0 = rig.rng.uniform(-0.6, 0.7)
        a0 = add(add(mid, mul(d, y0)), add(mul(X, -0.75), mul(back, -0.55)))
        b0 = add(add(mid, mul(d, y0 + rig.rng.uniform(-0.5, 0.5))), add(mul(X, 0.75), mul(back, -0.55)))
        if k % 2:
            b0 = lerp(a0, b0, rig.rng.uniform(0.45, 0.7))  # snapped strand
            rig.drip("Chest", b0, rig.rng.uniform(0.2, 0.45), 0.05)
        rig.seg("Chest", a0, b0, rig.rng.uniform(0.05, 0.09), SINEW if k % 3 else MUSCLE_LT, name="Sinew", refl=0.1)

    # shoulder blades and muscle mass
    for s in (-1, 1):
        sc = add(add(lerp(a, b, 0.5), mul(back, 0.3)), mul(X, s * 0.85))
        rig.blob("Chest", CF.from_axes(sc, X, d, back) * CF.angles(0, 0, s * 0.25), (0.95, 1.35, 0.2),
                 BONE_DIRTY, "Concrete", "ShoulderBlade")
        shoulder = v(s * 1.8, 9.35, -1.85)
        rig.fibers("Chest", v(s * 0.15, 9.6, -1.75), add(shoulder, v(0, 0.1, 0.05)), 0.6, 4, "Trapezius")
        rig.fibers("Chest", add(shoulder, v(-s * 0.2, 0.35, 0.1)), add(shoulder, v(s * 0.25, -0.75, -0.1)), 0.8, 5, "Deltoid")
        # torn pectoral strips hanging off the front
        rig.seg("Chest", v(s * 0.25, 9.1, -2.2), add(shoulder, v(-s * 0.25, -0.25, -0.2)), 0.26, MUSCLE_LT, "Fabric", "Pectoral")
        flap_top = v(s * 0.55, 8.95, -2.25)
        rig.blob_along("Chest", flap_top, add(flap_top, v(s * 0.15, -1.1, -0.15)), 0.35, 0.08, MUSCLE_LT,
                       "Fabric", "TornFlesh")
        rig.drip("Chest", add(flap_top, v(s * 0.15, -1.1, -0.15)), rig.rng.uniform(0.3, 0.6))

    # neck
    rig.fibers("Neck", add(P["neck"], v(0, -0.1, 0.2)), add(P["head"], v(0, -0.15, 0.15)), 0.62, 5, "NeckMuscle")
    for s in (-1, 1):
        rig.seg("Neck", v(s * 0.32, 9.25, -2.0), v(s * 0.22, 9.4, -3.55), 0.12, SINEW, name="Tendon")


# ================================================================== head
def build_head(rig: Rig, P):
    """Long, gaunt coyote skull wearing the scraps of its own hide."""
    r = rig.rng
    hcf = CF.angles(-0.16, 0.0, 0.0, P["head"])
    hp = hcf.point

    def hcf_at(x, y, z, rx=0.0, ry=0.0, rz=0.0):
        return CF(hp((x, y, z)), hcf.R) * CF.angles(rx, ry, rz)

    # skull: small flat braincase, long narrow muzzle, nasal ridge
    rig.blob("Head", hcf_at(0, 0.2, -0.25, 0.08), (1.0, 0.82, 1.4), BONE, "Concrete", "Skull")
    rig.blob_along("Head", hp((0, 0.12, -0.7)), hp((0, -0.22, -3.05)), 0.6, 0.5, BONE, "Concrete", "Snout")
    rig.blob_along("Head", hp((0, 0.36, -0.8)), hp((0, 0.02, -2.75)), 0.26, 0.2, BONE_DIRTY, "Concrete", "NasalRidge")
    rig.blob_along("Head", hp((0, 0.45, 0.35)), hp((0, 0.55, -0.6)), 0.14, 0.22, BONE_DIRTY, "Concrete", "Crest")
    for s in (-1, 1):
        # deep sockets with a pinpoint of eyeshine
        rig.blob("Head", hcf_at(s * 0.34, 0.2, -1.0, 0, s * 0.35), (0.34, 0.26, 0.36), CAVITY, name="EyeSocket")
        rig.ball("Head", hp((s * 0.37, 0.19, -1.1)), 0.075, EYE, "Neon", "Eye")
        rig.blob_along("Head", hp((s * 0.2, 0.38, -0.75)), hp((s * 0.5, 0.33, -1.25)), 0.16, 0.13, BONE_DIRTY,
                       "Concrete", "Brow")
        rig.blob_along("Head", hp((s * 0.48, -0.02, -0.45)), hp((s * 0.3, -0.12, -1.7)), 0.18, 0.24,
                       BONE_DIRTY, "Concrete", "Cheekbone")
        rig.blob("Head", hcf_at(s * 0.09, -0.04, -2.95), (0.12, 0.1, 0.18), CAVITY, name="Nostril")
        # lipless, uneven teeth (a few missing)
        for k in range(7):
            if r.random() < 0.15 and k not in (5,):
                continue
            z = -1.15 - k * 0.27
            y = -0.2 - 0.2 * (k / 6)
            x = s * (0.24 - k * 0.012)
            top = hp((x, y, z))
            ln = 0.48 if k == 5 else r.uniform(0.16, 0.3)
            bot = hp((x + s * r.uniform(-0.04, 0.04), y - ln, z + r.uniform(0.0, 0.12)))
            rig.seg("Head", top, bot, 0.075 if k != 5 else 0.1, TOOTH if r.random() > 0.3 else BONE_DIRTY, name="Tooth")
        # torn pelt ears: pointed, one hanging limp
        base = hp((s * 0.32, 0.5, 0.15))
        tip = hp((s * 0.5, 1.45, 0.7)) if s > 0 else hp((-0.95, 0.25, 0.75))
        rig.blob_along("Head", base, tip, 0.1, 0.42, PELT_DK, "Fabric", "Ear")
        rig.blob_along("Head", lerp(base, tip, 0.1), lerp(base, tip, 0.75), 0.06, 0.24, MUSCLE_DK, "Fabric", "EarInner")
    # stolen hide stretched over the back of the skull, trailing down the neck
    for k, x in enumerate((-0.38, -0.12, 0.14, 0.38)):
        top = hp((x, 0.5, -0.35 - abs(x) * 0.3))
        bottom = hp((x * 1.3, 0.05 - r.uniform(0.1, 0.5), 1.4 + r.uniform(0.0, 0.6)))
        rig.blob_along("Head", top, bottom, r.uniform(0.32, 0.42), 0.07, PELT if k % 2 else PELT_DK, "Fabric",
                       "PeltScalp", up=hcf.rot((0, 1, 0)))
    rig.blob_along("Head", hp((0, -0.24, -1.0)), hp((0, -0.38, -2.75)), 0.46, 0.14, MUSCLE_DK, refl=0.2, name="Gums")

    # hanging jaw
    hinge = P["jaw"]
    jaw_dir = hcf.rot((0.0, -math.sin(0.62), -math.cos(0.62)))
    tip = add(hinge, mul(jaw_dir, 2.1))
    rig.blob_along("Jaw", hinge, tip, 0.48, 0.26, BONE, "Concrete", "Jawbone")
    jf = CF.along(hinge, tip)
    jup = jf.rot((0.0, 1.0, 0.0))
    for s in (-1, 1):
        for k in range(6):
            if r.random() < 0.15:
                continue
            base = add(lerp(hinge, tip, 0.3 + k * 0.115), jf.rot((0.0, 0.08, s * 0.17)))
            ln = r.uniform(0.15, 0.28) if k < 5 else 0.4
            lean = jf.rot((r.uniform(-0.1, 0.1), 0.0, s * r.uniform(0.0, 0.08)))
            rig.seg("Jaw", base, add(base, add(mul(jup, ln), lean)), 0.07, TOOTH, name="Tooth")
    rig.blob_along("Jaw", lerp(hinge, tip, 0.25), lerp(hinge, tip, 0.8), 0.32, 0.12, MUSCLE_DK, refl=0.2, name="Tongue")
    # strands of bloody saliva between the jaws
    for k, sx in ((0.5, -0.1), (0.66, 0.12), (0.8, 0.0)):
        lower = add(lerp(hinge, tip, k), mul(jup, 0.1))
        upper = hp((sx, -0.38, -1.2 - k * 1.2))
        rig.seg("Jaw", lower, upper, r.uniform(0.03, 0.045), BLOOD, name="Blood", refl=0.35)
    rig.blob("Jaw", CF.along(lerp(hinge, tip, 0.8), tip), (0.45, 0.2, 0.36), BLOOD_DRY, refl=0.25, name="Blood")
    for off in (v(0.1, -0.08, 0.1), v(-0.12, -0.08, 0.25), v(0.02, -0.1, -0.05)):
        rig.drip("Jaw", add(tip, off), r.uniform(0.35, 0.9))


# ================================================================== arms
def build_arm(rig: Rig, s: int):
    side = "Right" if s > 0 else "Left"
    sh, el, wr = v(s * 1.8, 9.35, -1.85), v(s * 2.6, 6.95, -2.6), v(s * 2.4, 4.3, -3.45)
    ua, la, hand = f"{side}UpperArm", f"{side}LowerArm", f"{side}Hand"
    rig.bone(ua, sh, "Chest")
    rig.bone(la, el, ua)
    rig.bone(hand, wr, la)
    out = v(s, 0, 0)

    # upper arm: muscle peeled back to show the bone
    rig.seg(ua, sh, el, 0.26, BONE_DIRTY, "Concrete", "Humerus")
    rig.fibers(ua, add(lerp(sh, el, 0.05), mul(out, 0.08)), add(lerp(sh, el, 0.78), mul(out, 0.1)), 0.55, 4, "Bicep")
    rig.seg(ua, add(sh, v(0, 0, 0.25)), add(el, v(0, 0.2, 0.25)), 0.15, MUSCLE_LT, "Fabric", "Tricep")
    rig.ball(ua, el, 0.46, BONE_DIRTY, "Concrete", "Elbow")

    # forearm: two bones wrapped in sinew
    fdir = norm(sub(wr, el))
    perp = norm(cross(fdir, (0.0, 0.0, 1.0)))
    for o in (-0.1, 0.1):
        rig.seg(la, add(el, mul(perp, o)), add(wr, mul(perp, o * 0.6)), 0.14, BONE, "Concrete", "ForearmBone")
    rig.fibers(la, lerp(el, wr, 0.05), lerp(el, wr, 0.62), 0.4, 4, "Forearm")
    for o in (-0.12, 0.0, 0.12):
        rig.seg(la, add(lerp(el, wr, 0.5), mul(perp, o)), add(wr, mul(perp, o * 0.7)), 0.07, SINEW, name="Tendon")
    # tatters of stolen pale skin hanging from the forearm
    for k in range(3):
        top = add(lerp(el, wr, 0.15 + 0.2 * k), mul(out, 0.2))
        rig.blob_along(la, top, add(top, v(s * 0.15, -rig.rng.uniform(0.6, 1.1), 0.1)), 0.3, 0.05,
                       SKIN_PALE, "Fabric", "SkinTatter")

    # hand + four long fingers with curling claws
    palm_end = add(wr, mul(fdir, 0.8))
    rig.blob_along(hand, add(wr, mul(fdir, 0.05)), palm_end, 0.72, 0.26, MUSCLE_DK, "Fabric", "Palm")
    wide = norm(cross(fdir, v(0, 0, -1)))
    for i in range(4):
        fname = f"{side}Finger{i + 1}"
        k0 = add(palm_end, mul(wide, (i - 1.5) * 0.2))
        dir0 = norm(add(add(fdir, mul(wide, (i - 1.5) * 0.18)), v(0, 0, -0.25)))
        lens = (0.78 - abs(i - 1.5) * 0.08, 0.62, 0.48)
        pts = [k0]
        d = dir0
        for n, ln in enumerate(lens):
            d = norm(add(d, v(0, 0.05, -0.32 * (n + 1) * 0.6)))
            pts.append(add(pts[-1], mul(d, ln)))
        rig.bone(fname + "A", pts[0], hand)
        rig.bone(fname + "B", pts[1], fname + "A")
        rig.seg(fname + "A", pts[0], pts[1], 0.17, MUSCLE_DK, "Fabric", "Finger")
        rig.ball(fname + "A", pts[1], 0.19, BONE_DIRTY, "Concrete", "Knuckle")
        rig.seg(fname + "B", pts[1], pts[2], 0.14, MUSCLE_DK, "Fabric", "Finger")
        rig.seg(fname + "B", pts[2], pts[3], 0.12, MUSCLE_DK, "Fabric", "Finger")
        claw_tip = add(pts[3], mul(norm(add(d, v(0, 0.1, -0.3))), 0.6))
        rig.seg(fname + "B", pts[3], claw_tip, 0.09, CLAW, refl=0.2, name="Claw")
        if s > 0 and i in (1, 2):  # blood on the right hand's claws
            rig.drip(fname + "B", claw_tip, rig.rng.uniform(0.25, 0.55), 0.05)


# ================================================================== legs (digitigrade)
def build_leg(rig: Rig, s: int):
    side = "Right" if s > 0 else "Left"
    hip, knee, hock, ankle = v(s * 1.0, 5.9, 0.4), v(s * 1.3, 3.8, -1.2), v(s * 1.2, 1.85, 1.05), v(s * 1.25, 0.4, -0.25)
    th, sn, mt, ft = f"{side}Thigh", f"{side}Shin", f"{side}Meta", f"{side}Foot"
    rig.bone(th, hip, "Pelvis")
    rig.bone(sn, knee, th)
    rig.bone(mt, hock, sn)
    rig.bone(ft, ankle, mt)

    rig.fibers(th, add(hip, v(0, 0.2, 0.05)), lerp(hip, knee, 0.88), 0.82, 6, "Thigh")
    rig.seg(th, lerp(hip, knee, 0.55), knee, 0.24, BONE_DIRTY, "Concrete", "Femur")
    rig.seg(th, add(hip, v(0, 0, 0.35)), add(knee, v(0, 0.3, 0.25)), 0.13, SINEW, name="Hamstring")
    rig.ball(th, add(knee, v(0, 0.05, -0.18)), 0.45, BONE, "Concrete", "Kneecap")

    rig.seg(sn, knee, hock, 0.32, MUSCLE_DK, "Fabric", "Shin")
    rig.seg(sn, add(knee, v(0, -0.1, -0.12)), add(hock, v(0, 0.1, -0.12)), 0.15, BONE, "Concrete", "ShinBone")
    rig.fibers(sn, add(lerp(knee, hock, 0.05), v(0, 0, 0.12)), add(lerp(knee, hock, 0.5), v(0, 0, 0.12)), 0.5, 4, "Calf")

    rig.ball(mt, add(hock, v(0, 0, 0.1)), 0.36, BONE_DIRTY, "Concrete", "Heel")
    rig.seg(mt, hock, ankle, 0.22, MUSCLE_DK, refl=0.1, name="Metatarsal")
    rig.seg(mt, add(hock, v(0, 0, 0.15)), add(ankle, v(0, 0.1, 0.12)), 0.07, SINEW, name="Tendon")

    for i, spread in enumerate((-0.4, 0.0, 0.4)):
        d1 = norm(v(spread * s * 0.6 + spread * 0.4, -0.25, -1.0))
        p1 = add(ankle, mul(d1, 0.6))
        p1 = (p1[0], max(p1[1], 0.22), p1[2])
        d2 = norm(v(d1[0], -0.35, d1[2]))
        p2 = add(p1, mul(d2, 0.45))
        p2 = (p2[0], 0.12, p2[2])
        rig.seg(ft, ankle, p1, 0.16, MUSCLE_DK, "Fabric", "Toe")
        rig.seg(ft, p1, p2, 0.13, MUSCLE_DK, "Fabric", "Toe")
        rig.seg(ft, p2, add(p2, v(d2[0] * 0.4, -0.08, d2[2] * 0.4)), 0.08, CLAW, refl=0.2, name="Claw")
    rig.ball(ft, ankle, 0.3, BONE_DIRTY, "Concrete", "Ankle")


# ================================================================== tendrils
def build_tendrils(rig: Rig, P):
    """Spindly sinew tendrils erupting from the upper back."""
    r = rig.rng
    a, b = P["chest"], P["neck"]
    d = norm(sub(b, a))
    back = spine_back(d)
    count = 10
    for ti in range(1, count + 1):
        off = r.uniform(-1.0, 1.0)
        t = r.uniform(0.1, 0.9)
        scale = r.uniform(0.6, 1.15)
        base = add(add(lerp(a, b, t), mul(back, 0.45)), mul(X, off))
        side = 1 if off >= 0 else -1
        dirn = norm(add(add(mul(back, r.uniform(0.6, 1.1)), v(0, r.uniform(0.4, 1.0), 0)), mul(X, side * r.uniform(0.3, 0.9))))
        curl = norm(v(side * r.uniform(0.3, 0.9), -1.0, r.uniform(-0.2, 0.6)))
        pts = [base]
        n = 6
        for k in range(n):
            wob = v(r.uniform(-0.25, 0.25), r.uniform(-0.2, 0.2), r.uniform(-0.25, 0.25))
            dirn = norm(add(add(dirn, mul(curl, r.uniform(0.18, 0.4))), wob))
            pts.append(add(pts[-1], mul(dirn, 0.72 * scale * (1 - k * 0.07))))
        parent = "Chest"
        for k in range(n):
            bn = f"Tendril{ti}_{k + 1}"
            rig.bone(bn, pts[k], parent)
            dia = 0.24 * scale * (1 - k / n * 0.72)
            col = TENDRIL if (k + ti) % 3 else TENDRIL_DK
            rig.seg(bn, pts[k], pts[k + 1], dia, col, refl=0.15, name="Tendril")
            rig.ball(bn, pts[k], dia * 1.15, MUSCLE_DK, refl=0.15, name="Tendril")
            parent = bn
        rig.seg(parent, pts[-1], add(pts[-1], mul(dirn, 0.45)), 0.045, CLAW, refl=0.2, name="Barb")


# ================================================================== stolen pelt
def build_pelt(rig: Rig, P):
    a, b = P["chest"], P["neck"]
    d = norm(sub(b, a))
    back = spine_back(d)
    for i in range(11):
        off = -1.45 + i * 0.29
        t = 0.25 + 0.55 * (1 - abs(off) / 1.6)
        top = add(add(lerp(a, b, t), mul(back, 0.62)), mul(X, off))
        top = add(top, v(0, 0.15 - abs(off) * 0.25, 0))
        ln = rig.rng.uniform(1.6, 3.4)
        bottom = add(top, v(off * 0.25, -ln, 0.55 + rig.rng.uniform(-0.15, 0.25)))
        rig.blob_along("Chest", top, bottom, rig.rng.uniform(0.45, 0.65), 0.09,
                       PELT if i % 3 else PELT_DK, "Fabric", "Pelt", up=back)
        if rig.rng.random() < 0.5:  # ragged strips at the ends
            rig.blob_along("Chest", bottom, add(bottom, v(rig.rng.uniform(-0.2, 0.2), -0.7, 0.1)), 0.16, 0.05,
                           PELT_DK, "Fabric", "Pelt", up=back)
    # coyote tail from the hide, hanging off the hips
    tail = [v(0, 6.35, 0.95), v(0.1, 5.2, 1.55), v(0.05, 3.9, 1.7), v(-0.1, 2.9, 1.45)]
    for k in range(3):
        rig.blob_along("Pelvis", tail[k], tail[k + 1], 0.55 - k * 0.1, 0.5 - k * 0.1, PELT if k % 2 else PELT_DK,
                       "Fabric", "Tail")
