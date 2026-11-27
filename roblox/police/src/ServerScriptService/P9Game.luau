-- P9Game: the rules of Precinct 9 (server).
--   * Police and Civilian teams. Cops spawn at the station; civilians at the apartments. Civilians work jobs, buy
--     cars, or turn to crime (stealing, robbing, running people over) and get wanted stars.
--   * Cars: the driver's device runs the car's physics (CarPhysics); the server hands over ownership, tracks
--     damage, lights and sirens. AI getaway drivers run on the server.
--   * AI suspects: loiterers who bolt when a cop gets close, and stolen cars that flee along the roads. A car that
--     gets wrecked or boxed in stops, and the driver bails out on foot.
--   * Taser -> stunned -> Arrest (cuffs) -> escort or put them in your car -> drive into the booking garage.
--   * Wanted civilians get chased by police (players and AI police), tased and arrested -> jail time per star.
--   * 911 dispatch calls follow every active suspect. Pay and experience for police work; ranks.
-- More systems plug in through hooks: P9World (people, pedestrians, run-overs, guns), P9AiCops, P9Traffic,
-- P9Economy (robberies, jailbreaks, jobs, dealership, missions, departments).
-- A "player" may be a real Player or a test stand-in table (UserId, Name, Character, Get/SetAttribute).

local Players = game:GetService("Players")
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local HttpService = game:GetService("HttpService")

local Data = require(ReplicatedStorage:WaitForChild("P9Data"))
local CarPhysics = require(ReplicatedStorage:WaitForChild("CarPhysics"))
local Profile = require(script.Parent:WaitForChild("P9Profile"))

local G = {}
G.players = {} :: { [any]: any }
G.cars = {} :: { [Model]: any }
G.suspects = {} :: { [Model]: any }
G.calls = {} :: { [number]: any }
G.spots = {} :: { any }
G.rand = Random.new()
G.nextCall = 0
G.nodes, G.edges = Data.roadGraph()
G.onInit = {} :: { () -> () }
G.onStep = {} :: { (number, number) -> () }
G.onSecond = {} :: { (number) -> () }
G.onPlayerAdded = {} :: { (any) -> () }
G.onPlayerRemoving = {} :: { (any) -> () }
G.onJailed = {} :: { (any) -> () }
G.extraCops = {} :: { [any]: any } -- AI officers (P9AiCops): { pos = Vector3, lights = boolean }
G.onEscaped = {} :: { (any) -> () }
G.aiSteppers = {} :: { [string]: (any, number, number) -> () } -- AI car brains by kind (getaway is built in)
-- hooks set by the server script (no-ops in tests)
G.notify = function(_player, _text: string, _sound: string?) end
G.fx = function(_kind: string, ...) end
G.knock = function(_player, _dir: Vector3, _seconds: number?) end
G.setTeamInstance = function(_player, _team: string?) end
G.respawn = function(_player) end

local carsFolder: Folder
local npcFolder: Folder
local cells: { BasePart } = {}
local bookingZone: BasePart?
local copSpawn: BasePart?
local hideoutSpawn: BasePart?
local civSpawn: BasePart?
local policeSpots: { BasePart } = {}
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude

local function hrpOf(actor): BasePart?
	local char = actor and actor.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	return if hrp and hrp:IsA("BasePart") then hrp else nil
end
G.hrpOf = hrpOf
local function humOf(actor): Humanoid?
	local char = actor and actor.Character
	return char and char:FindFirstChildOfClass("Humanoid")
end
G.humOf = humOf
function G.nameOf(player): string
	return player.DisplayName or player.Name or "Someone"
end
function G.playerFromCharacter(model: Instance?)
	if not model then
		return nil
	end
	local real = Players:GetPlayerFromCharacter(model)
	if real then
		return real
	end
	for p in G.players do
		if p.Character == model then
			return p
		end
	end
	return nil
end

local function inZone(zone: BasePart?, pos: Vector3): boolean
	if not zone then
		return false
	end
	local rel = zone.CFrame:PointToObjectSpace(pos)
	return math.abs(rel.X) < zone.Size.X / 2 and math.abs(rel.Z) < zone.Size.Z / 2 and math.abs(rel.Y) < 8
end
G.inZone = inZone

-- every cop's position (on foot or driving), with whether their lights are on
function G.cops(): { { player: any, pos: Vector3, lights: boolean } }
	local list = {}
	for player, P in G.players do
		if P.team == "Police" then
			local hrp = hrpOf(player)
			if hrp then
				local lights = false
				local car = P.driving and G.cars[P.driving]
				if car then
					lights = car.model:GetAttribute("Lights") == true
				end
				table.insert(list, { player = player, pos = hrp.Position, lights = lights })
			end
		end
	end
	for _, c in G.extraCops do
		if c.pos then
			table.insert(list, { player = nil, pos = c.pos, lights = c.lights == true, ai = c })
		end
	end
	return list
end

local function nearestCop(pos: Vector3): (any, number)
	local best, bestD = nil, math.huge
	for _, c in G.cops() do
		local d = (c.pos - pos).Magnitude
		if d < bestD then
			best, bestD = c, d
		end
	end
	return best, bestD
end
G.nearestCop = nearestCop

-- overridden by P9Economy: daily mission progress and department pay bonuses
G.progress = function(_player, _id: string, _n: number) end
G.payMult = function(_player, _kind: string): number
	return 1
end

-- pay an officer (or anyone) for work: department bonus, a message, and promotions
function G.pay(player, kind: string, cash: number, xp: number, text: string, sound: string?)
	if not player or not G.players[player] then
		return
	end
	local m = G.payMult(player, kind)
	cash = math.floor(cash * m)
	local up = Profile.give(player, cash, xp)
	G.notify(player, ("%s  +%s%s"):format(text, Data.money(cash), if xp > 0 then ("  +%d XP"):format(xp) else ""),
		sound or "Cash")
	if up then
		G.notify(player, "PROMOTED to " .. (player:GetAttribute("Rank") or "") .. "!", "Promotion")
	end
end

---------------------------------------------------------------- dispatch calls
function G.newCall(kind: string, target, stars: number)
	G.nextCall += 1
	local call = { id = G.nextCall, kind = kind, target = target, stars = stars, created = os.clock(), open = true }
	G.calls[call.id] = call
	for player, P in G.players do
		if P.team == "Police" then
			G.notify(player, ("DISPATCH: %s reported"):format(kind), "Radio")
		end
	end
	return call
end

function G.closeCall(call, why: string?)
	if call and call.open then
		call.open = false
		G.calls[call.id] = nil
		local _ = why
	end
end

function G.publishCalls()
	local list = {}
	for _, call in G.calls do
		local pos
		local t = call.target
		if t and t.model and t.model.Parent then
			pos = t.model:GetPivot().Position
		end
		pos = pos or call.pos
		if pos then
			table.insert(list, { id = call.id, kind = call.kind, x = math.floor(pos.X), z = math.floor(pos.Z), stars = call.stars })
		end
	end
	workspace:SetAttribute("Calls", HttpService:JSONEncode(list))
