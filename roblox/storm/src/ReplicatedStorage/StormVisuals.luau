-- StormVisuals: builds the look of every storm and of the storm spirits, on the client, from parts.
-- A visual = { model, pieces, spin } where each piece is { part, base: CFrame, anim: ((t) -> CFrame)? } relative
-- to the storm's origin. Visual.update(v, originCF, t) poses everything (one BulkMoveTo per visual).

local Data = require(script.Parent:WaitForChild("StormData"))

local V = {}

local SPARK = "rbxasset://textures/particles/sparkles_main.dds"
local SMOKE = "rbxasset://textures/particles/smoke_main.dds"
local FIRE = "rbxasset://textures/particles/fire_main.dds"

local function rgb(r, g, b)
	return Color3.fromRGB(r, g, b)
end

local function newVisual(name: string)
	local model = Instance.new("Model")
	model.Name = name
	return { model = model, pieces = {}, spin = 0, bob = 0.35, bobSpeed = 1.6, parts = {}, cfs = {} }
end

local function addPart(vis, opts): BasePart
	local p = Instance.new("Part")
	p.Anchored, p.CanCollide, p.CanTouch, p.CanQuery, p.CastShadow = true, false, false, false, false
	p.Size = opts.size or Vector3.new(1, 1, 1)
	p.Color = opts.color or Color3.new(1, 1, 1)
	p.Material = opts.material or Enum.Material.SmoothPlastic
	p.Transparency = opts.transparency or 0
	if opts.shape then
		p.Shape = opts.shape
	end
	if opts.ellipsoid then
		local m = Instance.new("SpecialMesh")
		m.MeshType = Enum.MeshType.Sphere
		m.Parent = p
	end
	p.Parent = vis.model
	table.insert(vis.pieces, { part = p, base = opts.cf or CFrame.identity, anim = opts.anim })
	return p
end

local function puff(vis, pos: Vector3, size: Vector3, color: Color3, transparency: number?)
	return addPart(vis, { cf = CFrame.new(pos), size = size, color = color, ellipsoid = true,
		transparency = transparency })
end

-- a fluffy cloud of n puffs around the origin
local function cloud(vis, rng: Random, width: number, color: Color3, n: number, transparency: number?, y: number?)
	local yy = y or 0.6
	puff(vis, Vector3.new(0, yy + 0.4, 0), Vector3.new(width * 0.62, width * 0.42, width * 0.55), color, transparency)
	for i = 1, n do
		local a = (i / n) * math.pi * 2 + rng:NextNumber() * 0.5
		local r = width * rng:NextNumber(0.22, 0.34)
		local s = width * rng:NextNumber(0.34, 0.46)
		local shade = color:Lerp(Color3.new(1, 1, 1), rng:NextNumber(-0.05, 0.12))
		puff(vis, Vector3.new(math.cos(a) * r, yy + rng:NextNumber(-0.2, 0.4), math.sin(a) * r * 0.8),
			Vector3.new(s, s * 0.75, s), shade, transparency)
	end
end

-- falling bits (rain streaks, snow, hail, meteors) that loop from the cloud to the ground
local function fall(vis, rng: Random, n: number, opts)
	local top, bottom = opts.top or -0.5, opts.bottom or -6.5
	local span = top - bottom
	for _ = 1, n do
		local x, z = rng:NextNumber(-opts.radius, opts.radius), rng:NextNumber(-opts.radius, opts.radius)
		local phase = rng:NextNumber() * span
		local speed = opts.speed * rng:NextNumber(0.85, 1.15)
		local drift = opts.drift or 0
		local tilt = opts.tilt or 0
		addPart(vis, {
			size = opts.size,
			color = opts.color,
			material = opts.material or Enum.Material.Neon,
			transparency = opts.transparency or 0.2,
			shape = opts.shape,
			anim = function(t)
				local d = (t * speed + phase) % span
				return CFrame.new(x + math.sin(t * 2 + phase) * drift + d * tilt, top - d, z) * CFrame.Angles(0, 0, tilt)
			end,
		})
	end
