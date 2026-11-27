-- Wires Precinct 9 to the world: teams, characters (uniforms, name tags), remotes, the game loops, day and night.
-- Game rules live in P9Game and the modules it loads (P9World, P9AiCops, P9Traffic, P9Economy).

local Players = game:GetService("Players")
local Teams = game:GetService("Teams")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local G = require(script.Parent:WaitForChild("P9Game"))
local Profile = require(script.Parent:WaitForChild("P9Profile"))
local Data = require(ReplicatedStorage:WaitForChild("P9Data"))

Players.CharacterAutoLoads = false

local remotes = Instance.new("Folder")
remotes.Name = "P9Remotes"
local function remote(name: string): RemoteEvent
	local r = Instance.new("RemoteEvent")
	r.Name = name
	r.Parent = remotes
	return r
end
local PickTeam = remote("PickTeam")
local CarAction = remote("CarAction") -- (model, "drive" | "ride")
local CarToggle = remote("CarToggle") -- "Lights" | "Siren"
local SpawnCar = remote("SpawnCar") -- kind
local Taser = remote("Taser") -- aim direction
local Arrest = remote("Arrest") -- target model
local Notify = remote("Notify")
local Knock = remote("Knock")
local Fx = remote("Fx")
local Equip = remote("Equip") -- gun name or ""
local Fire = remote("Fire") -- aim direction
local Action = remote("Action") -- (name, ...) shops, jobs, robberies, jailbreaks, departments, traffic stops
local StopInfo = remote("StopInfo") -- server -> client: the traffic-stop panel

-- teams
local teamObjs = {}
for key, info in Data.TEAMS do
	local t = Instance.new("Team")
	t.Name = if key == "Civilian" then "Civilians" else "Police"
	t.TeamColor = if key == "Police" then BrickColor.new("Really blue") else BrickColor.new("Sea green")
	t.AutoAssignable = false
	t.Parent = Teams
	teamObjs[key] = t
	local _ = info
end

G.notify = function(player, text, sound)
	if Profile.isPlayer(player) then
		Notify:FireClient(player, text, sound)
	end
end
G.knock = function(player, dir, seconds, force)
	if Profile.isPlayer(player) then
		Knock:FireClient(player, dir, seconds, force)
	end
end
G.stopInfo = function(player, info)
	if Profile.isPlayer(player) then
		StopInfo:FireClient(player, info)
	end
end
G.fx = function(kind, ...)
	Fx:FireAllClients(kind, ...)
end
G.setTeamInstance = function(player, team)
	if Profile.isPlayer(player) then
		player.Team = if team then teamObjs[team] else nil
		player.Neutral = team == nil
	end
end
G.respawn = function(player)
	if Profile.isPlayer(player) then
		player:LoadCharacter()
	end
end

remotes.Parent = ReplicatedStorage
G.init()

---------------------------------------------------------------- characters
local function weldTo(part: BasePart, to: BasePart, offset: CFrame)
	part.Anchored = false
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.Massless = true
	part.CFrame = to.CFrame * offset
	local w = Instance.new("WeldConstraint")
	w.Part0 = to
	w.Part1 = part
	w.Parent = part
end

