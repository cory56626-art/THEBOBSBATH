-- Server side of the player's flashlight: a SpotLight in each character's head that other players see,
-- toggled by the owner. The skinwalker reads the character's "Flashlight" attribute (a lit flashlight is easy to spot).
-- Stamina/sprinting is handled on the client (it only changes your own WalkSpeed).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local toggle = Instance.new("RemoteEvent")
toggle.Name = "FlashlightToggle"
toggle.Parent = ReplicatedStorage

local function setup(character: Model)
	local head = character:WaitForChild("Head", 10)
	if not head or not head:IsA("BasePart") then
		return
	end
	local light = Instance.new("SpotLight")
	light.Name = "Flashlight"
	light.Face = Enum.NormalId.Front
	light.Angle = 55
	light.Range = 60
	light.Brightness = 3
	light.Color = Color3.fromRGB(255, 244, 220)
	light.Shadows = true
	light.Enabled = false
	light.Parent = head
	character:SetAttribute("Flashlight", false)
end

Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(setup)
	if player.Character then
		setup(player.Character)
	end
end)
for _, player in Players:GetPlayers() do
	player.CharacterAdded:Connect(setup)
	if player.Character then
		task.spawn(setup, player.Character)
	end
end

local lastToggle: { [Player]: number } = {}
toggle.OnServerEvent:Connect(function(player, on)
	if type(on) ~= "boolean" then
		return
	end
	local now = os.clock()
	if lastToggle[player] and now - lastToggle[player] < 0.1 then
		return
	end
	lastToggle[player] = now
	local character = player.Character
	local head = character and character:FindFirstChild("Head")
	local light = head and head:FindFirstChild("Flashlight")
	if character and light and light:IsA("SpotLight") then
		light.Enabled = on
		character:SetAttribute("Flashlight", on)
	end
end)
Players.PlayerRemoving:Connect(function(p)
	lastToggle[p] = nil
end)
