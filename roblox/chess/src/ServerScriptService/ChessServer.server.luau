-- Wires the chess tables to the world: chairs -> players, client requests -> the referee, results -> ratings.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Tables = require(script.Parent:WaitForChild("ChessTables"))
local Stats = require(script.Parent:WaitForChild("ChessStats"))

Players.CharacterAutoLoads = true
Stats.start()

local remotes = Instance.new("Folder")
remotes.Name = "ChessRemotes"
local actionRemote = Instance.new("RemoteEvent")
actionRemote.Name = "Action"
actionRemote.Parent = remotes
local notifyRemote = Instance.new("RemoteEvent")
notifyRemote.Name = "Notify"
notifyRemote.Parent = remotes

Tables.onResult = function(T, white, black, winner)
	local level = Tables.LEVELS[T.level]
	Stats.record(white, black, winner, if level then level.rating else 1000)
end

local SEATS = { south = "SeatSouth", north = "SeatNorth" }

local tablesFolder = workspace:WaitForChild("Tables")
for _, model in tablesFolder:GetChildren() do
	if model:IsA("Model") then
		local T = Tables.init(model)
		for where, seatName in SEATS do
			local seat = model:FindFirstChild(seatName)
			if seat and seat:IsA("Seat") then
				seat:GetPropertyChangedSignal("Occupant"):Connect(function()
					local hum = seat.Occupant
					local player = hum and Players:GetPlayerFromCharacter(hum.Parent)
					Tables.seat(T, where, player)
				end)
			end
		end
	end
end
remotes.Parent = ReplicatedStorage

-- stand a player up from their chair and step them back from the table
local function unseat(player: Player, T)
	local char = player.Character
	if not char then
		return
	end
	for _, seatName in SEATS do
		local seat = T.model:FindFirstChild(seatName)
		if seat and seat:IsA("Seat") and seat.Occupant and seat.Occupant.Parent == char then
			local weld = seat:FindFirstChild("SeatWeld")
			if weld then
				weld:Destroy()
			end
			local hum = seat.Occupant
			hum.Sit = false
			local center = T.model:FindFirstChild("Board") and (T.model :: any).Board:FindFirstChild("Center")
			local from = if center then center.Position else seat.Position
			local away = seat.Position - from
			away = Vector3.new(away.X, 0, away.Z)
			away = if away.Magnitude > 0.1 then away.Unit else Vector3.zAxis
			local spot = seat.Position + away * 4 + Vector3.new(0, 3, 0)
			char:PivotTo(CFrame.lookAt(spot, spot - away))
		end
	end
end

local lastAction: { [Player]: number } = {}
actionRemote.OnServerEvent:Connect(function(player, model, what, a, b, c)
	if typeof(model) ~= "Instance" or type(what) ~= "string" then
		return
	end
	local T = Tables.byModel[model]
	if not T then
		return
	end
	local now = os.clock()
	if now - (lastAction[player] or 0) < 0.08 then
		return -- ignore spam
	end
	lastAction[player] = now
	if what == "leave" then
		unseat(player, T)
		return
	end
	local ok, message = Tables.action(T, player, what, a, b, c)
	if not ok and message then
		notifyRemote:FireClient(player, message)
	end
end)

Players.PlayerRemoving:Connect(function(p)
	lastAction[p] = nil
end)
