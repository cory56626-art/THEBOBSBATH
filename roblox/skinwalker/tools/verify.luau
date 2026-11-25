-- Runs inside a real Roblox server via Open Cloud Luau Execution to sanity-check the place.
task.wait(2)
local out = {}
local function log(...)
	table.insert(out, table.concat({ ... }, " "))
end

local model = workspace:FindFirstChild("Skinwalker")
log("skinwalker:", tostring(model ~= nil))
if model then
	local parts, motors, welds, fallen, maxErr = 0, 0, 0, 0, 0
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			parts += 1
			if d.Position.Y < -2 then
				fallen += 1
			end
		elseif d:IsA("Motor6D") or d:IsA("Weld") then
			if d:IsA("Motor6D") then motors += 1 else welds += 1 end
			if d.Part0 and d.Part1 then
				local expected = d.Part0.CFrame * d.C0 * d.C1:Inverse()
				maxErr = math.max(maxErr, (expected.Position - d.Part1.Position).Magnitude)
			end
		end
	end
	local cf, size = model:GetBoundingBox()
	log("parts:", parts, "motors:", motors, "welds:", welds, "fallen:", fallen)
	log(("joint error: %.4f"):format(maxErr))
	log(("bbox size: %.1f x %.1f x %.1f  centre y: %.1f"):format(size.X, size.Y, size.Z, cf.Position.Y))
	log("primary part:", model.PrimaryPart and model.PrimaryPart.Name or "nil", "anchored:",
		tostring(model.PrimaryPart and model.PrimaryPart.Anchored))
end
local sps = game:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
local anim = sps and sps:FindFirstChild("SkinwalkerAnimator")
log("animator:", anim and anim.ClassName or "missing")
log("lighting time:", game.Lighting.TimeOfDay,
	"atmosphere:", tostring(game.Lighting:FindFirstChildOfClass("Atmosphere") ~= nil))
local showcase = workspace:FindFirstChild("Showcase")
log("showcase children:", showcase and #showcase:GetChildren() or 0,
	"spawn:", tostring(workspace:FindFirstChildWhichIsA("SpawnLocation", true) ~= nil))
return table.concat(out, "\n")
