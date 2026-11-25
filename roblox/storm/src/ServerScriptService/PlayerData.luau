-- PlayerData: each player's cash, upgrades and saved storms (DataStore), mirrored to Player attributes so the
-- client HUD can show them, plus leaderstats.
-- "player" may also be a test stand-in table with UserId/Name and SetAttribute/GetAttribute methods.

local DataStoreService = game:GetService("DataStoreService")

local Data = require(game:GetService("ReplicatedStorage"):WaitForChild("StormData"))

local PD = {}
PD.profiles = {} :: { [any]: any }

local store
pcall(function()
	store = DataStoreService:GetDataStore("StealAStorm_v1")
end)

function PD.default()
	return { cash = 0, speed = 0, carry = 0, money = 0, storms = {}, steals = 0, earned = 0, last = os.time() }
end

local function isPlayer(p): boolean
	return typeof(p) == "Instance" and p:IsA("Player")
end
PD.isPlayer = isPlayer

function PD.load(player)
	local d = PD.default()
	if store and isPlayer(player) then
		local ok, saved = pcall(function()
			return store:GetAsync("u" .. player.UserId)
		end)
		if ok and type(saved) == "table" then
			for k, v in saved do
				if d[k] ~= nil and type(v) == type(d[k]) then
					d[k] = v
				end
			end
		end
	end
	PD.profiles[player] = d
	return d
end

function PD.save(player)
	local d = PD.profiles[player]
	if not d or not store or not isPlayer(player) then
		return
	end
	d.last = os.time()
	local copy = table.clone(d)
	pcall(function()
		store:SetAsync("u" .. player.UserId, copy)
	end)
end

-- copy what the HUD needs into attributes (and leaderstats for real players)
function PD.sync(player, income: number?)
	local d = PD.profiles[player]
	if not d then
		return
	end
	player:SetAttribute("Cash", d.cash)
	player:SetAttribute("SpeedLv", d.speed)
	player:SetAttribute("CarryLv", d.carry)
	player:SetAttribute("MoneyLv", d.money)
	player:SetAttribute("Steals", d.steals)
	if income then
		player:SetAttribute("Income", income)
	end
	if isPlayer(player) then
		local ls = player:FindFirstChild("leaderstats")
		if not ls then
			ls = Instance.new("Folder")
			ls.Name = "leaderstats"
			local cash = Instance.new("StringValue")
			cash.Name = "Cash"
			cash.Parent = ls
			local steals = Instance.new("IntValue")
			steals.Name = "Steals"
			steals.Parent = ls
			ls.Parent = player
		end
		(ls :: any).Cash.Value = Data.money(d.cash);
		(ls :: any).Steals.Value = d.steals
	end
end

return PD
