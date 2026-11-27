-- P9Data: Precinct 9 settings shared by the server and clients: teams, ranks, pay, cars, wanted levels,
-- suspects, guns, robberies, jobs, missions, departments, the town's road network.

local Data = {}

Data.TEAMS = {
	Police = { name = "Police", color = Color3.fromRGB(40, 90, 220) },
	Civilian = { name = "Civilian", color = Color3.fromRGB(70, 190, 110) },
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
	evadePerStar = 10, -- wanted civilians: every 30 s while wanted
	ticket = { cash = 90, xp = 15 }, -- a correct ticket
	warning = { cash = 20, xp = 8 },
	robberyStop = { cash = 250, xp = 40 }, -- downing or cuffing an armed robber
	badStop = 40, -- fine for ticketing someone with no violation
	reckless = 50, -- fine for a cop who runs over an innocent person
}

-- cars: speeds in studs/second (about 1 stud = 0.28 m: 105 studs/s is ~105 km/h)
Data.CARS = {
	Cruiser = { name = "Police Cruiser", police = true, maxSpeed = 108, accel = 34, brake = 75, turn = 1.55, reverse = 32,
		health = 100 },
	Interceptor = { name = "Police SUV", police = true, maxSpeed = 116, accel = 38, brake = 78, turn = 1.45, reverse = 32,
		health = 130, rank = 4 },
	SwatVan = { name = "SWAT Van", police = true, maxSpeed = 98, accel = 30, brake = 70, turn = 1.3, reverse = 28,
		health = 220, rank = 5, dept = "SWAT" },
	Sedan = { name = "Sedan", maxSpeed = 92, accel = 28, brake = 65, turn = 1.5, reverse = 28, health = 70, price = 1200 },
	Hatchback = { name = "Hatchback", maxSpeed = 86, accel = 30, brake = 65, turn = 1.7, reverse = 28, health = 60, price = 400 },
	Pickup = { name = "Pickup Truck", maxSpeed = 90, accel = 26, brake = 60, turn = 1.35, reverse = 26, health = 90, price = 2500 },
	Sports = { name = "Sports Car", maxSpeed = 124, accel = 44, brake = 85, turn = 1.65, reverse = 30, health = 60, price = 7500 },
	Taxi = { name = "Taxi", maxSpeed = 94, accel = 30, brake = 66, turn = 1.5, reverse = 28, health = 80 },
}
Data.SHOP_ORDER = { "Hatchback", "Sedan", "Pickup", "Sports" }
Data.POLICE_CARS = { "Cruiser", "Interceptor", "SwatVan" }
Data.CIVILIAN_CARS = { "Sedan", "Sedan", "Hatchback", "Hatchback", "Pickup", "Sports" }

-- wanted levels
Data.WANTED = {
	max = 5,
	stealCar = 1, -- stealing a car
	ramCop = 1, -- ramming a police car
	reckless = 1, -- running someone over
	assault = 2, -- shooting or running over a person / an officer
	evadeEvery = 60, -- +1 star for every minute of being chased
	decayEvery = 45, -- -1 star for every 45 s with no cop within 150 studs
	jailPerStar = 25, -- seconds in jail per star
	jailbreak = 3,
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
	pedestrians = 12,
	traffic = 7,
}

-- police gear
Data.TASER = { range = 32, cone = 0.65, cooldown = 4, stun = 5 }
Data.ARREST = { range = 9, hold = 1 }

-- guns (no blood: hits show sparks only). Damage per shot; rate = seconds between shots
Data.GUNS = {
	Pistol = { name = "Pistol", damage = 20, rate = 0.32, range = 170, mag = 12, reload = 1.6, price = 750 },
	Rifle = { name = "Rifle", damage = 26, rate = 0.14, range = 230, mag = 30, reload = 2.2, dept = "SWAT" },
}
Data.AIM_CONE = 0.94 -- auto-aim: targets within ~20 degrees of where you aim

-- AI police
Data.AI_COPS = { total = 4, min = 1, footSpeed = 21, taserRange = 24, giveUpAfter = 15, giveUpDistance = 450,
	shootAtStars = 4, shotDamage = 10 }

-- places that can be robbed (the spot is just outside the front door)
Data.ROBBERIES = {
	{ id = "bank", name = "Northfield Bank", pos = Vector3.new(90, 0, -83), time = 12, loot = { 900, 1400 }, stars = 3, cooldown = 300 },
	{ id = "gas", name = "Fuel & Go", pos = Vector3.new(130, 0, 95.5), time = 6, loot = { 160, 260 }, stars = 2, cooldown = 180 },
	{ id = "diner", name = "Starlight Diner", pos = Vector3.new(270, 0, -103), time = 6, loot = { 140, 220 }, stars = 2, cooldown = 180 },
	{ id = "grocer", name = "Grocer", pos = Vector3.new(228, 0, 110), time = 5, loot = { 120, 200 }, stars = 2, cooldown = 180 },
	{ id = "phone", name = "Phone Shop", pos = Vector3.new(270, 0, 110), time = 7, loot = { 220, 340 }, stars = 2, cooldown = 200 },
}
Data.HIDEOUT = Vector3.new(270, 0, -270) -- stash your loot at Joe's Scrap
Data.GUN_STORE = Vector3.new(55, 0, 129)
Data.DEALERSHIP = Vector3.new(-300, 0, -125)
Data.CIV_SPAWN = Vector3.new(-270, 0, 62)
Data.JAIL_BREACH = Vector3.new(-163, 0, -134) -- outside the jail's back wall
Data.JAIL_EXIT = Vector3.new(-170, 0, -134)

