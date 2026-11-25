-- StormData: every kind of storm, rarities, mutations, weather events, the zones storms live in, chasers and
-- the economy (upgrades, rebirths, the free crate, the storm index). Shared by the server and clients.

local Data = {}

Data.RARITIES = {
	-- chasers: how many storm spirits chase you; chaserSpeed: their cruise speed (they also charge and dash)
	{ name = "Common", color = Color3.fromRGB(205, 210, 215), chasers = 1, chaserSpeed = 12, hold = 0.4 },
	{ name = "Uncommon", color = Color3.fromRGB(95, 225, 115), chasers = 1, chaserSpeed = 14.5, hold = 0.5 },
	{ name = "Rare", color = Color3.fromRGB(80, 165, 255), chasers = 2, chaserSpeed = 19, hold = 0.7 },
	{ name = "Epic", color = Color3.fromRGB(190, 95, 255), chasers = 2, chaserSpeed = 24, hold = 0.9 },
	{ name = "Legendary", color = Color3.fromRGB(255, 195, 45), chasers = 3, chaserSpeed = 29, hold = 1.1 },
	{ name = "Mythic", color = Color3.fromRGB(255, 70, 95), chasers = 4, chaserSpeed = 34, hold = 1.4 },
}

-- income is $ per second while the storm sits on a pedestal in your base
Data.KINDS = {
	Drizzle = { name = "Drizzle", rarity = 1, income = 1 },
	Breeze = { name = "Breeze", rarity = 1, income = 2 },
	Sunbeam = { name = "Sunbeam", rarity = 1, income = 3 },
	RainCloud = { name = "Rain Cloud", rarity = 2, income = 8 },
	FogBank = { name = "Fog Bank", rarity = 2, income = 11 },
	SnowFlurry = { name = "Snow Flurry", rarity = 2, income = 15 },
	Thunderstorm = { name = "Thunderstorm", rarity = 3, income = 45 },
	Hailstorm = { name = "Hailstorm", rarity = 3, income = 60 },
	Tornado = { name = "Tornado", rarity = 4, income = 180 },
	Rainbow = { name = "Rainbow", rarity = 4, income = 240 },
	Blizzard = { name = "Blizzard", rarity = 5, income = 750 },
	Aurora = { name = "Aurora", rarity = 5, income = 1000 },
	MeteorShower = { name = "Meteor Shower", rarity = 6, income = 4000 },
}
Data.ORDER = { "Drizzle", "Breeze", "Sunbeam", "RainCloud", "FogBank", "SnowFlurry", "Thunderstorm", "Hailstorm",
	"Tornado", "Rainbow", "Blizzard", "Aurora", "MeteorShower" }

-- mutations multiply income; a storm has at most one and only ever upgrades to a better one.
-- chance: natural chance on a wild spawn (the rest come from weather events)
Data.MUTATIONS = {
	Golden = { name = "Golden", mult = 2, chance = 0.04, color = Color3.fromRGB(255, 205, 60) },
	Frozen = { name = "Frozen", mult = 2.5, chance = 0, color = Color3.fromRGB(170, 225, 255) },
	Charged = { name = "Charged", mult = 3, chance = 0.006, color = Color3.fromRGB(90, 185, 255) },
	Cosmic = { name = "Cosmic", mult = 5, chance = 0, color = Color3.fromRGB(160, 110, 255) },
	Bloodmoon = { name = "Blood Moon", mult = 6, chance = 0, color = Color3.fromRGB(235, 45, 60) },
	Rainbow = { name = "Rainbow", mult = 10, chance = 0.002, color = Color3.fromRGB(255, 120, 210) },
}
Data.MUTATION_ORDER = { "Golden", "Frozen", "Charged", "Cosmic", "Bloodmoon", "Rainbow" }

