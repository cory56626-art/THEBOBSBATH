-- Precinct 9 client: team choice, HUD, minimap, dispatch + GPS, driving (this device runs your car's physics),
-- wheels, light bars, sirens, engines, prompts (drive / steal / ride / arrest), taser and other effects.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local Debris = game:GetService("Debris")

local Data = require(ReplicatedStorage:WaitForChild("P9Data"))
local CarPhysics = require(ReplicatedStorage:WaitForChild("CarPhysics"))
local Bank = require(ReplicatedStorage:WaitForChild("P9SoundBank"))
local remotes = ReplicatedStorage:WaitForChild("P9Remotes")
local R: { [string]: RemoteEvent } = {}
for _, n in { "PickTeam", "CarAction", "CarToggle", "SpawnCar", "Taser", "Arrest", "Notify", "Knock", "Fx", "Equip", "Fire",
	"Action", "StopInfo" } do
	R[n] = remotes:WaitForChild(n) :: RemoteEvent
end

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
local carsFolder = workspace:WaitForChild("Cars")

local function myTeam(): string
	return player:GetAttribute("Team") or ""
end
local function myChar(): (Model?, Humanoid?, BasePart?)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	return char, hum, (if hrp and hrp:IsA("BasePart") then hrp else nil)
end

---------------------------------------------------------------- sounds
local function makeSound(name: string, volume: number, parent: Instance): Sound?
	local r = Bank.Regions[name]
	if not r then
		return nil
	end
	local snd = Instance.new("Sound")
	snd.SoundId = (Bank.Ids and Bank.Ids[r[3] or 1]) or Bank.Id
	snd.PlaybackRegionsEnabled = true
	snd.PlaybackRegion = NumberRange.new(r[1], r[2])
	snd.Volume = volume
	snd.Parent = parent
	return snd
end

local function playSound(name: string, volume: number?, at: Vector3?)
	local r = Bank.Regions[name]
	if not r then
		return
	end
	if at and (camera.CFrame.Position - at).Magnitude > 250 then
		return
	end
	local holder: Instance = camera
	if at then
		local att = Instance.new("Attachment")
		att.WorldPosition = at
		att.Parent = workspace.Terrain
		holder = att
		Debris:AddItem(att, r[2] - r[1] + 1)
	end
	local snd = makeSound(name, volume or 0.7, holder) :: Sound
	snd.PlaybackSpeed = 0.96 + math.random() * 0.08
	if at then
		snd.RollOffMinDistance = 12
		snd.RollOffMaxDistance = 250
	end
	snd:Play()
	Debris:AddItem(snd, r[2] - r[1] + 0.5)
end

local function loopSound(name: string, volume: number, parent: Instance): Sound?
	local r = Bank.Regions[name]
	local snd = makeSound(name, volume, parent)
	if not snd or not r then
		return nil
	end
	snd.Looped = true
	snd.LoopRegion = NumberRange.new(r[1], r[2])
	snd.RollOffMinDistance = 18
	snd.RollOffMaxDistance = 420
	snd:Play()
	return snd
end

---------------------------------------------------------------- UI helpers
local function new(class: string, props: { [string]: any }, parent: Instance?): any
	local o = Instance.new(class)
	for k, val in props do
		(o :: any)[k] = val
	end
	if parent then
		o.Parent = parent
	end
	return o
end
local function corner(o: Instance, r: number?)
	new("UICorner", { CornerRadius = UDim.new(0, r or 10) }, o)
end
local function stroke(o: Instance, color: Color3, thickness: number?)
	new("UIStroke", { Color = color, Thickness = thickness or 1.5, Transparency = 0.25,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border }, o)
end
local DARK = Color3.fromRGB(14, 18, 28)
local BLUE = Color3.fromRGB(70, 120, 255)
local ORANGE = Color3.fromRGB(255, 150, 40)
local GREEN = Color3.fromRGB(80, 210, 120)
local WHITE = Color3.new(1, 1, 1)

local gui = new("ScreenGui", { Name = "P9Hud", ResetOnSpawn = false, ZIndexBehavior = Enum.ZIndexBehavior.Sibling },
	player:WaitForChild("PlayerGui"))

local function label(parent: Instance, props: { [string]: any }): TextLabel
	local base = { BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextColor3 = WHITE, TextSize = 16,
		TextStrokeTransparency = 0.6 }
	for k, val in props do
		base[k] = val
	end
	return new("TextLabel", base, parent)
end

local function button(parent: Instance, text: string, color: Color3, size: UDim2): TextButton
	local b = new("TextButton", { Size = size, BackgroundColor3 = color, BackgroundTransparency = 0.1, AutoButtonColor = true,
		Font = Enum.Font.GothamBlack, Text = text, TextColor3 = WHITE, TextScaled = true }, parent)
	corner(b, 12)
	stroke(b, Color3.new(0, 0, 0), 2)
	new("UIPadding", { PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6), PaddingTop = UDim.new(0, 8),
		PaddingBottom = UDim.new(0, 8) }, b)
	return b
end

---------------------------------------------------------------- status card (rank, cash, xp)
local card = new("Frame", { Size = UDim2.fromOffset(220, 74), Position = UDim2.fromOffset(10, 10), BackgroundColor3 = DARK,
	BackgroundTransparency = 0.2 }, gui)
corner(card)
local cardStroke = new("UIStroke", { Color = BLUE, Thickness = 2, Transparency = 0.2 }, card)
local rankLbl = label(card, { Position = UDim2.fromOffset(12, 6), Size = UDim2.fromOffset(196, 20), Font = Enum.Font.GothamBlack,
	TextXAlignment = Enum.TextXAlignment.Left, Text = "PRECINCT 9" })
local cashLbl = label(card, { Position = UDim2.fromOffset(12, 27), Size = UDim2.fromOffset(196, 24), TextSize = 22,
	TextColor3 = Color3.fromRGB(120, 255, 140), TextXAlignment = Enum.TextXAlignment.Left, Text = "$0" })
local xpBack = new("Frame", { Position = UDim2.fromOffset(12, 56), Size = UDim2.fromOffset(196, 8),
	BackgroundColor3 = Color3.fromRGB(40, 46, 60) }, card)
corner(xpBack, 4)
local xpFill = new("Frame", { Size = UDim2.fromScale(0, 1), BackgroundColor3 = BLUE }, xpBack)
corner(xpFill, 4)

local function refreshCard()
	local team = myTeam()
	local xp = player:GetAttribute("XP") or 0
	local idx = Data.rankOf(xp)
	local cur, nxt = Data.RANKS[idx], Data.RANKS[idx + 1]
	cashLbl.Text = Data.money(player:GetAttribute("Cash") or 0)
	xpBack.Visible = team ~= "Civilian"
	if team == "Civilian" then
		local wanted = (player:GetAttribute("Wanted") or 0) > 0
		rankLbl.Text = if wanted then "WANTED" else "CIVILIAN"
		rankLbl.TextColor3 = if wanted then Color3.fromRGB(255, 90, 70) else GREEN
		cardStroke.Color = if wanted then Color3.fromRGB(255, 90, 70) else GREEN
	else
		rankLbl.Text = string.upper(cur.name) .. (if nxt then ("  ·  %d/%d XP"):format(xp, nxt.xp) else "  ·  MAX")
		rankLbl.TextColor3 = WHITE
		cardStroke.Color = BLUE
	end
	xpFill.Size = UDim2.fromScale(if nxt then math.clamp((xp - cur.xp) / (nxt.xp - cur.xp), 0, 1) else 1, 1)
	xpFill.BackgroundColor3 = BLUE
end
for _, a in { "Cash", "XP", "Team", "Wanted" } do
	player:GetAttributeChangedSignal(a):Connect(refreshCard)
end
refreshCard()

---------------------------------------------------------------- wanted stars, toasts, jail and tased overlays
local starsLbl = label(gui, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 6), Size = UDim2.fromOffset(260, 40),
	TextSize = 36, TextColor3 = Color3.fromRGB(255, 210, 60), Font = Enum.Font.GothamBlack, Visible = false })
local function refreshStars()
	local n = player:GetAttribute("Wanted") or 0
	starsLbl.Visible = myTeam() == "Civilian" and n > 0
	starsLbl.Text = string.rep("★", n) .. string.rep("☆", Data.WANTED.max - n)
end
player:GetAttributeChangedSignal("Wanted"):Connect(refreshStars)
player:GetAttributeChangedSignal("Team"):Connect(refreshStars)

local toastHolder = new("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 50),
	Size = UDim2.fromOffset(440, 150), BackgroundTransparency = 1 }, gui)
new("UIListLayout", { Padding = UDim.new(0, 6), HorizontalAlignment = Enum.HorizontalAlignment.Center,
	SortOrder = Enum.SortOrder.LayoutOrder }, toastHolder)
local toastN = 0
local function toast(text: string, color: Color3?)
	toastN += 1
	local t = label(toastHolder, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextWrapped = true,
		Text = text, TextSize = 17, BackgroundTransparency = 0.25, BackgroundColor3 = DARK, TextColor3 = color or WHITE,
		LayoutOrder = toastN })
	corner(t, 8)
	new("UIPadding", { PaddingTop = UDim.new(0, 6), PaddingBottom = UDim.new(0, 6), PaddingLeft = UDim.new(0, 10),
		PaddingRight = UDim.new(0, 10) }, t)
	local kids = {}
	for _, c in toastHolder:GetChildren() do
		if c:IsA("TextLabel") then
			table.insert(kids, c)
		end
	end
	table.sort(kids, function(a, b)
		return a.LayoutOrder < b.LayoutOrder
	end)
	for i = 1, #kids - 3 do
		kids[i]:Destroy()
	end
	task.delay(4.5, function()
		if t.Parent then
			TweenService:Create(t, TweenInfo.new(0.4), { TextTransparency = 1, BackgroundTransparency = 1, TextStrokeTransparency = 1 })
				:Play()
			Debris:AddItem(t, 0.45)
		end
	end)
end

local SOUND_COLOR = { Cash = Color3.fromRGB(120, 255, 140), Promotion = Color3.fromRGB(255, 220, 90),
	Error = Color3.fromRGB(255, 120, 110), Wanted = Color3.fromRGB(255, 190, 60), Cuffs = Color3.fromRGB(150, 190, 255),
	Radio = Color3.fromRGB(170, 210, 255) }
R.Notify.OnClientEvent:Connect(function(text, sound)
	toast(text, SOUND_COLOR[sound or ""])
	if sound then
		playSound(sound, if sound == "Radio" then 0.5 else 0.7)
	end
end)

local jailLbl = label(gui, { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.3), Size = UDim2.fromOffset(360, 70),
	TextSize = 30, Font = Enum.Font.GothamBlack, BackgroundColor3 = Color3.fromRGB(30, 10, 10), BackgroundTransparency = 0.25,
	Visible = false })
