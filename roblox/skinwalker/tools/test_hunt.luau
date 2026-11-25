-- Automated tests, run inside a real Roblox server via Open Cloud Luau Execution (on a saved test version).
-- The runner has no physics, so a stand-in walks every Humanoid toward its WalkToPoint.
local CollectionService = game:GetService("CollectionService")
local ServerStorage = game:GetService("ServerStorage")
local SSS = game:GetService("ServerScriptService")
local RunService = game:GetService("RunService")

local out = {}
local function log(...)
	local parts = {}
	for i = 1, select("#", ...) do
		table.insert(parts, tostring(select(i, ...)))
	end
	table.insert(out, table.concat(parts, " "))
end

-- 1. every script compiles
for _, m in ServerStorage:GetChildren() do
	if m:IsA("ModuleScript") and m.Name:match("Check$") then
		local ok, err = pcall(require, m)
		log("compile", m.Name, ok and "OK" or ("FAIL " .. tostring(err)))
	end
end
for _, name in { "Lockers" } do
	local ok, err = pcall(require, SSS:FindFirstChild(name))
	log("compile", name, ok and "OK" or ("FAIL " .. tostring(err)))
end
local okSfx, errSfx = pcall(require, game.ReplicatedStorage:FindFirstChild("Sfx"))
log("compile Sfx", okSfx and "OK" or ("FAIL " .. tostring(errSfx)))

