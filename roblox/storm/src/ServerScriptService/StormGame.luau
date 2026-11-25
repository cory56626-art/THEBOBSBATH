-- StormGame: the rules of Steal a Storm (server only).
--   * wild storms spawn in three zones (rarer further north) and drift away after a while
--   * catch one and it rides above your head; storm spirits rise out of the ground and chase you (they charge up,
--     then dash), and lightning strikes at you if it's Rare or better
--   * get it into your base and it sits on a pedestal earning $/s. If you're caught, struck or tagged you drop it,
--     and it flies back to where it spawned (stolen storms fly home)
--   * steal from other players' bases (unless locked); the owner tags you to get it back
--   * weather events every few minutes mutate storms (in the wild AND in bases), meteors crash, spirits change
--   * cash buys Speed, Carry Power and Money; rebirth for a permanent multiplier; free crates; the storm index
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
G.strikes = {} :: { any }
G.rand = Random.new()
G.event = nil :: any -- { id, endsAt, nextMutate, nextMeteor, nextBolt }
G.nextEventAt = math.huge
G.lastEvent = ""
-- hooks set by the server script (no-ops in tests)
G.notify = function(_player, _text: string, _sound: string?) end
G.broadcast = function(_text: string, _sound: string?) end
G.knock = function(_player, _dir: Vector3) end
G.fx = function(_kind: string, ...) end -- visual effects for every client
G.tell = function(_player, _kind: string, ...) end -- one player's UI moments (discoveries, crates)

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
	return Data.displayName(rec.kind, rec.mutation)
end
G.kindName = kindName

local function eventDef()
	return G.event and Data.EVENTS[G.event.id]
end

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
		origin = nil, -- where it hovers in the wild (dropped storms fly back here)
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

function G.zoneAt(z: number): number
	for i, zone in Data.ZONES do
		if z <= zone.zMax + 5 then
			return i
		end
	end
	return #Data.ZONES
end

-- a mutation for a new wild storm (weather events make theirs much more likely)
function G.rollMutation(): string
	local ev = eventDef()
	if ev and ev.mutation and ev.spawnChance > 0 and G.rand:NextNumber() < ev.spawnChance then
		return ev.mutation
	end
	for i = #Data.MUTATION_ORDER, 1, -1 do
		local id = Data.MUTATION_ORDER[i]
		local m = Data.MUTATIONS[id]
		if m.chance > 0 and G.rand:NextNumber() < m.chance then
			return id
		end
	end
	return ""
end

function G.rollRarity(weights: { number }): number
	local ev = eventDef()
	local r = Data.pickRarity(weights, G.rand)
	for _ = 2, (ev and ev.rarityRolls) or 1 do
		r = math.max(r, Data.pickRarity(weights, G.rand))
	end
	return r
end

-- upgrade a storm's mutation (only ever to a better one). Returns true if it changed.
function G.mutate(rec, mutation: string): boolean
	if Data.mutationMult(mutation) <= Data.mutationMult(rec.mutation) then
		return false
	end
	rec.mutation = mutation
	rec.root:SetAttribute("Mutation", mutation)
	G.fx("mutate", rec.root.Position, mutation)
	return true
end

