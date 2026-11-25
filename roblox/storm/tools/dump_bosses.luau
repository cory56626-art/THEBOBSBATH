-- Builds the bosses, new storms, a tornado and a lurker for the offline renderer.
local RS = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local V = require(RS.StormVisuals)
local list = {}
local function dump(vis)
	for _, p in vis.parts do
		local x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = p.CFrame:GetComponents()
		local mesh = p:FindFirstChildOfClass("SpecialMesh")
		local shape = if mesh then "Ellipsoid" elseif p.Shape == Enum.PartType.Ball then "Ball"
			elseif p.Shape == Enum.PartType.Cylinder then "Cylinder" else "Block"
		table.insert(list, { name = p.Name, shape = shape, cf = { x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 },
			size = { p.Size.X, p.Size.Y, p.Size.Z }, color = { math.floor(p.Color.R * 255), math.floor(p.Color.G * 255),
			math.floor(p.Color.B * 255) }, material = if p.Material == Enum.Material.Neon then "Neon" else "SmoothPlastic",
			transparency = p.Transparency, lights = {} })
	end
end
local tk = V.boss("ThunderKing", 7)
V.update(tk, CFrame.new(-40, 30, 0) * CFrame.Angles(0, math.pi, 0), 1.3)
dump(tk)
local ty = V.boss("TornadoTyrant", 7)
V.update(ty, CFrame.new(45, 7, 10), 1.3)
dump(ty)
for i, k in { "IceStorm", "Sandstorm", "Firestorm", "Supercell", "CrownedTempest", "TyrantTwister" } do
	local v = V.storm(k, "", i)
	V.update(v, CFrame.new(-30 + (i - 1) * 11, 10, -45), 1.7)
	dump(v)
end
local tor = V.tornado(18, Color3.fromRGB(120, 110, 125), 3)
V.update(tor, CFrame.new(10, 6, -25), 2)
dump(tor)
local lur = V.spirit(4, 3, true)
V.update(lur, CFrame.new(-5, 5, -40) * CFrame.Angles(0, math.pi, 0), 1)
dump(lur)
return HttpService:JSONEncode(list)
