-- Wires Steal a Storm to the world: players, characters, remotes, the game loops and the leaderboard.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local DataStoreService = game:GetService("DataStoreService")

local G = require(script.Parent:WaitForChild("StormGame"))
local PD = require(script.Parent:WaitForChild("PlayerData"))
local Data = require(ReplicatedStorage:WaitForChild("StormData"))

local remotes = Instance.new("Folder")
remotes.Name = "StormRemotes"
local function remote(name: string): RemoteEvent
	local r = Instance.new("RemoteEvent")
	r.Name = name
	r.Parent = remotes
	return r
end
local Interact = remote("Interact")
local Buy = remote("Buy")
local Lock = remote("Lock")
local Notify = remote("Notify")
local Knock = remote("Knock")
local Fx = remote("Fx") -- world effects for everyone
local Tell = remote("Tell") -- one player's UI moments
local OpenCrate = remote("OpenCrate")
local Rebirth = remote("Rebirth")
local Move = remote("Move") -- a player dashed / launched (so others see the effect)
local Blast = remote("Blast") -- a player blasted (aim direction); the server picks the target

G.notify = function(player, text, sound)
	if PD.isPlayer(player) then
		Notify:FireClient(player, text, sound)
	end
end
G.broadcast = function(text, sound)
	Notify:FireAllClients(text, sound)
end
G.knock = function(player, dir)
	if PD.isPlayer(player) then
		Knock:FireClient(player, dir)
	end
end
G.fx = function(kind, ...)
	Fx:FireAllClients(kind, ...)
end
G.tell = function(player, kind, ...)
	if PD.isPlayer(player) then
		Tell:FireClient(player, kind, ...)
	end
end

-- real clouds in the sky (clients thicken them in the deeper stages)
pcall(function()
	local clouds = Instance.new("Clouds")
	clouds.Cover = 0.55
	clouds.Density = 0.45
	clouds.Color = Color3.fromRGB(240, 242, 248)
	clouds.Parent = workspace.Terrain
end)

remotes.Parent = ReplicatedStorage -- before init: spawning storms already sends effects
G.init()

local function onCharacter(player: Player, char: Model)
	local hum = char:WaitForChild("Humanoid", 10) :: Humanoid?
	local hrp = char:WaitForChild("HumanoidRootPart", 10)
	if not hum or not hrp then
		return
	end
	task.wait()
	local cf = G.spawnCFrame(player)
	if cf then
		char:PivotTo(cf)
	end
	G.applySpeed(player)
	hum.Died:Connect(function()
		G.drop(player, "died")
	end)
	local P = G.players[player]
	if P and P.welcome > 0 then
		local amount = P.welcome
		P.welcome = 0
		task.delay(2, function()
			G.notify(player, "Welcome back! Your storms earned " .. Data.money(amount) .. " while you were away", "Upgrade")
		end)
	end
end

local function onPlayer(player: Player)
	PD.load(player)
	if not player.Parent then
		PD.profiles[player] = nil
		return
	end
	if not G.addPlayer(player) then
		player:Kick("This server is full, please try another one!")
		return
	end
	player.CharacterAdded:Connect(function(char)
		onCharacter(player, char)
	end)
	if player.Character then
		task.spawn(onCharacter, player, player.Character)
	end
end

Players.PlayerAdded:Connect(onPlayer)
for _, p in Players:GetPlayers() do
	task.spawn(onPlayer, p)
end
Players.PlayerRemoving:Connect(function(player)
	G.removePlayer(player)
	PD.save(player)
	PD.profiles[player] = nil
end)

-- client requests (validated inside StormGame)
local last: { [Player]: number } = {}
local function throttle(player: Player, gap: number?): boolean
	local t = os.clock()
	if t - (last[player] or -100) < (gap or 0.15) then
		return false
	end
	last[player] = t
	return true
