-- CarPhysics: how a car responds to throttle and steering. The same math drives player cars (on the driver's
-- device, which owns the car's physics) and AI getaway cars (on the server).
-- The car's chassis carries a LinearVelocity ("Drive", horizontal only) and an AlignOrientation ("Upright", keeps the
-- car level and pointed along its heading). Crashes are real physics: if something stops the car, its speed drops.

local CarPhysics = {}

export type State = { speed: number, yaw: number, steer: number }

function CarPhysics.newState(yaw: number): State
	return { speed = 0, yaw = yaw, steer = 0 }
end

-- the heading (yaw, radians) of a CFrame, with forward = -Z
function CarPhysics.yawOf(cf: CFrame): number
	local look = cf.LookVector
	return math.atan2(-look.X, -look.Z)
end

function CarPhysics.forward(yaw: number): Vector3
	return Vector3.new(-math.sin(yaw), 0, -math.cos(yaw))
end

-- advance the car. throttle and steer are -1..1 (steer +1 = right). actualVelocity: the chassis' real velocity
-- (so walls and other cars slow you down). Returns the horizontal velocity to command.
function CarPhysics.step(state: State, spec, throttle: number, steer: number, dt: number, actualVelocity: Vector3?): Vector3
	local speed = state.speed
	if throttle > 0.05 then
		if speed < 0 then
			speed = math.min(0, speed + spec.brake * dt * throttle)
		else
			speed += spec.accel * dt * throttle * (1 - 0.5 * math.clamp(speed / spec.maxSpeed, 0, 1))
		end
	elseif throttle < -0.05 then
		if speed > 0 then
			speed = math.max(0, speed + spec.brake * dt * throttle)
		else
			speed += spec.accel * 0.6 * dt * throttle
		end
	else
		local drag = (6 + math.abs(speed) * 0.12) * dt
		speed = if math.abs(speed) <= drag then 0 else speed - math.sign(speed) * drag
	end
	speed = math.clamp(speed, -spec.reverse, spec.maxSpeed)
	-- something in the way (a wall, another car): you slow down for real
	if actualVelocity then
		local fwd = CarPhysics.forward(state.yaw)
		local actual = actualVelocity:Dot(fwd)
		if math.abs(actual) < math.abs(speed) - 14 then
			speed = actual + math.sign(speed) * 8
		end
	end
	state.speed = speed
	-- steering: smooth input, turning needs speed, and is gentler flat out
	state.steer += (steer - state.steer) * math.min(1, dt * 8)
	local grip = math.clamp(math.abs(speed) / 16, 0, 1) * (1 - 0.4 * math.clamp(math.abs(speed) / spec.maxSpeed, 0, 1))
	state.yaw -= state.steer * spec.turn * grip * math.sign(speed) * dt
	return CarPhysics.forward(state.yaw) * speed
end

-- AI driving: throttle/steer toward a target point (with a target speed)
function CarPhysics.autopilot(state: State, pos: Vector3, target: Vector3, wantSpeed: number): (number, number)
	local to = Vector3.new(target.X - pos.X, 0, target.Z - pos.Z)
	if to.Magnitude < 0.1 then
		return 0, 0
	end
	local fwd = CarPhysics.forward(state.yaw)
	local right = Vector3.new(-fwd.Z, 0, fwd.X)
	local dir = to.Unit
	local angle = math.atan2(dir:Dot(right), dir:Dot(fwd))
	local steer = math.clamp(angle * 2.2, -1, 1)
	-- slow down for sharp turns
	local sharp = math.abs(angle)
	local want = wantSpeed * math.clamp(1.15 - sharp * 0.75, 0.3, 1)
	local throttle = if state.speed < want - 3 then 1 elseif state.speed > want + 6 then -0.6 else 0.2
	if math.abs(angle) > 2.3 then
		throttle = -0.6 -- it's behind us: back up a bit while turning
	end
	return throttle, steer
end

return CarPhysics
