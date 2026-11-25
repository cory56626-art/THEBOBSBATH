-- Survival controls for the player:
--   * Sprint (hold Shift on keyboard, tap RUN on mobile) uses stamina; run dry and you're winded for a while
--   * Flashlight (F on keyboard, tap LIGHT on mobile) drains a battery that slowly recharges while off
--   * the flashlight flickers when the skinwalker is hunting close by
--   * a heartbeat pulse darkens the screen edges as it gets closer

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ContextActionService = game:GetService("ContextActionService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local FlashlightToggle = ReplicatedStorage:WaitForChild("FlashlightToggle") :: RemoteEvent

local WALK, SPRINT, WINDED = 16, 26, 12
local STAMINA_DRAIN, STAMINA_REGEN, REGEN_DELAY = 15, 17, 1.0
local RECOVER_AT = 35
local BATTERY_DRAIN, BATTERY_RECHARGE = 0.55, 0.3

local stamina, battery = 100, 100
local sprintHeld, sprintToggled = false, false
local winded = false
local sinceSprint = 99
local lightOn = false

-------------------------------------------------------------------------------- flashlight (local beam follows the camera)
local beamPart = Instance.new("Part")
beamPart.Name = "FlashlightBeam"
beamPart.Anchored = true
beamPart.CanCollide = false
beamPart.CanQuery = false
beamPart.CanTouch = false
beamPart.Transparency = 1
beamPart.Size = Vector3.new(0.2, 0.2, 0.2)
local beam = Instance.new("SpotLight")
beam.Face = Enum.NormalId.Front
beam.Angle = 50
beam.Range = 70
beam.Brightness = 3.2
beam.Color = Color3.fromRGB(255, 244, 220)
beam.Shadows = true
beam.Enabled = false
beam.Parent = beamPart

local function setLight(on: boolean)
	if on and battery <= 0 then
		on = false
	end
	if lightOn == on then
		return
	end
	lightOn = on
	beam.Enabled = on
	FlashlightToggle:FireServer(on)
end

-------------------------------------------------------------------------------- input
local function onSprint(_, inputState: Enum.UserInputState, input: InputObject)
	if input.UserInputType == Enum.UserInputType.Touch then
		if inputState == Enum.UserInputState.Begin then
			sprintToggled = not sprintToggled
		end
	else
		sprintHeld = inputState == Enum.UserInputState.Begin
	end
	return Enum.ContextActionResult.Sink
end
local function onLight(_, inputState: Enum.UserInputState)
	if inputState == Enum.UserInputState.Begin then
		setLight(not lightOn)
	end
	return Enum.ContextActionResult.Sink
end
ContextActionService:BindAction("Sprint", onSprint, true, Enum.KeyCode.LeftShift, Enum.KeyCode.ButtonL3)
ContextActionService:BindAction("Flashlight", onLight, true, Enum.KeyCode.F, Enum.KeyCode.ButtonY)
ContextActionService:SetTitle("Sprint", "RUN")
ContextActionService:SetTitle("Flashlight", "LIGHT")

-------------------------------------------------------------------------------- HUD
local gui = Instance.new("ScreenGui")
gui.Name = "SurvivalHud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local function bar(name: string, y: number, color: Color3)
	local holder = Instance.new("Frame")
	holder.Name = name
	holder.AnchorPoint = Vector2.new(0.5, 1)
	holder.Position = UDim2.new(0.5, 0, 1, y)
	holder.Size = UDim2.fromOffset(220, 16)
	holder.BackgroundColor3 = Color3.fromRGB(15, 13, 13)
	holder.BackgroundTransparency = 0.3
	holder.BorderSizePixel = 0
	holder.Parent = gui
	Instance.new("UICorner", holder).CornerRadius = UDim.new(0, 6)
	local fill = Instance.new("Frame")
	fill.Name = "Fill"
	fill.Position = UDim2.fromOffset(3, 3)
	fill.Size = UDim2.new(1, -6, 1, -6)
	fill.BackgroundColor3 = color
	fill.BorderSizePixel = 0
	fill.Parent = holder
	Instance.new("UICorner", fill).CornerRadius = UDim.new(0, 4)
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.Font = Enum.Font.GothamBold
	label.TextSize = 11
	label.TextColor3 = Color3.fromRGB(240, 235, 230)
	label.TextStrokeTransparency = 0.5
	label.Text = name
	label.ZIndex = 3
	label.Parent = holder
	return fill, label
end
local staminaFill = bar("STAMINA", -30, Color3.fromRGB(200, 200, 190))
local batteryFill, batteryLabel = bar("BATTERY", -52, Color3.fromRGB(230, 200, 90))

if UserInputService.KeyboardEnabled and not UserInputService.TouchEnabled then
	local hint = Instance.new("TextLabel")
	hint.BackgroundTransparency = 1
	hint.AnchorPoint = Vector2.new(0.5, 1)
	hint.Position = UDim2.new(0.5, 0, 1, -72)
	hint.Size = UDim2.fromOffset(300, 16)
	hint.Font = Enum.Font.Gotham
	hint.TextSize = 12
	hint.TextColor3 = Color3.fromRGB(220, 215, 210)
	hint.TextTransparency = 0.3
	hint.Text = "Shift: run    F: flashlight"
	hint.Parent = gui
end

-- heartbeat vignette: four edge frames with gradients
local edges = {}
for _, spec in { { "Top", UDim2.new(1, 0, 0.35, 0), UDim2.new(0, 0, 0, 0), 90 },
	{ "Bottom", UDim2.new(1, 0, 0.35, 0), UDim2.new(0, 0, 0.65, 0), -90 },
	{ "Left", UDim2.new(0.3, 0, 1, 0), UDim2.new(0, 0, 0, 0), 0 },
	{ "Right", UDim2.new(0.3, 0, 1, 0), UDim2.new(0.7, 0, 0, 0), 180 } } do
	local f = Instance.new("Frame")
	f.Name = "Vignette" .. spec[1]
	f.Size = spec[2]
	f.Position = spec[3]
	f.BackgroundColor3 = Color3.fromRGB(40, 0, 0)
	f.BorderSizePixel = 0
	f.BackgroundTransparency = 1
	f.ZIndex = 0
	local g = Instance.new("UIGradient")
	g.Rotation = spec[4]
	g.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(1, 1) })
	g.Parent = f
	f.Parent = gui
	table.insert(edges, f)
