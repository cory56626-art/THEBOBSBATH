-- Builds one storm in every mutation (a row) and returns the parts as JSON for the offline renderer.
local RS = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local Data = require(RS.StormData)
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
local muts = { "", table.unpack(Data.MUTATION_ORDER) }
for i, m in muts do
	local v = V.storm("RainCloud", m, 4)
	V.update(v, CFrame.new((i - 1) * 11, 10, 0), 2.3)
	dump(v)
end
return HttpService:JSONEncode(list)