-- civilian jobs
Data.JOBS = {
	Pizza = { name = "Pizza Delivery", start = Vector3.new(312, 0, 110), car = "Hatchback", time = 75, pay = { 60, 1.2 } },
	Taxi = { name = "Taxi Driver", start = Vector3.new(210, 0, 84), car = "Taxi", pay = { 40, 0.22 } },
}

-- speed limits (mph: studs/s x 0.62)
Data.MPH = 0.62
Data.TOWN_LIMIT = 45
Data.HIGHWAY_LIMIT = 70
function Data.speedLimit(pos: Vector3): number
	return if math.max(math.abs(pos.X), math.abs(pos.Z)) > 470 then Data.HIGHWAY_LIMIT else Data.TOWN_LIMIT
end

-- police departments
Data.DEPTS = {
	Patrol = { name = "Patrol", rank = 1, desc = "+20% pay for arrests and bookings" },
	Traffic = { name = "Traffic", rank = 2, desc = "+50% ticket pay, longer radar" },
	SWAT = { name = "SWAT", rank = 5, desc = "Rifle, SWAT van, +50% robbery pay" },
}
Data.DEPT_ORDER = { "Patrol", "Traffic", "SWAT" }

-- daily missions (3 a day per team, the same for everyone that day)
Data.MISSIONS = {
	Police = {
		{ id = "book", text = "Book %d suspects", goal = 3, cash = 400, xp = 60 },
		{ id = "ticket", text = "Write %d traffic tickets", goal = 2, cash = 300, xp = 40 },
		{ id = "disable", text = "Stop %d getaway cars", goal = 2, cash = 350, xp = 50 },
		{ id = "robbery", text = "Stop %d robbery", goal = 1, cash = 400, xp = 60 },
		{ id = "patrol", text = "Patrol %d miles", goal = 3, cash = 250, xp = 40 },
		{ id = "cuff", text = "Cuff %d suspects", goal = 4, cash = 300, xp = 50 },
	},
	Civilian = {
		{ id = "pizza", text = "Deliver %d pizzas", goal = 5, cash = 350, xp = 0 },
		{ id = "taxi", text = "Complete %d taxi fares", goal = 3, cash = 350, xp = 0 },
		{ id = "rob", text = "Pull off %d robbery", goal = 1, cash = 300, xp = 0 },
		{ id = "escape", text = "Escape the police %d times", goal = 2, cash = 300, xp = 0 },
		{ id = "drive", text = "Drive %d miles", goal = 4, cash = 200, xp = 0 },
		{ id = "earn", text = "Earn $%d from jobs", goal = 1000, cash = 400, xp = 0 },
	},
}
function Data.missionsFor(team: string, day: number): { any }
	local pool = Data.MISSIONS[team]
	if not pool then
		return {}
	end
	local rng = Random.new(day * 7 + (if team == "Police" then 1 else 2))
	local idx = {}
	for i = 1, #pool do
		idx[i] = i
	end
	for i = #idx, 2, -1 do
		local j = rng:NextInteger(1, i)
		idx[i], idx[j] = idx[j], idx[i]
	end
	return { pool[idx[1]], pool[idx[2]], pool[idx[3]] }
end
function Data.dayNumber(unix: number): number
	return math.floor(unix / 86400)
end

local FIRST = { "Alex", "Jordan", "Sam", "Riley", "Casey", "Morgan", "Taylor", "Jamie", "Drew", "Quinn", "Avery", "Parker",
	"Rowan", "Hayden", "Blake", "Reese" }
local LAST = { "Miller", "Garcia", "Chen", "Okafor", "Novak", "Silva", "Brooks", "Patel", "Kowalski", "Reyes", "Hughes",
	"Larsen", "Moreau", "Tanaka", "Byrne", "Walsh" }
function Data.randomName(rng: Random): string
	return FIRST[rng:NextInteger(1, #FIRST)] .. " " .. LAST[rng:NextInteger(1, #LAST)]
end
function Data.randomPlate(rng: Random): string
	local letters = "ABCDEFGHJKLMNPRSTUVWXYZ"
	local function l()
		local i = rng:NextInteger(1, #letters)
		return letters:sub(i, i)
	end
	return ("%s%s%s-%d%d%d"):format(l(), l(), l(), rng:NextInteger(0, 9), rng:NextInteger(0, 9), rng:NextInteger(0, 9))
end

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