end

-------------------------------------------------------------------------------- per frame
local HUNTING = { Stalk = true, Chase = true, Wiggle = true, Pounce = true, Attack = true, Toy = true }
local beat = 0
local flickerUntil = 0

RunService.RenderStepped:Connect(function(dt)
	dt = math.min(dt, 0.1)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	local cam = workspace.CurrentCamera

	-- stamina
	local moving = hum ~= nil and hum.MoveDirection.Magnitude > 0.1
	local wantSprint = (sprintHeld or sprintToggled) and moving and not winded
	if wantSprint then
		stamina = math.max(0, stamina - STAMINA_DRAIN * dt)
		sinceSprint = 0
		if stamina <= 0 then
			winded = true
			sprintToggled = false
		end
	else
		sinceSprint += dt
		if sinceSprint > REGEN_DELAY then
			stamina = math.min(100, stamina + STAMINA_REGEN * dt * (if moving then 0.6 else 1))
		end
		if winded and stamina >= RECOVER_AT then
			winded = false
		end
	end
	if hum and hum.Health > 0 then
		hum.WalkSpeed = if wantSprint then SPRINT elseif winded then WINDED else WALK
	end
	staminaFill.Size = UDim2.new(math.max(0.02, stamina / 100), -6, 1, -6)
	staminaFill.BackgroundColor3 = if winded then Color3.fromRGB(170, 60, 50) else Color3.fromRGB(200, 200, 190)

	-- battery
	if lightOn then
		battery = math.max(0, battery - BATTERY_DRAIN * dt)
		if battery <= 0 then
			setLight(false)
		end
	else
		battery = math.min(100, battery + BATTERY_RECHARGE * dt)
	end
	batteryFill.Size = UDim2.new(math.max(0.02, battery / 100), -6, 1, -6)
	batteryLabel.Text = if lightOn then "BATTERY  (on)" else "BATTERY"

	-- beam follows the camera; hide our own head light locally (other players still see it)
	if cam then
		beamPart.Parent = cam
		beamPart.CFrame = cam.CFrame * CFrame.new(0.6, -0.5, 0)
	end
	local head = char and char:FindFirstChild("Head")
	local headLight = head and head:FindFirstChild("Flashlight")
	if headLight and headLight:IsA("SpotLight") then
		headLight.Enabled = false
	end

	-- the skinwalker nearby: flicker + heartbeat
	local sw = workspace:FindFirstChild("Skinwalker")
	local swRoot = sw and (sw :: Model).PrimaryPart
	local closeness = 0
	if sw and swRoot and root and sw:GetAttribute("Dead") ~= true then
		local d = (swRoot.Position - root.Position).Magnitude
		local hunting = HUNTING[sw:GetAttribute("State") or ""] == true
		closeness = math.clamp(1 - d / (if hunting then 55 else 30), 0, 1)
		if hunting and d < 50 and lightOn and os.clock() > flickerUntil and math.random() < dt * 2.5 then
			flickerUntil = os.clock() + math.random() * 0.35 + 0.05
		end
	end
	local flicker = os.clock() < flickerUntil or (battery < 15 and math.random() < 0.08)
	beam.Brightness = if flicker then (if math.random() < 0.5 then 0 else 0.6) else 3.2

	local bpm = 60 + closeness * 90
	beat += dt * bpm / 60
	local pulse = math.max(0, math.sin(beat * math.pi * 2)) ^ 6
	local alpha = closeness * (0.45 + pulse * 0.4)
	for _, f in edges do
		f.BackgroundTransparency = 1 - alpha
	end
end)

player.CharacterAdded:Connect(function()
	lightOn = false
	beam.Enabled = false
	stamina = 100
	winded = false
	sprintToggled = false
end)
