-- P9Data: Precinct 9 settings shared by the server and clients: teams, ranks, pay, cars, wanted levels,
-- suspects, the town's road network.

local Data = {}

Data.TEAMS = {
	Police = { name = "Police", color = Color3.fromRGB(40, 90, 220) },
	Criminal = { name = "Criminal", color = Color3.fromRGB(240, 130, 30) },
}

-- ranks by experience points
Data.RANKS = {
	{ name = "Cadet", xp = 0 },
	{ name = "Officer", xp = 50 },
	{ name = "Senior Officer", xp = 200 },
	{ name = "Corporal", xp = 500 },
	{ name = "Sergeant", xp = 1100 },
	{ name = "Lieutenant", xp = 2200 },
	{ name = "Captain", xp = 4500 },
	{ name = "Chief", xp = 9000 },
}
function Data.rankOf(xp: number): (number, string)
	local idx = 1
	for i, r in Data.RANKS do
		if xp >= r.xp then
			idx = i
		end
	end
	return idx, Data.RANKS[idx].name
end

-- pay and experience
Data.PAY = {
	arrest = { cash = 150, xp = 25 }, -- cuffing an AI suspect
	booking = { cash = 200, xp = 30 }, -- bringing them to the booking garage
	arrestPlayer = { cash = 120, xp = 30 }, -- per wanted star of a player criminal
	disable = { cash = 60, xp = 10 }, -- stopping a getaway car
	evadePerStar = 15, -- criminals: every 30 s while wanted
}

-- cars: speeds in studs/second (about 1 stud = 0.28 m: 105 studs/s is ~105 km/h)
Data.CARS = {
	Cruiser = { name = "Police Cruiser", police = true, maxSpeed = 108, accel = 34, brake = 75, turn = 1.55, reverse = 32,
		health = 100 },
	Interceptor = { name = "Police SUV", police = true, maxSpeed = 116, accel = 38, brake = 78, turn = 1.45, reverse = 32,
		health = 130, rank = 4 },
	Sedan = { name = "Sedan", maxSpeed = 92, accel = 28, brake = 65, turn = 1.5, reverse = 28, health = 70 },
	Hatchback = { name = "Hatchback", maxSpeed = 86, accel = 30, brake = 65, turn = 1.7, reverse = 28, health = 60 },
	Pickup = { name = "Pickup Truck", maxSpeed = 90, accel = 26, brake = 60, turn = 1.35, reverse = 26, health = 90 },
	Sports = { name = "Sports Car", maxSpeed = 124, accel = 44, brake = 85, turn = 1.65, reverse = 30, health = 60 },
}
Data.CIVILIAN_CARS = { "Sedan", "Sedan", "Hatchback", "Hatchback", "Pickup", "Sports" }

-- wanted levels
Data.WANTED = {
	max = 5,
	stealCar = 1, -- stealing a car
	ramCop = 1, -- ramming a police car
	evadeEvery = 60, -- +1 star for every minute of being chased
	decayEvery = 90, -- -1 star for every 90 s with no cop within 150 studs
	jailPerStar = 25, -- seconds in jail per star
}

-- AI suspects
Data.SUSPECTS = {
	maxOnFoot = 4,
	maxInCars = 2,
	footSpeed = 17,
	copSpeed = 20,
	spotRange = 45, -- a suspect panics when a cop gets this close
	carSpotRange = 90,
	disabledAfter = 4, -- seconds stuck before a getaway car is "disabled"
	respawn = { 25, 45 },
}

-- police gear
Data.TASER = { range = 32, cone = 0.65, cooldown = 4, stun = 5 }
Data.ARREST = { range = 9, hold = 1 }

-- the town: road centre lines and the highway ring
Data.GRID = { -360, -180, 0, 180, 360 }
Data.HWY = 560
Data.STATION = Vector3.new(-98, 0, -100)
Data.BOOKING = Vector3.new(-36, 0, -132)

-- road network for AI drivers: every grid intersection, plus the highway corners and connectors
function Data.roadGraph()
	local nodes, edges = {}, {}
	local function id(x: number, z: number): string
		return x .. "," .. z
	end
	local function addNode(x: number, z: number)
		local k = id(x, z)
		if not nodes[k] then
			nodes[k] = Vector3.new(x, 0, z)
			edges[k] = {}
		end
		return k
	end
	local function link(a: string, b: string)
		table.insert(edges[a], b)
		table.insert(edges[b], a)
	end
	local G = Data.GRID
	for i, x in G do
		for j, z in G do
			addNode(x, z)
			if i > 1 then
				link(id(G[i - 1], z), id(x, z))
			end
			if j > 1 then
				link(id(x, G[j - 1]), id(x, z))
			end
		end
	end
	local H = Data.HWY
	for _, c in { { -H, -H }, { H, -H }, { H, H }, { -H, H } } do
		addNode(c[1], c[2])
	end
	-- connectors from the main roads to the highway, and the ring itself
	for _, p in { { 0, -H }, { 0, H }, { -H, 0 }, { H, 0 } } do
		addNode(p[1], p[2])
	end
	link(id(0, -360), id(0, -H))
	link(id(0, 360), id(0, H))
	link(id(-360, 0), id(-H, 0))
	link(id(360, 0), id(H, 0))
	link(id(-H, -H), id(0, -H))
	link(id(0, -H), id(H, -H))
	link(id(H, -H), id(H, 0))
	link(id(H, 0), id(H, H))
	link(id(H, H), id(0, H))
	link(id(0, H), id(-H, H))
	link(id(-H, H), id(-H, 0))
	link(id(-H, 0), id(-H, -H))
	return nodes, edges
end

function Data.money(n: number): string
	local s = tostring(math.floor(n))
	local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	if out:sub(1, 1) == "," then
		out = out:sub(2)
	end
	return "$" .. out
end

return Data
