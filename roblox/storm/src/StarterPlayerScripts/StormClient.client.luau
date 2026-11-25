-- Steal a Storm on this client: draws every storm and storm spirit, the Catch / Steal / Sell prompts, the cash
-- HUD, the upgrade shop, the base lock button, messages and sounds, the arrow home while you carry a storm,
-- knockbacks, and the sky darkening as you head into the Eye of the Storm.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local Data = require(ReplicatedStorage:WaitForChild("StormData"))
local Visuals = require(ReplicatedStorage:WaitForChild("StormVisuals"))
local Bank = require(ReplicatedStorage:WaitForChild("StormSoundBank"))
local remotes = ReplicatedStorage:WaitForChild("StormRemotes")
local Interact = remotes:WaitForChild("Interact") :: RemoteEvent
local Buy = remotes:WaitForChild("Buy") :: RemoteEvent
local LockRemote = remotes:WaitForChild("Lock") :: RemoteEvent
local Notify = remotes:WaitForChild("Notify") :: RemoteEvent
local Knock = remotes:WaitForChild("Knock") :: RemoteEvent

local visFolder = Instance.new("Folder")
visFolder.Name = "StormVisuals"
visFolder.Parent = workspace

---------------------------------------------------------------- sounds
local function playSound(name: string, volume: number?, at: Vector3?)
	local r = Bank.Regions[name]
	if not r then
		return
	end
	local snd = Instance.new("Sound")
	snd.SoundId = Bank.Id
	snd.PlaybackRegionsEnabled = true
	snd.PlaybackRegion = NumberRange.new(r[1], r[2])
	snd.Volume = volume or 0.7
	snd.PlaybackSpeed = 0.96 + math.random() * 0.08
	local holder: Instance = workspace.CurrentCamera
	if at then
		local att = Instance.new("Attachment")
		att.WorldPosition = at
		att.Parent = workspace.Terrain
		snd.RollOffMaxDistance = 120
		holder = att
	end
	snd.Parent = holder
	snd:Play()
	task.delay(r[2] - r[1] + 0.5, function()
		if holder:IsA("Attachment") then
			holder:Destroy()
		else
			snd:Destroy()
		end
	end)
end

---------------------------------------------------------------- UI toolkit
local function make(class: string, props: { [string]: any }, parent: Instance?): any
	local inst = Instance.new(class)
	for k, v in props do
		(inst :: any)[k] = v
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end
local function corner(p: Instance, r: number?)
	make("UICorner", { CornerRadius = UDim.new(0, r or 12) }, p)
end
local function stroke(p: Instance, color: Color3?, thick: number?)
	make("UIStroke", { Color = color or Color3.new(0, 0, 0), Thickness = thick or 2, ApplyStrokeMode = Enum.ApplyStrokeMode.Border },
		p)
end
local function textStroke(p: Instance)
	make("UIStroke", { Color = Color3.fromRGB(20, 20, 40), Thickness = 2 }, p)
end

local gui = make("ScreenGui", { Name = "StormUI", ResetOnSpawn = false, ZIndexBehavior = Enum.ZIndexBehavior.Sibling },
	player:WaitForChild("PlayerGui"))

-- cash
local cashLabel = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 4),
	Size = UDim2.new(0, 300, 0, 46), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne, TextSize = 40,
	TextColor3 = Color3.fromRGB(120, 255, 130), Text = "$0" }, gui)
textStroke(cashLabel)
local incomeLabel = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 46),
	Size = UDim2.new(0, 300, 0, 22), BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 18,
	TextColor3 = Color3.fromRGB(230, 255, 230), Text = "+$0/s" }, gui)
textStroke(incomeLabel)

-- side buttons
local side = make("Frame", { AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -10, 0.5, 0),
	Size = UDim2.new(0, 120, 0, 140), BackgroundTransparency = 1 }, gui)
make("UIListLayout", { Padding = UDim.new(0, 10), HorizontalAlignment = Enum.HorizontalAlignment.Right }, side)
local function sideButton(text: string, color: Color3, order: number): TextButton
	local b = make("TextButton", { LayoutOrder = order, Size = UDim2.new(0, 120, 0, 56), BackgroundColor3 = color,
		Font = Enum.Font.FredokaOne, TextSize = 20, TextColor3 = Color3.new(1, 1, 1), Text = text, AutoButtonColor = true }, side)
	corner(b, 14)
	stroke(b, Color3.fromRGB(20, 20, 40), 3)
	textStroke(b)
	return b
