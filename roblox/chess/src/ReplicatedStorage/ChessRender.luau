-- ChessRender: draws one table's pieces on this client from the table's published state, animates moves
-- (pieces hop to their square, knights jump higher, captured pieces pop off to the side of the board), shows
-- highlights (last move, check, selection, legal targets) and maps screen taps to squares.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local ChessCore = require(ReplicatedStorage:WaitForChild("ChessCore"))
local templates = ReplicatedStorage:WaitForChild("ChessTemplates")

local Render = {}
Render.__index = Render

local SQ = 1.5
local KIND = { "Pawn", "Knight", "Bishop", "Rook", "Queen", "King" }
local START_COUNT = { 8, 2, 2, 2, 1, 0 } -- pieces per side at the start (kings are never captured)
local VALUE_ORDER = { 1, 2, 3, 4, 5 }
local TABLE_DROP = 0.25 -- the table top is this far below the board surface
local GRAVE_SCALE = 0.55

-- every running animation, keyed by model
local anims: { [Model]: any } = {}

local function ease(a: number): number
	return a * a * (3 - 2 * a)
end

local function setFade(model: Model, f: number)
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") and p.Name ~= "Base" then
			p.Transparency = f
		end
	end
end

-- advance every animation to time `now` (runs every frame; tests call it directly)
function Render.step(now: number)
	for model, a in anims do
		if now < a.t0 then
			continue
		end
		local t = math.clamp((now - a.t0) / a.dur, 0, 1)
		local e = ease(t)
		local cf = a.from:Lerp(a.to, e) + Vector3.new(0, a.height * 4 * t * (1 - t), 0)
		if model.Parent then
			model:PivotTo(cf)
			if a.fade then
				setFade(model, t)
			end
		end
		if t >= 1 then
			anims[model] = nil
			if a.done then
				task.spawn(a.done)
			end
		end
	end
end
local frameSignal = if RunService:IsClient() then RunService.RenderStepped else RunService.Heartbeat
frameSignal:Connect(function()
	Render.step(os.clock())
end)

local function animate(model: Model, to: CFrame, dur: number, height: number, delay: number?, done: (() -> ())?,
	fade: boolean?)
	anims[model] = {
		from = model:GetPivot(),
		to = to,
		t0 = os.clock() + (delay or 0),
		dur = dur,
		height = height,
		done = done,
		fade = fade,
	}
end
Render.animate = animate

local function colorOf(code: number): number
	return if code >= 8 then 1 else 0
end

function Render.new(model: Model, parent: Instance)
	local board = model:WaitForChild("Board")
	local center = board:WaitForChild("Center") :: BasePart
	local folder = Instance.new("Folder")
	folder.Name = model.Name
	folder.Parent = parent
	local fx = Instance.new("Folder")
	fx.Name = "Fx"
	fx.Parent = folder
	local self = setmetatable({
		model = model,
		center = CFrame.new(center.Position) * center.CFrame.Rotation,
		folder = folder,
		fx = fx,
		G = ChessCore.new(),
		pieces = {} :: { [number]: any }, -- [square] = { code, model }
		grave = {} :: { any },
		graveKey = "",
		flip = false,
		ply = -1,
		fen = "",
		plates = {} :: { [string]: BasePart },
	}, Render)
	return self
end

-- square (0x88) -> position relative to the board centre (white at +Z unless flipped)
function Render:localPos(sq: number): Vector3
	local file, row = sq % 16, sq // 16
	local x, z = (file - 3.5) * SQ, (row - 3.5) * SQ
	if self.flip then
		x, z = -x, -z
	end
	return Vector3.new(x, 0, z)
end

function Render:squareCF(sq: number, code: number): CFrame
	local yaw = if (colorOf(code) == 1) ~= self.flip then math.pi else 0
	return self.center * CFrame.new(self:localPos(sq)) * CFrame.Angles(0, yaw, 0)
end

function Render:newModel(code: number): Model
	local name = (if colorOf(code) == 0 then "White" else "Black") .. KIND[code % 8]
	local m = (templates:FindFirstChild(name) :: Model):Clone()
	for _, p in m:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = true
			p.CanCollide = false
			p.CanTouch = false
			p.CanQuery = true
		end
	end
	return m
end

function Render:drop(rec)
	anims[rec.model] = nil
	rec.model:Destroy()
end

-- a captured piece hops up and fades away
function Render:capture(rec)
	local m = rec.model
	animate(m, m:GetPivot() + Vector3.new(0, 1.2, 0), 0.35, 0.6, 0.12, function()
		m:Destroy()
	end, true)