end

---------------------------------------------------------------- players and teams
function G.addPlayer(player)
	local d = Profile.data[player] or Profile.load(player)
	G.players[player] = {
		team = nil,
		wanted = 0,
		jailUntil = 0,
		stunnedUntil = 0,
		lastSeen = 0,
		chased = 0,
		lastEvadePay = 0,
		lastTaser = -100,
		driving = nil,
		policeCar = nil,
		escorting = {},
		loot = 0,
		lastHitBy = nil,
	}
	player:SetAttribute("Team", "")
	player:SetAttribute("Wanted", 0)
	player:SetAttribute("JailUntil", 0)
	player:SetAttribute("Loot", 0)
	for _, f in G.onPlayerAdded do
		f(player)
	end
	return d
end

function G.setTeam(player, team: string): boolean
	local P = G.players[player]
	if not P or (team ~= "Police" and team ~= "Civilian") then
		return false
	end
	if P.jailUntil > os.clock() then
		G.notify(player, "You can't switch teams from jail!", "Error")
		return false
	end
	if P.policeCar and P.policeCar.model.Parent and team ~= "Police" then
		G.destroyCar(P.policeCar)
	end
	P.team = team
	P.wanted = 0
	P.loot = 0
	player:SetAttribute("Loot", 0)
	player:SetAttribute("Team", team)
	player:SetAttribute("Wanted", 0)
	G.setTeamInstance(player, team)
	G.respawn(player)
	return true
end

function G.spawnCFrame(player): CFrame
	local P = G.players[player]
	if P and P.jailUntil > os.clock() and P.cell then
		return P.cell.CFrame + Vector3.new(0, 3, 0)
	end
	local base = if P and P.team == "Civilian" then civSpawn elseif P and P.team == "Police" then copSpawn else copSpawn
	local cf = if base then base.CFrame else CFrame.new(Data.STATION + Vector3.new(0, 3, 0))
	return cf * CFrame.new(G.rand:NextNumber(-4, 4), 3, G.rand:NextNumber(-4, 4))
end

function G.addWanted(player, n: number, reason: string)
	local P = G.players[player]
	if not P or P.team ~= "Civilian" or P.cell then
		return
	end
	local before = P.wanted
	P.wanted = math.clamp(P.wanted + n, 0, Data.WANTED.max)
	P.lastSeen = os.clock()
	player:SetAttribute("Wanted", P.wanted)
	if P.wanted > before then
		G.notify(player, ("%s! Wanted level %d"):format(reason, P.wanted), "Wanted")
	end
end

-- jail a player criminal (seconds based on their stars) in a free cell
function G.jail(player, seconds: number)
	local P = G.players[player]
	if not P then
		return
	end
	local used = {}
	for _, other in G.players do
		if other.cell and other.jailUntil > os.clock() then
			used[other.cell] = true
		end
	end
	local cell = cells[1]
	for _, c in cells do
		if not used[c] then
			cell = c
			break
		end
	end
	P.cell = cell
	P.jailUntil = os.clock() + seconds
	P.wanted = 0
	P.stunnedUntil = 0
	if P.loot > 0 then
		G.notify(player, ("The police took your loot (%s)."):format(Data.money(P.loot)), "Error")
	end
	P.loot = 0
	player:SetAttribute("Loot", 0)
	player:SetAttribute("Wanted", 0)
	player:SetAttribute("JailUntil", workspace:GetServerTimeNow() + seconds)
	for _, f in G.onJailed do
		f(player)
	end
	if P.driving then
		G.leaveCar(player)
	end
	local char = player.Character
	if char and cell then
		char:PivotTo(cell.CFrame + Vector3.new(0, 3, 0))
	end
	G.notify(player, ("Arrested! %d seconds in jail."):format(seconds), "Cuffs")
end

function G.release(player)
	local P = G.players[player]
	if not P then
		return
	end
	P.jailUntil = 0
	P.cell = nil
	player:SetAttribute("JailUntil", 0)
	local char = player.Character
	if char then
		char:PivotTo(CFrame.new(Data.STATION + Vector3.new(G.rand:NextNumber(-6, 6), 3, 14)))
	end
	G.notify(player, "You're free. Stay out of trouble!", "Release")
end

function G.removePlayer(player)
	local P = G.players[player]
	if not P then
		return
	end
	if P.policeCar and P.policeCar.model.Parent then
		G.destroyCar(P.policeCar)
	end
	for S in P.escorting do
		G.despawnSuspect(S)
	end
	for _, f in G.onPlayerRemoving do
		f(player)
	end
	G.players[player] = nil
end

---------------------------------------------------------------- cars
function G.spawnCar(kind: string, cf: CFrame, owner)
	local folder = ServerStorage:FindFirstChild("Cars")
	local template = folder and folder:FindFirstChild(kind)
	if not template then
		return nil
	end
	local spec = Data.CARS[kind]
	local model = template:Clone() :: Model
	local yaw = CarPhysics.yawOf(cf)
	model:PivotTo(CFrame.new(cf.Position) * CFrame.Angles(0, yaw, 0) + Vector3.new(0, 0.3, 0))
	local chassis = model:FindFirstChild("Chassis") :: BasePart
	chassis.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0, 0, 100, 1)
	local att = Instance.new("Attachment")
	att.Name = "DriveAttachment"
	att.Parent = chassis
	local drive = Instance.new("LinearVelocity")
	drive.Name = "Drive"
	drive.Attachment0 = att
	drive.ForceLimitsEnabled = true
	drive.ForceLimitMode = Enum.ForceLimitMode.PerAxis
	drive.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
	drive.RelativeTo = Enum.ActuatorRelativeTo.World
	drive.VectorVelocity = Vector3.zero
	drive.Parent = chassis
	local upright = Instance.new("AlignOrientation")
	upright.Name = "Upright"
	upright.Mode = Enum.OrientationAlignmentMode.OneAttachment
	upright.Attachment0 = att
	upright.MaxTorque = math.huge
	upright.Responsiveness = 60
	upright.CFrame = CFrame.Angles(0, yaw, 0)
	upright.Parent = chassis
	model:SetAttribute("Kind", kind)
	model:SetAttribute("Police", spec.police == true)
	model:SetAttribute("Health", spec.health)
	model:SetAttribute("MaxHealth", spec.health)
	model:SetAttribute("Lights", false)
	model:SetAttribute("Siren", "")
	model:SetAttribute("Disabled", false)
	model:SetAttribute("Owner", if owner then owner.UserId else 0)
	model:SetAttribute("Driver", 0)
	CollectionService:AddTag(model, "Car")
	model.Parent = carsFolder
	drive.MaxAxesForce = Vector3.new(1, 0, 1) * math.max(chassis.AssemblyMass, 50) * 260
	pcall(function()
		chassis:SetNetworkOwner(nil)
	end)
	local rec = {
		model = model,
		chassis = chassis,
		drive = drive,
		upright = upright,
		spec = spec,
		kind = kind,
		seat = model:FindFirstChild("DriveSeat") :: VehicleSeat,
		owner = owner,
		driver = nil,
		state = CarPhysics.newState(yaw),
		ai = nil,
		health = spec.health,
		lastVel = Vector3.zero,
		idleSince = os.clock(),
		ramAt = 0,
	}
	G.cars[model] = rec
	rec.seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		G.onDriverChanged(rec)
	end)
	return rec
