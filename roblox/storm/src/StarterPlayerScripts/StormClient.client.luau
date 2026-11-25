-- Steal a Storm on this client: draws every storm and storm spirit, prompts, the HUD (cash, goals, weather
-- events), the shop with rebirth, the storm index, free crates with a spin reveal, discoveries, effects for
-- everything that happens in the world, your dash and the wind launch pads, base alarms, and the sky changing
-- with the zone you're in and the weather event that's on.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local HttpService = game:GetService("HttpService")
local Debris = game:GetService("Debris")

local player = Players.LocalPlayer
local Data = require(ReplicatedStorage:WaitForChild("StormData"))
local Visuals = require(ReplicatedStorage:WaitForChild("StormVisuals"))
local Fx = require(ReplicatedStorage:WaitForChild("StormFx"))
local Bank = require(ReplicatedStorage:WaitForChild("StormSoundBank"))
local remotes = ReplicatedStorage:WaitForChild("StormRemotes")
local Interact = remotes:WaitForChild("Interact") :: RemoteEvent
local Buy = remotes:WaitForChild("Buy") :: RemoteEvent
local LockRemote = remotes:WaitForChild("Lock") :: RemoteEvent
local Notify = remotes:WaitForChild("Notify") :: RemoteEvent
local Knock = remotes:WaitForChild("Knock") :: RemoteEvent
local FxRemote = remotes:WaitForChild("Fx") :: RemoteEvent
local Tell = remotes:WaitForChild("Tell") :: RemoteEvent
local OpenCrate = remotes:WaitForChild("OpenCrate") :: RemoteEvent
local RebirthRemote = remotes:WaitForChild("Rebirth") :: RemoteEvent
local Move = remotes:WaitForChild("Move") :: RemoteEvent
local BlastRemote = remotes:WaitForChild("Blast") :: RemoteEvent

local visFolder = Instance.new("Folder")
visFolder.Name = "StormVisuals"
visFolder.Parent = workspace

local function myHrp(): BasePart?
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	return if hrp and hrp:IsA("BasePart") then hrp else nil
end

local function rarityColor(r: number): Color3
	return (Data.RARITIES[r] or Data.RARITIES[1]).color
end

---------------------------------------------------------------- sounds
local function playSound(name: string, volume: number?, at: Vector3?)
	local r = Bank.Regions[name]
	if not r then
		return
	end
	if at then
		local cam = workspace.CurrentCamera
		if (cam.CFrame.Position - at).Magnitude > 160 then
			return
		end
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
		snd.RollOffMinDistance = 10
		snd.RollOffMaxDistance = 160
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
	make("UIStroke", { Color = color or Color3.fromRGB(20, 20, 40), Thickness = thick or 2,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border }, p)
end
local function textStroke(p: Instance, thick: number?)
	make("UIStroke", { Color = Color3.fromRGB(20, 20, 40), Thickness = thick or 2 }, p)
end
local function bounce(gui: GuiObject, amount: number?)
	local s = gui:FindFirstChild("Bounce") :: UIScale?
	if not s then
		s = make("UIScale", { Name = "Bounce" }, gui)
	end
	(s :: UIScale).Scale = amount or 1.25
	TweenService:Create(s :: UIScale, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

local gui = make("ScreenGui", { Name = "StormUI", ResetOnSpawn = false, ZIndexBehavior = Enum.ZIndexBehavior.Sibling },
	player:WaitForChild("PlayerGui"))

-- cash, income, goal
local cashLabel = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 2),
	Size = UDim2.new(0, 320, 0, 46), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne, TextSize = 42,
	TextColor3 = Color3.fromRGB(120, 255, 130), Text = "$0" }, gui)
textStroke(cashLabel, 3)
local incomeLabel = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 44),
	Size = UDim2.new(0, 320, 0, 22), BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 18,
	TextColor3 = Color3.fromRGB(230, 255, 230), Text = "+$0/s" }, gui)
textStroke(incomeLabel)
local goalLabel = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 68),
	Size = UDim2.new(0, 560, 0, 22), BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 16,
	TextColor3 = Color3.fromRGB(255, 235, 150), Text = "" }, gui)
textStroke(goalLabel)

-- weather event bar
local eventBar = make("Frame", { AnchorPoint = Vector2.new(0, 0), Position = UDim2.new(0, 10, 0.2, 0),
	Size = UDim2.new(0, 250, 0, 52), BackgroundColor3 = Color3.fromRGB(25, 25, 45), BackgroundTransparency = 0.2 }, gui)
corner(eventBar, 12)
local eventStroke = make("UIStroke", { Color = Color3.fromRGB(120, 140, 200), Thickness = 2 }, eventBar)
local eventTitle = make("TextLabel", { Position = UDim2.new(0, 10, 0, 4), Size = UDim2.new(1, -20, 0, 24),
	BackgroundTransparency = 1, Font = Enum.Font.FredokaOne, TextSize = 20, TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = Color3.new(1, 1, 1), Text = "Clear skies" }, eventBar)
textStroke(eventTitle)
local eventSub = make("TextLabel", { Position = UDim2.new(0, 10, 0, 28), Size = UDim2.new(1, -20, 0, 18),
	BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = Color3.fromRGB(210, 215, 235), Text = "" }, eventBar)

-- side buttons
local side = make("Frame", { AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -10, 0.5, 0),
	Size = UDim2.new(0, 132, 0, 270), BackgroundTransparency = 1 }, gui)
local sideScale = make("UIScale", { Scale = 1 }, side)
make("UIListLayout", { Padding = UDim.new(0, 8), HorizontalAlignment = Enum.HorizontalAlignment.Right }, side)
local function sideButton(text: string, color: Color3, order: number): TextButton
	local b = make("TextButton", { LayoutOrder = order, Size = UDim2.new(0, 132, 0, 58), BackgroundColor3 = color,
		Font = Enum.Font.FredokaOne, TextSize = 19, TextColor3 = Color3.new(1, 1, 1), Text = text, AutoButtonColor = true,
		TextWrapped = true }, side)
	corner(b, 14)
	stroke(b, Color3.fromRGB(20, 20, 40), 3)
	textStroke(b)
	return b
end
local upgradesButton = sideButton("UPGRADES", Color3.fromRGB(255, 165, 40), 1)
local crateButton = sideButton("FREE CRATE", Color3.fromRGB(60, 190, 90), 2)
local indexButton = sideButton("INDEX", Color3.fromRGB(150, 90, 240), 3)
local lockButton = sideButton("LOCK BASE", Color3.fromRGB(230, 60, 80), 4)
local crateBadge = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.new(0, 4, 0, 6),
	Size = UDim2.new(0, 26, 0, 26), BackgroundColor3 = Color3.fromRGB(255, 60, 60), Font = Enum.Font.FredokaOne, TextSize = 16,
	TextColor3 = Color3.new(1, 1, 1), Text = "1", ZIndex = 3 }, crateButton)
corner(crateBadge, 13)

-- dash button (also Q on keyboard, X on gamepad)
local dashButton = make("TextButton", { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -200, 1, -40),
	Size = UDim2.new(0, 84, 0, 84), BackgroundColor3 = Color3.fromRGB(70, 170, 255), Font = Enum.Font.FredokaOne,
	TextSize = 20, TextColor3 = Color3.new(1, 1, 1), Text = "DASH", AutoButtonColor = true }, gui)
corner(dashButton, 42)
stroke(dashButton, Color3.fromRGB(20, 20, 40), 3)
textStroke(dashButton)
local dashFill = make("Frame", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.fromScale(0.5, 1), Size = UDim2.fromScale(1, 0),
	BackgroundColor3 = Color3.fromRGB(20, 20, 40), BackgroundTransparency = 0.45, ZIndex = 2 }, dashButton)
corner(dashFill, 42)

-- blast button (also F or left-click on a computer): aims where your camera looks
local blastButton = make("TextButton", { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -296, 1, -40),
	Size = UDim2.new(0, 84, 0, 84), BackgroundColor3 = Color3.fromRGB(255, 110, 70), Font = Enum.Font.FredokaOne,
	TextSize = 19, TextColor3 = Color3.new(1, 1, 1), Text = "BLAST", AutoButtonColor = true }, gui)
corner(blastButton, 42)
stroke(blastButton, Color3.fromRGB(20, 20, 40), 3)
textStroke(blastButton)
local blastFill = make("Frame", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.fromScale(0.5, 1), Size = UDim2.fromScale(1, 0),
	BackgroundColor3 = Color3.fromRGB(20, 20, 40), BackgroundTransparency = 0.45, ZIndex = 2 }, blastButton)
corner(blastFill, 42)

-- the boss bar
local bossBar = make("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 94), Size = UDim2.new(0, 440, 0, 52),
	BackgroundColor3 = Color3.fromRGB(25, 20, 35), BackgroundTransparency = 0.1, Visible = false }, gui)
make("UISizeConstraint", { MaxSize = Vector2.new(440, 52) }, bossBar)
corner(bossBar, 12)
local bossStroke = make("UIStroke", { Color = Color3.fromRGB(255, 80, 80), Thickness = 2 }, bossBar)
local bossName = make("TextLabel", { Position = UDim2.new(0, 10, 0, 2), Size = UDim2.new(1, -20, 0, 22), BackgroundTransparency = 1,
	Font = Enum.Font.FredokaOne, TextSize = 19, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Color3.new(1, 1, 1),
	Text = "" }, bossBar)
textStroke(bossName)
local bossTime = make("TextLabel", { Position = UDim2.new(0, 10, 0, 2), Size = UDim2.new(1, -20, 0, 22), BackgroundTransparency = 1,
	Font = Enum.Font.GothamBold, TextSize = 15, TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = Color3.fromRGB(255, 220, 160),
	Text = "" }, bossBar)
local bossBack = make("Frame", { Position = UDim2.new(0, 10, 0, 28), Size = UDim2.new(1, -20, 0, 16),
	BackgroundColor3 = Color3.fromRGB(60, 20, 30) }, bossBar)
corner(bossBack, 8)
local bossFill = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(255, 70, 70) }, bossBack)
corner(bossFill, 8)
local bossHpText = make("TextLabel", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Font = Enum.Font.GothamBold,
	TextSize = 13, TextColor3 = Color3.new(1, 1, 1), Text = "", ZIndex = 3 }, bossBack)
textStroke(bossHpText)
local shownBossHp = 1

