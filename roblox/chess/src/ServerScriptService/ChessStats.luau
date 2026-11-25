-- ChessStats: Elo rating + wins/losses/draws per player, saved in a DataStore and shown in leaderstats.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")

local Stats = {}
Stats.data = {} :: { [Player]: { rating: number, wins: number, losses: number, draws: number, games: number } }

local store
pcall(function()
	store = DataStoreService:GetDataStore("ChessStats_v1")
end)

local START_RATING = 800
local lastSave: { [Player]: number } = {}

local function leaderstats(player: Player, d)
	local ls = player:FindFirstChild("leaderstats")
	if not ls then
		ls = Instance.new("Folder")
		ls.Name = "leaderstats"
		local rating = Instance.new("IntValue")
		rating.Name = "Rating"
		rating.Parent = ls
		local wins = Instance.new("IntValue")
		wins.Name = "Wins"
		wins.Parent = ls
		ls.Parent = player
	end
	(ls :: any).Rating.Value = math.floor(d.rating + 0.5);
	(ls :: any).Wins.Value = d.wins
end

function Stats.load(player: Player)
	local d = { rating = START_RATING, wins = 0, losses = 0, draws = 0, games = 0 }
	if store then
		local ok, saved = pcall(function()
			return store:GetAsync("u" .. player.UserId)
		end)
		if ok and type(saved) == "table" then
			for k, v in saved do
				if type(v) == "number" then
					d[k] = v
				end
			end
		end
	end
	if player.Parent then
		Stats.data[player] = d
		leaderstats(player, d)
	end
end

function Stats.save(player: Player)
	local d = Stats.data[player]
	if not d or not store then
		return
	end
	lastSave[player] = os.clock()
	local copy = table.clone(d)
	pcall(function()
		store:SetAsync("u" .. player.UserId, copy)
	end)
end

local function isPlayer(a): boolean
	return typeof(a) == "Instance" and a:IsA("Player")
end

local function ratingOf(a, botRating: number): number
	if isPlayer(a) and Stats.data[a] then
		return Stats.data[a].rating
	end
	return botRating
end

local function apply(a, score: number, opponentRating: number)
	if not isPlayer(a) then
		return
	end
	local d = Stats.data[a]
	if not d then
		return
	end
	local expected = 1 / (1 + 10 ^ ((opponentRating - d.rating) / 400))
	local k = if d.games < 20 then 40 else 24
	d.rating = math.max(100, d.rating + k * (score - expected))
	d.games += 1
	if score == 1 then
		d.wins += 1
	elseif score == 0 then
		d.losses += 1
	else
		d.draws += 1
	end
	leaderstats(a, d)
	-- save soon (DataStore writes to one key are limited to about one every 6 s)
	local since = os.clock() - (lastSave[a] or 0)
	task.delay(math.max(0, 7 - since), function()
		if a.Parent then
			Stats.save(a)
		end
	end)
end

-- winner: "white" | "black" | "draw"; botRating: rating used for Gato
function Stats.record(white, black, winner: string, botRating: number)
	local rw, rb = ratingOf(white, botRating), ratingOf(black, botRating)
	local sw = if winner == "white" then 1 elseif winner == "black" then 0 else 0.5
	apply(white, sw, rb)
	apply(black, 1 - sw, rw)
end

function Stats.start()
	Players.PlayerAdded:Connect(Stats.load)
	for _, p in Players:GetPlayers() do
		task.spawn(Stats.load, p)
	end
	Players.PlayerRemoving:Connect(function(p)
		Stats.save(p)
		Stats.data[p] = nil
		lastSave[p] = nil
	end)
	game:BindToClose(function()
		for p in Stats.data do
			task.spawn(Stats.save, p)
		end
		task.wait(2)
	end)
end

return Stats