end

local function emitter(parent: Instance, props)
	local e = Instance.new("ParticleEmitter")
	for k, v in props do
		(e :: any)[k] = v
	end
	e.Parent = parent
	return e
end

local function sparkles(part: BasePart, color: Color3, rate: number?)
	emitter(part, {
		Texture = SPARK,
		Color = ColorSequence.new(color),
		LightEmission = 1,
		Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.35), NumberSequenceKeypoint.new(1, 0) }),
		Rate = rate or 6,
		Lifetime = NumberRange.new(0.8, 1.4),
		Speed = NumberRange.new(0.5, 1.5),
		SpreadAngle = Vector2.new(180, 180),
	})
end

local function light(part: BasePart, color: Color3, brightness: number, range: number)
	local l = Instance.new("PointLight")
	l.Color = color
	l.Brightness = brightness
	l.Range = range
	l.Parent = part
	return l
end

-- a jagged lightning bolt that flashes now and then
local function bolt(vis, rng: Random, from: Vector3, length: number, color: Color3, every: number)
	local phase = rng:NextNumber() * every
	local pos = from
	for i = 1, 5 do
		local step = Vector3.new(rng:NextNumber(-0.9, 0.9), -length / 5, rng:NextNumber(-0.6, 0.6))
		local mid = pos + step / 2
		local len = step.Magnitude
		local base = CFrame.lookAt(mid, mid + step) * CFrame.Angles(math.pi / 2, 0, 0)
		local seg = addPart(vis, {
			size = Vector3.new(0.18, len, 0.18),
			color = color,
			material = Enum.Material.Neon,
			cf = base,
		})
		local piece = vis.pieces[#vis.pieces]
		piece.anim = function(t)
			local on = ((t + phase) % every) < 0.13 or (((t + phase) % every) > 0.22 and ((t + phase) % every) < 0.3)
			seg.Transparency = if on then 0 else 1
			return base
		end
		pos += step
		local _ = i
	end
end

---------------------------------------------------------------- the storms
local BUILD = {}

BUILD.Drizzle = function(vis, rng)
	cloud(vis, rng, 4.6, rgb(200, 206, 214), 5)
	fall(vis, rng, 9, { radius = 1.4, speed = 7, size = Vector3.new(0.07, 0.6, 0.07), color = rgb(150, 200, 255) })
end
BUILD.Breeze = function(vis, rng)
	vis.spin = 1.2
	for i = 1, 4 do
		local a = i / 4 * math.pi * 2
		local r = 1.6 + i * 0.15
		addPart(vis, {
			size = Vector3.new(2.6, 0.35, 0.7),
			color = rgb(235, 245, 255),
			transparency = 0.25,
			ellipsoid = true,
			anim = function(t)
				local b = a + t * 3
				return CFrame.new(math.cos(b) * r, math.sin(t * 2 + i) * 0.6, math.sin(b) * r)
					* CFrame.Angles(0, -b, 0.3)
			end,
		})
	end
	local core = puff(vis, Vector3.new(0, 0, 0), Vector3.new(1.6, 1.6, 1.6), rgb(225, 240, 255), 0.5)
	sparkles(core, rgb(220, 240, 255), 4)
end
BUILD.Sunbeam = function(vis, rng)
	vis.spin = 0.6
	local sun = addPart(vis, { size = Vector3.new(2.8, 2.8, 2.8), color = rgb(255, 215, 80), material = Enum.Material.Neon,
		shape = Enum.PartType.Ball })
	light(sun, rgb(255, 220, 120), 2, 16)
	for i = 1, 8 do
		local a = i / 8 * math.pi * 2
		addPart(vis, {
			cf = CFrame.Angles(0, a, 0) * CFrame.new(2.4, 0, 0),
			size = Vector3.new(1.4, 0.3, 0.3),
			color = rgb(255, 190, 60),
			material = Enum.Material.Neon,
		})
	end
	puff(vis, Vector3.new(1.4, -0.9, 0.6), Vector3.new(2.2, 1.2, 1.6), rgb(250, 250, 255))
	local _ = rng
end
BUILD.RainCloud = function(vis, rng)
	cloud(vis, rng, 5.6, rgb(150, 158, 170), 6)
	fall(vis, rng, 16, { radius = 1.9, speed = 10, size = Vector3.new(0.08, 0.8, 0.08), color = rgb(120, 180, 255) })
end
BUILD.FogBank = function(vis, rng)
	vis.spin = 0.15
	for i = 1, 6 do
		local a = i / 6 * math.pi * 2
		addPart(vis, {
			size = Vector3.new(4.2, 1.6, 3),
			color = rgb(220, 224, 230),
			transparency = 0.45,
			ellipsoid = true,
			anim = function(t)
				return CFrame.new(math.cos(a + t * 0.3) * 1.6, math.sin(t + i) * 0.3 - 0.5, math.sin(a + t * 0.3) * 1.6)
			end,
		})
	end
	local core = puff(vis, Vector3.new(0, 0, 0), Vector3.new(3, 1.5, 3), rgb(235, 238, 242), 0.3)
	emitter(core, {
		Texture = SMOKE,
		Color = ColorSequence.new(rgb(230, 232, 236)),
		Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.6), NumberSequenceKeypoint.new(1, 1) }),
		Size = NumberSequence.new(3),
		Rate = 3,
		Lifetime = NumberRange.new(2, 3),
		Speed = NumberRange.new(0.3, 0.8),
		SpreadAngle = Vector2.new(180, 30),
	})
	local _ = rng