-- map sanity
log(("map: hideSpots=%d navPoints=%d flicker=%d"):format(#CollectionService:GetTagged("HideSpot"),
	#CollectionService:GetTagged("NavPoint"), #CollectionService:GetTagged("FlickerLight")))

-- physics stand-in
RunService.Heartbeat:Connect(function(dt)
	for _, h in workspace:GetDescendants() do
		if h:IsA("Humanoid") and h.RootPart and h.Health > 0 and not h.RootPart.Anchored then
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
						r.AssemblyLinearVelocity = d.Unit * h.WalkSpeed
					end
				else
					r.AssemblyLinearVelocity = Vector3.zero
				end
			end
		end
	end
end)

-- start the brain
local ai = ServerStorage:WaitForChild("SkinwalkerAIRun")
local okStart, startErr = pcall(function()
	task.spawn(require(ai))
end)
log("ai start:", okStart, startErr)
local t0 = os.clock()
while not ai:GetAttribute("Ready") and os.clock() - t0 < 15 do
	task.wait(0.2)
end
local sw = workspace:WaitForChild("Skinwalker") :: Model
local root = sw.PrimaryPart :: BasePart
task.wait(1.5)
log(("ready=%s state=%s pos=(%.0f, %.1f, %.0f) colliders=%s"):format(tostring(ai:GetAttribute("Ready")),
	tostring(sw:GetAttribute("State")), root.Position.X, root.Position.Y, root.Position.Z,
	tostring(sw:FindFirstChild("BodyCollider") ~= nil)))

local timeline = {}
local start = os.clock()
sw:GetAttributeChangedSignal("State"):Connect(function()
	table.insert(timeline, ("%.1fs %s (%s)"):format(os.clock() - start, tostring(sw:GetAttribute("State")),
		tostring(sw:GetAttribute("Note"))))
end)

local function makeDummy(pos: Vector3, name: string): Model
	local m = Instance.new("Model")
	m.Name = name
	local hrp = Instance.new("Part")
	hrp.Name = "HumanoidRootPart"
	hrp.Size = Vector3.new(2, 2, 1)
	hrp.CFrame = CFrame.new(pos + Vector3.new(0, 3, 0))
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
	CollectionService:AddTag(m, "SkinwalkerPrey")
	return m
end

-- 2. hunt: unaware prey wandering in the morgue
local look = root.CFrame.LookVector
local side = root.CFrame.RightVector
local p0 = root.Position + side * 16 + look * 4
local prey = makeDummy(Vector3.new(p0.X, 0, p0.Z), "Prey")
local ph = prey:FindFirstChildOfClass("Humanoid") :: Humanoid
ph.WalkSpeed = 3
ph:MoveTo(prey.PrimaryPart.Position + side * 100)
local hits = 0
local last = ph.Health
ph.HealthChanged:Connect(function(hp)
	if hp < last then
		hits += 1
	end
	last = hp
end)
for _ = 1, 150 do
	task.wait(0.2)
	if ph.Health <= 0 then
		break
	end
end
log(("hunt: hits=%d health=%.0f hunger=%s"):format(hits, ph.Health, tostring(sw:GetAttribute("Hunger"))))
prey:Destroy()
for _ = 1, 40 do
	local st = sw:GetAttribute("State")
	if st ~= "Feed" and st ~= "Attack" and st ~= "Pounce" then
		break
	end
	task.wait(0.2)
end

-- 3. hiding: it watches you climb into a locker -> it rips it open
local Lockers = require(SSS:WaitForChild("Lockers"))
-- stand the creature 14 studs in front of a locker, facing it
local spot = nil
local rp = RaycastParams.new()
rp.FilterType = Enum.RaycastFilterType.Exclude
rp.FilterDescendantsInstances = { sw }
for _, s in CollectionService:GetTagged("HideSpot") do
	local front = s:FindFirstChild("Front") :: BasePart
	local stand = front.Position + front.CFrame.LookVector * 12
	local ground = workspace:Raycast(stand + Vector3.new(0, 4, 0), Vector3.new(0, -20, 0), rp)
	local clear = workspace:Raycast(stand + Vector3.new(0, 3, 0), front.Position - stand, rp) == nil
	if ground and clear and ground.Position.Y < 0.5 then
		spot = s
		local p = ground.Position + Vector3.new(0, 6, 0)
		sw:PivotTo(CFrame.lookAt(p, Vector3.new(front.Position.X, p.Y, front.Position.Z)))
		break
	end
end
if spot then
	local front = spot:FindFirstChild("Front") :: BasePart
	local hider = makeDummy(Vector3.new(front.Position.X, 0, front.Position.Z), "Hider")
	local hh = hider:FindFirstChildOfClass("Humanoid") :: Humanoid
	hh.WalkSpeed = 0
	ai:SetAttribute("SetHunger", 60)
	local seenFor = 0
	for _ = 1, 30 do
		task.wait(0.1)
		if sw:GetAttribute("Target") == "Hider" then
			seenFor += 1
			if seenFor > 3 then
				break
			end
		end
	end
	do
		local hp = (hider:FindFirstChild("Head") :: BasePart).Position
		local e = (sw:FindFirstChild("Head") :: BasePart).Position
		local rp2 = RaycastParams.new()
		rp2.FilterType = Enum.RaycastFilterType.Exclude
		rp2.FilterDescendantsInstances = { sw, hider }
		local hit = workspace:Raycast(e, hp - e, rp2)
		log(("locker diag: state=%s target=%s dist=%.1f facingDot=%.2f losBlockedBy=%s"):format(
			tostring(sw:GetAttribute("State")), tostring(sw:GetAttribute("Target")), (hp - e).Magnitude,
			root.CFrame.LookVector:Dot((hp - e).Unit), hit and hit.Instance:GetFullName() or "nothing"))
	end
	Lockers.hide(hider, spot)
	task.wait(0.4)
	local sawState = sw:GetAttribute("State")
	local forced, damaged = false, false
	for _ = 1, 100 do
		task.wait(0.2)
		if hider:GetAttribute("Hidden") ~= true then
			forced = true
		end
		if hh.Health < 100 then
			damaged = true
			break
		end
	end
	log(("locker: seen=%s stateAfterHiding=%s forcedOut=%s attacked=%s"):format(tostring(seenFor > 0),
		tostring(sawState), tostring(forced), tostring(damaged)))
	hider:Destroy()
else
	log("locker: no hiding spot near the creature")
end

-- 3a. leaving a locker puts you back outside, free to move
do
	local s = CollectionService:GetTagged("HideSpot")[3]
	local front = s:FindFirstChild("Front") :: BasePart
	local d = makeDummy(Vector3.new(front.Position.X, 0, front.Position.Z), "Leaver")
	local dh = d:FindFirstChildOfClass("Humanoid") :: Humanoid
	dh.WalkSpeed = 0
	Lockers.hide(d, s)
	task.wait(0.5)
	local inside = d:GetAttribute("Hidden") == true and d.PrimaryPart.Anchored
	Lockers.leave(d)
	task.wait(0.2)
	local out = d:GetAttribute("Hidden") == false and not d.PrimaryPart.Anchored
		and (d.PrimaryPart.Position - front.Position).Magnitude < 1
		and d:FindFirstChild("HidingSpot") == nil
	log(("leave locker: wasInside=%s outFree=%s"):format(tostring(inside), tostring(out)))
	d:Destroy()
end

-- 3b. vaulting: prey on the far side of a hospital bed
do
	local bed = nil
	for _, d in workspace:GetDescendants() do
		if d:IsA("BasePart") and d.Name == "Mattress" then
			bed = d
			break
		end
	end
	if bed then
		ai:SetAttribute("SetHunger", 45)
		local right = bed.CFrame.RightVector
		local a = bed.Position + right * 7
		local b2 = bed.Position - right * 8
		local p = Vector3.new(a.X, 6, a.Z)
		sw:PivotTo(CFrame.lookAt(p, Vector3.new(b2.X, 6, b2.Z)))
		local target = makeDummy(Vector3.new(b2.X, 0, b2.Z), "BedPrey")
		local th = target:FindFirstChildOfClass("Humanoid") :: Humanoid
		th.WalkSpeed = 0
		local climbed, crossed = false, false
		for _ = 1, 50 do
			task.wait(0.1)
			if sw:GetAttribute("Climbing") == true then
				climbed = true
			end
			if (root.Position - bed.Position):Dot(right) < -1 then
				crossed = true
			end
			if climbed and crossed then
				break
			end
		end
		log(("vault: vaulted=%s gotOverBed=%s state=%s"):format(tostring(climbed), tostring(crossed),
			tostring(sw:GetAttribute("State"))))
		target:Destroy()
	end
end

-- 4. starvation (after it finishes any meal)
for _, m in workspace:GetChildren() do
	if CollectionService:HasTag(m, "SkinwalkerPrey") then
		m:Destroy()
	end
end
for _ = 1, 60 do
	local st = sw:GetAttribute("State")
	if st ~= "Feed" and st ~= "Attack" and st ~= "Pounce" and st ~= "Toy" then
		break
	end
	task.wait(0.2)
end
ai:SetAttribute("SetHunger", 0.15)
local died = false
for _ = 1, 60 do
	task.wait(0.2)
	if sw:GetAttribute("Dead") then
		died = true
		break
	end
end
log("starvation: died=", died)

log("brain error:", ai:GetAttribute("LastError"))
log("timeline:")
for _, line in timeline do
	log("  " .. line)
end
return table.concat(out, "\n")
