-- StormFx: client-side visual effects, all built from parts, particles, beams and GUI (no assets needed):
-- light pillars, particle bursts, shockwaves, lightning bolts with warning circles, meteors and impacts, coins,
-- floating text, camera shake, FOV punches, screen flashes, big pop-up text and confetti.

local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")

local Fx = {}

local SPARK = "rbxasset://textures/particles/sparkles_main.dds"
local SMOKE = "rbxasset://textures/particles/smoke_main.dds"
local FIRE = "rbxasset://textures/particles/fire_main.dds"

local folder = Instance.new("Folder")
folder.Name = "Fx"
folder.Parent = workspace
Fx.folder = folder

local function tween(inst: Instance, time: number, props, style: Enum.EasingStyle?, dir: Enum.EasingDirection?)
	local t = TweenService:Create(inst, TweenInfo.new(time, style or Enum.EasingStyle.Quad, dir or Enum.EasingDirection.Out),
		props)
	t:Play()
	return t
end
Fx.tween = tween

local function part(props): BasePart
	local p = Instance.new("Part")
	p.Anchored, p.CanCollide, p.CanTouch, p.CanQuery, p.CastShadow = true, false, false, false, false
	p.Material = Enum.Material.Neon
	p.Size = Vector3.new(1, 1, 1)
	for k, v in props do
		(p :: any)[k] = v
	end
	p.Parent = folder
	return p
end
Fx.part = part

local UP = CFrame.Angles(0, 0, math.pi / 2) -- turns a cylinder's axis (X) upright

local function emitter(parent: Instance, props)
	local e = Instance.new("ParticleEmitter")
	e.Rate = 0
	for k, v in props do
		(e :: any)[k] = v
	end
	e.Parent = parent
	return e
end

local function flashLight(at: BasePart, color: Color3, brightness: number, range: number, time: number)
	local l = Instance.new("PointLight")
	l.Color = color
	l.Brightness = brightness
	l.Range = range
	l.Parent = at
	tween(l, time, { Brightness = 0 })
end

-- sparkles flying out of a point
function Fx.burst(pos: Vector3, color: Color3, count: number?, speed: number?, size: number?)
	local p = part({ Position = pos, Transparency = 1, Size = Vector3.new(0.5, 0.5, 0.5) })
	local s = speed or 18
	local e = emitter(p, {
		Texture = SPARK,
		Color = ColorSequence.new(color),
		LightEmission = 1,
		Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, size or 0.9), NumberSequenceKeypoint.new(1, 0) }),
		Lifetime = NumberRange.new(0.5, 1.1),
		Speed = NumberRange.new(s * 0.4, s),
		SpreadAngle = Vector2.new(180, 180),
		Drag = 3,
		Acceleration = Vector3.new(0, -8, 0),
		RotSpeed = NumberRange.new(-200, 200),
	})
	e:Emit(count or 40)
	Debris:AddItem(p, 2)
end

-- a column of light that shoots up and thins out
function Fx.pillar(pos: Vector3, color: Color3, height: number?, width: number?, time: number?)
	local h, w, t = height or 60, width or 5, time or 1.2
	local p = part({ Shape = Enum.PartType.Cylinder, Color = color, Transparency = 0.15, Size = Vector3.new(h, w, w),
		CFrame = CFrame.new(pos + Vector3.new(0, h / 2, 0)) * UP })
	tween(p, t, { Size = Vector3.new(h * 1.2, w * 0.05, w * 0.05), Transparency = 1 }, Enum.EasingStyle.Quad,
		Enum.EasingDirection.In)
	local base = part({ Position = pos, Transparency = 1 })
	flashLight(base, color, 6, 30, t)
	Debris:AddItem(p, t + 0.1)
	Debris:AddItem(base, t + 0.1)
end

-- a flat shockwave disc that expands along the ground
function Fx.ring(pos: Vector3, color: Color3, radius: number?, time: number?)
	local r, t = radius or 12, time or 0.6
	local p = part({ Shape = Enum.PartType.Cylinder, Color = color, Transparency = 0.25, Size = Vector3.new(0.25, 1, 1),
		CFrame = CFrame.new(pos + Vector3.new(0, 0.2, 0)) * UP })
	tween(p, t, { Size = Vector3.new(0.1, r * 2, r * 2), Transparency = 1 })
	Debris:AddItem(p, t + 0.1)
