-- ChessTables: the referee for every table in the club (server only).
-- A table has two chairs: "south" (+Z) and "north" (-Z). South plays white unless the table is flipped.
-- At Gato tables the north chair is Gato's (the robot cat engine); at friend tables two players sit down.
-- The whole table state is published as one JSON attribute ("State") on the table model, so clients always see
-- a consistent snapshot; clients render the pieces themselves (smooth animation, no physics replication).

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ChessCore = require(ReplicatedStorage:WaitForChild("ChessCore"))

local Tables = {}
Tables.byModel = {} :: { [Instance]: any }
-- set by the server script: called as onResult(T, whiteActor, blackActor, winner "white"|"black"|"draw")
Tables.onResult = nil :: ((any, any, any, string) -> ())?

-- Gato's three personalities. rating: used for the players' Elo when they play Gato.
Tables.LEVELS = {
	Kitten = { rating = 600, minThink = 0.9, depth = 1, noise = 230, randomMove = 0.12 },
	Cat = { rating = 1250, minThink = 1.0, depth = 2, noise = 45, randomMove = 0 },
	Gato = { rating = 2000, minThink = 0.5, time = 2.2 },
}
local GATO = { UserId = -1, Name = "Gato", DisplayName = "Gato", IsGato = true }
Tables.GATO = GATO

local DRAW_TEXT = {
	stalemate = "Stalemate",
	fifty = "Draw by the 50-move rule",
	repetition = "Draw by repetition",
	material = "Draw: not enough pieces to mate",
}

local function displayName(a: any): string
	return if a then (a.DisplayName or a.Name) else "?"
end

local function whiteActor(T)
	return if T.flip then T.north else T.south
end
local function blackActor(T)
	return if T.flip then T.south else T.north
end
local function colorOf(T, actor): number?
	if actor == nil then
		return nil
	end
	if whiteActor(T) == actor then
		return 0
	elseif blackActor(T) == actor then
		return 1
	end
	return nil
end
local function colorName(c: number): string
	return if c == 0 then "white" else "black"
end
local function actorToMove(T)
	return if T.game.turn() == 0 then whiteActor(T) else blackActor(T)
end

---------------------------------------------------------------- signs above the tables
local function makeSign(T)
	local sign = T.model:FindFirstChild("Sign")
	if not sign or not sign:IsA("BasePart") then
		return
	end
	local titleText = if T.mode == "bot" then "GATO · " .. string.upper(T.level) else "FRIEND TABLE"
	T.signLabels = {}
	for _, face in { Enum.NormalId.Front, Enum.NormalId.Back } do
		local gui = Instance.new("SurfaceGui")
		gui.Name = "SignGui"
		gui.Face = face
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = 60
		gui.LightInfluence = 0.2
		gui.Brightness = 1.2
		local title = Instance.new("TextLabel")
		title.BackgroundTransparency = 1
		title.Size = UDim2.fromScale(1, 0.6)
		title.Font = Enum.Font.Merriweather
		title.TextScaled = true
		title.TextColor3 = Color3.fromRGB(255, 214, 140)
		title.Text = titleText
		title.Parent = gui
		local status = Instance.new("TextLabel")
		status.BackgroundTransparency = 1
		status.Position = UDim2.fromScale(0.05, 0.6)
		status.Size = UDim2.fromScale(0.9, 0.34)
		status.Font = Enum.Font.GothamMedium
		status.TextScaled = true
		status.TextColor3 = Color3.fromRGB(240, 230, 214)
		status.Text = ""
		status.Parent = gui
		gui.Parent = sign
		table.insert(T.signLabels, status)
	end
end

local function signText(T): string
	if T.status == "play" then
		return displayName(whiteActor(T)) .. " vs " .. displayName(blackActor(T))
	elseif T.status == "over" then
		return T.result
	elseif T.status == "waiting" then
		return displayName(T.south or T.north) .. " is waiting for an opponent"
	end
	return if T.mode == "bot" then "Sit down to play Gato the robot cat!" else "Sit down to play a friend"
end

---------------------------------------------------------------- publishing
local function actorInfo(a)
	if not a then
		return nil
	end
	return { id = a.UserId, name = displayName(a), gato = a.IsGato == true }
end

local function publish(T)
	T.seq += 1
	local n = #T.moves
	local lastMove = T.moves[n]
	local state = {
		seq = T.seq,
		mode = T.mode,
		level = T.level,
		fen = T.game.fen(),
		ply = n,
		last = if lastMove then { ChessCore.mFrom(lastMove), ChessCore.mTo(lastMove) } else nil,
		sans = table.concat(T.sans, " "),
		check = T.game.inCheck(),
		status = T.status,
		result = T.result,
		winner = T.winner,
		white = actorInfo(whiteActor(T)),
		black = actorInfo(blackActor(T)),
		south = actorInfo(T.south),
		north = actorInfo(T.north),
		flip = T.flip,
		thinking = T.thinking,
		offer = T.offer,
		rematch = { white = T.rematch[0] == true, black = T.rematch[1] == true },
		rated = not T.usedUndo,
	}
	T.model:SetAttribute("State", HttpService:JSONEncode(state))
	if T.signLabels then
		local text = signText(T)
		for _, label in T.signLabels do
			label.Text = text
		end
	end
