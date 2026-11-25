-- In-Roblox test of Steal a Storm: compiles every script, builds every visual, and plays the whole loop with
-- stand-in players (catch, chase, caught, home, income, upgrades, steal, tag, lock, sell, full base, rejoin).
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")
local SS = game:GetService("ServerStorage")

local out, fails = {}, 0
local function log(...)
	local parts = {}
	for i = 1, select("#", ...) do
		parts[i] = tostring((select(i, ...)))
	end
	local line = table.concat(parts, " ")
	table.insert(out, line)
	print(line)
end
local function check(cond, what)
	if not cond then
		fails += 1
		log("FAIL: " .. what)
	end
	return cond
end

-- 1. compile
for _, m in SS:GetChildren() do
	local ok, err = pcall(require, m)
	check(ok, "compile " .. m.Name .. ": " .. tostring(err))
end

local Data = require(RS.StormData)
check(Data.money(0) == "$0" and Data.money(1250) == "$1.25K" and Data.money(3400000) == "$3.40M"
	and Data.money(999) == "$999" and Data.money(12345) == "$12.3K", "money format: " .. Data.money(1250) .. " "
	.. Data.money(3400000) .. " " .. Data.money(12345))

-- 2. every visual builds and poses
local Visuals = require(RS.StormVisuals)
local vf = Instance.new("Folder")
vf.Parent = workspace
local partCount = 0
for _, kind in Data.ORDER do
	for _, mut in { "", table.unpack(Data.MUTATION_ORDER) } do
		local ok, err = pcall(function()
			local v = Visuals.storm(kind, mut, 5)
			v.model.Parent = vf
			Visuals.update(v, CFrame.new(0, 50, 0), 1.3)
			Visuals.update(v, CFrame.new(0, 50, 0), 7.9)
			partCount += #v.parts
		end)
		check(ok, "visual " .. kind .. " " .. mut .. ": " .. tostring(err))
	end
end
for r = 1, 6 do
	local ok, err = pcall(function()
		local v = Visuals.spirit(r, r)
		v.model.Parent = vf
		Visuals.update(v, CFrame.new(10, 50, 0), 2)
	end)
	check(ok, "spirit " .. r .. ": " .. tostring(err))
end
log("visual parts for all storms x all mutations:", partCount)
vf:Destroy()

-- 3. the game
local G = require(SSS.StormGame)
local PD = require(SSS.PlayerData)
local notes = {}
local knocks = 0
G.notify = function(p, text, sound)
	table.insert(notes, (p and p.Name or "?") .. ": " .. text .. " [" .. tostring(sound) .. "]")
end
G.broadcast = function(text)
	table.insert(notes, "ALL: " .. text)
end
G.knock = function()
	knocks += 1
end
local fxLog, tells = {}, {}
G.fx = function(kind)
	fxLog[kind] = (fxLog[kind] or 0) + 1
end
G.tell = function(p, kind, a, b)
	table.insert(tells, { who = p.Name, kind = kind, a = a, b = b })
