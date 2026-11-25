-- The chess club on this client: renders every table, lets you play when you sit down (tap a piece, tap a
-- square: works the same with a mouse or a finger), runs the board camera, the buttons, Gato's chatter, sounds
-- and celebrations.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local HttpService = game:GetService("HttpService")

local player = Players.LocalPlayer
local ChessCore = require(ReplicatedStorage:WaitForChild("ChessCore"))
local Render = require(ReplicatedStorage:WaitForChild("ChessRender"))
local remotes = ReplicatedStorage:WaitForChild("ChessRemotes")
local Action = remotes:WaitForChild("Action") :: RemoteEvent
local Notify = remotes:WaitForChild("Notify") :: RemoteEvent

local piecesFolder = Instance.new("Folder")
piecesFolder.Name = "ChessPieces"
piecesFolder.Parent = workspace

type Entry = { model: Model, R: any, state: any, prev: any, gato: Model?, bubble: any, blinkAt: number }
local entries: { [Instance]: Entry } = {}
local mine: Entry? = nil
local mySeat: Seat? = nil
local selected: number? = nil
local targets: { [number]: { number } }? = nil
local view = "angled"
local ratingAtStart: number? = nil

---------------------------------------------------------------- little UI toolkit
local GOLD = Color3.fromRGB(255, 205, 120)
local PANEL = Color3.fromRGB(30, 22, 18)

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
local function corner(parent: Instance, r: number?)
	make("UICorner", { CornerRadius = UDim.new(0, r or 12) }, parent)
end
local function stroke(parent: Instance, color: Color3?, t: number?)
	make("UIStroke", { Color = color or GOLD, Thickness = t or 1.5, Transparency = 0.35,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border }, parent)
end

local gui = make("ScreenGui", { Name = "ChessUI", ResetOnSpawn = false, ZIndexBehavior = Enum.ZIndexBehavior.Sibling },
	player:WaitForChild("PlayerGui"))

-- top banner: whose move it is / results
local banner = make("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 6),
	Size = UDim2.new(0.62, 0, 0, 64), BackgroundColor3 = PANEL, BackgroundTransparency = 0.12, Visible = false }, gui)
make("UISizeConstraint", { MaxSize = Vector2.new(520, 64) }, banner)
corner(banner, 14)
stroke(banner)
local bannerTitle = make("TextLabel", { BackgroundTransparency = 1, Position = UDim2.new(0, 12, 0, 4),
	Size = UDim2.new(1, -24, 0, 32), Font = Enum.Font.GothamBold, TextSize = 24, TextColor3 = Color3.new(1, 1, 1),
	Text = "", TextScaled = false, TextTruncate = Enum.TextTruncate.AtEnd }, banner)
local bannerSub = make("TextLabel", { BackgroundTransparency = 1, Position = UDim2.new(0, 12, 0, 36),
	Size = UDim2.new(1, -24, 0, 22), Font = Enum.Font.GothamMedium, TextSize = 16,
	TextColor3 = Color3.fromRGB(225, 210, 190), Text = "", TextTruncate = Enum.TextTruncate.AtEnd }, banner)

-- bottom button bar
local bar = make("Frame", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -8),
	Size = UDim2.new(1, -16, 0, 46), BackgroundTransparency = 1, Visible = false }, gui)
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, HorizontalAlignment = Enum.HorizontalAlignment.Center,
	VerticalAlignment = Enum.VerticalAlignment.Center, Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder,
	Wraps = true }, bar)

local buttons: { [string]: TextButton } = {}
local function button(name: string, text: string, order: number, color: Color3?, onClick: () -> ())
	local b = make("TextButton", { Name = name, LayoutOrder = order, AutomaticSize = Enum.AutomaticSize.X,
		Size = UDim2.new(0, 0, 0, 44), BackgroundColor3 = color or Color3.fromRGB(64, 46, 36), BackgroundTransparency = 0.05,
		Font = Enum.Font.GothamBold, TextSize = 17, TextColor3 = Color3.new(1, 1, 1), Text = text, AutoButtonColor = true,
		Visible = false }, bar)
	make("UIPadding", { PaddingLeft = UDim.new(0, 16), PaddingRight = UDim.new(0, 16) }, b)
	corner(b, 10)
	stroke(b, GOLD, 1)
	b.Activated:Connect(onClick)
	buttons[name] = b
	return b