end

---------------------------------------------------------------- game flow
local maybeBot

local function finish(T, winner: string, reason: string)
	T.status = "over"
	T.winner = winner
	T.result = reason
	T.thinking = false
	T.gen += 1 -- cancels a pending Gato move
	T.offer = ""
	T.rematch = {}
	local white, black = whiteActor(T), blackActor(T)
	if Tables.onResult and not T.usedUndo then
		task.spawn(Tables.onResult :: any, T, white, black, winner)
	end
	publish(T)
end

local function checkEnd(T)
	local st = T.game.status()
	if st == "play" then
		return
	end
	if st == "checkmate" then
		local winnerColor = 1 - T.game.turn()
		local w = if winnerColor == 0 then whiteActor(T) else blackActor(T)
		finish(T, colorName(winnerColor), "Checkmate! " .. displayName(w) .. " wins")
	else
		finish(T, "draw", DRAW_TEXT[st] or "Draw")
	end
end

local function applyMove(T, m: number)
	local san = T.game.san(m)
	if not T.game.play(m) then
		return false
	end
	table.insert(T.moves, m)
	table.insert(T.sans, san)
	T.offer = ""
	checkEnd(T)
	if T.status == "play" then
		publish(T)
		maybeBot(T)
	end
	return true
end
Tables.applyMove = applyMove

local function startGame(T)
	T.game.load(ChessCore.START)
	T.moves, T.sans = {}, {}
	T.status, T.result, T.winner, T.offer = "play", "", "", ""
	T.rematch = {}
	T.usedUndo = false
	T.thinking = false
	T.gen += 1
	publish(T)
	maybeBot(T)
end
Tables.startGame = startGame

local function resetBoard(T, status: string)
	T.game.load(ChessCore.START)
	T.moves, T.sans = {}, {}
	T.status, T.result, T.winner, T.offer = status, "", "", ""
	T.rematch = {}
	T.usedUndo = false
	T.thinking = false
	T.gen += 1
	publish(T)
end