end

-- a jagged lightning bolt from the sky to a point
function Fx.bolt(to: Vector3, color: Color3?, height: number?, width: number?)
	local c = color or Color3.fromRGB(200, 225, 255)
	local top = to + Vector3.new(math.random(-12, 12), height or 120, math.random(-12, 12))
	local pts = { top }
	local n = 9
	for i = 1, n - 1 do
		local a = i / n
		local p = top:Lerp(to, a) + Vector3.new(math.random() * 8 - 4, 0, math.random() * 8 - 4) * (1 - a * 0.6)
		table.insert(pts, p)
	end
	table.insert(pts, to)
	local w = width or 0.9
	local segs = {}
	for i = 1, #pts - 1 do
		local a, b = pts[i], pts[i + 1]
		local len = (b - a).Magnitude
		local seg = part({ Color = c, Size = Vector3.new(w, w, len), CFrame = CFrame.lookAt((a + b) / 2, b) })
		table.insert(segs, seg)
		-- a little fork now and then
		if math.random() < 0.3 then
			local fork = a + Vector3.new(math.random(-6, 6), -math.random(4, 9), math.random(-6, 6))
			local fl = (fork - a).Magnitude
			table.insert(segs, part({ Color = c, Size = Vector3.new(w * 0.5, w * 0.5, fl), CFrame = CFrame.lookAt((a + fork) / 2, fork) }))
		end
	end
	local base = part({ Position = to + Vector3.new(0, 1, 0), Transparency = 1 })
	flashLight(base, c, 12, 60, 0.5)
	for _, s in segs do
		tween(s, 0.35, { Transparency = 1 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
		Debris:AddItem(s, 0.4)
	end
	Debris:AddItem(base, 0.6)
	Fx.ring(to, c, 10, 0.5)
	Fx.burst(to + Vector3.new(0, 1, 0), c, 30, 30, 1.1)
	-- a scorch mark that fades
	local scorch = part({ Shape = Enum.PartType.Cylinder, Color = Color3.fromRGB(30, 26, 40), Material = Enum.Material.Slate,
		Size = Vector3.new(0.08, 7, 7), CFrame = CFrame.new(to + Vector3.new(0, 0.06, 0)) * UP })
	tween(scorch, 4, { Transparency = 1 }, Enum.EasingStyle.Linear)
	Debris:AddItem(scorch, 4.1)
end

-- a warning circle on the ground that fills up until something lands there
function Fx.warn(pos: Vector3, radius: number, time: number, color: Color3?)
	local c = color or Color3.fromRGB(255, 50, 60)
	local outer = part({ Shape = Enum.PartType.Cylinder, Color = c, Transparency = 0.65, Size = Vector3.new(0.12, radius * 2, radius * 2),
		CFrame = CFrame.new(pos + Vector3.new(0, 0.12, 0)) * UP })
	local inner = part({ Shape = Enum.PartType.Cylinder, Color = c, Transparency = 0.35, Size = Vector3.new(0.16, 0.5, 0.5),
		CFrame = CFrame.new(pos + Vector3.new(0, 0.14, 0)) * UP })
	tween(inner, time, { Size = Vector3.new(0.16, radius * 2, radius * 2) }, Enum.EasingStyle.Linear)
	local pulse = tween(outer, 0.2, { Transparency = 0.4 }, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
	pulse.Completed:Connect(function()
		if outer.Parent then
			tween(outer, 0.2, { Transparency = 0.7 }, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
		end
	end)
	Debris:AddItem(outer, time + 0.05)
	Debris:AddItem(inner, time + 0.05)
end

-- a fireball streaking from the sky
function Fx.meteor(from: Vector3, to: Vector3, time: number)
	local ball = part({ Shape = Enum.PartType.Ball, Color = Color3.fromRGB(255, 150, 60), Size = Vector3.new(5, 5, 5),
		CFrame = CFrame.new(from) })
	emitter(ball, {
		Texture = FIRE,
		Rate = 60,
		Color = ColorSequence.new(Color3.fromRGB(255, 190, 80), Color3.fromRGB(255, 60, 30)),
		LightEmission = 1,
		Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 6), NumberSequenceKeypoint.new(1, 1) }),
		Lifetime = NumberRange.new(0.4, 0.7),
		Speed = NumberRange.new(2, 4),
		SpreadAngle = Vector2.new(30, 30),
	})
	emitter(ball, {
		Texture = SMOKE,
		Rate = 25,
		Color = ColorSequence.new(Color3.fromRGB(70, 60, 60)),
		Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.4), NumberSequenceKeypoint.new(1, 1) }),
		Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 4), NumberSequenceKeypoint.new(1, 9) }),
		Lifetime = NumberRange.new(1, 1.6),
		Speed = NumberRange.new(1, 2),
	})
	local a0 = Instance.new("Attachment")
	a0.Position = Vector3.new(0, 1.5, 0)
	a0.Parent = ball
	local a1 = Instance.new("Attachment")
	a1.Position = Vector3.new(0, -1.5, 0)
	a1.Parent = ball
	local trail = Instance.new("Trail")
	trail.Attachment0, trail.Attachment1 = a0, a1
	trail.Lifetime = 0.5
	trail.LightEmission = 1
	trail.Color = ColorSequence.new(Color3.fromRGB(255, 200, 90), Color3.fromRGB(255, 70, 30))
	trail.Transparency = NumberSequence.new(0.1, 1)
	trail.FaceCamera = true
	trail.Parent = ball
	local l = Instance.new("PointLight")
	l.Color, l.Brightness, l.Range = Color3.fromRGB(255, 150, 70), 4, 40
	l.Parent = ball
	tween(ball, time, { CFrame = CFrame.new(to) }, Enum.EasingStyle.Linear)
	Debris:AddItem(ball, time + 0.05)
