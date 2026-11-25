-- Automated hunt test, run inside a real Roblox server via Open Cloud Luau Execution.
-- Uses a test dummy tagged "SkinwalkerPrey" in place of a player.
local CollectionService = game:GetService("CollectionService")
local ServerStorage = game:GetService("ServerStorage")
local SSS = game:GetService("ServerScriptService")

local out = {}
local function log(...)
	local parts = {}
	for i = 1, select("#", ...) do
		table.insert(parts, tostring(select(i, ...)))
	end
	table.insert(out, table.concat(parts, " "))
end

-- 1. compile checks for the client scripts
for _, name in { "SkinwalkerAnimatorCheck", "SkinwalkerClientCheck", "PlayerControlsCheck", "PlayerSystemsCheck" } do
	local m = ServerStorage:FindFirstChild(name)
	if m then
		local ok, err = pcall(require, m)
		log("compile", name, ok and "OK" or ("FAIL " .. tostring(err)))
	end
end

-- the test runner doesn't start place scripts: start the AI brain ourselves
local ai = ServerStorage:WaitForChild("SkinwalkerAIRun")
local okStart, startErr = pcall(function()
	task.spawn(require(ai))
end)
log("ai start:", okStart, startErr)
local t0 = os.clock()
while not ai:GetAttribute("Ready") and os.clock() - t0 < 15 do
	task.wait(0.2)
end
log("ai ready:", ai:GetAttribute("Ready"), "error:", ai:GetAttribute("LastError"))

-- The test runner has no physics, so stand in for it: walk every Humanoid toward its WalkToPoint,
-- and carry the creature along its leap velocity while pouncing.
local RunService = game:GetService("RunService")
RunService.Heartbeat:Connect(function(dt)
	for _, h in workspace:GetDescendants() do
		if h:IsA("Humanoid") and h.RootPart and h.Health > 0 then
			local r = h.RootPart :: BasePart
			local model = h.Parent :: Model
			if model:GetAttribute("State") == "Pounce" then
				local v = r.AssemblyLinearVelocity
				r.CFrame += Vector3.new(v.X, 0, v.Z) * dt
			elseif h.WalkSpeed > 0 then
				local wp = h.WalkToPoint
				local d = Vector3.new(wp.X - r.Position.X, 0, wp.Z - r.Position.Z)
				if d.Magnitude > 0.3 then
					local step = math.min(d.Magnitude, h.WalkSpeed * dt)
					r.CFrame = CFrame.lookAt(r.Position, r.Position + d) + d.Unit * step
					if model:GetAttribute("State") == nil then
						r.AssemblyLinearVelocity = d.Unit * h.WalkSpeed -- prey: real speed for hearing/prediction
					end
				else
					r.AssemblyLinearVelocity = Vector3.zero
				end
			end
		end
	end
end)

local sw = workspace:WaitForChild("Skinwalker") :: Model
local root = sw.PrimaryPart :: BasePart
task.wait(2)
log(("standing: root y=%.2f state=%s hunger=%s"):format(root.Position.Y, tostring(sw:GetAttribute("State")),
	tostring(sw:GetAttribute("Hunger"))))

-- timeline of brain states
local timeline = {}
local start = os.clock()
sw:GetAttributeChangedSignal("State"):Connect(function()
	table.insert(timeline, ("%.1fs %s (%s)"):format(os.clock() - start, tostring(sw:GetAttribute("State")),
		tostring(sw:GetAttribute("Note"))))
end)

-- 2. a dummy that wanders, facing away from the creature (unaware prey)
local function makeDummy(pos: Vector3): Model
	local m = Instance.new("Model")
	m.Name = "TestPrey"
	local hrp = Instance.new("Part")
	hrp.Name = "HumanoidRootPart"
	hrp.Size = Vector3.new(2, 2, 1)
	hrp.Position = pos + Vector3.new(0, 3, 0)
	hrp.Parent = m
	local head = Instance.new("Part")
	head.Name = "Head"
	head.Size = Vector3.new(1.2, 1.2, 1.2)
	head.CFrame = hrp.CFrame * CFrame.new(0, 1.6, 0)
	head.CanCollide = false
	head.Parent = m
	local w = Instance.new("WeldConstraint")
	w.Part0, w.Part1 = hrp, head
	w.Parent = hrp
	local h = Instance.new("Humanoid")
	h.RigType = Enum.HumanoidRigType.R15
	h.RequiresNeck = false
	h.HipHeight = 2
	h.Parent = m
	m.PrimaryPart = hrp
	m.Parent = workspace
	hrp:SetNetworkOwner(nil)
	CollectionService:AddTag(m, "SkinwalkerPrey")
	return m