corner(jailLbl)
local tasedLbl = label(gui, { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.42), Size = UDim2.fromOffset(300, 60),
	TextSize = 44, Font = Enum.Font.GothamBlack, Text = "TASED!", TextColor3 = Color3.fromRGB(140, 220, 255), Visible = false })
local flash = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(180, 230, 255), BackgroundTransparency = 1,
	ZIndex = 50 }, gui)

---------------------------------------------------------------- team select
local teamScreen = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(6, 8, 14),
	BackgroundTransparency = 0.15, ZIndex = 20, Visible = false }, gui)
label(teamScreen, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0.06, 0), Size = UDim2.new(0.9, 0, 0, 56),
	Text = "PRECINCT 9", Font = Enum.Font.GothamBlack, TextScaled = true, ZIndex = 21 })
label(teamScreen, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0.06, 58), Size = UDim2.new(0.9, 0, 0, 22),
	Text = "Choose your side", TextColor3 = Color3.fromRGB(180, 190, 210), TextScaled = true, ZIndex = 21 })
local cards = new("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.58),
	Size = UDim2.new(0.92, 0, 0.6, 0), BackgroundTransparency = 1, ZIndex = 21 }, teamScreen)
new("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0.03, 0),
	HorizontalAlignment = Enum.HorizontalAlignment.Center, VerticalAlignment = Enum.VerticalAlignment.Center }, cards)
new("UISizeConstraint", { MaxSize = Vector2.new(760, 380) }, cards)
local function teamCard(team: string, title: string, body: string, color: Color3)
	local b = new("TextButton", { Size = UDim2.fromScale(0.47, 1), BackgroundColor3 = color, BackgroundTransparency = 0.15,
		Text = "", AutoButtonColor = true, ZIndex = 22 }, cards)
	corner(b, 16)
	stroke(b, WHITE, 2)
	label(b, { Position = UDim2.fromScale(0.05, 0.06), Size = UDim2.fromScale(0.9, 0.2), Text = title, TextScaled = true,
		Font = Enum.Font.GothamBlack, ZIndex = 23 })
	label(b, { Position = UDim2.fromScale(0.07, 0.3), Size = UDim2.fromScale(0.86, 0.5), Text = body, TextWrapped = true,
		TextScaled = true, Font = Enum.Font.Gotham, TextYAlignment = Enum.TextYAlignment.Top, ZIndex = 23 })
	label(b, { Position = UDim2.fromScale(0.05, 0.82), Size = UDim2.fromScale(0.9, 0.12), Text = "TAP TO JOIN",
		TextScaled = true, Font = Enum.Font.GothamBlack, TextColor3 = Color3.fromRGB(255, 240, 200), ZIndex = 23 })
	b.Activated:Connect(function()
		R.PickTeam:FireServer(team)
		teamScreen.Visible = false
		playSound("Radio", 0.5)
	end)
end
teamCard("Police", "POLICE",
	"Patrol the town. Answer 911 calls, chase stolen cars, taser and cuff suspects, and book them at the station. Earn pay and climb from Cadet to Chief.",
	Color3.fromRGB(30, 60, 160))
teamCard("Civilian", "CIVILIAN",
	"Live your life in Northfield: deliver pizzas, drive a taxi, buy cars. Or rob the bank, steal cars and outrun the cops. Get caught and you're doing time.",
	Color3.fromRGB(30, 120, 70))
local closeTeams = button(teamScreen, "✕", Color3.fromRGB(60, 60, 70), UDim2.fromOffset(48, 48))
closeTeams.AnchorPoint = Vector2.new(1, 0)
closeTeams.Position = UDim2.new(1, -12, 0, 12)
closeTeams.ZIndex = 25
closeTeams.Activated:Connect(function()
	teamScreen.Visible = false
end)
local function refreshTeamScreen()
	if myTeam() == "" then
		teamScreen.Visible = true
		closeTeams.Visible = false
	else
		closeTeams.Visible = true
	end
end
player:GetAttributeChangedSignal("Team"):Connect(function()
	refreshTeamScreen()
	local team = myTeam()
	if team == "Police" then
		toast("Shift started. Get a car from the lot (CAR), follow 911 calls on your map, taser suspects and hold ARREST.",
			Color3.fromRGB(170, 210, 255))
	elseif team == "Civilian" then
		toast("Welcome to Northfield! Start a job (MENU), buy a car at Northfield Motors, or... rob a store. Your call.",
			Color3.fromRGB(190, 255, 210))
	end
end)
refreshTeamScreen()

---------------------------------------------------------------- minimap
local MAP = 160
local WORLD = 1400
local mapFrame = new("Frame", { AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -10, 0, 10), Size = UDim2.fromOffset(MAP, MAP),
	BackgroundColor3 = Color3.fromRGB(28, 40, 30), BackgroundTransparency = 0.15, ClipsDescendants = true }, gui)
corner(mapFrame, 12)
stroke(mapFrame, Color3.fromRGB(200, 210, 230), 2)
local function mapXY(x: number, z: number): (number, number)
	return (x + WORLD / 2) / WORLD * MAP, (z + WORLD / 2) / WORLD * MAP
end
local function mapLine(x0: number, z0: number, x1: number, z1: number, w: number, color: Color3)
	local ax, ay = mapXY(math.min(x0, x1), math.min(z0, z1))
	local bx, by = mapXY(math.max(x0, x1), math.max(z0, z1))
	new("Frame", { Position = UDim2.fromOffset(ax - w / 2, ay - w / 2), Size = UDim2.fromOffset(bx - ax + w, by - ay + w),
		BackgroundColor3 = color, BorderSizePixel = 0 }, mapFrame)
end
for _, g in Data.GRID do
	mapLine(g, -360, g, 360, 3, Color3.fromRGB(70, 74, 84))
	mapLine(-360, g, 360, g, 3, Color3.fromRGB(70, 74, 84))
end
local H = Data.HWY
mapLine(-H, -H, H, -H, 4, Color3.fromRGB(90, 92, 100))
mapLine(-H, H, H, H, 4, Color3.fromRGB(90, 92, 100))
mapLine(-H, -H, -H, H, 4, Color3.fromRGB(90, 92, 100))
mapLine(H, -H, H, H, 4, Color3.fromRGB(90, 92, 100))
mapLine(0, -H, 0, -360, 3, Color3.fromRGB(80, 82, 92))
mapLine(0, 360, 0, H, 3, Color3.fromRGB(80, 82, 92))
mapLine(-H, 0, -360, 0, 3, Color3.fromRGB(80, 82, 92))
mapLine(360, 0, H, 0, 3, Color3.fromRGB(80, 82, 92))
do
	local sx, sy = mapXY(Data.STATION.X, Data.STATION.Z)
	local st = label(mapFrame, { Position = UDim2.fromOffset(sx - 9, sy - 7), Size = UDim2.fromOffset(18, 14), Text = "P9",
		TextSize = 10, Font = Enum.Font.GothamBlack, BackgroundColor3 = BLUE, BackgroundTransparency = 0 })
	corner(st, 3)
end
local dots: { Frame } = {}
local function dot(i: number, x: number, z: number, color: Color3, size: number)
	local d = dots[i]
	if not d then
		d = new("Frame", { BorderSizePixel = 0, ZIndex = 3 }, mapFrame)
		corner(d, 10)
		dots[i] = d
	end
	local mx, my = mapXY(x, z)
	d.Visible = true
	d.Position = UDim2.fromOffset(mx - size / 2, my - size / 2)
	d.Size = UDim2.fromOffset(size, size)
	d.BackgroundColor3 = color
end
local meArrow = label(mapFrame, { Size = UDim2.fromOffset(16, 16), Text = "▲", TextSize = 16, TextColor3 = WHITE,
	TextStrokeTransparency = 0, ZIndex = 5, Font = Enum.Font.GothamBlack })

---------------------------------------------------------------- dispatch panel + GPS
local calls: { any } = {}
local gpsCall: number? = nil
local callsPanel = new("Frame", { AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -10, 0, MAP + 18),
	Size = UDim2.fromOffset(MAP + 40, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, Visible = false }, gui)
new("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, callsPanel)
local callsTitle = label(callsPanel, { Size = UDim2.new(1, 0, 0, 18), Text = "911 CALLS", TextSize = 13, Font = Enum.Font.GothamBlack,
	TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = Color3.fromRGB(255, 120, 110), LayoutOrder = 0 })
local callButtons: { TextButton } = {}

local gpsPart = new("Part", { Name = "GPS", Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false,
	Material = Enum.Material.Neon, Color = Color3.fromRGB(255, 60, 60), Transparency = 0.55, Size = Vector3.new(3, 300, 3),
	CastShadow = false })
local gpsGui = new("BillboardGui", { Size = UDim2.fromOffset(150, 40), AlwaysOnTop = true, StudsOffsetWorldSpace = Vector3.new(0, -140, 0),
	MaxDistance = 5000 }, gpsPart)
local gpsLbl = label(gpsGui, { Size = UDim2.fromScale(1, 1), TextScaled = true, Font = Enum.Font.GothamBlack, TextStrokeTransparency = 0.2 })
local gpsTarget: Vector3? = nil
local function setGps(pos: Vector3?, text: string?, color: Color3?)
	gpsTarget = pos
	if not pos then
		gpsPart.Parent = nil
		return
	end
	gpsPart.Color = color or Color3.fromRGB(255, 60, 60)
	gpsPart.Position = Vector3.new(pos.X, 150, pos.Z)
	gpsPart.Parent = workspace
	local _, _, hrp = myChar()
	local d = if hrp then (hrp.Position - pos).Magnitude else 0
	gpsLbl.Text = (text or "") .. ("\n%d m"):format(math.floor(d * 0.28))
	gpsLbl.TextColor3 = color or Color3.fromRGB(255, 120, 110)
end

local function refreshCalls()
	local ok, list = pcall(function()
		return HttpService:JSONDecode(workspace:GetAttribute("Calls") or "[]")
	end)
	calls = if ok and type(list) == "table" then list else {}
	local _, _, hrp = myChar()
	local here = if hrp then hrp.Position else Vector3.zero
	for _, c in calls do
		c.d = (Vector3.new(c.x, 0, c.z) - Vector3.new(here.X, 0, here.Z)).Magnitude
	end
	table.sort(calls, function(a, b)
		return a.d < b.d
	end)
	local cop = myTeam() == "Police"
	callsPanel.Visible = cop
	callsTitle.Text = if #calls > 0 then ("911 CALLS (%d)"):format(#calls) else "NO CALLS"
	for i = 1, 4 do
		local c = calls[i]
		local b = callButtons[i]
		if not b then
			b = new("TextButton", { Size = UDim2.new(1, 0, 0, 30), BackgroundColor3 = DARK, BackgroundTransparency = 0.2,
				Font = Enum.Font.GothamBold, TextSize = 13, TextColor3 = WHITE, TextXAlignment = Enum.TextXAlignment.Left,
				LayoutOrder = i, AutoButtonColor = true }, callsPanel)
			corner(b, 8)
			new("UIPadding", { PaddingLeft = UDim.new(0, 8) }, b)
			b.Activated:Connect(function()
				local cc = calls[i]
				if cc then
					gpsCall = if gpsCall == cc.id then nil else cc.id
					playSound("Radio", 0.35)
				end
			end)
			callButtons[i] = b
		end
		b.Visible = c ~= nil
		if c then
			local sel = c.id == gpsCall
			b.Text = ("%s%s  %s  %dm"):format(if sel then "➤ " else "", c.kind, string.rep("★", c.stars or 1),
				math.floor(c.d * 0.28))
			b.BackgroundColor3 = if sel then Color3.fromRGB(120, 30, 30) else DARK
		end
	end
end
workspace:GetAttributeChangedSignal("Calls"):Connect(refreshCalls)

---------------------------------------------------------------- action buttons
local actions = new("Frame", { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -12, 1, -190), Size = UDim2.fromOffset(96, 400),
	BackgroundTransparency = 1 }, gui)