-- toasts
local toastHolder = make("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 152),
	Size = UDim2.new(0, 560, 0, 200), BackgroundTransparency = 1 }, gui)
make("UIListLayout", { Padding = UDim.new(0, 6), HorizontalAlignment = Enum.HorizontalAlignment.Center }, toastHolder)
local function toast(text: string, color: Color3?)
	local l = make("TextLabel", { AutomaticSize = Enum.AutomaticSize.XY, Size = UDim2.new(0, 0, 0, 0),
		BackgroundColor3 = Color3.fromRGB(25, 25, 45), BackgroundTransparency = 0.15, Font = Enum.Font.GothamBold,
		TextSize = 18, TextColor3 = color or Color3.new(1, 1, 1), Text = text }, toastHolder)
	make("UIPadding", { PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12), PaddingTop = UDim.new(0, 6),
		PaddingBottom = UDim.new(0, 6) }, l)
	corner(l, 10)
	bounce(l, 0.6)
	local count = 0
	for _, k in toastHolder:GetChildren() do
		if k:IsA("TextLabel") then
			count += 1
		end
	end
	if count > 4 then
		for _, k in toastHolder:GetChildren() do
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

-- carrying banner and danger edges
local carryLabel = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -16),
	AutomaticSize = Enum.AutomaticSize.X, Size = UDim2.new(0, 0, 0, 42), BackgroundColor3 = Color3.fromRGB(25, 25, 45),
	BackgroundTransparency = 0.15, Font = Enum.Font.FredokaOne, TextSize = 22, TextColor3 = Color3.new(1, 1, 1), Text = "",
	Visible = false }, gui)
make("UIPadding", { PaddingLeft = UDim.new(0, 16), PaddingRight = UDim.new(0, 16) }, carryLabel)
corner(carryLabel, 12)
local danger = make("Frame", { Position = UDim2.new(0, 18, 0, 18), Size = UDim2.new(1, -36, 1, -36),
	BackgroundTransparency = 1, Active = false }, gui)
local dangerStroke = make("UIStroke", { Color = Color3.fromRGB(255, 30, 40), Thickness = 0, Transparency = 0.2 }, danger)

---------------------------------------------------------------- panels: shop (with rebirth), index
local function panel(title: string, w: number, h: number, color: Color3): (Frame, Frame, UIScale)
	local f = make("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.53),
		Size = UDim2.new(0, w, 0, h), BackgroundColor3 = Color3.fromRGB(35, 35, 60), Visible = false, ZIndex = 5 }, gui)
	local sc = make("UIScale", { Scale = 1 }, f)
	corner(f, 18)
	stroke(f, Color3.fromRGB(20, 20, 40), 4)
	local t = make("TextLabel", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne,
		TextSize = 30, TextColor3 = color, Text = title, ZIndex = 5 }, f)
	textStroke(t)
	local close = make("TextButton", { AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -8, 0, 8),
		Size = UDim2.new(0, 36, 0, 36), BackgroundColor3 = Color3.fromRGB(230, 60, 80), Font = Enum.Font.FredokaOne,
		TextSize = 22, TextColor3 = Color3.new(1, 1, 1), Text = "X", ZIndex = 6 }, f)
	corner(close, 10)
	close.Activated:Connect(function()
		f.Visible = false
	end)
	local body = make("Frame", { Position = UDim2.new(0, 12, 0, 52), Size = UDim2.new(1, -24, 1, -64),
		BackgroundTransparency = 1, ZIndex = 5 }, f)
	return f, body, sc
end

local shop, shopBody, shopScale = panel("UPGRADES", 790, 290, Color3.fromRGB(255, 200, 70))
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 10),
	HorizontalAlignment = Enum.HorizontalAlignment.Center }, shopBody)
local cardUi = {}
local CARD_INFO = {
	{ id = "Speed", color = Color3.fromRGB(70, 170, 255), attr = "SpeedLv" },
	{ id = "Carry", color = Color3.fromRGB(190, 100, 255), attr = "CarryLv" },
	{ id = "Money", color = Color3.fromRGB(80, 210, 100), attr = "MoneyLv" },
	{ id = "Rebirth", color = Color3.fromRGB(255, 110, 60), attr = "Rebirths" },
}
local rebirthArmed = 0
for i, info in CARD_INFO do
	local card = make("Frame", { LayoutOrder = i, Size = UDim2.new(0, 180, 1, 0), BackgroundColor3 = info.color, ZIndex = 5 },
		shopBody)
	corner(card, 14)
	stroke(card, Color3.fromRGB(20, 20, 40), 3)
	local title = make("TextLabel", { Size = UDim2.new(1, 0, 0, 34), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne,
		TextSize = 24, TextColor3 = Color3.new(1, 1, 1), ZIndex = 5,
		Text = if info.id == "Rebirth" then "REBIRTH" else Data.UPGRADES[info.id].name }, card)
	textStroke(title)
	local level = make("TextLabel", { Position = UDim2.new(0, 0, 0, 34), Size = UDim2.new(1, 0, 0, 22),
		BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 16, TextColor3 = Color3.new(1, 1, 1), Text = "",
		ZIndex = 5 }, card)
	local effect = make("TextLabel", { Position = UDim2.new(0, 6, 0, 58), Size = UDim2.new(1, -12, 0, 90),
		BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 15, TextWrapped = true,
		TextColor3 = Color3.fromRGB(255, 255, 230), Text = "", ZIndex = 5 }, card)
	textStroke(effect)
	local buy = make("TextButton", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -10),
		Size = UDim2.new(1, -20, 0, 46), BackgroundColor3 = Color3.fromRGB(255, 220, 60), Font = Enum.Font.FredokaOne,
		TextSize = 21, TextColor3 = Color3.fromRGB(40, 30, 10), Text = "", ZIndex = 6 }, card)
	corner(buy, 12)
	stroke(buy, Color3.fromRGB(20, 20, 40), 2)
	buy.Activated:Connect(function()
		bounce(buy, 0.85)
		if info.id == "Rebirth" then
			if os.clock() - rebirthArmed < 3 then
				rebirthArmed = 0
				RebirthRemote:FireServer()
			else
				rebirthArmed = os.clock()
				buy.Text = "SURE? TAP AGAIN"
			end
		else
			Buy:FireServer(info.id)
		end
	end)
	cardUi[info.id] = { level = level, effect = effect, buy = buy, attr = info.attr, card = card }
end

local function refreshShop()
	local cash = player:GetAttribute("Cash") or 0
	for id, ui in cardUi do
		local lv = player:GetAttribute(ui.attr) or 0
		if id == "Rebirth" then
			local cost = Data.rebirthCost(lv)
			ui.level.Text = "Rebirth " .. lv
			ui.effect.Text = ("Income x%.1f -> x%.1f\nResets cash, Speed and Money. Keeps your storms!"):format(
				Data.rebirthMult(lv), Data.rebirthMult(lv + 1))
			if os.clock() - rebirthArmed >= 3 then
				ui.buy.Text = Data.money(cost)
			end
			ui.buy.BackgroundColor3 = if cash >= cost then Color3.fromRGB(255, 220, 60) else Color3.fromRGB(190, 170, 120)
			continue
		end
		local U = Data.UPGRADES[id]
		ui.level.Text = "Level " .. lv .. (if lv >= U.max then " (MAX)" else "")
		if id == "Speed" then
			ui.effect.Text = ("Run speed %d -> %d\nOutrun the storm spirits!"):format(U.value(lv), U.value(math.min(lv + 1, U.max)))
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

-- the storm index: every storm and every mutation of it
local indexPanel, indexBody, indexScale = panel("STORM INDEX", 640, 430, Color3.fromRGB(200, 150, 255))
local indexInfo = make("TextLabel", { Size = UDim2.new(1, 0, 0, 22), BackgroundTransparency = 1, Font = Enum.Font.GothamBold,
	TextSize = 15, TextColor3 = Color3.fromRGB(230, 230, 255), Text = "", ZIndex = 5 }, indexBody)
local indexList = make("ScrollingFrame", { Position = UDim2.new(0, 0, 0, 26), Size = UDim2.new(1, 0, 1, -26),
	BackgroundTransparency = 1, CanvasSize = UDim2.new(0, 0, 0, 0), AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 8, ZIndex = 5 }, indexBody)
