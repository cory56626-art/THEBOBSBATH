--!native
--!optimize 2
-- ChessCore: complete chess rules + a Gato-style search, in one module (used by the server as the referee and
-- the bot, and by clients to highlight legal moves).
--   * 0x88 board, pieces = type + 8 * color (white 1..6, black 9..14), white = 0, black = 1
--   * moves are integers: from + to*128 + promo*16384 + flag*131072
--   * legal moves = pseudo-legal moves that don't leave the king in check (make/unmake)
--   * draws: stalemate, fifty-move rule, threefold repetition, insufficient material
--   * search: iterative deepening PVS, transposition table, quiescence, killers/history, null move, late-move
--     reductions, check extension; evaluation = Gato 3's Texel-tuned piece-square tables (tapered) + bishop pair +
--     tempo. It yields to the scheduler regularly so a server never freezes while the bot thinks.
-- The design follows src/gato-search.js in this repository (Gato 2/3), ported and trimmed for Luau.

local Weights = require(script.Parent:WaitForChild("GatoWeights"))

local band, bxor, lshift, rshift = bit32.band, bit32.bxor, bit32.lshift, bit32.rshift

local PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING = 1, 2, 3, 4, 5, 6
local F_QUIET, F_CAPTURE, F_DOUBLE, F_EP, F_CASTLE_K, F_CASTLE_Q = 0, 1, 2, 3, 4, 5
local KNIGHT_OFF = { -33, -31, -18, -14, 14, 18, 31, 33 }
local KING_OFF = { -17, -16, -15, -1, 1, 15, 16, 17 }
local BISHOP_OFF = { -17, -15, 15, 17 }
local ROOK_OFF = { -16, -1, 1, 16 }
local MATE, INF = 30000, 32000
local MATE_BOUND = MATE - 512
local MAX_PLY = 64
local PIECE_VALUE = { 100, 320, 330, 500, 950, 20000 }
local PHASE = { 0, 1, 1, 2, 4, 0 }
local TYPE_OF = { p = PAWN, n = KNIGHT, b = BISHOP, r = ROOK, q = QUEEN, k = KING }
local CHAR_OF = { "p", "n", "b", "r", "q", "k" }

local function encode(from: number, to: number, promo: number, flag: number): number
	return from + to * 128 + promo * 16384 + flag * 131072
end
local function mFrom(m: number): number
	return m % 128