end
local upgradesButton = sideButton("UPGRADES", Color3.fromRGB(255, 170, 40), 1)
local lockButton = sideButton("LOCK BASE", Color3.fromRGB(230, 60, 80), 2)

-- toasts
local toastHolder = make("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 74),
	Size = UDim2.new(0, 520, 0, 200), BackgroundTransparency = 1 }, gui)
make("UIListLayout", { Padding = UDim.new(0, 6), HorizontalAlignment = Enum.HorizontalAlignment.Center }, toastHolder)
local function toast(text: string, color: Color3?)
	local l = make("TextLabel", { AutomaticSize = Enum.AutomaticSize.XY, Size = UDim2.new(0, 0, 0, 0),
		BackgroundColor3 = Color3.fromRGB(25, 25, 45), BackgroundTransparency = 0.15, Font = Enum.Font.GothamBold,
		TextSize = 18, TextColor3 = color or Color3.new(1, 1, 1), Text = text, TextWrapped = false }, toastHolder)
	make("UIPadding", { PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12), PaddingTop = UDim.new(0, 6),
		PaddingBottom = UDim.new(0, 6) }, l)
	corner(l, 10)
	local kids = toastHolder:GetChildren()
	local count = 0
	for _, k in kids do
		if k:IsA("TextLabel") then
			count += 1
		end
	end
	if count > 4 then
		for _, k in kids do
			if k:IsA("TextLabel") and k ~= l then
				k:Destroy()
				break
			end
		end
	end
	task.delay(3.5, function()
		if l.Parent then
			TweenService:Create(l, TweenInfo.new(0.4), { TextTransparency = 1, BackgroundTransparency = 1 }):Play()
			task.wait(0.45)
			l:Destroy()
		end
	end)
end

-- carrying banner
local carryLabel = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -16),
	AutomaticSize = Enum.AutomaticSize.X, Size = UDim2.new(0, 0, 0, 42), BackgroundColor3 = Color3.fromRGB(25, 25, 45),
	BackgroundTransparency = 0.15, Font = Enum.Font.FredokaOne, TextSize = 22, TextColor3 = Color3.new(1, 1, 1), Text = "",
	Visible = false }, gui)
make("UIPadding", { PaddingLeft = UDim.new(0, 16), PaddingRight = UDim.new(0, 16) }, carryLabel)
corner(carryLabel, 12)

-- danger glow at the screen edges when spirits are close
local danger = make("Frame", { Position = UDim2.new(0, 18, 0, 18), Size = UDim2.new(1, -36, 1, -36),
	BackgroundTransparency = 1, Active = false }, gui)
local dangerStroke = make("UIStroke", { Color = Color3.fromRGB(255, 30, 40), Thickness = 0, Transparency = 0.2 }, danger)

-- upgrade shop
local shop = make("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.52),
	Size = UDim2.new(0, 600, 0, 270), BackgroundColor3 = Color3.fromRGB(35, 35, 60), Visible = false }, gui)
make("UISizeConstraint", { MaxSize = Vector2.new(600, 270) }, shop)
local shopScale = make("UIScale", { Name = "Scale", Scale = 1 }, shop) :: UIScale
corner(shop, 18)
stroke(shop, Color3.fromRGB(20, 20, 40), 4)
local shopTitle = make("TextLabel", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne,
	TextSize = 30, TextColor3 = Color3.fromRGB(255, 200, 70), Text = "UPGRADES" }, shop)
textStroke(shopTitle)
local close = make("TextButton", { AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -8, 0, 8),
	Size = UDim2.new(0, 36, 0, 36), BackgroundColor3 = Color3.fromRGB(230, 60, 80), Font = Enum.Font.FredokaOne,
	TextSize = 22, TextColor3 = Color3.new(1, 1, 1), Text = "X" }, shop)
corner(close, 10)
local cards = make("Frame", { Position = UDim2.new(0, 12, 0, 52), Size = UDim2.new(1, -24, 1, -64),
	BackgroundTransparency = 1 }, shop)
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 12),
	HorizontalAlignment = Enum.HorizontalAlignment.Center }, cards)