make("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, indexList)
local indexCells: { [string]: Frame } = {}
do
	local header = make("Frame", { LayoutOrder = 0, Size = UDim2.new(1, -10, 0, 22), BackgroundTransparency = 1, ZIndex = 5 },
		indexList)
	for j, mid in { "", table.unpack(Data.MUTATION_ORDER) } do
		local m = Data.MUTATIONS[mid]
		make("TextLabel", { Position = UDim2.new(0, 170 + (j - 1) * 60, 0, 0), Size = UDim2.new(0, 56, 1, 0),
			BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextSize = 11, TextScaled = true,
			TextColor3 = if m then m.color else Color3.new(1, 1, 1), Text = if m then m.name else "Normal", ZIndex = 5 }, header)
	end
	for i, kind in Data.ORDER do
		local info = Data.KINDS[kind]
		local row = make("Frame", { LayoutOrder = i, Size = UDim2.new(1, -10, 0, 30), BackgroundColor3 = Color3.fromRGB(45, 45, 75),
			ZIndex = 5 }, indexList)
		corner(row, 8)
		make("TextLabel", { Position = UDim2.new(0, 8, 0, 0), Size = UDim2.new(0, 160, 1, 0), BackgroundTransparency = 1,
			Font = Enum.Font.FredokaOne, TextSize = 16, TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = rarityColor(info.rarity), Text = info.name, ZIndex = 5 }, row)
		for j, mid in { "", table.unpack(Data.MUTATION_ORDER) } do
			local cell = make("Frame", { Position = UDim2.new(0, 170 + (j - 1) * 60 + 14, 0, 3), Size = UDim2.new(0, 24, 0, 24),
				BackgroundColor3 = Color3.fromRGB(25, 25, 40), ZIndex = 5 }, row)
			corner(cell, 12)
			make("TextLabel", { Name = "Mark", Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne,
				TextSize = 14, TextColor3 = Color3.fromRGB(110, 110, 140), Text = "?", ZIndex = 6 }, cell)
			indexCells[Data.indexKey(kind, mid)] = cell
		end
	end
end
local myIndex: { [string]: boolean } = {}
local function refreshIndex()
	local ok, list = pcall(function()
		return HttpService:JSONDecode(player:GetAttribute("Index") or "[]")
	end)
	myIndex = {}
	if ok and type(list) == "table" then
		for _, k in list do
			myIndex[k] = true
		end
	end
	for key, cell in indexCells do
		local found = myIndex[key]
		local mid = string.match(key, "|(.*)$") or ""
		local m = Data.MUTATIONS[mid]
		cell.BackgroundColor3 = if found then (if m then m.color else Color3.fromRGB(120, 230, 130)) else Color3.fromRGB(25, 25, 40)
		local mark = cell:FindFirstChild("Mark") :: TextLabel
		mark.Text = if found then "+" else "?"
		mark.TextColor3 = if found then Color3.fromRGB(20, 20, 40) else Color3.fromRGB(110, 110, 140)
	end
	local count = Data.indexCount(myIndex)
	local rows = Data.indexRows(myIndex)
	indexInfo.Text = ("Found %d / %d   |   Complete a rarity's storms: +%d%% income each (you have +%d%%)"):format(count,
		Data.INDEX_TOTAL, Data.INDEX_ROW_BONUS * 100, rows * Data.INDEX_ROW_BONUS * 100)
	indexButton.Text = ("INDEX %d/%d"):format(count, Data.INDEX_TOTAL)
end
player:GetAttributeChangedSignal("Index"):Connect(refreshIndex)
refreshIndex()

local function openPanel(p: Frame)
	for _, other in { shop, indexPanel } do
		if other ~= p then
			other.Visible = false
		end
	end
	p.Visible = not p.Visible
end
upgradesButton.Activated:Connect(function()
	openPanel(shop)
	refreshShop()
end)
indexButton.Activated:Connect(function()
	openPanel(indexPanel)
	refreshIndex()
end)
lockButton.Activated:Connect(function()
	LockRemote:FireServer()
end)
crateButton.Activated:Connect(function()
	OpenCrate:FireServer()
end)

---------------------------------------------------------------- cash counter
local shownCash = player:GetAttribute("Cash") or 0
local lastCashTarget = shownCash
local function refreshCash()
	local cash = player:GetAttribute("Cash") or 0
	if cash > lastCashTarget * 1.15 + 10 then
		bounce(cashLabel, 1.25)
	end
	lastCashTarget = cash
	incomeLabel.Text = "+" .. Data.money(player:GetAttribute("Income") or 0) .. "/s"
	if shop.Visible then
		refreshShop()
	end
end
for _, a in { "Cash", "Income", "SpeedLv", "CarryLv", "MoneyLv", "Rebirths" } do
	player:GetAttributeChangedSignal(a):Connect(refreshCash)
end
refreshCash()

---------------------------------------------------------------- messages, knockback
local SOUND_COLOR = {
	Error = Color3.fromRGB(255, 140, 140),
	Alarm = Color3.fromRGB(255, 90, 90),
	Announce = Color3.fromRGB(255, 220, 90),
	Upgrade = Color3.fromRGB(140, 255, 160),
	Place = Color3.fromRGB(140, 255, 160),
	Steal = Color3.fromRGB(255, 200, 90),
	Event = Color3.fromRGB(150, 200, 255),
	Rebirth = Color3.fromRGB(255, 160, 80),
}
Notify.OnClientEvent:Connect(function(text, sound)
	if type(text) == "string" then
		toast(text, SOUND_COLOR[sound])
	end
	if type(sound) == "string" and sound ~= "Event" then
		playSound(sound, if sound == "Announce" or sound == "Alarm" then 0.9 else 0.7)
	end
end)

Knock.OnClientEvent:Connect(function(dir)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local hrp = myHrp()
	if not hum or not hrp or typeof(dir) ~= "Vector3" then
		return
	end
	local flat = Vector3.new(dir.X, 0, dir.Z)
	flat = if flat.Magnitude > 0.01 then flat.Unit else Vector3.zAxis
	hum.PlatformStand = true
	hrp.AssemblyLinearVelocity = flat * 45 + Vector3.new(0, 38, 0)
	hrp.AssemblyAngularVelocity = Vector3.new(flat.Z, 0, -flat.X) * 8
	Fx.shake(1.2)
	Fx.flash(Color3.fromRGB(255, 255, 255), 0.35, 0.3)
	task.delay(1.1, function()
		if hum.Parent then
			hum.PlatformStand = false
			hum:ChangeState(Enum.HumanoidStateType.GettingUp)
		end
	end)
end)

---------------------------------------------------------------- storms on screen
type Shown = { root: BasePart, vis: any, label: BillboardGui, prompt: ProximityPrompt?, action: string?, seed: number,
	beacon: Beam?, thief: BillboardGui?, trail: Trail?, mutation: string }
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
	local key = tostring(action) .. tostring(text)
	if key == s.action then
		return
	end
	if s.prompt then
		s.prompt:Destroy()
		s.prompt = nil
	end
	s.action = key
	if not action then
		return
	end
	local p = Instance.new("ProximityPrompt")
	p.ActionText = text :: string
	p.ObjectText = Data.displayName(kind, root:GetAttribute("Mutation"))
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
	local mut = root:GetAttribute("Mutation")
	local info = Data.KINDS[kind] or Data.KINDS.Drizzle
	local rarity = Data.RARITIES[info.rarity]
	local m = Data.MUTATIONS[mut]
	local bb = make("BillboardGui", { Name = "Label", Size = UDim2.new(0, 190, 0, 62), StudsOffset = Vector3.new(0, 5, 0),
		MaxDistance = 90, AlwaysOnTop = false, LightInfluence = 0, Adornee = root }, visFolder)
	local name = make("TextLabel", { Size = UDim2.new(1, 0, 0.42, 0), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne,
		TextScaled = true, TextColor3 = if m then m.color else Color3.new(1, 1, 1), Text = Data.displayName(kind, mut) }, bb)
	textStroke(name)
	local rar = make("TextLabel", { Position = UDim2.new(0, 0, 0.42, 0), Size = UDim2.new(1, 0, 0.3, 0), BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold, TextScaled = true, TextColor3 = rarity.color,
		Text = rarity.name .. (if m then ("  x%g"):format(m.mult) else "") }, bb)
	textStroke(rar)
	local inc = make("TextLabel", { Position = UDim2.new(0, 0, 0.72, 0), Size = UDim2.new(1, 0, 0.28, 0), BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold, TextScaled = true, TextColor3 = Color3.fromRGB(130, 255, 140),
		Text = Data.money(Data.income(kind, mut)) .. "/s" }, bb)
	textStroke(inc)
	return bb
end

local seedCounter = 0
local function buildVisual(s: Shown)
	if s.vis then
		s.vis.model:Destroy()
	end
	if s.label then
		s.label:Destroy()
	end
	if s.beacon then
		s.beacon:Destroy()
		s.beacon = nil
	end
	local root = s.root
	local kind = root:GetAttribute("Kind") or "Drizzle"
	local mut = root:GetAttribute("Mutation") or ""
	s.mutation = mut
	s.vis = Visuals.storm(kind, mut, math.floor(s.seed * 100))
	s.vis.model.Parent = visFolder
	s.label = labelFor(root)
	local info = Data.KINDS[kind]
	if info and root:GetAttribute("State") == "wild" and (info.rarity >= 5 or Data.mutationMult(mut) >= 5) then
		local m = Data.MUTATIONS[mut]
		s.beacon = Fx.beacon(root, if m then m.color else rarityColor(info.rarity))
	end
end

local function refreshStorm(s: Shown)
	local root = s.root
	if (root:GetAttribute("Mutation") or "") ~= s.mutation then
		buildVisual(s)
	end
	promptFor(s)
	local state = root:GetAttribute("State")
	s.label.Enabled = state ~= "carried" or root:GetAttribute("Carrier") ~= player.UserId
	local info = Data.KINDS[root:GetAttribute("Kind")]
	if s.beacon and state ~= "wild" then
		s.beacon:Destroy()
		s.beacon = nil
	elseif not s.beacon and state == "wild" and info and (info.rarity >= 5 or Data.mutationMult(s.mutation) >= 5) then
		local m = Data.MUTATIONS[s.mutation]
		s.beacon = Fx.beacon(root, if m then m.color else rarityColor(info.rarity))
	end
	-- thieves get a big red tag everyone can see
	local isThief = state == "carried" and root:GetAttribute("Thief") == true
	if isThief and not s.thief then
		local bb = make("BillboardGui", { Size = UDim2.new(0, 150, 0, 40), StudsOffset = Vector3.new(0, 8, 0), AlwaysOnTop = true,
			LightInfluence = 0, MaxDistance = 200, Adornee = root }, visFolder)
		local l = make("TextLabel", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(200, 20, 30),
			Font = Enum.Font.FredokaOne, TextScaled = true, TextColor3 = Color3.new(1, 1, 1), Text = "THIEF!" }, bb)
		corner(l, 8)
		s.thief = bb
	elseif not isThief and s.thief then
		s.thief:Destroy()
		s.thief = nil
	end
	-- the storm you carry leaves a trail
	local mine = state == "carried" and root:GetAttribute("Carrier") == player.UserId
	if mine and not s.trail and info then
		s.trail = Fx.trail(root, rarityColor(info.rarity), 3)
	elseif not mine and s.trail then
		s.trail:Destroy()
		s.trail = nil
	end
end

local function addStorm(root: Instance)
	if not root:IsA("BasePart") or shown[root] then
		return
	end
	seedCounter += 1
	local s: Shown = { root = root, vis = nil, label = nil :: any, prompt = nil, action = nil, seed = seedCounter * 1.37,
		beacon = nil, thief = nil, trail = nil, mutation = "" }
	shown[root] = s
	buildVisual(s)
	local function refresh()
		refreshStorm(s)
	end
	for _, a in { "State", "Owner", "Mutation", "Thief", "Carrier" } do
		root:GetAttributeChangedSignal(a):Connect(refresh)
	end
	refresh()
end
local function removeStorm(root: Instance)
	local s = shown[root :: BasePart]
	if s then
		shown[root :: BasePart] = nil
		s.vis.model:Destroy()
		s.label:Destroy()
		if s.thief then
			s.thief:Destroy()
		end
	end
end
CollectionService:GetInstanceAddedSignal("Storm"):Connect(addStorm)
CollectionService:GetInstanceRemovedSignal("Storm"):Connect(removeStorm)
for _, r in CollectionService:GetTagged("Storm") do
	addStorm(r)
end