---------------------------------------------------------------- Gato
-- Kitten and Cat score every root move with a shallow search plus some noise (so they make human-like
-- mistakes); Gato thinks properly (iterative deepening, ~2 s).
local function chooseMove(bot, level: string): number?
	local L = Tables.LEVELS[level] or Tables.LEVELS.Cat
	if L.time then
		return (bot.search({ time = L.time }))
	end
	local moves = bot.legalMoves()
	local best, bestScore = nil, -math.huge
	for _, m in moves do
		bot.play(m)
		local st = bot.status()
		local score
		if st == "checkmate" then
			score = 100000
		elseif st ~= "play" then
			score = 0
		else
			local _, s, d = bot.search({ depth = L.depth, time = 0.3 })
			if d == 0 then
				s = bot.evaluate()
			end
			score = -s
		end
		bot.undo()
		if math.abs(score) < 20000 then
			score += (math.random() + math.random() - 1) * L.noise
		end
		if score > bestScore then
			best, bestScore = m, score
		end
	end
	if L.randomMove > 0 and bestScore < 20000 and math.random() < L.randomMove then
		best = moves[math.random(#moves)]
	end
	return best
end
Tables.chooseMove = chooseMove

local function botThink(T)
	T.gen += 1
	local gen = T.gen
	T.thinking = true
	publish(T)
	task.spawn(function()
		local t0 = os.clock()
		while T.busy do
			task.wait(0.05)
		end
		if T.gen ~= gen then
			return
		end
		T.busy = true
		local ok, m = pcall(function()
			T.bot = T.bot or ChessCore.new()
			T.bot.load(ChessCore.START)
			for _, mv in T.moves do
				T.bot.play(mv)
			end
			return chooseMove(T.bot, T.level)
		end)
		T.busy = false
		if not ok then
			warn("[Chess] Gato error: " .. tostring(m))
			m = nil
		end
		local L = Tables.LEVELS[T.level] or Tables.LEVELS.Cat
		local rest = L.minThink - (os.clock() - t0)
		if rest > 0 then
			task.wait(rest)
		end
		if T.gen ~= gen or T.status ~= "play" then
			return
		end
		T.thinking = false
		if m == nil or not T.game.findMove(ChessCore.mFrom(m), ChessCore.mTo(m), ChessCore.mPromo(m)) then
			local moves = T.game.legalMoves()
			m = moves[math.random(#moves)]
		end
		applyMove(T, m :: number)
	end)
end

maybeBot = function(T)
	if T.mode == "bot" and T.status == "play" and actorToMove(T) == GATO then
		botThink(T)
	end
end

---------------------------------------------------------------- setup and seats
function Tables.init(model: Model)
	local modeValue = model:FindFirstChild("Mode")
	local levelValue = model:FindFirstChild("Level")
	local T = {
		model = model,
		mode = if modeValue and modeValue.Value == "bot" then "bot" else "pvp",
		level = if levelValue and levelValue.Value ~= "" then levelValue.Value else "",
		game = ChessCore.new(),
		bot = nil,
		moves = {},
		sans = {},
		south = nil,
		north = nil,
		flip = false,
		status = "idle",
		result = "",
		winner = "",
		thinking = false,
		gen = 0,
		busy = false,
		offer = "",
		rematch = {},
		usedUndo = false,
		seq = 0,
	}
	if T.mode == "bot" then
		T.north = GATO
	end
	Tables.byModel[model] = T
	makeSign(T)
	publish(T)
	return T
end

-- someone sat down in (actor) or got up from (actor = nil) a chair ("south" / "north")
function Tables.seat(T, where: string, actor)
	local prev = T[where]
	if prev == actor then
		return
	end
	if T.mode == "bot" then
		if where ~= "south" then
			return
		end
		T.south = actor
		if actor then
			T.flip = false
			startGame(T)
		else
			resetBoard(T, "idle")
		end
		return
	end
	if prev and T.status == "play" then
		-- leaving in the middle of a game forfeits it (decided while the leaver is still seated, so the result
		-- counts for both players); the final position stays on display until someone new sits down
		local c = colorOf(T, prev)
		if c ~= nil then
			finish(T, colorName(1 - c), displayName(prev) .. " left: " .. displayName(if c == 0
				then blackActor(T)
				else whiteActor(T)) .. " wins")
		end
		T[where] = actor
		publish(T)
		return
	end
	T[where] = actor
	if T.south and T.north then
		T.flip = math.random() < 0.5 -- random colours for a new pair
		startGame(T)
	else
		resetBoard(T, if T.south or T.north then "waiting" else "idle")
	end
end

---------------------------------------------------------------- player actions
-- returns ok, message (message is shown to the player)
function Tables.action(T, actor, what: string, a: any, b: any, c: any): (boolean, string?)
	local color = colorOf(T, actor)
	if color == nil then
		return false, "Sit at this table to play"
	end
	if what == "move" then
		if T.status ~= "play" then
			return false, nil
		end
		if T.game.turn() ~= color or T.thinking then
			return false, "It's not your turn"
		end
		if type(a) ~= "number" or type(b) ~= "number" then
			return false, nil
		end
		local promo = if type(c) == "number" and c >= 2 and c <= 5 then c else nil
		local m = T.game.findMove(a, b, promo)
		if not m then
			return false, "That move isn't legal"
		end
		applyMove(T, m)
		return true
	elseif what == "resign" then
		if T.status ~= "play" then
			return false, nil
		end
		finish(T, colorName(1 - color), displayName(actor) .. " resigned: " .. displayName(if color == 0
			then blackActor(T)
			else whiteActor(T)) .. " wins")
		return true
	elseif what == "draw" then
		if T.mode ~= "pvp" or T.status ~= "play" then
			return false, nil
		end
		if T.offer == colorName(1 - color) then
			finish(T, "draw", "Draw agreed")
		else
			T.offer = colorName(color)
			publish(T)
		end
		return true
	elseif what == "decline" then
		if T.offer == colorName(1 - color) then
			T.offer = ""
			publish(T)
		end
		return true
	elseif what == "undo" then
		if T.mode ~= "bot" or #T.moves == 0 then
			return false, nil
		end
		T.gen += 1
		T.thinking = false
		-- take back to the player's previous turn (Gato's reply and the player's move)
		local removedMine = false
		while #T.moves > 0 do
			local mover = 1 - T.game.turn() -- who played the last move
			T.game.undo()
			table.remove(T.moves)
			table.remove(T.sans)
			if mover == color then
				removedMine = true
			end
			if removedMine and T.game.turn() == color then
				break
			end
		end
		T.status, T.result, T.winner = "play", "", ""
		T.usedUndo = true
		publish(T)
		maybeBot(T)
		return true
	elseif what == "side" then
		if T.mode ~= "bot" or (T.status == "play" and #T.moves > 1) then
			return false, "You can switch sides before the game starts"
		end
		T.flip = not T.flip
		startGame(T)
		return true
	elseif what == "newgame" then
		if T.mode == "bot" then
			startGame(T)
			return true
		end
		what = "rematch"
	end
	if what == "rematch" then
		if T.mode ~= "pvp" or T.status ~= "over" or not (T.south and T.north) then
			return false, nil
		end
		T.rematch[color] = true
		if T.rematch[0] and T.rematch[1] then
			T.flip = not T.flip -- swap colours
			startGame(T)
		else
			publish(T)
		end
		return true
	end
	return false, nil
end

return Tables
