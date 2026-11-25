-- Procedural animations for every player character (R15), run on every client so everyone sees them:
--   walk, sprint (lean in, pumping arms, long strides), crouch-walk (low, careful), idle breathing, jump/fall.
-- Footstep sounds fire exactly when each foot lands, chosen by gait: soft crouch steps, walking, running.
-- (The default Animate script and default footsteps are replaced in StarterCharacterScripts/StarterPlayerScripts.)
-- We pose joints through Motor6D.C0 (rest C0 * pose) rather than .Transform: the Humanoid's Animator owns
-- .Transform on player characters and resets it every frame.
-- Joints are looked up again whenever they change: when your avatar loads, Roblox swaps in your avatar's body
-- parts with brand-new joints, and an animator holding on to the old ones moves nothing (the "stiff" bug).

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Sfx = require(ReplicatedStorage:WaitForChild("Sfx"))

type Rig = {
	char: Model, hum: Humanoid, root: BasePart, r6: boolean, errored: boolean?,
	j: { [string]: Motor6D },
	c0: { [Motor6D]: CFrame },
	last: { [Motor6D]: CFrame },
	phase: number, speed: number, crouch: number, sprint: number, air: number, t: number, lastStep: number,
}
local rigs: { [Model]: Rig } = {}

local JOINTS = {
	Root = "LowerTorso", Waist = "UpperTorso", Neck = "Head",
	LeftShoulder = "LeftUpperArm", LeftElbow = "LeftLowerArm", LeftWrist = "LeftHand",
	RightShoulder = "RightUpperArm", RightElbow = "RightLowerArm", RightWrist = "RightHand",
	LeftHip = "LeftUpperLeg", LeftKnee = "LeftLowerLeg", LeftAnkle = "LeftFoot",
	RightHip = "RightUpperLeg", RightKnee = "RightLowerLeg", RightAnkle = "RightFoot",
}

-- classic 6-part avatars (R6) have no elbows/knees; their limbs swing about each joint's Z axis
local JOINTS_R6 = {
	["Right Shoulder"] = "Torso", ["Left Shoulder"] = "Torso", ["Right Hip"] = "Torso", ["Left Hip"] = "Torso",
	Neck = "Torso", RootJoint = "HumanoidRootPart",
}

local function attach(char: Model)
	local hum = char:WaitForChild("Humanoid", 10) :: Humanoid?
	local root = char:WaitForChild("HumanoidRootPart", 10) :: BasePart?
	if not hum or not root then
		return
	end
	local r6 = hum.RigType == Enum.HumanoidRigType.R6
	local j, c0 = {}, {}
	rigs[char] = { char = char, hum = hum, root = root, r6 = r6, j = j, c0 = c0, last = {}, phase = 0, speed = 0, crouch = 0, sprint = 0,
		air = 0, t = math.random() * 10, lastStep = 0 }
	char.AncestryChanged:Connect(function(_, parent)
		if not parent then
			rigs[char] = nil
		end
	end)
end

local function watch(p: Player)
	p.CharacterAdded:Connect(attach)
	if p.Character then
		task.spawn(attach, p.Character)
	end
end
Players.PlayerAdded:Connect(watch)
for _, p in Players:GetPlayers() do
	watch(p)
end

local function approach(cur: number, target: number, rate: number, dt: number): number
	return cur + (target - cur) * math.min(1, dt * rate)
end

local STEPS = {
	crouch = { "Crouch1", "Crouch2" },
	walk = { "Walk1", "Walk2", "Walk3", "Walk4" },
	run = { "Run1", "Run2", "Run3", "Run4" },
}

-- current joint by name (re-found if the avatar swapped body parts)
local function joint(R: Rig, name: string): Motor6D?
	local m = R.j[name]
	if m and m.Parent and m:IsDescendantOf(R.char) then
		return m
	end
	local partName = (if R.r6 then JOINTS_R6 else JOINTS)[name]
	local part = partName and R.char:FindFirstChild(partName)
	local found = part and part:FindFirstChild(name)
	if found and found:IsA("Motor6D") then
		R.j[name] = found
		R.c0[found] = found.C0
		R.last[found] = nil
		return found
	end
	R.j[name] = nil
	return nil
end