end

-- an explosion with flying rocks and a glowing crater
function Fx.impact(pos: Vector3)
	Fx.burst(pos + Vector3.new(0, 2, 0), Color3.fromRGB(255, 160, 60), 60, 45, 2)
	Fx.ring(pos, Color3.fromRGB(255, 120, 40), 22, 0.7)
	Fx.pillar(pos, Color3.fromRGB(255, 140, 50), 30, 10, 0.6)
	local smoke = part({ Position = pos + Vector3.new(0, 2, 0), Transparency = 1 })
	emitter(smoke, {
		Texture = SMOKE,
		Color = ColorSequence.new(Color3.fromRGB(90, 80, 80)),
		Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3), NumberSequenceKeypoint.new(1, 1) }),
		Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 5), NumberSequenceKeypoint.new(1, 14) }),
		Lifetime = NumberRange.new(1.5, 2.5),
		Speed = NumberRange.new(6, 14),
		SpreadAngle = Vector2.new(70, 70),
	}):Emit(25)
	Debris:AddItem(smoke, 3)
	for _ = 1, 10 do
		local rock = Instance.new("Part")
		rock.Size = Vector3.new(1, 1, 1) * (0.6 + math.random() * 1.2)
		rock.Color = Color3.fromRGB(90, 70, 60)
		rock.Material = Enum.Material.Slate
		rock.CanQuery, rock.CanTouch = false, false
		rock.CFrame = CFrame.new(pos + Vector3.new(0, 2, 0)) * CFrame.Angles(math.random() * 6, math.random() * 6, 0)
		rock.Parent = folder
		rock.AssemblyLinearVelocity = Vector3.new(math.random(-40, 40), math.random(35, 70), math.random(-40, 40))
		rock.AssemblyAngularVelocity = Vector3.new(math.random(-10, 10), math.random(-10, 10), math.random(-10, 10))
		Debris:AddItem(rock, 2.5)
	end
	local crater = part({ Shape = Enum.PartType.Cylinder, Color = Color3.fromRGB(255, 110, 40), Size = Vector3.new(0.1, 12, 12),
		CFrame = CFrame.new(pos + Vector3.new(0, 0.07, 0)) * UP, Transparency = 0.2 })
	tween(crater, 6, { Transparency = 1, Color = Color3.fromRGB(60, 30, 30) }, Enum.EasingStyle.Linear)
	Debris:AddItem(crater, 6.1)