local function gearUp(player: Player, char: Model, team: string)
	local torso = char:FindFirstChild("UpperTorso") or char:FindFirstChild("Torso")
	local head = char:FindFirstChild("Head")
	if not torso or not head or not torso:IsA("BasePart") or not head:IsA("BasePart") then
		return
	end
	if team == "Police" then
		-- duty vest with POLICE across the back, and a patrol cap
		local vest = Instance.new("Part")
		vest.Name = "Vest"
		vest.Size = Vector3.new(torso.Size.X + 0.15, torso.Size.Y * 0.9, torso.Size.Z + 0.2)
		vest.Color = Color3.fromRGB(26, 30, 44)
		vest.Material = Enum.Material.Fabric
		weldTo(vest, torso, CFrame.new(0, -0.05, 0))
		local gui = Instance.new("SurfaceGui")
		gui.Face = Enum.NormalId.Back
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = 60
		local l = Instance.new("TextLabel")
		l.BackgroundTransparency = 1
		l.Size = UDim2.fromScale(1, 0.4)
		l.Position = UDim2.fromScale(0, 0.15)
		l.TextScaled = true
		l.Font = Enum.Font.GothamBlack
		l.TextColor3 = Color3.fromRGB(240, 240, 240)
		l.Text = "POLICE"
		l.Parent = gui
		gui.Parent = vest
		local badge = Instance.new("Part")
		badge.Name = "Badge"
		badge.Size = Vector3.new(0.35, 0.4, 0.06)
		badge.Color = Color3.fromRGB(230, 190, 70)
		badge.Material = Enum.Material.Metal
		weldTo(badge, torso, CFrame.new(-torso.Size.X * 0.25, torso.Size.Y * 0.2, -torso.Size.Z / 2 - 0.12))
		vest.Parent = char
		badge.Parent = char
		local cap = Instance.new("Part")
		cap.Name = "Cap"
		cap.Shape = Enum.PartType.Cylinder
		cap.Size = Vector3.new(0.5, head.Size.X * 1.1, head.Size.X * 1.1)
		cap.Color = Color3.fromRGB(26, 30, 44)
		cap.Material = Enum.Material.Fabric
		weldTo(cap, head, CFrame.new(0, head.Size.Y * 0.5, 0) * CFrame.Angles(0, 0, math.pi / 2))
		cap.Parent = char
		local brim = Instance.new("Part")
		brim.Name = "Brim"
		brim.Size = Vector3.new(head.Size.X * 0.9, 0.08, 0.5)
		brim.Color = Color3.fromRGB(20, 22, 30)
		weldTo(brim, head, CFrame.new(0, head.Size.Y * 0.3, -head.Size.Z * 0.6))
		brim.Parent = char
	end
	-- overhead tag: name, plus rank (police) or wanted stars (criminals)
	local tag = Instance.new("BillboardGui")
	tag.Name = "Tag"
	tag.Size = UDim2.fromOffset(200, 46)
	tag.StudsOffset = Vector3.new(0, 2.6, 0)
	tag.MaxDistance = 150
	tag.AlwaysOnTop = false
	local name = Instance.new("TextLabel")
	name.Name = "PlayerName"
	name.BackgroundTransparency = 1
	name.Size = UDim2.new(1, 0, 0.5, 0)
	name.Font = Enum.Font.GothamBold
	name.TextScaled = true
	name.TextStrokeTransparency = 0.4
	name.TextColor3 = Data.TEAMS[team].color:Lerp(Color3.new(1, 1, 1), 0.35)
	name.Text = player.DisplayName
	name.Parent = tag
	local sub = Instance.new("TextLabel")
	sub.Name = "Sub"
	sub.BackgroundTransparency = 1
	sub.Position = UDim2.fromScale(0, 0.5)
	sub.Size = UDim2.new(1, 0, 0.5, 0)
	sub.Font = Enum.Font.GothamBlack
	sub.TextScaled = true
	sub.TextStrokeTransparency = 0.4
	sub.TextColor3 = if team == "Police" then Color3.fromRGB(200, 215, 255) else Color3.fromRGB(255, 205, 60)
	sub.Parent = tag
	local function refresh()
		if team == "Police" then
			local dept = player:GetAttribute("Dept") or "Patrol"
			sub.Text = (player:GetAttribute("Rank") or "Cadet") .. (if dept ~= "Patrol" then " · " .. dept else "")
		else
			local stars = player:GetAttribute("Wanted") or 0
			local job = player:GetAttribute("Job") or ""
			sub.Text = if stars > 0 then string.rep("★", stars) elseif job == "Pizza" then "Pizza Delivery"
				elseif job == "Taxi" then "Taxi Driver" else ""
			sub.TextColor3 = if stars > 0 then Color3.fromRGB(255, 80, 60) else Color3.fromRGB(200, 255, 210)
		end
	end
	refresh()
	for _, a in { "Wanted", "Rank", "Dept", "Job" } do
		player:GetAttributeChangedSignal(a):Connect(refresh)
	end
	tag.Parent = head
end

local function onCharacter(player: Player, char: Model)
	local hum = char:WaitForChild("Humanoid", 10) :: Humanoid?
	local hrp = char:WaitForChild("HumanoidRootPart", 10)
	if not hum or not hrp then
		return
	end
	task.wait()
	local P = G.players[player]
	local team = P and P.team
	char:PivotTo(G.spawnCFrame(player))
	hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	hum.WalkSpeed = if team == "Police" then Data.SUSPECTS.copSpeed else 18
	if team then
		gearUp(player, char, team)
	end
	hum.Died:Connect(function()
		task.delay(4, function()
			if player.Parent and G.players[player] then
				player:LoadCharacter()
			end
		end)
	end)
end

local function onPlayer(player: Player)
	G.addPlayer(player)
	if not player.Parent then
		return
	end
	player.CharacterAdded:Connect(function(char)
		onCharacter(player, char)
	end)
	player:LoadCharacter()
end

Players.PlayerAdded:Connect(onPlayer)
for _, p in Players:GetPlayers() do
	task.spawn(onPlayer, p)
end
Players.PlayerRemoving:Connect(function(player)
	G.removePlayer(player)
	Profile.save(player)
	Profile.data[player] = nil
end)

---------------------------------------------------------------- client requests (validated inside P9Game)
local last: { [Player]: number } = {}
local function throttle(player: Player, gap: number?): boolean
	local t = os.clock()
	if t - (last[player] or -100) < (gap or 0.2) then
		return false
	end
	last[player] = t
	return true