new("UIListLayout", { Padding = UDim.new(0, 8), VerticalAlignment = Enum.VerticalAlignment.Bottom,
	HorizontalAlignment = Enum.HorizontalAlignment.Right, SortOrder = Enum.SortOrder.LayoutOrder }, actions)
local function actionButton(text: string, color: Color3, order: number): TextButton
	local b = button(actions, text, color, UDim2.fromOffset(96, 54))
	b.LayoutOrder = order
	b.Visible = false
	return b
end
local taserBtn = actionButton("TASER", Color3.fromRGB(230, 190, 30), 5)
local taserFill = new("Frame", { Size = UDim2.fromScale(0, 1), BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.5,
	ZIndex = 2 }, taserBtn)
corner(taserFill, 12)
local carBtn = actionButton("CAR", Color3.fromRGB(40, 70, 170), 3)
local myCarBtn = actionButton("MY CAR", Color3.fromRGB(40, 140, 90), 3)
local gunBtn = actionButton("GUN", Color3.fromRGB(70, 70, 78), 4)
local fireBtn = actionButton("FIRE", Color3.fromRGB(200, 50, 40), 0)
local ammoLbl = label(fireBtn, { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, 2, 1, 6), Size = UDim2.fromOffset(60, 14),
	TextSize = 11, TextXAlignment = Enum.TextXAlignment.Right, Text = "", ZIndex = 3 })
local lightsBtn = actionButton("LIGHTS", Color3.fromRGB(200, 40, 40), 1)
local sirenBtn = actionButton("SIREN", Color3.fromRGB(40, 80, 220), 2)
local hornBtn = actionButton("HORN", Color3.fromRGB(70, 70, 80), 6)
local teamBtn = button(gui, "TEAM", Color3.fromRGB(60, 60, 72), UDim2.fromOffset(70, 34))
teamBtn.Position = UDim2.fromOffset(10, 92)
teamBtn.Activated:Connect(function()
	teamScreen.Visible = true
	closeTeams.Visible = myTeam() ~= ""
end)

-- speedometer + car health
local speedo = new("Frame", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -16), Size = UDim2.fromOffset(170, 66),
	BackgroundColor3 = DARK, BackgroundTransparency = 0.2, Visible = false }, gui)
corner(speedo, 12)
local speedLbl = label(speedo, { Size = UDim2.new(1, 0, 0, 40), Position = UDim2.fromOffset(0, 4), TextSize = 34,
	Font = Enum.Font.GothamBlack, Text = "0" })
label(speedo, { Size = UDim2.new(1, -12, 0, 14), Position = UDim2.fromOffset(0, 40), TextSize = 11, Text = "MPH",
	TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = Color3.fromRGB(170, 180, 200) })
local hpBack = new("Frame", { Position = UDim2.new(0, 12, 1, -14), Size = UDim2.new(1, -24, 0, 6),
	BackgroundColor3 = Color3.fromRGB(50, 20, 20) }, speedo)
corner(hpBack, 3)
local hpFill = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(90, 230, 110) }, hpBack)
corner(hpFill, 3)

local lastTaser = -100
local function fireTaser()
	local _, hum, hrp = myChar()
	if myTeam() ~= "Police" or not hrp or not hum or hum.SeatPart then
		return
	end
	local t = os.clock()
	if t - lastTaser < Data.TASER.cooldown then
		return
	end
	lastTaser = t
	local look = camera.CFrame.LookVector
	local aim = Vector3.new(look.X, 0, look.Z)
	if aim.Magnitude < 0.2 then
		aim = hrp.CFrame.LookVector
	end
	R.Taser:FireServer(aim.Unit)
end
taserBtn.Activated:Connect(fireTaser)
-- police car menu: cruiser, SUV (Corporal), SWAT van (SWAT, Sergeant)
local carMenu = new("Frame", { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -116, 1, -250), Size = UDim2.fromOffset(170, 0),
	AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = DARK, BackgroundTransparency = 0.15, Visible = false }, gui)
corner(carMenu, 12)
new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, carMenu)
new("UIPadding", { PaddingTop = UDim.new(0, 8), PaddingBottom = UDim.new(0, 8), PaddingLeft = UDim.new(0, 8),
	PaddingRight = UDim.new(0, 8) }, carMenu)
local carChoices: { [string]: TextButton } = {}
for i, kind in Data.POLICE_CARS do
	local b = button(carMenu, Data.CARS[kind].name, Color3.fromRGB(40, 70, 170), UDim2.new(1, 0, 0, 40))
	b.LayoutOrder = i
	b.Activated:Connect(function()
		R.SpawnCar:FireServer(kind)
		carMenu.Visible = false
	end)
	carChoices[kind] = b
end
local function refreshCarMenu()
	local rankIdx = player:GetAttribute("RankIndex") or 1
	local dept = player:GetAttribute("Dept") or "Patrol"
	for kind, b in carChoices do
		local spec = Data.CARS[kind]
		local ok = rankIdx >= (spec.rank or 1) and (spec.dept == nil or spec.dept == dept)
		b.Text = spec.name .. (if ok then "" else " 🔒")
		b.BackgroundTransparency = if ok then 0.1 else 0.55
	end
end
carBtn.Activated:Connect(function()
	refreshCarMenu()
	carMenu.Visible = not carMenu.Visible
end)
lightsBtn.Activated:Connect(function()
	R.CarToggle:FireServer("Lights")
end)
sirenBtn.Activated:Connect(function()
	R.CarToggle:FireServer("Siren")
end)
hornBtn.Activated:Connect(function()
	R.CarToggle:FireServer("Horn")
end)
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	local k = input.KeyCode
	if k == Enum.KeyCode.Q then
		fireTaser()
	elseif k == Enum.KeyCode.L then
		R.CarToggle:FireServer("Lights")
	elseif k == Enum.KeyCode.R then
		R.CarToggle:FireServer("Siren")
	elseif k == Enum.KeyCode.H then
		R.CarToggle:FireServer("Horn")
	end
end)

---------------------------------------------------------------- driving (this device runs the physics of the car you drive)
local myCar: Model? = nil
local carState = nil
local function driveSeat(): VehicleSeat?
	local _, hum = myChar()
	local seat = hum and hum.SeatPart
	if seat and seat:IsA("VehicleSeat") and seat.Name == "DriveSeat" then
		return seat
	end
	return nil
end
local function seatedCar(): Model?
	local _, hum = myChar()
	local seat = hum and hum.SeatPart
	local m = seat and seat.Parent
	return if m and m:IsA("Model") and m.Parent == carsFolder then m else nil
end

local function driveStep(dt: number)
	local seat = driveSeat()
	local model = seat and seat.Parent :: Model?
	if model ~= myCar then
		myCar = model
		if model then
			local chassis = model:FindFirstChild("Chassis") :: BasePart
			carState = CarPhysics.newState(CarPhysics.yawOf(chassis.CFrame))
			playSound("Door", 0.6)
		else
			carState = nil
		end
	end
	if not model or not seat or not carState then
		return
	end
	local chassis = model:FindFirstChild("Chassis") :: BasePart?
	local drive = chassis and chassis:FindFirstChild("Drive") :: LinearVelocity?
	local upright = chassis and chassis:FindFirstChild("Upright") :: AlignOrientation?
	local spec = Data.CARS[model:GetAttribute("Kind") or ""]
	if not chassis or not drive or not upright or not spec then
		return
	end
	local throttle, steer = seat.ThrottleFloat, seat.SteerFloat
	if model:GetAttribute("Disabled") then
		throttle = if carState.speed > 1 then -1 elseif carState.speed < -1 then 1 else 0
		steer = 0
	end
	local vel = CarPhysics.step(carState, spec, throttle, steer, dt, chassis.AssemblyLinearVelocity)
	drive.VectorVelocity = vel
	upright.CFrame = CFrame.Angles(0, carState.yaw, 0)
end

---------------------------------------------------------------- every car: wheels, light bars, sirens, engines, headlights, prompts
type CarFx = {
	model: Model,
	chassis: BasePart,
	wheels: { { motor: Motor6D, front: boolean, r: number } },
	spin: number,
	red: { BasePart },
	blue: { BasePart },
	barLight: PointLight?,
	siren: Sound?,
	sirenMode: string,
	engine: Sound?,
	beams: { SpotLight },
	drivePrompt: ProximityPrompt,
	ridePrompt: ProximityPrompt,
	stopPrompt: ProximityPrompt?,
	maxSpeed: number,
}
local carFx: { [Model]: CarFx } = {}
local stopModel: Model? = nil -- the car of the traffic stop panel

local function night(): boolean
	return workspace:GetAttribute("Night") == true
end