end

-- a ring of energy that rolls outward along the ground (jump over it!)
function Fx.shockwave(center: Vector3, speed: number, maxR: number, delay: number, color: Color3?)
	local c = color or Color3.fromRGB(140, 200, 255)
	local n = 40
	local segs = {}
	for i = 1, n do
		segs[i] = part({ Color = c, Transparency = 1, Size = Vector3.new(1.2, 3, 3) })
	end
	local start = os.clock() + delay
	local conn
	conn = RunService.Heartbeat:Connect(function()
		local t = os.clock()
		if t < start then
			return
		end
		local r = (t - start) * speed
		if r > maxR then
			conn:Disconnect()
			for _, sgm in segs do
				sgm:Destroy()
			end
			return
		end
		local len = 2 * math.pi * math.max(r, 1) / n + 0.3
		for i, sgm in segs do
			local a = i / n * math.pi * 2
			sgm.Size = Vector3.new(1.2, 3, len)
			sgm.CFrame = CFrame.new(center + Vector3.new(math.cos(a) * r, 1.5, math.sin(a) * r)) * CFrame.Angles(0, -a, 0)
			sgm.Transparency = 0.15 + 0.6 * (r / maxR)
		end
	end)
end

-- an icicle drops out of the sky and shatters
function Fx.icicle(pos: Vector3)
	local spike = part({ Color = Color3.fromRGB(190, 240, 255), Material = Enum.Material.Ice, Size = Vector3.new(1.4, 6, 1.4),
		CFrame = CFrame.new(pos + Vector3.new(0, 40, 0)), Transparency = 0.1 })
	tween(spike, 0.25, { CFrame = CFrame.new(pos + Vector3.new(0, 3, 0)) }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
	task.delay(0.25, function()
		spike:Destroy()
		Fx.burst(pos + Vector3.new(0, 1, 0), Color3.fromRGB(210, 245, 255), 40, 24, 1)
		Fx.ring(pos, Color3.fromRGB(170, 230, 255), 6, 0.4)
		for _ = 1, 6 do
			local shard = Instance.new("Part")
			shard.Size = Vector3.new(0.4, 1, 0.4)
			shard.Color = Color3.fromRGB(200, 240, 255)
			shard.Material = Enum.Material.Ice
			shard.CanQuery, shard.CanTouch = false, false
			shard.CFrame = CFrame.new(pos + Vector3.new(0, 1.5, 0))
			shard.Parent = folder
			shard.AssemblyLinearVelocity = Vector3.new(math.random(-20, 20), math.random(15, 30), math.random(-20, 20))
			Debris:AddItem(shard, 1.5)
		end
	end)
end

-- a geyser blasts a column of fire
function Fx.geyser(pos: Vector3)
	Fx.pillar(pos, Color3.fromRGB(255, 120, 40), 34, 7, 1)
	Fx.burst(pos + Vector3.new(0, 4, 0), Color3.fromRGB(255, 150, 60), 50, 36, 1.6)
	local p = part({ Position = pos + Vector3.new(0, 2, 0), Transparency = 1 })
	emitter(p, {
		Texture = FIRE,
		Color = ColorSequence.new(Color3.fromRGB(255, 180, 70), Color3.fromRGB(255, 60, 20)),
		LightEmission = 1,
		Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 5), NumberSequenceKeypoint.new(1, 1) }),
		Lifetime = NumberRange.new(0.6, 1),
		Speed = NumberRange.new(30, 45),
		SpreadAngle = Vector2.new(10, 10),
		EmissionDirection = Enum.NormalId.Top,
	}):Emit(40)
	emitter(p, {
		Texture = SMOKE,
		Color = ColorSequence.new(Color3.fromRGB(70, 60, 60)),
		Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3), NumberSequenceKeypoint.new(1, 1) }),
		Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 4), NumberSequenceKeypoint.new(1, 10) }),
		Lifetime = NumberRange.new(1.5, 2.5),
		Speed = NumberRange.new(15, 25),
		SpreadAngle = Vector2.new(15, 15),
		EmissionDirection = Enum.NormalId.Top,
	}):Emit(15)
	Debris:AddItem(p, 3)