local cardUi = {}
local CARD_INFO = {
	{ id = "Speed", color = Color3.fromRGB(70, 170, 255), attr = "SpeedLv" },
	{ id = "Carry", color = Color3.fromRGB(190, 100, 255), attr = "CarryLv" },
	{ id = "Money", color = Color3.fromRGB(80, 210, 100), attr = "MoneyLv" },
}
for i, info in CARD_INFO do
	local card = make("Frame", { LayoutOrder = i, Size = UDim2.new(0, 180, 1, 0), BackgroundColor3 = info.color }, cards)
	corner(card, 14)
	stroke(card, Color3.fromRGB(20, 20, 40), 3)
	local title = make("TextLabel", { Size = UDim2.new(1, 0, 0, 34), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne,
		TextSize = 24, TextColor3 = Color3.new(1, 1, 1), Text = Data.UPGRADES[info.id].name }, card)
	textStroke(title)
	local level = make("TextLabel", { Position = UDim2.new(0, 0, 0, 34), Size = UDim2.new(1, 0, 0, 22),
		BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 16, TextColor3 = Color3.new(1, 1, 1), Text = "" }, card)
	local effect = make("TextLabel", { Position = UDim2.new(0, 6, 0, 58), Size = UDim2.new(1, -12, 0, 60),
		BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 16, TextWrapped = true,
		TextColor3 = Color3.fromRGB(255, 255, 230), Text = "" }, card)
	textStroke(effect)
	local buy = make("TextButton", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -10),
		Size = UDim2.new(1, -20, 0, 46), BackgroundColor3 = Color3.fromRGB(255, 220, 60), Font = Enum.Font.FredokaOne,
		TextSize = 22, TextColor3 = Color3.fromRGB(40, 30, 10), Text = "" }, card)
	corner(buy, 12)
	stroke(buy, Color3.fromRGB(20, 20, 40), 2)
	buy.Activated:Connect(function()
		Buy:FireServer(info.id)
	end)
	cardUi[info.id] = { level = level, effect = effect, buy = buy, attr = info.attr }
end

local function refreshShop()
	local cash = player:GetAttribute("Cash") or 0
	for id, ui in cardUi do
		local U = Data.UPGRADES[id]
		local lv = player:GetAttribute(ui.attr) or 0
		ui.level.Text = "Level " .. lv .. (if lv >= U.max then " (MAX)" else "")
		if id == "Speed" then
			ui.effect.Text = ("Run speed %d -> %d"):format(U.value(lv), U.value(math.min(lv + 1, U.max)))
		elseif id == "Carry" then
			ui.effect.Text = "Can carry: " .. Data.RARITIES[U.value(lv)].name
				.. (if lv < U.max then "\nNext: " .. Data.RARITIES[U.value(lv + 1)].name else "")
		else
			ui.effect.Text = ("Income x%.1f -> x%.1f"):format(U.value(lv), U.value(math.min(lv + 1, U.max)))
		end
		if lv >= U.max then
			ui.buy.Text = "MAXED"
			ui.buy.BackgroundColor3 = Color3.fromRGB(150, 150, 150)
		else
			local cost = U.cost(lv)
			ui.buy.Text = Data.money(cost)
			ui.buy.BackgroundColor3 = if cash >= cost then Color3.fromRGB(255, 220, 60) else Color3.fromRGB(190, 170, 120)
		end
	end
end

upgradesButton.Activated:Connect(function()
	shop.Visible = not shop.Visible
	refreshShop()
end)
close.Activated:Connect(function()
	shop.Visible = false
end)
lockButton.Activated:Connect(function()
	LockRemote:FireServer()
end)

local function refreshCash()
	cashLabel.Text = Data.money(player:GetAttribute("Cash") or 0)
	incomeLabel.Text = "+" .. Data.money(player:GetAttribute("Income") or 0) .. "/s"
	if shop.Visible then
		refreshShop()
	end
end
for _, a in { "Cash", "Income", "SpeedLv", "CarryLv", "MoneyLv" } do
	player:GetAttributeChangedSignal(a):Connect(refreshCash)
end
refreshCash()

---------------------------------------------------------------- messages, sounds, knockback
local SOUND_COLOR = {
	Error = Color3.fromRGB(255, 140, 140),
	Alarm = Color3.fromRGB(255, 90, 90),
	Announce = Color3.fromRGB(255, 220, 90),
	Upgrade = Color3.fromRGB(140, 255, 160),
	Place = Color3.fromRGB(140, 255, 160),
	Steal = Color3.fromRGB(255, 200, 90),
}
Notify.OnClientEvent:Connect(function(text, sound)
	if type(text) == "string" then
		toast(text, SOUND_COLOR[sound])
	end
	if type(sound) == "string" then
		playSound(sound, if sound == "Announce" or sound == "Alarm" then 0.9 else 0.7)
	end
end)

