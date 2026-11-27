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
for _, n in { "PickTeam", "CarAction", "CarToggle", "SpawnCar", "Taser", "Arrest", "Notify", "Knock", "Fx" } do
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
	snd.SoundId = Bank.Id
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
	if team == "Criminal" then
		rankLbl.Text = "CRIMINAL"
		rankLbl.TextColor3 = ORANGE
		cardStroke.Color = ORANGE
	else
		rankLbl.Text = string.upper(cur.name) .. (if nxt then ("  ·  %d/%d XP"):format(xp, nxt.xp) else "  ·  MAX")
		rankLbl.TextColor3 = WHITE
		cardStroke.Color = BLUE
	end
	xpFill.Size = UDim2.fromScale(if nxt then math.clamp((xp - cur.xp) / (nxt.xp - cur.xp), 0, 1) else 1, 1)
	xpFill.BackgroundColor3 = if team == "Criminal" then ORANGE else BLUE
end
for _, a in { "Cash", "XP", "Team" } do
	player:GetAttributeChangedSignal(a):Connect(refreshCard)
end
refreshCard()

---------------------------------------------------------------- wanted stars, toasts, jail and tased overlays
local starsLbl = label(gui, { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 6), Size = UDim2.fromOffset(260, 40),
	TextSize = 36, TextColor3 = Color3.fromRGB(255, 210, 60), Font = Enum.Font.GothamBlack, Visible = false })
local function refreshStars()
	local n = player:GetAttribute("Wanted") or 0
	starsLbl.Visible = myTeam() == "Criminal" and n > 0
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
teamCard("Criminal", "CRIMINAL",
	"Steal cars, outrun the cops and lay low. Every minute you stay wanted pays. Get caught and you're doing time.",
	Color3.fromRGB(170, 80, 20))
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
	elseif team == "Criminal" then
		toast("Steal a parked car (walk up and press Steal). Outrun the cops. The longer you stay wanted, the more you earn.",
			Color3.fromRGB(255, 200, 140))
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
local actions = new("Frame", { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -12, 1, -190), Size = UDim2.fromOffset(96, 330),
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
local carBtn = actionButton("CRUISER", Color3.fromRGB(40, 70, 170), 3)
local suvBtn = actionButton("SUV", Color3.fromRGB(30, 50, 120), 4)
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
carBtn.Activated:Connect(function()
	R.SpawnCar:FireServer("Cruiser")
end)
suvBtn.Activated:Connect(function()
	R.SpawnCar:FireServer("Interceptor")
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
	maxSpeed: number,
}
local carFx: { [Model]: CarFx } = {}

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
		fx.drivePrompt.ActionText = if team == "Criminal" and not police and not mine then "Steal" else "Drive"
		fx.ridePrompt.Enabled = team ~= "" and inCar == nil and (not police or team == "Police") and not wrecked
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
		tag.text.Text = info[1] .. (if state == "flee" or state == "loiter" then "  " .. string.rep("★", stars) else "")
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
				prompt.Enabled = cop and other:GetAttribute("Team") == "Criminal" and (other:GetAttribute("Wanted") or 0) > 0
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

R.Fx.OnClientEvent:Connect(function(kind, a, b, c)
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
	end
end)

-- tased: you drop for a few seconds
local stunnedUntil = 0
R.Knock.OnClientEvent:Connect(function(dir, seconds)
	local _, hum, hrp = myChar()
	if not hum or not hrp then
		return
	end
	stunnedUntil = os.clock() + (seconds or 3)
	hum.PlatformStand = true
	if typeof(dir) == "Vector3" and dir.Magnitude > 0.01 then
		hrp.AssemblyLinearVelocity = Vector3.new(dir.X, 0, dir.Z).Unit * 18 + Vector3.new(0, 6, 0)
	end
	tasedLbl.Visible = true
	flash.BackgroundTransparency = 0.3
	TweenService:Create(flash, TweenInfo.new(0.6), { BackgroundTransparency = 1 }):Play()
	playSound("Taser", 0.6)
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

---------------------------------------------------------------- the loops
local function hudStep()
	local team = myTeam()
	local _, hum, hrp = myChar()
	local car = seatedCar()
	local driving = myCar ~= nil
	local police = myCar and myCar:GetAttribute("Police") == true
	local cop = team == "Police"
	taserBtn.Visible = cop and not car
	carBtn.Visible = cop and not car
	suvBtn.Visible = cop and not car
	local rankIdx = player:GetAttribute("RankIndex") or 1
	local suvRank = Data.CARS.Interceptor.rank or 1
	suvBtn.Text = if rankIdx >= suvRank then "SUV" else "SUV 🔒"
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
		local hp = (car:GetAttribute("Health") or 100) / (car:GetAttribute("MaxHealth") or 100)
		hpFill.Size = UDim2.fromScale(math.clamp(hp, 0, 1), 1)
		hpFill.BackgroundColor3 = if hp > 0.5 then Color3.fromRGB(90, 230, 110) elseif hp > 0.2 then Color3.fromRGB(255, 190, 60)
			else Color3.fromRGB(255, 70, 60)
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
	for model, fx in carFx do
		if model:GetAttribute("Police") and (model:GetAttribute("Driver") or 0) ~= 0 then
			i += 1
			local p = fx.chassis.Position
			dot(i, p.X, p.Z, Color3.fromRGB(80, 140, 255), 6)
		end
	end
	if cop then
		for _, other in Players:GetPlayers() do
			local ohrp = other ~= player and other.Character and other.Character:FindFirstChild("HumanoidRootPart")
			if ohrp and other:GetAttribute("Team") == "Criminal" and (other:GetAttribute("Wanted") or 0) > 0 then
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
