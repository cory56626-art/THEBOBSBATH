-- Animates the skinwalker on each player's screen, driven by what the server brain is doing.
-- Every bone has a Motor6D called "Joint"; we write Joint.Transform each frame.
-- The pose math mirrors tools/pose.js (where poses are previewed and tuned offline), line for line:
--   * leg IK keeps the feet planted; arm IK plants its hands when it drops to all fours
--   * upright prowl -> low cat crouch to stalk/ambush -> all-fours gallop when chasing
--   * butt-wiggle before a pounce, claws-first leap, swipes, collapse when it starves
--   * freezes like a statue when you stare at it... and its head slowly cranes sideways
--   * eyes catch your flashlight

local RunService = game:GetService("RunService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Sfx = require(ReplicatedStorage:WaitForChild("Sfx"))

local found = workspace:WaitForChild("Skinwalker", 60)
if not found or not found:IsA("Model") then
	return
end
local model: Model = found

local joints: { [string]: Motor6D } = {}
for _, d in model:GetDescendants() do
	if d:IsA("Motor6D") and d.Name == "Joint" and d.Part1 then
		joints[d.Part1.Name] = d
	end
end
local function off(name: string): Vector3
	local j = joints[name]
	return if j then j.C0.Position else Vector3.zero
end

-------------------------------------------------------------------------------- rig info (as in pose.js)
local K_META = 0.8
local GROUND_Y = -6

type Leg = { K0: Vector2, H0: Vector2, A0: Vector2, a: number, b: number }
type Arm = { E0: Vector3, W0: Vector3, a: number, r: number, b: number }
local legs: { [string]: Leg } = {}
local arms: { [string]: Arm } = {}
local shoulderOff: { [string]: Vector3 } = {}
for _, s in { "Left", "Right" } do
	local k, h, a = off(s .. "Shin"), off(s .. "Meta"), off(s .. "Foot")
	legs[s] = { K0 = Vector2.new(k.Y, k.Z), H0 = Vector2.new(h.Y, h.Z), A0 = Vector2.new(a.Y, a.Z), a = 0, b = 0 }
	arms[s] = { E0 = off(s .. "LowerArm"), W0 = off(s .. "Hand"), a = 0, r = 0, b = 0 }
	shoulderOff[s] = off(s .. "UpperArm")
end
local abdOff, chestOff = off("Abdomen"), off("Chest")

local function rot2(v: Vector2, ang: number): Vector2
	local c, s = math.cos(ang), math.sin(ang)
	return Vector2.new(v.X * c - v.Y * s, v.X * s + v.Y * c)
end
local function legFK(L: Leg, a: number, b: number): Vector2
	return rot2(L.K0, a) + rot2(L.H0, a + b) + rot2(L.A0, a + b - K_META * b)
end
local function solveLeg(L: Leg, T: Vector2)
	local a, b = L.a, L.b
	for _ = 1, 8 do
		local p = legFK(L, a, b)
		local e = T - p
		if e.Magnitude < 0.01 then
			break
		end
		local pa, pb = legFK(L, a + 1e-3, b), legFK(L, a, b + 1e-3)
		local j11, j12 = (pa.X - p.X) / 1e-3, (pb.X - p.X) / 1e-3
		local j21, j22 = (pa.Y - p.Y) / 1e-3, (pb.Y - p.Y) / 1e-3
		local det = j11 * j22 - j12 * j21
		if math.abs(det) < 1e-6 then
			break
		end
		local da, db = (j22 * e.X - j12 * e.Y) / det, (-j21 * e.X + j11 * e.Y) / det
		local s = math.min(1, 0.4 / math.max(math.abs(da), math.abs(db), 1e-6))
		a = math.clamp(a + da * s, -1.3, 1.3)
		b = math.clamp(b + db * s, -1.7, 1.2)
	end
	L.a, L.b = a, b
end

local function rx(a: number, v: Vector3): Vector3
	local c, s = math.cos(a), math.sin(a)
	return Vector3.new(v.X, v.Y * c - v.Z * s, v.Y * s + v.Z * c)
end
local function rz(a: number, v: Vector3): Vector3
	local c, s = math.cos(a), math.sin(a)
	return Vector3.new(v.X * c - v.Y * s, v.X * s + v.Y * c, v.Z)
end
local function armFK(A: Arm, a: number, r: number, b: number): Vector3
	return rx(a, rz(r, A.E0)) + rx(a, rz(r, rx(b, A.W0)))
end
local function det3(m: { { number } }): number
	return m[1][1] * (m[2][2] * m[3][3] - m[2][3] * m[3][2]) - m[1][2] * (m[2][1] * m[3][3] - m[2][3] * m[3][1])
		+ m[1][3] * (m[2][1] * m[3][2] - m[2][2] * m[3][1])
end
local function solve3(M: { { number } }, b: { number }): { number }
	local d = det3(M)
	if math.abs(d) < 1e-9 then
		return { 0, 0, 0 }
	end
	local out = {}
	for k = 1, 3 do
		local m = {}
		for r = 1, 3 do
			m[r] = {}
			for c = 1, 3 do
				m[r][c] = if c == k then b[r] else M[r][c]
			end
		end
		out[k] = det3(m) / d
	end
	return out
end
local LO, HI = { -1.4, -0.7, -0.15 }, { 2.4, 0.7, 2.4 }
local function solveArm(A: Arm, T: Vector3)
	local x = { A.a, A.r, A.b }
	for _ = 1, 8 do
		local p = armFK(A, x[1], x[2], x[3])
		local err = T - p
		if err.Magnitude < 0.02 then
			break
		end
		local e = { err.X, err.Y, err.Z }
		local J = { { 0, 0, 0 }, { 0, 0, 0 }, { 0, 0, 0 } }
		for k = 1, 3 do
			local xx = { x[1], x[2], x[3] }
			xx[k] += 1e-3
			local q = armFK(A, xx[1], xx[2], xx[3])
			local dq = { (q.X - p.X) / 1e-3, (q.Y - p.Y) / 1e-3, (q.Z - p.Z) / 1e-3 }
			for r = 1, 3 do
				J[r][k] = dq[r]
			end
		end
		local M = { { 0, 0, 0 }, { 0, 0, 0 }, { 0, 0, 0 } }
		for r = 1, 3 do
			for c = 1, 3 do
				local s = 0
				for k = 1, 3 do
					s += J[r][k] * J[c][k]
				end
				M[r][c] = s + (if r == c then 0.05 else 0)
			end
		end
		local y = solve3(M, e)
		for k = 1, 3 do
			local d = 0
			for r = 1, 3 do
				d += J[r][k] * y[r]
			end
			x[k] = math.clamp(x[k] + math.clamp(d, -0.4, 0.4), LO[k], HI[k])
		end
	end
	A.a, A.r, A.b = x[1], x[2], x[3]
end

-------------------------------------------------------------------------------- the pose (mirror of computePose)
type Params = {
	crouch: number, lean: number, quad: number, phase: number, gait: number, stride: number, lift: number,
	wig: number, sway: number, breath: number, yaw: number, pitch: number, tilt: number, jaw: number,
	air: number, atk: number, atkSide: number, dead: number, curl: number, t: number,
	tspd: number, tamp: number, tflat: number,
	liftL: number, liftR: number, -- ground height under each foot vs. under the body (steps, stairs)
}

local function set(name: string, cf: CFrame)
	local j = joints[name]
	if j then
		j.Transform = cf
	end
end

local SIDES = { "Left", "Right" }

local function applyPose(P: Params)
	local drop = P.crouch * 1.7 + P.quad * 0.8
	local bob = -math.abs(math.sin(P.phase)) * 0.2 * P.gait

	local abd = -(P.lean * 0.30 + P.quad * 0.40) + P.breath * 0.03
	local chest = -(P.lean * 0.36 + P.quad * 0.50) + P.breath * 0.045
	if P.air > 0 then
		abd = abd * (1 - P.air) - 0.3 * P.air
		chest = chest * (1 - P.air) - 0.35 * P.air
	end
	if P.dead > 0 then
		abd = abd * (1 - P.dead) + 0.3 * P.dead
		chest = chest * (1 - P.dead) + 0.25 * P.dead
	end
	local pelvisY = -drop + bob - 4.4 * P.dead
	set("Pelvis", CFrame.new(0, pelvisY, 0) * CFrame.Angles(0.15 * P.dead, P.wig + P.sway, P.wig * 0.6 + 1.3 * P.dead))
	set("Abdomen", CFrame.Angles(abd, -math.sin(P.phase) * 0.05 * P.gait, 0))
	set("Chest", CFrame.Angles(chest, math.sin(P.phase) * 0.08 * P.gait, 0))
	local spine = abd + chest

	-- legs
	for i, side in SIDES do
		local L = legs[side]
		local ph = P.phase + (i - 1) * math.pi
		local a, b
		if P.air > 0.5 then
			a, b = -0.75, 0.5
		elseif P.dead > 0.5 then
			a, b = 0.9, -1.2
		else
			local footZ = -P.stride * (1 - 0.25 * P.quad) * math.sin(ph) + P.quad * 0.2
			local footY = P.lift * math.max(0, math.cos(ph))
			local rest = L.K0 + L.H0 + L.A0
			local ground = if side == "Left" then P.liftL else P.liftR
			solveLeg(L, rest + Vector2.new(drop - bob + footY + ground, footZ))
			a, b = L.a, L.b
		end
		local c = -K_META * b
		set(side .. "Thigh", CFrame.Angles(a, 0, 0))
		set(side .. "Shin", CFrame.Angles(b, 0, 0))
		set(side .. "Meta", CFrame.Angles(c, 0, 0))
		set(side .. "Foot", CFrame.Angles(-(a + b + c), 0, 0))
	end

	-- arms
	local pelvisJ = Vector3.new(0, pelvisY, 0)
	local abdJ = pelvisJ + abdOff
	local chestJ = abdJ + rx(abd, chestOff)
	for i, side in SIDES do
		local s = if side == "Left" then -1 else 1
		local A = arms[side]
		local ph = P.phase + (i - 1) * math.pi + math.pi
		local ua = -spine * 0.85 + 0.18 * math.sin(ph) * P.gait + 0.08
		local ur = s * 0.04
		local la = 0.18 + 0.1 * P.gait
		local hand = 0.15
		if P.quad > 0.01 and P.air < 0.5 and P.dead < 0.5 then
			local shoulder = chestJ + rx(spine, shoulderOff[side])
			local reachZ = -1.6 - P.stride * 0.9 * math.sin(ph)
			local lift = P.lift * 0.8 * math.max(0, math.cos(ph))
			local target = Vector3.new(shoulder.X * 1.1, GROUND_Y + 1.5 + lift, shoulder.Z + reachZ)
			solveArm(A, rx(-spine, target - shoulder))
			local q = P.quad
			ua = ua * (1 - q) + A.a * q
			ur = ur * (1 - q) + A.r * q
			la = la * (1 - q) + A.b * q
			hand = hand * (1 - q) + (-(spine + A.a + A.b) + 0.1) * q
		end
		if P.air > 0 then
			local k = P.air
			ua = ua * (1 - k) + 1.45 * k
			ur *= 1 - k
			la = la * (1 - k) + 0.1 * k
			hand = hand * (1 - k) + 0.5 * k
		end
		if P.atk >= 0 and s == P.atkSide then
			local k = P.atk
			local swing = if k < 0.35 then -1.0 * (k / 0.35) else -1.0 + 2.9 * ((k - 0.35) / 0.65)
			ua += swing
			la -= 0.5 * math.sin(k * math.pi)
			ur += s * 0.4 * math.sin(k * math.pi)
		end
		if P.dead > 0 then
			local k = P.dead
			ua = ua * (1 - k) + 0.5 * k
			ur = ur * (1 - k) + (if s > 0 then -1.3 else 0.3) * k
			la = la * (1 - k) + 0.6 * k
		end
		set(side .. "UpperArm", CFrame.Angles(ua, 0, ur))
		set(side .. "LowerArm", CFrame.Angles(la, 0, 0))
		set(side .. "Hand", CFrame.Angles(hand, 0, 0))
		for f = 1, 4 do
			local curl = P.curl + math.sin(P.t * 1.6 + f * 0.8 + i) * 0.1
			set(side .. "Finger" .. f .. "A", CFrame.Angles(curl, 0, 0))
			set(side .. "Finger" .. f .. "B", CFrame.Angles(curl * 1.4, 0, 0))
		end
	end

	-- head
	local comp = -spine
	local lunge = if P.atk >= 0 then math.sin(P.atk * math.pi) else 0
	set("Neck", CFrame.fromEulerAnglesYXZ(P.pitch * 0.4 + comp * 0.55 - lunge * 0.3 - 0.4 * P.dead, P.yaw * 0.4, P.tilt * 0.3))
	set("Head", CFrame.fromEulerAnglesYXZ(P.pitch * 0.6 + comp * 0.3 - 0.3 * P.dead, P.yaw * 0.6, P.tilt))
	set("Jaw", CFrame.Angles(-(P.jaw + lunge * 0.55), 0, 0))

	-- tendrils
	for ti = 1, 12 do
		if not joints[("Tendril%d_1"):format(ti)] then
			break
		end
		for k = 1, 6 do
			local amp = (0.12 + k * 0.02) * P.tamp
			local tt = P.t * P.tspd
			set(("Tendril%d_%d"):format(ti, k), CFrame.Angles(
				math.sin(tt + ti * 1.3 + k * 0.6) * amp + (if k == 1 then P.tflat else 0),
				math.sin(tt * 0.7 + ti * 2.1 + k * 0.4) * amp * 0.6,
				math.cos(tt * 0.9 + ti + k * 0.5) * amp
			))
		end
	end
end

-------------------------------------------------------------------------------- driving the pose from the brain
local function approach(cur: number, target: number, rate: number, dt: number): number
	return cur + (target - cur) * math.min(1, dt * rate)
end

local CROUCH = { Ambush = 1, Wiggle = 1, Stalk = 0.7, Toy = 0.4, Feed = 0.85, Search = 0.35, Attack = 0.25, Locker = 0.45,
	Prowl = 0.08, Chase = 0.1, Pounce = 0, Dead = 0 }
local LEAN = { Ambush = 0.55, Wiggle = 0.6, Stalk = 0.5, Toy = 0.35, Feed = 0.75, Search = 0.55, Attack = 0.4, Locker = 0.6,
	Prowl = 0.25, Chase = 0.35, Pounce = 0.5, Dead = 0 }
local QUAD = { Ambush = 0.65, Wiggle = 0.75, Stalk = 0.35, Toy = 0.3, Feed = 0.5, Search = 0.3, Attack = 0, Locker = 0.25,
	Prowl = 0, Chase = 1, Pounce = 0, Dead = 0 }

local P: Params = {
	crouch = 0, lean = 0.2, quad = 0, phase = 0, gait = 0, stride = 0, lift = 0, wig = 0, sway = 0, breath = 0,
	yaw = 0, pitch = 0, tilt = 0, jaw = 0.08, air = 0, atk = -1, atkSide = 1, dead = 0, curl = 0.15, t = 0,
	tspd = 1.3, tamp = 1, tflat = 0, liftL = 0, liftR = 0,
}
local footRay = RaycastParams.new()
footRay.FilterType = Enum.RaycastFilterType.Exclude

-- creature sound state
local headPart = model:FindFirstChild("Head") :: BasePart?
local lastState = ""
local breathIn = true
local nextBreath = 1
local nextClick = 4
local nextGrowl = 0
local lastStinger = -99
local stepIdx = 0
local rng = Random.new()
local clock = 0
local realT = 0
local twitch = Vector3.zero
local nextTwitch = 2
local craneTilt = 0
local attackT, lastAttackSeq = 99, model:GetAttribute("AttackSeq") or 0
local atkSide = 1
local pounceT, lastPounceSeq = 99, model:GetAttribute("PounceSeq") or 0
local deadT = 0

-- eyes: dim until light hits them
local eyes: { BasePart } = {}
for _, d in model:GetDescendants() do
	if d:IsA("BasePart") and d.Name == "Eye" then
		table.insert(eyes, d)
		local glow = Instance.new("PointLight")
		glow.Name = "Eyeshine"
		glow.Color = Color3.fromRGB(255, 170, 90)
		glow.Range = 4
		glow.Brightness = 0
		glow.Parent = d
	end
end
local EYE_DIM, EYE_LIT = Color3.fromRGB(120, 70, 30), Color3.fromRGB(255, 215, 150)

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
	clock += if frozen then dt * 0.05 else dt

	local vel = root.AssemblyLinearVelocity
	local speed = Vector3.new(vel.X, 0, vel.Z).Magnitude

	-- one-shot triggers
	local aSeq = model:GetAttribute("AttackSeq") or 0
	if aSeq ~= lastAttackSeq then
		lastAttackSeq, attackT, atkSide = aSeq, 0, -atkSide
	end
	attackT += dt
	local pSeq = model:GetAttribute("PounceSeq") or 0
	if pSeq ~= lastPounceSeq then
		lastPounceSeq, pounceT = pSeq, 0
	end
	pounceT += dt
	deadT = if dead then deadT + dt else 0
	local airborne = (state == "Pounce" and pounceT < 1.4) or model:GetAttribute("Climbing") == true

	-- posture blends
	local quadTarget = QUAD[state] or 0
	if state == "Chase" then
		quadTarget = math.clamp((speed - 12) / 5, 0, 1)
	end
	P.crouch = approach(P.crouch, if frozen then 0.8 else (CROUCH[state] or 0.1), 3, dt)
	P.lean = approach(P.lean, LEAN[state] or 0.25, 3, dt)
	P.quad = approach(P.quad, if frozen then 0.5 else quadTarget, 3, dt)
	P.air = approach(P.air, if airborne then 1 else 0, 12, dt)
	P.dead = approach(P.dead, if dead then 1 else 0, 2.5, dt)
	P.wig = (if state == "Wiggle" then math.sin(realT * 24) * 0.14 else 0)
	P.sway = math.sin(clock * 0.4) * 0.04

	-- gait: long, heavy strides
	P.stride = math.min(2.2, 0.9 + speed * 0.065)
	P.lift = math.min(1.2, speed * 0.07)
	P.gait = approach(P.gait, math.clamp(speed / 6, 0, 1), 6, dt)
	local phaseBefore = P.phase
	if speed > 0.5 then
		P.phase += dt * math.pi * speed / (2 * P.stride)
	else
		P.phase = approach(P.phase, math.round(P.phase / math.pi) * math.pi, 4, dt)
	end
	local breathRate = 1.1 + P.quad * 2.5
	P.breath = math.sin(clock * breathRate)

	-- twitches; while frozen under your gaze its head slowly cranes sideways, then snaps
	nextTwitch -= dt
	if nextTwitch <= 0 then
		twitch = Vector3.new(rng:NextNumber(-0.3, 0.3), rng:NextNumber(-0.35, 0.35), rng:NextNumber(-0.45, 0.45))
		if frozen then
			craneTilt = if craneTilt > 0 then -1.15 else 1.15
			twitch *= 0.3
		end
		nextTwitch = if frozen then rng:NextNumber(2.5, 5) else rng:NextNumber(1.8, 5)
	end
	twitch *= math.exp(-dt * 7)
	if not frozen then
		craneTilt = approach(craneTilt, 0, 2, dt)
	end

	-- head look: glance over the shoulder when you're behind it (the body turns; the head never twists into it)
	local neck = joints.Neck
	local lookAt = model:GetAttribute("LookAt")
	local ty, tp = 0, 0
	if typeof(lookAt) == "Vector3" and neck and neck.Part0 then
		local frame = neck.Part0.CFrame * neck.C0
		local rel = frame:PointToObjectSpace(lookAt)
		local raw = math.atan2(-rel.X, -rel.Z)
		ty = if math.abs(raw) > 1.9 then math.sign(raw) * 0.6 else math.clamp(raw, -1.0, 1.0)
		tp = math.clamp(math.atan2(rel.Y, math.sqrt(rel.X * rel.X + rel.Z * rel.Z)) + 0.16, -0.6, 0.5)
	end
	if state == "Search" then
		tp -= 0.4 -- nose to the ground
		ty += math.sin(realT * 1.3) * 0.5
	end
	local rate = if frozen then 0.8 else 3 + P.quad * 3
	P.yaw = approach(P.yaw, ty + twitch.Y, rate, dt)
	P.pitch = approach(P.pitch, tp + twitch.X, rate, dt)
	local targetTilt = math.sin(clock * 0.37) * 0.18 + twitch.Z + craneTilt
	P.tilt = approach(P.tilt, targetTilt, if frozen then 0.6 else 6, dt)

	-- jaw
	local jaw = 0.06 + math.sin(clock * 0.8) * 0.05
	if state == "Chase" or airborne then
		jaw += 0.3
	elseif state == "Wiggle" then
		jaw += math.max(0, math.sin(realT * 30)) * 0.12 -- chattering
	elseif frozen then
		jaw += 0.18
	end
	P.jaw = approach(P.jaw, jaw, 10, dt)

	P.atk = if attackT < 0.45 then attackT / 0.45 else -1
	P.atkSide = atkSide
	P.curl = 0.15 + (if state == "Wiggle" or airborne or state == "Chase" then 0.25 else 0) + P.quad * 0.15
	P.t = clock
	if dead then
		P.tspd, P.tamp, P.tflat = 0, 0, -0.25
	elseif state == "Wiggle" then
		P.tspd, P.tamp, P.tflat = 9, 1.6, 0
	elseif state == "Chase" or airborne then
		P.tspd, P.tamp, P.tflat = 4, 1.3, 0.25
	elseif state == "Ambush" or state == "Stalk" or frozen then
		P.tspd, P.tamp, P.tflat = 1, 0.4, -0.35
	else
		P.tspd, P.tamp, P.tflat = 1.3, 1, 0
	end

	-- feet find the floor under them (steps, stairs, debris)
	local ignore = { model }
	for _, plr in Players:GetPlayers() do
		if plr.Character then
			table.insert(ignore, plr.Character)
		end
	end
	footRay.FilterDescendantsInstances = ignore
	local nominal = root.Position.Y - 6
	for _, side in SIDES do
		local foot = model:FindFirstChild(side .. "Foot") :: BasePart?
		local lift = 0
		if foot and not airborne and not dead then
			local from = Vector3.new(foot.Position.X, root.Position.Y, foot.Position.Z)
			local hit = workspace:Raycast(from, Vector3.new(0, -12, 0), footRay)
			if hit then
				lift = math.clamp(hit.Position.Y - nominal, -1.5, 3)
			end
		end
		if side == "Left" then
			P.liftL = approach(P.liftL, lift, 12, dt)
		else
			P.liftR = approach(P.liftR, lift, 12, dt)
		end
	end

	applyPose(P)

	------------------------------------------------------------------ sounds
	if headPart and not dead then
		local me = Players.LocalPlayer.Character
		if state ~= lastState then
			if state == "Chase" then
				Sfx.any("Creature", { "Growl1", "Growl2" }, headPart, { volume = 1.2, range = 120 })
				nextGrowl = realT + rng:NextNumber(3, 6)
				if me and model:GetAttribute("Target") == me.Name and realT - lastStinger > 25 then
					lastStinger = realT
					Sfx.play("Creature", "Stinger", nil, { volume = 0.55 })
				end
				if rng:NextNumber() < 0.5 then
					Sfx.play("Creature", "Screech", headPart, { volume = 1.1, range = 140 })
				end
			elseif state == "Wiggle" then
				Sfx.play("Creature", "Chatter", headPart, { volume = 0.9, range = 60 })
			elseif state == "Toy" then
				Sfx.play("Creature", "Growl3", headPart, { volume = 0.9, range = 70, pitch = 0.9 })
			end
			lastState = state
		end
		-- breathing: slow and wet when lurking, ragged when it runs
		if realT > nextBreath then
			local fast = state == "Chase" or airborne
			local quiet = state == "Ambush" or state == "Stalk" or frozen
			Sfx.play("Creature", if breathIn then (if rng:NextNumber() < 0.5 then "BreathIn1" else "BreathIn2")
				else (if rng:NextNumber() < 0.5 then "BreathOut1" else "BreathOut2"), headPart, {
				volume = if quiet then 0.45 elseif fast then 0.95 else 0.7,
				pitch = if fast then 1.25 else 0.95 + rng:NextNumber() * 0.1,
				range = if quiet then 40 else 70,
			})
			breathIn = not breathIn
			nextBreath = realT + (if fast then 0.7 elseif quiet then 2.4 else 1.8) * rng:NextNumber(0.85, 1.15)
		end
		-- throat clicks while it lurks
		if realT > nextClick then
			nextClick = realT + rng:NextNumber(4, 10)
			if state ~= "Chase" and state ~= "Pounce" then
				Sfx.any("Creature", { "Clicks1", "Clicks2" }, headPart, { volume = 0.75, range = 55 })
			end
		end
		if state == "Chase" and realT > nextGrowl then
			nextGrowl = realT + rng:NextNumber(4, 7)
			Sfx.any("Creature", { "Growl1", "Growl2", "Growl3" }, headPart, { volume = 1.1, range = 110 })
		end
		-- footsteps on each footfall (and claws when it gallops on all fours)
		local function k(ph: number): number
			return math.floor((ph - math.pi / 2) / math.pi)
		end
		if speed > 2 and not airborne and k(P.phase) ~= k(phaseBefore) then
			stepIdx += 1
			local foot = model:FindFirstChild(if stepIdx % 2 == 0 then "LeftFoot" else "RightFoot") or headPart
			Sfx.any("Creature", { "Step1", "Step2", "Step3" }, foot, {
				volume = 0.45 + math.min(speed, 24) / 30, pitch = 0.9 + rng:NextNumber() * 0.2, range = 90 })
			if P.quad > 0.5 or rng:NextNumber() < 0.35 then
				Sfx.play("Creature", "Claws", foot, { volume = 0.5, range = 45 })
			end
		end
	end
	if aSeq ~= 0 and attackT < dt * 1.5 and headPart then
		Sfx.play("Creature", "Swipe", headPart, { volume = 1, range = 60 })
	end
	if pSeq ~= 0 and pounceT < dt * 1.5 and headPart then
		Sfx.play("Creature", "Screech", headPart, { volume = 1.2, range = 140 })
	end

	-- eyeshine: eyes flare when your flashlight is on and pointed at it
	local cam = workspace.CurrentCamera
	local char = Players.LocalPlayer.Character
	local lit = false
	if cam and char and char:GetAttribute("Flashlight") == true and #eyes > 0 then
		local to = eyes[1].Position - cam.CFrame.Position
		lit = to.Magnitude < 150 and cam.CFrame.LookVector:Dot(to.Unit) > 0.88
	end
	for _, e in eyes do
		e.Color = if lit then EYE_LIT else EYE_DIM
		local g = e:FindFirstChild("Eyeshine") :: PointLight?
		if g then
			g.Brightness = if lit then 3 else 0.4
		end
	end
end)