Knock.OnClientEvent:Connect(function(dir)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if not hum or not hrp or typeof(dir) ~= "Vector3" then
		return
	end
	local flat = Vector3.new(dir.X, 0, dir.Z)
	flat = if flat.Magnitude > 0.01 then flat.Unit else Vector3.zAxis
	hum.PlatformStand = true
	hrp.AssemblyLinearVelocity = flat * 45 + Vector3.new(0, 38, 0)
	hrp.AssemblyAngularVelocity = Vector3.new(flat.Z, 0, -flat.X) * 8
	task.delay(1.1, function()
		if hum.Parent then
			hum.PlatformStand = false
			hum:ChangeState(Enum.HumanoidStateType.GettingUp)
		end
	end)
end)

---------------------------------------------------------------- storms on screen
type Shown = { root: BasePart, vis: any, label: BillboardGui, prompt: ProximityPrompt?, action: string?, seed: number }
local shown: { [BasePart]: Shown } = {}

local function promptFor(s: Shown)
	local root = s.root
	local state = root:GetAttribute("State")
	local kind = root:GetAttribute("Kind")
	local info = Data.KINDS[kind]
	if not info then
		return
	end
	local rarity = Data.RARITIES[info.rarity]
	local action, text, hold = nil, nil, rarity.hold
	if state == "wild" then
		action, text = "catch", "Catch"
	elseif state == "placed" then
		if root:GetAttribute("Owner") == player.UserId then
			local price = Data.income(kind, root:GetAttribute("Mutation")) * Data.SELL_SECONDS
			action, text, hold = "sell", "Sell " .. Data.money(price), 1
		else
			action, text, hold = "steal", "Steal", rarity.hold + 0.4
		end
	end
	if action == s.action then
		return
	end
	if s.prompt then
		s.prompt:Destroy()
		s.prompt = nil
	end
	s.action = action
	if not action then
		return
	end
	local p = Instance.new("ProximityPrompt")
	p.ActionText = text :: string
	p.ObjectText = (if root:GetAttribute("Mutation") == "Golden" then "Golden " else "") .. info.name
	p.HoldDuration = hold
	p.MaxActivationDistance = 13
	p.RequiresLineOfSight = false
	p.UIOffset = Vector2.new(0, 40)
	p.Triggered:Connect(function()
		Interact:FireServer(root, action)
	end)
	p.Parent = root
	s.prompt = p
end

local function labelFor(root: BasePart): BillboardGui
	local kind = root:GetAttribute("Kind")
	local info = Data.KINDS[kind] or Data.KINDS.Drizzle
	local rarity = Data.RARITIES[info.rarity]
	local golden = root:GetAttribute("Mutation") == "Golden"
	local bb = make("BillboardGui", { Name = "Label", Size = UDim2.new(0, 180, 0, 62), StudsOffset = Vector3.new(0, 5, 0),
		MaxDistance = 90, AlwaysOnTop = false, LightInfluence = 0, Adornee = root }, visFolder)
	local name = make("TextLabel", { Size = UDim2.new(1, 0, 0.42, 0), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne,
		TextScaled = true, TextColor3 = if golden then Data.MUTATIONS.Golden.color else Color3.new(1, 1, 1),
		Text = (if golden then "Golden " else "") .. info.name }, bb)
	textStroke(name)
	local rar = make("TextLabel", { Position = UDim2.new(0, 0, 0.42, 0), Size = UDim2.new(1, 0, 0.3, 0), BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold, TextScaled = true, TextColor3 = rarity.color, Text = rarity.name }, bb)
	textStroke(rar)
	local inc = make("TextLabel", { Position = UDim2.new(0, 0, 0.72, 0), Size = UDim2.new(1, 0, 0.28, 0), BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold, TextScaled = true, TextColor3 = Color3.fromRGB(130, 255, 140),
		Text = Data.money(Data.income(kind, root:GetAttribute("Mutation"))) .. "/s" }, bb)
	textStroke(inc)
	return bb
end

