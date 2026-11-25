-- Moves the creature's Humanoid toward a goal: straight there when the way is clear,
-- otherwise along a PathfindingService path. Also handles facing a point while standing still,
-- and getting unstuck.

local PathfindingService = game:GetService("PathfindingService")
local RunService = game:GetService("RunService")

local HIP = 6 -- the root sits this far above the ground

local Mover = {}
Mover.__index = Mover

function Mover.new(model: Model, hum: Humanoid, root: BasePart)
	local self = setmetatable({}, Mover)
	self.model = model
	self.hum = hum
	self.root = root
	self.goal = nil :: Vector3?
	self.speed = 0
	self.waypoints = nil :: { PathWaypoint }?
	self.wpIndex = 1
	self.pathGoal = nil :: Vector3?
	self.pathTime = 0
	self.computing = false
	self.failed = false
	self.faceTarget = nil :: Vector3?
	self.lastPos = root.Position
	self.stuckTime = 0
	self.vaulting = false
	self.lastVault = 0
	self.onLand = nil :: (() -> ())?
	self.colliders = {} :: { BasePart }
	self.squeezing = false
	self.path = PathfindingService:CreatePath({
		AgentRadius = 3,
		AgentHeight = 10,
		AgentCanJump = true,
		AgentCanClimb = false,
		WaypointSpacing = 6,
	})
	self.params = RaycastParams.new()
	self.params.FilterType = Enum.RaycastFilterType.Exclude
	return self
end

function Mover:setIgnore(list: { Instance })
	self.params.FilterDescendantsInstances = list
end

-- face: optional point to keep looking at while moving (e.g. backing away from prey)
function Mover:moveTo(goal: Vector3, speed: number, face: Vector3?)
	if not self.goal or (self.goal - goal).Magnitude > 4 then
		self.failed = false -- a new destination gets a fresh chance
		self.stuckTime = 0
	end
	self.goal = goal
	self.speed = speed
	self.faceTarget = face
end

function Mover:stop(face: Vector3?)
	self.goal = nil
	self.speed = 0
	self.waypoints = nil
	self.faceTarget = face
	self.hum:MoveTo(self.root.Position)
end

function Mover:face(pos: Vector3?)
	self.faceTarget = pos
end

function Mover:arrived(dist: number?): boolean
	if not self.goal then
		return true
	end
	local d = self.goal - self.root.Position
	return Vector3.new(d.X, 0, d.Z).Magnitude <= (dist or 3.5)
end

-- is there a clear, walkable straight line from here to there?
function Mover:clearLine(to: Vector3): boolean
	local from = self.root.Position
	local flatTo = Vector3.new(to.X, from.Y, to.Z)
	local dir = flatTo - from
	if dir.Magnitude < 1 then
		return true
	end
	local hit = workspace:Spherecast(from, 2.3, dir, self.params)
	if hit then
		return false
	end
	-- also check knee height so low walls/crates count
	local low = workspace:Raycast(from - Vector3.new(0, 3.5, 0), dir, self.params)
	return low == nil
end

function Mover:_compute(goal: Vector3)
	if self.computing then
		return
	end
	self.computing = true
	task.spawn(function()
		local ok = pcall(function()
			self.path:ComputeAsync(self.root.Position, goal)
		end)
		self.computing = false
		if ok and self.path.Status == Enum.PathStatus.Success then
			self.waypoints = self.path:GetWaypoints()
			self.wpIndex = 2
			self.failed = false
		else
			self.waypoints = nil
			self.failed = true
		end
		self.pathGoal = goal
		self.pathTime = os.clock()
	end)
end

function Mover:_turnToward(dt: number, rate: number)
	local root = self.root
	local p = root.Position
	local f = self.faceTarget :: Vector3
	local look = Vector3.new(f.X, p.Y, f.Z)
	if (look - p).Magnitude > 0.5 then
		local want = CFrame.lookAt(p, look)
		root.CFrame = root.CFrame:Lerp(want, math.min(1, dt * rate))
	end
end