end

function Render:slide(rec, to: number, finalCode: number?, delay: number?)
	local isKnight = rec.code % 8 == 2
	local dist = (rec.model:GetPivot().Position - self:squareCF(to, rec.code).Position).Magnitude
	local dur = math.clamp(0.16 + dist * 0.035, 0.2, 0.45)
	local promoteTo = if finalCode and finalCode ~= rec.code then finalCode else nil
	if promoteTo then
		rec.code = promoteTo
	end
	animate(rec.model, self:squareCF(to, rec.code), dur, if isKnight then 1.4 else 0.35 + dist * 0.03, delay,
		function()
			if promoteTo and self.pieces[to] == rec then
				local old = rec.model
				rec.model = self:newModel(promoteTo)
				rec.model:PivotTo(self:squareCF(to, promoteTo))
				rec.model.Parent = self.folder
				old:Destroy()
			end
		end)
end

-- the captured pieces, lined up beside the board on each player's right
function Render:updateGrave()
	local counts = { [0] = { 0, 0, 0, 0, 0, 0 }, [1] = { 0, 0, 0, 0, 0, 0 } }
	for _, rec in self.pieces do
		local c = colorOf(rec.code)
		counts[c][rec.code % 8] += 1
	end
	local lists = { [0] = {}, [1] = {} } -- lists[c] = pieces of colour c that were captured
	for c = 0, 1 do
		for _, t in VALUE_ORDER do
			for _ = 1, math.max(0, START_COUNT[t] - counts[c][t]) do
				table.insert(lists[c], t + 8 * c)
			end
		end
	end
	local key = table.concat(lists[0], ",") .. "|" .. table.concat(lists[1], ",") .. (if self.flip then "f" else "")
	if key == self.graveKey then
		return
	end
	self.graveKey = key
	for _, m in self.grave do
		m:Destroy()
	end
	self.grave = {}
	for c = 0, 1 do
		-- black pieces (taken by white) go on white's right (+X), white pieces on black's right (-X)
		local sideX = if c == 1 then 1 else -1
		local nearZ = if c == 1 then 1 else -1
		for i, code in lists[c] do
			local col, row = (i - 1) // 8, (i - 1) % 8
			local x = sideX * (7.05 + col * 0.6)
			local z = nearZ * (2.1 - row * 0.6)
			if self.flip then
				x, z = -x, -z
			end
			local m = self:newModel(code)
			m:ScaleTo(GRAVE_SCALE)
			local yaw = if (c == 1) ~= self.flip then math.pi else 0
			m:PivotTo(self.center * CFrame.new(x, -TABLE_DROP, z) * CFrame.Angles(0, yaw + 0.3 * (row % 2), 0))
			for _, p in m:GetDescendants() do
				if p:IsA("BasePart") then
					p.CanQuery = false
				end
			end
			m.Parent = self.folder
			table.insert(self.grave, m)
		end
	end
end

