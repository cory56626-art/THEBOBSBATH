-- Moves the creature's Humanoid toward a goal: straight there when the way is clear,
-- otherwise along a PathfindingService path. Also handles facing a point while standing still,
-- and getting unstuck.

local PathfindingService = game:GetService("PathfindingService")

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
	self.path = PathfindingService:CreatePath({
		AgentRadius = 2.5,
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

function Mover:moveTo(goal: Vector3, speed: number)
	if not self.goal or (self.goal - goal).Magnitude > 4 then
		self.failed = false -- a new destination gets a fresh chance
		self.stuckTime = 0
	end
	self.goal = goal
	self.speed = speed
	self.faceTarget = nil
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
	local hit = workspace:Spherecast(from, 1.6, dir, self.params)
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

function Mover:step(dt: number)
	local hum, root = self.hum, self.root
	if not self.goal then
		hum.WalkSpeed = 0
		if self.faceTarget then
			hum.AutoRotate = false
			local p = root.Position
			local look = Vector3.new(self.faceTarget.X, p.Y, self.faceTarget.Z)
			if (look - p).Magnitude > 0.5 then
				local want = CFrame.lookAt(p, look)
				root.CFrame = root.CFrame:Lerp(want, math.min(1, dt * 4))
			end
		end
		return
	end
	hum.AutoRotate = true
	hum.WalkSpeed = self.speed

	if self:clearLine(self.goal) then
		self.waypoints = nil
		hum:MoveTo(self.goal)
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
			hum.Jump = true
			self.pathGoal = nil
		end
	else
		self.stuckTime = 0
	end
end

function Mover:isStuck(): boolean
	return self.stuckTime > 4 or (self.failed and not self:clearLine(self.goal or self.root.Position))
end

return Mover