-- storm spirits (their eyes flare when they charge up a dash)
local spirits: { [BasePart]: any } = {}
local function addSpirit(body: Instance)
	if not body:IsA("BasePart") or spirits[body] then
		return
	end
	seedCounter += 1
	local vis = Visuals.spirit(body:GetAttribute("Rarity") or 1, seedCounter, body:GetAttribute("Lurker") == true)
	vis.model.Parent = visFolder
	vis.chargeAt = -10
	vis.stunAt = -10
	body:GetAttributeChangedSignal("Stunned"):Connect(function()
		vis.stunAt = os.clock()
		Fx.burst(body.Position, Color3.fromRGB(150, 230, 255), 25, 10)
		playSound("Stun", 0.7, body.Position)
	end)
	spirits[body] = vis
	playSound("Howl", 0.6, body.Position)
	body:GetAttributeChangedSignal("Charge"):Connect(function()
		vis.chargeAt = os.clock()
		playSound("Charge", 0.8, body.Position)
	end)
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

-- roaming tornadoes and boss twisters
local tornadoes: { [BasePart]: any } = {}
local function addTornado(body: Instance)
	if body:IsA("BasePart") and not tornadoes[body] then
		seedCounter += 1
		local mini = body:GetAttribute("Mini") == true
		local vis = Visuals.tornado(if mini then 10 else 18, if mini then Color3.fromRGB(150, 90, 210) else Color3.fromRGB(120, 110, 125),
			seedCounter)
		vis.model.Parent = visFolder
		tornadoes[body] = vis
	end
end
CollectionService:GetInstanceAddedSignal("Sweeper"):Connect(addTornado)
CollectionService:GetInstanceRemovedSignal("Sweeper"):Connect(function(body)
	local vis = tornadoes[body :: BasePart]
	if vis then
		tornadoes[body :: BasePart] = nil
		vis.model:Destroy()
	end
end)
for _, b in CollectionService:GetTagged("Sweeper") do
	addTornado(b)
end
-- bosses
local bosses: { [BasePart]: any } = {}
local function addBoss(body: Instance)
	if not body:IsA("BasePart") or bosses[body] then
		return
	end
	local vis = Visuals.boss(body:GetAttribute("BossId") or "ThunderKing", 7)
	vis.model.Parent = visFolder
	bosses[body] = vis
end
CollectionService:GetInstanceAddedSignal("Boss"):Connect(addBoss)
CollectionService:GetInstanceRemovedSignal("Boss"):Connect(function(body)
	local vis = bosses[body :: BasePart]
	if vis then
		bosses[body :: BasePart] = nil
		vis.model:Destroy()
	end
end)
for _, b in CollectionService:GetTagged("Boss") do
	addBoss(b)
end

---------------------------------------------------------------- world effects from the server
local function nearMe(pos: Vector3, range: number): number
	local hrp = myHrp()
	if not hrp then
		return 0
	end
	return math.clamp(1 - (hrp.Position - pos).Magnitude / range, 0, 1)
end

local function streak(from: Vector3, to: Vector3, color: Color3)
	local ball = Fx.part({ Shape = Enum.PartType.Ball, Color = color, Size = Vector3.new(1.6, 1.6, 1.6), CFrame = CFrame.new(from) })
	Fx.trail(ball, color, 1.4)
	Fx.tween(ball, 0.7, { CFrame = CFrame.new(to) }, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut)
	Debris:AddItem(ball, 0.75)
	task.delay(0.7, function()
		Fx.burst(to, color, 25, 14)
	end)
end

local FX = {}
FX.catch = function(pos: Vector3, rarity: number, uid: number)
	local c = rarityColor(rarity)
	Fx.pillar(pos - Vector3.new(0, 6, 0), c, 30 + rarity * 15, 3 + rarity, 1 + rarity * 0.15)
	Fx.burst(pos, c, 30 + rarity * 10, 20)
	if uid == player.UserId then
		Fx.shake(0.4 + rarity * 0.15)
		Fx.flash(c, 0.18 + rarity * 0.04, 0.4)
		if rarity >= 3 then
			Fx.popup(Data.RARITIES[rarity].name:upper() .. "!", c, nil, 1)
		end
	else
		playSound("Catch", 0.5, pos)
	end
end
FX.place = function(pos: Vector3, rarity: number, uid: number, inc: number)
	local c = rarityColor(rarity)
	Fx.coins(pos, 6 + rarity * 3)
	Fx.burst(pos, c, 40, 16)
	Fx.ring(pos - Vector3.new(0, 4.4, 0), c, 8, 0.5)
	if uid == player.UserId then
		Fx.float(pos + Vector3.new(0, 2, 0), "+" .. Data.money(inc) .. "/s", Color3.fromRGB(130, 255, 140), 34, 6)
		Fx.shake(0.3)
	else
		playSound("Coin", 0.5, pos)
	end
end
FX.mutate = function(pos: Vector3, mut: string)
	local m = Data.MUTATIONS[mut]
	local c = if m then m.color else Color3.new(1, 1, 1)
	Fx.burst(pos, c, 60, 22, 1.2)
	Fx.pillar(pos - Vector3.new(0, 5, 0), c, 40, 4, 1)
	Fx.ring(pos - Vector3.new(0, 4.4, 0), c, 10, 0.6)
	playSound("Mutate", 0.8, pos)
	if m then
		Fx.float(pos + Vector3.new(0, 3, 0), m.name:upper() .. "!", c, 36, 6)
	end
end
FX.spawn = function(pos: Vector3, rarity: number)
	local c = rarityColor(rarity)
	Fx.burst(pos + Vector3.new(0, 6, 0), c, 12 + rarity * 6, 10)
	if rarity >= 4 then
		Fx.pillar(pos, c, 80, 5, 1.6)
	end
end
FX["return"] = function(from: Vector3, to: Vector3, rarity: number)
	streak(from, to, rarityColor(rarity))
end
FX.bonk = function(pos: Vector3)
	Fx.float(pos + Vector3.new(0, 4, 0), "BONK!", Color3.fromRGB(255, 220, 60), 44, 4)
	Fx.burst(pos + Vector3.new(0, 3, 0), Color3.fromRGB(255, 240, 120), 25, 14)
	playSound("Bonk", 0.7, pos)
end
FX.rise = function(pos: Vector3, rarity: number)
	Fx.burst(pos, Color3.fromRGB(60, 40, 90), 30, 14, 1.4)
	Fx.ring(pos - Vector3.new(0, 2.3, 0), rarityColor(rarity), 7, 0.5)
end
FX.vanish = function(pos: Vector3)
	Fx.burst(pos, Color3.fromRGB(90, 70, 130), 18, 10)
end
local WARN_COLOR = {
	bolt = Color3.fromRGB(255, 50, 60),
	icicle = Color3.fromRGB(110, 210, 255),
	geyser = Color3.fromRGB(255, 140, 40),
	rock = Color3.fromRGB(210, 150, 90),
}
local WARN_SOUND = { bolt = "Warn", icicle = "Crack", geyser = "Rumble", rock = "Warn" }
FX.warn = function(pos: Vector3, radius: number, delay: number, kind: string?)
	local k = kind or "bolt"
	Fx.warn(pos, radius, delay, WARN_COLOR[k])
	if nearMe(pos, 50) > 0 then
		playSound(WARN_SOUND[k] or "Warn", 0.55, pos)
	end
end
FX.icicle = function(pos: Vector3)
	Fx.icicle(pos)
	task.delay(0.25, function()
		playSound("Shatter", 0.8, pos)
		local n = nearMe(pos, 40)
		if n > 0 then
			Fx.shake(n)
		end
	end)
end
FX.rock = function(pos: Vector3)
	Fx.thud(pos)
	playSound("Boom", 0.6, pos)
	local n = nearMe(pos, 50)
	if n > 0 then
		Fx.shake(n * 1.2)
	end
end
FX.geyser = function(pos: Vector3)
	Fx.geyser(pos)
	playSound("Geyser", 0.9, pos)
	local n = nearMe(pos, 45)
	if n > 0 then
		Fx.shake(n * 1.3)
	end
end
FX.burn = function(pos: Vector3)
	Fx.burn(pos)
	playSound("Burn", 0.8, pos)
end
FX.clap = function(center: Vector3, speed: number, maxR: number, delay: number)
	Fx.shockwave(center, speed, maxR, delay, Color3.fromRGB(140, 200, 255))
	local n = nearMe(center, maxR + 10)
	if n > 0 then
		Fx.popup("JUMP!", Color3.fromRGB(150, 210, 255), nil, 0.9)
	end
	task.delay(delay, function()
		playSound("Clap", 1, center)
		if n > 0 then
			Fx.shake(1.5)
		end
	end)
end
FX.throw = function(from: Vector3, to: Vector3, time: number)
	Fx.throw(from, to, time)
end
local BLAST_COLOR = Color3.fromRGB(120, 230, 255)
FX.blast = function(origin: Vector3, hit: Vector3, uid: number, kind: string)
	if uid ~= player.UserId then
		Fx.projectile(origin, hit, BLAST_COLOR, kind ~= "")
		playSound("Blast", 0.4, origin)
	elseif kind == "boss" then
		local dmg = Data.BLAST.damage * (1 + 0.25 * (player:GetAttribute("Rebirths") or 0))
		Fx.float(hit + Vector3.new(math.random() * 6 - 3, 6, 0), "-" .. math.floor(dmg), Color3.fromRGB(255, 120, 100), 28, 6)
	end
end
FX.portal = function(from: Vector3, to: Vector3)
	Fx.burst(from + Vector3.new(0, 5, 0), Color3.fromRGB(255, 120, 120), 40, 20)
	Fx.burst(to, Color3.fromRGB(255, 120, 120), 40, 20)
	if nearMe(from, 20) > 0 or nearMe(to, 20) > 0 then
		playSound("Portal", 0.8)
		Fx.flash(Color3.fromRGB(255, 200, 220), 0.3, 0.4)
	end
end
FX.pull = function(pos: Vector3)
	playSound("Pull", 1, pos)
end
FX.bossSpawn = function(center: Vector3, id: string)
	local def = Data.BOSSES[id]
	local c = if def then def.color else Color3.new(1, 1, 1)
	Fx.pillar(center, c, 220, 30, 2.5)
	Fx.ring(center, c, 60, 1.2)
	if nearMe(center, 120) > 0 then
		Fx.shake(2)
	end
end
FX.bossAttack = function(pos: Vector3)
	playSound("Roar", 0.8, pos)
	local n = nearMe(pos, 90)
	if n > 0 then
		Fx.shake(n * 0.6)
	end
