-- P9Profile: each player's saved progress (cash, experience, arrests, bookings) mirrored to attributes and
-- leaderstats. "player" may be a test stand-in table (UserId, Name, SetAttribute/GetAttribute).

local DataStoreService = game:GetService("DataStoreService")

local Data = require(game:GetService("ReplicatedStorage"):WaitForChild("P9Data"))

local Profile = {}
Profile.data = {} :: { [any]: any }

local store
pcall(function()
	store = DataStoreService:GetDataStore("Precinct9_v1")
end)

local function isPlayer(p): boolean
	return typeof(p) == "Instance" and p:IsA("Player")
end
Profile.isPlayer = isPlayer

function Profile.default()
	return { cash = 0, xp = 0, arrests = 0, bookings = 0, escapes = 0 }
end

function Profile.load(player)
	local d = Profile.default()
	if store and isPlayer(player) then
		local ok, saved = pcall(function()
			return store:GetAsync("u" .. player.UserId)
		end)
		if ok and type(saved) == "table" then
			for k, val in saved do
				if d[k] ~= nil and type(val) == type(d[k]) then
					d[k] = val
				end
			end
		end
	end
	Profile.data[player] = d
	Profile.sync(player)
	return d
end

function Profile.save(player)
	local d = Profile.data[player]
	if d and store and isPlayer(player) then
		local copy = table.clone(d)
		pcall(function()
			store:SetAsync("u" .. player.UserId, copy)
		end)
	end
end

function Profile.sync(player)
	local d = Profile.data[player]
	if not d then
		return
	end
	local rankIdx, rankName = Data.rankOf(d.xp)
	player:SetAttribute("Cash", d.cash)
	player:SetAttribute("XP", d.xp)
	player:SetAttribute("RankIndex", rankIdx)
	player:SetAttribute("Rank", rankName)
	player:SetAttribute("Arrests", d.arrests)
	if isPlayer(player) then
		local ls = player:FindFirstChild("leaderstats")
		if not ls then
			ls = Instance.new("Folder")
			ls.Name = "leaderstats"
			local cash = Instance.new("StringValue")
			cash.Name = "Cash"
			cash.Parent = ls
			local rank = Instance.new("StringValue")
			rank.Name = "Rank"
			rank.Parent = ls
			local arrests = Instance.new("IntValue")
			arrests.Name = "Arrests"
			arrests.Parent = ls
			ls.Parent = player
		end
		(ls :: any).Cash.Value = Data.money(d.cash);
		(ls :: any).Rank.Value = rankName;
		(ls :: any).Arrests.Value = d.arrests
	end
end

-- pay a player; returns true if they ranked up
function Profile.give(player, cash: number, xp: number): boolean
	local d = Profile.data[player]
	if not d then
		return false
	end
	local before = Data.rankOf(d.xp)
	d.cash += cash
	d.xp += xp
	Profile.sync(player)
	return Data.rankOf(d.xp) > before
end

return Profile
