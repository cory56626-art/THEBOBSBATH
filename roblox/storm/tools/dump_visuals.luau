-- Builds every storm visual (and a spirit) in a grid and returns their parts as JSON for the offline renderer.
local RS = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local Data = require(RS.StormData)
local V = require(RS.StormVisuals)
local list = {}
local function dump(vis)
	for _, p in vis.parts do
		local cf = p.CFrame
		local x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = cf:GetComponents()
		local mesh = p:FindFirstChildOfClass("SpecialMesh")
		local shape = if mesh then "Ellipsoid" elseif p.Shape == Enum.PartType.Ball then "Ball"
			elseif p.Shape == Enum.PartType.Cylinder then "Cylinder" else "Block"
		table.insert(list, { name = p.Name, shape = shape, cf = { x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 },
			size = { p.Size.X, p.Size.Y, p.Size.Z }, color = { math.floor(p.Color.R * 255), math.floor(p.Color.G * 255),
			math.floor(p.Color.B * 255) }, material = p.Material.Name, transparency = p.Transparency, lights = {} })
	end
end
for i, kind in Data.ORDER do
	local col, row = (i - 1) % 5, (i - 1) // 5
	local v = V.storm(kind, if i == 13 then "" else "", i)
	V.update(v, CFrame.new(col * 12, 10, row * 14), 1.05)
	dump(v)
end
local g = V.storm("Thunderstorm", "Golden", 3)
V.update(g, CFrame.new(3 * 12, 10, 2 * 14), 1.05)
dump(g)
for r = 1, 2 do
	local s = V.spirit(r * 3, r)
	V.update(s, CFrame.new(12 * (r - 1), 6, 3 * 14) * CFrame.Angles(0, math.pi, 0), 0.4)
	dump(s)
end
return HttpService:JSONEncode(list)