end
PickTeam.OnServerEvent:Connect(function(player, team)
	if type(team) == "string" and throttle(player, 1) then
		G.setTeam(player, team)
	end
end)
CarAction.OnServerEvent:Connect(function(player, model, how)
	if typeof(model) == "Instance" and type(how) == "string" and throttle(player) then
		G.enterCar(player, model, how)
	end
end)
CarToggle.OnServerEvent:Connect(function(player, what)
	if type(what) == "string" and throttle(player, 0.15) then
		G.toggleCar(player, what)
	end
end)
SpawnCar.OnServerEvent:Connect(function(player, kind)
	if type(kind) == "string" and throttle(player, 2) then
		G.spawnPoliceCar(player, kind)
	end
end)
Taser.OnServerEvent:Connect(function(player, aim)
	if typeof(aim) == "Vector3" then
		G.taser(player, aim)
	end
end)
Arrest.OnServerEvent:Connect(function(player, target)
	if typeof(target) == "Instance" and throttle(player, 0.3) then
		G.arrest(player, target)
	end
end)
Equip.OnServerEvent:Connect(function(player, gun)
	if type(gun) == "string" and throttle(player, 0.2) then
		G.equip(player, gun)
	end
end)
Fire.OnServerEvent:Connect(function(player, aim)
	if typeof(aim) == "Vector3" then
		G.fire(player, aim)
	end
end)
local actions = {
	rob = function(player, id, phase)
		return type(id) == "string" and (phase == "begin" or phase == "finish") and G.rob(player, id, phase)
	end,
	lockpick = function(player, phase)
		return (phase == "begin" or phase == "finish") and G.lockpick(player, phase)
	end,
	breach = function(player, phase)
		return (phase == "begin" or phase == "finish") and G.breach(player, phase)
	end,
	buyGun = function(player)
		return G.buyGun(player)
	end,
	buyCar = function(player, kind)
		return type(kind) == "string" and G.buyCar(player, kind)
	end,
	myCar = function(player, kind)
		return type(kind) == "string" and G.spawnOwned(player, kind)
	end,
	startJob = function(player, name)
		return type(name) == "string" and G.startJob(player, name)
	end,
	quitJob = function(player)
		G.quitJob(player)
	end,
	dept = function(player, name)
		return type(name) == "string" and G.setDept(player, name)
	end,
	stop = function(player, model, what)
		return typeof(model) == "Instance" and type(what) == "string" and G.trafficStop(player, model, what)
	end,
}
Action.OnServerEvent:Connect(function(player, name, a, b)
	local f = type(name) == "string" and actions[name]
	if f and throttle(player, 0.15) then
		local ok, err = pcall(f, player, a, b)
		if not ok then
			warn("[Precinct9] action " .. name .. ": " .. tostring(err))
		end
	end
end)
Players.PlayerRemoving:Connect(function(p)
	last[p] = nil
end)

---------------------------------------------------------------- loops
local reported: { [string]: boolean } = {}
local function report(where: string, err: any)
	local msg = where .. ": " .. tostring(err)
	if not reported[msg] then
		reported[msg] = true
		warn("[Precinct9] " .. msg)
	end
end

RunService.Heartbeat:Connect(function(dt)
	local ok, err = pcall(G.step, math.min(dt, 0.1))
	if not ok then
		report("step", err)
	end
end)

-- day and night: a full day every 16 minutes; street lamps and shop signs come on after dark
local lamps: { Light } = {}
for _, d in workspace:WaitForChild("World"):GetDescendants() do
	if d:IsA("SpotLight") and d.Parent and d.Parent.Name == "LampBulb" then
		table.insert(lamps, d)
	end
end
local wasNight: boolean? = nil
local function updateLamps()
	local hour = Lighting.ClockTime
	local night = hour < 6.4 or hour > 18.2
	if night ~= wasNight then
		wasNight = night
		workspace:SetAttribute("Night", night)
		for _, l in lamps do
			l.Enabled = night
		end
	end
end
Lighting.ClockTime = 15
updateLamps()

task.spawn(function()
	local tick = 0
	while true do
		local dt = task.wait(1)
		tick += 1
		local ok, err = pcall(G.second)
		if not ok then
			report("second", err)
		end
		Lighting.ClockTime = (Lighting.ClockTime + dt * 24 / (16 * 60)) % 24
		updateLamps()
		if tick % 90 == 0 then
			for player in G.players do
				if Profile.isPlayer(player) then
					task.spawn(Profile.save, player)
				end
			end
		end
	end
end)

game:BindToClose(function()
	for player in G.players do
		if Profile.isPlayer(player) then
			Profile.save(player)
		end
	end
end)