end
local function mTo(m: number): number
	return (m // 128) % 128
end
local function mPromo(m: number): number
	return (m // 16384) % 8
end
local function mFlag(m: number): number
	return m // 131072
end
local function off(sq: number): boolean
	return band(sq, 0x88) ~= 0
end
local function squareName(sq: number): string
	return string.char(97 + sq % 16) .. tostring(8 - sq // 16)
end
local function parseSquare(name: string): number
	return (8 - tonumber(string.sub(name, 2, 2)) :: number) * 16 + (string.byte(name, 1) - 97)
end

-- castling rights: 1 white king side, 2 white queen side, 4 black king side, 8 black queen side
local CASTLE_MASK = table.create(128, 15)
CASTLE_MASK[116 + 1], CASTLE_MASK[119 + 1], CASTLE_MASK[112 + 1] = 12, 14, 13
CASTLE_MASK[4 + 1], CASTLE_MASK[7 + 1], CASTLE_MASK[0 + 1] = 3, 11, 7

-- deterministic Zobrist keys (two 32-bit halves)
local seed = 0x9e3779b9
local function rnd(): number
	seed = bxor(seed, lshift(seed, 13))
	seed = bxor(seed, rshift(seed, 17))
	seed = bxor(seed, lshift(seed, 5))
	return seed
end
local Z_LO, Z_HI = table.create(16 * 128, 0), table.create(16 * 128, 0)
for i = 1, 16 * 128 do
	Z_LO[i], Z_HI[i] = rnd(), rnd()
end
local Z_SIDE_LO, Z_SIDE_HI = rnd(), rnd()
local Z_CASTLE_LO, Z_CASTLE_HI = table.create(16, 0), table.create(16, 0)
for i = 1, 16 do
	Z_CASTLE_LO[i], Z_CASTLE_HI[i] = rnd(), rnd()
end
local Z_EP_LO, Z_EP_HI = table.create(8, 0), table.create(8, 0)
for i = 1, 8 do
	Z_EP_LO[i], Z_EP_HI[i] = rnd(), rnd()
end

-- signed (white-positive) piece-square values by piece code and square
local PSQ_MG, PSQ_EG = table.create(16 * 128, 0), table.create(16 * 128, 0)
for color = 0, 1 do
	for t = PAWN, KING do
		for sq = 0, 127 do
			if not off(sq) then
				local row, file = sq // 16, sq % 16
				local rel = if color == 0 then 7 - row else row
				local idx = (t - 1) * 64 + rel * 8 + file + 1
				local sign = if color == 0 then 1 else -1
				local code = t + color * 8
				PSQ_MG[code * 128 + sq + 1] = sign * Weights.mg[idx]
				PSQ_EG[code * 128 + sq + 1] = sign * Weights.eg[idx]
			end
		end
	end
end

local ChessCore = {}
ChessCore.START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
ChessCore.encode, ChessCore.mFrom, ChessCore.mTo, ChessCore.mPromo, ChessCore.mFlag = encode, mFrom, mTo, mPromo, mFlag
ChessCore.squareName, ChessCore.parseSquare = squareName, parseSquare
ChessCore.PAWN, ChessCore.KNIGHT, ChessCore.BISHOP, ChessCore.ROOK, ChessCore.QUEEN, ChessCore.KING =
	PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING

function ChessCore.new(fen: string?)
	local G = {}
	local b = table.create(128, 0) -- b[sq + 1]
	local kings = { 0, 0 } -- kings[color + 1]
	local side, castle, ep, half, fullmove = 0, 0, -1, 0, 1
	local hashLo, hashHi = 0, 0
	local mg, eg, phase = 0, 0, 0
	local bishops = { 0, 0 }
	-- undo stack
	local uMove, uCap, uCastle, uEp, uHalf, uLo, uHi, uMg, uEg, uPhase = {}, {}, {}, {}, {}, {}, {}, {}, {}, {}
	local sp = 0
	-- position keys: game history + search path (for repetition)
	local keyLo, keyHi = {}, {}
	local keyCount = 0

	local function epActive(): boolean
		if ep < 0 then
			return false
		end
		local pawn = if side == 0 then PAWN else PAWN + 8
		local from = ep + (if side == 0 then 16 else -16)
		return (not off(from - 1) and b[from - 1 + 1] == pawn) or (not off(from + 1) and b[from + 1 + 1] == pawn)
	end

	local function computeHash()
		local lo, hi = 0, 0
		for sq = 0, 127 do
			if not off(sq) then
				local p = b[sq + 1]
				if p ~= 0 then
					lo = bxor(lo, Z_LO[p * 128 + sq + 1])
					hi = bxor(hi, Z_HI[p * 128 + sq + 1])
				end
			end
		end
		if side == 1 then
			lo, hi = bxor(lo, Z_SIDE_LO), bxor(hi, Z_SIDE_HI)
		end
		lo, hi = bxor(lo, Z_CASTLE_LO[castle + 1]), bxor(hi, Z_CASTLE_HI[castle + 1])
		if epActive() then
			lo, hi = bxor(lo, Z_EP_LO[ep % 16 + 1]), bxor(hi, Z_EP_HI[ep % 16 + 1])
		end
		hashLo, hashHi = lo, hi
	end

	local function load(text: string)
		local parts = string.split(text, " ")
		for i = 1, 128 do
			b[i] = 0
		end
		bishops[1], bishops[2] = 0, 0
		local sq = 0
		for ch in string.gmatch(parts[1], ".") do
			if ch == "/" then
				sq += 8
			elseif tonumber(ch) then
				sq += tonumber(ch) :: number
			else
				local lower = string.lower(ch)
				local color = if ch == lower then 1 else 0
				local t = TYPE_OF[lower]
				b[sq + 1] = t + color * 8
				if t == KING then
					kings[color + 1] = sq
				end
				sq += 1
			end
		end
		side = if parts[2] == "b" then 1 else 0
		castle = 0
		local rights = parts[3] or "-"
		if string.find(rights, "K", 1, true) then castle += 1 end
		if string.find(rights, "Q", 1, true) then castle += 2 end
		if string.find(rights, "k", 1, true) then castle += 4 end
		if string.find(rights, "q", 1, true) then castle += 8 end
		if b[116 + 1] ~= KING or b[119 + 1] ~= ROOK then castle = band(castle, 14) end
		if b[116 + 1] ~= KING or b[112 + 1] ~= ROOK then castle = band(castle, 13) end
		if b[4 + 1] ~= KING + 8 or b[7 + 1] ~= ROOK + 8 then castle = band(castle, 11) end
		if b[4 + 1] ~= KING + 8 or b[0 + 1] ~= ROOK + 8 then castle = band(castle, 7) end
		ep = if parts[4] and parts[4] ~= "-" then parseSquare(parts[4]) else -1
		half = tonumber(parts[5]) or 0
		fullmove = tonumber(parts[6]) or 1
		computeHash()
		mg, eg, phase = 0, 0, 0
		for s = 0, 127 do
			local p = if off(s) then 0 else b[s + 1]
			if p ~= 0 then
				mg += PSQ_MG[p * 128 + s + 1]
				eg += PSQ_EG[p * 128 + s + 1]
				phase += PHASE[p % 8]
				if p % 8 == BISHOP then
					bishops[p // 8 + 1] += 1
				end
			end
		end
		sp = 0
		keyCount = 1
		keyLo[1], keyHi[1] = hashLo, hashHi
	end

	local function isAttacked(sq: number, by: number): boolean
		if by == 0 then
			if not off(sq + 15) and b[sq + 15 + 1] == PAWN then return true end
			if not off(sq + 17) and b[sq + 17 + 1] == PAWN then return true end
		else
			if not off(sq - 15) and b[sq - 15 + 1] == PAWN + 8 then return true end
			if not off(sq - 17) and b[sq - 17 + 1] == PAWN + 8 then return true end
		end
		local c = by * 8
		local knight, king, bishop, rook, queen = KNIGHT + c, KING + c, BISHOP + c, ROOK + c, QUEEN + c
		for i = 1, 8 do
			local t = sq + KNIGHT_OFF[i]
			if not off(t) and b[t + 1] == knight then return true end
		end
		for i = 1, 8 do
			local t = sq + KING_OFF[i]
			if not off(t) and b[t + 1] == king then return true end
		end
		for i = 1, 4 do
			local d = BISHOP_OFF[i]
			local t = sq + d
			while not off(t) do
				local p = b[t + 1]
				if p ~= 0 then
					if p == bishop or p == queen then return true end
					break
				end
				t += d
			end
		end
		for i = 1, 4 do
			local d = ROOK_OFF[i]
			local t = sq + d
			while not off(t) do
				local p = b[t + 1]
				if p ~= 0 then
					if p == rook or p == queen then return true end
					break
				end
				t += d
			end
		end
		return false
	end

	local function inCheck(): boolean
		return isAttacked(kings[side + 1], 1 - side)
	end

	local unmake
	-- applies a pseudo-legal move; returns false (already undone) if it leaves the mover in check
	local function make(m: number): boolean
		local from, to, flag, promo = mFrom(m), mTo(m), mFlag(m), mPromo(m)
		local piece = b[from + 1]
		local us = side
		local them = 1 - us
		sp += 1
		uMove[sp], uCastle[sp], uEp[sp], uHalf[sp], uLo[sp], uHi[sp] = m, castle, ep, half, hashLo, hashHi
		uMg[sp], uEg[sp], uPhase[sp] = mg, eg, phase
		local lo, hi = hashLo, hashHi
		if epActive() then
			lo, hi = bxor(lo, Z_EP_LO[ep % 16 + 1]), bxor(hi, Z_EP_HI[ep % 16 + 1])
		end
		local captured, capSq = 0, to
		if flag == F_EP then
			capSq = to + (if us == 0 then 16 else -16)
			captured = b[capSq + 1]
			b[capSq + 1] = 0
		else
			captured = b[to + 1]
		end
		uCap[sp] = captured
		if captured ~= 0 then
			lo, hi = bxor(lo, Z_LO[captured * 128 + capSq + 1]), bxor(hi, Z_HI[captured * 128 + capSq + 1])
			mg -= PSQ_MG[captured * 128 + capSq + 1]
			eg -= PSQ_EG[captured * 128 + capSq + 1]
			phase -= PHASE[captured % 8]
			if captured % 8 == BISHOP then
				bishops[them + 1] -= 1
			end
		end
		b[from + 1] = 0
		lo, hi = bxor(lo, Z_LO[piece * 128 + from + 1]), bxor(hi, Z_HI[piece * 128 + from + 1])
		local placed = if promo ~= 0 then promo + us * 8 else piece
		b[to + 1] = placed
		mg += PSQ_MG[placed * 128 + to + 1] - PSQ_MG[piece * 128 + from + 1]
		eg += PSQ_EG[placed * 128 + to + 1] - PSQ_EG[piece * 128 + from + 1]
		lo, hi = bxor(lo, Z_LO[placed * 128 + to + 1]), bxor(hi, Z_HI[placed * 128 + to + 1])
		if promo ~= 0 then
			phase += PHASE[promo]
			if promo == BISHOP then
				bishops[us + 1] += 1
			end
		end
		if piece % 8 == KING then
			kings[us + 1] = to
			if flag == F_CASTLE_K or flag == F_CASTLE_Q then
				local rf = if flag == F_CASTLE_K then to + 1 else to - 2
				local rt = if flag == F_CASTLE_K then to - 1 else to + 1
				local rook = ROOK + us * 8
				b[rf + 1], b[rt + 1] = 0, rook
				mg += PSQ_MG[rook * 128 + rt + 1] - PSQ_MG[rook * 128 + rf + 1]
				eg += PSQ_EG[rook * 128 + rt + 1] - PSQ_EG[rook * 128 + rf + 1]
				lo = bxor(lo, bxor(Z_LO[rook * 128 + rf + 1], Z_LO[rook * 128 + rt + 1]))
				hi = bxor(hi, bxor(Z_HI[rook * 128 + rf + 1], Z_HI[rook * 128 + rt + 1]))
			end
		end
		local newCastle = band(castle, band(CASTLE_MASK[from + 1], CASTLE_MASK[to + 1]))
		if newCastle ~= castle then
			lo = bxor(lo, bxor(Z_CASTLE_LO[castle + 1], Z_CASTLE_LO[newCastle + 1]))
			hi = bxor(hi, bxor(Z_CASTLE_HI[castle + 1], Z_CASTLE_HI[newCastle + 1]))
			castle = newCastle
		end
		ep = if flag == F_DOUBLE then (from + to) // 2 else -1
		half = if piece % 8 == PAWN or captured ~= 0 then 0 else half + 1
		side = them
		lo, hi = bxor(lo, Z_SIDE_LO), bxor(hi, Z_SIDE_HI)
		if ep >= 0 and epActive() then
			lo, hi = bxor(lo, Z_EP_LO[ep % 16 + 1]), bxor(hi, Z_EP_HI[ep % 16 + 1])
		end
		hashLo, hashHi = lo, hi
		if isAttacked(kings[us + 1], them) then
			unmake(false)
			return false
		end
		keyCount += 1
		keyLo[keyCount], keyHi[keyCount] = hashLo, hashHi
		return true
	end

	function unmake(popKey: boolean?)
		local m = uMove[sp]
		local from, to, flag, promo = mFrom(m), mTo(m), mFlag(m), mPromo(m)
		side = 1 - side
		local us = side
		local placed = b[to + 1]
		local piece = if promo ~= 0 then PAWN + us * 8 else placed
		b[from + 1] = piece
		b[to + 1] = 0
		local captured = uCap[sp]
		if flag == F_EP then
			b[to + (if us == 0 then 16 else -16) + 1] = captured
		else
			b[to + 1] = captured
		end
		if captured % 8 == BISHOP and captured ~= 0 then
			bishops[1 - us + 1] += 1
		end
		if promo == BISHOP then
			bishops[us + 1] -= 1
		end
		if piece % 8 == KING then
			kings[us + 1] = from
			if flag == F_CASTLE_K or flag == F_CASTLE_Q then
				local rf = if flag == F_CASTLE_K then to + 1 else to - 2
				local rt = if flag == F_CASTLE_K then to - 1 else to + 1
				b[rf + 1], b[rt + 1] = b[rt + 1], 0
			end
		end
		castle, ep, half, hashLo, hashHi = uCastle[sp], uEp[sp], uHalf[sp], uLo[sp], uHi[sp]
		mg, eg, phase = uMg[sp], uEg[sp], uPhase[sp]
		sp -= 1
		if popKey ~= false then
			keyCount -= 1
		end
	end

	local function makeNull()
		sp += 1
		uMove[sp], uCastle[sp], uEp[sp], uHalf[sp], uLo[sp], uHi[sp] = 0, castle, ep, half, hashLo, hashHi
		uMg[sp], uEg[sp], uPhase[sp], uCap[sp] = mg, eg, phase, 0
		if epActive() then
			hashLo, hashHi = bxor(hashLo, Z_EP_LO[ep % 16 + 1]), bxor(hashHi, Z_EP_HI[ep % 16 + 1])
		end
		ep, half = -1, 0
		side = 1 - side
		hashLo, hashHi = bxor(hashLo, Z_SIDE_LO), bxor(hashHi, Z_SIDE_HI)
		keyCount += 1
		keyLo[keyCount], keyHi[keyCount] = hashLo, hashHi
	end
	local function unmakeNull()
		side = 1 - side
		castle, ep, half, hashLo, hashHi = uCastle[sp], uEp[sp], uHalf[sp], uLo[sp], uHi[sp]
		sp -= 1
		keyCount -= 1
	end

	-- pseudo-legal moves appended to list from index n+1; returns the new count
	local function generate(list: { number }, n: number, capturesOnly: boolean): number
		local us = side
		local them = 1 - us
		local fwd = if us == 0 then -16 else 16
		local startRow = if us == 0 then 6 else 1
		local promoRow = if us == 0 then 0 else 7
		for sq = 0, 119 do
			if not off(sq) then
				local p = b[sq + 1]
				if p ~= 0 and p // 8 == us then
					local t = p % 8
					if t == PAWN then
						local one = sq + fwd
						if not off(one) and b[one + 1] == 0 then
							if one // 16 == promoRow then
								n += 1; list[n] = encode(sq, one, QUEEN, F_QUIET)
								if not capturesOnly then
									n += 1; list[n] = encode(sq, one, KNIGHT, F_QUIET)
									n += 1; list[n] = encode(sq, one, ROOK, F_QUIET)
									n += 1; list[n] = encode(sq, one, BISHOP, F_QUIET)
								end
							elseif not capturesOnly then
								n += 1; list[n] = encode(sq, one, 0, F_QUIET)
								local two = one + fwd
								if sq // 16 == startRow and b[two + 1] == 0 then
									n += 1; list[n] = encode(sq, two, 0, F_DOUBLE)
								end
							end
						end
						for dx = -1, 1, 2 do
							local to = one + dx
							if not off(to) then
								local target = b[to + 1]
								if target ~= 0 and target // 8 == them then
									if to // 16 == promoRow then
										n += 1; list[n] = encode(sq, to, QUEEN, F_CAPTURE)
										if not capturesOnly then
											n += 1; list[n] = encode(sq, to, KNIGHT, F_CAPTURE)
											n += 1; list[n] = encode(sq, to, ROOK, F_CAPTURE)
											n += 1; list[n] = encode(sq, to, BISHOP, F_CAPTURE)
										end
									else
										n += 1; list[n] = encode(sq, to, 0, F_CAPTURE)
									end
								elseif to == ep and target == 0 then
									n += 1; list[n] = encode(sq, to, 0, F_EP)
								end
							end
						end
					elseif t == KNIGHT or t == KING then
						local offsets = if t == KNIGHT then KNIGHT_OFF else KING_OFF
						for i = 1, 8 do
							local to = sq + offsets[i]
							if not off(to) then
								local target = b[to + 1]
								if target == 0 then
									if not capturesOnly then
										n += 1; list[n] = encode(sq, to, 0, F_QUIET)
									end
								elseif target // 8 == them then
									n += 1; list[n] = encode(sq, to, 0, F_CAPTURE)
								end
							end
						end
						if t == KING and not capturesOnly then
							if us == 0 and sq == 116 then
								if band(castle, 1) ~= 0 and b[117 + 1] == 0 and b[118 + 1] == 0 and b[119 + 1] == ROOK
									and not isAttacked(116, 1) and not isAttacked(117, 1) and not isAttacked(118, 1) then
									n += 1; list[n] = encode(116, 118, 0, F_CASTLE_K)
								end
								if band(castle, 2) ~= 0 and b[115 + 1] == 0 and b[114 + 1] == 0 and b[113 + 1] == 0
									and b[112 + 1] == ROOK and not isAttacked(116, 1) and not isAttacked(115, 1)
									and not isAttacked(114, 1) then
									n += 1; list[n] = encode(116, 114, 0, F_CASTLE_Q)
								end
							elseif us == 1 and sq == 4 then
								if band(castle, 4) ~= 0 and b[5 + 1] == 0 and b[6 + 1] == 0 and b[7 + 1] == ROOK + 8
									and not isAttacked(4, 0) and not isAttacked(5, 0) and not isAttacked(6, 0) then
									n += 1; list[n] = encode(4, 6, 0, F_CASTLE_K)
								end
								if band(castle, 8) ~= 0 and b[3 + 1] == 0 and b[2 + 1] == 0 and b[1 + 1] == 0
									and b[0 + 1] == ROOK + 8 and not isAttacked(4, 0) and not isAttacked(3, 0)
									and not isAttacked(2, 0) then
									n += 1; list[n] = encode(4, 2, 0, F_CASTLE_Q)
								end
							end
						end
					else
						local offsets = if t == BISHOP then BISHOP_OFF elseif t == ROOK then ROOK_OFF else KING_OFF
						for i = 1, #offsets do
							local d = offsets[i]
							local to = sq + d
							while not off(to) do
								local target = b[to + 1]
								if target == 0 then
									if not capturesOnly then
										n += 1; list[n] = encode(sq, to, 0, F_QUIET)
									end
								else
									if target // 8 == them then
										n += 1; list[n] = encode(sq, to, 0, F_CAPTURE)
									end
									break
								end
								to += d
							end
						end
					end
				end
			end
		end
		return n
	end

	local function legalMoves(): { number }
		local list, out = {}, {}
		local n = generate(list, 0, false)
		for i = 1, n do
			if make(list[i]) then
				unmake()
				table.insert(out, list[i])
			end
		end
		return out
	end

	local function hasLegalMove(): boolean
		local list = {}
		local n = generate(list, 0, false)
		for i = 1, n do
			if make(list[i]) then
				unmake()
				return true
			end
		end
		return false
	end

	local function insufficientMaterial(): boolean
		local minors, others = 0, 0
		for sq = 0, 119 do
			if not off(sq) then
				local p = b[sq + 1]
				local t = p % 8
				if t == PAWN or t == ROOK or t == QUEEN then
					others += 1
				elseif t == KNIGHT or t == BISHOP then
					minors += 1
				end
			end
		end
		return others == 0 and minors <= 1
	end

	local function repetitions(): number
		local count = 0
		local i = keyCount
		while i >= 1 do
			if keyLo[i] == hashLo and keyHi[i] == hashHi then
				count += 1
			end
			i -= 1
		end
		return count
	end

	---------------------------------------------------------------- public rules API
	function G.load(text: string)
		load(text)
	end
	function G.legalMoves(): { number }
		return legalMoves()
	end
	function G.inCheck(): boolean
		return inCheck()
	end
	function G.turn(): number
		return side
	end
	function G.pieceAt(sq: number): number
		return if off(sq) then 0 else b[sq + 1]
	end
	function G.kingSquare(color: number): number
		return kings[color + 1]
	end
	-- plays a legal move (returns false if illegal); the game history keeps it for repetition
	function G.play(m: number): boolean
		for _, legal in legalMoves() do
			if legal == m then
				make(m)
				if side == 0 then
					fullmove += 1
				end
				return true
			end
		end
		return false
	end
	function G.undo()
		if sp > 0 then
			if side == 0 then
				fullmove -= 1
			end
			unmake()
		end
	end
	-- "play" | "checkmate" | "stalemate" | "fifty" | "repetition" | "material"
	function G.status(): string
		if not hasLegalMove() then
			return if inCheck() then "checkmate" else "stalemate"
		end
		if half >= 100 then
			return "fifty"
		end
		if repetitions() >= 3 then
			return "repetition"
		end
		if insufficientMaterial() then
			return "material"
		end
		return "play"
	end
	-- find the legal move from->to (promotion piece optional, defaults to queen)
	function G.findMove(from: number, to: number, promo: number?): number?
		local fallback = nil
		for _, m in legalMoves() do
			if mFrom(m) == from and mTo(m) == to then
				local p = mPromo(m)
				if p == 0 or p == (promo or QUEEN) then
					return m
				end
				fallback = fallback or m
			end
		end
		return fallback
	end
	function G.san(m: number): string
		local from, to, flag, promo = mFrom(m), mTo(m), mFlag(m), mPromo(m)
		local piece = b[from + 1]
		local t = piece % 8
		local s
		if flag == F_CASTLE_K then
			s = "O-O"
		elseif flag == F_CASTLE_Q then
			s = "O-O-O"
		else
			local capture = flag == F_CAPTURE or flag == F_EP
			if t == PAWN then
				s = (if capture then string.sub(squareName(from), 1, 1) .. "x" else "") .. squareName(to)
				if promo ~= 0 then
					s ..= "=" .. string.upper(CHAR_OF[promo])
				end
			else
				local sameFile, sameRank, ambiguous = false, false, false
				for _, other in legalMoves() do
					if other ~= m and mTo(other) == to and b[mFrom(other) + 1] == piece then
						ambiguous = true
						if mFrom(other) % 16 == from % 16 then sameFile = true end
						if mFrom(other) // 16 == from // 16 then sameRank = true end
					end
				end
				local dis = ""
				if ambiguous then
					local name = squareName(from)
					dis = if not sameFile then string.sub(name, 1, 1)
						elseif not sameRank then string.sub(name, 2, 2)
						else name
				end
				s = string.upper(CHAR_OF[t]) .. dis .. (if capture then "x" else "") .. squareName(to)
			end
		end
		if make(m) then
			if inCheck() then
				s ..= if hasLegalMove() then "+" else "#"
			end
			unmake()
		end
		return s
	end
	function G.fen(): string
		local rows = {}
		for row = 0, 7 do
			local line, empty = "", 0
			for file = 0, 7 do
				local p = b[row * 16 + file + 1]
				if p == 0 then
					empty += 1
				else
					if empty > 0 then
						line ..= tostring(empty)
						empty = 0
					end
					local ch = CHAR_OF[p % 8]
					line ..= if p // 8 == 0 then string.upper(ch) else ch
				end
			end
			if empty > 0 then
				line ..= tostring(empty)
			end
			table.insert(rows, line)
		end
		local rights = (if band(castle, 1) ~= 0 then "K" else "") .. (if band(castle, 2) ~= 0 then "Q" else "")
			.. (if band(castle, 4) ~= 0 then "k" else "") .. (if band(castle, 8) ~= 0 then "q" else "")
		return table.concat(rows, "/") .. " " .. (if side == 0 then "w" else "b") .. " "
			.. (if rights == "" then "-" else rights) .. " " .. (if ep >= 0 then squareName(ep) else "-") .. " "
			.. tostring(half) .. " " .. tostring(fullmove)
	end
	function G.perft(depth: number): number
		if depth == 0 then
			return 1
		end
		local list = {}
		local n = generate(list, 0, false)
		local total = 0
		for i = 1, n do
			if make(list[i]) then
				total += if depth == 1 then 1 else G.perft(depth - 1)
				unmake()
			end
		end
		return total
	end

	---------------------------------------------------------------- evaluation + search (the bot)
	local bp, tempo = Weights.bishopPair, Weights.tempo
	local function evaluate(): number
		local m, e = mg, eg
		if bishops[1] >= 2 then m += bp[1]; e += bp[2] end
		if bishops[2] >= 2 then m -= bp[1]; e -= bp[2] end
		local ph = math.min(phase, 24)
		local score = (m * ph + e * (24 - ph)) // 24
		if side == 1 then
			score = -score
		end
		return score + tempo[1]
	end

	-- transposition table in a buffer (16 bytes/entry): lo u32, hi u32, move i32, score i16, depth i8, flag u8
	local TT_ENTRIES = 131072
	local tt: buffer? = nil
	local nodes, deadline, stopped, lastYield, yielding = 0, 0, false, 0, false
	local killers = table.create(MAX_PLY * 2 + 4, 0)
	local hist = table.create(16 * 128, 0)
	local moveLists, scoreLists = {}, {}
	for i = 1, MAX_PLY + 4 do
		moveLists[i], scoreLists[i] = {}, {}
	end
	local rootBest = 0

	local function checkTime()
		if band(nodes, 1023) == 0 then
			local now = os.clock()
			if now > deadline then
				stopped = true
			elseif yielding and now - lastYield > 0.010 then
				task.wait() -- let the server run other things, then keep thinking
				lastYield = os.clock()
			end
		end
	end

	local function scoreMoves(list: { number }, scores: { number }, n: number, ttm: number, ply: number)
		local k1, k2 = killers[ply * 2 + 1], killers[ply * 2 + 2]
		for i = 1, n do
			local m = list[i]
			local s
			if m == ttm then
				s = 10000000
			else
				local to = mTo(m)
				local victim = if mFlag(m) == F_EP then PAWN else b[to + 1] % 8
				if victim ~= 0 then
					s = 1000000 + victim * 16 - b[mFrom(m) + 1] % 8 -- most valuable victim, least valuable attacker
				elseif mPromo(m) ~= 0 then
					s = 900000 + mPromo(m)
				elseif m == k1 then
					s = 800000
				elseif m == k2 then
					s = 700000
				else
					s = hist[b[mFrom(m) + 1] * 128 + to + 1]
				end
			end
			scores[i] = s
		end
	end

	local function pick(list: { number }, scores: { number }, i: number, n: number): number
		local best, bi = scores[i], i
		for j = i + 1, n do
			if scores[j] > best then
				best, bi = scores[j], j
			end
		end
		if bi ~= i then
			list[i], list[bi] = list[bi], list[i]
			scores[i], scores[bi] = scores[bi], scores[i]
		end
		return list[i]
	end

	local function qsearch(alpha: number, beta: number, ply: number): number
		nodes += 1
		checkTime()
		if stopped then
			return 0
		end
		local stand = evaluate()
		if stand >= beta then
			return stand
		end
		if stand > alpha then
			alpha = stand
		end
		if ply >= MAX_PLY then
			return stand
		end
		local list, scores = moveLists[ply + 1], scoreLists[ply + 1]
		local n = generate(list, 0, true)
		scoreMoves(list, scores, n, 0, ply)
		for i = 1, n do
			local m = pick(list, scores, i, n)
			local victim = if mFlag(m) == F_EP then PAWN else b[mTo(m) + 1] % 8
			-- delta pruning: a capture that can't lift the score to alpha isn't worth searching
			if not (victim ~= 0 and mPromo(m) == 0 and stand + PIECE_VALUE[victim] + 200 < alpha) then
				if make(m) then
					local score = -qsearch(-beta, -alpha, ply + 1)
					unmake()
					if stopped then
						return 0
					end
					if score >= beta then
						return score
					end
					if score > alpha then
						alpha = score
					end
				end
			end
		end
		return alpha
	end

	local function search(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number
		if ply > 0 then
			if half >= 100 then
				return 0
			end
			-- repetition of any earlier position (same side to move) since the last irreversible move
			local i = keyCount - 2
			local limit = keyCount - half
			while i >= 1 and i >= limit do
				if keyLo[i] == hashLo and keyHi[i] == hashHi then
					return 0
				end
				i -= 2
			end
		end
		local check = inCheck()
		if check then
			depth += 1
		end
		if depth <= 0 then
			return qsearch(alpha, beta, ply)
		end
		nodes += 1
		checkTime()
		if stopped then
			return 0
		end
		if ply >= MAX_PLY then
			return evaluate()
		end
		alpha = math.max(alpha, -MATE + ply)
		beta = math.min(beta, MATE - ply - 1)
		if alpha >= beta then
			return alpha
		end
		local pv = beta - alpha > 1
		local t = tt :: buffer
		local o = (hashLo % TT_ENTRIES) * 16
		local ttm = 0
		if buffer.readu32(t, o) == hashLo and buffer.readu32(t, o + 4) == hashHi then
			ttm = buffer.readi32(t, o + 8)
			if not pv and ply > 0 and buffer.readi8(t, o + 14) >= depth then
				local ts = buffer.readi16(t, o + 12)
				if ts > MATE_BOUND then
					ts -= ply
				elseif ts < -MATE_BOUND then
					ts += ply
				end
				local tf = buffer.readu8(t, o + 15)
				if tf == 1 or (tf == 2 and ts >= beta) or (tf == 3 and ts <= alpha) then
					return ts
				end
			end
		end
		local staticEval = evaluate()
		-- reverse futility: far above beta at low depth
		if not pv and not check and depth <= 3 and staticEval - 120 * depth >= beta then
			return staticEval
		end
		-- null move: if passing still beats beta, this position is good enough
		if allowNull and not pv and not check and depth >= 3 and staticEval >= beta and phase > 2 then
			makeNull()
			local r = if depth >= 6 then 3 else 2
			local score = -search(depth - 1 - r, -beta, -beta + 1, ply + 1, false)
			unmakeNull()
			if stopped then
				return 0
			end
			if score >= beta then
				return if score > MATE_BOUND then beta else score
			end
		end
		local list, scores = moveLists[ply + 1], scoreLists[ply + 1]
		local n = generate(list, 0, false)
		scoreMoves(list, scores, n, ttm, ply)
		local best, bestMove, legal = -INF, 0, 0
		local origAlpha = alpha
		for i = 1, n do
			local m = pick(list, scores, i, n)
			local flag = mFlag(m)
			local quiet = flag ~= F_CAPTURE and flag ~= F_EP and mPromo(m) == 0
			local mover = b[mFrom(m) + 1]
			if make(m) then
				legal += 1
				local score
				if legal == 1 then
					score = -search(depth - 1, -beta, -alpha, ply + 1, true)
				else
					local r = 0
					if quiet and depth >= 3 and legal > 3 and not check and not inCheck() then
						r = if legal > 8 then 2 else 1
						if pv then
							r -= 1
						end
					end
					score = -search(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true)
					if score > alpha and (r > 0 or score < beta) then
						score = -search(depth - 1, -beta, -alpha, ply + 1, true)
					end
				end
				unmake()
				if stopped then
					return 0
				end
				if score > best then
					best, bestMove = score, m
					if ply == 0 then
						rootBest = m
					end
					if score > alpha then
						alpha = score
						if alpha >= beta then
							if quiet then
								if killers[ply * 2 + 1] ~= m then
									killers[ply * 2 + 2] = killers[ply * 2 + 1]
									killers[ply * 2 + 1] = m
								end
								local hi = mover * 128 + mTo(m) + 1
								hist[hi] = math.min(hist[hi] + depth * depth, 600000)
							end
							break
						end
					end
				end
			end
		end
		if legal == 0 then
			return if check then -MATE + ply else 0
		end
		local flagOut = if best >= beta then 2 elseif best > origAlpha then 1 else 3
		local ss = best
		if ss > MATE_BOUND then
			ss += ply
		elseif ss < -MATE_BOUND then
			ss -= ply
		end
		buffer.writeu32(t, o, hashLo)
		buffer.writeu32(t, o + 4, hashHi)
		buffer.writei32(t, o + 8, bestMove)
		buffer.writei16(t, o + 12, math.clamp(ss, -32000, 32000))
		buffer.writei8(t, o + 14, math.clamp(depth, -100, 100))
		buffer.writeu8(t, o + 15, flagOut)
		return best
	end

	-- think about the current position. opts: time (seconds), depth (max), yield (default true)
	-- returns move, score (side to move, centipawns), completed depth, nodes
	function G.search(opts: { time: number?, depth: number?, yield: boolean? }?): (number?, number, number, number)
		local o = opts or {}
		if not tt then
			tt = buffer.create(TT_ENTRIES * 16)
		end
		local moves = legalMoves()
		if #moves == 0 then
			return nil, 0, 0, 0
		end
		if #moves == 1 then
			return moves[1], 0, 0, 0
		end
		yielding = o.yield ~= false
		local maxTime = o.time or 1
		deadline = os.clock() + maxTime
		lastYield = os.clock()
		stopped, nodes = false, 0
		for i = 1, #hist do
			hist[i] //= 4
		end
		for i = 1, #killers do
			killers[i] = 0
		end
		local bestMove, bestScore, done = moves[1], 0, 0
		for d = 1, o.depth or 64 do
			rootBest = 0
			local score = search(d, -INF, INF, 0, false)
			if stopped then
				break
			end
			if rootBest ~= 0 then
				bestMove, bestScore, done = rootBest, score, d
			end
			if math.abs(score) > MATE_BOUND then
				break -- found a forced mate
			end
		end
		return bestMove, bestScore, done, nodes
	end
	function G.evaluate(): number
		return evaluate()
	end

	load(fen or ChessCore.START)
	return G
end

return ChessCore
