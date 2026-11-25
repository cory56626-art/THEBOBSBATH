-- Wires Steal a Storm to the world: players, characters, remotes and the game loops.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local G = require(script.Parent:WaitForChild("StormGame"))
local PD = require(script.Parent:WaitForChild("PlayerData"))

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

G.init()
remotes.Parent = ReplicatedStorage

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
			G.notify(player, "Welcome back! Your storms earned " .. require(ReplicatedStorage.StormData).money(amount)
				.. " while you were away", "Upgrade")
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
local function throttle(player: Player): boolean
	local t = os.clock()
	if t - (last[player] or -100) < 0.15 then
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

RunService.Heartbeat:Connect(function()
	local ok, err = pcall(G.step)
	if not ok then
		warn("[StormGame] step: " .. tostring(err))
	end
end)

task.spawn(function()
	local tick = 0
	while true do
		task.wait(1)
		tick += 1
		local ok, err = pcall(G.second)
		if not ok then
			warn("[StormGame] second: " .. tostring(err))
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

game:BindToClose(function()
	for player in G.players do
		if PD.isPlayer(player) then
			G.snapshot(player)
			task.spawn(PD.save, player)
		end
	end
	task.wait(3)
end)
