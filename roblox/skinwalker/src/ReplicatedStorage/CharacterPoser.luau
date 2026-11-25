-- Procedural character animation (walk / sprint / crouch / jump / idle) shared by every client.
-- The game spawns R6 characters (see R6Characters.server). R6 joints are Motor6Ds; we pose them through C0
-- (rest C0 * pose), which the Animator never touches.
-- R15 fallback: since the Avatar Joint Upgrade, R15 joints are AnimationConstraints. Roblox's guidance is to write
-- AnimationConstraint.Transform during RunService.PreSimulation (after the animation compositor), never the rig
-- attachments. We assign the pose (no animation tracks play: the default Animate script is removed).
-- Joints are looked up again whenever they change (avatar loading can rebuild them).

local Poser = {}

local JOINTS_R6 = {
	RootJoint = "HumanoidRootPart", Neck = "Torso",
	["Right Shoulder"] = "Torso", ["Left Shoulder"] = "Torso", ["Right Hip"] = "Torso", ["Left Hip"] = "Torso",
}
local JOINTS_R15 = {
	Root = "LowerTorso", Waist = "UpperTorso", Neck = "Head",
	LeftShoulder = "LeftUpperArm", LeftElbow = "LeftLowerArm", LeftWrist = "LeftHand",
	RightShoulder = "RightUpperArm", RightElbow = "RightLowerArm", RightWrist = "RightHand",
	LeftHip = "LeftUpperLeg", LeftKnee = "LeftLowerLeg", LeftAnkle = "LeftFoot",
	RightHip = "RightUpperLeg", RightKnee = "RightLowerLeg", RightAnkle = "RightFoot",
}

export type Rig = {
	char: Model, hum: Humanoid, root: BasePart, r6: boolean,
	joints: { [string]: Instance }, c0: { [Instance]: CFrame }, last: { [Instance]: CFrame },
	phase: number, speed: number, crouch: number, sprint: number, air: number, t: number, lastStep: number,
	frames: number,
}

function Poser.attach(char: Model): Rig?
	local hum = char:FindFirstChildOfClass("Humanoid")
	local root = char:FindFirstChild("HumanoidRootPart")
	if not hum or not root or not root:IsA("BasePart") then
		return nil
	end
	return {
		char = char, hum = hum, root = root, r6 = hum.RigType == Enum.HumanoidRigType.R6,
		joints = {}, c0 = {}, last = {},
		phase = 0, speed = 0, crouch = 0, sprint = 0, air = 0, t = math.random() * 10, lastStep = 0, frames = 0,
	}
end

local function isJoint(x: Instance?): boolean
	return x ~= nil and (x:IsA("Motor6D") or x:IsA("AnimationConstraint"))
end

-- the current joint object for a name (Motor6D or AnimationConstraint), re-found if the rig was rebuilt
function Poser.joint(R: Rig, name: string): Instance?
	local m = R.joints[name]
	if m and m.Parent and m:IsDescendantOf(R.char) then
		return m
	end
	local partName = (if R.r6 then JOINTS_R6 else JOINTS_R15)[name]
	local part = partName and R.char:FindFirstChild(partName)
	local found = part and part:FindFirstChild(name)
	if found and isJoint(found) then
		R.joints[name] = found
		if found:IsA("Motor6D") then
			R.c0[found] = found.C0
		end
		R.last[found] = nil
		return found
	end
	R.joints[name] = nil
	return nil
end

local function pose(R: Rig, name: string, cf: CFrame)
	local m = Poser.joint(R, name)
	if not m then
		return
	end
	if m:IsA("Motor6D") then
		local last = R.last[m]
		if last and m.C0 ~= last then
			R.c0[m] = m.C0 -- something else changed the rest pose (e.g. avatar scaling): adopt it
		end
		local base = R.c0[m]
		if base then
			local new = base * cf
			m.C0 = new
			R.last[m] = new
		end
	elseif m:IsA("AnimationConstraint") then
		m.Transform = cf
	end
end

local function approach(cur: number, target: number, rate: number, dt: number): number
	return cur + (target - cur) * math.min(1, dt * rate)
end

