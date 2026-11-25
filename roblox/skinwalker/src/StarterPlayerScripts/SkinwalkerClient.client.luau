-- Player-side helpers for the skinwalker:
--   * tells the server where your camera is pointing (it freezes when you look at it)
--   * plays the small blood spray when it hits someone, and a red flash + shake when it hits you
--   * shows its hunger meter at the top of the screen (and its brain state above it, in DEBUG)
-- Blood is kept brief and small on purpose (light realistic blood -> "Moderate" content label).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local Config = require(ReplicatedStorage:WaitForChild("SkinwalkerConfig"))
local LookRemote = ReplicatedStorage:WaitForChild("SkinwalkerLook") :: RemoteEvent
local FxRemote = ReplicatedStorage:WaitForChild("SkinwalkerFX") :: RemoteEvent

-------------------------------------------------------------------------------- camera look reporting
task.spawn(function()
	while true do
		local cam = workspace.CurrentCamera
		if cam and player.Character then
			LookRemote:FireServer(cam.CFrame.Position, cam.CFrame.LookVector)
		end
		task.wait(0.2)
	end
end)

-------------------------------------------------------------------------------- blood spray (small, brief)
local BLOOD = Color3.fromRGB(105, 6, 8)
local function spray(at: Vector3, dir: Vector3)
	local folder = workspace:FindFirstChild("SkinwalkerFX") or Instance.new("Folder")
	folder.Name = "SkinwalkerFX"
	folder.Parent = workspace
	local rng = Random.new()
	for _ = 1, 10 do
		local drop = Instance.new("Part")
		drop.Shape = Enum.PartType.Ball
		local s = rng:NextNumber(0.1, 0.22)
		drop.Size = Vector3.new(s, s, s)
		drop.Color = BLOOD
		drop.Material = Enum.Material.SmoothPlastic
		drop.Reflectance = 0.15
		drop.CanCollide = false
		drop.CanQuery = false
		drop.CanTouch = false
		drop.CastShadow = false
		drop.Position = at + Vector3.new(rng:NextNumber(-0.3, 0.3), rng:NextNumber(-0.3, 0.3), rng:NextNumber(-0.3, 0.3))
		local spread = Vector3.new(rng:NextNumber(-0.6, 0.6), rng:NextNumber(0.2, 0.9), rng:NextNumber(-0.6, 0.6))
		drop.AssemblyLinearVelocity = (dir + spread).Unit * rng:NextNumber(10, 18)
		drop.Parent = folder
		TweenService:Create(drop, TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{ Size = Vector3.new(0.02, 0.02, 0.02), Transparency = 1 }):Play()
		Debris:AddItem(drop, 0.85)
	end
end

-------------------------------------------------------------------------------- hurt feedback (no blood on screen)
local gui = Instance.new("ScreenGui")
gui.Name = "SkinwalkerHud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local flash = Instance.new("Frame")
flash.Size = UDim2.fromScale(1, 1)
flash.BackgroundColor3 = Color3.fromRGB(120, 0, 0)
flash.BackgroundTransparency = 1
flash.BorderSizePixel = 0
flash.ZIndex = 1
flash.Parent = gui

local shake = 0
local function hurt()
	flash.BackgroundTransparency = 0.55
	TweenService:Create(flash, TweenInfo.new(0.6), { BackgroundTransparency = 1 }):Play()
	shake = 0.6
end
RunService:BindToRenderStep("SkinwalkerShake", Enum.RenderPriority.Camera.Value + 1, function(dt)
	if shake > 0 then
		shake = math.max(0, shake - dt)
		local cam = workspace.CurrentCamera
		if cam then
			local k = shake * 0.5
			cam.CFrame *= CFrame.Angles(math.random() * k * 0.1 - k * 0.05, math.random() * k * 0.1 - k * 0.05, 0)
		end
	end
end)

FxRemote.OnClientEvent:Connect(function(kind, a, b)
	if kind == "blood" and typeof(a) == "Vector3" and typeof(b) == "Vector3" then
		spray(a, b)
	elseif kind == "hurt" then
		hurt()
	end
end)

-------------------------------------------------------------------------------- hunger meter
local panel = Instance.new("Frame")
panel.AnchorPoint = Vector2.new(0.5, 0)
panel.Position = UDim2.new(0.5, 0, 0, 52)
panel.Size = UDim2.fromOffset(300, 44)
panel.BackgroundColor3 = Color3.fromRGB(15, 12, 12)
panel.BackgroundTransparency = 0.25
panel.BorderSizePixel = 0
panel.ZIndex = 2
panel.Parent = gui
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 8)