end

-- a hand-sized blast of fire (lava, burns)
function Fx.burn(pos: Vector3)
	Fx.burst(pos, Color3.fromRGB(255, 140, 50), 30, 18, 1.2)
	local p = part({ Position = pos, Transparency = 1 })
	emitter(p, {
		Texture = FIRE,
		Color = ColorSequence.new(Color3.fromRGB(255, 160, 60), Color3.fromRGB(255, 50, 20)),
		LightEmission = 1,
		Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 3), NumberSequenceKeypoint.new(1, 0) }),
		Lifetime = NumberRange.new(0.4, 0.7),
		Speed = NumberRange.new(6, 12),
		SpreadAngle = Vector2.new(40, 40),
		EmissionDirection = Enum.NormalId.Top,
	}):Emit(30)
	Debris:AddItem(p, 1.5)
end

-- a boulder hurled through the air
function Fx.throw(from: Vector3, to: Vector3, time: number)
	local rock = part({ Shape = Enum.PartType.Ball, Color = Color3.fromRGB(110, 90, 80), Material = Enum.Material.Slate,
		Size = Vector3.new(3, 3, 3), CFrame = CFrame.new(from) })
	Fx.trail(rock, Color3.fromRGB(160, 140, 130), 2.5)
	local t0 = os.clock()
	local conn
	conn = RunService.Heartbeat:Connect(function()
		local a = math.clamp((os.clock() - t0) / time, 0, 1)
		local p = from:Lerp(to, a) + Vector3.new(0, math.sin(a * math.pi) * 25, 0)
		rock.CFrame = CFrame.new(p) * CFrame.Angles(a * 8, a * 5, 0)
		if a >= 1 then
			conn:Disconnect()
			rock:Destroy()
		end
	end)
end

-- a small impact (debris landing)
function Fx.thud(pos: Vector3, color: Color3?)
	local c = color or Color3.fromRGB(150, 130, 110)
	Fx.burst(pos + Vector3.new(0, 1, 0), c, 30, 20, 1.2)
	Fx.ring(pos, c, 8, 0.4)
end

-- your blast: a bright orb that streaks to its target
function Fx.projectile(from: Vector3, to: Vector3, color: Color3, hit: boolean)
	local orb = part({ Shape = Enum.PartType.Ball, Color = color, Size = Vector3.new(1.4, 1.4, 1.4), CFrame = CFrame.new(from) })
	Fx.trail(orb, color, 1.2)
	local time = math.clamp((to - from).Magnitude / 220, 0.06, 0.4)
	tween(orb, time, { CFrame = CFrame.new(to) }, Enum.EasingStyle.Linear)
	Debris:AddItem(orb, time + 0.05)
	task.delay(time, function()
		Fx.burst(to, color, if hit then 30 else 10, if hit then 20 else 8, 1)
		if hit then
			Fx.ring(to, color, 4, 0.3)
		end
	end)
end

-- coins that pop out and bounce
function Fx.coins(pos: Vector3, n: number?)
	for _ = 1, n or 10 do
		local c = Instance.new("Part")
		c.Shape = Enum.PartType.Cylinder
		c.Size = Vector3.new(0.25, 1.1, 1.1)
		c.Color = Color3.fromRGB(255, 205, 60)
		c.Material = Enum.Material.SmoothPlastic
		c.Reflectance = 0.35
		c.CanQuery, c.CanTouch = false, false
		c.CFrame = CFrame.new(pos) * CFrame.Angles(math.random() * 6, math.random() * 6, 0)
		c.Parent = folder
		c.AssemblyLinearVelocity = Vector3.new(math.random(-14, 14), math.random(28, 45), math.random(-14, 14))
		c.AssemblyAngularVelocity = Vector3.new(math.random(-20, 20), math.random(-20, 20), 0)
		task.delay(1.4, function()
			if c.Parent then
				tween(c, 0.5, { Transparency = 1 })
			end
		end)
		Debris:AddItem(c, 2)
	end
