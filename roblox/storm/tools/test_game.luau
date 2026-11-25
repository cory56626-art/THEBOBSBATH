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
	for _, mut in { "", "Golden" } do
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
log("visual parts for all storms (x2):", partCount)
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
chase.bodies[1].part.CFrame = alice.Character.HumanoidRootPart.CFrame * CFrame.new(1, 0, 1)
G.step()
check(PA.carrying == nil and drizzle.state == "wild" and knocks == 1, "spirit touch: dropped and knocked down")
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

log(if fails == 0 then "ALL STORM TESTS PASSED" else ("FAILURES: " .. fails))
return table.concat(out, "\n")