-- bring the board up to date with a published state
function Render:update(state)
	local flipChanged = self.flip ~= (state.flip == true)
	self.flip = state.flip == true
	if state.fen ~= self.fen then
		self.G.load(state.fen)
		self.fen = state.fen
	end
	local G = self.G
	local target: { [number]: number } = {}
	for row = 0, 7 do
		for file = 0, 7 do
			local sq = row * 16 + file
			local p = G.pieceAt(sq)
			if p ~= 0 then
				target[sq] = p
			end
		end
	end
	-- one ply further than what we show: animate it
	if not flipChanged and state.last and state.ply == self.ply + 1 then
		local from, to = state.last[1], state.last[2]
		local mover = self.pieces[from]
		if mover then
			local victimSq = to
			if not self.pieces[to] and mover.code % 8 == 1 and from % 16 ~= to % 16 then
				victimSq = (from // 16) * 16 + to % 16 -- en passant
			end
			local victim = self.pieces[victimSq]
			if victim then
				self.pieces[victimSq] = nil
				self:capture(victim)
			end
			self.pieces[from] = nil
			self.pieces[to] = mover
			self:slide(mover, to, target[to])
			if mover.code % 8 == 6 and math.abs(from % 16 - to % 16) == 2 then -- castling: the rook follows
				local row = from // 16
				local rookFrom, rookTo = row * 16 + 7, row * 16 + 5
				if to % 16 == 2 then
					rookFrom, rookTo = row * 16, row * 16 + 3
				end
				local rook = self.pieces[rookFrom]
				if rook then
					self.pieces[rookFrom] = nil
					self.pieces[rookTo] = rook
					self:slide(rook, rookTo, nil, 0.12)
				end
			end
		end
	end
	-- make every square match exactly (new game, takebacks, joining mid-game, ...)
	for sq, rec in self.pieces do
		if target[sq] ~= rec.code then
			self.pieces[sq] = nil
			self:drop(rec)
		end
	end
	for sq, code in target do
		local rec = self.pieces[sq]
		if not rec then
			rec = { code = code, model = self:newModel(code) }
			rec.model:PivotTo(self:squareCF(sq, code))
			rec.model.Parent = self.folder
			self.pieces[sq] = rec
		elseif flipChanged or not anims[rec.model] then
			anims[rec.model] = nil
			rec.model:PivotTo(self:squareCF(sq, code))
		end
	end
	self.ply = state.ply
	self:updateGrave()
	-- highlights everyone sees: the last move and a king in check
	if state.last then
		self:plate("LastFrom", state.last[1], Color3.fromRGB(255, 205, 90), 0.55)
		self:plate("LastTo", state.last[2], Color3.fromRGB(255, 205, 90), 0.45)
	else
		self:plate("LastFrom", nil)
		self:plate("LastTo", nil)
	end
	if state.check and state.status ~= "idle" then
		self:plate("Check", G.kingSquare(G.turn()), Color3.fromRGB(255, 60, 50), 0.3)
	else
		self:plate("Check", nil)
	end
end

-- a flat glowing square (or nothing when sq is nil)
function Render:plate(name: string, sq: number?, color: Color3?, transparency: number?)
	local p = self.plates[name]
	if sq == nil then
		if p then
			p.Parent = nil
		end
		return
	end
	if not p then
		p = Instance.new("Part")
		p.Name = name
		p.Anchored, p.CanCollide, p.CanTouch, p.CanQuery, p.CastShadow = true, false, false, false, false
		p.Material = Enum.Material.Neon
		p.Size = Vector3.new(SQ, 0.03, SQ)
		self.plates[name] = p
	end
	p.Color = color or Color3.new(1, 1, 1)
	p.Transparency = transparency or 0.5
	p.CFrame = self.center * CFrame.new(self:localPos(sq :: number) + Vector3.new(0, 0.016, 0))
	p.Parent = self.fx
end

-- legal-move markers for the selected piece (targets: { [square] = isCapture })
function Render:showTargets(selected: number?, targets: { [number]: boolean }?)
	if self.targetFx then
		for _, p in self.targetFx do
			p:Destroy()
		end
	end
	self.targetFx = {}
	self:plate("Selected", selected, Color3.fromRGB(120, 230, 140), 0.45)
	if not targets then
		return
	end
	for sq, capture in targets do
		local p = Instance.new("Part")
		p.Shape = Enum.PartType.Cylinder
		p.Anchored, p.CanCollide, p.CanTouch, p.CanQuery, p.CastShadow = true, false, false, false, false
		p.Material = Enum.Material.Neon
		p.Color = if capture then Color3.fromRGB(255, 110, 90) else Color3.fromRGB(110, 220, 130)
		p.Transparency = if capture then 0.35 else 0.2
		local d = if capture then SQ * 0.95 else 0.5
		p.Size = Vector3.new(0.04, d, d)
		p.CFrame = self.center * CFrame.new(self:localPos(sq) + Vector3.new(0, 0.03, 0)) * CFrame.Angles(0, 0, math.pi / 2)
		p.Parent = self.fx
		table.insert(self.targetFx, p)
	end
end

-- which square a ray (e.g. from a tap) points at: a piece it hits, else the point on the board
function Render:squareFromRay(origin: Vector3, direction: Vector3): number?
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = { self.folder }
	local hit = workspace:Raycast(origin, direction, params)
	if hit and hit.Instance then
		local model = hit.Instance:FindFirstAncestorOfClass("Model")
		for sq, rec in self.pieces do
			if rec.model == model then
				return sq
			end
		end
	end
	local surfaceY = self.center.Position.Y
	if math.abs(direction.Y) < 1e-4 then
		return nil
	end
	local t = (surfaceY - origin.Y) / direction.Y
	if t < 0 then
		return nil
	end
	local p = self.center:PointToObjectSpace(origin + direction * t)
	local x, z = p.X, p.Z
	if self.flip then
		x, z = -x, -z
	end
	local file, row = math.floor(x / SQ + 4), math.floor(z / SQ + 4)
	if file < 0 or file > 7 or row < 0 or row > 7 then
		return nil
	end
	return row * 16 + file
end

return Render