end

-- text that floats up from a point and fades
function Fx.float(pos: Vector3, text: string, color: Color3?, size: number?, rise: number?)
	local anchor = part({ Position = pos, Transparency = 1 })
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.new(0, 220, 0, (size or 30) + 10)
	bb.AlwaysOnTop = true
	bb.LightInfluence = 0
	bb.MaxDistance = 150
	bb.Adornee = anchor
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.Font = Enum.Font.FredokaOne
	label.TextSize = size or 30
	label.TextColor3 = color or Color3.fromRGB(130, 255, 140)
	label.TextStrokeTransparency = 0.2
	label.Text = text
	label.Parent = bb
	bb.Parent = anchor
	tween(bb, 1.3, { StudsOffset = Vector3.new(0, rise or 5, 0) })
	task.delay(0.7, function()
		if label.Parent then
			tween(label, 0.6, { TextTransparency = 1, TextStrokeTransparency = 1 })
		end
	end)
	Debris:AddItem(anchor, 1.4)
end

-- camera shake (adds up, decays) and FOV punches
local shake = 0
local fovKick = 0
local baseFov: number? = nil
local function cameraStep(dt: number)
	local cam = workspace.CurrentCamera
	if shake > 0.001 then
		local s = shake
		cam.CFrame *= CFrame.Angles((math.random() - 0.5) * s * 0.06, (math.random() - 0.5) * s * 0.06, (math.random() - 0.5) * s * 0.03)
		shake = math.max(0, shake - dt * 3.5)
	end
	if fovKick > 0.01 or baseFov then
		baseFov = baseFov or cam.FieldOfView
		cam.FieldOfView = (baseFov :: number) + fovKick
		fovKick = math.max(0, fovKick - dt * 40)
		if fovKick <= 0.01 then
			cam.FieldOfView = baseFov :: number
			baseFov = nil
		end
	end
end
if RunService:IsClient() then
	RunService:BindToRenderStep("StormFxCamera", Enum.RenderPriority.Camera.Value + 1, cameraStep)
end
function Fx.shake(amount: number)
	shake = math.min(3, shake + amount)
end
function Fx.fov(amount: number)
	fovKick = math.max(fovKick, amount)
end

-- screen flash, big pop-up text and confetti
local gui: ScreenGui? = nil
local function screen(): ScreenGui
	if gui and gui.Parent then
		return gui
	end
	local g = Instance.new("ScreenGui")
	g.Name = "FxGui"
	g.ResetOnSpawn = false
	g.IgnoreGuiInset = true
	g.DisplayOrder = 5
	g.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
	gui = g
	return g
end

function Fx.flash(color: Color3, strength: number?, time: number?)
	local f = Instance.new("Frame")
	f.Size = UDim2.fromScale(1, 1)
	f.BackgroundColor3 = color
	f.BackgroundTransparency = 1 - (strength or 0.5)
	f.BorderSizePixel = 0
	f.Active = false
	f.Parent = screen()
	tween(f, time or 0.5, { BackgroundTransparency = 1 })
	Debris:AddItem(f, (time or 0.5) + 0.1)
end