end

-- toast for short messages
local toastLabel = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 78),
	AutomaticSize = Enum.AutomaticSize.X, Size = UDim2.new(0, 0, 0, 34), BackgroundColor3 = Color3.fromRGB(20, 16, 14),
	BackgroundTransparency = 0.2, Font = Enum.Font.GothamBold, TextSize = 17, TextColor3 = GOLD, Text = "",
	Visible = false }, gui)
make("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14) }, toastLabel)
corner(toastLabel, 10)
local toastId = 0
local function toast(text: string, seconds: number?)
	toastId += 1
	local id = toastId
	toastLabel.Text = text
	toastLabel.Visible = true
	task.delay(seconds or 2.2, function()
		if toastId == id then
			toastLabel.Visible = false
		end
	end)
end

-- result card
local resultCard = make("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.42),
	Size = UDim2.new(0, 360, 0, 150), BackgroundColor3 = PANEL, BackgroundTransparency = 0.06, Visible = false }, gui)
corner(resultCard, 18)
stroke(resultCard, GOLD, 2)
local resultTitle = make("TextLabel", { BackgroundTransparency = 1, Position = UDim2.new(0, 10, 0, 14),
	Size = UDim2.new(1, -20, 0, 50), Font = Enum.Font.FredokaOne, TextSize = 44, TextColor3 = GOLD, Text = "" }, resultCard)
local resultSub = make("TextLabel", { BackgroundTransparency = 1, Position = UDim2.new(0, 14, 0, 66),
	Size = UDim2.new(1, -28, 0, 44), Font = Enum.Font.GothamMedium, TextSize = 17, TextWrapped = true,
	TextColor3 = Color3.fromRGB(235, 225, 210), Text = "" }, resultCard)
local resultRating = make("TextLabel", { BackgroundTransparency = 1, Position = UDim2.new(0, 14, 0, 112),
	Size = UDim2.new(1, -28, 0, 26), Font = Enum.Font.GothamBold, TextSize = 18, TextColor3 = Color3.fromRGB(150, 230, 160),
	Text = "" }, resultCard)
local resultId = 0
local resultTap = make("TextButton", { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), Text = "" }, resultCard)
resultTap.Activated:Connect(function()
	resultCard.Visible = false
end)

-- promotion picker
local promoFrame = make("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.new(0, 340, 0, 120), BackgroundColor3 = PANEL, BackgroundTransparency = 0.05, Visible = false }, gui)
corner(promoFrame, 16)
stroke(promoFrame, GOLD, 2)
make("TextLabel", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 34), Font = Enum.Font.GothamBold,
	TextSize = 18, TextColor3 = GOLD, Text = "Promote your pawn to..." }, promoFrame)
local promoRow = make("Frame", { BackgroundTransparency = 1, Position = UDim2.new(0, 10, 0, 40),
	Size = UDim2.new(1, -20, 0, 70) }, promoFrame)
make("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, HorizontalAlignment = Enum.HorizontalAlignment.Center,
	Padding = UDim.new(0, 8) }, promoRow)
local promoCallback: ((number) -> ())? = nil
for i, info in { { "Queen", ChessCore.QUEEN }, { "Rook", ChessCore.ROOK }, { "Bishop", ChessCore.BISHOP },
	{ "Knight", ChessCore.KNIGHT } } do
	local b = make("TextButton", { LayoutOrder = i, Size = UDim2.new(0, 72, 0, 64), BackgroundColor3 = Color3.fromRGB(70, 50, 38),
		Font = Enum.Font.GothamBold, TextSize = 15, TextColor3 = Color3.new(1, 1, 1), Text = info[1] }, promoRow)
	corner(b, 10)
	b.Activated:Connect(function()
		promoFrame.Visible = false
		local cb = promoCallback
		promoCallback = nil
		if cb then
			cb(info[2])
		end
	end)
end
local function askPromotion(cb: (number) -> ())
	promoCallback = cb
	promoFrame.Visible = true
end

-- lobby hint
local hint = make("TextLabel", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -12),
	AutomaticSize = Enum.AutomaticSize.XY, Size = UDim2.new(0, 0, 0, 0), BackgroundColor3 = PANEL,
	BackgroundTransparency = 0.25, Font = Enum.Font.GothamMedium, TextSize = 16, TextColor3 = Color3.fromRGB(240, 228, 210),
	Text = "Sit in a chair to play!  Back tables: Gato the robot cat (Kitten, Cat, Gato).  Front tables: play a friend.",
	TextWrapped = true }, gui)
