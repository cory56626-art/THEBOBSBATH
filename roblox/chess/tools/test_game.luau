-- In-Roblox test of the chess club: compiles every script, drives the referee through real games (Gato levels,
-- friend tables, forfeits, draws, takebacks, promotion), and checks the client renderer's piece placement.
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")
local SS = game:GetService("ServerStorage")
local HttpService = game:GetService("HttpService")

local out = {}
local fails = 0
local function log(...)
	local parts = {}
	for i = 1, select("#", ...) do
		parts[i] = tostring((select(i, ...)))
	end
	local line = table.concat(parts, " ")
	table.insert(out, line)
	print(line)
end
local function check(cond, what)
	if not cond then
		fails += 1
		log("FAIL: " .. what)
	end
	return cond
end

-- 1. everything compiles
for _, m in SS:GetChildren() do
	local ok, err = pcall(require, m)
	check(ok, "compile " .. m.Name .. ": " .. tostring(err))
end
log("templates:", #RS.ChessTemplates:GetChildren())

local ChessCore = require(RS.ChessCore)
local Tables = require(SSS.ChessTables)
local results = {}
Tables.onResult = function(T, w, b, winner)
	table.insert(results, { table = T.model.Name, white = w and w.Name, black = b and b.Name, winner = winner })
end

local byName = {}
for _, model in workspace.Tables:GetChildren() do
	byName[model.Name] = Tables.init(model)
end
local function state(T)
	return HttpService:JSONDecode(T.model:GetAttribute("State"))
end
local function waitFor(cond, timeout)
	local t0 = os.clock()
	while not cond() do
		if os.clock() - t0 > timeout then
			return false
		end
		task.wait(0.05)
	end
	return true
end
local sq = ChessCore.parseSquare
local function move(T, who, uci)
	local promo = nil
	if #uci == 5 then
		promo = ({ q = 5, r = 4, b = 3, n = 2 })[string.sub(uci, 5, 5)]
	end
	return Tables.action(T, who, "move", sq(string.sub(uci, 1, 2)), sq(string.sub(uci, 3, 4)), promo)
end

local alice = { UserId = 101, Name = "Alice" }
local bob = { UserId = 102, Name = "Bob" }
local cara = { UserId = 103, Name = "Cara" }

-- 2. sign text
local sign = byName.GatoTable_Cat.model.Sign:FindFirstChildOfClass("SurfaceGui")
check(sign ~= nil, "sign gui exists")

-- 3. Kitten table: Alice plays white, Gato answers, takeback, switch sides
do
	local T = byName.GatoTable_Kitten
	Tables.seat(T, "south", alice)
	local s = state(T)
	check(s.status == "play" and s.white.name == "Alice" and s.black.gato, "kitten game started")
	check(not move(T, alice, "e2e5"), "illegal move rejected")
	check(move(T, alice, "e2e4"), "alice e4")
	check(state(T).thinking == true, "gato thinking")
	check(not move(T, alice, "d2d4"), "cannot move during gato's turn")
	local t0 = os.clock()
	check(waitFor(function()
		return state(T).ply == 2
	end, 15), "kitten replied")
	log("kitten reply:", state(T).sans, string.format("%.2fs", os.clock() - t0))
	Tables.action(T, alice, "undo")
	s = state(T)
	check(s.ply == 0 and s.status == "play" and s.rated == false, "undo back to start, casual")
	Tables.action(T, alice, "side")
	check(state(T).flip == true, "alice switched to black")
	check(waitFor(function()
		return state(T).ply == 1
	end, 15), "gato opened as white")
	log("kitten as white:", state(T).sans, "white:", state(T).white.name)
	Tables.seat(T, "south", nil)
	s = state(T)
	check(s.status == "idle" and s.ply == 0, "table reset when alice left")
end

-- 4. Cat and Gato think times / quality
for _, name in { "GatoTable_Cat", "GatoTable_Gato" } do
	local T = byName[name]
	Tables.seat(T, "south", bob)
	-- Scholar's-mate trap: 1.e4 e5 2.Qh5 Nc6 3.Bc4 -> Gato must defend f7
	check(move(T, bob, "e2e4"), name .. " e4")
	local t0 = os.clock()
	check(waitFor(function()
		return state(T).ply == 2
	end, 20), name .. " replied")
	log(name, "reply 1:", state(T).sans, string.format("%.2fs", os.clock() - t0))
	check(move(T, bob, "d1h5"), name .. " Qh5")
	check(waitFor(function()
		return state(T).ply == 4
	end, 20), name .. " replied 2")
	check(move(T, bob, "f1c4"), name .. " Bc4")
	check(waitFor(function()
		return state(T).ply == 6
	end, 20), name .. " replied 3")
	local s = state(T)
	log(name, "after Bc4:", s.sans, "status:", s.status)
	-- if Gato didn't defend, Qxf7 is mate
	local mated = move(T, bob, "h5f7")
	s = state(T)
	log(name, "Qxf7 legal:", mated, "status:", s.status, s.result)
	if name == "GatoTable_Gato" then
		check(not (mated and s.status == "over"), "full Gato never falls for scholar's mate")
	end
	Tables.seat(T, "south", nil)
end

-- 5. friend table: random colours, fool's mate, rematch swaps colours
do
	local T = byName.FriendTable_1
	Tables.seat(T, "south", alice)
	check(state(T).status == "waiting", "waiting for opponent")
	Tables.seat(T, "north", bob)
	local s = state(T)
	check(s.status == "play", "pvp started")
	local white = if s.white.name == "Alice" then alice else bob
	local black = if white == alice then bob else alice
	log("pvp colours: white", white.Name, "black", black.Name)
	check(not move(T, black, "e7e5"), "black can't move first")
	check(move(T, white, "f2f3"), "f3")
	check(move(T, black, "e7e5"), "e5")
	check(move(T, white, "g2g4"), "g4")
	check(move(T, black, "d8h4"), "Qh4#")
	s = state(T)
	check(s.status == "over" and s.winner == "black", "fool's mate ends the game: " .. s.result)
	log("result:", s.result, "| sans:", s.sans)
	Tables.action(T, alice, "rematch")
	check(state(T).status == "over" and state(T).rematch, "rematch pending")
	Tables.action(T, bob, "rematch")
	s = state(T)
	check(s.status == "play" and s.white.name == black.Name, "rematch swapped colours")
	-- draw offer
	local w2 = if s.white.name == "Alice" then alice else bob
	local b2 = if w2 == alice then bob else alice
	Tables.action(T, w2, "draw")
	check(state(T).offer == "white", "draw offered")
	Tables.action(T, b2, "decline")
	check(state(T).offer == "", "draw declined")
	Tables.action(T, b2, "draw")
	Tables.action(T, w2, "draw")
	check(state(T).status == "over" and state(T).winner == "draw", "draw agreed")
	-- new game then forfeit by leaving
	Tables.action(T, alice, "rematch")
	Tables.action(T, bob, "rematch")
	check(state(T).status == "play", "third game")
	local s3 = state(T)
	local leaver = if s3.south.name == "Alice" then "south" else "north"
	Tables.seat(T, leaver, nil)
	s = state(T)
	check(s.status == "over" and string.find(s.result, "left") ~= nil, "leaving forfeits: " .. s.result)
	check(s.south == nil or s.north == nil, "leaver removed")
	Tables.seat(T, leaver, cara)
	check(state(T).status == "play", "new opponent starts a new game")
	-- intruder can't move
	check(not move(T, { UserId = 999, Name = "X" }, "e2e4"), "spectator can't move")
	Tables.seat(T, "south", nil)
	Tables.seat(T, "north", nil)
end

-- 6. promotion and resign at a friend table
do
	local T = byName.FriendTable_2
	Tables.seat(T, "south", alice)
	Tables.seat(T, "north", bob)
	-- set up a promotion position directly
	T.game.load("8/P6k/8/8/8/8/6pK/8 w - - 0 1")
	T.flip = false
	local ok = move(T, alice, "a7a8n")
	local s = state(T)
	check(ok and string.find(s.sans, "a8=N", 1, true) ~= nil, "underpromotion to knight: " .. s.sans)
	ok = move(T, bob, "g2g1")
	s = state(T)
	check(ok and string.find(s.sans, "g1=Q", 1, true) ~= nil, "default promotion to queen: " .. s.sans)
	Tables.action(T, alice, "resign")
	s = state(T)
	check(s.status == "over" and s.winner == "black", "resign: " .. s.result)
	Tables.seat(T, "south", nil)
	Tables.seat(T, "north", nil)
end

log("results recorded:", #results)
for _, r in results do
	log(" ", r.table, r.white, "vs", r.black, "->", r.winner)
end

-- 7. renderer (normally on clients): pieces placed on the right squares, animated move, capture, graveyard
do
	local Render = require(RS.ChessRender)
	local folder = Instance.new("Folder")
	folder.Parent = workspace
	local T = byName.FriendTable_3
	local R = Render.new(T.model, folder)
	R:update(state(T))
	local count = 0
	for _ in R.pieces do
		count += 1
	end
	check(count == 32, "32 pieces rendered, got " .. count)
	local e1 = R.pieces[sq("e1")]
	check(e1 and e1.model.Name == "WhiteKing", "white king on e1")
	local cpos = T.model.Board.Center.Position
	local kpos = e1.model:GetPivot().Position - cpos
	log("king offset from centre:", kpos)
	check(math.abs(kpos.X - 0.75) < 0.01 and math.abs(kpos.Z - 5.25) < 0.01, "e1 is at +x 0.75, +z 5.25")
	-- play some moves through the referee and render each state
	Tables.seat(T, "south", alice)
	Tables.seat(T, "north", bob)
	T.flip = false
	for _, uci in { "e2e4", "d7d5", "e4d5", "d8d5", "g1f3", "c8g4", "f1e2", "b8c6", "e1g1" } do
		local who = if T.game.turn() == 0 then alice else bob
		check(move(T, who, uci), "render game move " .. uci)
		R:update(state(T))
	end
	Render.step(os.clock() + 5)
	task.wait()
	local s = state(T)
	local ok = true
	for row = 0, 7 do
		for file = 0, 7 do
			local q = row * 16 + file
			local code = R.G.pieceAt(q)
			local rec = R.pieces[q]
			if (code ~= 0) ~= (rec ~= nil) or (rec and rec.code ~= code) then
				ok = false
				log("mismatch at", ChessCore.squareName(q))
			end
		end
	end
	check(ok, "renderer matches the position after castling: " .. s.sans)
	local g1 = R.pieces[sq("g1")]
	log("castled king at", g1 and (g1.model:GetPivot().Position - cpos))
	check(g1 and (g1.model:GetPivot().Position - (cpos + Vector3.new(3.75, 0, 5.25))).Magnitude < 0.05,
		"castled king slid to g1")
	local f1 = R.pieces[sq("f1")]
	check(f1 and f1.model.Name == "WhiteRook", "rook on f1 after castling")
	check(#R.grave == 2, "two captured pieces on the side, got " .. #R.grave)
	-- flipped boards: e1 is now on the far side
	T.flip = true
	R:update(HttpService:JSONDecode(T.model:GetAttribute("State")))
	local st = state(T)
	st.flip = true
	R:update(st)
	local kp = R.pieces[sq("g1")].model:GetPivot().Position - cpos
	check(kp.Z < -5 and kp.X < -2, "flipped board puts white at -Z: " .. tostring(kp))
	-- tap mapping: a ray straight down onto c3 hits c3
	local target = cpos + R:localPos(sq("c3"))
	local hit = R:squareFromRay(target + Vector3.new(0, 20, 0), Vector3.new(0, -40, 0))
	check(hit == sq("c3"), "tap maps to c3, got " .. tostring(hit and ChessCore.squareName(hit)))
	R:showTargets(sq("f3"), { [sq("e5")] = false, [sq("d4")] = true })
	check(#R.targetFx == 2, "target markers")
	folder:Destroy()
end

log(if fails == 0 then "ALL GAME TESTS PASSED" else ("FAILURES: " .. fails))
return table.concat(out, "\n")
