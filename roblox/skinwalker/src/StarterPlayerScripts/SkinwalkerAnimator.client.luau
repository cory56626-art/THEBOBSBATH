-- Animates the skinwalker on each player's screen, driven by what the server brain is doing.
-- Every bone has a Motor6D called "Joint"; we write Joint.Transform each frame.
--   * legs use a small IK solver so feet stay planted while it walks, crouches and creeps
--   * crouches low to stalk and ambush, leans into a loping run when chasing
--   * the cat "butt wiggle" before a pounce, then a full-body leap
--   * swipes when attacking, freezes like a statue when you stare at it
--   * head follows whatever it is looking at; collapses when it starves

local RunService = game:GetService("RunService")

local found = workspace:WaitForChild("Skinwalker", 60)
if not found or not found:IsA("Model") then
	return
end
local model: Model = found

local joints: { [string]: Motor6D } = {}
local function collect()
	for _, d in model:GetDescendants() do
		if d:IsA("Motor6D") and d.Name == "Joint" and d.Part1 then
			joints[d.Part1.Name] = d
		end
	end
end
collect()

local function set(name: string, cf: CFrame)
	local j = joints[name]
	if j then
		j.Transform = cf
	end
end

local function approach(cur: number, target: number, rate: number, dt: number): number
	return cur + (target - cur) * math.min(1, dt * rate)
end

-------------------------------------------------------------------------------- leg IK (sagittal plane)
-- Each leg: hip -> knee -> hock -> ankle, all rotating about the model's X axis.
-- Unknowns: thigh angle a and shin angle b; the metatarsal counter-rotates (c = -K*b).
local K = 0.8
type Leg = { K0: Vector2, H0: Vector2, A0: Vector2, a: number, b: number }
local function legOf(side: string): Leg?
	local shin, meta, foot = joints[side .. "Shin"], joints[side .. "Meta"], joints[side .. "Foot"]
	if not (shin and meta and foot) then
		return nil
	end
	local function yz(v: Vector3): Vector2
		return Vector2.new(v.Y, v.Z)
	end
	return { K0 = yz(shin.C0.Position), H0 = yz(meta.C0.Position), A0 = yz(foot.C0.Position), a = 0, b = 0 }
end
local legs = { Left = legOf("Left"), Right = legOf("Right") }

local function rot(v: Vector2, ang: number): Vector2
	local c, s = math.cos(ang), math.sin(ang)
	return Vector2.new(v.X * c - v.Y * s, v.X * s + v.Y * c)
end
local function fk(L: Leg, a: number, b: number): Vector2
	return rot(L.K0, a) + rot(L.H0, a + b) + rot(L.A0, a + b - K * b)
end
local function solve(L: Leg, target: Vector2)
	local a, b = L.a, L.b
	for _ = 1, 6 do
		local p = fk(L, a, b)
		local e = target - p
		if e.Magnitude < 0.01 then
			break
		end
		local eps = 1e-3
		local pa, pb = fk(L, a + eps, b), fk(L, a, b + eps)
		local j11, j12 = (pa.X - p.X) / eps, (pb.X - p.X) / eps
		local j21, j22 = (pa.Y - p.Y) / eps, (pb.Y - p.Y) / eps
		local det = j11 * j22 - j12 * j21
		if math.abs(det) < 1e-6 then
			break
		end
		local da = (j22 * e.X - j12 * e.Y) / det
		local db = (-j21 * e.X + j11 * e.Y) / det
		local s = math.min(1, 0.4 / math.max(math.abs(da), math.abs(db), 1e-6))
		a = math.clamp(a + da * s, -1.2, 1.2)
		b = math.clamp(b + db * s, -1.6, 1.2)
	end
	L.a, L.b = a, b
end

-------------------------------------------------------------------------------- state
local rng = Random.new()
local clock = 0 -- animation time (stops while frozen)
local realT = 0
local crouch, lean, run, gaitAmp = 0, 0, 0, 0
local phase = 0
local yaw, pitch = 0, 0
local twitch = Vector3.zero
local nextTwitch = 2
local attackT, lastAttackSeq = 99, model:GetAttribute("AttackSeq") or 0
local attackSide = 1
local pounceT, lastPounceSeq = 99, model:GetAttribute("PounceSeq") or 0
local deadT = 0
local wiggle = 0