local function setupCar(model: Instance)
	if not model:IsA("Model") or carFx[model] then
		return
	end
	local chassis = model:WaitForChild("Chassis", 10) :: BasePart?
	if not chassis or not model.Parent then
		return
	end
	local spec = Data.CARS[model:GetAttribute("Kind") or ""] or Data.CARS.Sedan
	local fx: CarFx = {
		model = model,
		chassis = chassis,
		wheels = {},
		spin = 0,
		red = {},
		blue = {},
		barLight = nil,
		siren = nil,
		sirenMode = "",
		engine = nil,
		beams = {},
		drivePrompt = nil :: any,
		ridePrompt = nil :: any,
		maxSpeed = spec.maxSpeed,
	}
	for _, p in model:GetChildren() do
		if p:IsA("BasePart") then
			if p.Name:sub(1, 5) == "Wheel" then
				local m = p:FindFirstChild("Axle")
				if m and m:IsA("Motor6D") then
					table.insert(fx.wheels, { motor = m, front = p.Name:sub(6, 6) == "F", r = p.Size.Y / 2 })
				end
			elseif p.Name == "LightRed" then
				table.insert(fx.red, p)
			elseif p.Name == "LightBlue" then
				table.insert(fx.blue, p)
			elseif p.Name == "LightBarBase" then
				fx.barLight = new("PointLight", { Range = 26, Brightness = 0, Color = Color3.fromRGB(255, 40, 40), Shadows = false }, p)
			elseif p.Name == "Headlight" then
				local b = p:FindFirstChildOfClass("SpotLight")
				if b then
					b.Enabled = night()
					table.insert(fx.beams, b)
				end
			end
		end
	end
	local half = chassis.Size.X / 2
	local dAtt = new("Attachment", { Name = "DriverDoor", Position = Vector3.new(-half - 0.5, 1, -1) }, chassis)
	local pAtt = new("Attachment", { Name = "PassengerDoor", Position = Vector3.new(half + 0.5, 1, 0.5) }, chassis)
	fx.drivePrompt = new("ProximityPrompt", { ActionText = "Drive", ObjectText = spec.name, KeyboardKeyCode = Enum.KeyCode.E,
		MaxActivationDistance = 10, RequiresLineOfSight = false, HoldDuration = 0, Enabled = false }, dAtt)
	fx.ridePrompt = new("ProximityPrompt", { ActionText = "Ride", ObjectText = spec.name, KeyboardKeyCode = Enum.KeyCode.F,
		MaxActivationDistance = 9, RequiresLineOfSight = false, HoldDuration = 0, Enabled = false }, pAtt)
	fx.stopPrompt = new("ProximityPrompt", { ActionText = "Check driver", ObjectText = spec.name, KeyboardKeyCode = Enum.KeyCode.G,
		MaxActivationDistance = 11, RequiresLineOfSight = false, HoldDuration = 0, Enabled = false, UIOffset = Vector2.new(0, 70) },
		dAtt)
	fx.stopPrompt.Triggered:Connect(function()
		if model:GetAttribute("Stopped") then
			stopModel = model
			R.Action:FireServer("stop", model, "check")
		else
			R.Action:FireServer("stop", model, "ticket")
		end
	end)
	fx.drivePrompt.Triggered:Connect(function()
		R.CarAction:FireServer(model, "drive")
	end)
	fx.ridePrompt.Triggered:Connect(function()
		R.CarAction:FireServer(model, "ride")
	end)
	carFx[model] = fx
end

local function dropCar(model: Instance)
	local fx = carFx[model :: Model]
	if fx then
		if fx.siren then
			fx.siren:Destroy()
		end
		if fx.engine then
			fx.engine:Destroy()
		end
		carFx[model :: Model] = nil
	end
end
CollectionService:GetInstanceAddedSignal("Car"):Connect(function(m)
	task.spawn(setupCar, m)
end)
CollectionService:GetInstanceRemovedSignal("Car"):Connect(dropCar)
for _, m in CollectionService:GetTagged("Car") do
	task.spawn(setupCar, m)
end
carsFolder.ChildRemoved:Connect(dropCar)

workspace:GetAttributeChangedSignal("Night"):Connect(function()
	local on = night()
	for _, fx in carFx do
		for _, b in fx.beams do
			b.Enabled = on
		end
	end
end)

local clock = 0
local function carsStep(dt: number)
	clock += dt
	local camPos = camera.CFrame.Position
	local flashPhase = math.floor(clock * 10) % 6 -- R R . B B .
	for model, fx in carFx do
		local chassis = fx.chassis
		if not model.Parent then
			dropCar(model)
			continue
		end
		local dist = (chassis.Position - camPos).Magnitude
		-- wheels
		if dist < 260 and #fx.wheels > 0 then
			local vel = chassis.AssemblyLinearVelocity
			local fwd = vel:Dot(chassis.CFrame.LookVector)
			local steer
			if model == myCar and carState then
				steer = carState.steer
			else
				steer = math.clamp(chassis.AssemblyAngularVelocity.Y * -0.6, -1, 1)
				if math.abs(fwd) < 1 then
					steer = 0
				end
			end
			fx.spin = (fx.spin + fwd * dt) % 10000
			for _, w in fx.wheels do
				local roll = CFrame.Angles(-fx.spin / w.r, 0, 0)
				w.motor.Transform = if w.front then CFrame.Angles(0, -steer * 0.45, 0) * roll else roll
			end
		end
		-- light bar
		if #fx.red > 0 then
			local on = model:GetAttribute("Lights") == true and dist < 600
			local redOn = on and (flashPhase == 0 or flashPhase == 1)
			local blueOn = on and (flashPhase == 3 or flashPhase == 4)
			for i, p in fx.red do
				p.Transparency = if redOn and (flashPhase == 0) == (i % 2 == 1) then 0 elseif redOn then 0.15 else 0.6
			end
			for i, p in fx.blue do
				p.Transparency = if blueOn and (flashPhase == 3) == (i % 2 == 1) then 0 elseif blueOn then 0.15 else 0.6
			end
			if fx.barLight then
				fx.barLight.Brightness = if redOn or blueOn then 6 else 0
				fx.barLight.Color = if blueOn then Color3.fromRGB(50, 100, 255) else Color3.fromRGB(255, 40, 40)
			end
			-- siren
			local mode = model:GetAttribute("Siren") or ""
			if dist > 650 then
				mode = ""
			end
			if mode ~= fx.sirenMode then
				fx.sirenMode = mode
				if fx.siren then
					fx.siren:Destroy()
					fx.siren = nil
				end
				if mode ~= "" then
					fx.siren = loopSound(mode, 0.75, chassis)
				end
			end
		end
		-- engine hum for moving or occupied cars nearby
		local active = (model:GetAttribute("Driver") or 0) ~= 0 or model:GetAttribute("AI") == true
		if active and dist < 160 and not model:GetAttribute("Disabled") then
			if not fx.engine then
				fx.engine = loopSound("Engine", if model == myCar then 0.35 else 0.3, chassis)
			end
			if fx.engine then
				local s = chassis.AssemblyLinearVelocity.Magnitude / fx.maxSpeed
				fx.engine.PlaybackSpeed = 0.7 + s * 1.3
			end
		elseif fx.engine then
			fx.engine:Destroy()
			fx.engine = nil
		end
	end
end

-- prompts: who may drive, steal or ride what (refreshed a few times a second)
local function refreshPrompts()
	local team = myTeam()
	local inCar = seatedCar()
	for model, fx in carFx do
		local police = model:GetAttribute("Police") == true
		local free = (model:GetAttribute("Driver") or 0) == 0 and not model:GetAttribute("AI")
		local wrecked = model:GetAttribute("Disabled") == true
		local mine = (model:GetAttribute("Owner") or 0) == player.UserId
		local canDrive = team ~= "" and free and not wrecked and inCar == nil and (not police or team == "Police")
		fx.drivePrompt.Enabled = canDrive
		fx.drivePrompt.ActionText = if team == "Civilian" and not police and not mine then "Steal" else "Drive"
		fx.ridePrompt.Enabled = team ~= "" and inCar == nil and (not police or team == "Police") and not wrecked
			and not model:GetAttribute("AI")
		if fx.stopPrompt then
			local stopped = model:GetAttribute("Stopped") == true and model:GetAttribute("StopCop") == player.UserId
			local driverId = model:GetAttribute("Driver") or 0
			local civDriver = false
			if driverId ~= 0 and driverId ~= player.UserId and not police then
				local dp = Players:GetPlayerByUserId(driverId)
				civDriver = dp ~= nil and dp:GetAttribute("Team") == "Civilian"
					and fx.chassis.AssemblyLinearVelocity.Magnitude < 6
			end
			fx.stopPrompt.Enabled = team == "Police" and inCar == nil and (stopped or civDriver)
			fx.stopPrompt.ActionText = if stopped then "Check driver" else "Ticket driver"
			fx.stopPrompt.HoldDuration = if stopped then 0 else 0.6
		end
		if mine and not police then
			fx.drivePrompt.ActionText = "Drive"
		end
	end
end

---------------------------------------------------------------- suspects and wanted players: tags and arrest prompts
type Tagged = { gui: BillboardGui, text: TextLabel, prompt: ProximityPrompt }
local suspectTags: { [Model]: Tagged } = {}
local STATE_TEXT = {
	loiter = { "SUSPECT", Color3.fromRGB(255, 170, 60) },
	flee = { "FLEEING!", Color3.fromRGB(255, 70, 60) },
	stunned = { "TASED · ARREST", Color3.fromRGB(140, 220, 255) },
	cuffed = { "IN CUSTODY", Color3.fromRGB(120, 160, 255) },
	transport = { "IN CUSTODY", Color3.fromRGB(120, 160, 255) },
	robbing = { "ARMED ROBBERY!", Color3.fromRGB(255, 50, 50) },
}
local function setupSuspect(model: Instance)
	if not model:IsA("Model") or suspectTags[model] then
		return
	end
	local head = model:WaitForChild("Head", 5)
	local hrp = model:WaitForChild("HumanoidRootPart", 5)
	if not head or not hrp then
		return
	end
	local g = new("BillboardGui", { Size = UDim2.fromOffset(150, 30), StudsOffset = Vector3.new(0, 2.4, 0), MaxDistance = 220,
		AlwaysOnTop = true }, head)
	local t = label(g, { Size = UDim2.fromScale(1, 1), TextScaled = true, Font = Enum.Font.GothamBlack, TextStrokeTransparency = 0.2 })
	local p = new("ProximityPrompt", { ActionText = "Arrest", ObjectText = "Suspect", KeyboardKeyCode = Enum.KeyCode.E,
		HoldDuration = Data.ARREST.hold, MaxActivationDistance = Data.ARREST.range, RequiresLineOfSight = false, Enabled = false }, hrp)
	p.Triggered:Connect(function()
		R.Arrest:FireServer(model)
	end)
	suspectTags[model] = { gui = g, text = t, prompt = p }
end
CollectionService:GetInstanceAddedSignal("Suspect"):Connect(function(m)
	task.spawn(setupSuspect, m)
end)
CollectionService:GetInstanceRemovedSignal("Suspect"):Connect(function(m)
	suspectTags[m] = nil
end)
for _, m in CollectionService:GetTagged("Suspect") do
	task.spawn(setupSuspect, m)
end

local playerPrompts: { [Player]: ProximityPrompt } = {}
local function refreshSuspects()
	local cop = myTeam() == "Police"
	for model, tag in suspectTags do
		if not model.Parent then
			suspectTags[model] = nil
			continue
		end
		local state = model:GetAttribute("State") or "loiter"
		local info = STATE_TEXT[state] or STATE_TEXT.loiter
		local stars = model:GetAttribute("Stars") or 1
		local h = model:FindFirstChildOfClass("Humanoid")
		local down = h and h:GetAttribute("Down") == true
		tag.text.Text = if down and state == "stunned" then "DOWN · ARREST"
			elseif model:GetAttribute("Armed") and state == "flee" then "ARMED · FLEEING  " .. string.rep("★", stars)
			else info[1] .. (if state == "flee" or state == "loiter" then "  " .. string.rep("★", stars) else "")
		tag.text.TextColor3 = info[2]
		tag.gui.Enabled = cop or state ~= "loiter"
		tag.prompt.Enabled = cop and state == "stunned"
	end
	local now = workspace:GetServerTimeNow()
	for _, other in Players:GetPlayers() do
		if other ~= player then
			local char = other.Character
			local hrp = char and char:FindFirstChild("HumanoidRootPart")
			local prompt = playerPrompts[other]
			if hrp and (not prompt or prompt.Parent ~= hrp) then
				if prompt then
					prompt:Destroy()
				end
				prompt = new("ProximityPrompt", { ActionText = "Arrest", ObjectText = other.DisplayName,
					KeyboardKeyCode = Enum.KeyCode.E, HoldDuration = Data.ARREST.hold, MaxActivationDistance = Data.ARREST.range,
					RequiresLineOfSight = false, Enabled = false }, hrp)
				prompt.Triggered:Connect(function()
					if other.Character then
						R.Arrest:FireServer(other.Character)
					end
				end)
				playerPrompts[other] = prompt
			end
			if prompt then
				prompt.Enabled = cop and other:GetAttribute("Team") == "Civilian" and (other:GetAttribute("Wanted") or 0) > 0
					and (other:GetAttribute("StunnedUntil") or 0) > now
			end
		end
	end
