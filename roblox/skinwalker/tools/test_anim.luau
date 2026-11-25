-- Runs the real character animation code on a real Roblox R6 character (built the same way R6Characters does)
-- and measures whether the limbs actually move.
local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local Poser = require(RS:WaitForChild("CharacterPoser"))
local out = {}
local function log(...)
	local t = {}
	for i = 1, select("#", ...) do
		table.insert(t, tostring(select(i, ...)))
	end
	table.insert(out, table.concat(t, " "))
end

local ok, rig = pcall(function()
	return Players:CreateHumanoidModelFromDescriptionAsync(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R6)
end)
log("R6 build ok:", ok, "type:", ok and rig.ClassName or rig)
if not ok then
	return table.concat(out, "\n")
end
log("bundled Animate script:", rig:FindFirstChild("Animate") and rig.Animate.ClassName or "none")
rig.Parent = workspace
local hum = rig:FindFirstChildOfClass("Humanoid") :: Humanoid
log("rigType:", hum.RigType)
local root = rig:FindFirstChild("HumanoidRootPart") :: BasePart
root.Anchored = true
root.CFrame = CFrame.new(0, 50, 0)

local R = Poser.attach(rig)
log("status before:", Poser.status(R))

local function limb(name)
	local p = rig:FindFirstChild(name) :: BasePart
	-- bottom of the limb, in the character's own space
	return root.CFrame:PointToObjectSpace((p.CFrame * CFrame.new(0, -1, 0)).Position)
end

-- walk at 16 studs/s: sample limb positions over a gait cycle
root.AssemblyLinearVelocity = Vector3.new(0, 0, -16)
local minZ, maxZ = { RA = math.huge, LL = math.huge }, { RA = -math.huge, LL = -math.huge }
local steps = 0
for i = 1, 90 do
	local foot = Poser.step(R, 1 / 60)
	if foot then
		steps += 1
	end
	if i > 20 then
		local ra, ll = limb("Right Arm"), limb("Left Leg")
		minZ.RA, maxZ.RA = math.min(minZ.RA, ra.Z), math.max(maxZ.RA, ra.Z)
		minZ.LL, maxZ.LL = math.min(minZ.LL, ll.Z), math.max(maxZ.LL, ll.Z)
	end
end
log(("walk: right hand swings z %.2f..%.2f, left foot swings z %.2f..%.2f, footsteps=%d"):format(minZ.RA, maxZ.RA,
	minZ.LL, maxZ.LL, steps))

-- crouch: torso lowers, feet stay near the floor
rig:SetAttribute("Crouching", true)
root.AssemblyLinearVelocity = Vector3.zero
for _ = 1, 120 do
	Poser.step(R, 1 / 60)
end
local torso = root.CFrame:PointToObjectSpace((rig:FindFirstChild("Torso") :: BasePart).Position)
local foot = limb("Left Leg")
log(("crouch: torso y=%.2f (standing 0), left foot y=%.2f (standing -3), foot z=%.2f"):format(torso.Y, foot.Y, foot.Z))
log("status after:", Poser.status(R))
rig:Destroy()
return table.concat(out, "\n")