-- weather events: one every few minutes. spawnChance = chance a new wild storm gets the event's mutation,
-- baseChance = chance (every BASE_MUTATE_EVERY seconds) that a storm sitting in a base gets it
Data.EVENTS = {
	LightningStorm = {
		name = "Lightning Storm",
		mutation = "Charged",
		spawnChance = 0.3,
		baseChance = 0.05,
		desc = "Lightning strikes everywhere! Storms turn CHARGED (x3)",
		color = Color3.fromRGB(110, 170, 255),
	},
	RainbowSky = {
		name = "Rainbow Sky",
		mutation = "Rainbow",
		spawnChance = 0.08,
		baseChance = 0.012,
		desc = "Storms can turn RAINBOW (x10)!",
		color = Color3.fromRGB(255, 140, 220),
	},
	MeteorShower = {
		name = "Meteor Shower",
		mutation = "Cosmic",
		spawnChance = 0,
		baseChance = 0,
		desc = "Meteors are falling! Every crater drops a COSMIC storm (x5)",
		color = Color3.fromRGB(255, 140, 60),
	},
	DeepFreeze = {
		name = "Deep Freeze",
		mutation = "Frozen",
		spawnChance = 0.4,
		baseChance = 0.08,
		desc = "Spirits are frozen slow! Storms turn FROZEN (x2.5)",
		color = Color3.fromRGB(170, 225, 255),
		chaserSpeed = 0.7,
	},
	BloodMoon = {
		name = "Blood Moon",
		mutation = "Bloodmoon",
		spawnChance = 0.2,
		baseChance = 0.03,
		desc = "Rarer storms... and angrier spirits! BLOOD MOON storms (x6)",
		color = Color3.fromRGB(235, 50, 60),
		chaserSpeed = 1.15,
		extraChasers = 1,
		rarityRolls = 2,
	},
	GoldenHour = {
		name = "Golden Hour",
		mutation = "Golden",
		spawnChance = 0.35,
		baseChance = 0.06,
		desc = "DOUBLE income for everyone! Storms turn GOLDEN (x2)",
		color = Color3.fromRGB(255, 205, 60),
		incomeMult = 2,
	},
}
Data.EVENT_ORDER = { "LightningStorm", "RainbowSky", "MeteorShower", "DeepFreeze", "BloodMoon", "GoldenHour" }
Data.EVENT_FIRST = 100 -- seconds after a server starts
Data.EVENT_EVERY = 240 -- from one event start to the next
Data.EVENT_LENGTH = 80
Data.BASE_MUTATE_EVERY = 10

-- the wild, from the bases (south) to the far north; weights per rarity (Common..Mythic)
Data.FIELD_X = { -170, 170 }
Data.ZONES = {
	{ name = "Drizzle Meadow", zMin = 22, zMax = 118, count = 8, weights = { 70, 28, 2, 0, 0, 0 } },
	{ name = "Thunder Plains", zMin = 128, zMax = 222, count = 6, weights = { 22, 44, 27, 7, 0, 0 } },
	{ name = "Eye of the Storm", zMin = 236, zMax = 320, count = 4, weights = { 0, 12, 40, 32, 14, 2 } },
}
Data.WILD_LIFETIME = { 100, 170 } -- seconds before an uncaught storm drifts away

-- lightning strikes at whoever carries a Rare or better storm (seconds between strikes by rarity)
Data.STRIKE = { radius = 7, warn = 1.0, every = { [3] = 4.5, [4] = 3.6, [5] = 2.9, [6] = 2.3 } }
-- storm spirits: they slow down to charge (eyes flare), then dash
Data.SPIRIT = { range = 18, chargeTime = 0.45, chargeSlow = 0.35, dashTime = 0.55, dashMult = 2.0, cooldown = { 2.6, 4.2 } }
-- your own dash
Data.DASH = { cooldown = 2.5, speed = 70, time = 0.22 }

Data.BASE_SLOTS = 10
Data.LOCK_TIME = 45
Data.LOCK_COOLDOWN = 45
Data.SELL_SECONDS = 40 -- selling pays this many seconds of the storm's income
Data.OFFLINE_RATE = 0.25 -- share of income earned while offline
Data.OFFLINE_CAP = 2 * 3600

-- a free crate every few minutes of play (new players start with one)
Data.CRATE = { every = 360, max = 3, weights = { 45, 30, 16, 7, 1.8, 0.2 }, fullPaySeconds = 60 }