end
BUILD.SnowFlurry = function(vis, rng)
	cloud(vis, rng, 5, rgb(235, 242, 255), 5)
	fall(vis, rng, 14, { radius = 2, speed = 2.2, drift = 0.5, size = Vector3.new(0.22, 0.22, 0.22),
		color = rgb(255, 255, 255), shape = Enum.PartType.Ball, transparency = 0 })
end
BUILD.Thunderstorm = function(vis, rng)
	cloud(vis, rng, 6, rgb(80, 82, 100), 7)
	fall(vis, rng, 14, { radius = 2, speed = 11, size = Vector3.new(0.08, 0.8, 0.08), color = rgb(120, 170, 255) })
	bolt(vis, rng, Vector3.new(0.4, -0.3, 0.2), 6, rgb(200, 220, 255), 2.2)
	bolt(vis, rng, Vector3.new(-1, -0.3, -0.4), 5, rgb(220, 200, 255), 3.1)
	local glow = vis.pieces[1].part
	light(glow, rgb(170, 180, 255), 1.5, 14)
end
BUILD.Hailstorm = function(vis, rng)
	cloud(vis, rng, 5.8, rgb(120, 140, 170), 7)
	fall(vis, rng, 14, { radius = 2, speed = 12, size = Vector3.new(0.35, 0.35, 0.35), color = rgb(235, 245, 255),
		shape = Enum.PartType.Ball, material = Enum.Material.Ice, transparency = 0 })
end
BUILD.Tornado = function(vis, rng)
	vis.bob = 0.2
	for i = 1, 8 do
		local y = 2.6 - i * 0.95
		local w = 5.4 - i * 0.55
		addPart(vis, {
			size = Vector3.new(w, 0.9, w),
			color = rgb(150 - i * 4, 150 - i * 4, 160 - i * 4),
			transparency = 0.25,
			ellipsoid = true,
			anim = function(t)
				local sway = math.sin(t * 2 + i * 0.6) * (0.15 * i)
				return CFrame.new(sway, y, math.cos(t * 1.7 + i) * 0.1 * i) * CFrame.Angles(0, t * (6 + i), 0)
			end,
		})
	end
	cloud(vis, rng, 6.4, rgb(110, 112, 125), 6, nil, 3.2)
	local dust = addPart(vis, { cf = CFrame.new(0, -5.3, 0), size = Vector3.new(2, 0.4, 2), transparency = 1 })
	emitter(dust, {
		Texture = SMOKE,
		Color = ColorSequence.new(rgb(170, 150, 120)),
		Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 1) }),
		Size = NumberSequence.new(1.6),
		Rate = 10,
		Lifetime = NumberRange.new(0.8, 1.4),
		Speed = NumberRange.new(3, 5),
		SpreadAngle = Vector2.new(90, 20),
		RotSpeed = NumberRange.new(-200, 200),
	})
