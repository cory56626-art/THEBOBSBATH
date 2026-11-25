-- StormGame: the rules of Steal a Storm (server only).
--   * wild storms spawn in three zones (rarer further north) and drift away after a while
--   * catch one and it rides above your head; storm spirits rise out of the ground and chase you
--   * get it into your base and it sits on a pedestal earning $/s; spirits that touch you knock you down and
--     you drop it
--   * steal from other players' bases (unless locked); the owner tags you to get it back
--   * cash buys Speed, Carry Power (rarer storms) and Money (income multiplier)
-- A "player" can be a real Player or a test stand-in table (UserId, Name, Character, Get/SetAttribute).

local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Data = require(ReplicatedStorage:WaitForChild("StormData"))
local PD = require(script.Parent:WaitForChild("PlayerData"))

local G = {}
G.plots = {} :: { any }
G.players = {} :: { [any]: any }
G.storms = {} :: { [BasePart]: any }
G.chases = {} :: { [any]: boolean }
G.rand = Random.new()
-- hooks set by the server script (no-ops in tests)
G.notify = function(_player, _text: string, _sound: string?) end
G.broadcast = function(_text: string, _sound: string?) end
G.knock = function(_player, _dir: Vector3) end

local stormsFolder: Folder
local chasersFolder: Folder
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude

local function now(): number
	return workspace:GetServerTimeNow()
end

function G.nameOf(player): string
	return player.DisplayName or player.Name or "Someone"
end

local function hrpOf(player): BasePart?
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	return if hrp and hrp:IsA("BasePart") then hrp else nil
end
G.hrpOf = hrpOf

local function humOf(player): Humanoid?
	local char = player.Character
	return char and char:FindFirstChildOfClass("Humanoid")
end

local function kindName(rec): string
	return (if rec.mutation ~= "" then rec.mutation .. " " else "") .. Data.KINDS[rec.kind].name
end
G.kindName = kindName

---------------------------------------------------------------- plots
local function surfaceText(part: BasePart, face: Enum.NormalId, title: string, sub: string?)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 30
	gui.LightInfluence = 0
	local t = Instance.new("TextLabel")
	t.Name = "Title"
	t.BackgroundTransparency = 1
	t.Size = UDim2.fromScale(1, if sub then 0.6 else 1)
	t.Font = Enum.Font.FredokaOne
	t.TextScaled = true
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextStrokeTransparency = 0.4
	t.Text = title
	t.Parent = gui
	if sub then
		local s = Instance.new("TextLabel")
		s.Name = "Sub"
		s.BackgroundTransparency = 1
		s.Position = UDim2.fromScale(0, 0.6)
		s.Size = UDim2.fromScale(1, 0.38)
		s.Font = Enum.Font.GothamBold
		s.TextScaled = true
		s.TextColor3 = Color3.fromRGB(140, 255, 150)
		s.Text = sub
		s.Parent = gui
	end
	gui.Parent = part
	return gui
end

function G.inPlot(plot, pos: Vector3): boolean
	local f = plot.floor
	local d = pos - f.Position
	return math.abs(d.X) < f.Size.X / 2 and math.abs(d.Z) < f.Size.Z / 2 and d.Y < 30 and d.Y > -5
end

function G.updateSign(plot)
	if not plot.sign then
		return
	end
	local title = plot.sign:FindFirstChild("Title")
	local sub = plot.sign:FindFirstChild("Sub")
	if plot.owner then
		title.Text = G.nameOf(plot.owner) .. "'s Base"
		sub.Text = Data.money(G.incomeOf(plot.owner)) .. "/s"
	else
		title.Text = "Empty Base"
		sub.Text = ""
	end
end

function G.isLocked(plot): boolean
	return now() < plot.lockedUntil
end

