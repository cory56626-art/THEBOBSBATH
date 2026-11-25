-- ChessCore verification inside Roblox: perft against standard reference counts, rules, and the bot.
local RS = game:GetService("ReplicatedStorage")
local Core = require(RS:WaitForChild("ChessCore"))
local out = {}
local function log(...)
	local t = {}
	for i = 1, select("#", ...) do
		table.insert(t, tostring(select(i, ...)))
	end
	table.insert(out, table.concat(t, " "))
end
-- standard perft suite (chessprogramming.org)
local suite = {
	{ "start", Core.START, { 20, 400, 8902, 197281 } },
	{ "kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", { 48, 2039, 97862 } },
	{ "pos3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", { 14, 191, 2812, 43238 } },
	{ "pos4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", { 6, 264, 9467 } },
	{ "pos5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", { 44, 1486, 62379 } },
	{ "pos6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", { 46, 2079, 89890 } },
}
local allOk = true
for _, case in suite do
	local g = Core.new(case[2])
	local results = {}
	for d, expect in case[3] do
		local t0 = os.clock()
		local got = g.perft(d)
		local ok = got == expect
		allOk = allOk and ok
		table.insert(results, ("d%d=%d%s(%.2fs)"):format(d, got, if ok then "" else "!=" .. expect, os.clock() - t0))
		task.wait()
	end
	log("perft", case[1], table.concat(results, " "))
	if g.fen() ~= case[2] then
		log("  fen roundtrip mismatch:", g.fen())
	end
end
log("PERFT", if allOk then "ALL CORRECT" else "MISMATCH")

-- rules: fool's mate, stalemate, SAN
local g = Core.new()
for _, uci in { "f2f3", "e7e5", "g2g4", "d8h4" } do
	local m = g.findMove(Core.parseSquare(uci:sub(1, 2)), Core.parseSquare(uci:sub(3, 4)))
	g.play(m :: number)
end
log("fool's mate status:", g.status())
log("stalemate status:", Core.new("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").status())
local s = Core.new("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1")
local mateMove = s.findMove(Core.parseSquare("f3"), Core.parseSquare("f7"))
log("SAN of Qxf7:", s.san(mateMove :: number))

-- bot: finds mate in 1 and mate in 2, and how deep it gets in 1 second from the opening
local m1 = Core.new("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1")
local mv = m1.search({ time = 1, yield = false })
log("mate-in-1 found:", m1.san(mv :: number))
local m2 = Core.new("kbK5/pp6/1P6/8/8/8/8/R7 w - - 0 1") -- classic mate in 2: 1.Ra6! and 2.b7#
local mv2, score2, d2 = m2.search({ time = 2, yield = false })
log("mate-in-2 position best:", m2.san(mv2 :: number), "score", score2, "depth", d2)
local op = Core.new()
local t0 = os.clock()
local mv3, sc3, d3, n3 = op.search({ time = 1, yield = false })
log(("opening search: %s score=%d depth=%d nodes=%d (%.0f nps)"):format(op.san(mv3 :: number), sc3, d3, n3,
	n3 / (os.clock() - t0)))
return table.concat(out, "\n")