end
BUILD.Rainbow = function(vis, rng)
	vis.spin = 0.4
	local colors = { rgb(255, 70, 70), rgb(255, 150, 50), rgb(255, 230, 70), rgb(90, 220, 100), rgb(70, 160, 255),
		rgb(110, 90, 230), rgb(190, 90, 230) }
	for band, c in colors do
		local r = 3.4 - band * 0.28
		for k = 0, 10 do
			local a = k / 10 * math.pi
			addPart(vis, {
				cf = CFrame.new(math.cos(a) * r, math.sin(a) * r - 1.4, 0) * CFrame.Angles(0, 0, a),
				size = Vector3.new(0.32, 1.05, 0.5),
				color = c,
				material = Enum.Material.Neon,
				transparency = 0.1,
			})
		end
	end
	for _, x in { -3, 3 } do
		puff(vis, Vector3.new(x, -1.5, 0), Vector3.new(2.4, 1.4, 1.8), rgb(255, 255, 255))
	end
	sparkles(vis.pieces[1].part, rgb(255, 255, 255), 8)
	local _ = rng
end
BUILD.Blizzard = function(vis, rng)
	cloud(vis, rng, 6.8, rgb(210, 228, 250), 8)
	fall(vis, rng, 24, { radius = 2.4, speed = 9, drift = 0.4, tilt = 0.6, size = Vector3.new(0.2, 0.2, 0.2),
		color = rgb(255, 255, 255), shape = Enum.PartType.Ball, transparency = 0 })
	light(vis.pieces[1].part, rgb(170, 220, 255), 2, 16)
end
BUILD.Aurora = function(vis, rng)
	vis.spin = 0.25
	local colors = { rgb(70, 255, 170), rgb(90, 200, 255), rgb(190, 110, 255) }
	for ribbon, c in colors do
		for k = 0, 9 do
			local x = (k - 4.5) * 0.75
			local z = (ribbon - 2) * 0.9
			addPart(vis, {
				size = Vector3.new(0.75, 3.2, 0.12),
				color = c,
				material = Enum.Material.Neon,
				transparency = 0.35,
				anim = function(t)
					local y = math.sin(t * 1.8 + k * 0.6 + ribbon) * 0.7
					return CFrame.new(x, y + 0.4, z + math.sin(t + k * 0.5) * 0.4) * CFrame.Angles(0, 0, math.sin(t + k) * 0.15)
				end,
			})
		end
	end
	local core = addPart(vis, { size = Vector3.new(1, 1, 1), transparency = 1 })
	sparkles(core, rgb(200, 255, 230), 10)
	light(core, rgb(120, 255, 200), 2, 18)
	local _ = rng
end
BUILD.MeteorShower = function(vis, rng)
	cloud(vis, rng, 6.6, rgb(60, 40, 80), 8)
	for _ = 1, 6 do
		local x, z = rng:NextNumber(-2.2, 2.2), rng:NextNumber(-2, 2)
		local phase = rng:NextNumber() * 6
		local m = addPart(vis, {
			size = Vector3.new(0.6, 0.6, 0.6),
			color = rgb(255, 140, 40),
			material = Enum.Material.Neon,
			shape = Enum.PartType.Ball,
			anim = function(t)
				local d = (t * 6 + phase) % 6
				return CFrame.new(x + d * 0.5, -0.5 - d, z)
			end,
		})
		emitter(m, {
			Texture = FIRE,
			Color = ColorSequence.new(rgb(255, 150, 60), rgb(255, 60, 30)),
			LightEmission = 1,
			Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.7), NumberSequenceKeypoint.new(1, 0) }),
			Rate = 25,
			Lifetime = NumberRange.new(0.3, 0.5),
			Speed = NumberRange.new(0, 0),
		})
	end
	light(vis.pieces[1].part, rgb(255, 120, 60), 2.5, 18)
