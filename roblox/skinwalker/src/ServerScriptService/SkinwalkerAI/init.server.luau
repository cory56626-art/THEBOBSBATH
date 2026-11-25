-- The skinwalker's hunting brain. It hunts like a cat:
--   PROWL   wanders, sniffing, learning where prey likes to go
--   AMBUSH  picks a hidden spot near a place prey visits (or where prey escaped it) and waits, crouched, for
--           as long as its stomach allows (hours when well fed)
--   STALK   creeps toward prey that hasn't noticed it, from behind, and FREEZES whenever you look at it
--   WIGGLE  the little butt-wiggle before a pounce
--   POUNCE  leaps at where you WILL be, not where you are
--   CHASE   runs you down, cutting corners by predicting your path
--   ATTACK  a swipe/bite: a small spray of blood
--   TOY     when it isn't hungry, it backs off after a hit and watches you... then comes again
--   SEARCH  goes where it predicts you went, sniffs around, then waits at the spot you vanished
--   FEED    crouches over a kill for a moment (no gore) and refills its hunger
--   DEAD    hunger hit zero: it starves and collapses
-- Prey = player characters, plus any model tagged "SkinwalkerPrey" (used for testing).

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("SkinwalkerConfig"))
local Lockers = require(game:GetService("ServerScriptService"):WaitForChild("Lockers"))
Lockers.init()
local Memory = require(script.Memory)
local Mover = require(script.Mover)

-------------------------------------------------------------------------------- remotes
local function remote(name: string): RemoteEvent
	local r = ReplicatedStorage:FindFirstChild(name)
	if not r then
		r = Instance.new("RemoteEvent")
		r.Name = name
		r.Parent = ReplicatedStorage
	end
	return r :: RemoteEvent
end
local LookRemote = remote("SkinwalkerLook") -- client -> server: where my camera points
local FxRemote = remote("SkinwalkerFX") -- server -> client: blood spray, hurt flash

-- where each player's camera is looking (for "it freezes when you look at it")
local looks: { [Player]: { origin: Vector3, dir: Vector3, t: number } } = {}
LookRemote.OnServerEvent:Connect(function(player, origin, dir)
	if typeof(origin) ~= "Vector3" or typeof(dir) ~= "Vector3" then
		return
	end
	if origin.Magnitude > 1e5 or dir.Magnitude < 0.5 or dir.Magnitude > 1.5 then
		return
	end
	looks[player] = { origin = origin, dir = dir.Unit, t = os.clock() }
end)
Players.PlayerRemoving:Connect(function(p)
	looks[p] = nil
end)

-------------------------------------------------------------------------------- body setup
local model = workspace:WaitForChild("Skinwalker") :: Model
local root = model:WaitForChild("HumanoidRootPart") :: BasePart
local headBone = model:WaitForChild("Head") :: BasePart
local spawnCFrame = root.CFrame

root.Size = Vector3.new(2.6, 2, 2.6)
root.Transparency = 1
root.CanCollide = true
root.Massless = false

local hum = Instance.new("Humanoid")
hum.RigType = Enum.HumanoidRigType.R15
hum.RequiresNeck = false
hum.BreakJointsOnDeath = false
hum.HipHeight = 5
hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
hum.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
hum.MaxHealth = 1000
hum.Health = 1000
hum.JumpPower = 40
hum.UseJumpPower = true
hum.Parent = model
for _, s in { Enum.HumanoidStateType.FallingDown, Enum.HumanoidStateType.Ragdoll, Enum.HumanoidStateType.Climbing,
	Enum.HumanoidStateType.Seated, Enum.HumanoidStateType.Swimming, Enum.HumanoidStateType.Dead } do
	hum:SetStateEnabled(s, false)
end
root.Anchored = false
pcall(function()
	root:SetNetworkOwner(nil)
end)

local mover = Mover.new(model, hum, root)
-- An invisible collider around the torso, so its body can't pass through walls, roofs or players.
local function collider(name: string, offset: CFrame, size: Vector3)
	local c = Instance.new("Part")
	c.Name = name
	c.Size = size
	c.Transparency = 1
	c.CanCollide = true
	c.CanQuery = false
	c.CanTouch = false
	c.Massless = true
	c.CastShadow = false
	c.CFrame = root.CFrame * offset
	local w = Instance.new("WeldConstraint")
	w.Part0, w.Part1 = root, c
	w.Parent = c
	c.Parent = model