end

function G.destroyCar(rec)
	if not rec then
		return
	end
	G.cars[rec.model] = nil
	for player, P in G.players do
		if P.driving == rec.model then
			P.driving = nil
		end
		if P.policeCar == rec then
			P.policeCar = nil
		end
	end
	rec.model:Destroy()
end

function G.onDriverChanged(rec)
	local hum = rec.seat.Occupant
	local player = hum and G.playerFromCharacter(hum.Parent)
	for _, P in G.players do
		if P.driving == rec.model then
			P.driving = nil
		end
	end
	rec.driver = player
	rec.model:SetAttribute("Driver", if player then player.UserId else 0)
	if player then
		local P = G.players[player]
		if P then
			P.driving = rec.model
		end
		pcall(function()
			rec.chassis:SetNetworkOwner(player)
		end)
		rec.idleSince = nil
	elseif not rec.ai then
		pcall(function()
			rec.chassis:SetNetworkOwner(nil)
		end)
		-- parked where the driver left it: hold that heading (not the old one)
		rec.state = CarPhysics.newState(CarPhysics.yawOf(rec.chassis.CFrame))
		rec.upright.CFrame = CFrame.Angles(0, rec.state.yaw, 0)
		rec.drive.VectorVelocity = Vector3.zero
		rec.idleSince = os.clock()
	end
end