end
Players.PlayerRemoving:Connect(function(p)
	playerPrompts[p] = nil
end)

---------------------------------------------------------------- effects
local function burst(pos: Vector3, color: Color3, count: number?)
	local att = Instance.new("Attachment")
	att.WorldPosition = pos
	att.Parent = workspace.Terrain
	local pe = new("ParticleEmitter", { Color = ColorSequence.new(color), LightEmission = 1, Lifetime = NumberRange.new(0.3, 0.7),
		Speed = NumberRange.new(8, 22), SpreadAngle = Vector2.new(180, 180), Rate = 0, Drag = 4,
		Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 0) }),
		Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(1, 1) }) }, att)
	pe:Emit(count or 30)
	Debris:AddItem(att, 1.5)
end

local function floatText(pos: Vector3, text: string, color: Color3)
	local att = Instance.new("Attachment")
	att.WorldPosition = pos + Vector3.new(0, 3, 0)
	att.Parent = workspace.Terrain
	local g = new("BillboardGui", { Size = UDim2.fromOffset(220, 46), AlwaysOnTop = true, MaxDistance = 250 }, att)
	local l = label(g, { Size = UDim2.fromScale(1, 1), Text = text, TextScaled = true, Font = Enum.Font.GothamBlack, TextColor3 = color,
		TextStrokeTransparency = 0 })
	TweenService:Create(g, TweenInfo.new(1.6), { StudsOffset = Vector3.new(0, 5, 0) }):Play()
	TweenService:Create(l, TweenInfo.new(1.6, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
		{ TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
	Debris:AddItem(att, 1.7)
end

local function wire(a: Vector3, b: Vector3, folder: Instance)
	local n = 7
	local prev = a
	for i = 1, n do
		local f = i / n
		local p = a:Lerp(b, f)
		if i < n then
			p += Vector3.new(math.random() - 0.5, math.random() - 0.5, math.random() - 0.5) * 0.9
		end
		local len = (p - prev).Magnitude
		if len > 0.01 then
			new("Part", { Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, CastShadow = false,
				Material = Enum.Material.Neon, Color = Color3.fromRGB(170, 230, 255), Size = Vector3.new(0.08, 0.08, len),
				CFrame = CFrame.lookAt((p + prev) / 2, p) }, folder)
		end
		prev = p
	end
end

local function taserFx(from: Vector3, to: Vector3, hit: boolean)
	playSound("Taser", 0.8, from)
	local folder = Instance.new("Folder")
	folder.Name = "TaserWires"
	folder.Parent = workspace
	local start = from + Vector3.new(0, 0.4, 0)
	task.spawn(function()
		for _ = 1, 6 do
			folder:ClearAllChildren()
			wire(start, to + Vector3.new(0.3, 0.6, 0), folder)
			wire(start, to + Vector3.new(-0.3, -0.2, 0), folder)
			task.wait(0.09)
		end
		folder:Destroy()
	end)
	if hit then
		burst(to, Color3.fromRGB(150, 220, 255), 40)
		floatText(to, "TASED!", Color3.fromRGB(150, 220, 255))
	end
end

local hitMarker = label(gui, { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(40, 40),
	Text = "✕", TextSize = 34, TextColor3 = Color3.fromRGB(255, 255, 255), TextStrokeTransparency = 0, Visible = false, ZIndex = 40 })

local function shotFx(from: Vector3, to: Vector3, hit: boolean, shooterId: number?)
	playSound("Gunshot", 0.8, from)
	local len = (to - from).Magnitude
	if len > 0.5 then
		local tracer = new("Part", { Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, CastShadow = false,
			Material = Enum.Material.Neon, Color = Color3.fromRGB(255, 230, 150), Size = Vector3.new(0.08, 0.08, len),
			CFrame = CFrame.lookAt((from + to) / 2, to), Transparency = 0.2 }, workspace)
		TweenService:Create(tracer, TweenInfo.new(0.12), { Transparency = 1 }):Play()
		Debris:AddItem(tracer, 0.15)
	end
	local flashAtt = Instance.new("Attachment")
	flashAtt.WorldPosition = from
	flashAtt.Parent = workspace.Terrain
	new("PointLight", { Brightness = 6, Range = 12, Color = Color3.fromRGB(255, 200, 120) }, flashAtt)
	Debris:AddItem(flashAtt, 0.06)
	burst(to, if hit then Color3.fromRGB(255, 240, 200) else Color3.fromRGB(255, 200, 120), if hit then 14 else 8)
	if not hit then
		playSound("Impact", 0.5, to)
	end
	if hit and shooterId == player.UserId then
		hitMarker.Visible = true
		task.delay(0.15, function()
			hitMarker.Visible = false
		end)
	end
end

local function alarmFx(at: Vector3)
	playSound("Alarm", 0.9, at)
	task.delay(2.6, function()
		playSound("Alarm", 0.9, at)
	end)
	local p = new("Part", { Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, Transparency = 1,
		Size = Vector3.one, Position = at }, workspace)
	local light = new("PointLight", { Brightness = 0, Range = 40, Color = Color3.fromRGB(255, 30, 30) }, p)
	task.spawn(function()
		for i = 1, 24 do
			light.Brightness = if i % 2 == 0 then 8 else 0
			task.wait(0.25)
		end
		p:Destroy()
	end)
end

local function boom(pos: Vector3)
	local e = Instance.new("Explosion")
	e.Position = pos
	e.BlastPressure = 0
	e.BlastRadius = 1
	e.DestroyJointRadiusPercent = 0
	e.ExplosionType = Enum.ExplosionType.NoCraters
	e.Parent = workspace
	burst(pos, Color3.fromRGB(255, 160, 60), 50)
end

R.Fx.OnClientEvent:Connect(function(kind, a, b, c, d)
	if kind == "taser" then
		taserFx(a, b, c)
	elseif kind == "cuffed" then
		playSound("Cuffs", 0.9, a)
		burst(a, Color3.fromRGB(120, 160, 255), 30)
		floatText(a, "CUFFED", Color3.fromRGB(150, 190, 255))
	elseif kind == "booked" then
		playSound("Booked", 0.9, a)
		burst(a, Color3.fromRGB(120, 255, 140), 40)
		floatText(a, "BOOKED", Color3.fromRGB(120, 255, 140))
	elseif kind == "wreck" then
		playSound("Crash", 1, a)
		boom(a)
	elseif kind == "crash" then
		playSound("Crash", 0.7, a)
		burst(a, Color3.fromRGB(255, 210, 120), 25)
	elseif kind == "bail" then
		playSound("Door", 0.9, a)
		floatText(a, "SUSPECT RUNNING!", Color3.fromRGB(255, 90, 70))
	elseif kind == "horn" then
		playSound("Horn", 0.9, a)
	elseif kind == "chirp" then
		playSound("Chirp", 0.8, a)
	elseif kind == "shot" then
		shotFx(a, b, c, d)
	elseif kind == "hit" then
		playSound("Thud", 0.9, a)
		burst(a, Color3.fromRGB(170, 150, 120), 20)
	elseif kind == "alarm" then
		alarmFx(a)
	elseif kind == "breach" then
		playSound("Crash", 1, a)
		boom(a)
		alarmFx(a + Vector3.new(0, 4, 0))
	elseif kind == "delivered" then
		playSound("Doorbell", 0.8, a)
		playSound("Cash", 0.5)
		burst(a, GREEN, 30)
	elseif kind == "chime" then
		playSound("Chirp", 0.5, a)
	end
end)

-- tased: you drop for a few seconds
local stunnedUntil = 0
R.Knock.OnClientEvent:Connect(function(dir, seconds, force)
	local _, hum, hrp = myChar()
	if not hum or not hrp then
		return
	end
	stunnedUntil = os.clock() + (seconds or 3)
	hum.PlatformStand = true
	if typeof(force) == "number" and typeof(dir) == "Vector3" then
		hrp.AssemblyLinearVelocity = dir
		tasedLbl.Text = "OUCH!"
	elseif typeof(dir) == "Vector3" and dir.Magnitude > 0.01 then
		hrp.AssemblyLinearVelocity = Vector3.new(dir.X, 0, dir.Z).Unit * 18 + Vector3.new(0, 6, 0)
		tasedLbl.Text = "TASED!"
	end
	tasedLbl.Visible = true
	flash.BackgroundTransparency = 0.3
	TweenService:Create(flash, TweenInfo.new(0.6), { BackgroundTransparency = 1 }):Play()
	playSound(if force then "Thud" else "Taser", 0.6)
	task.delay(seconds or 3, function()
		if os.clock() >= stunnedUntil - 0.05 then
			tasedLbl.Visible = false
			local _, h = myChar()
			if h then
				h.PlatformStand = false
				h:ChangeState(Enum.HumanoidStateType.GettingUp)
			end
		end
	end)
end)

---------------------------------------------------------------- job / loot line, radar, speed limit
toastHolder.Position = UDim2.new(0.5, 0, 0, 80)
local infoLbl = label(gui, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 46), Size = UDim2.fromOffset(460, 28),
	TextSize = 16, Font = Enum.Font.GothamBold, BackgroundColor3 = DARK, BackgroundTransparency = 0.25, Visible = false,
	TextWrapped = true })
corner(infoLbl, 8)
local radarLbl = label(gui, { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -88), Size = UDim2.fromOffset(260, 26),
	TextSize = 15, Font = Enum.Font.GothamBlack, BackgroundColor3 = Color3.fromRGB(10, 14, 10), BackgroundTransparency = 0.2,
	TextColor3 = Color3.fromRGB(120, 255, 140), Visible = false })
corner(radarLbl, 6)
local limitLbl = label(speedo, { Position = UDim2.fromOffset(10, 40), Size = UDim2.fromOffset(80, 14), TextSize = 11,
	TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Color3.fromRGB(255, 220, 120), Text = "" })