end
collider("BodyCollider", CFrame.new(0, 2.4, -0.7), Vector3.new(3, 3.6, 3.6))
mover.colliders = { model:FindFirstChild("BodyCollider") :: BasePart }

local memory = Memory.new(Config.PERSIST_MEMORY)
task.spawn(function()
	memory:load()
end)

local rng = Random.new()

-------------------------------------------------------------------------------- prey
type Prey = { id: string, model: Model, hum: Humanoid, root: BasePart, head: BasePart, player: Player?, hidden: boolean }

local function getPrey(): { Prey }
	local list = {}
	local function add(m: Model?, player: Player?)
		if not m then
			return
		end
		local h = m:FindFirstChildOfClass("Humanoid")
		local r = m:FindFirstChild("HumanoidRootPart") :: BasePart?
		local hd = (m:FindFirstChild("Head") or r) :: BasePart?
		if h and r and hd and h.Health > 0 then
			table.insert(list, {
				id = if player then tostring(player.UserId) else m:GetFullName(),
				model = m,
				hum = h,
				root = r,
				head = hd,
				player = player,
				hidden = m:GetAttribute("Hidden") == true,
			})
		end
	end
	for _, p in Players:GetPlayers() do
		add(p.Character, p)
	end
	for _, m in CollectionService:GetTagged("SkinwalkerPrey") do
		if m:IsA("Model") and m:IsDescendantOf(workspace) then
			add(m, nil)
		end
	end
	return list
end

-------------------------------------------------------------------------------- senses
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude

local function refreshIgnore(prey: { Prey })
	local ignore: { Instance } = { model }
	for _, p in prey do
		table.insert(ignore, p.model)
	end
	rayParams.FilterDescendantsInstances = ignore
	mover:setIgnore(ignore)
end

local function eye(): Vector3
	return headBone.Position
end

local function lineClear(a: Vector3, b: Vector3): boolean
	return workspace:Raycast(a, b - a, rayParams) == nil
end

local COS_FOV = math.cos(math.rad(Config.SIGHT_FOV / 2))
local function canSee(p: Prey): boolean
	local e = eye()
	local to = p.head.Position - e
	-- a lit flashlight gives you away from much farther, and from any angle when close
	local lit = p.model:GetAttribute("Flashlight") == true
	if to.Magnitude > (if lit then Config.FLASHLIGHT_SIGHT else Config.SIGHT_RANGE) then
		return false
	end
	local fwd = root.CFrame.LookVector
	local flat = Vector3.new(to.X, 0, to.Z)
	if not (lit and to.Magnitude < 70) and flat.Magnitude > 2 and fwd:Dot(flat.Unit) < COS_FOV then
		return false
	end
	return lineClear(e, p.head.Position) or lineClear(e, p.root.Position)
end

local function noiseRadius(p: Prey): number
	local v = p.root.AssemblyLinearVelocity
	local speed = Vector3.new(v.X, 0, v.Z).Magnitude
	local r = speed * Config.HEARING_PER_SPEED
	if math.abs(v.Y) > 20 then
		r = math.max(r, 45) -- jumping / landing is loud
	end
	if p.model:GetAttribute("Crouching") == true then
		r *= Config.CROUCH_NOISE
	end
	if not lineClear(root.Position, p.root.Position) then
		r *= Config.WALL_MUFFLE -- walls muffle footsteps
	end
	return r
end

local COS_WATCH = math.cos(math.rad(Config.WATCHED_ANGLE))
local function isWatching(p: Prey): boolean
	local chest = root.Position + Vector3.new(0, 3, 0)
	if p.player then
		local l = looks[p.player]
		if not l or os.clock() - l.t > 0.8 then
			return false
		end
		local to = chest - l.origin
		if to.Magnitude > Config.WATCH_RANGE or l.dir:Dot(to.Unit) < COS_WATCH then
			return false
		end
		return lineClear(l.origin, chest) or lineClear(l.origin, eye())
	end
	-- test dummies: "watching" if facing us with a clear line
	local to = chest - p.head.Position
	return to.Magnitude < Config.WATCH_RANGE
		and p.root.CFrame.LookVector:Dot(to.Unit) > COS_WATCH
		and lineClear(p.head.Position, chest)
end

