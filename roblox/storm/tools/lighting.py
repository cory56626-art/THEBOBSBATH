"""Bright afternoon over the meadow; clients darken it as you walk toward the Eye of the Storm."""
from rbx import Inst


def build_lighting():
    L = Inst("Lighting", "Lighting")
    L.set("TimeOfDay", "string", "14:30:00")
    L.set("Brightness", "float", 2.6)
    L.set("Ambient", "Color3", (90, 90, 100))
    L.set("OutdoorAmbient", "Color3", (128, 128, 140))
    L.set("GlobalShadows", "bool", True)
    L.set("EnvironmentDiffuseScale", "float", 0.6)
    L.set("EnvironmentSpecularScale", "float", 0.6)
    L.set("ExposureCompensation", "float", 0.1)
    L.set("Technology", "token", 4)  # Future
    L.set("FogEnd", "float", 100000)
    L.add(Inst("Atmosphere", "Atmosphere", Density=("float", 0.3), Offset=("float", 0.1),
               Color=("Color3", (199, 210, 230)), Decay=("Color3", (106, 112, 125)), Glare=("float", 0.2),
               Haze=("float", 1.2)))
    L.add(Inst("ColorCorrectionEffect", "Grade", Brightness=("float", 0.0), Contrast=("float", 0.08),
               Saturation=("float", 0.12), TintColor=("Color3", (255, 255, 255)), Enabled=("bool", True)))
    L.add(Inst("BloomEffect", "Bloom", Intensity=("float", 0.6), Size=("float", 24), Threshold=("float", 1.5),
               Enabled=("bool", True)))
    L.add(Inst("SunRaysEffect", "SunRays", Intensity=("float", 0.06), Spread=("float", 0.5), Enabled=("bool", True)))
    return L