make("UISizeConstraint", { MaxSize = Vector2.new(620, 200) }, hint)
make("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14), PaddingTop = UDim.new(0, 8),
	PaddingBottom = UDim.new(0, 8) }, hint)
corner(hint, 12)

---------------------------------------------------------------- sounds
local Bank = require(ReplicatedStorage:WaitForChild("ChessSoundBank"))
local function playSound(name: string, pos: Vector3?, volume: number?)
	if name == "Move" then
		name = "Move" .. math.random(1, 3)
	end
	local r = Bank.Regions[name]
	if not r then
		return
	end
	local snd = Instance.new("Sound")
	snd.SoundId = Bank.Id
	snd.PlaybackRegionsEnabled = true
	snd.PlaybackRegion = NumberRange.new(r[1], r[2])
	snd.Volume = volume or 0.8
	snd.PlaybackSpeed = 0.95 + math.random() * 0.1
	snd.RollOffMode = Enum.RollOffMode.InverseTapered
	snd.RollOffMinDistance = 8
	snd.RollOffMaxDistance = 60
	local holder: Instance = gui
	if pos then
		local att = Instance.new("Attachment")
		att.WorldPosition = pos
		att.Parent = workspace.Terrain
		holder = att
	end
	snd.Parent = holder
	snd:Play()
	task.delay(r[2] - r[1] + 0.5, function()
		if holder ~= gui then
			holder:Destroy()
		else
			snd:Destroy()
		end
	end)
end

---------------------------------------------------------------- helpers
local function myColor(st): number?
	if not st then
		return nil
	end
	if st.white and st.white.id == player.UserId and not st.white.gato then
		return 0
	end
	if st.black and st.black.id == player.UserId and not st.black.gato then
		return 1
	end
	return nil
end

local function nameOf(info, st): string
	if not info then
		return "an empty chair"
	end
	if info.gato then
		return "Gato (" .. tostring(st.level) .. ")"
	end
	return if info.id == player.UserId then "You" else info.name
end

local function clearSelection()
	selected, targets = nil, nil
	if mine then
		mine.R:showTargets(nil, nil)
	end
end

local function confetti(pos: Vector3)
	local p = Instance.new("Part")
	p.Anchored, p.CanCollide, p.CanQuery, p.CanTouch, p.Transparency = true, false, false, false, 1
	p.Size = Vector3.new(1, 1, 1)
	p.Position = pos
	p.Parent = workspace
	local e = Instance.new("ParticleEmitter")
	e.Rate = 0
	e.Lifetime = NumberRange.new(2, 3.2)
	e.Speed = NumberRange.new(12, 22)
	e.SpreadAngle = Vector2.new(55, 55)
	e.Acceleration = Vector3.new(0, -22, 0)
	e.Drag = 1.2
	e.RotSpeed = NumberRange.new(-300, 300)
	e.Rotation = NumberRange.new(0, 360)
	e.Size = NumberSequence.new(0.28)
	e.LightEmission = 0.3
	e.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 90, 90)),
		ColorSequenceKeypoint.new(0.25, Color3.fromRGB(255, 210, 80)),
		ColorSequenceKeypoint.new(0.5, Color3.fromRGB(110, 230, 120)),
		ColorSequenceKeypoint.new(0.75, Color3.fromRGB(90, 170, 255)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(220, 110, 255)),
	})
	e.EmissionDirection = Enum.NormalId.Top
	e.Parent = p
	e:Emit(140)
	task.delay(4, function()
		p:Destroy()
	end)
end