-- a player wants in: "drive" (driver's seat, which steals a civilian car for criminals) or "ride"
function G.enterCar(player, model: Instance, how: string): boolean
	local rec = G.cars[model :: Model]
	local P = G.players[player]
	local hrp = hrpOf(player)
	local hum = humOf(player)
	if not rec or not P or not hrp or not hum or hum.Health <= 0 or P.jailUntil > os.clock() then
		return false
	end
	if (hrp.Position - rec.chassis.Position).Magnitude > 16 then
		return false
	end
	if how == "drive" then
		if rec.model:GetAttribute("Disabled") then
			G.notify(player, "This car is wrecked.", "Error")
			return false
		end
		if rec.spec.police and P.team ~= "Police" then
			G.notify(player, "Only police can drive police cars.", "Error")
			return false
		end
		if rec.seat.Occupant or rec.ai then
			return false
		end
		if not rec.spec.police and P.team == "Civilian" and rec.owner ~= player then
			rec.owner = player
			rec.model:SetAttribute("Owner", player.UserId)
			G.addWanted(player, Data.WANTED.stealCar, "Car theft")
		end
		rec.seat:Sit(hum)
		return true
	elseif how == "ride" then
		for _, s in rec.model:GetChildren() do
			if s:IsA("Seat") and not s.Occupant then
				s:Sit(hum)
				return true
			end
		end
	end
	return false
end

function G.leaveCar(player)
	local hum = humOf(player)
	if hum and hum.SeatPart then
		local w = hum.SeatPart:FindFirstChild("SeatWeld")
		if w then
			w:Destroy()
		end
		hum.Sit = false
	end
end

-- lights and siren (police cars: siren cycles off -> wail -> yelp), and the horn (any car)
function G.toggleCar(player, what: string)
	local P = G.players[player]
	local rec = P and P.driving and G.cars[P.driving]
	if not rec then
		return
	end
	local model = rec.model
	if what == "Horn" then
		if os.clock() - (rec.hornAt or -10) > 0.6 then
			rec.hornAt = os.clock()
			G.fx("horn", rec.chassis.Position)
		end
		return
	end
	if not rec.spec.police then
		return
	end
	if what == "Lights" then
		local on = not model:GetAttribute("Lights")
		model:SetAttribute("Lights", on)
		if on then
			G.fx("chirp", rec.chassis.Position)
		else
			model:SetAttribute("Siren", "")
		end
	elseif what == "Siren" then
		local cur = model:GetAttribute("Siren") or ""
		local nxt = if cur == "" then "Wail" elseif cur == "Wail" then "Yelp" else ""
		model:SetAttribute("Siren", nxt)
		if nxt ~= "" then
			model:SetAttribute("Lights", true)
		end
	end
end

-- police: a cruiser (or SUV from Corporal) at a free spot in the station lot
function G.spawnPoliceCar(player, kind: string)
	local P = G.players[player]
	local d = Profile.data[player]
	local spec = Data.CARS[kind]
	if not P or not d or P.team ~= "Police" or not spec or not spec.police then
		return nil
	end
	local rankIdx = Data.rankOf(d.xp)
	if spec.rank and rankIdx < spec.rank then
		G.notify(player, ("The %s unlocks at %s."):format(spec.name, Data.RANKS[spec.rank].name), "Error")
		return nil
	end
	if P.policeCar and P.policeCar.model.Parent then
		if P.policeCar.seat.Occupant and P.driving ~= P.policeCar.model then
			G.notify(player, "Someone is driving your car.", "Error")
			return nil
		end
		G.destroyCar(P.policeCar)
	end
	local spot
	for _, s in policeSpots do
		local free = true
		for _, rec in G.cars do
			if (rec.chassis.Position - s.Position).Magnitude < 8 then
				free = false
				break
			end
		end
		if free then
			spot = s
			break
		end
	end
	if not spot then
		G.notify(player, "The lot is full!", "Error")
		return nil
	end
	local rec = G.spawnCar(kind, spot.CFrame, player)
	P.policeCar = rec
	G.notify(player, ("Your %s is ready in the station lot."):format(spec.name), "Radio")
	return rec
end

function G.damageCar(rec, amount: number)
	if rec.health <= 0 then
		return
	end
	rec.health = math.max(0, rec.health - amount)
	rec.model:SetAttribute("Health", rec.health)
	if rec.health <= 0 then
		rec.model:SetAttribute("Disabled", true)
		if rec.driver then
			G.notify(rec.driver, "Your car is wrecked! Get out and run!", "Error")
		end
		local smoke = Instance.new("Smoke")
		smoke.Name = "WreckSmoke"
		smoke.Color = Color3.fromRGB(60, 60, 64)
		smoke.Size = 6
		smoke.RiseVelocity = 8
		smoke.Opacity = 0.35
		smoke.Parent = rec.chassis
		G.fx("wreck", rec.chassis.Position)
	end
end

---------------------------------------------------------------- AI suspects (people)
local SKIN = { Color3.fromRGB(255, 220, 190), Color3.fromRGB(230, 185, 150), Color3.fromRGB(190, 140, 100),
	Color3.fromRGB(140, 95, 65), Color3.fromRGB(100, 70, 50) }
local SHIRT = { Color3.fromRGB(30, 30, 34), Color3.fromRGB(150, 30, 30), Color3.fromRGB(40, 70, 130),
	Color3.fromRGB(90, 90, 96), Color3.fromRGB(60, 100, 60), Color3.fromRGB(200, 170, 60) }
local PANTS = { Color3.fromRGB(30, 34, 50), Color3.fromRGB(40, 40, 44), Color3.fromRGB(80, 70, 60) }
local DEFAULT_ANIMS = {
	idle = "rbxassetid://507766388",
	walk = "rbxassetid://913402848",
	run = "rbxassetid://913376220",
	fall = "rbxassetid://507767968",
	jump = "rbxassetid://507765000",
	sit = "rbxassetid://2506281703",
}

local function animateNpc(model: Model, hum: Humanoid)
	local ids = table.clone(DEFAULT_ANIMS)
	local animate = model:FindFirstChild("Animate")
	if animate then
		local function grab(folder: string, key: string)
			local f = animate:FindFirstChild(folder)
			local a = f and f:FindFirstChildOfClass("Animation")
			if a and a.AnimationId ~= "" then
				ids[key] = a.AnimationId
			end
		end
		grab("idle", "idle")
		grab("walk", "walk")
		grab("run", "run")
		grab("fall", "fall")
		grab("jump", "jump")
		grab("sit", "sit")
		animate:Destroy()
	end
	local animator = hum:FindFirstChildOfClass("Animator") or Instance.new("Animator", hum)
	local tracks = {}
	for key, id in ids do
		local a = Instance.new("Animation")
		a.AnimationId = id
		local ok, track = pcall(function()
			return animator:LoadAnimation(a)
		end)
		if ok then
			track.Looped = key ~= "jump"
			tracks[key] = track
		end
	end
	local current = nil
	local function play(key: string)
		if current == key then
			return
		end
		if current and tracks[current] then
			tracks[current]:Stop(0.2)
		end
		current = key
		if tracks[key] then
			tracks[key]:Play(0.2)
		end
	end
	play("idle")
	hum.Running:Connect(function(speed)
		if hum.Sit then
			return
		end
		play(if speed > 13 then "run" elseif speed > 0.8 then "walk" else "idle")
	end)
	hum.Seated:Connect(function(on)
		if on then
			play("sit")
		else
			play("idle")
		end
	end)
	hum.FreeFalling:Connect(function(on)
		if on then
			play("fall")
		end
	end)
end

function G.makeNpc(pos: Vector3, name: string?, look: { shirt: Color3?, pants: Color3? }?): (Model?, Humanoid?)
	local desc = Instance.new("HumanoidDescription")
	local skin = SKIN[G.rand:NextInteger(1, #SKIN)]
	local shirt = (look and look.shirt) or SHIRT[G.rand:NextInteger(1, #SHIRT)]
	local pants = (look and look.pants) or PANTS[G.rand:NextInteger(1, #PANTS)]
	desc.HeadColor = skin
	desc.LeftArmColor = skin
	desc.RightArmColor = skin
	desc.TorsoColor = shirt
	desc.LeftLegColor = pants
	desc.RightLegColor = pants
	local ok, model = pcall(function()
		return Players:CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15)
	end)
	if not ok or not model then
		return nil, nil
	end
	model.Name = name or "Suspect"
	local hum = model:FindFirstChildOfClass("Humanoid") :: Humanoid
	hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	hum.WalkSpeed = 8
	model:PivotTo(CFrame.new(pos + Vector3.new(0, 3, 0)))
	model.Parent = npcFolder
	animateNpc(model, hum)
	local hrp = model:FindFirstChild("HumanoidRootPart") :: BasePart
	pcall(function()
		hrp:SetNetworkOwner(nil)
	end)
	return model, hum
end

-- a random spot on a sidewalk, away from every cop
function G.sidewalkSpot(minCopDistance: number): Vector3?
	for _ = 1, 20 do
		local bx = ({ -270, -90, 90, 270 })[G.rand:NextInteger(1, 4)]
		local bz = ({ -270, -90, 90, 270 })[G.rand:NextInteger(1, 4)]
		local side = G.rand:NextInteger(1, 4)
		local t = G.rand:NextNumber(-65, 65)
		local edge = 71
		local pos = if side == 1 then Vector3.new(bx + t, 0, bz - edge)
			elseif side == 2 then Vector3.new(bx + t, 0, bz + edge)
			elseif side == 3 then Vector3.new(bx - edge, 0, bz + t)
			else Vector3.new(bx + edge, 0, bz + t)
		local _, d = nearestCop(pos)
		if d >= minCopDistance then
			return pos
		end
	end
	return nil
end

function G.spawnFootSuspect(pos: Vector3?, stars: number?, call): any
	local at = pos or G.sidewalkSpot(140)
	if not at then
		return nil
	end
	local model, hum = G.makeNpc(at :: Vector3)
	if not model or not hum then
		return nil
	end
	local S = {
		model = model,
		hum = hum,
		hrp = model:FindFirstChild("HumanoidRootPart"),
		state = "loiter",
		stars = stars or 1,
		home = at,
		nextMove = 0,
		stunUntil = 0,
		by = nil,
		lastCopSeen = os.clock(),
		call = call,
	}
	model:SetAttribute("Suspect", true)
	model:SetAttribute("State", "loiter")
	model:SetAttribute("Stars", S.stars)
	CollectionService:AddTag(model, "Suspect")
	G.suspects[model] = S
	if call then
		call.target = S
		call.kind = "Suspect fleeing on foot"
	else
		S.call = G.newCall("Suspicious person", S, S.stars)
	end
	return S
end

function G.despawnSuspect(S)
	G.suspects[S.model] = nil
	G.closeCall(S.call)
	if S.by then
		local P = G.players[S.by]
		if P then
			P.escorting[S] = nil
		end
	end
	if S.model.Parent then
		S.model:Destroy()
	end
end

local function setState(S, state: string)
	S.state = state
	S.model:SetAttribute("State", state)
end
G.setSuspectState = setState

-- run away from the nearest cop, steering around walls
local function fleeStep(S, t: number)
	local pos = S.hrp.Position
	local cop, d = nearestCop(pos)
	if not cop then
		return
	end
	if d < 260 then
		S.lastCopSeen = t
	end
	if t < S.nextMove then
		return
	end
	S.nextMove = t + 0.4
	local away = Vector3.new(pos.X - cop.pos.X, 0, pos.Z - cop.pos.Z)
	away = if away.Magnitude > 0.1 then away.Unit else Vector3.zAxis
	local best, bestScore = away, -math.huge
	for _, ang in { 0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5 } do
		local dir = (CFrame.Angles(0, ang, 0) * CFrame.new(away)).Position
		local hit = workspace:Raycast(pos, dir * 14, rayParams)
		local clear = if hit then hit.Distance else 14
		local score = clear * 2 - math.abs(ang) * 4 + G.rand:NextNumber(0, 3)
		if score > bestScore then
			best, bestScore = dir, score
		end
	end
	S.hum:MoveTo(pos + best * 18)
end

function G.stepSuspect(S, t: number)
	if not S.model.Parent or not S.hrp or S.hum.Health <= 0 then
		G.despawnSuspect(S)
		return
	end
	local pos = S.hrp.Position
	if S.armed and (S.state == "flee" or S.state == "robbing") and G.robberShoot then
		G.robberShoot(S, t)
	end
	if S.state == "robbing" then
		local cop, d = nearestCop(pos)
		if t >= (S.robEnd or 0) or (cop and d < 30) then
			setState(S, "flee")
			S.hum.WalkSpeed = Data.SUSPECTS.footSpeed
			S.lastCopSeen = t
			if S.call then
				S.call.kind = "Armed robber fleeing"
			end
		end
		return
	end
	if S.state == "loiter" then
		local cop, d = nearestCop(pos)
		if cop and d < Data.SUSPECTS.spotRange then
			setState(S, "flee")
			S.hum.WalkSpeed = Data.SUSPECTS.footSpeed
			S.stars = math.max(S.stars, 2)
			S.model:SetAttribute("Stars", S.stars)
			if S.call then
				S.call.kind = "Suspect fleeing on foot"
				S.call.stars = S.stars
			end
			G.notify(cop.player, "The suspect is running!", "Radio")
		elseif t >= S.nextMove then
			S.nextMove = t + G.rand:NextNumber(2.5, 5)
			S.hum.WalkSpeed = 8
			S.hum:MoveTo(S.home + Vector3.new(G.rand:NextNumber(-20, 20), 0, G.rand:NextNumber(-20, 20)))
		end
	elseif S.state == "flee" then
		fleeStep(S, t)
		if t - S.lastCopSeen > 40 then
			-- got away
			G.despawnSuspect(S)
		end
	elseif S.state == "stunned" then
		if S.down then
			if t - S.stunUntil > 90 then
				G.despawnSuspect(S)
			end
		elseif t >= S.stunUntil then
			S.hum.PlatformStand = false
			setState(S, "flee")
			S.hum.WalkSpeed = Data.SUSPECTS.footSpeed
		end
	elseif S.state == "cuffed" then
		local cop = S.by
		local copHrp = cop and hrpOf(cop)
		local P = cop and G.players[cop]
		if not copHrp or not P then
			G.despawnSuspect(S)
			return
		end
		-- the officer got in a car: the suspect goes in the back
		local car = P.driving and G.cars[P.driving]
		if car then
			for _, s in car.model:GetChildren() do
				if s:IsA("Seat") and s.Name == "RearSeat" and not s.Occupant then
					S.hum.PlatformStand = false
					S.model:PivotTo(s.CFrame + Vector3.new(0, 2, 0))
					s:Sit(S.hum)
					S.car = car
					setState(S, "transport")
					G.notify(cop, "Suspect secured in your car. Drive into the BOOKING garage at the station.", "Radio")
					break
				end
			end
		else
			local back = copHrp.Position - copHrp.CFrame.LookVector * 4
			if (back - pos).Magnitude > 60 then
				S.model:PivotTo(CFrame.new(back + Vector3.new(0, 2, 0)))
			elseif (back - pos).Magnitude > 2 then
				S.hum.WalkSpeed = 22
				S.hum:MoveTo(back)
			end
		end
		if inZone(bookingZone, pos) then
			G.book(S)
		end
	elseif S.state == "transport" then
		local car = S.car
		if not car or not car.model.Parent or not S.hum.SeatPart then
			setState(S, "cuffed")
			S.car = nil
		elseif inZone(bookingZone, car.chassis.Position) or inZone(bookingZone, pos) then
			G.book(S)
		end
	end
end

-- book a suspect at the station: the arresting officer gets paid
function G.book(S)
	local cop = S.by
	G.fx("booked", S.hrp.Position)
	G.despawnSuspect(S)
	if cop and G.players[cop] then
		local pay = Data.PAY.booking
		local d = Profile.data[cop]
		if d then
			d.bookings += 1
		end
		G.pay(cop, "booking", pay.cash, pay.xp, "Suspect booked!")
		G.progress(cop, "book", 1)
	end
end

---------------------------------------------------------------- AI getaway cars
local function nodeKeyNear(pos: Vector3): string
	local best, bestD = nil, math.huge
	for k, p in G.nodes do
		local d = (p - pos).Magnitude
		if d < bestD then
			best, bestD = k, d
		end
	end
	return best :: string
end

function G.spawnGetaway(): any
	-- a starting road node far from every cop
	local keys = {}
	for k in G.nodes do
		table.insert(keys, k)
	end
	local start
	for _ = 1, 20 do
		local k = keys[G.rand:NextInteger(1, #keys)]
		local _, d = nearestCop(G.nodes[k])
		if d > 200 then
			start = k
			break
		end
	end
	if not start then
		return nil
	end
	local nbrs = G.edges[start]
	local nextKey = nbrs[G.rand:NextInteger(1, #nbrs)]
	local a, b = G.nodes[start], G.nodes[nextKey]
	local dir = (b - a).Unit
	local kinds = { "Sedan", "Sports", "Hatchback", "Pickup" }
	local cf = CFrame.lookAt(a + dir * 20 + Vector3.new(0, 1, 0), a + dir * 21 + Vector3.new(0, 1, 0))
	local rec = G.spawnCar(kinds[G.rand:NextInteger(1, #kinds)], cf, nil)
	if not rec then
		return nil
	end
	local npc, hum = G.makeNpc(cf.Position + Vector3.new(0, 4, 0), "Getaway Driver")
	if not npc or not hum then
		G.destroyCar(rec)
		return nil
	end
	rec.seat:Sit(hum)
	rec.ai = { kind = "getaway", mode = "cruise", from = start, to = nextKey, npc = npc, hum = hum, stuckSince = nil }
	rec.ai.after = G.aiChoose(rec.ai, nextKey, start, nil)
	rec.model:SetAttribute("AI", true)
	rec.model:SetAttribute("Stars", 2)
	rec.call = G.newCall("Stolen vehicle", { model = rec.model }, 2)
	return rec
end

-- the AI driver gives up the car and runs
function G.bail(rec)
	local ai = rec.ai
	if not ai then
		return
	end
	rec.ai = nil
	rec.model:SetAttribute("AI", false)
	local w = rec.seat:FindFirstChild("SeatWeld")
	if w then
		w:Destroy()
	end
	if ai.hum then
		ai.hum.Sit = false
	end
	local side = rec.chassis.CFrame * CFrame.new(-7, 2, 0)
	if ai.npc and ai.npc.Parent then
		ai.npc:Destroy()
	end
	rec.drive.VectorVelocity = Vector3.zero
	rec.idleSince = os.clock()
	local S = G.spawnFootSuspect(side.Position, 3, rec.call)
	if S then
		setState(S, "flee")
		S.hum.WalkSpeed = Data.SUSPECTS.footSpeed
		S.call.stars = 3
		S.call.kind = "Driver fled on foot"
	end
	rec.call = nil
	G.fx("bail", side.Position)
end

-- the road an AI driver takes at the junction it arrives at (fleeing drivers pick the road away from the cop)
-- shortest road route: the first road to take from `at` toward `goal`
function G.pathNext(at: string, goal: string): string?
	if at == goal then
		return nil
	end
	local dist, first = { [at] = 0 }, {}
	local open = { at }
	while #open > 0 do
		local bi = 1
		for i = 2, #open do
			if dist[open[i]] < dist[open[bi]] then
				bi = i
			end
		end
		local k = table.remove(open, bi)
		if k == goal then
			return first[k]
		end
		for _, n in G.edges[k] do
			local d = dist[k] + (G.nodes[n] - G.nodes[k]).Magnitude
			if dist[n] == nil or d < dist[n] then
				if dist[n] == nil then
					table.insert(open, n)
				end
				dist[n] = d
				first[n] = if k == at then n else first[k]
			end
		end
	end
	return nil
end

function G.nearestNode(pos: Vector3): string
	local best, bestD = nil, math.huge
	for k, p in G.nodes do
		local d = (Vector3.new(p.X - pos.X, 0, p.Z - pos.Z)).Magnitude
		if d < bestD then
			best, bestD = k, d
		end
	end
	return best :: string
end

-- the closest point on a road (curb lane) to pos, as a CFrame pointing along the road
function G.roadSpot(pos: Vector3, lane: number?): CFrame
	local best, bestD, bestDir = pos, math.huge, Vector3.xAxis
	for k, list in G.edges do
		for _, k2 in list do
			local a, b = G.nodes[k], G.nodes[k2]
			local ab = b - a
			local tt = math.clamp((Vector3.new(pos.X, 0, pos.Z) - a):Dot(ab) / ab:Dot(ab), 0.08, 0.92)
			local p = a + ab * tt
			local d = (Vector3.new(pos.X, 0, pos.Z) - p).Magnitude
			if d < bestD then
				best, bestD, bestDir = p, d, ab.Unit
			end
		end
	end
	local right = Vector3.new(-bestDir.Z, 0, bestDir.X)
	local at = best + right * (lane or 9) + Vector3.new(0, 1, 0)
	return CFrame.lookAt(at, at + bestDir)
end

function G.aiChoose(ai, at: string, prev: string, cop): string
	if ai.goal then
		local nxt = G.pathNext(at, ai.goal)
		if nxt then
			return nxt
		end
	end
	local options = {}
	for _, k in G.edges[at] do
		if k ~= prev or #G.edges[at] == 1 then
			table.insert(options, k)
		end
	end
	local pick = options[G.rand:NextInteger(1, #options)]
	if ai.mode == "flee" and cop then
		local bestScore = -math.huge
		for _, k in options do
			local score = (G.nodes[k] - cop.pos).Magnitude + G.rand:NextNumber(0, 60)
			if score > bestScore then
				pick, bestScore = k, score
			end
		end
	end
	return pick
end

local function flatUnit(a: Vector3, b: Vector3): Vector3
	local d = Vector3.new(b.X - a.X, 0, b.Z - a.Z)
	return if d.Magnitude > 0.01 then d.Unit else Vector3.zAxis
end

-- where an AI driver steers, and how fast it may go: keep to the right-hand lane, brake before a corner so it can
-- make the turn, then turn into the right lane of the next road
function G.aiAim(ai, pos: Vector3, cop): (Vector3, number)
	local LANE = 7
	local to = G.nodes[ai.to]
	local along = (pos - to):Dot(flatUnit(G.nodes[ai.from], to))
	if along > -(ai.reach or 16) then
		ai.from, ai.to = ai.to, ai.after
		ai.after = G.aiChoose(ai, ai.to, ai.from, cop)
		to = G.nodes[ai.to]
	end
	local l1 = flatUnit(G.nodes[ai.from], to)
	local l2 = flatUnit(to, G.nodes[ai.after])
	local turn = math.acos(math.clamp(l1:Dot(l2), -1, 1))
	local d = Vector3.new(to.X - pos.X, 0, to.Z - pos.Z).Magnitude
	local corner = if turn < 0.2 then 200 elseif turn < 2 then 36 else 14
	local cap = math.sqrt(corner * corner + 2 * 65 * 0.55 * math.max(0, d - 12))
	ai.reach = if turn < 0.2 then 16 else 6
	local r1 = Vector3.new(-l1.Z, 0, l1.X)
	local aim = to + r1 * LANE
	if turn >= 0.2 and d < 26 then
		local r2 = Vector3.new(-l2.Z, 0, l2.X)
		aim = to + r2 * LANE + l2 * 14
	end
	return aim, cap
end

function G.stepAiCar(rec, t: number, dt: number)
	local ai = rec.ai
	local pos = rec.chassis.Position
	local cop, d = nearestCop(pos)
	-- spotted: a police car with its lights on nearby, or a cop right next to the car
	if ai.mode == "cruise" and cop and ((cop.lights and d < Data.SUSPECTS.carSpotRange) or d < 35) then
		ai.mode = "flee"
		rec.model:SetAttribute("Fleeing", true)
		if rec.call then
			rec.call.kind = "Vehicle pursuit"
			rec.call.stars = 3
		end
		G.notify(cop.player, "The stolen car is fleeing! Pursue it!", "Radio")
	end
	if ai.mode == "flee" and cop and d > 400 then
		G.closeCall(rec.call)
		rec.call = nil
		G.destroyCar(rec)
		return
	end
	local aim, cap = G.aiAim(ai, pos, cop)
	local want = math.min(if ai.mode == "flee" then rec.spec.maxSpeed * 0.9 else 42, cap)
	if rec.model:GetAttribute("Disabled") then
		want = 0
	end
	local throttle, steer = CarPhysics.autopilot(rec.state, pos, aim, want)
	local vel = CarPhysics.step(rec.state, rec.spec, throttle, steer, dt, rec.chassis.AssemblyLinearVelocity)
	rec.drive.VectorVelocity = vel
	rec.upright.CFrame = CFrame.Angles(0, rec.state.yaw, 0)
	-- wrecked, or boxed in while fleeing: the driver bails out
	local speedNow = rec.chassis.AssemblyLinearVelocity.Magnitude
	if ai.mode == "flee" and speedNow < 4 then
		ai.stuckSince = ai.stuckSince or t
	else
		ai.stuckSince = nil
	end
	if rec.model:GetAttribute("Disabled") or (ai.stuckSince and t - ai.stuckSince > Data.SUSPECTS.disabledAfter) then
		if cop and d < 120 then
			local pay = Data.PAY.disable
			G.pay(cop.player, "disable", pay.cash, pay.xp, "Vehicle stopped!")
			G.progress(cop.player, "disable", 1)
		end
		G.bail(rec)
	end
end

---------------------------------------------------------------- taser and arrests
-- the taser auto-aims at the suspect nearest to where you're looking
function G.taser(player, aim: Vector3): boolean
	local P = G.players[player]
	local hrp = hrpOf(player)
	if not P or P.team ~= "Police" or not hrp or typeof(aim) ~= "Vector3" or aim.Magnitude < 0.01 then
		return false
	end
	if P.driving then
		return false
	end
	local t = os.clock()
	if t - P.lastTaser < Data.TASER.cooldown * 0.9 then
		return false
	end
	P.lastTaser = t
	aim = Vector3.new(aim.X, 0, aim.Z)
	aim = if aim.Magnitude > 0.01 then aim.Unit else hrp.CFrame.LookVector
	local origin = hrp.Position
	local best, bestScore, bestPos = nil, -math.huge, nil
	local function consider(target, pos: Vector3)
		local to = Vector3.new(pos.X - origin.X, 0, pos.Z - origin.Z)
		local dist = to.Magnitude
		if dist > Data.TASER.range or dist < 0.1 then
			return
		end
		local dot = to.Unit:Dot(aim)
		if dot < Data.TASER.cone then
			return
		end
		local score = dot * 2 - dist / Data.TASER.range
		if score > bestScore then
			best, bestScore, bestPos = target, score, pos
		end
	end
	for _, S in G.suspects do
		if S.state == "loiter" or S.state == "flee" or S.state == "stunned" or S.state == "robbing" then
			consider(S, S.hrp.Position)
		end
	end
	for other, OP in G.players do
		if OP.team == "Civilian" and OP.wanted > 0 and not OP.driving and not OP.cell then
			local ohrp = hrpOf(other)
			if ohrp then
				consider(other, ohrp.Position)
			end
		end
	end
	if not best then
		G.fx("taser", origin, origin + aim * 25, false)
		return true
	end
	G.fx("taser", origin, bestPos, true)
	if G.suspects[best.model or false] == best then
		local S = best
		setState(S, "stunned")
		S.stunUntil = t + Data.TASER.stun
		S.hum.PlatformStand = true
		S.hum:MoveTo(S.hrp.Position)
		S.stars = math.max(S.stars, 2)
		S.model:SetAttribute("Stars", S.stars)
	else
		local OP = G.players[best]
		OP.stunnedUntil = t + Data.TASER.stun
		best:SetAttribute("StunnedUntil", workspace:GetServerTimeNow() + Data.TASER.stun)
		G.knock(best, (bestPos - origin), Data.TASER.stun)
	end
	return true
end

-- cuff a stunned suspect (an AI suspect, or a wanted player)
-- send a wanted civilian to jail; `by` (an officer player, or nil for AI police) gets the arrest pay
function G.arrestPlayer(criminal, by): boolean
	local CP = G.players[criminal]
	if not CP or CP.wanted <= 0 or CP.cell then
		return false
	end
	local stars = CP.wanted
	local chrp = hrpOf(criminal)
	G.jail(criminal, math.max(15, stars * Data.WANTED.jailPerStar))
	if by and G.players[by] then
		local pay = Data.PAY.arrestPlayer
		local d = Profile.data[by]
		if d then
			d.arrests += 1
		end
		G.pay(by, "arrest", pay.cash * stars, pay.xp * stars, ("You arrested %s (%d stars)!"):format(G.nameOf(criminal), stars),
			"Cuffs")
		G.progress(by, "cuff", 1)
	end
	if chrp then
		G.fx("cuffed", chrp.Position)
	end
	return true
end

-- cuff a stunned suspect (an AI suspect, or a wanted player)
function G.arrest(player, target: Instance): boolean
	local P = G.players[player]
	local hrp = hrpOf(player)
	if not P or P.team ~= "Police" or not hrp or typeof(target) ~= "Instance" then
		return false
	end
	local S = G.suspects[target :: Model]
	if S then
		if S.state ~= "stunned" or (S.hrp.Position - hrp.Position).Magnitude > Data.ARREST.range + 3 then
			return false
		end
		S.by = player
		P.escorting[S] = true
		S.down = false
		S.hum.PlatformStand = false
		setState(S, "cuffed")
		S.model:SetAttribute("Officer", player.UserId)
		if S.call then
			S.call.kind = "Suspect in custody"
		end
		local d = Profile.data[player]
		if d then
			d.arrests += 1
		end
		if S.kind == "robber" then
			local pay = Data.PAY.robberyStop
			G.pay(player, "robbery", pay.cash, pay.xp, "Armed robber in cuffs!", "Cuffs")
			G.progress(player, "robbery", 1)
		else
			local pay = Data.PAY.arrest
			G.pay(player, "arrest", pay.cash, pay.xp, "Suspect cuffed! Walk them to BOOKING or put them in your car.", "Cuffs")
		end
		G.progress(player, "cuff", 1)
		G.fx("cuffed", S.hrp.Position)
		return true
	end
	local criminal = G.playerFromCharacter(target)
	local CP = criminal and G.players[criminal]
	local chrp = hrpOf(criminal)
	if not CP or CP.team ~= "Civilian" or not chrp then
		return false
	end
	if CP.stunnedUntil < os.clock() or CP.wanted <= 0 or (chrp.Position - hrp.Position).Magnitude > Data.ARREST.range + 3 then
		return false
	end
	return G.arrestPlayer(criminal, player)
end

---------------------------------------------------------------- the loops
-- impacts: a sudden change of velocity between frames (braking never does that) damages the car; a wanted criminal
-- slamming into a police car earns a star
function G.checkImpact(rec, t: number)
	local vel = rec.chassis.AssemblyLinearVelocity
	local dv = (vel - rec.lastVel).Magnitude
	rec.lastVel = vel
	if dv < 30 or t < (rec.hitAt or 0) then
		return
	end
	rec.hitAt = t + 0.4
	G.damageCar(rec, (dv - 25) * 0.9)
	G.fx("crash", rec.chassis.Position)
	local P = rec.driver and G.players[rec.driver]
	if P and P.team == "Civilian" and t >= rec.ramAt then
		for _, other in G.cars do
			if other.spec.police and other ~= rec and (other.chassis.Position - rec.chassis.Position).Magnitude < 14 then
				rec.ramAt = t + 5
				G.addWanted(rec.driver, Data.WANTED.ramCop, "You rammed a police car")
				break
			end
		end
	end
end

function G.step(dt: number)
	local t = os.clock()
	for _, rec in G.cars do
		if rec.model.Parent then
			if rec.ai then
				local brain = G.aiSteppers[rec.ai.kind or "getaway"] or G.stepAiCar
				brain(rec, t, dt)
			end
			if rec.driver or rec.ai or rec.lastVel.Magnitude > 1 then
				G.checkImpact(rec, t)
			end
		end
	end
	for _, S in G.suspects do
		G.stepSuspect(S, t)
	end
	for _, f in G.onStep do
		f(t, dt)
	end
end

-- once a second: wanted levels, jail, crashes, spawning suspects, abandoned cars, dispatch
function G.second()
	local t = os.clock()
	for player, P in G.players do
		-- jail time
		if P.cell then
			if t >= P.jailUntil then
				G.release(player)
			else
				local hrp = hrpOf(player)
				if hrp and P.cell and (hrp.Position - P.cell.Position).Magnitude > 12 then
					player.Character:PivotTo(P.cell.CFrame + Vector3.new(0, 3, 0))
				end
			end
		end
		-- wanted criminals: chased = more stars, unseen = fewer, and evasion pays
		if P.team == "Civilian" and P.wanted > 0 and not P.cell then
			local hrp = hrpOf(player)
			if hrp then
				local _, d = nearestCop(hrp.Position)
				if d < 150 then
					P.lastSeen = t
				end
				if d < 90 then
					P.chased += 1
					if P.chased % Data.WANTED.evadeEvery == 0 then
						G.addWanted(player, 1, "You're in a pursuit")
					end
				end
				if t - P.lastSeen > Data.WANTED.decayEvery then
					P.wanted -= 1
					P.lastSeen = t
					player:SetAttribute("Wanted", P.wanted)
					G.notify(player, ("You lost them. Wanted level %d"):format(P.wanted), "Release")
					if P.wanted == 0 then
						local d0 = Profile.data[player]
						if d0 then
							d0.escapes += 1
						end
						for _, f in G.onEscaped do
							f(player)
						end
					end
				end
				if t - P.lastEvadePay >= 30 then
					P.lastEvadePay = t
					Profile.give(player, Data.PAY.evadePerStar * P.wanted, 2 * P.wanted)
				end
			end
		end
	end
	-- keep the town supplied with suspects
	local onFoot, inCars = 0, 0
	for _, S in G.suspects do
		if not S.kind and (S.state == "loiter" or S.state == "flee" or S.state == "stunned") then
			onFoot += 1
		end
	end
	for _, rec in G.cars do
		if rec.ai and rec.ai.kind == "getaway" then
			inCars += 1
		end
	end
	if onFoot < Data.SUSPECTS.maxOnFoot and t >= (G.nextFoot or 0) then
		G.nextFoot = t + G.rand:NextNumber(Data.SUSPECTS.respawn[1], Data.SUSPECTS.respawn[2])
		G.spawnFootSuspect(nil, 1, nil)
	end
	if inCars < Data.SUSPECTS.maxInCars and t >= (G.nextCar or 0) then
		G.nextCar = t + G.rand:NextNumber(Data.SUSPECTS.respawn[1], Data.SUSPECTS.respawn[2]) * 1.5
		G.spawnGetaway()
	end
	-- parked civilian cars come back when theirs is gone or left far away
	for _, spot in G.spots do
		local rec = spot.car
		local gone = not rec or not rec.model.Parent
		if not gone and rec.idleSince and t - rec.idleSince > 120 and (rec.chassis.Position - spot.part.Position).Magnitude > 40 then
			local _, d = nearestCop(rec.chassis.Position)
			if d > 120 then
				G.destroyCar(rec)
				gone = true
			end
		end
		if gone and t >= (spot.nextAt or 0) then
			spot.nextAt = t + 30
			spot.car = G.spawnCar(Data.CIVILIAN_CARS[G.rand:NextInteger(1, #Data.CIVILIAN_CARS)], spot.part.CFrame, nil)
		end
	end
	for _, f in G.onSecond do
		f(t)
	end
	G.publishCalls()
end

---------------------------------------------------------------- setup
function G.init()
	carsFolder = Instance.new("Folder")
	carsFolder.Name = "Cars"
	carsFolder.Parent = workspace
	npcFolder = Instance.new("Folder")
	npcFolder.Name = "NPCs"
	npcFolder.Parent = workspace
	rayParams.FilterDescendantsInstances = { carsFolder, npcFolder }
	local world = workspace:WaitForChild("World")
	local station = world:FindFirstChild("Station")
	bookingZone = station and station:FindFirstChild("BookingZone")
	copSpawn = station and station:FindFirstChild("CopSpawn")
	local lot = station and station:FindFirstChild("PoliceSpots")
	for _, s in (if lot then lot:GetChildren() else {}) do
		if s:IsA("BasePart") then
			table.insert(policeSpots, s)
		end
	end
	local jail = world:FindFirstChild("Jail")
	for i = 1, 4 do
		local c = jail and jail:FindFirstChild("Cell" .. i)
		if c then
			table.insert(cells, c)
		end
	end
	local blocks = world:FindFirstChild("Blocks")
	local hide = blocks and blocks:FindFirstChild("Hideout")
	hideoutSpawn = hide and hide:FindFirstChild("HideoutSpawn")
	civSpawn = blocks and blocks:FindFirstChild("CivSpawn")
	local spots = world:FindFirstChild("Spots")
	for _, s in (if spots then spots:GetChildren() else {}) do
		if s:IsA("BasePart") and s.Name == "CivSpot" then
			local spot = { part = s, car = nil, nextAt = 0 }
			spot.car = G.spawnCar(Data.CIVILIAN_CARS[G.rand:NextInteger(1, #Data.CIVILIAN_CARS)], s.CFrame, nil)
			table.insert(G.spots, spot)
		end
	end
	-- signs and door lettering
	for _, p in world:GetDescendants() do
		local text = p.Name == "SignBoard" and p:FindFirstChild("Text")
		if text and p:IsA("BasePart") then
			local gui = Instance.new("SurfaceGui")
			gui.Face = Enum.NormalId.Front
			gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
			gui.PixelsPerStud = 30
			local l = Instance.new("TextLabel")
			l.BackgroundTransparency = 1
			l.Size = UDim2.fromScale(1, 1)
			l.Font = Enum.Font.GothamBlack
			l.TextScaled = true
			local tc = p:FindFirstChild("TextColor")
			l.TextColor3 = if tc and tc:IsA("Color3Value") then tc.Value else Color3.new(1, 1, 1)
			l.Text = text.Value
			l.Parent = gui
			gui.Parent = p
		end
	end
	G.nextFoot = os.clock() + 3
	G.nextCar = os.clock() + 8
	workspace:SetAttribute("Calls", "[]")
	G.world = world
	G.npcFolder = npcFolder
	G.carsFolder = carsFolder
	G.rayParams = rayParams
	G.cellList = cells
	G.bookingZone = bookingZone
	for _, f in G.onInit do
		f()
	end
end

-- police door lettering is added to every spawned car
CollectionService:GetInstanceAddedSignal("Car"):Connect(function(model)
	for _, p in model:GetDescendants() do
		local text = p.Name == "DoorPanel" and p:FindFirstChild("Text")
		local face = p:FindFirstChild("Face")
		if text and p:IsA("BasePart") and not p:FindFirstChildOfClass("SurfaceGui") then
			local gui = Instance.new("SurfaceGui")
			gui.Face = if face and face.Value == "Right" then Enum.NormalId.Right else Enum.NormalId.Left
			gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
			gui.PixelsPerStud = 40
			local l = Instance.new("TextLabel")
			l.BackgroundTransparency = 1
			l.Size = UDim2.fromScale(1, 0.5)
			l.Position = UDim2.fromScale(0, 0.25)
			l.Font = Enum.Font.GothamBlack
			l.TextScaled = true
			l.TextColor3 = Color3.fromRGB(20, 30, 80)
			l.Text = text.Value
			l.Parent = gui
			gui.Parent = p
		end
	end
end)

-- the other systems
for _, name in { "P9World", "P9AiCops", "P9Traffic", "P9Economy" } do
	require(script.Parent:WaitForChild(name))(G)
end

return G