local function nearbyCarAhead(myModel: Model, range: number): (Model?, number)
	local mine = myModel:FindFirstChild("Chassis") :: BasePart?
	if not mine then
		return nil, 0
	end
	local best, bestZ = nil, math.huge
	for model, f in carFx do
		if model ~= myModel then
			local rel = mine.CFrame:PointToObjectSpace(f.chassis.Position)
			if rel.Z < -5 and -rel.Z < range and math.abs(rel.X) < (-rel.Z) * 0.25 + 6 and -rel.Z < bestZ then
				best, bestZ = model, -rel.Z
			end
		end
	end
	return best, bestZ
end

---------------------------------------------------------------- traffic stop panel
local stopPanel = new("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.45), Size = UDim2.fromOffset(330, 250),
	BackgroundColor3 = DARK, BackgroundTransparency = 0.08, Visible = false, ZIndex = 35 }, gui)
corner(stopPanel, 14)
stroke(stopPanel, BLUE, 2)
label(stopPanel, { Position = UDim2.fromOffset(0, 8), Size = UDim2.new(1, 0, 0, 24), Text = "TRAFFIC STOP", TextSize = 20,
	Font = Enum.Font.GothamBlack, ZIndex = 36 })
local stopText = label(stopPanel, { Position = UDim2.fromOffset(16, 38), Size = UDim2.new(1, -32, 0, 132), TextSize = 15,
	TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, TextWrapped = true, RichText = true,
	Font = Enum.Font.Gotham, ZIndex = 36 })
local stopButtons = new("Frame", { Position = UDim2.new(0, 12, 1, -70), Size = UDim2.new(1, -24, 0, 58), BackgroundTransparency = 1,
	ZIndex = 36 }, stopPanel)
new("UIGridLayout", { CellSize = UDim2.new(0.5, -4, 0, 26), CellPadding = UDim2.fromOffset(8, 6) }, stopButtons)
for _, pair in { { "TICKET", "ticket", Color3.fromRGB(200, 140, 30) }, { "WARNING", "warning", Color3.fromRGB(60, 120, 200) },
	{ "ARREST", "arrest", Color3.fromRGB(190, 50, 50) }, { "LET GO", "release", Color3.fromRGB(70, 140, 80) } } do
	local b = button(stopButtons, pair[1], pair[3], UDim2.new())
	b.ZIndex = 37
	b.Activated:Connect(function()
		if stopModel then
			R.Action:FireServer("stop", stopModel, pair[2])
		end
		stopPanel.Visible = false
	end)
end
R.StopInfo.OnClientEvent:Connect(function(info)
	if type(info) ~= "table" then
		return
	end
	local speed = if info.clocked then ("<font color=\"#ff7060\">%d mph in a %d zone</font>"):format(info.clocked, info.limit or 45)
		else "not clocked speeding"
	stopText.Text = ("<b>%s</b> · %s\nDriver: %s\nSpeed: %s\nRegistration: %s\nWarrant: %s"):format(info.plate or "?",
		info.car or "?", info.name or "?", speed,
		if info.expired then "<font color=\"#ff7060\">EXPIRED</font>" else "valid",
		if info.warrant then "<font color=\"#ff4040\"><b>ACTIVE WARRANT</b></font>" else "none")
	stopPanel.Visible = true
	playSound("Radio", 0.5)
end)

---------------------------------------------------------------- menu: missions, jobs, garage, department, help
local menuBtn = button(gui, "MENU", Color3.fromRGB(60, 60, 72), UDim2.fromOffset(70, 34))
menuBtn.Position = UDim2.fromOffset(86, 92)
local menu = new("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.52), Size = UDim2.new(0.92, 0, 0.8, 0),
	BackgroundColor3 = DARK, BackgroundTransparency = 0.06, Visible = false, ZIndex = 30 }, gui)
new("UISizeConstraint", { MaxSize = Vector2.new(520, 600) }, menu)
corner(menu, 14)
stroke(menu, WHITE, 1.5)
label(menu, { Position = UDim2.fromOffset(16, 8), Size = UDim2.new(1, -80, 0, 34), Text = "PRECINCT 9", TextSize = 24,
	Font = Enum.Font.GothamBlack, TextXAlignment = Enum.TextXAlignment.Left, ZIndex = 31 })
local closeMenu = button(menu, "✕", Color3.fromRGB(70, 70, 80), UDim2.fromOffset(40, 40))
closeMenu.AnchorPoint = Vector2.new(1, 0)
closeMenu.Position = UDim2.new(1, -8, 0, 6)
closeMenu.ZIndex = 32
local menuList = new("ScrollingFrame", { Position = UDim2.fromOffset(12, 52), Size = UDim2.new(1, -24, 1, -62), BackgroundTransparency = 1,
	CanvasSize = UDim2.new(), AutomaticCanvasSize = Enum.AutomaticSize.Y, ScrollBarThickness = 6, ZIndex = 31,
	BorderSizePixel = 0 }, menu)
new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, menuList)
local menuGps: { pos: Vector3, text: string }? = nil
local menuOrder = 0

local function menuHeader(text: string)
	menuOrder += 1
	label(menuList, { Size = UDim2.new(1, 0, 0, 26), Text = text, TextSize = 15, Font = Enum.Font.GothamBlack,
		TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Color3.fromRGB(255, 210, 90), LayoutOrder = menuOrder, ZIndex = 32 })
end
local function menuRow(text: string, buttonText: string?, color: Color3?, onClick: (() -> ())?)
	menuOrder += 1
	local row = new("Frame", { Size = UDim2.new(1, -6, 0, 44), BackgroundColor3 = Color3.fromRGB(28, 34, 48), LayoutOrder = menuOrder,
		ZIndex = 32 }, menuList)
	corner(row, 8)
	label(row, { Position = UDim2.fromOffset(10, 0), Size = UDim2.new(1, if buttonText then -110 else -20, 1, 0), Text = text,
		TextSize = 14, TextWrapped = true, TextXAlignment = Enum.TextXAlignment.Left, RichText = true, Font = Enum.Font.Gotham,
		ZIndex = 33 })
	if buttonText then
		local b = button(row, buttonText, color or BLUE, UDim2.fromOffset(92, 34))
		b.AnchorPoint = Vector2.new(1, 0.5)
		b.Position = UDim2.new(1, -6, 0.5, 0)
		b.ZIndex = 34
		b.Activated:Connect(function()
			if onClick then
				onClick()
			end
		end)
	end
end
local function gpsTo(pos: Vector3, text: string)
	menuGps = { pos = pos, text = text }
	menu.Visible = false
	toast("GPS set: " .. text, Color3.fromRGB(190, 255, 210))
end

local function buildMenu()
	for _, c in menuList:GetChildren() do
		if not c:IsA("UIListLayout") then
			c:Destroy()
		end
	end
	menuOrder = 0
	local team = myTeam()
	menuHeader("TODAY'S MISSIONS")
	local ok, list = pcall(function()
		return HttpService:JSONDecode(player:GetAttribute("Missions") or "[]")
	end)
	for _, m in (if ok and type(list) == "table" then list else {}) do
		menuRow(("%s  <b>%s</b>  <font color=\"#88ff99\">%s</font>"):format(if m.done then "✅" else "▫️", m.text,
			if m.done then "done" else ("%d/%d · %s"):format(m.progress, m.goal, Data.money(m.cash))))
	end
	if team == "Civilian" then
		local job = player:GetAttribute("Job") or ""
		menuHeader("JOBS")
		for name, spec in Data.JOBS do
			if job == name then
				menuRow(("<b>%s</b> (working)"):format(spec.name), "QUIT", Color3.fromRGB(170, 60, 50), function()
					R.Action:FireServer("quitJob")
					menu.Visible = false
				end)
			else
				menuRow(("<b>%s</b> · start at the %s sign"):format(spec.name, if name == "Pizza" then "PIZZA" else "TAXI"), "GPS",
					GREEN, function()
						gpsTo(spec.start, spec.name)
					end)
			end
		end
		menuHeader("GARAGE · NORTHFIELD MOTORS")
		local owned = string.split(player:GetAttribute("OwnedCars") or "", ",")
		local hrp = select(3, myChar())
		local atDealer = hrp ~= nil and (hrp.Position - Data.DEALERSHIP).Magnitude < 45
		for _, kind in Data.SHOP_ORDER do
			local spec = Data.CARS[kind]
			if table.find(owned, kind) then
				menuRow(("<b>%s</b> · yours"):format(spec.name), "SPAWN", GREEN, function()
					R.Action:FireServer("myCar", kind)
					menu.Visible = false
				end)
			elseif atDealer then
				menuRow(("<b>%s</b> · %s · top speed %d mph"):format(spec.name, Data.money(spec.price),
					math.floor(spec.maxSpeed * Data.MPH)), "BUY", Color3.fromRGB(200, 140, 30), function()
					R.Action:FireServer("buyCar", kind)
					task.delay(0.6, buildMenu)
				end)
			else
				menuRow(("<b>%s</b> · %s"):format(spec.name, Data.money(spec.price)), "GPS", BLUE, function()
					gpsTo(Data.DEALERSHIP, "Northfield Motors")
				end)
			end
		end
		if player:GetAttribute("HasPistol") ~= true then
			menuRow(("<b>Pistol</b> · %s at Ironside Arms"):format(Data.money(Data.GUNS.Pistol.price)), "GPS", BLUE, function()
				gpsTo(Data.GUN_STORE, "Ironside Arms")
			end)
		end
	elseif team == "Police" then
		menuHeader("DEPARTMENT")
		local dept = player:GetAttribute("Dept") or "Patrol"
		local rankIdx = player:GetAttribute("RankIndex") or 1
		for _, key in Data.DEPT_ORDER do
			local d = Data.DEPTS[key]
			local unlocked = rankIdx >= d.rank
			menuRow(("<b>%s</b> · %s%s"):format(d.name, d.desc, if unlocked then "" else (" (%s)"):format(Data.RANKS[d.rank].name)),
				if dept == key then "ON DUTY" elseif unlocked then "JOIN" else "🔒",
				if dept == key then Color3.fromRGB(60, 60, 70) else BLUE, function()
					if dept ~= key and unlocked then
						R.Action:FireServer("dept", key)
						task.delay(0.6, buildMenu)
					end
				end)
		end
	end
	menuHeader("HOW TO PLAY")
	if team == "Police" then
		menuRow("Follow 911 calls (map). TASER suspects, hold ARREST, then walk them or drive them to the BOOKING garage.")
		menuRow("Traffic stops: drive behind a car with LIGHTS on until it pulls over, then walk to the driver's door.")
		menuRow("Robberies: armed robbers shoot back. Use your GUN on wanted suspects only.")
	else
		menuRow("Jobs pay clean money. Crimes (stealing, robbing, hitting people) give stars: AI police will hunt you.")
		menuRow("Robbery loot only counts once you lose the cops or stash it at JOE'S SCRAP.")
		menuRow("Arrested friends? Breach the back wall of the county jail. Jailed yourself? Pick the lock (slow).")
	end