-------------------------------------------------------------------------------- prediction
-- where will prey be when we can reach it? (classic intercept, clamped)
local function intercept(from: Vector3, speed: number, pos: Vector3, vel: Vector3, maxLead: number): Vector3
	local v = Vector3.new(vel.X, 0, vel.Z)
	local d = Vector3.new(pos.X - from.X, 0, pos.Z - from.Z)
	local a = v:Dot(v) - speed * speed
	local b = 2 * d:Dot(v)
	local c = d:Dot(d)
	local t: number? = nil
	if math.abs(a) < 1e-4 then
		if b < 0 then
			t = -c / b
		end
	else
		local disc = b * b - 4 * a * c
		if disc >= 0 then
			local s = math.sqrt(disc)
			local t1, t2 = (-b - s) / (2 * a), (-b + s) / (2 * a)
			local best = math.huge
			for _, tt in { t1, t2 } do
				if tt > 0 and tt < best then
					best = tt
				end
			end
			if best < math.huge then
				t = best
			end
		end
	end
	local lead = math.clamp(t or (d.Magnitude / math.max(speed, 1)) * 0.5, 0, maxLead)
	local aim = pos + v * lead
	-- don't aim through walls
	local hit = workspace:Raycast(pos, aim - pos, rayParams)
	if hit then
		aim = hit.Position - (aim - pos).Unit * 2.5
	end
	return aim
end

-------------------------------------------------------------------------------- world helpers
local function groundAt(pos: Vector3): Vector3?
	local hit = workspace:Raycast(pos + Vector3.new(0, 7, 0), Vector3.new(0, -40, 0), rayParams)
	if not hit then
		return nil
	end
	-- must have headroom (not inside an obstacle)
	local box = OverlapParams.new()
	box.FilterType = Enum.RaycastFilterType.Exclude
	box.FilterDescendantsInstances = rayParams.FilterDescendantsInstances
	local parts = workspace:GetPartBoundsInBox(CFrame.new(hit.Position + Vector3.new(0, 5.5, 0)), Vector3.new(4, 9, 4), box)
	if #parts > 0 then
		return nil
	end
	return hit.Position
end

local function spawnPoints(): { Vector3 }
	local list = {}
	for _, d in workspace:GetDescendants() do
		if d:IsA("SpawnLocation") then
			table.insert(list, d.Position)
		end
	end
	return list
end

local function nearSpawn(pos: Vector3): boolean
	for _, s in spawnPoints() do
		if (Vector3.new(pos.X, 0, pos.Z) - Vector3.new(s.X, 0, s.Z)).Magnitude < Config.SPAWN_SAFE_RADIUS then
			return true
		end
	end
	return false
end