-- rebirth: resets cash, Speed and Money (keeps your storms, Carry Power and index)
function Data.rebirthCost(rebirths: number): number
	return math.floor(25000 * 5 ^ rebirths)
end
function Data.rebirthMult(rebirths: number): number
	return 1 + 0.5 * rebirths
end

-- the storm index: every completed rarity row (all its storms found) adds 10% income
Data.INDEX_ROW_BONUS = 0.1
function Data.indexKey(kind: string, mutation: string?): string
	return kind .. "|" .. (mutation or "")
end
function Data.indexRows(index: { [string]: boolean }): number
	local rows = 0
	for r = 1, #Data.RARITIES do
		local complete = true
		for _, id in Data.ORDER do
			if Data.KINDS[id].rarity == r and not index[Data.indexKey(id, "")] then
				complete = false
				break
			end
		end
		if complete then
			rows += 1
		end
	end
	return rows
end
function Data.indexCount(index: { [string]: boolean }): number
	local n = 0
	for _ in index do
		n += 1
	end
	return n
end
Data.INDEX_TOTAL = #Data.ORDER * (1 + #Data.MUTATION_ORDER)

-- upgrades: level 0 is the start
Data.UPGRADES = {
	Speed = {
		name = "Speed",
		max = 20,
		cost = function(level: number): number
			return math.floor(30 * 1.6 ^ level)
		end,
		value = function(level: number): number
			return 16 + 1.5 * level
		end,
	},
	Carry = {
		name = "Carry Power",
		max = 4,
		cost = function(level: number): number
			return ({ 250, 3000, 40000, 600000 })[level + 1] or math.huge
		end,
		-- highest rarity you can lift
		value = function(level: number): number
			return 2 + level
		end,
	},
	Money = {
		name = "Money",
		max = 25,
		cost = function(level: number): number
			return math.floor(80 * 1.7 ^ level)
		end,
		value = function(level: number): number
			return 1 + 0.2 * level
		end,
	},
}

-- walking speed while carrying: heavier storms slow you, extra carry power helps
function Data.carrySpeedMult(rarity: number, carryLevel: number): number
	return math.clamp(1 - 0.07 * rarity + 0.07 * carryLevel, 0.6, 0.95)
end

function Data.mutationMult(mutation: string?): number
	local m = mutation and Data.MUTATIONS[mutation]
	return if m then m.mult else 1
end

function Data.income(kind: string, mutation: string?): number
	local k = Data.KINDS[kind]
	if not k then
		return 0
	end
	return k.income * Data.mutationMult(mutation)
end

function Data.displayName(kind: string, mutation: string?): string
	local k = Data.KINDS[kind]
	local m = mutation and Data.MUTATIONS[mutation]
	return (if m then m.name .. " " else "") .. (if k then k.name else kind)
end

-- "$1.25K", "$3.40M" ...
function Data.money(n: number): string
	local neg = n < 0
	n = math.abs(n)
	local units = { "", "K", "M", "B", "T", "Qd", "Qn" }
	local i = 1
	while n >= 1000 and i < #units do
		n /= 1000
		i += 1
	end
	local s
	if i == 1 then
		s = tostring(math.floor(n))
	elseif n >= 100 then
		s = string.format("%d", math.floor(n))
	elseif n >= 10 then
		s = string.format("%.1f", math.floor(n * 10) / 10)
	else
		s = string.format("%.2f", math.floor(n * 100) / 100)
	end
	return (if neg then "-$" else "$") .. s .. units[i]
end

function Data.pickRarity(weights: { number }, rand: Random?): number
	local total = 0
	for _, w in weights do
		total += w
	end
	local r = (if rand then rand:NextNumber() else math.random()) * total
	for i, w in weights do
		r -= w
		if r <= 0 and w > 0 then
			return i
		end
	end
	return 1
end

function Data.kindsOfRarity(rarity: number): { string }
	local list = {}
	for _, id in Data.ORDER do
		if Data.KINDS[id].rarity == rarity then
			table.insert(list, id)
		end
	end
	return list
end

-- the zone a storm of this rarity normally lives in
function Data.zoneForRarity(rarity: number): number
	return if rarity <= 2 then 1 elseif rarity <= 4 then 2 else 3
end

return Data