local function pose(R: Rig, m: Motor6D?, cf: CFrame)
	if m then
		local last = R.last[m]
		if last and m.C0 ~= last then
			R.c0[m] = m.C0 -- something else (avatar scaling) changed the rest pose: adopt it
		end
		local base = R.c0[m]
		if base then
			local new = base * cf
			m.C0 = new
			R.last[m] = new
		end
	end
end

local function animate(R: Rig, dt: number)
	local j = setmetatable({}, { __index = function(_, name)
		return joint(R, name)
	end }) :: any
	local hum, root = R.hum, R.root
	local v = root.AssemblyLinearVelocity
	local speed = Vector3.new(v.X, 0, v.Z).Magnitude
	local state = hum:GetState()
	local airborne = state == Enum.HumanoidStateType.Freefall or state == Enum.HumanoidStateType.Jumping
	local hidden = R.char:GetAttribute("Hidden") == true
	if hidden or hum.Health <= 0 then
		speed = 0
	end
	R.t += dt
	R.speed = approach(R.speed, speed, 10, dt)
	R.crouch = approach(R.crouch, if R.char:GetAttribute("Crouching") == true then 1 else 0, 8, dt)
	R.sprint = approach(R.sprint, math.clamp((speed - 18) / 6, 0, 1), 6, dt)
	R.air = approach(R.air, if airborne then 1 else 0, 10, dt)

	-- gait cycle length (studs per two steps) depends on the gait
	local cycle = 9 + R.sprint * 4 - R.crouch * 3.5
	local moving = math.clamp(R.speed / 4, 0, 1) * (1 - R.air)
	local before = R.phase
	R.phase += 2 * math.pi * R.speed / cycle * dt * (1 - R.air)
	if moving < 0.05 then
		R.phase = approach(R.phase, math.round(R.phase / math.pi) * math.pi, 4, dt)
	end

	-- footstep exactly when a heel lands (phase crosses pi/2 + k*pi)
	local function k(ph: number): number
		return math.floor((ph - math.pi / 2) / math.pi)
	end
	if moving > 0.3 and k(R.phase) ~= k(before) and os.clock() - R.lastStep > 0.12 then
		R.lastStep = os.clock()
		local left = k(R.phase) % 2 == 0
		local foot = R.char:FindFirstChild(if left then "LeftFoot" else "RightFoot") or root
		local kind = if R.crouch > 0.5 then "crouch" elseif R.sprint > 0.5 then "run" else "walk"
		Sfx.any("Player", STEPS[kind], foot, {
			volume = if kind == "crouch" then 0.25 elseif kind == "run" then 0.9 else 0.55,
			pitch = 0.92 + math.random() * 0.16,
			range = if kind == "crouch" then 25 elseif kind == "run" then 95 else 60,
		})
	end

	local s = math.sin(R.phase)
	local c = math.cos(R.phase)

	if R.r6 then
		-- R6 (the game's avatar type). Mirrors tools/r6_preview.py, checked on a standard R6 rig:
		-- right-side joints swing forward with +Z, left-side with -Z; RootJoint/Neck: +X leans forward, +Z is up.
		local m = moving
		local legAmp = (0.55 + R.sprint * 0.4) * m * (1 - 0.5 * R.crouch)
		local armAmp = (0.5 + R.sprint * 0.6) * m * (1 - 0.6 * R.crouch)
		local lean6 = 0.06 * m + 0.25 * R.sprint + 0.35 * R.crouch
		local drop = 0.85 * R.crouch
		local bob6 = -math.abs(s) * (0.1 + 0.1 * R.sprint) * m
		local crouchLegs = 0.95 * R.crouch
		local legL = legAmp * s + lean6 + crouchLegs + 0.3 * R.air
		local legR = -legAmp * s + lean6 + crouchLegs - 0.2 * R.air
		local breathe6 = math.sin(R.t * 1.6) * 0.04 * (1 - m)
		local armL = -armAmp * s + 0.45 * R.crouch + 0.15 * R.sprint + 1.1 * R.air + breathe6
		local armR = armAmp * s + 0.45 * R.crouch + 0.15 * R.sprint + 1.1 * R.air + breathe6
		pose(R, j.RootJoint, CFrame.new(0, 0, -drop + bob6) * CFrame.Angles(lean6, 0, 0))
		pose(R, j.Neck, CFrame.Angles(-lean6 * 0.7, 0, 0))
		pose(R, j["Left Hip"], CFrame.Angles(0, 0, -legL))
		pose(R, j["Right Hip"], CFrame.Angles(0, 0, legR))
		pose(R, j["Left Shoulder"], CFrame.Angles(0, 0, -armL))
		pose(R, j["Right Shoulder"], CFrame.Angles(0, 0, armR))
		return
	end
	local amp = (0.55 + R.sprint * 0.4 - R.crouch * 0.18) * moving
	local lean = 0.05 * moving + R.sprint * 0.2 + R.crouch * 0.3
	local bob = -math.abs(s) * (0.12 + R.sprint * 0.12) * moving
	local breathe = math.sin(R.t * 1.6) * 0.025 * (1 - moving)

	-- crouch folds the legs (the owner lowers HipHeight to match)
	local cHip, cKnee, cAnkle = 0.95 * R.crouch, -1.55 * R.crouch, 0.6 * R.crouch

	local function legs(side: string, ph: number)
		local sp, cp = math.sin(ph), math.cos(ph)
		local hip = amp * sp + cHip
		local knee = -(0.08 + (0.9 + R.sprint * 0.5) * math.max(0, cp) * moving) + cKnee
		local ankle = -(hip + knee) * 0.45 + cAnkle * 0.4
		if R.air > 0 then
			hip = hip * (1 - R.air) + (if side == "Left" then 0.55 else 0.2) * R.air
			knee = knee * (1 - R.air) - (if side == "Left" then 0.9 else 0.5) * R.air
		end
		local hj, kj, aj = j[side .. "Hip"], j[side .. "Knee"], j[side .. "Ankle"]
		pose(R, hj, CFrame.Angles(hip, 0, 0))
		pose(R, kj, CFrame.Angles(knee, 0, 0))
		pose(R, aj, CFrame.Angles(ankle, 0, 0))
	end
	legs("Left", R.phase)
	legs("Right", R.phase + math.pi)

	local function arm(side: string, ph: number)
		local sgn = if side == "Left" then -1 else 1
		local swing = -(0.45 + R.sprint * 0.5) * math.sin(ph) * moving
		local forward = R.crouch * 0.35 + R.sprint * 0.15
		local elbow = 0.2 + R.sprint * 1.15 + R.crouch * 0.5 + 0.25 * math.max(0, -math.sin(ph)) * moving
		if R.air > 0 then
			swing = swing * (1 - R.air) + 0.5 * R.air
			elbow = elbow * (1 - R.air) + 0.6 * R.air
		end
		local sj, ej = j[side .. "Shoulder"], j[side .. "Elbow"]
		pose(R, sj, CFrame.Angles(swing + forward, 0, sgn * (0.06 + 0.04 * R.air)))
		pose(R, ej, CFrame.Angles(elbow, 0, 0))
	end
	arm("Left", R.phase + math.pi)
	arm("Right", R.phase)

	-- lean happens at the waist so the legs stay planted under the hips
	pose(R, j.Root, CFrame.new(0, bob, 0) * CFrame.Angles(0, 0.06 * s * moving, 0))
	pose(R, j.Waist, CFrame.Angles(breathe - lean, -0.12 * s * moving * (1 + R.sprint), 0))
	pose(R, j.Neck, CFrame.Angles(lean * 0.8, 0.05 * s * moving, 0))
end

-- status for the diagnostics reporter
local framesAnimated = 0
_G.AnimatorStatus = function(): string
	local me = Players.LocalPlayer.Character
	local R = me and rigs[me]
	if not R then
		local count = 0
		for _ in rigs do
			count += 1
		end
		return ("no rig for my character (rigs=%d, hasCharacter=%s)"):format(count, tostring(me ~= nil))
	end
	local n = 0
	for name in (if R.r6 then JOINTS_R6 else JOINTS) do
		if joint(R, name) then
			n += 1
		end
	end
	return ("rig=%s joints=%d frames=%d speed=%.1f phase=%.1f crouch=%.2f"):format(if R.r6 then "R6" else "R15", n,
		framesAnimated, R.speed, R.phase, R.crouch)
end

RunService.PreSimulation:Connect(function(dt)
	dt = math.min(dt, 0.1)
	for _, R in rigs do
		if R.char.Parent then
			local ok, err = pcall(animate, R, dt)
			if not ok and not R.errored then
				R.errored = true
				warn("[CharacterAnimator] " .. tostring(err))
			end
			framesAnimated += 1
		end
	end
end)