---------------------------------------------------------------- storms
local function newRoot(kind: string, mutation: string, cf: CFrame): BasePart
	local root = Instance.new("Part")
	root.Name = kind
	root.Size = Vector3.new(4, 4, 4)
	root.Transparency = 1
	root.Anchored = true
	root.CanCollide = false
	root.CanTouch = false
	root.CanQuery = false
	root.Massless = true
	root.CFrame = cf
	root:SetAttribute("Kind", kind)
	root:SetAttribute("Mutation", mutation)
	root:SetAttribute("State", "wild")
	root:SetAttribute("Owner", 0)
	root:SetAttribute("Carrier", 0)
	CollectionService:AddTag(root, "Storm")
	root.Parent = stormsFolder
	return root
end

local function newRec(root: BasePart, kind: string, mutation: string)
	local rec = {
		root = root,
		kind = kind,
		mutation = mutation,
		rarity = Data.KINDS[kind].rarity,
		state = "wild",
		plot = nil,
		slot = nil,
		carrier = nil,
		home = nil,
		expires = 0,
		zone = nil,
	}
	G.storms[root] = rec
	return rec
end

local function detach(root: BasePart, cf: CFrame)
	local w = root:FindFirstChild("CarryWeld")
	if w then
		w:Destroy()
	end
	root.Anchored = true
	root.CFrame = cf
end

function G.removeStorm(root: BasePart)
	G.storms[root] = nil
	root:Destroy()
end

-- the ground under a point (ignores characters and decorations without collision)
function G.groundAt(pos: Vector3): Vector3
	local origin = Vector3.new(pos.X, pos.Y + 20, pos.Z)
	for _ = 1, 6 do
		local hit = workspace:Raycast(origin, Vector3.new(0, -200, 0), rayParams)
		if not hit then
			break
		end
		local model = hit.Instance:FindFirstAncestorOfClass("Model")
		if hit.Instance.CanCollide and not (model and model:FindFirstChildOfClass("Humanoid")) then
			return hit.Position
		end
		origin = hit.Position - Vector3.new(0, 0.05, 0)
	end
	return Vector3.new(pos.X, 0, pos.Z)
end

function G.findSpot(zone): Vector3?
	for _ = 1, 16 do
		local x = G.rand:NextNumber(Data.FIELD_X[1], Data.FIELD_X[2])
		local z = G.rand:NextNumber(zone.zMin, zone.zMax)
		local hit = workspace:Raycast(Vector3.new(x, 150, z), Vector3.new(0, -300, 0), rayParams)
		if hit and string.sub(hit.Instance.Name, 1, 6) == "Ground" then
			local free = true
			for root, rec in G.storms do
				if rec.state == "wild" and (root.Position - hit.Position).Magnitude < 18 then
					free = false
					break
				end
			end
			if free then
				return hit.Position
			end
		end
	end
	return nil
end