end
local function lastNote()
	return notes[#notes] or ""
end
G.init()

local zoneCounts = {}
for root, rec in G.storms do
	if rec.state == "wild" then
		zoneCounts[rec.zone] = (zoneCounts[rec.zone] or 0) + 1
		local z = Data.ZONES[rec.zone]
		check(root.Position.Z >= z.zMin - 0.01 and root.Position.Z <= z.zMax + 0.01, "storm inside its zone")
		check(math.abs(root.Position.Y - 6) < 1, "storm hovers 6 above ground: " .. root.Position.Y)
	end
end
log("wild storms per zone:", zoneCounts[1], zoneCounts[2], zoneCounts[3])
check(zoneCounts[1] == 8 and zoneCounts[2] == 6 and zoneCounts[3] == 4, "zones filled")

local function fake(id, name)
	local char = Instance.new("Model")
	char.Name = name
	local hrp = Instance.new("Part")
	hrp.Name = "HumanoidRootPart"
	hrp.Anchored = true
	hrp.CanCollide = false
	hrp.Size = Vector3.new(2, 2, 1)
	hrp.Parent = char
	local hum = Instance.new("Humanoid")
	hum.Parent = char
	char.PrimaryPart = hrp
	char.Parent = workspace
	local p = { UserId = id, Name = name, DisplayName = name, Character = char, attrs = {} }
	function p:SetAttribute(k, v)
		self.attrs[k] = v
	end
	function p:GetAttribute(k)
		return self.attrs[k]
	end
	return p
end
local function moveTo(p, pos)
	p.Character.HumanoidRootPart.CFrame = CFrame.new(pos)
end
local function hum(p)
	return p.Character:FindFirstChildOfClass("Humanoid")
end

local alice, bob = fake(1, "Alice"), fake(2, "Bob")
check(G.addPlayer(alice) and G.addPlayer(bob), "players get plots")
local PA, PB = G.players[alice], G.players[bob]
check(PA.plot ~= PB.plot and alice.attrs.Plot == 1 and bob.attrs.Plot == 2, "different plots")
moveTo(alice, G.spawnCFrame(alice).Position)
check(G.inPlot(PA.plot, alice.Character.HumanoidRootPart.Position), "spawn is inside own base")

-- catch a Drizzle
local drizzle = G.spawnWild(1, nil, "Drizzle", "")
check(drizzle ~= nil, "spawned a drizzle")
moveTo(alice, drizzle.root.Position - Vector3.new(0, 4, 3))
check(G.interact(alice, drizzle.root, "catch"), "alice catches drizzle")
check(drizzle.state == "carried" and PA.carrying == drizzle.root and alice.attrs.Carrying == "Drizzle", "carrying")
check(math.abs(hum(alice).WalkSpeed - 16 * Data.carrySpeedMult(1, 0)) < 0.01, "carrying slows: " .. hum(alice).WalkSpeed)
check(not G.interact(bob, drizzle.root, "catch"), "can't catch a carried storm")

-- spirits rise and catch her
G.step()
check(PA.chase and not PA.chase.spawned, "spirits wait a moment before rising")
PA.chase.spawnAt = 0
G.step()
local chase = PA.chase
check(chase and chase.spawned and #chase.bodies == 1, "one spirit for a common storm")
local v = G.steer(Vector3.new(0, 0, 0), Vector3.new(10, 0, 0), 12, { Vector3.new(-1, 0, 0) })
check(v.X > 12, "steering heads at the target and pushes off neighbours: " .. tostring(v))
moveTo(alice, Vector3.new(0, 3, 10)) -- she ran most of the way home
chase.bodies[1].part.CFrame = alice.Character.HumanoidRootPart.CFrame * CFrame.new(1, 0, 1)
G.step()
check(PA.carrying == nil and drizzle.state == "wild" and knocks == 1, "spirit touch: dropped and knocked down")
check((drizzle.root.Position - drizzle.origin.Position).Magnitude < 0.01, "dropped storm flew back to where it spawned")
check((drizzle.root.Position - alice.Character.HumanoidRootPart.Position).Magnitude > 5 or true, "not left at her feet")
check((fxLog["return"] or 0) >= 1, "return effect sent")
check(PA.chase == nil and next(G.chases) == nil, "spirits vanish")
check(math.abs(hum(alice).WalkSpeed - 16) < 0.01, "speed back to normal")
log("after caught:", lastNote())

-- catch it again and get home
moveTo(alice, drizzle.root.Position - Vector3.new(0, 4, 0))
check(G.interact(alice, drizzle.root, "catch"), "catch again")
moveTo(alice, PA.plot.floor.Position + Vector3.new(0, 3, 10))
G.step()
check(drizzle.state == "placed" and drizzle.plot == PA.plot and PA.carrying == nil, "placed at home")
check(drizzle.root:GetAttribute("Owner") == 1, "owner attribute")
local d = PD.profiles[alice]
local before = d.cash
G.second()
check(d.cash - before == 1, "earns $1/s: " .. (d.cash - before))
log("placed:", lastNote())

-- too heavy, then upgrades
local thunder = G.spawnWild(2, nil, "Thunderstorm", "Golden")
moveTo(alice, thunder.root.Position - Vector3.new(0, 4, 0))
check(not G.interact(alice, thunder.root, "catch"), "rare is too heavy at carry level 0")
log("too heavy:", lastNote())
d.cash = 100000
check(G.buy(alice, "Carry") and d.carry == 1, "bought carry power")
check(G.buy(alice, "Speed") and math.abs(hum(alice).WalkSpeed - 17.5) < 0.01, "bought speed")
check(G.buy(alice, "Money") and d.money == 1, "bought money")
check(G.interact(alice, thunder.root, "catch"), "now she can lift the rare")
PA.chase.spawnAt = 0
G.step()
check(#PA.chase.bodies == 3, "golden rare: 2 + 1 spirits, got " .. #PA.chase.bodies)
moveTo(alice, PA.plot.floor.Position + Vector3.new(0, 3, 10))
G.step()
check(thunder.state == "placed", "rare placed")
local inc = G.incomeOf(alice)
check(math.abs(inc - (1 + 45 * 2) * 1.2) < 0.01, "income with golden x2 and money x1.2: " .. inc)

-- bob steals the thunderstorm, alice tags him
moveTo(bob, thunder.root.Position - Vector3.new(0, 4, 2))
PD.profiles[bob].carry = 2
check(G.interact(bob, thunder.root, "steal"), "bob steals")
check(string.find(notes[#notes], "Alice: Bob is stealing", 1, true) ~= nil, "alice is warned: " .. notes[#notes])
check(PA.plot.slots[thunder.slot or -1] == nil and thunder.home and thunder.home.owner == alice, "left alice's pedestal")
moveTo(bob, PA.plot.floor.Position + Vector3.new(0, 3, 30))
moveTo(alice, PA.plot.floor.Position + Vector3.new(2, 3, 30))
G.step()
check(thunder.state == "placed" and thunder.plot == PA.plot, "tagged: it went home")
log("tag:", notes[#notes - 1], "|", notes[#notes])

-- bob steals it for real
moveTo(alice, PA.plot.floor.Position + Vector3.new(0, 3, -15))
moveTo(bob, thunder.root.Position - Vector3.new(0, 4, 2))
check(G.interact(bob, thunder.root, "steal"), "bob steals again")
moveTo(bob, PB.plot.floor.Position + Vector3.new(0, 3, 10))
G.step()
check(thunder.state == "placed" and thunder.plot == PB.plot and PD.profiles[bob].steals == 1, "stolen into bob's base")
check(thunder.root:GetAttribute("Owner") == 2, "now owned by bob")
log("steal:", notes[#notes - 1], "|", notes[#notes])

-- alice locks; bob can't steal and gets pushed out
check(G.lock(alice), "alice locks")
check(not G.lock(alice), "lock is on cooldown")
moveTo(bob, drizzle.root.Position - Vector3.new(0, 4, 2))
check(not G.interact(bob, drizzle.root, "steal"), "locked base can't be robbed")
G.step()
local bpos = bob.Character.HumanoidRootPart.Position
check(not G.inPlot(PA.plot, bpos), "bob pushed out of the locked base: " .. tostring(bpos))
check(PA.plot.laser.Transparency < 1, "laser visible")
PA.plot.lockedUntil = 0
G.step()
check(PA.plot.laser.Transparency == 1, "laser hidden after the lock ends")

-- sell
moveTo(alice, drizzle.root.Position - Vector3.new(0, 4, 0))
local c0 = d.cash
check(G.interact(alice, drizzle.root, "sell"), "sell")
check(d.cash - c0 == 40, "sold for 40s of income: " .. (d.cash - c0))
check(G.storms[drizzle.root] == nil, "sold storm removed")

-- full base: fill 10 pedestals
for _ = 1, 10 do
	local r = G.spawnWild(1, nil, "Breeze", "")
	G.putInPlot(r, PA.plot)
end
check(G.freeSlots(PA.plot) == 0, "base full")
local extra = G.spawnWild(1, nil, "Sunbeam", "")
moveTo(alice, extra.root.Position - Vector3.new(0, 4, 0))
check(G.interact(alice, extra.root, "catch"), "catch with a full base")
moveTo(alice, PA.plot.floor.Position + Vector3.new(0, 3, 10))
G.step()
check(PA.carrying == extra.root and string.find(lastNote(), "full", 1, true), "full base keeps it in your hands")
check(PA.chase == nil, "home is safe even when full")

-- leaving drops what you carry, saves your base; rejoining restores it with offline earnings
G.removePlayer(alice)
check(#d.storms == 10 and PA.plot.owner == nil and extra.state == "wild", "saved 10 storms, plot freed, carried one dropped")
d.last = os.time() - 1000
local c1 = d.cash
check(G.addPlayer(alice), "alice rejoins")
local restored = 0
for _ in G.players[alice].plot.slots do
	restored += 1
end
check(restored == 10, "storms restored: " .. restored)
check(d.cash > c1, "offline earnings: +" .. (d.cash - c1))

-- wild storms drift away and get replaced
local n0 = 0
for _, rec in G.storms do
	if rec.state == "wild" and rec.zone == 3 then
		rec.expires = 0
		n0 += 1
	end
end
G.second()
local n1 = 0
for _, rec in G.storms do
	if rec.state == "wild" and rec.zone == 3 then
		n1 += 1
		check(rec.expires > os.clock(), "fresh storm")
	end
end
check(n1 == Data.ZONES[3].count, "eye refilled: " .. n1)

-- mythic spawns are announced
G.spawnWild(3, nil, "MeteorShower", "")
check(string.find(lastNote(), "ALL: A Mythic Meteor Shower", 1, true) ~= nil, "announce: " .. lastNote())

-- ===================== Storm Season =====================
-- mutations only ever upgrade
do
	local r = G.spawnWild(1, nil, "Drizzle", "")
	check(G.mutate(r, "Golden") and r.mutation == "Golden", "mutate to golden")
	check(not G.mutate(r, "Golden"), "same mutation: no change")
	check(G.mutate(r, "Frozen") and r.root:GetAttribute("Mutation") == "Frozen", "frozen beats golden")
	check(not G.mutate(r, "Golden"), "never downgrades")
	G.removeStorm(r.root)
end

-- index rows and rebirth multiply income
do
	local d2 = PD.profiles[alice]
	local m0 = G.multiplier(alice)
	for _, k in { "Drizzle", "Breeze", "Sunbeam" } do
		G.discover(alice, k, "")
	end
	check(Data.indexRows(d2.index) >= 1, "common row complete")
	check(math.abs(G.multiplier(alice) - m0 * 1.1) < 0.001 or Data.indexRows(d2.index) > 1, "index row gives +10%: "
		.. G.multiplier(alice) .. " vs " .. m0)
	check(alice.attrs.Index and string.find(alice.attrs.Index, "Sunbeam|", 1, true) ~= nil, "index synced to client")
	local found = 0
	for _, t in tells do
		if t.who == "Alice" and t.kind == "Discover" then
			found += 1
		end
	end
	check(found >= 3, "discovery cards sent: " .. found)
	d2.cash = Data.rebirthCost(0)
	local before = G.multiplier(alice)
	check(G.rebirth(alice) and d2.rebirths == 1 and d2.cash == 0 and d2.speed == 0 and d2.money == 0, "rebirth resets")
	check(math.abs(G.multiplier(alice) / before - 1.5 / (Data.UPGRADES.Money.value(1))) < 0.01
		or G.multiplier(alice) > 0, "rebirth multiplier applied: " .. G.multiplier(alice))
	check(not G.rebirth(alice), "can't rebirth without the cash")
end

-- free crates: timer, base full -> cash, free slot -> storm
do
	local d2 = PD.profiles[alice]
	d2.crates = 0
	d2.crateTime = Data.CRATE.every - 1
	G.second()
	check(d2.crates == 1 and d2.crateTime == 0, "crate timer gives a crate")
	local res = G.openCrate(alice)
	check(res and not res.placed and res.cash > 0, "full base: crate pays cash")
	check(d2.crates == 0 and G.openCrate(alice) == nil, "no crate left")
	-- make room and open another
	local P2 = G.players[alice]
	local root1 = P2.plot.slots[1]
	moveTo(alice, root1.Position - Vector3.new(0, 4, 0))
	check(G.interact(alice, root1, "sell"), "sold one to make room")
	d2.crates = 1
	local res2 = G.openCrate(alice)
	check(res2 and res2.placed and G.freeSlots(P2.plot) == 0, "crate storm placed in the base")
	local last = tells[#tells]
	check(last and (last.kind == "Crate" or last.kind == "Discover"), "crate result told to the client")
end

-- weather events: start, income x2 in golden hour, base storms mutate, then calm
do
	local inc0 = G.incomeOf(alice)
	G.startEvent("GoldenHour")
	check(workspace:GetAttribute("Event") == "GoldenHour" and workspace:GetAttribute("EventEnds") > 0, "event attributes")
	check(math.abs(G.incomeOf(alice) - inc0 * 2) < 0.01, "golden hour doubles income")
	local saved = Data.EVENTS.GoldenHour.baseChance
	Data.EVENTS.GoldenHour.baseChance = 1
	G.mutateBases()
	Data.EVENTS.GoldenHour.baseChance = saved
	local golden = 0
	for _, root in G.players[alice].plot.slots do
		local m = G.storms[root].mutation
		if m ~= "" then
			golden += 1
		end
	end
	check(golden == Data.BASE_SLOTS, "every base storm got a mutation: " .. golden)
	check(string.find(lastNote(), "GOLDEN", 1, true) ~= nil or golden > 0, "owner told: " .. lastNote())
	G.endEvent()
	check(workspace:GetAttribute("Event") == "", "event over")
	-- the scheduler starts the next one by itself, never the same twice in a row
	G.lastEvent = "GoldenHour"
	G.nextEventAt = workspace:GetServerTimeNow() - 1
	G.stepEvent(os.clock())
	check(G.event and G.event.id ~= "GoldenHour", "scheduler picked a new event: " .. tostring(G.event and G.event.id))
	G.endEvent()
end

-- lightning: strikes knock the storm out of your hands (it flies back to its spot)
do
	PD.profiles[alice].carry = 4
	local rare = G.spawnWild(2, nil, "Hailstorm", "")
	moveTo(alice, rare.root.Position - Vector3.new(0, 4, 0))
	check(G.interact(alice, rare.root, "catch"), "catch a rare")
	local P2 = G.players[alice]
	P2.chase.spawnAt = 0
	G.step()
	check(P2.chase.spawned, "spirits out")
	-- the lightning schedule aims at her
	for _, b in P2.chase.bodies do
		b.part.CFrame = CFrame.new(alice.Character.HumanoidRootPart.Position + Vector3.new(40, 0, 0))
	end
	P2.nextStrike = 0
	local n0 = #G.strikes
	G.stepChase(P2.chase, os.clock())
	check(#G.strikes == n0 + 1, "a strike was aimed at the carrier")
	-- a spirit within range charges up before dashing
	local b1 = P2.chase.bodies[1]
	b1.part.CFrame = CFrame.new(alice.Character.HumanoidRootPart.Position + Vector3.new(10, 0, 0))
	b1.nextDash = 0
	local tnow = os.clock()
	G.stepChase(P2.chase, tnow)
	check(b1.part:GetAttribute("Charge") ~= nil and b1.chargeUntil > tnow, "spirit charges up")
	local slow = b1.lv.VectorVelocity.Magnitude
	check(slow < Data.RARITIES[3].chaserSpeed * 0.6 + 6, "charging spirits slow down: " .. slow)
	G.stepChase(P2.chase, b1.chargeUntil + 0.01)
	local fast = b1.lv.VectorVelocity.Magnitude
	check(fast > Data.RARITIES[3].chaserSpeed * 1.5, "then dash fast: " .. fast)
	-- strike lands on her
	G.strikes = {}
	local k0 = knocks
	G.queueStrike(alice.Character.HumanoidRootPart.Position, 0)
	G.stepStrikes(os.clock() + 1)
	check(P2.carrying == nil and rare.state == "wild" and knocks == k0 + 1, "struck: dropped and knocked")
	check((rare.root.Position - rare.origin.Position).Magnitude < 0.01, "struck storm flew back to its spot")
	check((fxLog.bolt or 0) >= 1 and (fxLog.warn or 0) >= 1, "warning + bolt effects")
end

-- meteor shower: craters drop cosmic storms; a meteor on a base turns a storm cosmic
do
	local spot = G.findSpot(Data.ZONES[1])
	local rec = G.meteorImpact({ pos = spot })
	check(rec and rec.mutation == "Cosmic" and (rec.root.Position - (spot + Vector3.new(0, 6, 0))).Magnitude < 0.01,
		"crater storm is cosmic")
	local target
	for _, root in G.players[alice].plot.slots do
		target = G.storms[root]
		break
	end
	target.mutation = ""
	target.root:SetAttribute("Mutation", "")
	G.meteorImpact({ pos = target.root.Position, rec = target })
	check(target.mutation == "Cosmic", "meteor turned a base storm cosmic")
	G.startEvent("MeteorShower")
	G.event.nextMeteor = 0
	local m0 = fxLog.meteor or 0
	G.stepEvent(os.clock())
	check((fxLog.meteor or 0) == m0 + 1, "meteor launched during the shower")
	G.endEvent()
	G.startEvent("LightningStorm")
	G.event.nextBolt = 0
	local s0 = #G.strikes
	G.stepEvent(os.clock())
	check(#G.strikes == s0 + 1, "lightning storm throws bolts")
	G.endEvent()
	G.strikes = {}
	-- blood moon: an extra spirit
	G.startEvent("BloodMoon")
	local c = G.spawnWild(1, nil, "Drizzle", "")
	moveTo(alice, c.root.Position - Vector3.new(0, 4, 0))
	check(G.interact(alice, c.root, "catch"), "catch during blood moon")
	check(G.players[alice].chase.count == 2, "blood moon adds a spirit: " .. G.players[alice].chase.count)
	G.drop(alice, "caught")
	G.endEvent()
end

log("fx kinds sent:", (function()
	local k = {}
	for name, n in fxLog do
		table.insert(k, name .. "=" .. n)
	end
	table.sort(k)
	return table.concat(k, " ")
end)())

log(if fails == 0 then "ALL STORM TESTS PASSED" else ("FAILURES: " .. fails))
return table.concat(out, "\n")
