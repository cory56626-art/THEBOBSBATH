-- In-Roblox test of Precinct 9: compiles every script, checks the car math (and simulates AI drivers on the road
-- network, since sessions have no physics), then plays the police loop with stand-in players: cars, lights and
-- sirens, suspects spotting a cop, taser, cuffs, booking, getaway cars fleeing / wrecked / bailing, player criminals
-- stealing, wanted stars, arrest, jail and release, pay and ranks.
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")
local SS = game:GetService("ServerStorage")
local HttpService = game:GetService("HttpService")

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
	if m:IsA("ModuleScript") then
		local ok, err = pcall(require, m)
		check(ok, "compile " .. m.Name .. ": " .. tostring(err))
	end
end
local Data = require(RS.P9Data)
local CarPhysics = require(RS.CarPhysics)
local Bank = require(RS.P9SoundBank)
check(Data.money(0) == "$0" and Data.money(1250) == "$1,250" and Data.money(3400000) == "$3,400,000"
	and Data.money(999) == "$999", "money: " .. Data.money(1250) .. " " .. Data.money(3400000))
check(select(2, Data.rankOf(0)) == "Cadet" and select(2, Data.rankOf(50)) == "Officer" and Data.rankOf(99999) == 8,
	"ranks")
for _, n in { "Wail", "Yelp", "Engine", "Taser", "Cuffs", "Radio", "Cash", "Crash", "Wanted", "Release", "Promotion",
	"Error", "Booked", "Door", "Horn", "Chirp" } do
	check(Bank.Regions[n] ~= nil, "sound " .. n)
end

-- 2. road network
local nodes, edges = Data.roadGraph()
local nNodes, nEdges = 0, 0
for k, list in edges do
	nNodes += 1
	nEdges += #list
	for _, other in list do
		local back = false
		for _, k2 in edges[other] do
			if k2 == k then
				back = true
			end
		end
		check(back, "edge both ways " .. k .. " - " .. other)
		local a, b = nodes[k], nodes[other]
		check(a.X == b.X or a.Z == b.Z, "roads are straight " .. k .. " - " .. other)
	end
end
check(nNodes == 33, "33 road nodes: " .. nNodes)
log("road nodes", nNodes, "links", nEdges / 2)

-- 3. car math
do
	local spec = Data.CARS.Cruiser
	local st = CarPhysics.newState(0)
	local tTo60 = nil
	for i = 1, 600 do
		CarPhysics.step(st, spec, 1, 0, 1 / 60)
		if not tTo60 and st.speed >= 60 then
			tTo60 = i / 60
		end
	end
	check(st.speed > spec.maxSpeed * 0.95 and st.speed <= spec.maxSpeed, "reaches top speed: " .. st.speed)
	check(tTo60 and tTo60 > 1.2 and tTo60 < 4, "0-60 studs/s in 1.2-4 s: " .. tostring(tTo60))
	local v = CarPhysics.step(st, spec, 1, 0, 1 / 60)
	check(v.Z < -100 and math.abs(v.X) < 0.01, "yaw 0 drives toward -Z")
	local stopIn = 0
	while st.speed > 0 and stopIn < 600 do
		CarPhysics.step(st, spec, -1, 0, 1 / 60)
		stopIn += 1
	end
	check(stopIn / 60 < 2.2, "brakes from top speed in < 2.2 s: " .. stopIn / 60)
	for _ = 1, 60 do
		CarPhysics.step(st, spec, -1, 0, 1 / 60)
	end
	check(st.speed < 0 and st.speed >= -spec.reverse, "reverses: " .. st.speed)
	-- steering right turns right
	local s2 = CarPhysics.newState(0)
	s2.speed = 50
	for _ = 1, 30 do
		CarPhysics.step(s2, spec, 0.3, 1, 1 / 60)
	end
	check(CarPhysics.forward(s2.yaw).X > 0.1, "steer right turns toward +X: " .. tostring(CarPhysics.forward(s2.yaw)))
	-- no turning in place
	local s3 = CarPhysics.newState(1)
	CarPhysics.step(s3, spec, 0, 1, 1 / 60)
	check(s3.yaw == 1, "no turning when stopped")
	-- a wall: actual velocity 0 stops you
	local s4 = CarPhysics.newState(0)
	s4.speed = 90
	CarPhysics.step(s4, spec, 1, 0, 1 / 60, Vector3.zero)
	check(s4.speed < 12, "hitting a wall kills your speed: " .. s4.speed)
	check(math.abs(CarPhysics.yawOf(CFrame.Angles(0, 0.7, 0)) - 0.7) < 1e-6, "yawOf")
	-- autopilot steers toward a target on the right
	local s5 = CarPhysics.newState(0)
	local th, sr = CarPhysics.autopilot(s5, Vector3.zero, Vector3.new(30, 0, -30), 40)
	check(sr > 0.5 and th > 0, "autopilot: target ahead-right -> steer right, throttle: " .. th .. " " .. sr)