end
menuBtn.Activated:Connect(function()
	if not menu.Visible then
		buildMenu()
	end
	menu.Visible = not menu.Visible
end)
closeMenu.Activated:Connect(function()
	menu.Visible = false
end)
for _, a in { "Missions", "OwnedCars", "Job", "Dept", "HasPistol", "Team" } do
	player:GetAttributeChangedSignal(a):Connect(function()
		if menu.Visible then
			buildMenu()
		end
	end)
end

---------------------------------------------------------------- places: rob, buy, work, break out
local promptFolder = Instance.new("Folder")
promptFolder.Name = "P9Prompts"
promptFolder.Parent = workspace
local function worldPrompt(pos: Vector3, action: string, object: string, hold: number, onTrigger: () -> (),
	onBegin: (() -> ())?): ProximityPrompt
	local p = new("Part", { Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, Transparency = 1,
		Size = Vector3.one, Position = pos + Vector3.new(0, 3, 0) }, promptFolder)
	local pr = new("ProximityPrompt", { ActionText = action, ObjectText = object, HoldDuration = hold, KeyboardKeyCode = Enum.KeyCode.E,
		MaxActivationDistance = 10, RequiresLineOfSight = false, Enabled = false }, p)
	pr.Triggered:Connect(onTrigger)
	if onBegin then
		pr.PromptButtonHoldBegan:Connect(onBegin)
	end
	return pr
end
local robPrompts: { [ProximityPrompt]: any } = {}
for _, store in Data.ROBBERIES do
	local pr = worldPrompt(store.pos, "Rob", store.name, store.time, function()
		R.Action:FireServer("rob", store.id, "finish")
	end, function()
		R.Action:FireServer("rob", store.id, "begin")
	end)
	robPrompts[pr] = store
end
local gunPrompt = worldPrompt(Data.GUN_STORE, ("Buy pistol %s"):format(Data.money(Data.GUNS.Pistol.price)), "Ironside Arms", 0.4,
	function()
		R.Action:FireServer("buyGun")
	end)
local dealerPrompt = worldPrompt(Data.DEALERSHIP, "Browse cars", "Northfield Motors", 0, function()
	buildMenu()
	menu.Visible = true
end)
local jobPrompts: { [string]: ProximityPrompt } = {}
for name, spec in Data.JOBS do
	jobPrompts[name] = worldPrompt(spec.start, if name == "Pizza" then "Start pizza job" else "Start taxi shift", spec.name, 0.3,
		function()
			R.Action:FireServer("startJob", name)
			menuGps = nil
		end)
end
local breachPrompt = worldPrompt(Data.JAIL_BREACH, "Breach the wall", "County Jail", 10, function()
	R.Action:FireServer("breach", "finish")
end, function()
	R.Action:FireServer("breach", "begin")
end)
local lockPart = new("Part", { Anchored = true, CanCollide = false, CanQuery = false, CanTouch = false, Transparency = 1,
	Size = Vector3.one, Position = Vector3.new(0, -50, 0) }, promptFolder)
local lockPrompt = new("ProximityPrompt", { ActionText = "Pick the lock", ObjectText = "Cell door", HoldDuration = 12,
	KeyboardKeyCode = Enum.KeyCode.E, MaxActivationDistance = 14, RequiresLineOfSight = false, Enabled = false }, lockPart)
lockPrompt.PromptButtonHoldBegan:Connect(function()
	R.Action:FireServer("lockpick", "begin")
end)
lockPrompt.Triggered:Connect(function()
	R.Action:FireServer("lockpick", "finish")
end)

local function refreshPlaces()
	local team = myTeam()
	local civ = team == "Civilian"
	local jailed = (player:GetAttribute("JailUntil") or 0) > workspace:GetServerTimeNow()
	local inCar = seatedCar() ~= nil
	local wanted = (player:GetAttribute("Wanted") or 0) > 0
	local job = player:GetAttribute("Job") or ""
	for pr in robPrompts do
		pr.Enabled = civ and not jailed and not inCar
	end
	gunPrompt.Enabled = civ and not jailed and player:GetAttribute("HasPistol") ~= true
	dealerPrompt.Enabled = civ and not jailed
	for name, pr in jobPrompts do
		pr.Enabled = civ and not jailed and not wanted and job ~= name
	end
	breachPrompt.Enabled = civ and not jailed and not inCar
	lockPrompt.Enabled = jailed
	if jailed then
		local _, _, hrp = myChar()
		local jail = workspace:FindFirstChild("World") and workspace.World:FindFirstChild("Jail")
		if hrp and jail then
			local best, bestD = nil, math.huge
			for _, c in jail:GetChildren() do
				if c:IsA("BasePart") and c.Name:sub(1, 4) == "Cell" and c.Name ~= "CellWall" then
					local d = (c.Position - hrp.Position).Magnitude
					if d < bestD then
						best, bestD = c, d
					end
				end
			end
			if best then
				lockPart.Position = best.Position + Vector3.new(4, 1, 0)
			end
		end
	end
	if stopPanel.Visible and stopModel then
		local _, _, hrp = myChar()
		local ch = stopModel:FindFirstChild("Chassis") :: BasePart?
		if not hrp or not ch or (ch.Position - hrp.Position).Magnitude > 30 then
			stopPanel.Visible = false
		end
	end
end

---------------------------------------------------------------- guns: models in hands, firing
local function gunModel(kind: string): Model
	local m = Instance.new("Model")
	m.Name = "P9Gun"
	local len = if kind == "Rifle" then 2.6 else 1.1
	local body = new("Part", { Name = "Body", Size = Vector3.new(0.25, 0.32, len), Color = Color3.fromRGB(30, 30, 34),
		Material = Enum.Material.Metal, CanCollide = false, CanQuery = false, CanTouch = false, Massless = true }, m)
	local grip = new("Part", { Name = "Grip", Size = Vector3.new(0.22, 0.55, 0.3), Color = Color3.fromRGB(45, 40, 36),
		Material = Enum.Material.SmoothPlastic, CanCollide = false, CanQuery = false, CanTouch = false, Massless = true }, m)
	grip.CFrame = body.CFrame * CFrame.new(0, -0.35, len / 2 - 0.25)
	new("WeldConstraint", { Part0 = body, Part1 = grip }, grip)
	m.PrimaryPart = body
	return m
end
local function refreshGuns()
	for _, p in Players:GetPlayers() do
		local char = p.Character
		local hand = char and (char:FindFirstChild("RightHand") or char:FindFirstChild("Right Arm"))
		if hand and hand:IsA("BasePart") then
			local want = p:GetAttribute("Equipped") or ""
			local has = hand:FindFirstChild("P9Gun")
			if has and has:GetAttribute("Kind") ~= want then
				has:Destroy()
				has = nil
			end
			if want ~= "" and not has then
				local m = gunModel(want)
				m:SetAttribute("Kind", want)
				local body = m.PrimaryPart :: BasePart
				local isR6 = hand.Name == "Right Arm"
				body.CFrame = hand.CFrame * CFrame.new(0, if isR6 then -1.1 else -0.35, -(body.Size.Z / 2) + 0.3)
				new("WeldConstraint", { Part0 = hand, Part1 = body }, body)
				m.Parent = hand
			end
		end
	end
end

local lastShotLocal = 0
local function aimFromScreen(x: number, y: number): Vector3?
	local _, _, hrp = myChar()
	if not hrp then
		return nil
	end
	local ray = camera:ViewportPointToRay(x, y)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { player.Character :: Instance, promptFolder }
	local hit = workspace:Raycast(ray.Origin, ray.Direction * 400, params)
	local point = if hit then hit.Position else ray.Origin + ray.Direction * 400
	local from = hrp.Position + Vector3.new(0, 1.5, 0)
	local dir = point - from
	return if dir.Magnitude > 0.1 then dir.Unit else nil
end
local function fireGun(aim: Vector3?)
	local spec = Data.GUNS[player:GetAttribute("Equipped") or ""]
	if not spec or not aim then
		return
	end
	local t = os.clock()
	if t - lastShotLocal < spec.rate then
		return
	end
	lastShotLocal = t
	R.Fire:FireServer(aim)
end
local function screenCenterAim(): Vector3?
	local vp = camera.ViewportSize
	return aimFromScreen(vp.X / 2, vp.Y / 2)
end
local fireHeld = false
fireBtn.InputBegan:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
		fireHeld = true
		fireGun(screenCenterAim())
	end
end)
fireBtn.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
		fireHeld = false
	end
end)
local mouseHeld = false
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.UserInputType == Enum.UserInputType.MouseButton1 and (player:GetAttribute("Equipped") or "") ~= "" then
		mouseHeld = true
		local m = UserInputService:GetMouseLocation()
		fireGun(aimFromScreen(m.X, m.Y))
	end
end)
UserInputService.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 then
		mouseHeld = false
	end
end)
RunService.Heartbeat:Connect(function()
	if player:GetAttribute("Equipped") == "Rifle" then
		if fireHeld then
			fireGun(screenCenterAim())
		elseif mouseHeld then
			local m = UserInputService:GetMouseLocation()
			fireGun(aimFromScreen(m.X, m.Y))
		end
	end
end)
local function cycleGun()
	local eq = player:GetAttribute("Equipped") or ""
	local nextGun = ""
	if myTeam() == "Police" then
		if eq == "" then
			nextGun = "Pistol"
		elseif eq == "Pistol" and player:GetAttribute("Dept") == "SWAT" then
			nextGun = "Rifle"
		end
	elseif eq == "" then
		nextGun = "Pistol"
	end
	R.Equip:FireServer(nextGun)
	if nextGun ~= "" then
		playSound("Reload", 0.5)
	end
end
gunBtn.Activated:Connect(cycleGun)
UserInputService.InputBegan:Connect(function(input, processed)
	if not processed and input.KeyCode == Enum.KeyCode.T and gunBtn.Visible then
		cycleGun()
	end
end)
myCarBtn.Activated:Connect(function()
	local owned = string.split(player:GetAttribute("OwnedCars") or "", ",")
	if #owned == 1 and owned[1] ~= "" then
		R.Action:FireServer("myCar", owned[1])
	else
		buildMenu()
		menu.Visible = true
	end
end)

---------------------------------------------------------------- AI officers' tags, traffic lights
local function tagOfficer(model: Instance)
	local head = model:WaitForChild("Head", 5)
	if not head or head:FindFirstChild("P9Tag") then
		return
	end
	local g = new("BillboardGui", { Name = "P9Tag", Size = UDim2.fromOffset(140, 34), StudsOffset = Vector3.new(0, 2.4, 0), MaxDistance = 120 },
		head)
	label(g, { Size = UDim2.new(1, 0, 0.55, 0), Text = model:GetAttribute("OfficerName") or "Officer", TextScaled = true,
		TextColor3 = Color3.fromRGB(170, 200, 255), TextStrokeTransparency = 0.3 })
	label(g, { Position = UDim2.fromScale(0, 0.55), Size = UDim2.new(1, 0, 0.45, 0), Text = "POLICE", TextScaled = true,
		Font = Enum.Font.GothamBlack, TextColor3 = Color3.fromRGB(90, 140, 255), TextStrokeTransparency = 0.3 })
