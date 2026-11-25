--!strict
-- Phase 1: brings the Skinwalker showcase model to life on each player's screen.
-- Every bone in the model has a Motor6D called "Joint"; we drive Joint.Transform.
--   * slow, heavy breathing and a swaying stance
--   * the head turns to follow YOU, with a curious canine tilt
--   * sudden twitches and full-body spasms
--   * creeping finger curls and writhing back tendrils
--   * it gets agitated (faster breath, wider jaw, flaring tendrils) as you come closer

local RunService = game:GetService("RunService")

local found = workspace:WaitForChild("Skinwalker", 30)
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
model.DescendantAdded:Connect(function(d)
	if d:IsA("Motor6D") then
		task.defer(collect)
	end
end)

local function set(name: string, cf: CFrame)
	local j = joints[name]
	if j then
		j.Transform = cf
	end
end

local rng = Random.new()
local t = 0
local yaw, pitch = 0, 0
local agitation = 0

-- twitch state: a sudden offset that snaps in and decays away
local twitch = Vector3.zero
local nextTwitch = 2
local spasm = 0
local nextSpasm = 9

local MAX_YAW, MAX_PITCH = math.rad(70), math.rad(40)
local HEAD_REST_PITCH = 0.16

RunService.RenderStepped:Connect(function(dt)
	t += dt
	local camera = workspace.CurrentCamera
	local root = model.PrimaryPart
	if not camera or not root then
		return
	end

	-- how close is the viewer? (0 = far, 1 = in its face)
	local dist = (camera.CFrame.Position - root.Position).Magnitude
	local targetAgitation = math.clamp((26 - dist) / 18, 0, 1)
	agitation += (targetAgitation - agitation) * math.min(1, dt * 2)

	-- twitches and spasms
	nextTwitch -= dt
	if nextTwitch <= 0 then
		twitch = Vector3.new(rng:NextNumber(-0.35, 0.35), rng:NextNumber(-0.45, 0.45), rng:NextNumber(-0.6, 0.6))
		nextTwitch = rng:NextNumber(1.2, 4) * (1 - agitation * 0.6)
	end
	twitch *= math.exp(-dt * 7)
	nextSpasm -= dt
	if nextSpasm <= 0 then
		spasm = 1
		nextSpasm = rng:NextNumber(7, 15) * (1 - agitation * 0.5)
	end
	spasm *= math.exp(-dt * 5)
	local jerk = spasm * math.sin(t * 55)

	-- breathing
	local breathRate = 1.1 + agitation * 2.4
	local breath = math.sin(t * breathRate)
	set("Pelvis", CFrame.Angles(0, math.sin(t * 0.4) * 0.05, math.sin(t * 0.7) * 0.025))
	set("Abdomen", CFrame.Angles(breath * 0.03 + jerk * 0.05, 0, 0))
	set("Chest", CFrame.Angles(math.sin(t * breathRate + 0.5) * 0.045 - agitation * 0.08 + jerk * 0.08, jerk * 0.05, 0))

	-- head tracking (split between neck and head)
	local neckJoint = joints.Neck
	if neckJoint and neckJoint.Part0 then
		local frame = neckJoint.Part0.CFrame * neckJoint.C0
		local rel = frame:PointToObjectSpace(camera.CFrame.Position)
		local flat = math.sqrt(rel.X * rel.X + rel.Z * rel.Z)
		local targetYaw = math.clamp(math.atan2(-rel.X, -rel.Z), -MAX_YAW, MAX_YAW)
		local targetPitch = math.clamp(math.atan2(rel.Y, flat) + HEAD_REST_PITCH, -MAX_PITCH, MAX_PITCH)
		if dist > 90 then
			targetYaw, targetPitch = math.sin(t * 0.3) * 0.4, 0
		end
		local follow = math.min(1, dt * (1.6 + agitation * 3))
		yaw += (targetYaw - yaw) * follow
		pitch += (targetPitch - pitch) * follow
	end
	local tilt = math.sin(t * 0.37) * 0.22 + twitch.Z
	set("Neck", CFrame.fromEulerAnglesYXZ(pitch * 0.4 + twitch.X * 0.3, yaw * 0.4 + twitch.Y * 0.3, tilt * 0.3))
	set("Head", CFrame.fromEulerAnglesYXZ(pitch * 0.6 + twitch.X, yaw * 0.6 + twitch.Y, tilt + jerk * 0.2))

	-- jaw hangs, chatters when agitated
	local chatter = agitation * math.max(0, math.sin(t * 18)) * 0.08
	set("Jaw", CFrame.Angles(-(0.06 + math.sin(t * 0.8) * 0.06 + agitation * 0.22 + chatter + spasm * 0.15), 0, 0))

	-- dangling arms and creeping fingers
	for i, side in { "Left", "Right" } do
		local s = if side == "Left" then -1 else 1
		local ph = i * 1.7
		set(side .. "UpperArm", CFrame.Angles(math.sin(t * 0.6 + ph) * 0.06 - agitation * 0.25, 0,
			s * (math.sin(t * 0.5 + ph) * 0.04 + agitation * 0.12) + jerk * 0.1))
		set(side .. "LowerArm", CFrame.Angles(math.sin(t * 0.7 + ph) * 0.05 - agitation * 0.35, 0, 0))
		set(side .. "Hand", CFrame.Angles(math.sin(t * 0.9 + ph) * 0.12 + agitation * 0.2, 0, 0))
		for f = 1, 4 do
			local curl = 0.1 + math.sin(t * (1.6 + agitation * 3) + f * 0.8 + ph) * (0.16 + agitation * 0.15)
			set(side .. "Finger" .. f .. "A", CFrame.Angles(curl, 0, 0))
			set(side .. "Finger" .. f .. "B", CFrame.Angles(curl * 1.4, 0, 0))
		end
	end

	-- writhing tendrils (Tendril<i>_<segment>)
	for ti = 1, 12 do
		if not joints[("Tendril%d_1"):format(ti)] then
			break
		end
		local flare = agitation * 0.12
		for k = 1, 6 do
			local amp = 0.14 + k * 0.02 + agitation * 0.08
			local speed = 1.3 + agitation * 2
			set(
				("Tendril%d_%d"):format(ti, k),
				CFrame.Angles(
					math.sin(t * speed + ti * 1.3 + k * 0.6) * amp - (if k == 1 then flare else 0) + jerk * 0.15,
					math.sin(t * speed * 0.7 + ti * 2.1 + k * 0.4) * amp * 0.6,
					math.cos(t * speed * 0.9 + ti + k * 0.5) * amp
				)
			)
		end
	end
end)