end
FX.bossPhase = function(pos: Vector3)
	Fx.burst(pos, Color3.fromRGB(255, 60, 60), 80, 40, 3)
	Fx.ring(pos - Vector3.new(0, 20, 0), Color3.fromRGB(255, 60, 60), 50, 1)
	playSound("Roar", 1, pos)
	if nearMe(pos, 120) > 0 then
		Fx.flash(Color3.fromRGB(255, 40, 40), 0.35, 0.6)
		Fx.shake(1.5)
	end
end
FX.bossDefeated = function(pos: Vector3, id: string)
	local def = Data.BOSSES[id]
	local c = if def then def.color else Color3.fromRGB(255, 220, 100)
	Fx.impact(pos)
	Fx.pillar(pos - Vector3.new(0, 20, 0), Color3.fromRGB(255, 220, 100), 220, 24, 2.5)
	Fx.confetti(pos, 220)
	Fx.coins(pos, 30)
	for k = 1, 4 do
		task.delay(k * 0.35, function()
			Fx.burst(pos + Vector3.new(math.random(-15, 15), math.random(-8, 8), math.random(-15, 15)), c, 60, 40, 2.5)
		end)
	end
	if nearMe(pos, 150) > 0 then
		Fx.shake(2.5)
		Fx.flash(Color3.fromRGB(255, 240, 200), 0.5, 1)
	end
end
FX.bossEscape = function(pos: Vector3)
	Fx.burst(pos, Color3.fromRGB(160, 160, 180), 60, 30, 3)
end
FX.bolt = function(pos: Vector3, radius: number)
	Fx.bolt(pos, Color3.fromRGB(200, 225, 255), 140, 1)
	playSound("Thunder", 0.9, pos)
	local n = nearMe(pos, 60)
	if n > 0 then
		Fx.shake(n * 1.6)
		Fx.flash(Color3.fromRGB(230, 240, 255), n * 0.35, 0.25)
	end
	local _ = radius
end
FX.meteor = function(from: Vector3, to: Vector3, time: number)
	Fx.meteor(from, to, time)
	Fx.warn(to, 9, time, Color3.fromRGB(255, 130, 40))
	playSound("Whistle", 0.8, to)
end
FX.impact = function(pos: Vector3)
	Fx.impact(pos)
	playSound("Boom", 1, pos)
	local n = nearMe(pos, 90)
	if n > 0 then
		Fx.shake(n * 2.2)
	end
end
FX.rebirth = function(pos: Vector3, n: number)
	Fx.pillar(pos, Color3.fromRGB(255, 170, 60), 140, 14, 2)
	Fx.ring(pos, Color3.fromRGB(255, 200, 80), 30, 1)
	Fx.confetti(pos + Vector3.new(0, 4, 0), 160)
	local _ = n
end
FX.sell = function(pos: Vector3, price: number)
	Fx.coins(pos, 14)
	Fx.float(pos + Vector3.new(0, 2, 0), "+" .. Data.money(price), Color3.fromRGB(255, 215, 80), 34, 6)
end
FX.fade = function(pos: Vector3)
	Fx.burst(pos, Color3.fromRGB(220, 225, 235), 12, 6)
end
local function otherMove(uid: number, color: Color3)
	if uid == player.UserId then
		return
	end
	local other = Players:GetPlayerByUserId(uid)
	local char = other and other.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if hrp and hrp:IsA("BasePart") then
		Fx.burst(hrp.Position - Vector3.new(0, 2, 0), color, 20, 12)
		local tr = Fx.trail(hrp, color, 2)
		Debris:AddItem(tr, 0.6)
	end
end
FX.dash = function(uid: number)
	otherMove(uid, Color3.fromRGB(140, 210, 255))
end
FX.launch = function(uid: number)
	otherMove(uid, Color3.fromRGB(120, 255, 230))
end
FxRemote.OnClientEvent:Connect(function(kind, ...)
	local f = FX[kind]
	if f then
		local ok, err = pcall(f, ...)
		if not ok then
			warn("[StormFx] " .. tostring(kind) .. ": " .. tostring(err))
		end
	end
end)

---------------------------------------------------------------- discoveries, crates, upgrades (just for you)
local function discoveryCard(kind: string, mut: string)
	local info = Data.KINDS[kind]
	if not info then
		return
	end
	local m = Data.MUTATIONS[mut]
	local c = if m then m.color else rarityColor(info.rarity)
	Fx.popup("NEW STORM!", Color3.fromRGB(255, 230, 90), Data.displayName(kind, mut) .. "  (" .. Data.RARITIES[info.rarity].name .. ")", 2)
	Fx.flash(c, 0.3, 0.6)
	local hrp = myHrp()
	if hrp then
		Fx.confetti(hrp.Position + Vector3.new(0, 4, 0), 90)
	end
	playSound("Discover", 0.9)
	bounce(indexButton, 1.3)
end

-- the crate spin: a strip of storm cards slides by and stops on what you won
local crateOverlay = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(10, 10, 20),
	BackgroundTransparency = 0.35, Visible = false, ZIndex = 20, Active = true }, gui)
local crateWindow = make("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.48),
	Size = UDim2.new(0, 600, 0, 150), BackgroundColor3 = Color3.fromRGB(30, 30, 55), ClipsDescendants = true, ZIndex = 20 },
	crateOverlay)
corner(crateWindow, 16)
stroke(crateWindow, Color3.fromRGB(255, 220, 90), 3)
local crateScale = make("UIScale", { Scale = 1 }, crateWindow)
local crateStrip = make("Frame", { Size = UDim2.new(0, 0, 1, 0), BackgroundTransparency = 1, ZIndex = 21 }, crateWindow)
make("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 0), Size = UDim2.new(0, 4, 1, 0),
	BackgroundColor3 = Color3.fromRGB(255, 230, 90), ZIndex = 25 }, crateWindow)
local crateResult = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0.5, 90),
	Size = UDim2.new(0, 600, 0, 40), BackgroundTransparency = 1, Font = Enum.Font.FredokaOne, TextSize = 30,
	TextColor3 = Color3.new(1, 1, 1), Text = "", ZIndex = 22 }, crateOverlay)
