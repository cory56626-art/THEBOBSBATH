"""Warm evening lighting for the chess club."""
from rbx import Inst


def build_lighting():
    L = Inst("Lighting", "Lighting")
    L.set("TimeOfDay", "string", "21:00:00")
    L.set("Brightness", "float", 1)
    L.set("Ambient", "Color3", (96, 80, 66))
    L.set("OutdoorAmbient", "Color3", (70, 70, 90))
    L.set("GlobalShadows", "bool", True)
    L.set("EnvironmentDiffuseScale", "float", 0.4)
    L.set("EnvironmentSpecularScale", "float", 0.6)
    L.set("ExposureCompensation", "float", 0.25)
    L.set("Technology", "token", 4)  # Future: proper point-light shadows indoors
    L.set("FogEnd", "float", 100000)
    L.add(Inst("ColorCorrectionEffect", "Grade", Brightness=("float", 0.02), Contrast=("float", 0.08),
               Saturation=("float", 0.06), TintColor=("Color3", (255, 244, 232)), Enabled=("bool", True)))
    L.add(Inst("BloomEffect", "Bloom", Intensity=("float", 0.5), Size=("float", 24),
               Threshold=("float", 1.6), Enabled=("bool", True)))
    return L