-- spawn a wild storm in a zone (at an exact spot if given)
function G.spawnWild(zoneIndex: number, rarity: number?, kind: string?, mutation: string?, at: Vector3?)
	local zone = Data.ZONES[zoneIndex]
	local r = rarity or G.rollRarity(zone.weights)
	if kind then
		r = Data.KINDS[kind].rarity
	else
		local kinds = Data.kindsOfRarity(r)
		kind = kinds[G.rand:NextInteger(1, #kinds)]
	end
	local mut = mutation or G.rollMutation()
	local pos = at or G.findSpot(zone)
	if not pos then
		return nil
	end
	local cf = CFrame.new(pos + Vector3.new(0, 6, 0))
	local root = newRoot(kind :: string, mut, cf)
	local rec = newRec(root, kind :: string, mut)
	rec.zone = zoneIndex
	rec.origin = cf
	rec.expires = os.clock() + G.rand:NextNumber(Data.WILD_LIFETIME[1], Data.WILD_LIFETIME[2])
	if r >= 5 or Data.mutationMult(mut) >= 6 then
		G.broadcast(("A %s %s appeared in the %s!"):format(Data.RARITIES[r].name, kindName(rec), zone.name), "Announce")
	end
	G.fx("spawn", pos, r)
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
	rec.root:SetAttribute("Thief", nil)
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

---------------------------------------------------------------- money, upgrades, index, rebirth, crates
function G.multiplier(player): number
	local d = PD.profiles[player]
	if not d then
		return 1
	end
	local ev = eventDef()
	return Data.UPGRADES.Money.value(d.money) * Data.rebirthMult(d.rebirths)
		* (1 + Data.INDEX_ROW_BONUS * Data.indexRows(d.index)) * ((ev and ev.incomeMult) or 1)
end

function G.incomeOf(player): number
	local P = G.players[player]
	if not P then
		return 0
	end
	local total = 0
	for _, root in P.plot.slots do
		local rec = G.storms[root]
		if rec then
			total += Data.income(rec.kind, rec.mutation)
		end
	end
	return total * G.multiplier(player)
end

-- the first time you own a storm (or a mutation of it) it goes in your index
function G.discover(player, kind: string, mutation: string)
	local d = PD.profiles[player]
	if not d then
		return
	end
	local key = Data.indexKey(kind, mutation)
	if d.index[key] then
		return
	end
	local rowsBefore = Data.indexRows(d.index)
	d.index[key] = true
	PD.syncIndex(player)
	G.tell(player, "Discover", kind, mutation)
	if Data.indexRows(d.index) > rowsBefore then
		G.notify(player, ("Index row complete! +%d%% income forever"):format(Data.INDEX_ROW_BONUS * 100), "Upgrade")
	end
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
	G.tell(player, "Upgraded", name)
	return true
end

function G.rebirth(player): boolean
	local d = PD.profiles[player]
	if not d or not G.players[player] then
		return false
	end
	local cost = Data.rebirthCost(d.rebirths)
	if d.cash < cost then
		G.notify(player, "Rebirth needs " .. Data.money(cost) .. " cash", "Error")
		return false
	end
	d.cash = 0
	d.speed = 0
	d.money = 0
	d.rebirths += 1
	G.applySpeed(player)
	PD.sync(player, G.incomeOf(player))
	G.updateSign(G.players[player].plot)
	local hrp = hrpOf(player)
	G.fx("rebirth", if hrp then hrp.Position else Vector3.zero, d.rebirths)
	G.broadcast(("%s reached Rebirth %d! (x%.1f income)"):format(G.nameOf(player), d.rebirths,
		Data.rebirthMult(d.rebirths)), "Rebirth")
	return true
end

-- open a free crate: a random storm straight into your base (or cash if it's full)
function G.openCrate(player)
	local d = PD.profiles[player]
	local P = G.players[player]
	if not d or not P then
		return nil
	end
	if d.crates < 1 then
		G.notify(player, ("Next free crate in %d:%02d"):format((Data.CRATE.every - d.crateTime) // 60,
			(Data.CRATE.every - d.crateTime) % 60), "Error")
		return nil
	end
	d.crates -= 1
	local r = Data.pickRarity(Data.CRATE.weights, G.rand)
	local kinds = Data.kindsOfRarity(r)
	local kind = kinds[G.rand:NextInteger(1, #kinds)]
	local mut = G.rollMutation()
	local result = { kind = kind, mutation = mut, rarity = r, placed = false, cash = 0 }
	if G.freeSlots(P.plot) > 0 then
		local root = newRoot(kind, mut, CFrame.new(P.plot.floor.Position + Vector3.new(0, 6, 0)))
		local rec = newRec(root, kind, mut)
		G.putInPlot(rec, P.plot)
		result.placed = true
	else
		result.cash = math.floor(Data.income(kind, mut) * Data.CRATE.fullPaySeconds * G.multiplier(player))
		d.cash += result.cash
	end
	PD.sync(player, G.incomeOf(player))
	G.tell(player, "Crate", result) -- first, so the client spins before any "new storm" card
	if result.placed then
		G.discover(player, kind, mut)
	end
	return result
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
		G.fx("vanish", b.part.Position)
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
	local ev = eventDef()
	local chase = {
		player = player,
		root = rec.root,
		rarity = rec.rarity,
		count = Data.RARITIES[rec.rarity].chasers + (if rec.mutation ~= "" then 1 else 0) + ((ev and ev.extraChasers) or 0),
		bodies = {},
		started = os.clock(),
		spawnAt = os.clock() + 1.2,
		spawned = false,
		origin = rec.root.Position,
	}
	G.chases[chase] = true
	P.chase = chase
	P.nextStrike = os.clock() + 2.5
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
		G.fx("rise", pos, chase.rarity)
		table.insert(chase.bodies, {
			part = body,
			lv = lv,
			ao = ao,
			nextDash = os.clock() + 2 + G.rand:NextNumber() * 2,
			chargeUntil = 0,
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
	local root = rec.root
	G.fx("catch", root.Position, rec.rarity, player.UserId)
	if fromPlot then
		rec.home = { plot = fromPlot, slot = rec.slot, owner = fromPlot.owner }
		fromPlot.slots[rec.slot] = nil
		G.updateSign(fromPlot)
		root:SetAttribute("Thief", true)
		fromPlot.model:SetAttribute("Alarm", now())
	else
		rec.home = nil
	end
	rec.state, rec.carrier, rec.plot, rec.slot = "carried", player, nil, nil
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

-- send a dropped storm back to the wild spot it came from (so you can't re-grab it right where you fell)
function G.returnToWild(rec, from: Vector3)
	if not rec.origin then
		local zi = Data.zoneForRarity(rec.rarity)
		local spot = G.findSpot(Data.ZONES[zi])
		rec.origin = CFrame.new((spot or G.groundAt(from)) + Vector3.new(0, 6, 0))
		rec.zone = zi
	end
	detach(rec.root, rec.origin)
	rec.state, rec.carrier, rec.home = "wild", nil, nil
	rec.zone = rec.zone or G.zoneAt(rec.origin.Position.Z)
	rec.expires = math.max(rec.expires, os.clock() + 30)
	rec.root:SetAttribute("State", "wild")
	rec.root:SetAttribute("Carrier", 0)
	rec.root:SetAttribute("Owner", 0)
	rec.root:SetAttribute("Thief", nil)
	G.fx("return", from, rec.origin.Position, rec.rarity)
end

-- reason: "caught" (spirits), "struck" (lightning), "tagged" (owner), "died", "left", "lost"
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
	local from = if hrp then hrp.Position + Vector3.new(0, 6.5, 0) else root.Position
	if reason == "caught" or reason == "tagged" or reason == "struck" then
		G.knock(player, dir or Vector3.new(0, 0.5, 1))
		G.fx("bonk", from - Vector3.new(0, 4, 0))
	end
	local what = kindName(rec)
	-- stolen storms go home if their owner is still here
	local home = rec.home
	if home and home.owner and home.plot.owner == home.owner and home.owner ~= player then
		if G.putInPlot(rec, home.plot, home.slot) then
			G.fx("return", from, rec.root.Position, rec.rarity)
			if reason == "tagged" then
				G.notify(home.owner, "You got your " .. what .. " back!", "Place")
				G.notify(player, "Tagged! The " .. what .. " flew home.", "Bonk")
			else
				G.notify(home.owner, "Your " .. what .. " came back home!", "Place")
				if reason == "caught" then
					G.notify(player, "The storm spirits got you! The " .. what .. " flew home.", "Bonk")
				elseif reason == "struck" then
					G.notify(player, "Struck by lightning! The " .. what .. " flew home.", "Bonk")
				end
			end
			return
		end
	end
	-- otherwise it flies back to where it spawned in the wild
	G.returnToWild(rec, from)
	if reason == "caught" then
		G.notify(player, "The storm spirits got you! The " .. what .. " flew back to where it was.", "Bonk")
	elseif reason == "struck" then
		G.notify(player, "Struck by lightning! The " .. what .. " flew back to where it was.", "Bonk")
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
	local inc = Data.income(rec.kind, rec.mutation) * G.multiplier(player)
	G.fx("place", root.Position, rec.rarity, player.UserId, inc)
	if stolenFrom and stolenFrom ~= player then
		d.steals += 1
		G.notify(player, "You stole a " .. kindName(rec) .. "! +" .. Data.money(inc) .. "/s", "Steal")
		if G.players[stolenFrom] then
			G.notify(stolenFrom, G.nameOf(player) .. " stole your " .. kindName(rec) .. "!", "Alarm")
		end
	else
		G.notify(player, kindName(rec) .. " added to your base! +" .. Data.money(inc) .. "/s", "Place")
	end
	G.discover(player, rec.kind, rec.mutation)
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
		G.fx("sell", root.Position, price)
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

---------------------------------------------------------------- lightning and meteors
-- a strike lands `delay` seconds from now (a warning circle shows where)
function G.queueStrike(pos: Vector3, delay: number, radius: number?)
	local ground = G.groundAt(pos)
	local r = radius or Data.STRIKE.radius
	table.insert(G.strikes, { pos = ground, at = os.clock() + delay, radius = r })
	G.fx("warn", ground, r, delay)
end

function G.resolveStrike(s)
	G.fx("bolt", s.pos, s.radius)
	for player in G.players do
		local hrp = hrpOf(player)
		if hrp then
			local d = hrp.Position - s.pos
			if Vector3.new(d.X, 0, d.Z).Magnitude < s.radius and d.Y < 12 then
				local away = Vector3.new(d.X, 0, d.Z)
				away = if away.Magnitude > 0.1 then away.Unit else Vector3.zAxis
				if G.players[player].carrying then
					G.drop(player, "struck", away + Vector3.new(0, 0.7, 0))
				else
					G.knock(player, away + Vector3.new(0, 0.7, 0))
				end
			end
		end
	end
end

function G.stepStrikes(t: number)
	for i = #G.strikes, 1, -1 do
		local s = G.strikes[i]
		if t >= s.at then
			table.remove(G.strikes, i)
			G.resolveStrike(s)
		end
	end
end

-- a meteor lands: in the wild it leaves a Cosmic storm in its crater; in a base it turns a storm Cosmic
function G.meteorImpact(target)
	G.fx("impact", target.pos)
	for player in G.players do
		local hrp = hrpOf(player)
		if hrp and (hrp.Position - target.pos).Magnitude < 9 then
			local away = Vector3.new(hrp.Position.X - target.pos.X, 0, hrp.Position.Z - target.pos.Z)
			away = if away.Magnitude > 0.1 then away.Unit else Vector3.zAxis
			if G.players[player].carrying then
				G.drop(player, "struck", away + Vector3.new(0, 0.8, 0))
			else
				G.knock(player, away + Vector3.new(0, 0.8, 0))
			end
		end
	end
	if target.rec then
		local rec = target.rec
		if G.storms[rec.root] and rec.state == "placed" and G.mutate(rec, "Cosmic") then
			local owner = rec.plot and rec.plot.owner
			if owner then
				G.notify(owner, "A meteor hit your base! Your " .. Data.KINDS[rec.kind].name .. " turned COSMIC (x5)!",
					"Upgrade")
				G.discover(owner, rec.kind, rec.mutation)
				PD.sync(owner, G.incomeOf(owner))
				G.updateSign(rec.plot)
			end
		end
		return nil
	end
	local zi = G.zoneAt(target.pos.Z)
	return G.spawnWild(zi, G.rollRarity(Data.ZONES[math.min(#Data.ZONES, zi + 1)].weights), nil, "Cosmic", target.pos)
end

function G.launchMeteor()
	local target
	if G.rand:NextNumber() < 0.15 then
		local candidates = {}
		for root, rec in G.storms do
			if rec.state == "placed" then
				table.insert(candidates, rec)
			end
		end
		if #candidates > 0 then
			local rec = candidates[G.rand:NextInteger(1, #candidates)]
			target = { pos = rec.root.Position - Vector3.new(0, 4, 0), rec = rec }
		end
	end
	if not target then
		local zi = Data.pickRarity({ 45, 35, 20 }, G.rand)
		local spot = G.findSpot(Data.ZONES[zi])
		if not spot then
			return
		end
		target = { pos = spot }
	end
	local from = target.pos + Vector3.new(G.rand:NextNumber(-120, 120), 260, G.rand:NextNumber(-60, 160))
	local flight = 1.8
	G.fx("meteor", from, target.pos, flight)
	task.delay(flight, function()
		G.meteorImpact(target)
	end)
end

---------------------------------------------------------------- weather events
function G.startEvent(id: string?)
	local pick = id
	if not pick then
		local options = {}
		for _, e in Data.EVENT_ORDER do
			if e ~= G.lastEvent then
				table.insert(options, e)
			end
		end
		pick = options[G.rand:NextInteger(1, #options)]
	end
	local ev = Data.EVENTS[pick :: string]
	local t = os.clock()
	G.event = { id = pick, endsAt = now() + Data.EVENT_LENGTH, nextMutate = t + Data.BASE_MUTATE_EVERY, nextMeteor = t + 1,
		nextBolt = t + 1 }
	G.lastEvent = pick :: string
	G.nextEventAt = now() + Data.EVENT_EVERY
	workspace:SetAttribute("Event", pick)
	workspace:SetAttribute("EventEnds", G.event.endsAt)
	workspace:SetAttribute("NextEvent", G.nextEventAt)
	G.broadcast(ev.name:upper() .. "! " .. ev.desc, "Event")
	for player in G.players do
		PD.sync(player, G.incomeOf(player))
	end
end

function G.endEvent()
	if not G.event then
		return
	end
	G.event = nil
	workspace:SetAttribute("Event", "")
	workspace:SetAttribute("EventEnds", 0)
	G.broadcast("The weather is calming down...", nil)
	for player in G.players do
		PD.sync(player, G.incomeOf(player))
	end
end

-- weather events mutate storms that sit in bases too: staying online during events pays off
function G.mutateBases()
	local ev = eventDef()
	if not ev or not ev.mutation or ev.baseChance <= 0 then
		return
	end
	for root, rec in G.storms do
		if rec.state == "placed" and G.rand:NextNumber() < ev.baseChance and G.mutate(rec, ev.mutation) then
			local owner = rec.plot and rec.plot.owner
			if owner then
				G.notify(owner, ("Your %s turned %s! (x%g)"):format(Data.KINDS[rec.kind].name,
					Data.MUTATIONS[ev.mutation].name:upper(), Data.MUTATIONS[ev.mutation].mult), "Upgrade")
				G.discover(owner, rec.kind, rec.mutation)
				PD.sync(owner, G.incomeOf(owner))
				G.updateSign(rec.plot)
			end
		end
	end
end

function G.stepEvent(t: number)
	if not G.event then
		if now() >= G.nextEventAt then
			G.startEvent()
		end
		return
	end
	if now() >= G.event.endsAt then
		G.endEvent()
		return
	end
	local id = G.event.id
	if t >= G.event.nextMutate then
		G.event.nextMutate = t + Data.BASE_MUTATE_EVERY
		G.mutateBases()
	end
	if id == "MeteorShower" and t >= G.event.nextMeteor then
		G.event.nextMeteor = t + G.rand:NextNumber(1.6, 2.8)
		G.launchMeteor()
	elseif id == "LightningStorm" and t >= G.event.nextBolt then
		G.event.nextBolt = t + G.rand:NextNumber(0.4, 0.8)
		local pos
		local inField = {}
		for player in G.players do
			local hrp = hrpOf(player)
			if hrp and hrp.Position.Z > 12 then
				table.insert(inField, hrp)
			end
		end
		if #inField > 0 and G.rand:NextNumber() < 0.3 then
			local hrp = inField[G.rand:NextInteger(1, #inField)]
			pos = hrp.Position + Vector3.new(G.rand:NextNumber(-10, 10), 0, G.rand:NextNumber(-10, 10))
		else
			pos = Vector3.new(G.rand:NextNumber(Data.FIELD_X[1], Data.FIELD_X[2]), 0, G.rand:NextNumber(20, 320))
		end
		G.queueStrike(pos, 1.1, 6)
	end
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
	G.players[player] = { plot = plot, carrying = nil, chase = nil, warnedFull = -100, welcome = 0, nextStrike = 0 }
	player:SetAttribute("Plot", plot.index)
	player:SetAttribute("Carrying", "")
	for _, s in d.storms do
		if type(s) == "table" and Data.KINDS[s.k] then
			local mut = if s.m and (s.m == "" or Data.MUTATIONS[s.m]) then s.m else ""
			local root = newRoot(s.k, mut, CFrame.new(plot.floor.Position))
			local rec = newRec(root, s.k, mut)
			if G.putInPlot(rec, plot, s.s) then
				d.index[Data.indexKey(s.k, mut)] = true
			else
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
	PD.syncIndex(player)
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
	local ev = eventDef()
	local speed = Data.RARITIES[chase.rarity].chaserSpeed * ((ev and ev.chaserSpeed) or 1)
	local S = Data.SPIRIT
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
		-- close enough: stop to charge up (eyes flare), then dash
		if t >= b.nextDash and dist < S.range and t >= b.dashUntil then
			b.chargeUntil = t + S.chargeTime
			b.dashUntil = b.chargeUntil + S.dashTime
			b.nextDash = b.dashUntil + G.rand:NextNumber(S.cooldown[1], S.cooldown[2])
			b.part:SetAttribute("Charge", t)
		end
		local s = speed
		if t < b.chargeUntil then
			s *= S.chargeSlow
		elseif t < b.dashUntil then
			s *= S.dashMult
		end
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
	-- lightning hunts whoever carries a Rare or better storm: it aims where you're running
	local every = Data.STRIKE.every[chase.rarity]
	if every and t >= (P.nextStrike or 0) then
		P.nextStrike = t + every
		local v = hrp.AssemblyLinearVelocity
		local lead = Vector3.new(v.X, 0, v.Z) * Data.STRIKE.warn * 0.9
		local jitter = Vector3.new(G.rand:NextNumber(-3, 3), 0, G.rand:NextNumber(-3, 3))
		G.queueStrike(hrp.Position + lead + jitter, Data.STRIKE.warn)
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
	G.stepStrikes(t)
	G.stepEvent(t)
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

-- once a second: income, free crate timers, wild storms drifting away and new ones appearing
function G.second()
	for player in G.players do
		local d = PD.profiles[player]
		if d then
			local inc = G.incomeOf(player)
			d.cash += inc
			d.earned += inc
			if d.crates < Data.CRATE.max then
				d.crateTime += 1
				if d.crateTime >= Data.CRATE.every then
					d.crateTime = 0
					d.crates += 1
					G.notify(player, "A FREE storm crate is ready! Open it!", "Upgrade")
				end
			end
			PD.sync(player, inc)
		end
	end
	local t = os.clock()
	local counts = {}
	for root, rec in G.storms do
		if rec.state == "wild" then
			if t > rec.expires then
				G.fx("fade", root.Position)
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
	G.nextEventAt = now() + Data.EVENT_FIRST
	workspace:SetAttribute("Event", "")
	workspace:SetAttribute("EventEnds", 0)
	workspace:SetAttribute("NextEvent", G.nextEventAt)
end

return G