textStroke(crateResult, 3)
local CARD_W = 116
local spinning = false
local function spinCrate(result)
	if spinning then
		return
	end
	spinning = true
	for _, c in crateStrip:GetChildren() do
		c:Destroy()
	end
	local count, target = 44, 38
	for i = 1, count do
		local weights = if result.boss then Data.BOSS_DROPS else Data.CRATE.weights
		local r = if i == target then result.rarity else Data.pickRarity(weights)
		local kinds = if r == 7 and result.boss then { Data.BOSSES[result.boss].secret } else Data.kindsOfRarity(r)
		local kind = if i == target then result.kind else kinds[math.random(#kinds)]
		local card = make("Frame", { Position = UDim2.new(0, (i - 1) * CARD_W + 4, 0, 10), Size = UDim2.new(0, CARD_W - 8, 1, -20),
			BackgroundColor3 = rarityColor(r):Lerp(Color3.new(0, 0, 0), 0.35), ZIndex = 21 }, crateStrip)
		corner(card, 12)
		stroke(card, rarityColor(r), 3)
		make("TextLabel", { Position = UDim2.new(0, 4, 0, 8), Size = UDim2.new(1, -8, 0.55, 0), BackgroundTransparency = 1,
			Font = Enum.Font.FredokaOne, TextScaled = true, TextWrapped = true, TextColor3 = Color3.new(1, 1, 1),
			Text = Data.KINDS[kind].name, ZIndex = 22 }, card)
		make("TextLabel", { Position = UDim2.new(0, 4, 0.65, 0), Size = UDim2.new(1, -8, 0.25, 0), BackgroundTransparency = 1,
			Font = Enum.Font.GothamBold, TextScaled = true, TextColor3 = rarityColor(r), Text = Data.RARITIES[r].name, ZIndex = 22 },
			card)
	end
	crateResult.Text = ""
	crateOverlay.Visible = true
	local vp = workspace.CurrentCamera.ViewportSize
	crateScale.Scale = math.clamp((vp.X - 20) / 600, 0.5, 1)
	local finalX = -((target - 1) * CARD_W + CARD_W / 2 - 300) + math.random(-30, 30)
	crateStrip.Position = UDim2.new(0, 300, 0, 0)
	local tw = TweenService:Create(crateStrip, TweenInfo.new(3.6, Enum.EasingStyle.Quint, Enum.EasingDirection.Out),
		{ Position = UDim2.new(0, finalX, 0, 0) })
	tw:Play()
	task.spawn(function()
		local lastCard = -1
		while tw.PlaybackState == Enum.PlaybackState.Playing do
			local idx = math.floor((300 - crateStrip.Position.X.Offset) / CARD_W)
			if idx ~= lastCard then
				lastCard = idx
				playSound("Tick", 0.35)
			end
			task.wait()
		end
	end)
	tw.Completed:Wait()
	local m = Data.MUTATIONS[result.mutation]
	local c = if m then m.color else rarityColor(result.rarity)
	crateResult.TextColor3 = c
	crateResult.Text = (if result.boss then "BOSS LOOT: " else "") .. Data.displayName(result.kind, result.mutation):upper() .. "!  "
		.. (if result.placed then "Added to your base" else "Base full: +" .. Data.money(result.cash))
	bounce(crateResult, 1.5)
	Fx.flash(c, 0.35, 0.6)
	playSound("CrateWin", 0.9)
	local hrp = myHrp()
	if hrp then
		Fx.confetti(hrp.Position + Vector3.new(0, 4, 0), 120)
	end
	task.wait(2.2)
	crateOverlay.Visible = false
	spinning = false
end
crateOverlay.InputBegan:Connect(function(input)
	if not spinning and (input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch) then
		crateOverlay.Visible = false
	end
end)

local pendingDiscover: { any } = {}
Tell.OnClientEvent:Connect(function(kind, a, b)
	if kind == "Discover" then
		if spinning then
			table.insert(pendingDiscover, { a, b })
		else
			discoveryCard(a, b)
		end
	elseif kind == "Crate" and type(a) == "table" then
		task.spawn(function()
			spinCrate(a)
			for _, d in pendingDiscover do
				discoveryCard(d[1], d[2])
				task.wait(2.2)
			end
			pendingDiscover = {}
		end)
	elseif kind == "Upgraded" then
		local hrp = myHrp()
		if hrp then
			Fx.burst(hrp.Position, Color3.fromRGB(255, 220, 80), 40, 16)
			Fx.ring(hrp.Position - Vector3.new(0, 2.8, 0), Color3.fromRGB(255, 220, 80), 8, 0.5)
		end
		local ui = cardUi[a]
		if ui then
			bounce(ui.card, 1.12)
		end
	end
end)

---------------------------------------------------------------- carrying: banner + arrow home
local beam: Beam? = nil
local function myPlot(): Model?
	local idx = player:GetAttribute("Plot")
	local plots = workspace:FindFirstChild("Plots")
	return idx and plots and plots:FindFirstChild("Plot" .. idx) :: Model?
end
local function refreshCarry()
	local kind = player:GetAttribute("Carrying")
	local hrp = myHrp()
	if beam then
		beam:Destroy()
		beam = nil
	end
	if type(kind) ~= "string" or kind == "" or not Data.KINDS[kind] then
		carryLabel.Visible = false
		return
	end
	local info = Data.KINDS[kind]
	carryLabel.Text = "Carrying " .. info.name .. "! Get it to your base!"
	carryLabel.TextColor3 = rarityColor(info.rarity)
	carryLabel.Visible = true
	bounce(carryLabel, 1.2)
	local plot = myPlot()
	local pad = plot and plot:FindFirstChild("SpawnPad")
	if hrp and pad and pad:IsA("BasePart") then
		local a0 = Instance.new("Attachment")
		a0.Parent = hrp
		local a1 = Instance.new("Attachment")
		a1.WorldPosition = pad.Position + Vector3.new(0, 2, 0)
		a1.Parent = workspace.Terrain
		local b = Instance.new("Beam")
		b.Attachment0, b.Attachment1 = a0, a1
		b.Width0, b.Width1 = 0.8, 0.8
		b.FaceCamera = true
		b.LightEmission = 1
		b.Transparency = NumberSequence.new(0.35)
		b.Color = ColorSequence.new(Color3.fromRGB(120, 255, 140))
		b.Segments = 20
		b.CurveSize0, b.CurveSize1 = 6, -6
		b.TextureSpeed = 2
		b.Parent = a0
		beam = b
		b.Destroying:Connect(function()
			task.defer(function()
				a0:Destroy()
				a1:Destroy()
			end)
		end)
	end
end
player:GetAttributeChangedSignal("Carrying"):Connect(refreshCarry)
player.CharacterAdded:Connect(function()
	task.wait(0.5)
	refreshCarry()
end)

-- someone is robbing your base: red flashes in the base
local alarmUntil = 0
local alarmLight: PointLight? = nil
local function watchAlarm()
	local plot = myPlot()
	if not plot then
		return
	end
	plot:GetAttributeChangedSignal("Alarm"):Connect(function()
		alarmUntil = os.clock() + 6
		Fx.flash(Color3.fromRGB(255, 30, 40), 0.35, 0.6)
		local floor = plot:FindFirstChild("Floor")
		if floor and not alarmLight then
			alarmLight = make("PointLight", { Color = Color3.fromRGB(255, 30, 40), Range = 40, Brightness = 0 }, floor)
		end
	end)
end
player:GetAttributeChangedSignal("Plot"):Connect(watchAlarm)
watchAlarm()

---------------------------------------------------------------- your dash and the wind launch pads
local dashReady = 0
local function pushHorizontal(hrp: BasePart, velocity: Vector3, time: number)
	local att = Instance.new("Attachment")
	att.Parent = hrp
	local lv = Instance.new("LinearVelocity")
	lv.Attachment0 = att
	lv.ForceLimitsEnabled = true
	lv.ForceLimitMode = Enum.ForceLimitMode.PerAxis
	lv.MaxAxesForce = Vector3.new(1, 0, 1) * 1e6
	lv.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
	lv.RelativeTo = Enum.ActuatorRelativeTo.World
	lv.VectorVelocity = velocity
	lv.Parent = hrp
	Debris:AddItem(lv, time)
	Debris:AddItem(att, time)
end
local function dash()
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local hrp = myHrp()
	local t = os.clock()
	if not hum or not hrp or hum.Health <= 0 or hum.Sit or hum.PlatformStand or t < dashReady then
		return
	end
	local dir = hum.MoveDirection
	if dir.Magnitude < 0.1 then
		dir = hrp.CFrame.LookVector
	end
	dir = Vector3.new(dir.X, 0, dir.Z)
	if dir.Magnitude < 0.01 then
		return
	end
	dir = dir.Unit
	dashReady = t + Data.DASH.cooldown
	pushHorizontal(hrp, dir * Data.DASH.speed, Data.DASH.time)
	Fx.fov(14)
	Fx.burst(hrp.Position - Vector3.new(0, 2, 0), Color3.fromRGB(170, 220, 255), 24, 12)
	local tr = Fx.trail(hrp, Color3.fromRGB(170, 220, 255), 2)
	Debris:AddItem(tr, 0.5)
	playSound("Dash", 0.7)
	Move:FireServer("dash")
end
dashButton.Activated:Connect(dash)

local blastReady = 0
local function predictTarget(origin: Vector3, aim: Vector3): Vector3?
	local best, bestScore = nil, -math.huge
	local function consider(pos: Vector3, range: number)
		local to = pos - origin
		local dist = to.Magnitude
		if dist > range or dist < 0.1 then
			return
		end
		local dot = to.Unit:Dot(aim)
		if dot < Data.BLAST.cone then
			return
		end
		local score = dot * 2 - dist / range
		if score > bestScore then
			best, bestScore = pos, score
		end
	end
	for body in bosses do
		consider(body.Position, Data.BLAST.range + 50)
	end
	for body in spirits do
		consider(body.Position, Data.BLAST.range)
	end
	return best
end
local function blast()
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local hrp = myHrp()
	local t = os.clock()
	if not hum or not hrp or hum.Health <= 0 or t < blastReady then
		return
	end
	blastReady = t + Data.BLAST.cooldown
	local aim = workspace.CurrentCamera.CFrame.LookVector
	local origin = hrp.Position + Vector3.new(0, 1.5, 0)
	local target = predictTarget(origin, aim)
	Fx.projectile(origin, target or (origin + aim * 80), BLAST_COLOR, target ~= nil)
	bounce(blastButton, 0.85)
	playSound("Blast", 0.7)
	BlastRemote:FireServer(aim)
end
blastButton.Activated:Connect(blast)
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.KeyCode == Enum.KeyCode.Q or input.KeyCode == Enum.KeyCode.ButtonX then
		dash()
	elseif input.KeyCode == Enum.KeyCode.F or input.KeyCode == Enum.KeyCode.ButtonR2
		or input.UserInputType == Enum.UserInputType.MouseButton1 then
		blast()
	end
end)

local pads = {}
do
	local world = workspace:WaitForChild("World")
	local folder = world:WaitForChild("GustPads", 10)
	if folder then
		for _, p in folder:GetChildren() do
			local launch = p:FindFirstChild("Launch")
			if p.Name == "GustPad" and p:IsA("BasePart") and launch and launch:IsA("Vector3Value") then
				table.insert(pads, { part = p, launch = launch.Value, ready = 0 })
				make("ParticleEmitter", {
					Texture = "rbxasset://textures/particles/sparkles_main.dds",
					Color = ColorSequence.new(Color3.fromRGB(170, 245, 255)),
					LightEmission = 1,
					Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 0) }),
					Rate = 14,
					Lifetime = NumberRange.new(0.6, 1),
					Speed = NumberRange.new(6, 10),
					Acceleration = launch.Value.Unit * 10,
					EmissionDirection = Enum.NormalId.Right, -- the cylinder's axis points up
					SpreadAngle = Vector2.new(25, 25),
				}, p)
			end
		end
	end
end
local function checkPads(t: number)
	local hrp = myHrp()
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not hrp or not hum or hum.Health <= 0 then
		return
	end
	for _, pad in pads do
		local d = hrp.Position - pad.part.Position
		if t >= pad.ready and math.abs(d.Y) < 5 and Vector3.new(d.X, 0, d.Z).Magnitude < 4.6 then
			pad.ready = t + 1.2
			hum:ChangeState(Enum.HumanoidStateType.Jumping)
			hrp.AssemblyLinearVelocity = Vector3.new(pad.launch.X, 72, pad.launch.Z)
			pushHorizontal(hrp, pad.launch, 0.85)
			Fx.ring(pad.part.Position, Color3.fromRGB(150, 240, 255), 9, 0.4)
			Fx.burst(pad.part.Position + Vector3.new(0, 1, 0), Color3.fromRGB(170, 245, 255), 40, 22)
			Fx.fov(22)
			local tr = Fx.trail(hrp, Color3.fromRGB(150, 245, 255), 2.4)
			Debris:AddItem(tr, 1.2)
			playSound("Launch", 0.8)
			Move:FireServer("launch")
		end
	end
end

---------------------------------------------------------------- sky: zones and weather events
local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
local grade = Lighting:FindFirstChildOfClass("ColorCorrectionEffect")
local function look(b, oa, dens, atmo, tint, clock)
	return { Brightness = b, OutdoorAmbient = oa, Density = dens, AtmoColor = atmo, Tint = tint, Clock = clock }
end
local SUNNY = look(Lighting.Brightness, Lighting.OutdoorAmbient, atmosphere and atmosphere.Density or 0.3,
	atmosphere and atmosphere.Color or Color3.new(1, 1, 1), grade and grade.TintColor or Color3.new(1, 1, 1), Lighting.ClockTime)