local seedCounter = 0
local function addStorm(root: Instance)
	if not root:IsA("BasePart") or shown[root] then
		return
	end
	seedCounter += 1
	local vis = Visuals.storm(root:GetAttribute("Kind") or "Drizzle", root:GetAttribute("Mutation"), seedCounter)
	vis.model.Parent = visFolder
	local s: Shown = { root = root, vis = vis, label = labelFor(root), prompt = nil, action = nil, seed = seedCounter * 1.37 }
	shown[root] = s
	promptFor(s)
	local function refresh()
		promptFor(s)
		s.label.Enabled = root:GetAttribute("State") ~= "carried" or root:GetAttribute("Carrier") ~= player.UserId
	end
	root:GetAttributeChangedSignal("State"):Connect(refresh)
	root:GetAttributeChangedSignal("Owner"):Connect(refresh)
	refresh()
end
local function removeStorm(root: Instance)
	local s = shown[root :: BasePart]
	if s then
		shown[root :: BasePart] = nil
		s.vis.model:Destroy()
		s.label:Destroy()
	end
end
CollectionService:GetInstanceAddedSignal("Storm"):Connect(addStorm)
CollectionService:GetInstanceRemovedSignal("Storm"):Connect(removeStorm)
for _, r in CollectionService:GetTagged("Storm") do
	addStorm(r)
end

-- storm spirits
local spirits: { [BasePart]: any } = {}
local function addSpirit(body: Instance)
	if not body:IsA("BasePart") or spirits[body] then
		return
	end
	seedCounter += 1
	local vis = Visuals.spirit(body:GetAttribute("Rarity") or 1, seedCounter)
	vis.model.Parent = visFolder
	spirits[body] = vis
	playSound("Howl", 0.6, body.Position)
end
local function removeSpirit(body: Instance)
	local vis = spirits[body :: BasePart]
	if vis then
		spirits[body :: BasePart] = nil
		vis.model:Destroy()
	end
end
CollectionService:GetInstanceAddedSignal("Chaser"):Connect(addSpirit)
CollectionService:GetInstanceRemovedSignal("Chaser"):Connect(removeSpirit)
for _, b in CollectionService:GetTagged("Chaser") do
	addSpirit(b)
end

---------------------------------------------------------------- carrying: banner + arrow home
local beam: Beam? = nil
local beamTarget: Attachment? = nil
local function myPlotPad(): BasePart?
	local idx = player:GetAttribute("Plot")
	local plots = workspace:FindFirstChild("Plots")
	if not idx or not plots then
		return nil
	end
	local plot = plots:FindFirstChild("Plot" .. idx)
	return plot and plot:FindFirstChild("SpawnPad") :: BasePart?
end

local function refreshCarry()
	local kind = player:GetAttribute("Carrying")
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if beam then
		beam:Destroy()
		beam = nil
	end
	if beamTarget then
		beamTarget:Destroy()
		beamTarget = nil
	end
	if type(kind) ~= "string" or kind == "" or not Data.KINDS[kind] then
		carryLabel.Visible = false
		return
	end
	local info = Data.KINDS[kind]
	carryLabel.Text = "Carrying " .. info.name .. "! Get it to your base!"
	carryLabel.TextColor3 = Data.RARITIES[info.rarity].color
	carryLabel.Visible = true
	local pad = myPlotPad()
	if hrp and pad then
		local a0 = Instance.new("Attachment")
		a0.Name = "GuideFrom"
		a0.Parent = hrp
		local a1 = Instance.new("Attachment")
		a1.WorldPosition = pad.Position + Vector3.new(0, 2, 0)
		a1.Parent = workspace.Terrain
		local b = Instance.new("Beam")
		b.Attachment0 = a0
		b.Attachment1 = a1
		b.Width0, b.Width1 = 0.8, 0.8
		b.FaceCamera = true
		b.LightEmission = 1
		b.Transparency = NumberSequence.new(0.35)
		b.Color = ColorSequence.new(Color3.fromRGB(120, 255, 140))
		b.Segments = 20
		b.CurveSize0, b.CurveSize1 = 6, -6
		b.Parent = a0
		beam = b
		beamTarget = a1
		b.Destroying:Connect(function()
			a0:Destroy()
		end)
	end
end
player:GetAttributeChangedSignal("Carrying"):Connect(refreshCarry)
player.CharacterAdded:Connect(function()
	task.wait(0.5)
	refreshCarry()
end)