---------------------------------------------------------------- Gato's speech bubble and idle life
local function say(entry: Entry, text: string)
	local gato = entry.gato
	local head = gato and gato:FindFirstChild("Head")
	if not head then
		return
	end
	if not entry.bubble then
		local bb = make("BillboardGui", { Name = "Speech", Size = UDim2.new(0, 230, 0, 54), StudsOffset = Vector3.new(0, 3.2, 0),
			MaxDistance = 70, LightInfluence = 0, AlwaysOnTop = false }, head)
		local frame = make("Frame", { BackgroundColor3 = Color3.fromRGB(255, 250, 240), Size = UDim2.fromScale(1, 1),
			Visible = false }, bb)
		corner(frame, 14)
		local label = make("TextLabel", { BackgroundTransparency = 1, Size = UDim2.new(1, -16, 1, -8),
			Position = UDim2.new(0, 8, 0, 4), Font = Enum.Font.FredokaOne, TextScaled = true,
			TextColor3 = Color3.fromRGB(50, 36, 30), Text = "" }, frame)
		entry.bubble = { frame = frame, label = label, id = 0 }
	end
	local bubble = entry.bubble
	bubble.id += 1
	local id = bubble.id
	bubble.label.Text = text
	bubble.frame.Visible = true
	task.delay(3.2, function()
		if bubble.id == id then
			bubble.frame.Visible = false
		end
	end)
end