local function randomWanderPoint(): Vector3?
	local nav = CollectionService:GetTagged("NavPoint")
	if #nav > 0 then
		for _ = 1, 8 do
			local n = nav[rng:NextInteger(1, #nav)]
			if n:IsA("BasePart") then
				local g = groundAt(n.Position)
				if g then
					return g
				end
			end
		end
	end
	for _ = 1, 12 do
		local a = rng:NextNumber(0, math.pi * 2)
		local r = math.sqrt(rng:NextNumber()) * Config.ARENA_RADIUS
		local g = groundAt(Vector3.new(math.cos(a) * r, 0, math.sin(a) * r))
		if g then
			return g
		end
	end
	return nil
end

-- a hidden spot near `focus`, back to a wall if possible, within pouncing distance
local function findAmbushSpot(focus: Vector3): Vector3?
	local best, bestScore = nil, -math.huge
	local eyeFocus = focus + Vector3.new(0, 4, 0)
	for _ = 1, 28 do
		local a = rng:NextNumber(0, math.pi * 2)
		local r = rng:NextNumber(8, 30)
		local g = groundAt(focus + Vector3.new(math.cos(a) * r, 0, math.sin(a) * r))
		if g and not nearSpawn(g) then
			local score = 0
			local eyeSpot = g + Vector3.new(0, 3, 0)
			if not lineClear(eyeFocus, eyeSpot) then
				score += 3 -- hidden from where prey walks
			end
			local walls = 0
			for i = 0, 7 do
				local ang = i * math.pi / 4
				if workspace:Raycast(eyeSpot, Vector3.new(math.cos(ang), 0, math.sin(ang)) * 6, rayParams) then
					walls += 1
				end
			end
			score += math.min(walls, 3) * 0.8 -- cats like a wall at their back
			if r <= Config.POUNCE_RANGE then
				score += 1.5
			end
			score += rng:NextNumber(0, 0.6)
			if score > bestScore then
				best, bestScore = g, score
			end
		end
	end
	return best
end

-------------------------------------------------------------------------------- state
local State = "Prowl"
local stateStart = os.clock()
local hunger = Config.HUNGER_START
local target: Prey? = nil
local targetId: string? = nil
local lastSeenTarget = 0
local watchedFor = 0
local lastAttack = 0
local ambushSpot: Vector3? = nil
local ambushFocus: Vector3? = nil
local patienceUntil = 0
local searchPoint: Vector3? = nil
local searchStage = 0
local toyUntil = 0
local hitDuringPounce = false
local lastDist: { [string]: number } = {}
local kills = 0
local note = ""
local lockerQueue: { Model } = {}
local lockerSure = false
local lockerPrey: Prey? = nil
local sniffStart = 0

local function setState(s: string, why: string?)
	if State ~= s then
		State = s
		stateStart = os.clock()
		model:SetAttribute("State", s)
	end
	note = why or ""
end

local function timeIn(): number
	return os.clock() - stateStart
end

local function eat(amount: number)
	hunger = math.min(Config.HUNGER_MAX, hunger + amount)
end

local function patienceFor(base: number): number
	-- the fuller it is, the longer it can sit still
	return base * (0.35 + hunger / Config.HUNGER_MAX)
end

local function startAmbush(focus: Vector3, patience: number, why: string)
	local spot = findAmbushSpot(focus)
	if not spot then
		return false
	end
	ambushSpot, ambushFocus = spot, focus
	patienceUntil = os.clock() + patience
	mover:moveTo(spot, Config.STALK_SPEED + 2)
	setState("Ambush", why)
	return true
end

local function chaseSpeed(): number
	return if hunger <= Config.DESPERATE_AT then Config.DESPERATE_SPEED else Config.CHASE_SPEED
end

-------------------------------------------------------------------------------- attacks
local function bloodSpray(p: Prey)
	local dir = (p.root.Position - root.Position)
	dir = Vector3.new(dir.X, 0, dir.Z)
	dir = if dir.Magnitude > 0.1 then dir.Unit else Vector3.new(0, 0, 1)
	local at = p.root.Position + Vector3.new(0, 0.8, 0) - dir * 0.6
	FxRemote:FireAllClients("blood", at, dir)
	if p.player then
		FxRemote:FireClient(p.player, "hurt", root.Position)
	end
end

local function strike(p: Prey): boolean
	if (p.root.Position - root.Position).Magnitude > Config.ATTACK_RANGE + 1.5 then
		return false
	end
	local chest = root.Position + Vector3.new(0, 2.5, 0)
	if not (lineClear(chest, p.root.Position) or lineClear(eye(), p.head.Position)) then
		return false -- a wall is in the way
	end
	p.hum:TakeDamage(Config.ATTACK_DAMAGE)
	bloodSpray(p)
	eat(Config.HIT_FOOD)
	if p.hum.Health <= 0 then
		kills += 1
		model:SetAttribute("Kills", kills)
	end
	return true
end

local function doPounce(p: Prey)
	if math.abs(p.root.Position.Y - root.Position.Y) > 5 then
		setState("Chase", "")
		return
	end
	local aim = intercept(root.Position, Config.POUNCE_SPEED, p.root.Position, p.root.AssemblyLinearVelocity, 0.7)
	local flat = Vector3.new(aim.X - root.Position.X, 0, aim.Z - root.Position.Z)
	if flat.Magnitude < 0.5 then
		return
	end
	hunger -= Config.POUNCE_COST
	hitDuringPounce = false
	mover:stop()
	root.CFrame = CFrame.lookAt(root.Position, root.Position + flat)
	hum:ChangeState(Enum.HumanoidStateType.Jumping)
	local speed = math.min(Config.POUNCE_SPEED, flat.Magnitude / 0.55)
	-- keep air control pushing toward the aim point so the humanoid doesn't brake mid-leap
	hum.AutoRotate = true
	hum.WalkSpeed = speed
	hum:MoveTo(aim)
	root.AssemblyLinearVelocity = flat.Unit * speed + Vector3.new(0, Config.POUNCE_UP, 0)
	model:SetAttribute("PounceSeq", (model:GetAttribute("PounceSeq") or 0) + 1)
	setState("Pounce", "leaping at where you will be")
end

local function startAttack(p: Prey)
	if os.clock() - lastAttack < Config.ATTACK_COOLDOWN then
		return
	end
	lastAttack = os.clock()
	model:SetAttribute("AttackSeq", (model:GetAttribute("AttackSeq") or 0) + 1)
	setState("Attack", "")
	task.delay(0.28, function()
		if State == "Attack" and p.hum.Health > 0 then
			strike(p)
		end
	end)
end

-------------------------------------------------------------------------------- death / respawn
local function die()
	setState("Dead", "starved to death")
	mover:stop()
	model:SetAttribute("Dead", true)
	target = nil
	task.delay(Config.RESPAWN_TIME, function()
		local spot = randomWanderPoint() or spawnCFrame.Position
		model:PivotTo(CFrame.new(spot + Vector3.new(0, 6, 0)) * (spawnCFrame - spawnCFrame.Position))
		root.AssemblyLinearVelocity = Vector3.zero
		hunger = Config.HUNGER_START
		model:SetAttribute("Dead", false)
		setState("Prowl", "a new one crawls out")
	end)
end

-------------------------------------------------------------------------------- the brain
local BRAIN_DT = 0.1
local lastWander = 0
local lastDecay = os.clock()

local function pickTarget(visible: { Prey }): Prey?
	local best, bestScore = nil, -math.huge
	for _, p in visible do
		local d = (p.root.Position - root.Position).Magnitude
		local score = -d + (100 - p.hum.Health) * 0.3
		if p.id == targetId then
			score += 25 -- stick with the current prey
		end
		if score > bestScore then
			best, bestScore = p, score
		end
	end
	return best
end

local function think()
	if State == "Dead" then
		return
	end
	hunger -= (Config.HUNGER_DRAIN[State] or 0.05) * BRAIN_DT
	if hunger <= 0 then
		hunger = 0
		die()
		return
	end

	local prey = getPrey()
	refreshIgnore(prey)
	local now = os.clock()

	-- perceive
	local visible: { Prey } = {}
	local heard: Prey? = nil
	local sawHide: Prey? = nil
	for _, p in prey do
		local n = memory:note(p.id)
		if p.hidden then
			-- it watched you climb in: it knows exactly where you are
			if now - n.lastSeenTime < 0.8 and (p.root.Position - root.Position).Magnitude < 70 then
				sawHide = p
			end
		elseif canSee(p) or ((p.root.Position - root.Position).Magnitude < Config.FEEL_RANGE
			and lineClear(root.Position, p.root.Position)) then
			table.insert(visible, p)
			if not n.lastSeenPos or now - n.lastSeenTime > 3 then
				n.seen += 1
			end
			n.lastSeenPos = p.root.Position
			n.lastSeenTime = now
			n.lastVel = n.lastVel:Lerp(p.root.AssemblyLinearVelocity, 0.5)
			memory:addHeat(p.root.Position, 0.05)
		elseif (p.root.Position - root.Position).Magnitude < noiseRadius(p) then
			heard = p
			memory:addHeat(p.root.Position, 0.02)
		end
	end
	if now - lastDecay > 60 then
		memory:decay(0.97)
		lastDecay = now
	end

	local seen = pickTarget(visible)
	if seen then
		target, targetId = seen, seen.id
		lastSeenTarget = now
	elseif target and target.hum.Health <= 0 then
		-- prey went down: if it's close, feed on the kill
		if (target.root.Position - root.Position).Magnitude < 16 and State ~= "Feed" then
			setState("Feed", "feeding")
		end
		target = nil
	end
	local t = target
	local tNote = if t then memory:note(t.id) else nil
	local tVisible = seen ~= nil and t == seen
	local dist = if t then (t.root.Position - root.Position).Magnitude else math.huge
	local watched = t ~= nil and tVisible and isWatching(t)
	watchedFor = if watched then watchedFor + BRAIN_DT else math.max(0, watchedFor - BRAIN_DT * 2)
	local hungry = hunger < Config.HUNGRY_AT
	local airborne = hum:GetState() == Enum.HumanoidStateType.Freefall
		or hum:GetState() == Enum.HumanoidStateType.Jumping

	-- where to look
	local lookAt: Vector3? = nil
	if t and tVisible then
		lookAt = t.head.Position
	elseif heard then
		lookAt = heard.root.Position
	elseif ambushFocus and State == "Ambush" then
		lookAt = ambushFocus + Vector3.new(0, 4, 0)
	elseif tNote and tNote.lastSeenPos and now - tNote.lastSeenTime < 20 then
		lookAt = tNote.lastSeenPos
	end

	------------------------------------------------------------------ states
	if sawHide and State ~= "Locker" and State ~= "Pounce" and State ~= "Attack" then
		local spot = Lockers.spotOf(sawHide.model)
		if spot then
			lockerQueue, lockerSure, lockerPrey = { spot }, true, sawHide
			memory:note(sawHide.id).lastSeenTime = -math.huge
			setState("Locker", "I saw you get in there")
		end
	end

	if State == "Locker" then
		local spot = lockerQueue[1]
		local front = spot and spot:FindFirstChild("Front") :: BasePart?
		if not spot or not front then
			local focus = (tNote and tNote.lastSeenPos) or root.Position
			local w = Config.MOUSEHOLE_WAIT
			if not startAmbush(focus, patienceFor(rng:NextNumber(w[1], w[2])), "waiting for you to come out") then
				setState("Prowl", "")
			end
		elseif (front.Position - root.Position).Magnitude > 6.5 then
			mover:moveTo(front.Position, if lockerSure then chaseSpeed() else Config.PROWL_SPEED + 2)
			lookAt = front.Position + Vector3.new(0, 3, 0)
			sniffStart = now
			if mover:isStuck() and timeIn() > 6 then
				table.remove(lockerQueue, 1)
			end
		else
			mover:stop(front.Position)
			lookAt = front.Position + Vector3.new(0, 2.5, 0)
			local inside = Lockers.occupantOf(spot)
			if lockerSure then
				if inside then
					Lockers.forceOut(inside)
					for _, p in prey do
						if p.model == inside then
							p.hidden = false
							target, targetId = p, p.id
							startAttack(p)
						end
					end
				end
				table.clear(lockerQueue)
			else
				note = "sniffing..."
				if now - sniffStart > Config.SNIFF_TIME then
					local chance = Config.SNIFF_FIND + (if hungry then 0.25 else 0)
					if inside and rng:NextNumber() < chance then
						lockerSure = true -- found you
						note = "it smells you"
					else
						table.remove(lockerQueue, 1)
						sniffStart = now
					end
				end
			end
		end
	elseif State == "Pounce" then
		if t and not hitDuringPounce and (t.root.Position - (root.Position + root.CFrame.LookVector * 2)).Magnitude < 6 then
			hitDuringPounce = strike(t)
		end
		if (timeIn() > 0.35 and not airborne) or timeIn() > 1.6 then
			if hitDuringPounce and t and t.hum.Health > 0 then
				if hunger > Config.TOY_ABOVE and rng:NextNumber() < 0.4 then
					toyUntil = now + rng:NextNumber(1.5, 3)
					setState("Toy", "playing with its food")
				else
					setState("Chase", "")
				end
			elseif t and t.hum.Health <= 0 then
				setState("Feed", "")
			else
				setState(if tVisible then "Chase" else "Search", "missed")
			end
		end
	elseif State == "Attack" then
		mover:stop(t and t.root.Position)
		if timeIn() > 0.6 then
			if t and t.hum.Health <= 0 then
				setState("Feed", "")
			elseif t and hunger > Config.TOY_ABOVE and rng:NextNumber() < 0.35 then
				toyUntil = now + rng:NextNumber(1.5, 3)
				setState("Toy", "playing with its food")
			else
				setState("Chase", "")
			end
		end
	elseif State == "Feed" then
		mover:stop()
		if timeIn() > 4 then
			eat(Config.KILL_FOOD)
			target, targetId = nil, nil
			-- well fed cats find a quiet spot and wait
			local hot = memory:hotspots(3)
			if not (#hot > 0 and startAmbush(hot[rng:NextInteger(1, #hot)].pos, patienceFor(3600), "full, resting in wait")) then
				setState("Prowl", "")
			end
		end
	elseif t and tVisible and (State == "Prowl" or State == "Search" or State == "Ambush" or State == "Stalk"
		or State == "Wiggle" or State == "Chase" or State == "Toy") then
		-- prey in sight
		local unaware = not watched
		local closing = lastDist[t.id] ~= nil and dist < lastDist[t.id] - 0.05
		if State == "Toy" then
			-- back off and watch, then come again
			local away = (root.Position - t.root.Position)
			away = Vector3.new(away.X, 0, away.Z)
			if dist < 11 and away.Magnitude > 0.1 then
				mover:moveTo(root.Position + away.Unit * 6, Config.STALK_SPEED + 3, t.head.Position)
			else
				mover:stop(t.head.Position)
			end
			if now > toyUntil or dist > 35 then
				setState("Chase", "")
			end
		elseif State == "Wiggle" then
			mover:stop(t.root.Position)
			if watched and hunger > Config.TOY_ABOVE and dist > 15 then
				setState("Stalk", "spotted mid-wiggle, freezing")
			elseif timeIn() > 0.55 then
				doPounce(t)
			end
		elseif State == "Chase" then
			if dist <= Config.ATTACK_RANGE then
				startAttack(t)
			elseif dist <= Config.POUNCE_RANGE and dist > Config.POUNCE_MIN and not airborne
				and rng:NextNumber() < 0.15 and lineClear(eye(), t.head.Position) then
				doPounce(t)
			else
				local aim = intercept(root.Position, chaseSpeed(), t.root.Position, t.root.AssemblyLinearVelocity, 1.6)
				mover:moveTo(aim, chaseSpeed())
				note = if hunger <= Config.DESPERATE_AT then "STARVING - desperate" else "predicting your path"
			end
		elseif State == "Ambush" and mover:arrived(4) and unaware and (closing or dist <= Config.POUNCE_RANGE) then
			-- the cat at the mouse hole: let it come closer
			mover:stop(t.head.Position)
			if dist <= Config.POUNCE_RANGE and dist > Config.POUNCE_MIN then
				setState("Wiggle", "")
			else
				note = "waiting... it's coming closer"
			end
		elseif unaware then
			local fleeing = lastDist[t.id] ~= nil and dist > lastDist[t.id] + 0.25
			-- stalk from behind (but a hungry one won't let fleeing prey get away)
			if hungry and fleeing and dist > Config.POUNCE_RANGE then
				setState("Chase", "it's getting away")
			elseif dist <= Config.POUNCE_RANGE and dist > Config.POUNCE_MIN and lineClear(eye(), t.head.Position) then
				setState("Wiggle", "")
			elseif dist <= Config.ATTACK_RANGE then
				startAttack(t)
			else
				local behind = t.root.Position - t.root.CFrame.LookVector * 6
				local goal = if (groundAt(behind) ~= nil) then behind else t.root.Position
				mover:moveTo(goal, Config.STALK_SPEED)
				setState("Stalk", "creeping up behind you")
			end
		else
			-- it has been noticed
			if hungry or dist < Config.CHARGE_WHEN_SEEN or watchedFor > 1.5 then
				if dist <= Config.POUNCE_RANGE and dist > Config.POUNCE_MIN then
					setState("Wiggle", "")
				else
					setState("Chase", if hungry then "too hungry to wait" else "you saw it. it's coming")
				end
			else
				mover:stop(t.head.Position)
				setState("Stalk", "frozen... you're looking at it")
			end
		end
		lastDist[t.id] = dist
	elseif t and tNote and tNote.lastSeenPos and (State == "Chase" or State == "Stalk" or State == "Wiggle"
		or State == "Toy") and now - lastSeenTarget <= 1.2 then
		-- a blink out of view: keep hunting toward where they were heading
		local predicted = tNote.lastSeenPos + Vector3.new(tNote.lastVel.X, 0, tNote.lastVel.Z) * (now - tNote.lastSeenTime + 0.5)
		if State == "Chase" then
			mover:moveTo(predicted, chaseSpeed())
		elseif State == "Stalk" then
			mover:moveTo(tNote.lastSeenPos, Config.STALK_SPEED)
		elseif State == "Wiggle" then
			setState("Stalk", "lost sight mid-wiggle")
		else
			mover:stop(tNote.lastSeenPos)
		end
	elseif t and tNote and tNote.lastSeenPos and (State == "Chase" or State == "Stalk" or State == "Wiggle"
		or State == "Toy") then
		-- lost sight: go where they probably went
		local gone = now - tNote.lastSeenTime
		searchPoint = tNote.lastSeenPos + Vector3.new(tNote.lastVel.X, 0, tNote.lastVel.Z) * math.min(gone + 1, 4)
		searchPoint = groundAt(searchPoint) or tNote.lastSeenPos
		searchStage = 0
		memory:addVanish(tNote.lastSeenPos)
		tNote.escapes += 1
		setState("Search", "you went around that corner...")
	elseif State == "Search" then
		if searchPoint and searchStage == 0 then
			mover:moveTo(searchPoint, if State == "Search" then Config.PROWL_SPEED + 3 else Config.PROWL_SPEED)
			if mover:arrived(5) or mover:isStuck() or timeIn() > 20 then
				searchStage = 1
				stateStart = now
				mover:stop()
			end
		elseif searchStage == 1 then
			-- sniff around
			lookAt = root.Position + root.CFrame.LookVector * 10 + Vector3.new(math.sin(now * 1.3) * 10, -4, 0)
			if timeIn() > rng:NextNumber(4, 7) then
				local focus = (tNote and tNote.lastSeenPos) or searchPoint or root.Position
				-- check the lockers around where you vanished
				local spots = Lockers.near(focus, Config.LOCKER_SEARCH_RADIUS)
				if #spots > 0 and rng:NextNumber() < 0.85 then
					lockerQueue = {}
					for i = 1, math.min(3, #spots) do
						lockerQueue[i] = spots[i]
					end
					lockerSure = false
					sniffStart = now
					setState("Locker", "checking the hiding spots")
					return
				end
				-- the mouse-hole wait: sit where they vanished
				local w = Config.MOUSEHOLE_WAIT
				if not startAmbush(focus, patienceFor(rng:NextNumber(w[1], w[2])), "waiting where you vanished") then
					setState("Prowl", "")
				end
			end
		else
			setState("Prowl", "")
		end
	elseif State == "Ambush" then
		if ambushSpot and not mover:arrived(4) then
			mover:moveTo(ambushSpot, Config.STALK_SPEED + 2)
			if mover:isStuck() then
				ambushSpot = nil
				setState("Prowl", "")
			end
		else
			mover:stop(lookAt or ambushFocus)
			local left = math.max(0, math.floor(patienceUntil - now))
			note = ("waiting %d:%02d:%02d"):format(left // 3600, (left % 3600) // 60, left % 60)
			if heard and (heard.root.Position - root.Position).Magnitude < 60 then
				lookAt = heard.root.Position
			end
			if now > patienceUntil or hunger < Config.AMBUSH_MIN_HUNGER then
				setState("Prowl", if hunger < Config.AMBUSH_MIN_HUNGER then "too hungry to wait" else "gave up waiting")
			end
		end
	else
		-- Prowl
		if State ~= "Prowl" then
			setState("Prowl", "")
		end
		if heard then
			searchPoint = heard.root.Position
			searchStage = 0
			setState("Search", "heard footsteps")
		elseif mover:arrived(5) or mover:isStuck() or now - lastWander > 25 then
			lastWander = now
			local hot = memory:hotspots(6)
			if hunger > Config.AMBUSH_MIN_HUNGER + 8 and #hot > 0 and rng:NextNumber() < 0.45 then
				local h = hot[rng:NextInteger(1, #hot)]
				if startAmbush(h.pos, patienceFor(rng:NextNumber(600, 3 * 3600)), "lying in wait where prey goes") then
					return
				end
			end
			local g = (#hot > 0 and rng:NextNumber() < 0.5 and groundAt(hot[rng:NextInteger(1, #hot)].pos))
				or randomWanderPoint()
			if g then
				mover:moveTo(g, Config.PROWL_SPEED)
			end
			note = "prowling"
		end
	end

	-- publish to clients (animation + debug)
	model:SetAttribute("Hunger", math.floor(hunger * 10) / 10)
	model:SetAttribute("Note", note)
	model:SetAttribute("Frozen", State == "Stalk" and watched)
	model:SetAttribute("Target", if t then t.model.Name else "")
	model:SetAttribute("Climbing", mover.vaulting == true)
	if lookAt then
		model:SetAttribute("LookAt", lookAt)
	end
end

model:SetAttribute("State", State)
model:SetAttribute("Hunger", hunger)
model:SetAttribute("Dead", false)
model:SetAttribute("Kills", 0)

RunService.Heartbeat:Connect(function(dt)
	if State ~= "Dead" and State ~= "Pounce" then
		mover:step(dt)
	end
end)
mover.onLand = function()
	pcall(function()
		root:SetNetworkOwner(nil)
	end)
end

task.spawn(function()
	while true do
		local ok, err = pcall(think)
		if not ok then
			warn("[Skinwalker] brain error:", err)
			script:SetAttribute("LastError", tostring(err))
		end
		task.wait(BRAIN_DT)
	end
end)

task.spawn(function()
	while true do
		task.wait(120)
		memory:save()
	end
end)
game:BindToClose(function()
	memory:save()
end)

-- test hooks: set hunger by attribute (used by automated tests)
script:GetAttributeChangedSignal("SetHunger"):Connect(function()
	local h = tonumber(script:GetAttribute("SetHunger"))
	if h then
		hunger = h
	end
end)
script:SetAttribute("Ready", true)
_G.SkinwalkerDebug = {
	getHunger = function()
		return hunger
	end,
	setHunger = function(h: number)
		hunger = h
	end,
	getState = function()
		return State
	end,
	memory = memory,
}