---------------------------------------------------------------- per frame
local plotsFolder = workspace:WaitForChild("Plots")
local world = workspace:WaitForChild("World")
local vortex = world:FindFirstChild("Vortex") :: Model?
local vortexPivot = vortex and vortex:GetPivot()
local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
local grade = Lighting:FindFirstChildOfClass("ColorCorrectionEffect")
local sunny = {
	Brightness = Lighting.Brightness,
	OutdoorAmbient = Lighting.OutdoorAmbient,
	Density = atmosphere and atmosphere.Density or 0.3,
	AtmoColor = atmosphere and atmosphere.Color or Color3.new(1, 1, 1),
	Tint = grade and grade.TintColor or Color3.new(1, 1, 1),
}
local stormy = {
	Brightness = 1.1,
	OutdoorAmbient = Color3.fromRGB(80, 74, 100),
	Density = 0.45,
	AtmoColor = Color3.fromRGB(110, 96, 140),
	Tint = Color3.fromRGB(220, 210, 255),
}
local nextFlash = 0
local flashUntil = 0
local stormMix = 0

local function lockText()
	local idx = player:GetAttribute("Plot")
	local plot = idx and plotsFolder:FindFirstChild("Plot" .. idx)
	if not plot then
		return "LOCK BASE"
	end
	local t = workspace:GetServerTimeNow()
	local untilT = plot:GetAttribute("LockedUntil") or 0
	local ready = plot:GetAttribute("LockReadyAt") or 0
	if t < untilT then
		return ("LOCKED %ds"):format(math.ceil(untilT - t))
	elseif t < ready then
		return ("RECHARGE %ds"):format(math.ceil(ready - t))
	end
	return "LOCK BASE"
end

RunService.RenderStepped:Connect(function(dt)
	local t = os.clock()
	local cam = workspace.CurrentCamera
	local camPos = cam.CFrame.Position
	for root, s in shown do
		if root.Parent then
			local p = root.Position
			if (p - camPos).Magnitude < 260 then
				Visuals.update(s.vis, root.CFrame, t + s.seed)
			end
		end
	end
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	local nearest = math.huge
	for body, vis in spirits do
		if body.Parent then
			Visuals.update(vis, body.CFrame, t)
			if hrp and body:GetAttribute("Target") == player.UserId then
				nearest = math.min(nearest, (body.Position - hrp.Position).Magnitude)
			end
		end
	end
	-- red edges when a spirit is closing in
	local d = math.clamp(1 - (nearest - 6) / 24, 0, 1)
	dangerStroke.Thickness = d * (14 + math.sin(t * 12) * 4)
	-- the vortex turns
	if vortex and vortexPivot then
		vortex:PivotTo(CFrame.new(0, 0, 290) * CFrame.Angles(0, t * 0.05, 0) * CFrame.new(0, 0, -290) * vortexPivot)
	end
	-- the sky darkens toward the Eye of the Storm, with lightning flashes inside it
	if hrp then
		local target = math.clamp((hrp.Position.Z - 140) / 120, 0, 1)
		stormMix += (target - stormMix) * math.min(1, dt * 2)
		Lighting.Brightness = sunny.Brightness + (stormy.Brightness - sunny.Brightness) * stormMix
			+ (if t < flashUntil then 3 else 0)
		Lighting.OutdoorAmbient = sunny.OutdoorAmbient:Lerp(stormy.OutdoorAmbient, stormMix)
		if atmosphere then
			atmosphere.Density = sunny.Density + (stormy.Density - sunny.Density) * stormMix
			atmosphere.Color = sunny.AtmoColor:Lerp(stormy.AtmoColor, stormMix)
		end
		if grade then
			grade.TintColor = sunny.Tint:Lerp(stormy.Tint, stormMix)
		end
		if stormMix > 0.6 and t > nextFlash then
			nextFlash = t + 4 + math.random() * 6
			flashUntil = t + 0.12
			playSound("Thunder", 0.5)
		end
	end
	lockButton.Text = lockText()
	local vp = cam.ViewportSize
	shopScale.Scale = math.clamp(math.min((vp.X - 20) / 600, (vp.Y - 90) / 270), 0.45, 1)
end)

toast("Catch storms in the wild, bring them home, get rich! Watch out for storm spirits!", Color3.fromRGB(255, 230, 120))