end

-- mutations change how a storm looks (and Rainbow ones cycle through colours every frame)
local function tint(vis, color: Color3, amount: number, material: Enum.Material?)
	for _, piece in vis.pieces do
		local p = piece.part
		if p.Transparency < 1 then
			p.Color = p.Color:Lerp(color, amount)
			if material and p.Material == Enum.Material.SmoothPlastic then
				p.Material = material
			end
		end
	end
end

function V.mutate(vis, mutation: string?, rng: Random)
	if not mutation or mutation == "" then
		return
	end
	local m = Data.MUTATIONS[mutation]
	local core = vis.pieces[1].part
	if mutation == "Golden" then
		tint(vis, m.color, 0.6)
		for _, piece in vis.pieces do
			if piece.part.Material == Enum.Material.SmoothPlastic then
				piece.part.Reflectance = 0.25
			end
		end
		sparkles(core, m.color, 12)
	elseif mutation == "Frozen" then
		tint(vis, Color3.fromRGB(205, 238, 255), 0.6, Enum.Material.Ice)
		sparkles(core, Color3.fromRGB(235, 250, 255), 10)
		for i = 1, 4 do
			local a = i / 4 * math.pi * 2
			addPart(vis, {
				cf = CFrame.new(math.cos(a) * 1.6, -1.2, math.sin(a) * 1.4) * CFrame.Angles(math.pi, 0, 0),
				size = Vector3.new(0.35, 1.3, 0.35),
				color = Color3.fromRGB(210, 240, 255),
				material = Enum.Material.Glass,
				transparency = 0.2,
			})
		end
	elseif mutation == "Charged" then
		tint(vis, Color3.fromRGB(120, 190, 255), 0.35)
		bolt(vis, rng, Vector3.new(2.2, 1.2, 0), 3, m.color, 0.7)
		bolt(vis, rng, Vector3.new(-2.2, 1.2, 0.5), 3, m.color, 0.9)
		light(core, m.color, 2.5, 16)
	elseif mutation == "Cosmic" then
		tint(vis, Color3.fromRGB(80, 50, 160), 0.55)
		sparkles(core, Color3.fromRGB(255, 255, 255), 14)
		for i = 1, 5 do
			local r = 2.6 + (i % 2) * 0.6
			local speed = 1.4 + i * 0.25
			addPart(vis, {
				size = Vector3.new(0.35, 0.35, 0.35),
				color = if i % 2 == 0 then Color3.fromRGB(255, 255, 255) else Color3.fromRGB(190, 160, 255),
				material = Enum.Material.Neon,
				shape = Enum.PartType.Ball,
				anim = function(t)
					local a = t * speed + i * 1.3
					return CFrame.new(math.cos(a) * r, math.sin(t * 2 + i) * 0.8, math.sin(a) * r)
				end,
			})
		end
		light(core, Color3.fromRGB(170, 120, 255), 2, 16)
	elseif mutation == "Bloodmoon" then
		tint(vis, Color3.fromRGB(190, 25, 40), 0.6)
		light(core, Color3.fromRGB(255, 40, 50), 2.5, 16)
		emitter(core, {
			Texture = SPARK,
			Color = ColorSequence.new(Color3.fromRGB(255, 60, 50)),
			LightEmission = 1,
			Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3), NumberSequenceKeypoint.new(1, 0) }),
			Rate = 12,
			Lifetime = NumberRange.new(1, 1.8),
			Speed = NumberRange.new(1, 3),
			Acceleration = Vector3.new(0, 3, 0),
			SpreadAngle = Vector2.new(180, 180),
		})
	elseif mutation == "Rainbow" then
		vis.rainbow = true
		sparkles(core, Color3.fromRGB(255, 255, 255), 16)
		light(core, Color3.fromRGB(255, 200, 255), 2, 16)
	end
end