end

-- 2a. prey standing silently right BEHIND it: it should feel it there and turn its body around
do
	local back = -Vector3.new(root.CFrame.LookVector.X, 0, root.CFrame.LookVector.Z).Unit
	local p0 = root.Position + back * 6.5
	local sneak = makeDummy(Vector3.new(p0.X, 0, p0.Z))
	local sh = sneak:FindFirstChildOfClass("Humanoid") :: Humanoid
	sh.WalkSpeed = 0
	local turned = false
	for _ = 1, 30 do
		task.wait(0.1)
		local to = sneak.PrimaryPart.Position - root.Position
		if root.CFrame.LookVector:Dot(Vector3.new(to.X, 0, to.Z).Unit) > 0.7 then
			turned = true
			break
		end
	end
	log(("behind test: sensed+turned=%s state=%s colliders=%s"):format(tostring(turned), tostring(sw:GetAttribute("State")),
		tostring(sw:FindFirstChild("BodyCollider") ~= nil and sw:FindFirstChild("HeadCollider") ~= nil)))
	sneak:Destroy()
	task.wait(3)
	ai:SetAttribute("SetHunger", 75)
	task.wait(0.3)
end

-- place prey 45 studs in front of the creature, walking slowly away
local look = root.CFrame.LookVector
local preyPos = root.Position + Vector3.new(look.X, 0, look.Z).Unit * 45
local dummy = makeDummy(Vector3.new(preyPos.X, 0, preyPos.Z))
local dh = dummy:FindFirstChildOfClass("Humanoid") :: Humanoid
dh.WalkSpeed = 4
local away = Vector3.new(look.X, 0, look.Z).Unit
dh:MoveTo(dummy.PrimaryPart.Position + away * 200)
local hits = 0
local lastHealth = dh.Health
dh.HealthChanged:Connect(function(hp)
	if hp < lastHealth then
		hits += 1
	end
	lastHealth = hp
end)
local minDist = math.huge
for _ = 1, 200 do -- up to 40 s
	task.wait(0.2)
	if dummy.PrimaryPart then
		minDist = math.min(minDist, (dummy.PrimaryPart.Position - root.Position).Magnitude)
	end
	if dh.Health <= 0 then
		break
	end
end
log(("prey test: hits=%d health=%.0f closest=%.1f hunger=%s"):format(hits, dh.Health, minDist,
	tostring(sw:GetAttribute("Hunger"))))
dummy:Destroy()
task.wait(1)

-- 3. starvation: a fast runner it cannot catch, with the creature nearly starved
for _ = 1, 40 do -- let it finish feeding first
	local st = sw:GetAttribute("State")
	if st ~= "Feed" and st ~= "Attack" and st ~= "Pounce" then
		break
	end
	task.wait(0.2)
end
ai:SetAttribute("SetHunger", 9)
task.wait(0.5)
look = root.CFrame.LookVector
local runnerStart = root.Position + Vector3.new(look.X, 0, look.Z).Unit * 25
local runner = makeDummy(Vector3.new(runnerStart.X, 0, runnerStart.Z))
local rh = runner:FindFirstChildOfClass("Humanoid") :: Humanoid
rh.WalkSpeed = 30
rh:MoveTo(runner.PrimaryPart.Position + Vector3.new(look.X, 0, look.Z).Unit * 2000)
local died = false
local diedAt = 0
local t1 = os.clock()
for _ = 1, 125 do -- up to 25 s
	task.wait(0.2)
	if sw:GetAttribute("Dead") then
		died = true
		diedAt = os.clock() - t1
		break
	end
end
log(("starvation test: died=%s after %.1fs hunger=%s runnerHealth=%.0f"):format(tostring(died), diedAt,
	tostring(sw:GetAttribute("Hunger")), rh.Health))
runner:Destroy()

log("brain error:", ai:GetAttribute("LastError"))
log("timeline:")
for _, line in timeline do
	log("  " .. line)
end
return table.concat(out, "\n")