local function pick(list: { string }): string
	return list[math.random(#list)]
end

local function gatoColor(st): number?
	if st.white and st.white.gato then
		return 0
	elseif st.black and st.black.gato then
		return 1
	end
	return nil
end

-- react to what just happened at a table (everyone nearby hears the sounds and sees Gato talk)
local function react(entry: Entry, prev, st)
	local center = entry.R.center.Position
	if st.ply == prev.ply + 1 and st.last then
		local san: string = string.match(st.sans, "(%S+)$") or ""
		local capture = string.find(san, "x", 1, true) ~= nil
		local check = string.find(san, "[+#]") ~= nil
		playSound(if capture then "Capture" else "Move", center, nil)
		if check then
			playSound("Check", center, nil)
		end
		local gc = gatoColor(st)
		if gc ~= nil and st.status == "play" then
			local moverIsGato = (st.ply % 2 == 1) == (gc == 0) -- white made odd plies
			if moverIsGato and check and math.random() < 0.7 then
				say(entry, pick({ "Check! 😼", "Watch your king! 👑", "Check, meow!" }))
			elseif moverIsGato and capture and math.random() < 0.45 then
				say(entry, pick({ "Nom nom! 🐟", "Mine now! 😸", "Yoink!", "Purrfect snack." }))
			elseif not moverIsGato and check and math.random() < 0.7 then
				say(entry, pick({ "Hiss! 🙀", "Eek, my king!", "Mrrrow?!" }))
			elseif not moverIsGato and capture and math.random() < 0.3 then
				say(entry, pick({ "Hey, that was mine! 😾", "Rude!", "I wasn't using that anyway..." }))
			end
		end
	end
	if st.status == "play" and st.ply == 0 and (prev.status ~= "play" or prev.ply > 0) then
		playSound("Start", center, 0.6)
		if gatoColor(st) ~= nil then
			say(entry, pick({ "Meow! Let's play. 😺", "Ready when you are!", "Good luck, human! 🐾" }))
		end
	end
	if st.status == "play" and st.ply < prev.ply and st.ply > 0 and gatoColor(st) ~= nil then
		say(entry, pick({ "A takeback? Okay... 🐾", "Fine, try again!", "Second chances, meow." }))
	end
	if st.status == "over" and prev.status ~= "over" then
		local gc = gatoColor(st)
		if gc ~= nil then
			if st.winner == "draw" then
				say(entry, "A draw! Paw-shake? 🐾")
			elseif (st.winner == "white") == (gc == 0) then
				say(entry, pick({ "Purr-fect game! 😸", "Good game, human!", "Meow-velous! 🏆" }))
			else
				say(entry, pick({ "You got me! Well played. 😿", "Hiss... rematch?", "Impressive, human!" }))
			end
		end
	end
end

---------------------------------------------------------------- the panel for my table
local function refreshUI()
	local seated = mine ~= nil and mine.state ~= nil
	banner.Visible = seated
	bar.Visible = seated
	hint.Visible = not mine
	if not seated then
		promoFrame.Visible = false
		return
	end
	local st = (mine :: Entry).state
	local c = myColor(st)
	local bot = st.mode == "bot"
	local opp = if c == 0 then st.black elseif c == 1 then st.white else nil
	local myTurn = st.status == "play" and c ~= nil and ((st.ply % 2 == 0) == (c == 0))
	if st.status == "play" then
		if myTurn then
			bannerTitle.Text = if st.check then "Check! Your move" else "Your move"
		elseif st.thinking then
			bannerTitle.Text = "Gato is thinking..."
		else
			bannerTitle.Text = nameOf(opp, st) .. "'s move"
		end
	elseif st.status == "waiting" then
		bannerTitle.Text = "Waiting for an opponent..."
	elseif st.status == "over" then
		bannerTitle.Text = st.result
	else
		bannerTitle.Text = "Chess"
	end
	local colorText = if c == 0 then "White" elseif c == 1 then "Black" else "watching"
	local sub = "You (" .. colorText .. ") vs " .. nameOf(opp, st)
	if st.status == "waiting" then
		sub = "Ask a friend to sit across from you"
	end
	local lastSan = string.match(st.sans or "", "(%S+)$")
	if lastSan and st.status ~= "waiting" then
		local moveNo = (st.ply + 1) // 2
		sub ..= "   ·   " .. moveNo .. (if st.ply % 2 == 1 then ". " else "... ") .. lastSan
	end
	if not st.rated then
		sub ..= "   ·   casual"
	end
	bannerSub.Text = sub

	local playing = st.status == "play"
	buttons.Leave.Visible = true
	buttons.View.Visible = true
	buttons.Resign.Visible = playing and st.ply >= 1
	buttons.Undo.Visible = bot and st.ply >= (if c == 1 then 2 else 1) and (playing or st.status == "over")
	buttons.Side.Visible = bot and ((playing and st.ply <= 1) or st.status == "over")
	buttons.Side.Text = if c == 1 then "Play White" else "Play Black"
	buttons.NewGame.Visible = bot and st.status == "over"
	local myColorName = if c == 0 then "white" else "black"
	local oppColorName = if c == 0 then "black" else "white"
	buttons.Draw.Visible = not bot and playing and st.offer ~= oppColorName
	buttons.Draw.Text = if st.offer == myColorName then "Draw offered" else "Offer draw"
	buttons.Accept.Visible = not bot and playing and st.offer == oppColorName
	buttons.Decline.Visible = buttons.Accept.Visible
	local bothSeated = st.south ~= nil and st.north ~= nil
	buttons.Rematch.Visible = not bot and st.status == "over" and bothSeated
	local iAsked = st.rematch and st.rematch[myColorName]
	local theyAsked = st.rematch and st.rematch[oppColorName]
	buttons.Rematch.Text = if iAsked then "Rematch asked..." elseif theyAsked then "Accept rematch!" else "Rematch"
end

---------------------------------------------------------------- buttons
local resignArmed = 0
button("Leave", "Leave", 1, Color3.fromRGB(90, 40, 36), function()
	if mine then
		Action:FireServer(mine.model, "leave")
	end
end)
button("Resign", "Resign", 2, nil, function()
	if not mine then
		return
	end
	if os.clock() - resignArmed < 3 then
		resignArmed = 0
		buttons.Resign.Text = "Resign"
		Action:FireServer(mine.model, "resign")
	else
		resignArmed = os.clock()
		buttons.Resign.Text = "Sure? Tap again"
		task.delay(3, function()
			buttons.Resign.Text = "Resign"
		end)
	end
end)
button("Undo", "Undo", 3, nil, function()
	if mine then
		Action:FireServer(mine.model, "undo")
	end
end)
button("Side", "Play Black", 4, nil, function()
	if mine then
		Action:FireServer(mine.model, "side")
	end
end)
button("Draw", "Offer draw", 5, nil, function()
	if mine then
		Action:FireServer(mine.model, "draw")
	end
end)
button("Accept", "Accept draw", 6, Color3.fromRGB(46, 96, 56), function()
	if mine then
		Action:FireServer(mine.model, "draw")
	end
end)
button("Decline", "Decline", 7, nil, function()
	if mine then
		Action:FireServer(mine.model, "decline")
	end
end)
button("NewGame", "New game", 8, Color3.fromRGB(46, 96, 56), function()
	if mine then
		Action:FireServer(mine.model, "newgame")
	end
end)
button("Rematch", "Rematch", 9, Color3.fromRGB(46, 96, 56), function()
	if mine then
		Action:FireServer(mine.model, "rematch")
	end
end)
button("View", "View", 10, nil, function()
	view = if view == "angled" then "top" else "angled"
end)

---------------------------------------------------------------- tables
local function onState(entry: Entry)
	local json = entry.model:GetAttribute("State")
	if type(json) ~= "string" then
		return
	end
	local ok, st = pcall(function()
		return HttpService:JSONDecode(json)
	end)
	if not ok or type(st) ~= "table" then
		return
	end
	local prev = entry.state
	entry.state = st
	entry.R:update(st)
	if prev then
		react(entry, prev, st)
	end
	if entry == mine then
		clearSelection()
		local c = myColor(st)
		local ls = player:FindFirstChild("leaderstats")
		local rating = ls and ls:FindFirstChild("Rating")
		if st.status == "play" and rating then
			ratingAtStart = rating.Value
		end
		if st.status == "over" and (not prev or prev.status ~= "over") and c ~= nil then
			resultId += 1
			local id = resultId
			local won = (st.winner == "white" and c == 0) or (st.winner == "black" and c == 1)
			resultTitle.Text = if st.winner == "draw" then "Draw" elseif won then "You win!" else "You lost"
			resultTitle.TextColor3 = if won then GOLD else Color3.fromRGB(230, 220, 210)
			resultSub.Text = st.result
			resultRating.Text = if st.rated then "" else "Casual game (takeback used): rating unchanged"
			resultCard.Visible = true
			playSound(if won then "Win" elseif st.winner == "draw" then "Draw" else "Lose", nil, 0.8)
			if won then
				confetti(entry.R.center.Position + Vector3.new(0, 3, 0))
			end
			if st.rated and rating and ratingAtStart then
				local before = ratingAtStart
				task.delay(1.5, function()
					if resultId == id then
						local delta = rating.Value - before
						resultRating.Text = "Rating " .. rating.Value .. "  (" .. (if delta >= 0 then "+" else "") .. delta .. ")"
					end
				end)
			end
			task.delay(6, function()
				if resultId == id then
					resultCard.Visible = false
				end
			end)
		elseif st.status ~= "over" then
			resultCard.Visible = false
		end
		refreshUI()
	end
end

local tablesFolder = workspace:WaitForChild("Tables")
local function addTable(model: Instance)
	if not model:IsA("Model") or entries[model] then
		return
	end
	local entry: Entry = {
		model = model,
		R = Render.new(model, piecesFolder),
		state = nil,
		prev = nil,
		gato = model:FindFirstChild("Gato") :: Model?,
		bubble = nil,
		blinkAt = os.clock() + math.random() * 4,
	}
	entries[model] = entry
	model:GetAttributeChangedSignal("State"):Connect(function()
		onState(entry)
	end)
	onState(entry)
end
for _, m in tablesFolder:GetChildren() do
	task.spawn(addTable, m)
end
tablesFolder.ChildAdded:Connect(addTable)

Notify.OnClientEvent:Connect(function(text)
	if type(text) == "string" then
		toast(text)
	end
end)

---------------------------------------------------------------- sitting down / standing up
local controls = nil
task.spawn(function()
	local ok, pm = pcall(function()
		return require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule") :: ModuleScript)
	end)
	if ok and pm then
		controls = (pm :: any):GetControls()
	end
end)

local camera = workspace.CurrentCamera
local function boardView(): CFrame
	local entry = mine :: Entry
	local c = entry.R.center.Position
	local s = (mySeat :: Seat).Position
	local side = Vector3.new(s.X - c.X, 0, s.Z - c.Z)
	side = if side.Magnitude > 0.1 then side.Unit else Vector3.zAxis
	if view == "top" then
		return CFrame.lookAt(c + side * 0.8 + Vector3.new(0, 16.5, 0), c + side * 0.4, -side)
	end
	return CFrame.lookAt(c + side * 7.8 + Vector3.new(0, 10.4, 0), c + side * 0.9)
end

local function enterTable(entry: Entry, seat: Seat)
	mine = entry
	mySeat = seat
	clearSelection()
	if controls then
		controls:Disable()
	end
	camera.CameraType = Enum.CameraType.Scriptable
	camera.FieldOfView = 50
	refreshUI()
end

local function exitTable()
	clearSelection()
	mine = nil
	mySeat = nil
	if controls then
		controls:Enable()
	end
	camera.CameraType = Enum.CameraType.Custom
	camera.FieldOfView = 70
	resultCard.Visible = false
	refreshUI()
end

local function watchCharacter(char: Model)
	local hum = char:WaitForChild("Humanoid") :: Humanoid
	local function update()
		local seat = hum.SeatPart
		local entry = seat and entries[seat.Parent :: Instance]
		if entry and seat and seat:IsA("Seat") then
			enterTable(entry, seat)
		elseif mine then
			exitTable()
		end
	end
	hum:GetPropertyChangedSignal("SeatPart"):Connect(update)
	update()
end
player.CharacterAdded:Connect(watchCharacter)
if player.Character then
	task.spawn(watchCharacter, player.Character)
end

---------------------------------------------------------------- tapping squares
local function selectSquare(sq: number)
	local entry = mine :: Entry
	local G = entry.R.G
	local moves: { [number]: { number } } = {}
	for _, m in G.legalMoves() do
		if ChessCore.mFrom(m) == sq then
			local to = ChessCore.mTo(m)
			moves[to] = moves[to] or {}
			table.insert(moves[to], m)
		end
	end
	selected, targets = sq, moves
	local marks = {}
	for to, list in moves do
		marks[to] = G.pieceAt(to) ~= 0 or ChessCore.mFlag(list[1]) == 3
	end
	entry.R:showTargets(sq, marks)
	playSound("Select", nil, 0.35)
end

local function onSquare(sq: number)
	local entry = mine :: Entry
	local st = entry.state
	local c = myColor(st)
	if not st or st.status ~= "play" or c == nil then
		return
	end
	local G = entry.R.G
	if selected and targets and targets[sq] then
		local list = targets[sq]
		local from = selected :: number
		clearSelection()
		if #list > 1 then
			askPromotion(function(promo)
				if mine == entry then
					Action:FireServer(entry.model, "move", from, sq, promo)
				end
			end)
		else
			Action:FireServer(entry.model, "move", from, sq, ChessCore.mPromo(list[1]))
		end
		return
	end
	local p = G.pieceAt(sq)
	if p ~= 0 and (if p >= 8 then 1 else 0) == c then
		if sq == selected then
			clearSelection()
		elseif G.turn() ~= c then
			clearSelection()
			toast(if st.thinking then "Gato is thinking..." else "Wait for your turn")
		else
			selectSquare(sq)
		end
	else
		clearSelection()
	end
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed or not mine or not mine.state then
		return
	end
	if input.UserInputType ~= Enum.UserInputType.MouseButton1 and input.UserInputType ~= Enum.UserInputType.Touch then
		return
	end
	local ray = camera:ScreenPointToRay(input.Position.X, input.Position.Y)
	local sq = mine.R:squareFromRay(ray.Origin, ray.Direction * 200)
	if sq then
		onSquare(sq)
	else
		clearSelection()
	end
end)

---------------------------------------------------------------- per frame: camera, Gato's blinking and antenna
local eyeScale: { [Instance]: Vector3 } = {}
RunService.RenderStepped:Connect(function(dt)
	if mine and mySeat and camera.CameraType == Enum.CameraType.Scriptable then
		local goal = boardView()
		camera.CFrame = camera.CFrame:Lerp(goal, math.min(1, dt * 6))
		local vp = camera.ViewportSize
		camera.FieldOfView = if vp.Y > vp.X then 72 else 50
	end
	local now = os.clock()
	for _, entry in entries do
		local gato = entry.gato
		if not gato then
			continue
		end
		local tip = gato:FindFirstChild("AntennaTip") :: BasePart?
		if tip then
			local thinking = entry.state and entry.state.thinking
			local glow = if thinking then 0.5 + 0.5 * math.sin(now * 9) else 1
			tip.Color = Color3.fromRGB(255, 172, 60):Lerp(Color3.fromRGB(120, 220, 255), if thinking then glow else 0)
		end
		local blinking = now >= entry.blinkAt and now < entry.blinkAt + 0.14
		if now >= entry.blinkAt + 0.14 then
			entry.blinkAt = now + 2.5 + math.random() * 3.5
		end
		for _, eye in gato:GetChildren() do
			if eye.Name == "Eye" then
				local mesh = eye:FindFirstChildOfClass("SpecialMesh")
				if mesh then
					eyeScale[mesh] = eyeScale[mesh] or mesh.Scale
					mesh.Scale = if blinking then eyeScale[mesh] * Vector3.new(1, 0.12, 1) else eyeScale[mesh]
				end
			end
		end
	end
end)

refreshUI()