end

-- 4. game setup
local G = require(SSS.P9Game)
local Profile = require(SSS.P9Profile)
local notes, fxLog, knocks = {}, {}, 0
G.notify = function(p, text, sound)
	table.insert(notes, (p and p.Name or "?") .. ": " .. text .. " [" .. tostring(sound) .. "]")
end
G.fx = function(kind)
	fxLog[kind] = (fxLog[kind] or 0) + 1
end
G.knock = function()
	knocks += 1
end
local function lastNote()
	return notes[#notes] or ""
end
G.init()

local carCount, byKind = 0, {}
for model, rec in G.cars do
	carCount += 1
	byKind[rec.kind] = (byKind[rec.kind] or 0) + 1
	check(rec.drive and rec.upright and rec.seat, "car has drive, upright, seat")
	check(math.abs(rec.chassis.Position.Y - 1.3) < 0.05, "car rests on the ground: " .. rec.chassis.Position.Y)
	check(rec.drive.MaxAxesForce.Y == 0 and rec.drive.MaxAxesForce.X > 1000, "drive is horizontal only")
	check(model:GetAttribute("Health") == rec.spec.health, "health attribute")
end
log("parked cars:", carCount, HttpService:JSONEncode(byKind))
check(carCount >= 20, "town has parked cars: " .. carCount)
local signs = 0
for _, d in workspace.World:GetDescendants() do
	if d:IsA("SurfaceGui") then
		signs += 1
	end
end
check(signs >= 8, "signs got lettering: " .. signs)

-- 5. AI drivers stay on the roads (simulated: no physics in sessions)
local function distToRoad(p: Vector3): number
	local best = math.huge
	for k, list in edges do
		for _, k2 in list do
			local a, b = nodes[k], nodes[k2]
			local ab = b - a
			local tt = math.clamp((p - a):Dot(ab) / ab:Dot(ab), 0, 1)
			local d = (Vector3.new(p.X, 0, p.Z) - (a + ab * tt)).Magnitude
			if d < best then
				best = d
			end
		end
	end
	return best
end
for _, mode in { "cruise", "flee" } do
	local spec = Data.CARS.Sedan
	local ai = { mode = mode, from = "0,0", to = "180,0" }
	ai.after = G.aiChoose(ai, "180,0", "0,0", nil)
	local pos = Vector3.new(20, 0, 0)
	local st = CarPhysics.newState(CarPhysics.yawOf(CFrame.lookAt(pos, Vector3.new(180, 0, 0))))
	local worst, visited, cop = 0, 0, nil
	if mode == "flee" then
		cop = { pos = Vector3.new(-100, 0, 0), lights = true }
	end
	local lastTo = ai.to
	for _ = 1, 30 * 90 do
		local aim, cap = G.aiAim(ai, pos, cop)
		if ai.to ~= lastTo then
			visited += 1
			lastTo = ai.to
		end
		local want = math.min(if mode == "flee" then spec.maxSpeed * 0.9 else 42, cap)
		local th, sr = CarPhysics.autopilot(st, pos, aim, want)
		local vel = CarPhysics.step(st, spec, th, sr, 1 / 30)
		pos += vel / 30
		if cop then
			cop.pos += ((pos - cop.pos).Unit * 60) / 30 -- a slower cop chasing
		end
		worst = math.max(worst, distToRoad(pos))
	end
	log(mode, "AI drove 90 s: junctions", visited, "worst distance from a road centre", math.floor(worst * 10) / 10)
	check(visited >= 8, mode .. ": AI keeps driving junction to junction: " .. visited)
	check(worst < 19, mode .. ": AI stays on the road (road half-width 15, highway 26): " .. worst)
end

-- stand-in players
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
local function moveTo(p, pos: Vector3)
	p.Character.HumanoidRootPart.CFrame = CFrame.new(pos)
end
local function cash(p)
	return Profile.data[p].cash
end

local alice, bob = fake(101, "Alice"), fake(102, "Bob")
G.addPlayer(alice)
G.addPlayer(bob)
check(G.setTeam(alice, "Police") and alice.attrs.Team == "Police", "alice joins the police")
check(G.setTeam(bob, "Criminal") and bob.attrs.Team == "Criminal", "bob turns to crime")
check(not G.setTeam(bob, "Mayor"), "no such team")
local PA, PB = G.players[alice], G.players[bob]
check((G.spawnCFrame(alice).Position - Data.STATION).Magnitude < 40, "cops spawn at the station")
check((G.spawnCFrame(bob).Position - Vector3.new(255, 1, -260)).Magnitude < 12, "criminals spawn at the scrapyard")

-- police car from the lot
local cruiser = G.spawnPoliceCar(alice, "Cruiser")
check(cruiser ~= nil and cruiser.spec.police and PA.policeCar == cruiser, "alice gets a cruiser")
check(G.spawnPoliceCar(bob, "Cruiser") == nil, "criminals can't spawn police cars")
check(G.spawnPoliceCar(alice, "Interceptor") == nil and lastNote():find("unlocks"), "SUV is locked for a cadet")
local second = G.spawnPoliceCar(alice, "Cruiser")
check(second ~= nil and not cruiser.model.Parent, "a new cruiser replaces your old one")
cruiser = second
check((cruiser.chassis.Position - Vector3.new(-98, 0, -63)).Magnitude < 80, "cruiser is in the station lot")

-- driving, lights and sirens (as if seated)
PA.driving = cruiser.model
G.toggleCar(alice, "Lights")
check(cruiser.model:GetAttribute("Lights") == true and fxLog.chirp == 1, "lights on (with a chirp)")
G.toggleCar(alice, "Siren")
check(cruiser.model:GetAttribute("Siren") == "Wail", "siren: wail")
G.toggleCar(alice, "Siren")
check(cruiser.model:GetAttribute("Siren") == "Yelp", "siren: yelp")
G.toggleCar(alice, "Siren")
check(cruiser.model:GetAttribute("Siren") == "", "siren off")
G.toggleCar(alice, "Horn")
check(fxLog.horn == 1, "horn")
local cops = G.cops()
check(#cops == 1 and cops[1].lights == true, "cops list sees alice with lights on")
G.toggleCar(alice, "Lights")
PA.driving = nil

-- civilian car: bob steals it (seat may refuse a stand-in humanoid; theft is recorded either way)
local civ
for _, rec in G.cars do
	if not rec.spec.police then
		civ = rec
		break
	end
end
moveTo(bob, civ.chassis.Position + Vector3.new(-5, 2, 0))
local ok = G.enterCar(bob, civ.model, "drive")
log("enterCar (stand-in humanoid) ->", ok)
check(PB.wanted == 1 and bob.attrs.Wanted == 1 and civ.owner == bob, "stealing a car: 1 star")
moveTo(bob, cruiser.chassis.Position + Vector3.new(-5, 2, 0))
check(not G.enterCar(bob, cruiser.model, "drive") and lastNote():find("Only police"), "criminals can't drive cruisers")

-- 6. a suspect on foot
moveTo(alice, Vector3.new(-98, 3, -100))
local S = G.spawnFootSuspect(Vector3.new(90, 0, 129), 1, nil)
check(S ~= nil and S.state == "loiter" and S.call and S.call.kind == "Suspicious person", "a suspicious person is reported")
G.publishCalls()
local calls = HttpService:JSONDecode(workspace:GetAttribute("Calls"))
check(#calls >= 1 and calls[1].kind ~= nil, "dispatch publishes calls: " .. workspace:GetAttribute("Calls"))
local t0 = os.clock()
G.stepSuspect(S, t0)
check(S.state == "loiter", "suspect loiters while no cop is near")
moveTo(alice, S.hrp.Position + Vector3.new(0, 0, 30))
G.stepSuspect(S, t0 + 1)
check(S.state == "flee" and S.hum.WalkSpeed == Data.SUSPECTS.footSpeed and S.stars == 2, "suspect runs from a cop")
-- taser: aimed roughly at them
PA.lastTaser = -100
local aim = (S.hrp.Position - alice.Character.HumanoidRootPart.Position)
check(G.taser(alice, aim), "taser fires")
check(S.state == "stunned" and S.hum.PlatformStand, "suspect tased")
PA.lastTaser = -100
G.taser(alice, -aim) -- wrong way: misses
check(fxLog.taser == 2, "taser fx both times")
-- out of range for cuffs
check(not G.arrest(alice, S.model), "too far to cuff")
moveTo(alice, S.hrp.Position + Vector3.new(0, 0, 5))
local before = cash(alice)
check(G.arrest(alice, S.model), "cuffed")
check(S.state == "cuffed" and S.by == alice and cash(alice) == before + Data.PAY.arrest.cash, "arrest pays")
check(not G.arrest(alice, S.model), "can't cuff twice")
-- walk them to booking
S.model:PivotTo(CFrame.new(Data.BOOKING + Vector3.new(0, 3, 0)))
moveTo(alice, Data.BOOKING + Vector3.new(4, 3, 0))
before = cash(alice)
G.stepSuspect(S, os.clock())
check(G.suspects[S.model] == nil and not S.model.Parent, "suspect booked and gone")
check(cash(alice) == before + Data.PAY.booking.cash and Profile.data[alice].bookings == 1, "booking pays")
check(alice.attrs.Rank == "Officer", "alice made Officer: " .. tostring(alice.attrs.Rank) .. " xp " .. Profile.data[alice].xp)
check(G.calls[S.call.id] == nil, "call closed")

-- 7. a getaway car
moveTo(alice, Vector3.new(-98, 3, -100))
local getaway
for _ = 1, 5 do
	getaway = G.spawnGetaway()
	if getaway then
		break
	end
end
check(getaway ~= nil and getaway.ai and getaway.call and getaway.call.kind == "Stolen vehicle", "stolen car reported")
if getaway then
	check(math.abs(getaway.chassis.Position.Y - 1.3) < 0.1, "getaway car on the road surface: " .. getaway.chassis.Position.Y)
	local t = os.clock()
	G.stepAiCar(getaway, t, 1 / 30)
	check(getaway.ai.mode == "cruise", "cruising while no cop is near")
	check(getaway.drive.VectorVelocity.Magnitude > 0, "AI drives")
	-- a cop with lights on rolls up
	moveTo(alice, getaway.chassis.Position + Vector3.new(0, 0, 60))
	PA.driving = cruiser.model
	cruiser.model:SetAttribute("Lights", true)
	G.stepAiCar(getaway, t + 0.1, 1 / 30)
	check(getaway.ai.mode == "flee" and getaway.call.kind == "Vehicle pursuit", "it flees from the lights")
	PA.driving = nil
	-- wrecked: driver bails and runs
	before = cash(alice)
	local call = getaway.call
	G.damageCar(getaway, 1000)
	check(getaway.model:GetAttribute("Disabled") and fxLog.wreck == 1, "car wrecked")
	G.stepAiCar(getaway, t + 0.2, 1 / 30)
	check(getaway.ai == nil and cash(alice) == before + Data.PAY.disable.cash, "driver bails, cop paid")
	local runner
	for _, s in G.suspects do
		if s.call == call then
			runner = s
		end
	end
	check(runner ~= nil and runner.state == "flee" and runner.stars == 3 and call.kind == "Driver fled on foot",
		"the driver is running")
	-- the wreck can't be driven
	moveTo(bob, getaway.chassis.Position + Vector3.new(-5, 2, 0))
	check(not G.enterCar(bob, getaway.model, "drive"), "wrecks can't be driven")
	if runner then
		G.despawnSuspect(runner)
	end
end

-- 8. player criminal: tased, arrested, jailed, released
G.leaveCar(bob)
PB.driving = nil
moveTo(bob, Vector3.new(100, 3, 120))
moveTo(alice, Vector3.new(100, 3, 140))
PB.wanted = 3
bob.attrs.Wanted = 3
PA.lastTaser = -100
check(G.taser(alice, Vector3.new(0, 0, -1)), "taser at bob")
check(PB.stunnedUntil > os.clock() and knocks == 1, "bob is tased")
moveTo(alice, Vector3.new(100, 3, 126))
before = cash(alice)
check(G.arrest(alice, bob.Character), "bob arrested")
check(PB.jailUntil > os.clock() and PB.wanted == 0 and bob.attrs.Wanted == 0 and PB.cell ~= nil, "bob in jail")
check(cash(alice) == before + Data.PAY.arrestPlayer.cash * 3, "arrest pay per star")
check((bob.Character.HumanoidRootPart.Position - PB.cell.Position).Magnitude < 6, "bob is in a cell")
check(not G.setTeam(bob, "Police"), "no switching teams from jail")
check((G.spawnCFrame(bob).Position - PB.cell.Position).Magnitude < 6, "respawn in jail")
PB.jailUntil = os.clock() - 1
G.second()
local freed = false
for _, n in notes do
	if n:find("Bob: You're free") then
		freed = true
	end
end
check(PB.jailUntil == 0 and bob.attrs.JailUntil == 0 and freed, "released: " .. tostring(PB.jailUntil) .. " "
	.. tostring(bob.attrs.JailUntil) .. " " .. tostring(freed))

-- 9. wanted levels rise in a chase and fade when unseen
PB.wanted = 1
PB.lastSeen = os.clock()
PB.chased = Data.WANTED.evadeEvery - 1
moveTo(bob, Vector3.new(0, 3, 0))
moveTo(alice, Vector3.new(0, 3, 40))
G.second()
check(PB.wanted == 2, "a minute of pursuit adds a star: " .. PB.wanted)
moveTo(alice, Vector3.new(-400, 3, -400))
PB.lastSeen = os.clock() - Data.WANTED.decayEvery - 1
G.second()
check(PB.wanted == 1, "laying low drops a star: " .. PB.wanted)
local bobCash = cash(bob)
PB.lastEvadePay = -100
G.second()
check(cash(bob) > bobCash, "staying wanted pays")

-- impacts: a crash hurts, braking doesn't; ramming a cruiser adds a star
do
	civ.driver = bob
	civ.model:PivotTo(cruiser.chassis.CFrame * CFrame.new(8, 0, 0))
	local h0 = civ.health
	civ.lastVel = Vector3.new(0, 0, -80)
	civ.hitAt, civ.ramAt = 0, 0
	G.checkImpact(civ, os.clock())
	check(civ.health < h0 and (fxLog.crash or 0) >= 1, "a crash damages the car: " .. civ.health)
	check(PB.wanted == 2, "ramming a cruiser adds a star: " .. PB.wanted)
	local h1 = civ.health
	civ.lastVel = Vector3.new(0, 0, -4)
	civ.hitAt = 0
	G.checkImpact(civ, os.clock() + 1)
	check(civ.health == h1, "gentle speed changes don't hurt")
	civ.driver = nil
end

-- 10. the town fills itself
for _ = 1, 3 do
	G.nextFoot, G.nextCar = 0, 0
	G.second()
end
local foot, inCars = 0, 0
for _, s in G.suspects do
	if s.state ~= "cuffed" then
		foot += 1
	end
end
for _, rec in G.cars do
	if rec.ai then
		inCars += 1
	end
end
check(foot >= 1 and inCars >= 1, "suspects keep spawning: foot " .. foot .. " cars " .. inCars)
for _ = 1, 20 do
	G.step(1 / 30)
end
G.removePlayer(alice)
check(not cruiser.model.Parent, "leaving returns your cruiser")

log("notes:", #notes, "| last:", lastNote())
local kinds = {}
for name, n in fxLog do
	table.insert(kinds, name .. "=" .. n)
end
table.sort(kinds)
log("fx:", table.concat(kinds, " "))
log(if fails == 0 then "ALL PRECINCT 9 TESTS PASSED" else ("FAILURES: " .. fails))
return table.concat(out, "\n")