end
Interact.OnServerEvent:Connect(function(player, root, action)
	if typeof(root) == "Instance" and root:IsA("BasePart") and type(action) == "string" and throttle(player) then
		G.interact(player, root, action)
	end
end)
Buy.OnServerEvent:Connect(function(player, name)
	if type(name) == "string" and throttle(player) then
		G.buy(player, name)
	end
end)
Lock.OnServerEvent:Connect(function(player)
	if throttle(player) then
		G.lock(player)
	end
end)
OpenCrate.OnServerEvent:Connect(function(player)
	if throttle(player, 0.5) then
		G.openCrate(player)
	end
end)
Rebirth.OnServerEvent:Connect(function(player)
	if throttle(player, 1) then
		G.rebirth(player)
	end
end)
Blast.OnServerEvent:Connect(function(player, aim)
	if typeof(aim) == "Vector3" then
		G.blast(player, aim)
	end
end)
local lastMove: { [Player]: number } = {}
Move.OnServerEvent:Connect(function(player, kind)
	local t = os.clock()
	if (kind == "dash" or kind == "launch") and t - (lastMove[player] or -100) > 0.8 then
		lastMove[player] = t
		Fx:FireAllClients(kind, player.UserId)
	end
end)
Players.PlayerRemoving:Connect(function(p)
	last[p] = nil
	lastMove[p] = nil
end)

local reported: { [string]: boolean } = {}
local function report(where: string, err: any)
	local msg = where .. ": " .. tostring(err)
	if not reported[msg] then
		reported[msg] = true
		warn("[StormGame] " .. msg)
	end
end

RunService.Heartbeat:Connect(function()
	local ok, err = pcall(G.step)
	if not ok then
		report("step", err)
	end
end)

task.spawn(function()
	local tick = 0
	while true do
		task.wait(1)
		tick += 1
		local ok, err = pcall(G.second)
		if not ok then
			report("second", err)
		end
		if tick % 60 == 0 then
			for player in G.players do
				if PD.isPlayer(player) then
					G.snapshot(player)
					task.spawn(PD.save, player)
				end
			end
		end
	end
end)

---------------------------------------------------------------- the all-time leaderboard (total cash earned)
local board = workspace:FindFirstChild("World") and workspace.World:FindFirstChild("Leaderboard")
local rows: { TextLabel } = {}
if board and board:IsA("BasePart") then
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 25
	gui.LightInfluence = 0
	local title = Instance.new("TextLabel")
	title.BackgroundTransparency = 1
	title.Size = UDim2.fromScale(1, 0.16)
	title.Font = Enum.Font.FredokaOne
	title.TextScaled = true
	title.TextColor3 = Color3.fromRGB(255, 215, 90)
	title.Text = "TOP STORM CHASERS"
	title.Parent = gui
	for i = 1, 10 do
		local row = Instance.new("TextLabel")
		row.BackgroundTransparency = 1
		row.Position = UDim2.fromScale(0.04, 0.17 + (i - 1) * 0.082)
		row.Size = UDim2.fromScale(0.92, 0.078)
		row.Font = Enum.Font.GothamBold
		row.TextScaled = true
		row.TextXAlignment = Enum.TextXAlignment.Left
		row.TextColor3 = if i == 1 then Color3.fromRGB(255, 215, 90)
			elseif i == 2 then Color3.fromRGB(220, 225, 235)
			elseif i == 3 then Color3.fromRGB(230, 160, 100)
			else Color3.new(1, 1, 1)
		row.Text = i .. ". ---"
		row.Parent = gui
		rows[i] = row
	end
	gui.Parent = board
end
local ordered
pcall(function()
	ordered = DataStoreService:GetOrderedDataStore("StealAStorm_TopEarned_v1")
end)
local names: { [number]: string } = {}
task.spawn(function()
	task.wait(15)
	while ordered do
		for player in G.players do
			local d = PD.isPlayer(player) and PD.profiles[player]
			if d then
				pcall(function()
					ordered:SetAsync(tostring(player.UserId), math.floor(math.min(d.earned, 9e15)))
				end)
			end
		end
		local ok, pages = pcall(function()
			return ordered:GetSortedAsync(false, 10)
		end)
		if ok and pages and #rows > 0 then
			for i, entry in pages:GetCurrentPage() do
				local id = tonumber(entry.key)
				if id and not names[id] then
					local okName, name = pcall(function()
						return Players:GetNameFromUserIdAsync(id)
					end)
					names[id] = if okName then name else "Player"
				end
				if rows[i] then
					rows[i].Text = ("%d. %s   %s"):format(i, names[id or 0] or "Player", Data.money(entry.value))
				end
			end
		end
		task.wait(90)
	end
end)

game:BindToClose(function()
	for player in G.players do
		if PD.isPlayer(player) then
			G.snapshot(player)
			task.spawn(PD.save, player)
		end
	end
	task.wait(3)
end)