end
CollectionService:GetInstanceAddedSignal("AIOfficer"):Connect(function(m)
	task.spawn(tagOfficer, m)
end)
for _, m in CollectionService:GetTagged("AIOfficer") do
	task.spawn(tagOfficer, m)
end

local trafficLights: { Model } = {}
do
	local world = workspace:WaitForChild("World", 10)
	local props = world and world:FindFirstChild("StreetProps")
	for _, m in (if props then props:GetChildren() else {}) do
		if m:IsA("Model") and m.Name == "TrafficLight" then
			table.insert(trafficLights, m)
		end
	end
end
local function refreshTrafficLights()
	local phase = math.floor(workspace:GetServerTimeNow()) % 16
	local lamp = if phase < 8 then "LampGreen" elseif phase < 10 then "LampAmber" else "LampRed"
	for _, m in trafficLights do
		for _, n in { "LampRed", "LampAmber", "LampGreen" } do
			local p = m:FindFirstChild(n)
			if p and p:IsA("BasePart") then
				p.Transparency = if n == lamp then 0 else 0.75
			end
		end
	end
end

---------------------------------------------------------------- the loops
local function hudStep()
	local team = myTeam()
	local _, hum, hrp = myChar()
	local car = seatedCar()
	local driving = myCar ~= nil
	local police = myCar and myCar:GetAttribute("Police") == true
	local cop = team == "Police"
	local jailed = (player:GetAttribute("JailUntil") or 0) > workspace:GetServerTimeNow()
	local civ = team == "Civilian"
	local equipped = player:GetAttribute("Equipped") or ""
	taserBtn.Visible = cop and not car
	carBtn.Visible = cop and not car
	if not carBtn.Visible then
		carMenu.Visible = false
	end
	local owned = player:GetAttribute("OwnedCars") or ""
	myCarBtn.Visible = civ and not car and not jailed and owned ~= ""
	gunBtn.Visible = not car and not jailed and (cop or (civ and player:GetAttribute("HasPistol") == true))
	gunBtn.Text = if equipped == "" then "GUN" else string.upper(equipped)
	gunBtn.BackgroundColor3 = if equipped == "" then Color3.fromRGB(70, 70, 78) else Color3.fromRGB(150, 110, 40)
	fireBtn.Visible = gunBtn.Visible and equipped ~= ""
	local ammo = player:GetAttribute("Ammo") or 0
	ammoLbl.Text = if ammo < 0 then "RELOAD" else tostring(ammo)
	lightsBtn.Visible = driving and police == true
	sirenBtn.Visible = driving and police == true
	hornBtn.Visible = driving
	if myCar then
		local siren = myCar:GetAttribute("Siren") or ""
		sirenBtn.Text = if siren == "" then "SIREN" else string.upper(siren)
		lightsBtn.BackgroundTransparency = if myCar:GetAttribute("Lights") then 0 else 0.45
		sirenBtn.BackgroundTransparency = if siren ~= "" then 0 else 0.45
	end
	local cd = math.clamp(1 - (os.clock() - lastTaser) / Data.TASER.cooldown, 0, 1)
	taserFill.Size = UDim2.fromScale(cd, 1)
	-- speedometer
	speedo.Visible = car ~= nil
	if car then
		local chassis = car:FindFirstChild("Chassis") :: BasePart?
		if chassis then
			speedLbl.Text = tostring(math.floor(chassis.AssemblyLinearVelocity.Magnitude * 0.62))
		end
		if chassis then
			limitLbl.Text = ("LIMIT %d"):format(Data.speedLimit(chassis.Position))
		end
		local hp = (car:GetAttribute("Health") or 100) / (car:GetAttribute("MaxHealth") or 100)
		hpFill.Size = UDim2.fromScale(math.clamp(hp, 0, 1), 1)
		hpFill.BackgroundColor3 = if hp > 0.5 then Color3.fromRGB(90, 230, 110) elseif hp > 0.2 then Color3.fromRGB(255, 190, 60)
			else Color3.fromRGB(255, 70, 60)
	end
	-- radar (police cars)
	radarLbl.Visible = false
	if myCar and police then
		local range = if player:GetAttribute("Dept") == "Traffic" then 320 else 220
		local target = nearbyCarAhead(myCar, range)
		local tch = target and target:FindFirstChild("Chassis") :: BasePart?
		if tch then
			local mph = math.floor(Vector3.new(tch.AssemblyLinearVelocity.X, 0, tch.AssemblyLinearVelocity.Z).Magnitude * Data.MPH)
			local limit = Data.speedLimit(tch.Position)
			radarLbl.Visible = true
			radarLbl.Text = ("RADAR  %d MPH  ·  %s"):format(mph, target:GetAttribute("Plate") or "NO PLATE")
			radarLbl.TextColor3 = if mph > limit + 8 then Color3.fromRGB(255, 90, 80) else Color3.fromRGB(120, 255, 140)
		end
	end
	-- job / loot line
	local loot = player:GetAttribute("Loot") or 0
	local job = player:GetAttribute("Job") or ""
	if loot > 0 then
		infoLbl.Visible = true
		infoLbl.Text = ("LOOT %s · lose the cops or stash it at JOE'S SCRAP"):format(Data.money(loot))
		infoLbl.TextColor3 = Color3.fromRGB(255, 200, 90)
	elseif job ~= "" then
		local deadline = player:GetAttribute("JobDeadline") or 0
		local left = deadline - workspace:GetServerTimeNow()
		local target = player:GetAttribute("JobTarget") or Vector3.zero
		local dist = if hrp then math.floor((Vector3.new(hrp.Position.X, 0, hrp.Position.Z) - target).Magnitude * 0.28) else 0
		infoLbl.Visible = true
		infoLbl.Text = ("%s · %d m%s"):format(player:GetAttribute("JobText") or job, dist,
			if deadline > 0 then (if left > 0 then ("  ·  %d:%02d"):format(math.floor(left / 60), math.floor(left % 60)) else "  ·  LATE")
			else "")
		infoLbl.TextColor3 = Color3.fromRGB(190, 255, 210)
	else
		infoLbl.Visible = false
	end
	-- jail
	local jailUntil = player:GetAttribute("JailUntil") or 0
	local left = jailUntil - workspace:GetServerTimeNow()
	jailLbl.Visible = left > 0
	if left > 0 then
		jailLbl.Text = ("IN JAIL  %d:%02d"):format(math.floor(left / 60), math.floor(left % 60))
	end
	if hum and stunnedUntil > 0 and os.clock() > stunnedUntil + 0.5 and hum.PlatformStand then
		hum.PlatformStand = false
		tasedLbl.Visible = false
	end
	-- minimap
	local i = 0
	for _, c in calls do
		if cop then
			i += 1
			local pulse = 6 + math.floor((clock * 3) % 2) * 3
			dot(i, c.x, c.z, if c.id == gpsCall then Color3.fromRGB(255, 255, 255) else Color3.fromRGB(255, 60, 60), pulse)
		end
	end
	local wantedMe = (player:GetAttribute("Wanted") or 0) > 0
	for model, fx in carFx do
		local isCop = model:GetAttribute("Police") and ((model:GetAttribute("Driver") or 0) ~= 0 or model:GetAttribute("AIPolice"))
		if isCop and (cop or (wantedMe and hrp and (fx.chassis.Position - hrp.Position).Magnitude < 350)) then
			i += 1
			local p = fx.chassis.Position
			dot(i, p.X, p.Z, Color3.fromRGB(80, 140, 255), 6)
		end
	end
	if cop then
		for _, other in Players:GetPlayers() do
			local ohrp = other ~= player and other.Character and other.Character:FindFirstChild("HumanoidRootPart")
			if ohrp and other:GetAttribute("Team") == "Civilian" and (other:GetAttribute("Wanted") or 0) > 0 then
				i += 1
				dot(i, ohrp.Position.X, ohrp.Position.Z, ORANGE, 7)
			end
		end
	end
	for k = i + 1, #dots do
		dots[k].Visible = false
	end
	if hrp then
		local mx, my = mapXY(hrp.Position.X, hrp.Position.Z)
		meArrow.Position = UDim2.fromOffset(mx - 8, my - 8)
		local look = camera.CFrame.LookVector
		meArrow.Rotation = math.deg(math.atan2(look.X, -look.Z))
	end
	-- GPS: your cuffed suspect -> booking garage; otherwise the call you picked (or the nearest)
	local escorting = false
	for model in suspectTags do
		local st = model:GetAttribute("State")
		if (st == "cuffed" or st == "transport") and model:GetAttribute("Officer") == player.UserId then
			escorting = true
			break
		end
	end
	if cop and escorting then
		setGps(Data.BOOKING, "BOOKING", Color3.fromRGB(90, 160, 255))
	elseif cop and #calls > 0 then
		local pick = calls[1]
		for _, c in calls do
			if c.id == gpsCall then
				pick = c
			end
		end
		setGps(Vector3.new(pick.x, 0, pick.z), pick.kind, Color3.fromRGB(255, 70, 60))
	elseif not cop and loot > 0 then
		setGps(Data.HIDEOUT, "JOE'S SCRAP", ORANGE)
	elseif not cop and job ~= "" then
		setGps(player:GetAttribute("JobTarget") or Vector3.zero, if job == "Pizza" then "DELIVERY" else "TAXI", GREEN)
	elseif menuGps then
		setGps(menuGps.pos, menuGps.text, Color3.fromRGB(120, 200, 255))
		if hrp and (Vector3.new(hrp.Position.X, 0, hrp.Position.Z) - Vector3.new(menuGps.pos.X, 0, menuGps.pos.Z)).Magnitude < 20 then
			menuGps = nil
		end
	else
		setGps(nil)
	end
	if gpsTarget and hrp and (Vector3.new(gpsTarget.X, 0, gpsTarget.Z) - Vector3.new(hrp.Position.X, 0, hrp.Position.Z)).Magnitude < 25 then
		gpsPart.Transparency = 0.85
	else
		gpsPart.Transparency = 0.55
	end
end

RunService.Heartbeat:Connect(function(dt)
	dt = math.min(dt, 0.1)
	local ok, err = pcall(driveStep, dt)
	if not ok then
		warn("[P9] drive: " .. tostring(err))
	end
	ok, err = pcall(carsStep, dt)
	if not ok then
		warn("[P9] cars: " .. tostring(err))
	end
end)

task.spawn(function()
	while true do
		task.wait(0.2)
		local ok, err = pcall(function()
			refreshPrompts()
			refreshSuspects()
			hudStep()
			refreshStars()
			refreshPlaces()
			refreshGuns()
			refreshTrafficLights()
		end)
		if not ok then
			warn("[P9] hud: " .. tostring(err))
		end
	end
end)

task.spawn(function()
	while true do
		task.wait(1)
		pcall(refreshCalls)
	end
end)
