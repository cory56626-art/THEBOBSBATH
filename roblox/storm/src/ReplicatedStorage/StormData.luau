-- StormData: every kind of storm, rarities, the zones they live in, chasers and the upgrade economy.
-- Shared by the server (rules) and clients (labels, shop).

local Data = {}

Data.RARITIES = {
	-- chasers: how many storm spirits chase you; chaserSpeed: their cruise speed (they also dash)
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

Data.MUTATIONS = {
	Golden = { name = "Golden", mult = 2, chance = 0.06, color = Color3.fromRGB(255, 205, 60) },
}

-- the wild, from the bases (south) to the far north; weights per rarity (Common..Mythic)
Data.FIELD_X = { -170, 170 }
Data.ZONES = {
	{ name = "Drizzle Meadow", zMin = 22, zMax = 118, count = 8, weights = { 70, 28, 2, 0, 0, 0 } },
	{ name = "Thunder Plains", zMin = 128, zMax = 222, count = 6, weights = { 22, 44, 27, 7, 0, 0 } },
	{ name = "Eye of the Storm", zMin = 236, zMax = 320, count = 4, weights = { 0, 12, 40, 32, 14, 2 } },
}
Data.WILD_LIFETIME = { 100, 170 } -- seconds before an uncaught storm drifts away

Data.BASE_SLOTS = 10
Data.LOCK_TIME = 45
Data.LOCK_COOLDOWN = 45
Data.SELL_SECONDS = 40 -- selling pays this many seconds of the storm's income
Data.OFFLINE_RATE = 0.25 -- share of income earned while offline
Data.OFFLINE_CAP = 2 * 3600

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

function Data.income(kind: string, mutation: string?): number
	local k = Data.KINDS[kind]
	if not k then
		return 0
	end
	local m = mutation and Data.MUTATIONS[mutation]
	return k.income * (if m then m.mult else 1)
end

-- "$1.25K", "$3.4M" ...
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

return Data
