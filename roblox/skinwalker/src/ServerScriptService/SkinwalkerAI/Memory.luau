-- What the skinwalker remembers:
--   * a heat map of where prey has been seen or heard (it learns your habits and routes)
--   * "vanish points" where prey escaped it (it comes back to wait there, like a cat at a mouse hole)
--   * per-prey notes: last seen position/velocity, how often it has seen and lost them
-- The heat map and vanish points can persist across servers through a DataStore (positions only, no player data).

local DataStoreService = game:GetService("DataStoreService")

local CELL = 12
local STORE_KEY = "map_memory_v1"

local Memory = {}
Memory.__index = Memory

export type PreyNote = {
	lastSeenPos: Vector3?,
	lastSeenTime: number,
	lastVel: Vector3,
	seen: number,
	escapes: number,
}

function Memory.new(persist: boolean)
	local self = setmetatable({}, Memory)
	self.heat = {} :: { [string]: number }
	self.vanish = {} :: { { pos: Vector3, w: number } }
	self.prey = {} :: { [string]: PreyNote }
	self.persist = persist
	self.store = nil
	if persist then
		local ok, store = pcall(function()
			return DataStoreService:GetDataStore("SkinwalkerMemory")
		end)
		if ok then
			self.store = store
		end
	end
	return self
end

local function key(pos: Vector3): string
	return math.floor(pos.X / CELL) .. "," .. math.floor(pos.Z / CELL)
end

local function cellCentre(k: string): Vector3
	local x, z = string.match(k, "^(-?%d+),(-?%d+)$")
	return Vector3.new((tonumber(x) :: number + 0.5) * CELL, 0, (tonumber(z) :: number + 0.5) * CELL)
end

function Memory:addHeat(pos: Vector3, w: number)
	local k = key(pos)
	self.heat[k] = math.min((self.heat[k] or 0) + w, 500)
end

-- top N hot cells, as world positions with their weights
function Memory:hotspots(n: number): { { pos: Vector3, w: number } }
	local list = {}
	for k, w in self.heat do
		table.insert(list, { pos = cellCentre(k), w = w })
	end
	for _, v in self.vanish do
		table.insert(list, { pos = v.pos, w = v.w * 3 }) -- escape routes are worth more
	end
	table.sort(list, function(a, b)
		return a.w > b.w
	end)
	local out = {}
	for i = 1, math.min(n, #list) do
		out[i] = list[i]
	end
	return out
end

function Memory:addVanish(pos: Vector3)
	for _, v in self.vanish do
		if (v.pos - pos).Magnitude < CELL * 1.5 then
			v.w += 1
			return
		end
	end
	table.insert(self.vanish, { pos = pos, w = 1 })
	if #self.vanish > 40 then
		table.sort(self.vanish, function(a, b)
			return a.w > b.w
		end)
		table.remove(self.vanish)
	end
end

function Memory:note(id: string): PreyNote
	local n = self.prey[id]
	if not n then
		n = { lastSeenPos = nil, lastSeenTime = -math.huge, lastVel = Vector3.zero, seen = 0, escapes = 0 }
		self.prey[id] = n
	end
	return n
end

function Memory:load()
	if not self.store then
		return
	end
	local ok, data = pcall(function()
		return self.store:GetAsync(STORE_KEY)
	end)
	if ok and type(data) == "table" then
		for _, c in data.heat or {} do
			if type(c) == "table" and #c == 3 then
				self.heat[c[1] .. "," .. c[2]] = c[3]
			end
		end
		for _, v in data.vanish or {} do
			if type(v) == "table" and #v == 3 then
				table.insert(self.vanish, { pos = Vector3.new(v[1], 0, v[2]), w = v[3] })
			end
		end
	end
end

function Memory:save()
	if not self.store then
		return
	end
	local heat = {}
	for k, w in self.heat do
		if w >= 0.5 then
			local x, z = string.match(k, "^(-?%d+),(-?%d+)$")
			table.insert(heat, { tonumber(x), tonumber(z), math.floor(w * 10) / 10 })
		end
	end
	table.sort(heat, function(a, b)
		return a[3] > b[3]
	end)
	while #heat > 600 do
		table.remove(heat)
	end
	local vanish = {}
	for _, v in self.vanish do
		table.insert(vanish, { math.floor(v.pos.X), math.floor(v.pos.Z), v.w })
	end
	pcall(function()
		self.store:SetAsync(STORE_KEY, { heat = heat, vanish = vanish })
	end)
end

-- slowly forget, so old habits fade but strong ones stay
function Memory:decay(factor: number)
	for k, w in self.heat do
		local nw = w * factor
		self.heat[k] = if nw < 0.05 then nil else nw
	end
end

return Memory