function G.spawnWild(zoneIndex: number, rarity: number?, kind: string?, mutation: string?)
	local zone = Data.ZONES[zoneIndex]
	local r = rarity or Data.pickRarity(zone.weights, G.rand)
	if kind then
		r = Data.KINDS[kind].rarity
	else
		local kinds = Data.kindsOfRarity(r)
		kind = kinds[G.rand:NextInteger(1, #kinds)]
	end
	local mut = mutation or (if G.rand:NextNumber() < Data.MUTATIONS.Golden.chance then "Golden" else "")
	local pos = G.findSpot(zone)
	if not pos then
		return nil
	end
	local root = newRoot(kind :: string, mut, CFrame.new(pos + Vector3.new(0, 6, 0)))
	local rec = newRec(root, kind :: string, mut)
	rec.zone = zoneIndex
	rec.expires = os.clock() + G.rand:NextNumber(Data.WILD_LIFETIME[1], Data.WILD_LIFETIME[2])
	if r >= 5 then
		G.broadcast(("A %s %s appeared in the %s!"):format(Data.RARITIES[r].name, kindName(rec), zone.name), "Announce")
	end
	return rec
end

-- puts a storm on a pedestal (slot optional: first free one)
function G.putInPlot(rec, plot, slot: number?): boolean
	if not slot or plot.slots[slot] ~= nil or not plot.pedestals[slot] then
		slot = nil
		for i = 1, Data.BASE_SLOTS do
			if plot.slots[i] == nil and plot.pedestals[i] then
				slot = i
				break
			end
		end
	end
	if not slot then
		return false
	end
	local ped = plot.pedestals[slot]
	plot.slots[slot] = rec.root
	rec.state, rec.plot, rec.slot, rec.home, rec.carrier, rec.zone = "placed", plot, slot, nil, nil, nil
	detach(rec.root, CFrame.new(ped.Position + Vector3.new(0, ped.Size.X / 2 + 4.5, 0)))
	rec.root:SetAttribute("State", "placed")
	rec.root:SetAttribute("Owner", if plot.owner then plot.owner.UserId else 0)
	rec.root:SetAttribute("Carrier", 0)
	rec.root:SetAttribute("Slot", slot)
	G.updateSign(plot)
	return true
end

function G.freeSlots(plot): number
	local n = 0
	for i = 1, Data.BASE_SLOTS do
		if plot.slots[i] == nil then
			n += 1
		end
	end
	return n
end

---------------------------------------------------------------- money and upgrades
function G.incomeOf(player): number
	local P = G.players[player]
	local d = PD.profiles[player]
	if not P or not d then
		return 0
	end
	local total = 0
	for _, root in P.plot.slots do
		local rec = G.storms[root]
		if rec then
			total += Data.income(rec.kind, rec.mutation)
		end
	end
	return total * Data.UPGRADES.Money.value(d.money)
end

function G.applySpeed(player)
	local hum = humOf(player)
	local d = PD.profiles[player]
	local P = G.players[player]
	if not hum or not d or not P then
		return
	end
	local speed = Data.UPGRADES.Speed.value(d.speed)
	local rec = P.carrying and G.storms[P.carrying]
	if rec then
		speed *= Data.carrySpeedMult(rec.rarity, d.carry)
	end
	hum.WalkSpeed = speed
end

local UPGRADE_KEY = { Speed = "speed", Carry = "carry", Money = "money" }
function G.buy(player, name: string): boolean
	local U = Data.UPGRADES[name]
	local key = UPGRADE_KEY[name]
	local d = PD.profiles[player]
	if not U or not key or not d then
		return false
	end
	local lv = d[key]
	if lv >= U.max then
		G.notify(player, U.name .. " is maxed out!", "Error")
		return false
	end
	local cost = U.cost(lv)
	if d.cash < cost then
		G.notify(player, "You need " .. Data.money(cost - d.cash) .. " more", "Error")
		return false
	end
	d.cash -= cost
	d[key] = lv + 1
	G.applySpeed(player)
	PD.sync(player, G.incomeOf(player))
	if G.players[player] then
		G.updateSign(G.players[player].plot)
	end
	G.notify(player, U.name .. " upgraded to level " .. (lv + 1) .. "!", "Upgrade")
	return true
end

function G.lock(player): boolean
	local P = G.players[player]
	if not P then
		return false
	end
	local plot = P.plot
	local t = now()
	if t < plot.lockReadyAt then
		G.notify(player, ("Lock recharging: %ds"):format(math.ceil(plot.lockReadyAt - t)), "Error")
		return false
	end
	plot.lockedUntil = t + Data.LOCK_TIME
	plot.lockReadyAt = plot.lockedUntil + Data.LOCK_COOLDOWN
	plot.model:SetAttribute("LockedUntil", plot.lockedUntil)
	plot.model:SetAttribute("LockReadyAt", plot.lockReadyAt)
	G.notify(player, "Base locked for " .. Data.LOCK_TIME .. " seconds!", "Lock")
	return true
end

---------------------------------------------------------------- carrying and chasers
local function endChase(chase)
	for _, b in chase.bodies do
		b.part:Destroy()
	end
	chase.bodies = {}
	G.chases[chase] = nil
	local P = G.players[chase.player]
	if P and P.chase == chase then
		P.chase = nil
	end
end
G.endChase = endChase

local function startChase(player, rec)
	local P = G.players[player]
	if P.chase then
		endChase(P.chase)
	end
	local chase = {
		player = player,
		root = rec.root,
		rarity = rec.rarity,
		count = Data.RARITIES[rec.rarity].chasers + (if rec.mutation ~= "" then 1 else 0),
		bodies = {},
		started = os.clock(),
		spawnAt = os.clock() + 1.2,
		spawned = false,
		origin = rec.root.Position,
	}
	G.chases[chase] = true
	P.chase = chase
	return chase
end

function G.spawnChasers(chase)
	chase.spawned = true
	local ground = G.groundAt(chase.origin)
	for i = 1, chase.count do
		local a = (i / chase.count) * math.pi * 2 + G.rand:NextNumber() * 0.6
		local pos = ground + Vector3.new(math.cos(a) * 5, 2.5, math.sin(a) * 5)
		local body = Instance.new("Part")
		body.Name = "StormSpirit"
		body.Shape = Enum.PartType.Ball
		body.Size = Vector3.new(3, 3, 3)
		body.Transparency = 1
		body.CanCollide = false
		body.CanTouch = false
		body.CanQuery = false
		body.CFrame = CFrame.new(pos)
		local att = Instance.new("Attachment")
		att.Parent = body
		local lv = Instance.new("LinearVelocity")
		lv.Attachment0 = att
		lv.MaxForce = math.huge
		lv.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
		lv.RelativeTo = Enum.ActuatorRelativeTo.World
		lv.VectorVelocity = Vector3.zero
		lv.Parent = body
		local ao = Instance.new("AlignOrientation")
		ao.Mode = Enum.OrientationAlignmentMode.OneAttachment
		ao.Attachment0 = att
		ao.MaxTorque = math.huge
		ao.Responsiveness = 40
		ao.Parent = body
		body:SetAttribute("Rarity", chase.rarity)
		body:SetAttribute("Target", chase.player.UserId)
		CollectionService:AddTag(body, "Chaser")
		body.Parent = chasersFolder
		pcall(function()
			body:SetNetworkOwner(nil)
		end)
		table.insert(chase.bodies, {
			part = body,
			lv = lv,
			ao = ao,
			nextDash = os.clock() + 2 + G.rand:NextNumber() * 2,
			dashUntil = 0,
		})
	end
	G.notify(chase.player, "Storm spirits are chasing you! RUN!", "Howl")
end

-- velocity toward the target, plus a push away from the other spirits
function G.steer(pos: Vector3, target: Vector3, speed: number, others: { Vector3 }?): Vector3
	local to = target - pos
	local v = if to.Magnitude > 0.01 then to.Unit * speed else Vector3.zero
	if others then
		for _, o in others do
			local d = pos - o
			local m = d.Magnitude
			if m > 0.01 and m < 6 then
				v += d.Unit * (6 - m) * 2
			end
		end
	end
	return v
end

function G.pickUp(player, rec, fromPlot)
	local P = G.players[player]
	local hrp = hrpOf(player)
	if not P or not hrp then
		return
	end
	if fromPlot then
		rec.home = { plot = fromPlot, slot = rec.slot, owner = fromPlot.owner }
		fromPlot.slots[rec.slot] = nil
		G.updateSign(fromPlot)
	else
		rec.home = nil
	end
	rec.state, rec.carrier, rec.plot, rec.slot, rec.zone = "carried", player, nil, nil, nil
	local root = rec.root
	root:SetAttribute("State", "carried")
	root:SetAttribute("Carrier", player.UserId)
	root:SetAttribute("Owner", 0)
	root:SetAttribute("Slot", nil)
	root.Anchored = false
	root.CFrame = hrp.CFrame * CFrame.new(0, 6.5, 0)
	local w = Instance.new("Weld")
	w.Name = "CarryWeld"
	w.Part0 = hrp
	w.Part1 = root
	w.C0 = CFrame.new(0, 6.5, 0)
	w.Parent = root
	P.carrying = root
	player:SetAttribute("Carrying", rec.kind)
	G.applySpeed(player)
	startChase(player, rec)
end

-- reason: "caught" (spirits), "tagged" (owner), "died", "left", "lost"
function G.drop(player, reason: string, dir: Vector3?)
	local P = G.players[player]
	if not P or not P.carrying then
		return
	end
	local root = P.carrying
	local rec = G.storms[root]
	P.carrying = nil
	player:SetAttribute("Carrying", "")
	if P.chase then
		endChase(P.chase)
	end
	G.applySpeed(player)
	if not rec then
		if root.Parent then
			root:Destroy()
		end
		return
	end
	local hrp = hrpOf(player)
	if reason == "caught" or reason == "tagged" then
		G.knock(player, dir or Vector3.new(0, 0.5, 1))
	end
	-- stolen storms go home if their owner is still here
	local home = rec.home
	if home and home.owner and home.plot.owner == home.owner and home.owner ~= player then
		if G.putInPlot(rec, home.plot, home.slot) then
			if reason == "tagged" then
				G.notify(home.owner, "You got your " .. kindName(rec) .. " back!", "Place")
				G.notify(player, "Tagged! The " .. kindName(rec) .. " went home.", "Bonk")
			else
				G.notify(home.owner, "Your " .. kindName(rec) .. " came back home!", "Place")
				if reason == "caught" then
					G.notify(player, "The storm spirits got you!", "Bonk")
				end
			end
			return
		end
	end
	-- otherwise it hovers where it fell, back in the wild for anyone to grab
	local pos = if hrp then hrp.Position else root.Position
	detach(root, CFrame.new(G.groundAt(pos) + Vector3.new(0, 6, 0)))
	rec.state, rec.carrier, rec.home = "wild", nil, nil
	rec.expires = os.clock() + 40
	root:SetAttribute("State", "wild")
	root:SetAttribute("Carrier", 0)
	root:SetAttribute("Owner", 0)
	if reason == "caught" then
		G.notify(player, "The storm spirits got you! You dropped the " .. kindName(rec) .. ".", "Bonk")
	end
end

-- the carried storm goes onto a free pedestal in the carrier's own base
function G.place(player): boolean
	local P = G.players[player]
	local d = PD.profiles[player]
	if not P or not P.carrying or not d then
		return false
	end
	local root = P.carrying
	local rec = G.storms[root]
	if not rec then
		return false
	end
	local stolenFrom = rec.home and rec.home.owner
	if not G.putInPlot(rec, P.plot) then
		return false
	end
	P.carrying = nil
	player:SetAttribute("Carrying", "")
	if P.chase then
		endChase(P.chase)
	end
	G.applySpeed(player)
	local inc = Data.income(rec.kind, rec.mutation) * Data.UPGRADES.Money.value(d.money)
	if stolenFrom and stolenFrom ~= player then
		d.steals += 1
		G.notify(player, "You stole a " .. kindName(rec) .. "! +" .. Data.money(inc) .. "/s", "Steal")
		if G.players[stolenFrom] then
			G.notify(stolenFrom, G.nameOf(player) .. " stole your " .. kindName(rec) .. "!", "Alarm")
		end
	else
		G.notify(player, kindName(rec) .. " added to your base! +" .. Data.money(inc) .. "/s", "Place")
	end
	PD.sync(player, G.incomeOf(player))
	return true
end

-- a player used a prompt: "catch" (wild), "steal" (someone's base), "sell" (own base)
function G.interact(player, root: BasePart, action: string): boolean
	local rec = G.storms[root]
	local P = G.players[player]
	local d = PD.profiles[player]
	local hrp = hrpOf(player)
	local hum = humOf(player)
	if not rec or not P or not d or not hrp or not hum or hum.Health <= 0 then
		return false
	end
	if (hrp.Position - root.Position).Magnitude > 20 then
		return false
	end
	local maxRarity = Data.UPGRADES.Carry.value(d.carry)
	if action == "catch" or action == "steal" then
		if P.carrying then
			G.notify(player, "You're already carrying a storm!", "Error")
			return false
		end
		if rec.rarity > maxRarity then
			G.notify(player, ("Too heavy! Upgrade Carry Power to lift %s storms"):format(Data.RARITIES[rec.rarity].name),
				"Error")
			return false
		end
	end
	if action == "catch" then
		if rec.state ~= "wild" then
			return false
		end
		G.pickUp(player, rec, nil)
		G.notify(player, "You caught a " .. kindName(rec) .. "! Run home!", "Catch")
		return true
	elseif action == "steal" then
		if rec.state ~= "placed" or rec.plot == P.plot or not rec.plot then
			return false
		end
		local plot = rec.plot
		if G.isLocked(plot) then
			G.notify(player, "This base is locked!", "Error")
			return false
		end
		local owner = plot.owner
		G.pickUp(player, rec, plot)
		G.notify(player, "You grabbed a " .. kindName(rec) .. "! Get it to your base!", "Catch")
		if owner then
			G.notify(owner, G.nameOf(player) .. " is stealing your " .. kindName(rec) .. "! Tag them!", "Alarm")
			PD.sync(owner, G.incomeOf(owner))
		end
		return true
	elseif action == "sell" then
		if rec.state ~= "placed" or rec.plot ~= P.plot then
			return false
		end
		local price = math.floor(Data.income(rec.kind, rec.mutation) * Data.SELL_SECONDS)
		P.plot.slots[rec.slot] = nil
		G.removeStorm(root)
		d.cash += price
		PD.sync(player, G.incomeOf(player))
		G.updateSign(P.plot)
		G.notify(player, "Sold " .. kindName(rec) .. " for " .. Data.money(price), "Sell")
		return true
	end
	return false
end

---------------------------------------------------------------- players
function G.addPlayer(player)
	local d = PD.profiles[player] or PD.load(player)
	local plot
	for _, p in G.plots do
		if not p.owner then
			plot = p
			break
		end
	end
	if not plot then
		return false
	end
	plot.owner = player
	plot.lockedUntil, plot.lockReadyAt = 0, 0
	plot.model:SetAttribute("Owner", player.UserId)
	plot.model:SetAttribute("LockedUntil", 0)
	plot.model:SetAttribute("LockReadyAt", 0)
	G.players[player] = { plot = plot, carrying = nil, chase = nil, warnedFull = -100, welcome = 0 }
	player:SetAttribute("Plot", plot.index)
	player:SetAttribute("Carrying", "")
	for _, s in d.storms do
		if type(s) == "table" and Data.KINDS[s.k] then
			local root = newRoot(s.k, s.m or "", CFrame.new(plot.floor.Position))
			local rec = newRec(root, s.k, s.m or "")
			if not G.putInPlot(rec, plot, s.s) then
				G.removeStorm(root)
			end
		end
	end
	local away = math.clamp(os.time() - (d.last or os.time()), 0, Data.OFFLINE_CAP)
	local earned = math.floor(G.incomeOf(player) * away * Data.OFFLINE_RATE)
	if earned > 0 then
		d.cash += earned
		G.players[player].welcome = earned
	end
	d.last = os.time()
	G.updateSign(plot)
	PD.sync(player, G.incomeOf(player))
	return true
end

function G.snapshot(player)
	local P = G.players[player]
	local d = PD.profiles[player]
	if not P or not d then
		return
	end
	local list = {}
	for slot, root in P.plot.slots do
		local rec = G.storms[root]
		if rec then
			table.insert(list, { k = rec.kind, m = rec.mutation, s = slot })
		end
	end
	d.storms = list
end

function G.removePlayer(player)
	local P = G.players[player]
	if not P then
		return
	end
	G.drop(player, "left")
	G.snapshot(player)
	for _, root in P.plot.slots do
		G.removeStorm(root)
	end
	-- storms of theirs being carried off by thieves no longer have a home
	for _, rec in G.storms do
		if rec.home and rec.home.owner == player then
			rec.home = nil
		end
	end
	local plot = P.plot
	plot.slots = {}
	plot.owner = nil
	plot.lockedUntil, plot.lockReadyAt = 0, 0
	plot.model:SetAttribute("Owner", 0)
	plot.model:SetAttribute("LockedUntil", 0)
	G.updateSign(plot)
	G.players[player] = nil
end

function G.spawnCFrame(player): CFrame?
	local P = G.players[player]
	if not P then
		return nil
	end
	local pad = P.plot.model:FindFirstChild("SpawnPad")
	local pos = if pad then pad.Position else P.plot.floor.Position
	return CFrame.lookAt(pos + Vector3.new(0, 3.5, 0), pos + Vector3.new(0, 3.5, 10))
end

---------------------------------------------------------------- the loops
function G.stepChase(chase, t: number)
	local player = chase.player
	local P = G.players[player]
	local hrp = hrpOf(player)
	if not P or not hrp or P.carrying ~= chase.root then
		endChase(chase)
		return
	end
	if not chase.spawned then
		if t >= chase.spawnAt then
			G.spawnChasers(chase)
		end
		return
	end
	if t - chase.started > 75 then
		endChase(chase)
		return
	end
	local speed = Data.RARITIES[chase.rarity].chaserSpeed
	local target = hrp.Position
	local positions = {}
	for i, b in chase.bodies do
		positions[i] = b.part.Position
	end
	for i, b in chase.bodies do
		local pos = positions[i]
		local to = target - pos
		local dist = to.Magnitude
		if dist < 3.6 then
			G.drop(player, "caught", Vector3.new(to.X, 0, to.Z).Unit + Vector3.new(0, 0.6, 0))
			return
		end
		if t >= b.nextDash and dist < 16 then
			b.dashUntil = t + 0.6
			b.nextDash = t + 3 + G.rand:NextNumber() * 2
			b.part:SetAttribute("Dash", t)
		end
		local s = speed * (if t < b.dashUntil then 1.75 else 1)
		local others = {}
		for j, p in positions do
			if j ~= i then
				table.insert(others, p)
			end
		end
		b.lv.VectorVelocity = G.steer(pos, target, s, others)
		local flat = Vector3.new(to.X, 0, to.Z)
		if flat.Magnitude > 0.1 then
			b.ao.CFrame = CFrame.lookAt(Vector3.zero, flat)
		end
	end
end

local lastPush: { [any]: number } = {} -- (times from os.clock, which may start near 0)
function G.step()
	local t = os.clock()
	for player, P in G.players do
		local root = P.carrying
		if root then
			local rec = G.storms[root]
			local hrp = hrpOf(player)
			if not rec or not hrp or not root.Parent then
				G.drop(player, "lost")
			elseif G.inPlot(P.plot, hrp.Position) then
				if not G.place(player) then
					if P.chase then
						endChase(P.chase) -- home is safe even when it's full
					end
					if t - P.warnedFull > 6 then
						P.warnedFull = t
						G.notify(player, "Your base is full! Sell a storm to make room.", "Error")
					end
				end
			elseif rec.home and rec.home.owner and rec.home.owner ~= player then
				local ohrp = hrpOf(rec.home.owner)
				if ohrp and (ohrp.Position - hrp.Position).Magnitude < 6 then
					G.drop(player, "tagged", (hrp.Position - ohrp.Position).Unit + Vector3.new(0, 0.6, 0))
				end
			end
		end
	end
	for chase in G.chases do
		G.stepChase(chase, t)
	end
	-- locked bases push intruders back out to the road
	for _, plot in G.plots do
		local locked = G.isLocked(plot)
		if plot.laser then
			local want = if locked then 0.35 else 1
			if plot.laser.Transparency ~= want then
				plot.laser.Transparency = want
			end
		end
		if locked then
			for player, P in G.players do
				local hrp = hrpOf(player)
				if P.plot ~= plot and hrp and G.inPlot(plot, hrp.Position) and t - (lastPush[player] or -100) > 0.5 then
					lastPush[player] = t
					local f = plot.floor
					local out = Vector3.new(hrp.Position.X, f.Position.Y + 4, f.Position.Z + f.Size.Z / 2 + 7)
					player.Character:PivotTo(CFrame.new(out))
					G.knock(player, Vector3.new(0, 0.5, 1))
					G.notify(player, "That base is locked!", "Zap")
				end
			end
		end
	end
end

-- once a second: income, wild storms drifting away and new ones appearing
function G.second()
	for player in G.players do
		local d = PD.profiles[player]
		if d then
			local inc = G.incomeOf(player)
			d.cash += inc
			d.earned += inc
			PD.sync(player, inc)
		end
	end
	local t = os.clock()
	local counts = {}
	for root, rec in G.storms do
		if rec.state == "wild" then
			if t > rec.expires then
				G.removeStorm(root)
			elseif rec.zone then
				counts[rec.zone] = (counts[rec.zone] or 0) + 1
			end
		end
	end
	for i, zone in Data.ZONES do
		for _ = (counts[i] or 0) + 1, zone.count do
			G.spawnWild(i)
		end
	end
end

---------------------------------------------------------------- setup
function G.init()
	stormsFolder = Instance.new("Folder")
	stormsFolder.Name = "Storms"
	stormsFolder.Parent = workspace
	chasersFolder = Instance.new("Folder")
	chasersFolder.Name = "StormSpirits"
	chasersFolder.Parent = workspace
	local plotsFolder = workspace:WaitForChild("Plots")
	rayParams.FilterDescendantsInstances = { stormsFolder, chasersFolder, plotsFolder }
	local list = plotsFolder:GetChildren()
	table.sort(list, function(a, b)
		return a.Name < b.Name
	end)
	for _, model in list do
		local idx = model:FindFirstChild("Index")
		local plot = {
			model = model,
			index = if idx then idx.Value else #G.plots + 1,
			owner = nil,
			slots = {},
			pedestals = {},
			floor = model:FindFirstChild("Floor"),
			laser = model:FindFirstChild("Laser"),
			lockedUntil = 0,
			lockReadyAt = 0,
			sign = nil,
		}
		for i = 1, Data.BASE_SLOTS do
			plot.pedestals[i] = model:FindFirstChild("Pedestal" .. i)
		end
		local signPart = model:FindFirstChild("Sign")
		if signPart then
			plot.sign = surfaceText(signPart, Enum.NormalId.Back, "Empty Base", "")
		end
		model:SetAttribute("Owner", 0)
		table.insert(G.plots, plot)
	end
	table.sort(G.plots, function(a, b)
		return a.index < b.index
	end)
	local world = workspace:FindFirstChild("World")
	if world then
		for _, p in world:GetChildren() do
			local text = p.Name == "ZoneSign" and p:FindFirstChild("Text")
			if text and p:IsA("BasePart") then
				surfaceText(p, Enum.NormalId.Front, text.Value)
				surfaceText(p, Enum.NormalId.Back, text.Value)
			end
		end
	end
	for i, zone in Data.ZONES do
		for _ = 1, zone.count do
			G.spawnWild(i)
		end
	end
end

return G