-- Vault (low obstacles: beds, counters, crates) or climb (walls with open sky above) toward the goal.
function Mover:tryVault(): boolean
	if self.vaulting or not self.goal or os.clock() - self.lastVault < 1.2 then
		return false
	end
	local root = self.root
	local p = root.Position
	local flat = Vector3.new(self.goal.X - p.X, 0, self.goal.Z - p.Z)
	if flat.Magnitude < 5 then
		return false
	end
	local dir = flat.Unit
	local feet = p - Vector3.new(0, HIP, 0)
	local hit = workspace:Raycast(feet + Vector3.new(0, 1.5, 0), dir * 6, self.params)
	if not hit or hit.Normal.Y > 0.5 then
		return false
	end
	-- how tall is it? probe down from just under a possible ceiling, a little past the face
	local probeXZ = hit.Position + dir * 1.2
	local high = workspace:Raycast(feet + Vector3.new(0, 7, 0), dir * 6, self.params)
	local maxH, dur, kind
	if not high then
		maxH, dur, kind = 6.5, 0.55, "vault"
	else
		-- tall: only climbable if there's open space above it (no ceiling)
		local up = workspace:Raycast(Vector3.new(probeXZ.X, feet.Y + 15, probeXZ.Z), Vector3.new(0, 12, 0), self.params)
		if up then
			return false
		end
		maxH, dur, kind = 14, 1.3, "climb"
	end
	local topHit = workspace:Raycast(Vector3.new(probeXZ.X, feet.Y + maxH + 0.5, probeXZ.Z), Vector3.new(0, -maxH, 0), self.params)
	if not topHit then
		return false
	end
	local h = topHit.Position.Y - feet.Y
	if h < 1.2 or h > maxH then
		return false
	end
	-- find floor on the far side
	local land: Vector3? = nil
	for d = 1.5, 10, 1 do
		local q = probeXZ + dir * d
		local down = workspace:Raycast(Vector3.new(q.X, topHit.Position.Y + 1, q.Z), Vector3.new(0, -(h + 3), 0), self.params)
		if down and down.Position.Y < feet.Y + 1 and down.Position.Y > feet.Y - 3 then
			land = down.Position + dir * 1.5
			break
		end
	end
	if not land then
		return false
	end
	local landing = land :: Vector3
	self.vaulting = true
	self.lastVault = os.clock()
	local hum = self.hum
	local look = CFrame.lookAt(p, p + dir)
	local endPos = landing + Vector3.new(0, HIP, 0)
	local peak = topHit.Position.Y + HIP * 0.55
	root.Anchored = true
	local t = 0
	local conn
	conn = RunService.Heartbeat:Connect(function(dtt)
		t = math.min(1, t + dtt / dur)
		local pos = p:Lerp(endPos, t)
		local arc = if kind == "climb" then math.min(1, t * 1.6) else math.sin(t * math.pi)
		local y = if kind == "climb" and t > 0.62 then peak + (endPos.Y - peak) * ((t - 0.62) / 0.38) else
			pos.Y + (peak - pos.Y) * arc
		root.CFrame = CFrame.new(pos.X, y, pos.Z) * (look - look.Position)
		if t >= 1 then
			conn:Disconnect()
			root.Anchored = false
			root.AssemblyLinearVelocity = dir * (self.speed * 0.6)
			self.vaulting = false
			self.pathGoal = nil
			if self.onLand then
				self.onLand()
			end
		end
	end)
	hum:MoveTo(endPos)
	return true
end

function Mover:step(dt: number)
	local hum, root = self.hum, self.root
	if self.vaulting then
		return
	end
	if not self.goal then
		hum.WalkSpeed = 0
		if self.faceTarget then
			hum.AutoRotate = false
			self:_turnToward(dt, 3)
		end
		return
	end
	hum.AutoRotate = self.faceTarget == nil
	if self.faceTarget then
		self:_turnToward(dt, 6)
	end
	hum.WalkSpeed = self.speed

	if self:clearLine(self.goal) then
		self.waypoints = nil
		hum:MoveTo(self.goal)
	elseif (self.goal - root.Position).Magnitude < 40 and self:tryVault() then
		return
	else
		local stale = not self.pathGoal
			or (self.pathGoal - self.goal).Magnitude > 4
			or os.clock() - self.pathTime > 2.5
		if stale and not self.computing then
			self:_compute(self.goal)
		end
		local wps = self.waypoints
		if wps and wps[self.wpIndex] then
			local wp = wps[self.wpIndex]
			local d = wp.Position - root.Position
			if Vector3.new(d.X, 0, d.Z).Magnitude < 3 then
				self.wpIndex += 1
				wp = wps[self.wpIndex] or wp
			end
			if wp.Action == Enum.PathWaypointAction.Jump then
				hum.Jump = true
			end
			hum:MoveTo(wp.Position)
		else
			hum:MoveTo(self.goal)
		end
	end

	-- stuck detection
	local moved = (root.Position - self.lastPos).Magnitude
	self.lastPos = root.Position
	if self.speed > 2 and moved < self.speed * dt * 0.15 then
		self.stuckTime += dt
		if self.stuckTime > 1.5 then
			if not self:tryVault() then
				if self.stuckTime > 2.0 then
					self:squeeze()
				else
					hum.Jump = true
				end
			end
			self.pathGoal = nil
		end
	else
		self.stuckTime = 0
	end
end

-- wedged on a door frame or furniture: slip through like a cat (body collisions off for a moment)
function Mover:squeeze()
	if self.squeezing then
		return
	end
	self.squeezing = true
	for _, c in self.colliders do
		c.CanCollide = false
	end
	local root = self.root
	local target = self.goal
	local wps = self.waypoints
	if wps and wps[self.wpIndex] then
		target = wps[self.wpIndex].Position
	end
	if target then
		local d = Vector3.new(target.X - root.Position.X, 0, target.Z - root.Position.Z)
		if d.Magnitude > 0.5 then
			root.CFrame += d.Unit * math.min(2, d.Magnitude)
		end
	end
	task.delay(1.2, function()
		for _, c in self.colliders do
			c.CanCollide = true
		end
		self.squeezing = false
		self.stuckTime = 0
	end)
end

function Mover:isStuck(): boolean
	return self.stuckTime > 4 or (self.failed and not self:clearLine(self.goal or self.root.Position))
end

return Mover
