-- Every player spawns as an R6 character wearing their own avatar (the game's avatar type is R6).
-- The universe "Avatar type" setting can't be changed from a place file, so the server builds each character
-- itself: Players:GetHumanoidDescriptionFromUserIdAsync -> Players:CreateHumanoidModelFromDescriptionAsync(..., R6),
-- then sets Player.Character. CharacterAutoLoads is off, so respawning is handled here too.
local Players = game:GetService("Players")
local StarterPlayer = game:GetService("StarterPlayer")

Players.CharacterAutoLoads = false
local RESPAWN = 5

local descriptions: { [Player]: HumanoidDescription } = {}

local function spawnPoint(): CFrame
	for _, d in workspace:GetDescendants() do
		if d:IsA("SpawnLocation") then
			return d.CFrame + Vector3.new(0, d.Size.Y / 2 + 3.2, 0)
		end
	end
	return CFrame.new(0, 10, 0)
end

local function build(player: Player): Model?
	local desc = descriptions[player]
	if not desc then
		local ok, d = pcall(function()
			return Players:GetHumanoidDescriptionFromUserIdAsync(player.UserId)
		end)
		desc = if ok and d then d else Instance.new("HumanoidDescription")
		descriptions[player] = desc :: HumanoidDescription
	end
	local ok, model = pcall(function()
		return Players:CreateHumanoidModelFromDescriptionAsync(desc :: HumanoidDescription, Enum.HumanoidRigType.R6)
	end)
	if not ok or not model then
		warn("[R6Characters] could not build an R6 character: " .. tostring(model))
		return nil
	end
	return model
end

local spawning: { [Player]: boolean } = {}
local function spawnCharacter(player: Player)
	if spawning[player] or not player.Parent then
		return
	end
	spawning[player] = true
	local model = build(player)
	if not model then
		spawning[player] = false
		pcall(function()
			player:LoadCharacterAsync() -- fall back to the default spawn so nobody is stuck without a body
		end)
		return
	end
	model.Name = player.Name
	-- our animator drives the joints; the bundled Animate script would fight it
	local animate = model:FindFirstChild("Animate")
	if animate then
		animate:Destroy()
	end
	-- give it the scripts a normal spawn would get
	local scs = StarterPlayer:FindFirstChild("StarterCharacterScripts")
	if scs then
		for _, s in scs:GetChildren() do
			if not model:FindFirstChild(s.Name) then
				s:Clone().Parent = model
			end
		end
	end
	model:PivotTo(spawnPoint())
	player.Character = model
	model.Parent = workspace
	local root = model:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		pcall(function()
			root:SetNetworkOwner(player)
		end)
	end
	local hum = model:FindFirstChildOfClass("Humanoid")
	if hum then
		hum.Died:Connect(function()
			task.delay(RESPAWN, function()
				if player.Parent and player.Character == model then
					spawnCharacter(player)
				end
			end)
		end)
	end
	spawning[player] = false
end

Players.PlayerAdded:Connect(spawnCharacter)
for _, p in Players:GetPlayers() do
	task.spawn(spawnCharacter, p)
end
Players.PlayerRemoving:Connect(function(p)
	descriptions[p] = nil
	spawning[p] = nil
end)

