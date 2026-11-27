"""Realistic lighting: Future technology, soft atmosphere; the server runs a day/night cycle."""
from rbx import Inst


def build_lighting():
    L = Inst("Lighting", "Lighting")
    L.set("TimeOfDay", "string", "15:00:00")
    L.set("Brightness", "float", 2.2)
    L.set("Ambient", "Color3", (70, 72, 80))
    L.set("OutdoorAmbient", "Color3", (120, 122, 130))
    L.set("GlobalShadows", "bool", True)
    L.set("EnvironmentDiffuseScale", "float", 0.8)
    L.set("EnvironmentSpecularScale", "float", 0.9)
    L.set("ExposureCompensation", "float", 0.05)
    L.set("Technology", "token", 4)  # Future
    L.set("FogEnd", "float", 100000)
    L.add(Inst("Atmosphere", "Atmosphere", Density=("float", 0.28), Offset=("float", 0.15),
               Color=("Color3", (200, 210, 225)), Decay=("Color3", (110, 116, 130)), Glare=("float", 0.3),
               Haze=("float", 1.4)))
    L.add(Inst("ColorCorrectionEffect", "Grade", Brightness=("float", 0.0), Contrast=("float", 0.1),
               Saturation=("float", -0.05), TintColor=("Color3", (255, 252, 246)), Enabled=("bool", True)))
    L.add(Inst("BloomEffect", "Bloom", Intensity=("float", 0.5), Size=("float", 24), Threshold=("float", 1.6),
               Enabled=("bool", True)))
    L.add(Inst("SunRaysEffect", "SunRays", Intensity=("float", 0.05), Spread=("float", 0.6), Enabled=("bool", True)))
    return L
