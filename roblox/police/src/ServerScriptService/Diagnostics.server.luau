-- Play-session diagnostics, so problems can be investigated without being there:
--   * every client reports its script errors/warnings and a status line from its animation system
--   * the server adds its own errors/warnings and a summary of the game's state
-- Entries are batched into a DataStore ("Diagnostics", one key per UTC day, newest 400 kept) and can be read
-- back with Open Cloud Luau Execution (tools/read_diag.luau). Only game state is stored: no chat, no personal data.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")
local LogService = game:GetService("LogService")
local RunService = game:GetService("RunService")

local remote = Instance.new("RemoteEvent")
remote.Name = "ClientDiag"
remote.Parent = ReplicatedStorage

local store = nil
pcall(function()
	store = DataStoreService:GetDataStore("Diagnostics")
end)

local pending = {}
local serverId = string.sub(game.JobId ~= "" and game.JobId or "studio", 1, 8)
local function add(src: string, msg: string)
	if #pending > 300 then
		return
	end
	table.insert(pending, { t = os.time(), s = serverId, src = src, m = string.sub(msg, 1, 400) })
end

-- player numbering instead of names
local slot: { [Player]: number } = {}
local nextSlot = 0
local function tag(p: Player): string
	if not slot[p] then
		nextSlot += 1
		slot[p] = nextSlot
	end
	return "client" .. slot[p]
end

local budget: { [Player]: number } = {}
remote.OnServerEvent:Connect(function(player, msg)
	if type(msg) ~= "string" then
		return
	end
	budget[player] = (budget[player] or 0) + 1
	if budget[player] > 40 then
		return -- per-minute cap
	end
	add(tag(player), msg)
end)
task.spawn(function()
	while true do
		task.wait(60)
		table.clear(budget)
	end
end)
Players.PlayerRemoving:Connect(function(p)
	budget[p] = nil
end)

LogService.MessageOut:Connect(function(message, kind)
	if kind == Enum.MessageType.MessageError or kind == Enum.MessageType.MessageWarning then
		add("server", (if kind == Enum.MessageType.MessageError then "ERROR " else "WARN ") .. message)
	end
end)

-- the game's state every 30 s while anyone is playing
task.spawn(function()
	local ok, G = pcall(function()
		return require(script.Parent:WaitForChild("P9Game", 20))
	end)
	while true do
		task.wait(30)
		if #Players:GetPlayers() > 0 and ok and type(G) == "table" then
			local function count(t)
				local n = 0
				for _ in t or {} do
					n += 1
				end
				return n
			end
			local cops, civs, wanted = 0, 0, 0
			for _, P in G.players do
				if P.team == "Police" then
					cops += 1
				elseif P.team == "Civilian" then
					civs += 1
					if P.wanted > 0 then
						wanted += 1
					end
				end
			end
			local kinds = {}
			for _, rec in G.cars do
				local k = if rec.ai then rec.ai.kind or "?" elseif rec.driver then "player" else "parked"
				kinds[k] = (kinds[k] or 0) + 1
			end
			local parts = {}
			for k, n in kinds do
				table.insert(parts, k .. "=" .. n)
			end
			table.sort(parts)
			add("state", ("cops=%d civs=%d wanted=%d units=%d peds=%d suspects=%d calls=%d cars[%s]"):format(cops, civs,
				wanted, count(G.units), count(G.peds), count(G.suspects), count(G.calls), table.concat(parts, " ")))
		end
	end
end)

local function flush()
	if not store or #pending == 0 or RunService:IsStudio() then
		return
	end
	local batch = pending
	pending = {}
	local key = os.date("!%Y%m%d")
	pcall(function()
		store:UpdateAsync(key, function(old)
			local list = if type(old) == "table" then old else {}
			for _, e in batch do
				table.insert(list, e)
			end
			while #list > 400 do
				table.remove(list, 1)
			end
			return list
		end)
	end)
end
task.spawn(function()
	while true do
		task.wait(30)
		flush()
	end
end)
game:BindToClose(flush)
add("server", "server started")