local CROUCH = { Ambush = 1, Wiggle = 1, Stalk = 0.75, Toy = 0.45, Feed = 0.85, Search = 0.35, Attack = 0.25,
	Prowl = 0.12, Chase = 0.1, Pounce = 0, Dead = 0 }
local LEAN = { Ambush = 0.55, Wiggle = 0.6, Stalk = 0.5, Toy = 0.35, Feed = 0.75, Search = 0.5, Attack = 0.4,
	Prowl = 0.2, Chase = 0.35, Pounce = 0.5, Dead = 0 }
local MAX_DROP = 2.4

RunService.RenderStepped:Connect(function(dt)
	dt = math.min(dt, 0.1)
	local root = model.PrimaryPart
	if not root then
		return
	end
	local state = model:GetAttribute("State") or "Prowl"
	local frozen = model:GetAttribute("Frozen") == true
	local dead = model:GetAttribute("Dead") == true
	realT += dt
	clock += if frozen then 0 else dt

	local vel = root.AssemblyLinearVelocity
	local speed = Vector3.new(vel.X, 0, vel.Z).Magnitude

	-- one-shot triggers
	local aSeq = model:GetAttribute("AttackSeq") or 0
	if aSeq ~= lastAttackSeq then
		lastAttackSeq = aSeq
		attackT = 0
		attackSide = -attackSide
	end
	attackT += dt
	local pSeq = model:GetAttribute("PounceSeq") or 0
	if pSeq ~= lastPounceSeq then
		lastPounceSeq = pSeq
		pounceT = 0
	end
	pounceT += dt
	deadT = if dead then deadT + dt else 0

	-- blended posture
	crouch = approach(crouch, if frozen then 0.85 else (CROUCH[state] or 0.1), 3, dt)
	lean = approach(lean, LEAN[state] or 0.2, 3, dt)
	run = approach(run, math.clamp((speed - 9) / 7, 0, 1), 4, dt)
	gaitAmp = approach(gaitAmp, math.clamp(speed / 6, 0, 1), 6, dt)
	wiggle = approach(wiggle, if state == "Wiggle" then 1 else 0, 10, dt)
	local airborne = state == "Pounce" and pounceT < 1.2

	-- twitches (cats freeze, then snap)
	nextTwitch -= dt
	if nextTwitch <= 0 then
		twitch = Vector3.new(rng:NextNumber(-0.3, 0.3), rng:NextNumber(-0.4, 0.4), rng:NextNumber(-0.5, 0.5))
		nextTwitch = rng:NextNumber(1.5, 4.5)
	end
	twitch *= math.exp(-dt * 7)

	------------------------------------------------------------------ legs
	local stride = math.clamp(speed * 0.12, 0, 2.0)
	local lift = math.clamp(speed * 0.07, 0, 1.1)
	if stride > 0.05 then
		phase += dt * math.pi * speed / (2 * stride)
	else
		phase = approach(phase, math.round(phase / math.pi) * math.pi, 4, dt)
	end
	local drop = crouch * MAX_DROP
	local bob = -math.abs(math.sin(phase)) * 0.25 * gaitAmp + (math.sin(clock * 1.2) * 0.05)

	if dead then
		local k = math.clamp(deadT / 1.1, 0, 1)
		local ease = 1 - (1 - k) ^ 3
		set("Pelvis", CFrame.new(0, -4.6 * ease, 0) * CFrame.Angles(0.2 * ease, 0, 1.35 * ease))
		for _, side in { "Left", "Right" } do
			local s = if side == "Left" then -1 else 1
			set(side .. "Thigh", CFrame.Angles(0.9 * ease, 0, s * 0.2 * ease))
			set(side .. "Shin", CFrame.Angles(-1.2 * ease, 0, 0))
			set(side .. "Meta", CFrame.Angles(0.6 * ease, 0, 0))
			set(side .. "Foot", CFrame.Angles(-0.3 * ease, 0, 0))
		end
	elseif airborne then
		local k = math.clamp(pounceT / 0.15, 0, 1)
		set("Pelvis", CFrame.Angles(-0.35 * k, 0, 0))
		for _, side in { "Left", "Right" } do
			set(side .. "Thigh", CFrame.Angles(-0.75 * k, 0, 0))
			set(side .. "Shin", CFrame.Angles(0.5 * k, 0, 0))
			set(side .. "Meta", CFrame.Angles(-0.3 * k, 0, 0))
			set(side .. "Foot", CFrame.Angles(0.55 * k, 0, 0))
		end
	else
		local wig = wiggle * math.sin(realT * 24) * 0.14
		set("Pelvis", CFrame.new(0, -drop + bob, 0) * CFrame.Angles(0, wig + math.sin(clock * 0.4) * 0.04, wig * 0.6))
		for i, side in { "Left", "Right" } do
			local L = legs[side]
			if L then
				local ph = phase + (i - 1) * math.pi
				local rest = L.K0 + L.H0 + L.A0
				local footZ = -stride * math.sin(ph)
				local footY = lift * math.max(0, math.cos(ph))
				local target = rest + Vector2.new(drop - bob + footY, footZ)
				solve(L, target)
				local c = -K * L.b
				set(side .. "Thigh", CFrame.Angles(L.a, 0, 0))
				set(side .. "Shin", CFrame.Angles(L.b, 0, 0))
				set(side .. "Meta", CFrame.Angles(c, 0, 0))
				set(side .. "Foot", CFrame.Angles(-(L.a + L.b + c) - footY * 0.3, 0, 0))
			end
		end
	end

	------------------------------------------------------------------ spine
	local breathRate = 1.1 + run * 2.5 + (if state == "Chase" then 1.5 else 0)
	local breath = math.sin(clock * breathRate)
	local fwd = -(lean * 0.55 + run * 0.35)
	if dead then
		set("Abdomen", CFrame.Angles(0.3, 0, 0.2))
		set("Chest", CFrame.Angles(0.2, 0, 0.3))
	elseif airborne then
		set("Abdomen", CFrame.Angles(-0.2, 0, 0))
		set("Chest", CFrame.Angles(-0.25, 0, 0))
	else
		set("Abdomen", CFrame.Angles(fwd * 0.45 + breath * 0.03, -math.sin(phase) * 0.06 * gaitAmp, 0))
		set("Chest", CFrame.Angles(fwd * 0.55 + breath * 0.045, math.sin(phase) * 0.1 * gaitAmp, 0))
	end

	------------------------------------------------------------------ head
	local neck = joints.Neck
	local lookAt = model:GetAttribute("LookAt")
	if typeof(lookAt) == "Vector3" and neck and neck.Part0 and not dead then
		local frame = neck.Part0.CFrame * neck.C0
		local rel = frame:PointToObjectSpace(lookAt)
		local flat = math.sqrt(rel.X * rel.X + rel.Z * rel.Z)
		local ty = math.clamp(math.atan2(-rel.X, -rel.Z), -1.3, 1.3)
		local tp = math.clamp(math.atan2(rel.Y, flat) + 0.16, -0.9, 0.7)
		local rate = if frozen then 1.2 else 3 + run * 3
		yaw = approach(yaw, ty, rate, dt)
		pitch = approach(pitch, tp, rate, dt)
	end
	local tilt = math.sin(clock * 0.37) * 0.2 + twitch.Z
	if state == "Search" then
		pitch -= 0.35 -- nose to the ground, sniffing
	end
	local lunge = 0
	if attackT < 0.45 then
		lunge = math.sin(attackT / 0.45 * math.pi)
	end
	if dead then
		set("Neck", CFrame.Angles(-0.4, 0, 0.3))
		set("Head", CFrame.Angles(-0.3, 0.4, 0.2))
		set("Jaw", CFrame.Angles(-0.45, 0, 0))
	else
		set("Neck", CFrame.fromEulerAnglesYXZ(pitch * 0.4 + twitch.X * 0.3 - lunge * 0.3, yaw * 0.4 + twitch.Y * 0.3, tilt * 0.3))
		set("Head", CFrame.fromEulerAnglesYXZ(pitch * 0.6 + twitch.X, yaw * 0.6 + twitch.Y, tilt))
		local jaw = 0.06 + math.sin(clock * 0.8) * 0.05 + lunge * 0.55
		if state == "Chase" or airborne then
			jaw += 0.3
		elseif state == "Wiggle" then
			jaw += math.max(0, math.sin(realT * 30)) * 0.12 -- chattering, like a cat at a bird
		end
		set("Jaw", CFrame.Angles(-jaw, 0, 0))
	end

	------------------------------------------------------------------ arms
	for i, side in { "Left", "Right" } do
		local s = if side == "Left" then -1 else 1
		local opp = math.sin(phase + (i - 1) * math.pi + math.pi) -- arms swing against the legs
		local ua, la, hand = 0, 0, 0
		local spread = 0
		if dead then
			ua, la, hand, spread = 0.9, -0.6, 0.3, s * 0.5
		elseif airborne then
			ua, la, hand = 1.6, -0.2, 0.5 -- reaching forward, claws out
		else
			-- crouched: arms come forward to the ground like front legs
			ua = crouch * 0.55 + lean * 0.3 + opp * (0.25 * gaitAmp + 0.55 * run) + run * 0.5
			la = -crouch * 0.35 + math.max(0, -opp) * 0.5 * run
			hand = crouch * 0.4 + math.sin(clock * 0.9 + i) * 0.08
			if attackT < 0.45 and s == attackSide then
				local k = attackT / 0.45
				local swing = if k < 0.35 then -0.9 * (k / 0.35) else -0.9 + 2.8 * ((k - 0.35) / 0.65)
				ua += swing
				la -= 0.4
				spread = s * 0.35
			end
		end
		set(side .. "UpperArm", CFrame.Angles(ua, 0, spread + s * math.sin(clock * 0.5 + i) * 0.03))
		set(side .. "LowerArm", CFrame.Angles(la, 0, 0))
		set(side .. "Hand", CFrame.Angles(hand, 0, 0))
		local tense = if state == "Wiggle" or airborne or state == "Chase" then 0.25 else 0
		for f = 1, 4 do
			local curl = 0.1 + tense + math.sin(clock * (1.6 + run * 3) + f * 0.8 + i) * 0.14
			if dead then
				curl = 0.5
			end
			set(side .. "Finger" .. f .. "A", CFrame.Angles(curl, 0, 0))
			set(side .. "Finger" .. f .. "B", CFrame.Angles(curl * 1.4, 0, 0))
		end
	end

	------------------------------------------------------------------ tendrils (its "tail")
	for ti = 1, 12 do
		if not joints[("Tendril%d_1"):format(ti)] then
			break
		end
		for k = 1, 6 do
			local amp = 0.12 + k * 0.02
			local spd = 1.3
			local flat = 0
			if state == "Ambush" or state == "Stalk" then
				flat = -0.35 -- pressed low, only the tips flick
				amp *= if k > 4 then 1.2 else 0.3
			elseif state == "Wiggle" then
				spd, amp = 9, amp * 1.6 -- lashing before the pounce
			elseif state == "Chase" or airborne then
				spd, amp, flat = 4, amp * 1.3, 0.25
			elseif dead then
				spd, amp, flat = 0, 0, -0.25
			end
			local tt = clock * spd
			set(
				("Tendril%d_%d"):format(ti, k),
				CFrame.Angles(
					math.sin(tt + ti * 1.3 + k * 0.6) * amp + (if k == 1 then flat else 0),
					math.sin(tt * 0.7 + ti * 2.1 + k * 0.4) * amp * 0.6,
					math.cos(tt * 0.9 + ti + k * 0.5) * amp
				)
			)
		end
	end
end)