-- Advances the animation. Returns the foot part and gait ("walk"/"run"/"crouch") when a foot lands this frame.
function Poser.step(R: Rig, dt: number): (BasePart?, string?)
	R.frames += 1
	local hum, root = R.hum, R.root
	local v = root.AssemblyLinearVelocity
	local speed = Vector3.new(v.X, 0, v.Z).Magnitude
	local state = hum:GetState()
	local airborne = state == Enum.HumanoidStateType.Freefall or state == Enum.HumanoidStateType.Jumping
	if R.char:GetAttribute("Hidden") == true or hum.Health <= 0 then
		speed = 0
	end
	R.t += dt
	R.speed = approach(R.speed, speed, 10, dt)
	R.crouch = approach(R.crouch, if R.char:GetAttribute("Crouching") == true then 1 else 0, 8, dt)
	R.sprint = approach(R.sprint, math.clamp((speed - 17) / 5, 0, 1), 6, dt)
	R.air = approach(R.air, if airborne then 1 else 0, 10, dt)

	local cycle = 9 + R.sprint * 4 - R.crouch * 3.5 -- studs per two steps
	local moving = math.clamp(R.speed / 4, 0, 1) * (1 - R.air)
	local before = R.phase
	R.phase += 2 * math.pi * R.speed / cycle * dt * (1 - R.air)
	if moving < 0.05 then
		R.phase = approach(R.phase, math.round(R.phase / math.pi) * math.pi, 4, dt)
	end
	local s = math.sin(R.phase)

	-- a heel lands when the phase crosses pi/2 + k*pi
	local landedFoot: BasePart? = nil
	local gait: string? = nil
	local function k(ph: number): number
		return math.floor((ph - math.pi / 2) / math.pi)
	end
	if moving > 0.3 and k(R.phase) ~= k(before) and os.clock() - R.lastStep > 0.12 then
		R.lastStep = os.clock()
		local left = k(R.phase) % 2 == 0
		local footName = if R.r6 then (if left then "Left Leg" else "Right Leg") else (if left then "LeftFoot" else "RightFoot")
		local f = R.char:FindFirstChild(footName)
		landedFoot = if f and f:IsA("BasePart") then f else root
		gait = if R.crouch > 0.5 then "crouch" elseif R.sprint > 0.5 then "run" else "walk"
	end

	if R.r6 then
		-- verified on a standard R6 rig (tools/r6_preview.py): right-side joints swing forward with +Z, left-side
		-- with -Z; RootJoint/Neck: +X leans forward, +Z is up.
		local m = moving
		local legAmp = (0.55 + R.sprint * 0.4) * m * (1 - 0.5 * R.crouch)
		local armAmp = (0.5 + R.sprint * 0.6) * m * (1 - 0.6 * R.crouch)
		local lean = 0.06 * m + 0.25 * R.sprint + 0.35 * R.crouch
		local drop = 0.85 * R.crouch
		local bob = -math.abs(s) * (0.1 + 0.1 * R.sprint) * m
		local crouchLegs = 0.95 * R.crouch
		local legL = legAmp * s + lean + crouchLegs + 0.3 * R.air
		local legR = -legAmp * s + lean + crouchLegs - 0.2 * R.air
		local breathe = math.sin(R.t * 1.6) * 0.04 * (1 - m)
		local armL = -armAmp * s + 0.45 * R.crouch + 0.15 * R.sprint + 1.1 * R.air + breathe
		local armR = armAmp * s + 0.45 * R.crouch + 0.15 * R.sprint + 1.1 * R.air + breathe
		pose(R, "RootJoint", CFrame.new(0, 0, -drop + bob) * CFrame.Angles(lean, 0, 0))
		pose(R, "Neck", CFrame.Angles(-lean * 0.7, 0, 0))
		pose(R, "Left Hip", CFrame.Angles(0, 0, -legL))
		pose(R, "Right Hip", CFrame.Angles(0, 0, legR))
		pose(R, "Left Shoulder", CFrame.Angles(0, 0, -armL))
		pose(R, "Right Shoulder", CFrame.Angles(0, 0, armR))
		return landedFoot, gait
	end

	-- R15 (fallback)
	local amp = (0.55 + R.sprint * 0.4 - R.crouch * 0.18) * moving
	local lean = 0.05 * moving + R.sprint * 0.2 + R.crouch * 0.3
	local bob = -math.abs(s) * (0.12 + R.sprint * 0.12) * moving
	local breathe = math.sin(R.t * 1.6) * 0.025 * (1 - moving)
	local cHip, cKnee, cAnkle = 0.95 * R.crouch, -1.55 * R.crouch, 0.6 * R.crouch
	for _, side in { "Left", "Right" } do
		local ph = if side == "Left" then R.phase else R.phase + math.pi
		local sp, cp = math.sin(ph), math.cos(ph)
		local hip = amp * sp + cHip
		local knee = -(0.08 + (0.9 + R.sprint * 0.5) * math.max(0, cp) * moving) + cKnee
		local ankle = -(hip + knee) * 0.45 + cAnkle * 0.4
		if R.air > 0 then
			hip = hip * (1 - R.air) + (if side == "Left" then 0.55 else 0.2) * R.air
			knee = knee * (1 - R.air) - (if side == "Left" then 0.9 else 0.5) * R.air
		end
		pose(R, side .. "Hip", CFrame.Angles(hip, 0, 0))
		pose(R, side .. "Knee", CFrame.Angles(knee, 0, 0))
		pose(R, side .. "Ankle", CFrame.Angles(ankle, 0, 0))
		local aph = if side == "Left" then R.phase + math.pi else R.phase
		local sgn = if side == "Left" then -1 else 1
		local swing = -(0.45 + R.sprint * 0.5) * math.sin(aph) * moving
		local forward = R.crouch * 0.35 + R.sprint * 0.15
		local elbow = 0.2 + R.sprint * 1.15 + R.crouch * 0.5 + 0.25 * math.max(0, -math.sin(aph)) * moving
		if R.air > 0 then
			swing = swing * (1 - R.air) + 0.5 * R.air
			elbow = elbow * (1 - R.air) + 0.6 * R.air
		end
		pose(R, side .. "Shoulder", CFrame.Angles(swing + forward, 0, sgn * (0.06 + 0.04 * R.air)))
		pose(R, side .. "Elbow", CFrame.Angles(elbow, 0, 0))
	end
	pose(R, "Root", CFrame.new(0, bob, 0) * CFrame.Angles(0, 0.06 * s * moving, 0))
	pose(R, "Waist", CFrame.Angles(breathe - lean, -0.12 * s * moving * (1 + R.sprint), 0))
	pose(R, "Neck", CFrame.Angles(lean * 0.8, 0.05 * s * moving, 0))
	return landedFoot, gait
end

function Poser.status(R: Rig): string
	local n, kinds = 0, {}
	for name in (if R.r6 then JOINTS_R6 else JOINTS_R15) do
		local j = Poser.joint(R, name)
		if j then
			n += 1
			kinds[j.ClassName] = true
		end
	end
	local k = {}
	for c in kinds do
		table.insert(k, c)
	end
	return ("rig=%s joints=%d (%s) frames=%d speed=%.1f crouch=%.2f"):format(if R.r6 then "R6" else "R15", n,
		table.concat(k, "/"), R.frames, R.speed, R.crouch)
end

return Poser