local EYE = look(1.1, Color3.fromRGB(80, 74, 100), 0.45, Color3.fromRGB(110, 96, 140), Color3.fromRGB(220, 210, 255), SUNNY.Clock)
local STAGE_LOOK = {
	SUNNY,
	look(2.7, Color3.fromRGB(150, 130, 100), 0.32, Color3.fromRGB(235, 215, 170), Color3.fromRGB(255, 240, 215), 15.5),
	look(2.5, Color3.fromRGB(160, 175, 205), 0.42, Color3.fromRGB(225, 238, 255), Color3.fromRGB(228, 242, 255), 13),
	look(1.1, Color3.fromRGB(120, 64, 54), 0.5, Color3.fromRGB(130, 64, 52), Color3.fromRGB(255, 205, 185), 17.8),
	EYE,
}
local STAGE_CLOUDS = {
	{ 0.5, Color3.fromRGB(245, 245, 250) },
	{ 0.55, Color3.fromRGB(250, 240, 225) },
	{ 0.65, Color3.fromRGB(235, 240, 250) },
	{ 0.8, Color3.fromRGB(90, 80, 80) },
	{ 0.92, Color3.fromRGB(95, 85, 120) },
}
local EVENT_LOOK = {
	LightningStorm = look(0.9, Color3.fromRGB(70, 76, 105), 0.5, Color3.fromRGB(90, 100, 135), Color3.fromRGB(200, 212, 255), 15),
	RainbowSky = look(2.8, Color3.fromRGB(160, 150, 180), 0.25, Color3.fromRGB(255, 215, 245), Color3.fromRGB(255, 240, 252), 13),
	MeteorShower = look(1.3, Color3.fromRGB(110, 80, 110), 0.35, Color3.fromRGB(200, 120, 110), Color3.fromRGB(255, 215, 200), 18.6),
	DeepFreeze = look(2.2, Color3.fromRGB(150, 170, 205), 0.45, Color3.fromRGB(225, 238, 255), Color3.fromRGB(222, 240, 255), 13),
	BloodMoon = look(0.9, Color3.fromRGB(120, 40, 50), 0.45, Color3.fromRGB(150, 30, 40), Color3.fromRGB(255, 185, 185), 0),
	GoldenHour = look(2.8, Color3.fromRGB(175, 145, 95), 0.3, Color3.fromRGB(255, 210, 140), Color3.fromRGB(255, 236, 200), 17.5),
}
local EVENT_PARTICLES = {
	LightningStorm = { color = Color3.fromRGB(170, 200, 255), speed = 70, size = 0.18, rate = 160, dir = Vector3.new(0, -1, 0) },
	DeepFreeze = { color = Color3.fromRGB(255, 255, 255), speed = 6, size = 0.35, rate = 90, dir = Vector3.new(0.2, -1, 0) },
	BloodMoon = { color = Color3.fromRGB(255, 70, 60), speed = 3, size = 0.3, rate = 50, dir = Vector3.new(0, 1, 0) },
	GoldenHour = { color = Color3.fromRGB(255, 215, 110), speed = 2, size = 0.3, rate = 50, dir = Vector3.new(0, 1, 0) },
	RainbowSky = { color = Color3.fromRGB(255, 170, 230), speed = 2, size = 0.35, rate = 50, dir = Vector3.new(0, 1, 0) },
	MeteorShower = { color = Color3.fromRGB(255, 160, 90), speed = 4, size = 0.25, rate = 40, dir = Vector3.new(0, -1, 0) },
}
local weatherPart = Fx.part({ Transparency = 1, Size = Vector3.new(90, 1, 90) })
local weatherEmitter = make("ParticleEmitter", { Texture = "rbxasset://textures/particles/sparkles_main.dds", Rate = 0,
	Lifetime = NumberRange.new(2, 3), EmissionDirection = Enum.NormalId.Bottom, SpreadAngle = Vector2.new(5, 5),
	LightEmission = 0.8 }, weatherPart)
local rainbowArcs: { BasePart } = {}
local function setRainbowArcs(on: boolean)
	if on and #rainbowArcs == 0 then
		local colors = { Color3.fromRGB(255, 70, 70), Color3.fromRGB(255, 160, 50), Color3.fromRGB(255, 235, 70),
			Color3.fromRGB(90, 220, 100), Color3.fromRGB(70, 160, 255), Color3.fromRGB(150, 90, 230) }
		for _, center in { Vector3.new(-60, 0, 200), Vector3.new(90, 0, 120) } do
			for band, c in colors do
				local r = 150 - band * 6
				for k = 0, 16 do
					local a = k / 16 * math.pi
					local p = Fx.part({ Color = c, Transparency = 1, Size = Vector3.new(6, 31, 2),
						CFrame = CFrame.new(center + Vector3.new(math.cos(a) * r, math.sin(a) * r, 0)) * CFrame.Angles(0, 0, a) })
					Fx.tween(p, 2, { Transparency = 0.35 })
					table.insert(rainbowArcs, p)
				end
			end
		end
	elseif not on and #rainbowArcs > 0 then
		for _, p in rainbowArcs do
			Fx.tween(p, 2, { Transparency = 1 })
			Debris:AddItem(p, 2.1)
		end
		rainbowArcs = {}
	end
end

local currentEvent = ""
local function onEvent()
	local id = workspace:GetAttribute("Event") or ""
	if id == currentEvent then
		return
	end
	currentEvent = id
	local ev = Data.EVENTS[id]
	setRainbowArcs(id == "RainbowSky")
	local P = EVENT_PARTICLES[id]
	if P then
		weatherEmitter.Color = ColorSequence.new(P.color)
		weatherEmitter.Speed = NumberRange.new(P.speed, P.speed * 1.3)
		weatherEmitter.Size = NumberSequence.new(P.size)
		weatherEmitter.Rate = P.rate
		weatherEmitter.Acceleration = P.dir * P.speed * 0.2
		weatherEmitter.EmissionDirection = if P.dir.Y > 0 then Enum.NormalId.Top else Enum.NormalId.Bottom
	else
		weatherEmitter.Rate = 0
	end
	if ev then
		Fx.flash(ev.color, 0.45, 1)
		Fx.popup(ev.name:upper() .. "!", ev.color, ev.desc, 2.6)
		Fx.shake(0.8)
		playSound("Event", 1)
		eventStroke.Color = ev.color
		bounce(eventBar, 1.3)
	else
		eventStroke.Color = Color3.fromRGB(120, 140, 200)
	end
end
workspace:GetAttributeChangedSignal("Event"):Connect(onEvent)
onEvent()

---------------------------------------------------------------- goals: always tell players what to do next
local function myStorms(): { Shown }
	local list = {}
	for _, s in shown do
		if s.root:GetAttribute("State") == "placed" and s.root:GetAttribute("Owner") == player.UserId then
			table.insert(list, s)
		end
	end
	return list