function Fx.popup(text: string, color: Color3?, sub: string?, hold: number?)
	local g = screen()
	local holder = Instance.new("Frame")
	holder.AnchorPoint = Vector2.new(0.5, 0.5)
	holder.Position = UDim2.fromScale(0.5, 0.36)
	holder.Size = UDim2.new(0.9, 0, 0, 120)
	holder.BackgroundTransparency = 1
	holder.Parent = g
	local scale = Instance.new("UIScale")
	scale.Scale = 0.2
	scale.Parent = holder
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Size = UDim2.new(1, 0, 0, 72)
	t.Font = Enum.Font.FredokaOne
	t.TextSize = 64
	t.TextColor3 = color or Color3.new(1, 1, 1)
	t.Text = text
	t.Parent = holder
	local st = Instance.new("UIStroke")
	st.Thickness = 4
	st.Color = Color3.fromRGB(20, 18, 40)
	st.Parent = t
	local s2: TextLabel? = nil
	if sub then
		s2 = Instance.new("TextLabel")
		local sl = s2 :: TextLabel
		sl.BackgroundTransparency = 1
		sl.Position = UDim2.new(0, 0, 0, 72)
		sl.Size = UDim2.new(1, 0, 0, 36)
		sl.Font = Enum.Font.FredokaOne
		sl.TextSize = 30
		sl.TextColor3 = Color3.new(1, 1, 1)
		sl.Text = sub
		sl.Parent = holder
		local st2 = Instance.new("UIStroke")
		st2.Thickness = 3
		st2.Color = Color3.fromRGB(20, 18, 40)
		st2.Parent = sl
	end
	tween(scale, 0.35, { Scale = 1 }, Enum.EasingStyle.Back)
	task.delay(hold or 1.4, function()
		tween(scale, 0.3, { Scale = 0.6 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
		tween(t, 0.3, { TextTransparency = 1 })
		tween(st, 0.3, { Transparency = 1 })
		if s2 then
			tween(s2, 0.3, { TextTransparency = 1 })
		end
		Debris:AddItem(holder, 0.35)
	end)
end

function Fx.confetti(pos: Vector3, amount: number?)
	local p = part({ Position = pos, Transparency = 1 })
	emitter(p, {
		Texture = SPARK,
		Lifetime = NumberRange.new(2, 3.2),
		Speed = NumberRange.new(14, 26),
		SpreadAngle = Vector2.new(60, 60),
		Acceleration = Vector3.new(0, -24, 0),
		Drag = 1.2,
		RotSpeed = NumberRange.new(-300, 300),
		Rotation = NumberRange.new(0, 360),
		Size = NumberSequence.new(0.5),
		LightEmission = 0.4,
		EmissionDirection = Enum.NormalId.Top,
		Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 90, 90)),
			ColorSequenceKeypoint.new(0.25, Color3.fromRGB(255, 210, 80)),
			ColorSequenceKeypoint.new(0.5, Color3.fromRGB(110, 230, 120)),
			ColorSequenceKeypoint.new(0.75, Color3.fromRGB(90, 170, 255)),
			ColorSequenceKeypoint.new(1, Color3.fromRGB(220, 110, 255)),
		}),
	}):Emit(amount or 120)
	Debris:AddItem(p, 4)
end

-- a beam of light from a storm up into the sky (rare storms are visible from anywhere)
function Fx.beacon(root: BasePart, color: Color3): Beam
	local a0 = Instance.new("Attachment")
	a0.Position = Vector3.new(0, -6, 0)
	a0.Parent = root
	local a1 = Instance.new("Attachment")
	a1.Position = Vector3.new(0, 220, 0)
	a1.Parent = root
	local b = Instance.new("Beam")
	b.Attachment0, b.Attachment1 = a0, a1
	b.Width0, b.Width1 = 3, 10
	b.LightEmission = 1
	b.LightInfluence = 0
	b.FaceCamera = true
	b.Color = ColorSequence.new(color)
	b.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.2), NumberSequenceKeypoint.new(1, 1) })
	b.Parent = a0
	b.Destroying:Connect(function()
		task.defer(function() -- (a0 is the beam's parent: it can't go while the beam is being destroyed)
			a0:Destroy()
			a1:Destroy()
		end)
	end)
	return b
end

-- a trail behind a moving part (e.g. the storm you carry)
function Fx.trail(p: BasePart, color: Color3, width: number?): Trail
	local w = width or 2
	local a0 = Instance.new("Attachment")
	a0.Position = Vector3.new(0, w / 2, 0)
	a0.Parent = p
	local a1 = Instance.new("Attachment")
	a1.Position = Vector3.new(0, -w / 2, 0)
	a1.Parent = p
	local t = Instance.new("Trail")
	t.Attachment0, t.Attachment1 = a0, a1
	t.Lifetime = 0.45
	t.LightEmission = 0.8
	t.Color = ColorSequence.new(color)
	t.Transparency = NumberSequence.new(0.3, 1)
	t.FaceCamera = true
	t.Parent = p
	t.Destroying:Connect(function()
		a0:Destroy()
		a1:Destroy()
	end)
	return t
end

return Fx
