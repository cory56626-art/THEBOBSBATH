-- Play-session diagnostics, so problems can be investigated without being there:
--   * every client reports its script errors/warnings and a status line from its animation system
--   * the server adds its own errors/warnings and the skinwalker's state
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

-- the creature's state every 20 s
task.spawn(function()
	while true do
		task.wait(20)
		local sw = workspace:FindFirstChild("Skinwalker")
		if sw and #Players:GetPlayers() > 0 then
			local root = (sw :: Model).PrimaryPart
			add("creature", ("state=%s hunger=%s note=%s pos=%s"):format(tostring(sw:GetAttribute("State")),
				tostring(sw:GetAttribute("Hunger")), tostring(sw:GetAttribute("Note")),
				root and tostring(Vector3.new(math.floor(root.Position.X), math.floor(root.Position.Y),
					math.floor(root.Position.Z))) or "?"))
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