end
local function refreshGoal()
	local cash = player:GetAttribute("Cash") or 0
	local speed = player:GetAttribute("SpeedLv") or 0
	local carry = player:GetAttribute("CarryLv") or 0
	local crates = player:GetAttribute("Crates") or 0
	local rebirths = player:GetAttribute("Rebirths") or 0
	local count = #myStorms()
	local carrying = (player:GetAttribute("Carrying") or "") ~= ""
	local text
	local bossId = workspace:GetAttribute("Boss") or ""
	local hrpNow = myHrp()
	local bossDef = Data.BOSSES[bossId]
	local inArena = bossDef and hrpNow and (Vector3.new(hrpNow.Position.X, 0, hrpNow.Position.Z) - bossDef.center).Magnitude
		< bossDef.radius + 20
	if carrying then
		text = "Follow the green line home! Press DASH to dodge spirits and lightning"
	elseif bossDef and inArena then
		text = "BLAST the boss! Dodge the red circles, JUMP over the shockwave"
	elseif bossDef then
		text = "A BOSS is awake! Jump into the red BOSS PORTAL by the road to fight it"
	elseif crates > 0 then
		text = "You have a FREE CRATE! Tap the green button"
	elseif count == 0 then
		text = "Go catch a storm in the meadow: walk up to one and hold the prompt"
	elseif speed == 0 and cash >= Data.UPGRADES.Speed.cost(0) then
		text = "Buy a SPEED upgrade so the storm spirits can't catch you"
	elseif carry == 0 then
		text = "Save " .. Data.money(Data.UPGRADES.Carry.cost(0)) .. " for CARRY POWER to lift Rare storms"
	elseif count >= Data.BASE_SLOTS then
		text = "Base full! Sell your weakest storms to make room for better ones"
	elseif cash >= Data.rebirthCost(rebirths) then
		text = "You can REBIRTH for x" .. Data.rebirthMult(rebirths + 1) .. " income! (Upgrades menu)"
	elseif carry < Data.UPGRADES.Carry.max then
		text = "Rarer storms live further north. Carry Power lets you lift them"
	else
		text = "Hunt Mythic storms in the Eye of the Storm, and steal the best ones!"
	end
	goalLabel.Text = text
	local crateIn = player:GetAttribute("CrateIn") or 0
	if crates > 0 then
		crateButton.Text = "FREE CRATE"
		crateBadge.Visible = true
		crateBadge.Text = tostring(crates)
	else
		crateButton.Text = ("CRATE %d:%02d"):format(crateIn // 60, crateIn % 60)
		crateBadge.Visible = false
	end
end

---------------------------------------------------------------- per frame
local plotsFolder = workspace:WaitForChild("Plots")
local world = workspace:WaitForChild("World")
local vortex = world:FindFirstChild("Vortex") :: Model?
local vortexPivot = vortex and vortex:GetPivot()
local zoneMix, eventMix = 0, 0
local stageSky = SUNNY
local myStage = 1
local pullForce: LinearVelocity? = nil
local portalCore = world:FindFirstChild("BossPortal") and (world :: any).BossPortal:FindFirstChild("PortalCore")
local nextFlash = 0
local flashUntil = 0
local nextPopup = 0
local nextGoal = 0
local wasEvent = ""

local function lockText()
	local plot = myPlot()
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

local function blend(a, b, x: number)
	return {
		Brightness = a.Brightness + (b.Brightness - a.Brightness) * x,
		OutdoorAmbient = a.OutdoorAmbient:Lerp(b.OutdoorAmbient, x),
		Density = a.Density + (b.Density - a.Density) * x,
		AtmoColor = a.AtmoColor:Lerp(b.AtmoColor, x),
		Tint = a.Tint:Lerp(b.Tint, x),
		Clock = a.Clock + (b.Clock - a.Clock) * x,
	}
end

RunService.RenderStepped:Connect(function(dt)
	local t = os.clock()
	local cam = workspace.CurrentCamera
	local camPos = cam.CFrame.Position
	for root, s in shown do
		if root.Parent and (root.Position - camPos).Magnitude < 260 then
			Visuals.update(s.vis, root.CFrame, t + s.seed)
		end
	end
	local hrp = myHrp()
	local nearest = math.huge
	for body, vis in spirits do
		if body.Parent then
			local stunned = t - (vis.stunAt or -10) < Data.BLAST.stun
			Visuals.update(vis, if stunned then body.CFrame * CFrame.new(math.sin(t * 50) * 0.25, 0, 0) else body.CFrame, t)
			-- charging: the eyes flare white-hot; stunned: they go dim
			local charge = math.clamp(1 - (t - vis.chargeAt) / Data.SPIRIT.chargeTime, 0, 1)
			for _, piece in vis.pieces do
				if piece.part.Name == "Eye" then
					piece.part.Size = Vector3.new(0.7, 0.36, 0.25) * (1 + charge * 0.8)
					piece.part.Color = if stunned then Color3.fromRGB(90, 100, 120)
						else rarityColor(body:GetAttribute("Rarity") or 1):Lerp(Color3.new(1, 1, 1), charge)
				end
			end
			if hrp and body:GetAttribute("Target") == player.UserId and not stunned then
				nearest = math.min(nearest, (body.Position - hrp.Position).Magnitude)
			end
		end
	end
	local d = math.clamp(1 - (nearest - 6) / 24, 0, 1)
	dangerStroke.Thickness = d * (14 + math.sin(t * 12) * 4)
	-- cash counts up smoothly
	local target = player:GetAttribute("Cash") or 0
	shownCash += (target - shownCash) * math.min(1, dt * 8)
	if math.abs(target - shownCash) < 1 then
		shownCash = target
	end
	cashLabel.Text = Data.money(shownCash)
	-- dash cooldown
	local left = math.max(0, dashReady - t)
	dashFill.Size = UDim2.fromScale(1, left / Data.DASH.cooldown)
	blastFill.Size = UDim2.fromScale(1, math.max(0, blastReady - t) / Data.BLAST.cooldown)
	checkPads(t)
	-- tornadoes and bosses
	for body, vis in tornadoes do
		if body.Parent then
			Visuals.update(vis, CFrame.new(body.Position), t)
		end
	end
	local phase = workspace:GetAttribute("BossPhase") or 1
	local serverNow = workspace:GetServerTimeNow()
	local pulling = false
	for body, vis in bosses do
		if body.Parent then
			Visuals.update(vis, body.CFrame, t * (if phase == 2 then 1.6 else 1))
			for _, e in vis.eyes do
				e.Color = if phase == 2 then Color3.fromRGB(255, 60, 60)
					elseif body:GetAttribute("BossId") == "TornadoTyrant" then Color3.fromRGB(255, 110, 255)
					else Color3.fromRGB(140, 200, 255)
			end
			-- the tyrant's pull drags you toward its funnel
			if hrp and serverNow < (body:GetAttribute("PullUntil") or 0) then
				local d = body.Position - hrp.Position
				local flat = Vector3.new(d.X, 0, d.Z)
				if flat.Magnitude < 90 and flat.Magnitude > 2 then
					pulling = true
					if not pullForce then
						local att = Instance.new("Attachment")
						att.Name = "PullAttachment"
						att.Parent = hrp
						local lv = Instance.new("LinearVelocity")
						lv.Attachment0 = att
						lv.ForceLimitsEnabled = true
						lv.ForceLimitMode = Enum.ForceLimitMode.PerAxis
						lv.MaxAxesForce = Vector3.new(1, 0, 1) * hrp.AssemblyMass * 110
						lv.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
						lv.RelativeTo = Enum.ActuatorRelativeTo.World
						lv.Parent = hrp
						pullForce = lv
					end
					(pullForce :: LinearVelocity).VectorVelocity = flat.Unit * (body:GetAttribute("PullPower") or 18)
				end
			end
		end
	end
	if not pulling and pullForce then
		local att = pullForce.Attachment0
		pullForce:Destroy()
		if att then
			att:Destroy()
		end
		pullForce = nil
	end
	-- the vortex turns
	if vortex and vortexPivot then
		vortex:PivotTo(CFrame.new(0, 0, 512) * CFrame.Angles(0, t * 0.05, 0) * CFrame.new(0, 0, -512) * vortexPivot)
	end
	-- the boss portal glows while a boss is awake
	if portalCore then
		local active = (workspace:GetAttribute("Boss") or "") ~= ""
		portalCore.Transparency = if active then 0.15 + 0.15 * math.sin(t * 6) else 0.85
	end
	-- the sky: zone darkening toward the Eye, then the weather event on top
	if hrp then
		local stage = Data.stageAt(hrp.Position.Z)
		zoneMix = if stage >= 5 then 1 else 0
		weatherPart.CFrame = CFrame.new(camPos + Vector3.new(0, 25, 0))
		stageSky = blend(stageSky, STAGE_LOOK[stage], math.min(1, dt * 1.5))
		if stage ~= myStage then
			if stage > myStage and hrp.Position.Z > 12 then
				local S = Data.STAGES[stage]
				Fx.popup("STAGE " .. stage .. ": " .. S.name:upper(), S.color, ("Spirits are faster here (speed %d) and more things hunt you!"):format(
					S.spiritSpeed), 2)
				playSound("Stage", 0.8)
			end
			myStage = stage
		end
		local clouds = workspace.Terrain:FindFirstChildOfClass("Clouds")
		if clouds then
			local want = STAGE_CLOUDS[stage]
			clouds.Cover += (want[1] - clouds.Cover) * math.min(1, dt)
			clouds.Color = clouds.Color:Lerp(want[2], math.min(1, dt))
		end
	end
	local ev = EVENT_LOOK[currentEvent]
	if currentEvent ~= wasEvent then
		if ev then
			eventMix = 0
		end
		wasEvent = currentEvent
	end
	eventMix += ((if ev then 1 else 0) - eventMix) * math.min(1, dt * 1.2)
	local sky = stageSky
	if ev then
		sky = blend(sky, ev, eventMix)
	end
	Lighting.Brightness = sky.Brightness + (if t < flashUntil then 3 else 0)
	Lighting.OutdoorAmbient = sky.OutdoorAmbient
	Lighting.ClockTime = sky.Clock
	if atmosphere then
		atmosphere.Density = sky.Density
		atmosphere.Color = sky.AtmoColor
	end
	if grade then
		grade.TintColor = sky.Tint
	end
	if (zoneMix > 0.6 or currentEvent == "LightningStorm") and t > nextFlash then
		nextFlash = t + (if currentEvent == "LightningStorm" then 1.5 else 4) + math.random() * 5
		flashUntil = t + 0.12
		playSound("Thunder", 0.35)
	end
	-- base alarm light
	if alarmLight then
		alarmLight.Brightness = if t < alarmUntil then (math.sin(t * 14) > 0 and 4 or 0) else 0
	end
	-- money pops off your storms
	if t > nextPopup then
		nextPopup = t + 3
		local list = myStorms()
		local baseTotal = 0
		for _, s in list do
			baseTotal += Data.income(s.root:GetAttribute("Kind"), s.root:GetAttribute("Mutation"))
		end
		local ratio = if baseTotal > 0 then (player:GetAttribute("Income") or 0) / baseTotal else 1
		for _, s in list do
			local p = s.root.Position
			if (p - camPos).Magnitude < 110 then
				local amount = Data.income(s.root:GetAttribute("Kind"), s.root:GetAttribute("Mutation")) * ratio * 3
				Fx.float(p + Vector3.new(math.random() * 2 - 1, 1, 0), "+" .. Data.money(amount), Color3.fromRGB(130, 255, 140), 22, 4)
			end
		end
	end
	-- HUD text
	if t > nextGoal then
		nextGoal = t + 0.5
		refreshGoal()
		local now = workspace:GetServerTimeNow()
		local evDef = Data.EVENTS[currentEvent]
		if evDef then
			local leftEv = math.max(0, math.floor((workspace:GetAttribute("EventEnds") or 0) - now))
			eventTitle.Text = ("%s  %d:%02d"):format(evDef.name:upper(), leftEv // 60, leftEv % 60)
			eventTitle.TextColor3 = evDef.color
			eventSub.Text = evDef.desc
		else
			local nextIn = math.max(0, math.floor((workspace:GetAttribute("NextEvent") or 0) - now))
			local bossIn = math.max(0, math.floor((workspace:GetAttribute("NextBoss") or 0) - now))
			eventTitle.Text = "Clear skies"
			eventTitle.TextColor3 = Color3.new(1, 1, 1)
			eventSub.Text = ("Weather in %d:%02d  |  Boss in %d:%02d"):format(nextIn // 60, nextIn % 60, bossIn // 60, bossIn % 60)
		end
	end
	lockButton.Text = lockText()
	-- boss health bar
	local bossId = workspace:GetAttribute("Boss") or ""
	local bdef = Data.BOSSES[bossId]
	bossBar.Visible = bdef ~= nil
	if bdef then
		local hp = workspace:GetAttribute("BossHP") or 0
		local maxHp = math.max(1, workspace:GetAttribute("BossMaxHP") or 1)
		shownBossHp += (hp / maxHp - shownBossHp) * math.min(1, dt * 6)
		bossFill.Size = UDim2.fromScale(math.clamp(shownBossHp, 0, 1), 1)
		bossHpText.Text = ("%d / %d"):format(math.ceil(hp), maxHp)
		local enraged = (workspace:GetAttribute("BossPhase") or 1) == 2
		bossName.Text = bdef.name:upper() .. (if enraged then "  ENRAGED!" else "")
		bossName.TextColor3 = if enraged then Color3.fromRGB(255, 90, 90) else bdef.color
		bossStroke.Color = if enraged then Color3.fromRGB(255, 60, 60) else bdef.color
		local leftB = math.max(0, math.floor((workspace:GetAttribute("BossEnds") or 0) - workspace:GetServerTimeNow()))
		bossTime.Text = ("%d:%02d"):format(leftB // 60, leftB % 60)
	else
		shownBossHp = 1
	end
	local vp = cam.ViewportSize
	local fit = math.clamp(math.min((vp.X - 20) / 790, (vp.Y - 90) / 290), 0.4, 1)
	shopScale.Scale = fit
	indexScale.Scale = math.clamp(math.min((vp.X - 20) / 640, (vp.Y - 90) / 430), 0.45, 1)
	-- small screens: buttons go to the top right and shrink (clear of the jump button)
	if vp.Y < 600 then
		side.AnchorPoint = Vector2.new(1, 0)
		side.Position = UDim2.new(1, -10, 0, 4)
		sideScale.Scale = math.clamp((vp.Y - 170) / 270, 0.5, 1)
	else
		side.AnchorPoint = Vector2.new(1, 0.5)
		side.Position = UDim2.new(1, -10, 0.5, 0)
		sideScale.Scale = 1
	end
end)

local _ = plotsFolder
toast("Catch storms, outrun the storm spirits, bring them home and get rich!", Color3.fromRGB(255, 230, 120))
