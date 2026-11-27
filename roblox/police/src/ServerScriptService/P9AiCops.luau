-- P9AiCops: AI police units (a cruiser and its officer).
--   patrol   cruise the roads, lights off
--   pursuit  chase a wanted player (or, when no human cops are on duty, a fleeing AI suspect): follow the shortest
--            road route, then drive straight at them when close (ramming wrecks their car)
--   respond  lights and siren to a robbery or jailbreak call
--   foot     the officer gets out, runs the suspect down, tasers them (or shoots at 4+ stars) and cuffs them
--   return   walks back to the cruiser and carries on
-- More units patrol when fewer players are on the police team.
return function(G)
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local CollectionService = game:GetService("CollectionService")
	local Data = require(ReplicatedStorage:WaitForChild("P9Data"))
	local CarPhysics = require(ReplicatedStorage:WaitForChild("CarPhysics"))
	local A = Data.AI_COPS

	G.units = {} :: { [any]: boolean }
	local nextUnitId = 0
	local NAVY = Color3.fromRGB(26, 32, 56)

	local function flat(v: Vector3): Vector3
		return Vector3.new(v.X, 0, v.Z)
	end

	local function weldTo(part: BasePart, to: BasePart, offset: CFrame)
		part.Anchored = false
		part.CanCollide = false
		part.CanQuery = false
		part.CanTouch = false
		part.Massless = true
		part.CFrame = to.CFrame * offset
		local w = Instance.new("WeldConstraint")
		w.Part0 = to
		w.Part1 = part
		w.Parent = part
		part.Parent = to.Parent
	end

	local function dressOfficer(model: Model)
		local torso = model:FindFirstChild("UpperTorso") or model:FindFirstChild("Torso")
		local head = model:FindFirstChild("Head")
		if not torso or not head or not torso:IsA("BasePart") or not head:IsA("BasePart") then
			return
		end
		local vest = Instance.new("Part")
		vest.Name = "Vest"
		vest.Size = Vector3.new(torso.Size.X + 0.15, torso.Size.Y * 0.9, torso.Size.Z + 0.2)
		vest.Color = Color3.fromRGB(20, 24, 36)
		vest.Material = Enum.Material.Fabric
		weldTo(vest, torso, CFrame.new(0, -0.05, 0))
		local badge = Instance.new("Part")
		badge.Name = "Badge"
		badge.Size = Vector3.new(0.35, 0.4, 0.06)
		badge.Color = Color3.fromRGB(230, 190, 70)
		badge.Material = Enum.Material.Metal
		weldTo(badge, torso, CFrame.new(-torso.Size.X * 0.25, torso.Size.Y * 0.2, -torso.Size.Z / 2 - 0.12))
		local cap = Instance.new("Part")
		cap.Name = "Cap"
		cap.Shape = Enum.PartType.Cylinder
		cap.Size = Vector3.new(0.5, head.Size.X * 1.1, head.Size.X * 1.1)
		cap.Color = Color3.fromRGB(20, 24, 36)
		cap.Material = Enum.Material.Fabric
		weldTo(cap, head, CFrame.new(0, head.Size.Y * 0.5, 0) * CFrame.Angles(0, 0, math.pi / 2))
	end

	---------------------------------------------------------------- units
	local function humanCops(): number
		local n = 0
		for _, P in G.players do
			if P.team == "Police" then
				n += 1
			end
		end
		return n
	end

	function G.spawnUnit(at: CFrame?): any
		local cf = at
		if not cf then
			local keys = {}
			for k in G.nodes do
				table.insert(keys, k)
			end
			for _ = 1, 20 do
				local k = keys[G.rand:NextInteger(1, #keys)]
				local far = true
				for player in G.players do
					local hrp = G.hrpOf(player)
					if hrp and (hrp.Position - G.nodes[k]).Magnitude < 150 then
						far = false
					end
				end
				if far then
					cf = G.roadSpot(G.nodes[k] + Vector3.new(30, 0, 30), 7)
					break
				end
			end
		end
		if not cf then
			return nil
		end
		local rec = G.spawnCar("Cruiser", cf, nil)
		if not rec then
			return nil
		end
		local model, hum = G.makeNpc(cf.Position + Vector3.new(0, 4, 0), "Officer", { shirt = NAVY, pants = NAVY })
		if not model or not hum then
			G.destroyCar(rec)
			return nil
		end
		nextUnitId += 1
		dressOfficer(model)
		model:SetAttribute("AIOfficer", true)
		model:SetAttribute("OfficerName", "Officer " .. (Data.randomName(G.rand):match("%s(%S+)$") or "Smith"))
		CollectionService:AddTag(model, "AIOfficer")
		local unit = {
			id = nextUnitId,
			rec = rec,
			model = model,
			hum = hum,
			hrp = model:FindFirstChild("HumanoidRootPart"),
			state = "patrol",
			target = nil,
			health = 100,
			downUntil = 0,
			lastTaser = -100,
			nextShot = 0,
			nextMove = 0,
			lostSince = nil,
			stuckSince = nil,
			reverseUntil = 0,
			footSince = 0,
		}
		rec.seat:Sit(hum)
		local yaw = CarPhysics.yawOf(cf)
		local fwd = CarPhysics.forward(yaw)
		rec.ai = { kind = "cop", unit = unit, mode = "cruise" }
		G.aiResync(rec.ai, rec.chassis.Position, fwd)
		rec.model:SetAttribute("AI", true)
		rec.model:SetAttribute("AIPolice", true)
		unit.rec = rec
		G.units[unit] = true
		G.extraCops[unit] = { pos = rec.chassis.Position, lights = false }
		return unit
	end

	function G.removeUnit(unit)
		G.units[unit] = nil
		G.extraCops[unit] = nil
		if unit.model and unit.model.Parent then
			unit.model:Destroy()
		end
		if unit.rec and unit.rec.model.Parent then
			G.destroyCar(unit.rec)
		end
	end

	-- point an AI car's road plan at the junction ahead (after it has been driving off-plan)
	function G.aiResync(ai, pos: Vector3, fwd: Vector3)
		local best, bestD = nil, math.huge
		for k, p in G.nodes do
			local to = flat(p - pos)
			local d = to.Magnitude
			if d > 1 and to.Unit:Dot(fwd) > 0.2 and d < bestD then
				best, bestD = k, d
			end
		end
		best = best or G.nearestNode(pos)
		local from, fromD = nil, math.huge
		for _, n in G.edges[best] do
			-- the road we're on: the neighbour whose segment passes closest to us
			local a, b = G.nodes[n], G.nodes[best]
			local ab = b - a
			local tt = math.clamp(flat(pos - a):Dot(ab) / ab:Dot(ab), 0, 1)
			local d = (flat(pos) - (a + ab * tt)).Magnitude
			if d < fromD then
				from, fromD = n, d
			end
		end
		ai.from, ai.to = from, best
		ai.after = G.aiChoose(ai, best, from, nil)
		ai.reach = 16
	end

	-- where the unit's target is, and whether they're in a vehicle
	local function targetInfo(unit): (Vector3?, boolean, any)
		local tg = unit.target
		if not tg then
			return nil, false, nil
		end
		if tg.kind == "player" then
			local P = G.players[tg.ref]
			local hrp = G.hrpOf(tg.ref)
			local hum = G.humOf(tg.ref)
			if not P or P.cell or P.wanted <= 0 or not hrp or not hum or hum.Health <= 0 then
				return nil, false, nil
			end
			return hrp.Position, hum.SeatPart ~= nil, P
		elseif tg.kind == "suspect" then
			local S = tg.ref
			if G.suspects[S.model] ~= S or S.state == "cuffed" or S.state == "transport" then
				return nil, false, nil
			end
			return S.hrp.Position, false, S
		elseif tg.kind == "car" then
			local rec = tg.ref
			if not rec.model.Parent or not rec.ai or rec.ai.kind ~= "getaway" then
				return nil, false, nil
			end
			return rec.chassis.Position, true, rec
		elseif tg.kind == "call" then
			return tg.pos, true, nil
		end
		return nil, false, nil
	end

	local function setLights(unit, on: boolean)
		local m = unit.rec and unit.rec.model
		if m and m.Parent then
			if (m:GetAttribute("Lights") == true) ~= on then
				m:SetAttribute("Lights", on)
				m:SetAttribute("Siren", if on then "Wail" else "")
			end
		end
	end

	local function dropTarget(unit)
		unit.target = nil
		unit.lostSince = nil
		if unit.state == "pursuit" or unit.state == "respond" then
			unit.state = "patrol"
		end
		setLights(unit, false)
		if unit.rec and unit.rec.ai then
			unit.rec.ai.goal = nil
		end
	end

	---------------------------------------------------------------- officer on foot
	local function getOut(unit)
		local rec = unit.rec
		local w = rec.seat:FindFirstChild("SeatWeld")
		if w then
			w:Destroy()
		end
		unit.hum.Sit = false
		unit.hum.PlatformStand = false
		unit.model:PivotTo(rec.chassis.CFrame * CFrame.new(-rec.chassis.Size.X / 2 - 2.5, 2.5, -1))
		unit.hum.WalkSpeed = A.footSpeed
		unit.state = "foot"
		unit.footSince = os.clock()
		rec.drive.VectorVelocity = Vector3.zero
	end

	local function getIn(unit)
		local rec = unit.rec
		if not rec or not rec.model.Parent then
			return
		end
		unit.hum.PlatformStand = false
		unit.model:PivotTo(rec.seat.CFrame + Vector3.new(0, 3, 0))
		rec.seat:Sit(unit.hum)
		rec.state = CarPhysics.newState(CarPhysics.yawOf(rec.chassis.CFrame))
		G.aiResync(rec.ai, rec.chassis.Position, rec.chassis.CFrame.LookVector)
		unit.state = if unit.target then "pursuit" else "patrol"
	end

	local function zap(unit, tpos: Vector3, tobj, t: number)
		local origin = unit.hrp.Position
		local hit = G.rand:NextNumber() < 0.75
		G.fx("taser", origin, tpos, hit)
		if not hit then
			return
		end
		local tg = unit.target
		if tg.kind == "player" then
			tobj.stunnedUntil = t + Data.TASER.stun
			tg.ref:SetAttribute("StunnedUntil", workspace:GetServerTimeNow() + Data.TASER.stun)
			G.knock(tg.ref, tpos - origin, Data.TASER.stun)
			G.notify(tg.ref, "Tased by the police!", "Error")
		elseif tg.kind == "suspect" then
			G.setSuspectState(tobj, "stunned")
			tobj.stunUntil = t + Data.TASER.stun
			tobj.hum.PlatformStand = true
		end
	end

	local function stepFoot(unit, t: number)
		if t < unit.downUntil then
			return
		end
		local tpos, inCar, tobj = targetInfo(unit)
		local pos = unit.hrp.Position
		if not tpos or inCar or (tpos - pos).Magnitude > 110 or t - unit.footSince > 90 then
			unit.state = "return"
			return
		end
		local d = (tpos - pos).Magnitude
		if t >= unit.nextMove then
			unit.nextMove = t + 0.3
			unit.hum:MoveTo(tpos)
		end
		local tg = unit.target
		local stunned = (tg.kind == "player" and tobj.stunnedUntil > t) or (tg.kind == "suspect" and tobj.state == "stunned")
		if stunned and d < 7 then
			if tg.kind == "player" then
				local who = tg.ref
				G.arrestPlayer(who, nil)
				G.notify(who, ("%s arrested you."):format(unit.model:GetAttribute("OfficerName") or "An officer"), "Cuffs")
			else
				G.fx("cuffed", tobj.hrp.Position)
				G.despawnSuspect(tobj)
			end
			dropTarget(unit)
			unit.state = "return"
			return
		end
		if stunned or d > A.taserRange then
			return
		end
		if not G.lineOfFire(pos + Vector3.new(0, 1.5, 0), tpos, { unit.model, tobj.model or (tg.ref.Character), G.carsFolder }) then
			return
		end
		local stars = if tg.kind == "player" then tobj.wanted else 1
		if stars >= A.shootAtStars and t >= unit.nextShot then
			unit.nextShot = t + 0.9
			local hit = G.rand:NextNumber() < 0.6
			if hit then
				G.damagePerson({ kind = "player", ref = tg.ref, model = tg.ref.Character, hum = G.humOf(tg.ref),
					hrp = G.hrpOf(tg.ref), cop = false, wanted = true }, A.shotDamage, nil, "shot", Vector3.zero)
			end
			G.fx("shot", pos + Vector3.new(0, 1.5, 0), tpos + (if hit then Vector3.zero else Vector3.new(2, 1, 0)), hit, 0)
		elseif t - unit.lastTaser >= Data.TASER.cooldown then
			unit.lastTaser = t
			zap(unit, tpos, tobj, t)
		end
	end

	local function stepReturn(unit, t: number)
		local rec = unit.rec
		if not rec or not rec.model.Parent or rec.model:GetAttribute("Disabled") then
			G.removeUnit(unit)
			return
		end
		local door = (rec.chassis.CFrame * CFrame.new(-rec.chassis.Size.X / 2 - 2, 0, -1)).Position
		local d = (door - unit.hrp.Position).Magnitude
		if d < 7 or t - unit.footSince > 120 then
			getIn(unit)
			return
		end
		if d > 140 then
			getIn(unit)
			return
		end
		if t >= unit.nextMove then
			unit.nextMove = t + 0.5
			unit.hum:MoveTo(door)
		end
	end

	-- hurt by a car or a bullet: officers get knocked down, never killed
	function G.hurtOfficer(unit, amount: number, fling: Vector3): boolean
		local t = os.clock()
		unit.health -= amount
		local down = unit.health <= 0
		if down then
			unit.health = 100
			unit.downUntil = t + 8
			G.knockNpc(unit.hum, unit.hrp, fling, 8)
		elseif fling.Magnitude > 10 then
			unit.downUntil = t + 3
			G.knockNpc(unit.hum, unit.hrp, fling, 3)
		end
		return down
	end

	---------------------------------------------------------------- driving
	local function stepCopCar(rec, t: number, dt: number)
		local unit = rec.ai.unit
		local pos = rec.chassis.Position
		local entry = G.extraCops[unit]
		if unit.state == "foot" or unit.state == "return" then
			rec.drive.VectorVelocity = Vector3.zero
			if entry and unit.hrp then
				entry.pos = unit.hrp.Position
			end
			return
		end
		if entry then
			entry.pos = pos
			entry.lights = rec.model:GetAttribute("Lights") == true
		end
		if rec.model:GetAttribute("Disabled") then
			if unit.target then
				getOut(unit)
			else
				G.removeUnit(unit)
			end
			return
		end
		local spec = rec.spec
		local tpos, inCar = targetInfo(unit)
		if unit.target and not tpos then
			-- the target is gone (arrested, escaped, despawned); a getaway driver who bailed becomes a runner
			if unit.target.kind == "car" then
				local best, bestD = nil, 80
				for _, S in G.suspects do
					if S.state == "flee" and (S.hrp.Position - pos).Magnitude < bestD then
						best, bestD = S, (S.hrp.Position - pos).Magnitude
					end
				end
				if best then
					unit.target = { kind = "suspect", ref = best }
					tpos, inCar = targetInfo(unit)
				end
			end
			if not tpos then
				dropTarget(unit)
			end
		end
		local chasing = tpos ~= nil and (unit.state == "pursuit" or unit.state == "respond")
		setLights(unit, chasing)
		local aim, cap, want
		local ai = rec.ai
		if chasing then
			local d = flat(tpos - pos).Magnitude
			if unit.target.kind == "call" and d < 45 then
				dropTarget(unit)
				unit.lookAround = t + 20
				return
			end
			if d > A.giveUpDistance then
				unit.lostSince = unit.lostSince or t
				if t - unit.lostSince > A.giveUpAfter then
					if unit.target.kind == "player" then
						G.notify(unit.target.ref, "The police lost your trail.", "Release")
					end
					dropTarget(unit)
					return
				end
			else
				unit.lostSince = nil
			end
			if not inCar and d < 22 and rec.chassis.AssemblyLinearVelocity.Magnitude < 25 then
				getOut(unit)
				return
			end
			if d < 75 then
				aim, cap, want = tpos, math.huge, spec.maxSpeed
				if not inCar and d < 30 then
					want = 18
				end
				ai.direct = true
			else
				if ai.direct then
					ai.direct = false
					G.aiResync(ai, pos, rec.chassis.CFrame.LookVector)
				end
				ai.goal = G.nearestNode(tpos)
				aim, cap = G.aiAim(ai, pos, nil)
				want = spec.maxSpeed * 0.95
			end
		else
			if ai.direct then
				ai.direct = false
				G.aiResync(ai, pos, rec.chassis.CFrame.LookVector)
			end
			ai.goal = nil
			aim, cap = G.aiAim(ai, pos, nil)
			want = 40
		end
		-- stuck against something: back up and try again
		local speedNow = rec.chassis.AssemblyLinearVelocity.Magnitude
		if speedNow < 3 and want > 10 then
			unit.stuckSince = unit.stuckSince or t
			if t - unit.stuckSince > 2.5 then
				unit.reverseUntil = t + 1.3
				unit.stuckSince = nil
			end
		else
			unit.stuckSince = nil
		end
		local throttle, steer
		if t < unit.reverseUntil then
			throttle, steer = -1, 0.8
		else
			throttle, steer = CarPhysics.autopilot(rec.state, pos, aim, math.min(want, cap))
		end
		local vel = CarPhysics.step(rec.state, spec, throttle, steer, dt, rec.chassis.AssemblyLinearVelocity)
		rec.drive.VectorVelocity = vel
		rec.upright.CFrame = CFrame.Angles(0, rec.state.yaw, 0)
	end
	G.aiSteppers.cop = stepCopCar

	---------------------------------------------------------------- dispatch: who chases whom
	local function assign(t: number)
		local free = {}
		for unit in G.units do
			if unit.state == "patrol" and not unit.target and t >= (unit.lookAround or 0) then
				table.insert(free, unit)
			end
		end
		local function take(pos: Vector3, target, state: string)
			local best, bestD, bi = nil, math.huge, nil
			for i, u in free do
				local d = (u.rec.chassis.Position - pos).Magnitude
				if d < bestD then
					best, bestD, bi = u, d, i
				end
			end
			if best then
				table.remove(free, bi)
				best.target = target
				best.state = state
				best.lostSince = nil
				return true
			end
			return false
		end
		-- wanted players: 1 unit (1 star), 2 (2-3 stars), 3 (4-5 stars)
		for player, P in G.players do
			if P.team == "Civilian" and P.wanted > 0 and not P.cell then
				local hrp = G.hrpOf(player)
				if hrp then
					local need = if P.wanted >= 4 then 3 elseif P.wanted >= 2 then 2 else 1
					for unit in G.units do
						if unit.target and unit.target.kind == "player" and unit.target.ref == player then
							need -= 1
						end
					end
					for _ = 1, need do
						if not take(hrp.Position, { kind = "player", ref = player }, "pursuit") then
							break
						end
					end
				end
			end
		end
		-- robberies and jailbreaks
		for _, call in G.calls do
			if call.open and call.aiRespond and not call.aiUnit then
				local pos = call.pos or (call.target and call.target.model and call.target.model.Parent
					and call.target.model:GetPivot().Position)
				if pos and take(pos, { kind = "call", pos = pos }, "respond") then
					call.aiUnit = true
				end
			end
		end
		-- no human cops on duty: AI police also chase fleeing suspects
		if humanCops() == 0 then
			for _, rec in G.cars do
				if rec.ai and rec.ai.kind == "getaway" and rec.ai.mode == "flee" then
					local taken = false
					for unit in G.units do
						if unit.target and unit.target.ref == rec then
							taken = true
						end
					end
					if not taken then
						take(rec.chassis.Position, { kind = "car", ref = rec }, "pursuit")
					end
				end
			end
			for _, S in G.suspects do
				if S.state == "flee" or S.state == "robbing" then
					local taken = false
					for unit in G.units do
						if unit.target and unit.target.ref == S then
							taken = true
						end
					end
					if not taken and #free > 0 then
						local nearest = math.huge
						for _, u in free do
							nearest = math.min(nearest, (u.rec.chassis.Position - S.hrp.Position).Magnitude)
						end
						if nearest < 350 then
							take(S.hrp.Position, { kind = "suspect", ref = S }, "pursuit")
						end
					end
				end
			end
		end
	end

	---------------------------------------------------------------- people list: officers on foot can be hit
	table.insert(G.peopleProviders, function(list)
		for unit in G.units do
			if (unit.state == "foot" or unit.state == "return") and unit.hrp and unit.hum then
				table.insert(list, { kind = "officer", ref = unit, model = unit.model, hum = unit.hum, hrp = unit.hrp,
					cop = true, wanted = false })
			end
		end
	end)

	---------------------------------------------------------------- loops
	table.insert(G.onStep, function(t: number)
		if t < (G.nextFootStep or 0) then
			return
		end
		G.nextFootStep = t + 0.1
		for unit in G.units do
			if not unit.model.Parent then
				G.removeUnit(unit)
			elseif unit.state == "foot" then
				stepFoot(unit, t)
			elseif unit.state == "return" then
				stepReturn(unit, t)
			end
		end
	end)

	table.insert(G.onSecond, function(t: number)
		local n = 0
		for _ in G.units do
			n += 1
		end
		local want = math.clamp(A.total - humanCops(), A.min, A.total)
		if n < want and t >= (G.nextUnitAt or 0) then
			G.nextUnitAt = t + 8
			G.spawnUnit(nil)
		elseif n > want then
			for unit in G.units do
				if unit.state == "patrol" and not unit.target then
					G.removeUnit(unit)
					break
				end
			end
		end
		assign(t)
	end)
end