local label = Instance.new("TextLabel")
label.BackgroundTransparency = 1
label.Position = UDim2.fromOffset(10, 2)
label.Size = UDim2.new(1, -20, 0, 18)
label.Font = Enum.Font.GothamBold
label.TextSize = 13
label.TextXAlignment = Enum.TextXAlignment.Left
label.TextColor3 = Color3.fromRGB(230, 220, 210)
label.Text = "SKINWALKER HUNGER"
label.ZIndex = 3
label.Parent = panel

local stateLabel = label:Clone()
stateLabel.TextXAlignment = Enum.TextXAlignment.Right
stateLabel.Font = Enum.Font.Gotham
stateLabel.TextColor3 = Color3.fromRGB(190, 170, 160)
stateLabel.Text = ""
stateLabel.Parent = panel

local track = Instance.new("Frame")
track.Position = UDim2.fromOffset(10, 24)
track.Size = UDim2.new(1, -20, 0, 12)
track.BackgroundColor3 = Color3.fromRGB(45, 35, 35)
track.BorderSizePixel = 0
track.ZIndex = 3
track.Parent = panel
Instance.new("UICorner", track).CornerRadius = UDim.new(0, 6)

local fill = Instance.new("Frame")
fill.Size = UDim2.fromScale(1, 1)
fill.BackgroundColor3 = Color3.fromRGB(160, 30, 25)
fill.BorderSizePixel = 0
fill.ZIndex = 4
fill.Parent = track
Instance.new("UICorner", fill).CornerRadius = UDim.new(0, 6)

local banner = Instance.new("TextLabel")
banner.AnchorPoint = Vector2.new(0.5, 0.5)
banner.Position = UDim2.fromScale(0.5, 0.4)
banner.Size = UDim2.fromOffset(600, 60)
banner.BackgroundTransparency = 1
banner.Font = Enum.Font.GothamBlack
banner.TextSize = 34
banner.TextColor3 = Color3.fromRGB(230, 220, 210)
banner.TextStrokeTransparency = 0.4
banner.TextTransparency = 1
banner.Text = "IT STARVED TO DEATH"
banner.ZIndex = 5
banner.Parent = gui

-- debug: brain state floating over its head
local billboard: BillboardGui? = nil
local function ensureBillboard(model: Model)
	if not Config.DEBUG or billboard then
		return
	end
	local head = model:FindFirstChild("Head")
	if not head then
		return
	end
	local bb = Instance.new("BillboardGui")
	bb.Name = "SkinwalkerBrain"
	bb.Size = UDim2.fromOffset(260, 50)
	bb.StudsOffsetWorldSpace = Vector3.new(0, 4, 0)
	bb.AlwaysOnTop = true
	bb.Adornee = head :: BasePart
	local t = Instance.new("TextLabel")
	t.Name = "Text"
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Font = Enum.Font.GothamBold
	t.TextSize = 14
	t.TextColor3 = Color3.fromRGB(255, 235, 200)
	t.TextStrokeTransparency = 0.3
	t.TextWrapped = true
	t.Parent = bb
	bb.Parent = gui
	billboard = bb
end

local wasDead = false
RunService.Heartbeat:Connect(function()
	local model = workspace:FindFirstChild("Skinwalker")
	if not model then
		panel.Visible = false
		return
	end
	panel.Visible = true
	ensureBillboard(model)
	local hunger = tonumber(model:GetAttribute("Hunger")) or 0
	local state = tostring(model:GetAttribute("State") or "")
	local dead = model:GetAttribute("Dead") == true
	local k = math.clamp(hunger / Config.HUNGER_MAX, 0, 1)
	fill.Size = UDim2.fromScale(k, 1)
	fill.BackgroundColor3 = if hunger <= Config.DESPERATE_AT
		then Color3.fromRGB(255, 70, 40)
		else Color3.fromRGB(160, 30, 25)
	stateLabel.Text = if dead then "dead" elseif hunger <= Config.DESPERATE_AT then "STARVING" else ("%d%%"):format(math.floor(hunger + 0.5))
	if dead and not wasDead then
		banner.TextTransparency = 0
		TweenService:Create(banner, TweenInfo.new(4, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { TextTransparency = 1 }):Play()
	end
	wasDead = dead
	if billboard then
		local t = billboard:FindFirstChild("Text") :: TextLabel?
		if t then
			local n = tostring(model:GetAttribute("Note") or "")
			t.Text = string.upper(state) .. (if n ~= "" then "\n" .. n else "")
		end
	end
end)