function V.storm(kind: string, mutation: string?, seed: number?)
	local rng = Random.new(seed or 7)
	local vis = newVisual(kind)
	local build = BUILD[kind] or BUILD.Drizzle
	build(vis, rng)
	V.mutate(vis, mutation, rng)
	for _, piece in vis.pieces do
		table.insert(vis.parts, piece.part)
		table.insert(vis.cfs, CFrame.identity)
	end
	return vis
end

---------------------------------------------------------------- storm spirits (the chasers)
function V.spirit(rarity: number, seed: number?)
	local rng = Random.new(seed or 3)
	local vis = newVisual("StormSpirit")
	vis.bob = 0.4
	vis.bobSpeed = 4
	local eyeColor = Data.RARITIES[rarity] and Data.RARITIES[rarity].color or rgb(255, 80, 80)
	local dark = rgb(46, 40, 62)
	for i = 1, 5 do
		local a = i / 5 * math.pi * 2
		local s = rng:NextNumber(1.3, 1.8)
		addPart(vis, {
			size = Vector3.new(s, s * 0.9, s),
			color = dark:Lerp(rgb(80, 70, 110), rng:NextNumber()),
			ellipsoid = true,
			transparency = 0.05,
			anim = function(t)
				return CFrame.new(math.cos(a + t * 2) * 0.8, math.sin(t * 5 + i) * 0.25, 0.7 + math.sin(a + t * 2) * 0.6)
			end,
		})
	end
	addPart(vis, { size = Vector3.new(2.6, 2.4, 2.6), color = dark, ellipsoid = true })
	for _, x in { -0.5, 0.5 } do
		local eye = addPart(vis, {
			cf = CFrame.new(x * 1.1, 0.35, -1.32) * CFrame.Angles(0, 0, -x * 0.5),
			size = Vector3.new(0.7, 0.36, 0.25),
			color = eyeColor,
			material = Enum.Material.Neon,
			ellipsoid = true,
		})
		eye.Name = "Eye"
	end
	addPart(vis, { cf = CFrame.new(0, -0.4, -1.3), size = Vector3.new(1, 0.3, 0.15), color = rgb(15, 10, 20),
		ellipsoid = true })
	-- a wispy tail behind it
	for i = 1, 3 do
		addPart(vis, {
			size = Vector3.new(1.6 - i * 0.35, 1.3 - i * 0.3, 1.2),
			color = dark,
			transparency = 0.2 + i * 0.15,
			ellipsoid = true,
			anim = function(t)
				return CFrame.new(math.sin(t * 6 + i) * 0.3, -0.3 - i * 0.2, 1.2 + i * 0.9)
			end,
		})
	end
	bolt(vis, rng, Vector3.new(0.8, 1, 0), 2.2, eyeColor, 0.9)
	light(vis.pieces[6].part, eyeColor, 1.5, 10)
	for _, piece in vis.pieces do
		table.insert(vis.parts, piece.part)
		table.insert(vis.cfs, CFrame.identity)
	end
	return vis
end

-- pose every part of a visual around origin at time t
function V.update(vis, origin: CFrame, t: number)
	local o = origin * CFrame.new(0, math.sin(t * vis.bobSpeed) * vis.bob, 0)
	if vis.spin ~= 0 then
		o *= CFrame.Angles(0, t * vis.spin, 0)
	end
	local cfs = vis.cfs
	for i, piece in vis.pieces do
		cfs[i] = o * (if piece.anim then piece.anim(t) else piece.base)
	end
	if vis.rainbow then
		vis.baseColors = vis.baseColors or {}
		for i, piece in vis.pieces do
			local p = piece.part
			if p.Transparency < 1 then
				local base = vis.baseColors[i] or p.Color
				vis.baseColors[i] = base
				p.Color = base:Lerp(Color3.fromHSV((t * 0.25 + i * 0.04) % 1, 0.75, 1), 0.7)
			end
		end
	end
	workspace:BulkMoveTo(vis.parts, cfs, Enum.BulkMoveMode.FireCFrameChanged)
end

return V
