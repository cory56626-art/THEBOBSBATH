-- P9Traffic: everyday traffic and traffic stops.
--   * AI drivers cruise the roads (some speed, some have expired registration, a few have warrants) and slow down
--     for the car ahead of them.
--   * Every car's speed is clocked: going 8+ mph over the limit marks it as speeding for a while.
--   * A police car with its lights on right behind a driver makes them pull over to the curb (a driver with a
--     warrant may floor it instead: pursuit!). Walk up and check their ID, then ticket, warn, arrest or let them go.
--   * Cops can also ticket a stopped civilian player who was clocked speeding.
return function(G)
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local Data = require(ReplicatedStorage:WaitForChild("P9Data"))
	local CarPhysics = require(ReplicatedStorage:WaitForChild("CarPhysics"))
	local Profile = require(script.Parent:WaitForChild("P9Profile"))

	G.stopInfo = function(_player, _info) end -- set by the server script: shows the traffic-stop panel

	local KINDS = { "Sedan", "Sedan", "Hatchback", "Hatchback", "Pickup", "Sports", "Taxi" }

	local function flat(v: Vector3): Vector3
		return Vector3.new(v.X, 0, v.Z)
	end

	function G.spawnTraffic(): any
		local keys = {}
		for k in G.nodes do
			table.insert(keys, k)
		end
		local start
		for _ = 1, 20 do
			local k = keys[G.rand:NextInteger(1, #keys)]
			local far = true
			for player in G.players do
				local hrp = G.hrpOf(player)
				if hrp and (hrp.Position - G.nodes[k]).Magnitude < 140 then
					far = false
				end
			end
			if far then
				start = k
				break
			end
		end
		if not start then
			return nil
		end
		local nbrs = G.edges[start]
		local nextKey = nbrs[G.rand:NextInteger(1, #nbrs)]
		local a, b = G.nodes[start], G.nodes[nextKey]
		local dir = (b - a).Unit
		local right = Vector3.new(-dir.Z, 0, dir.X)
		local at = a + dir * 24 + right * 7 + Vector3.new(0, 1, 0)
		local rec = G.spawnCar(KINDS[G.rand:NextInteger(1, #KINDS)], CFrame.lookAt(at, at + dir), nil)
		if not rec then
			return nil
		end
		local npc, hum = G.makeNpc(at + Vector3.new(0, 4, 0), "Driver")
		if not npc or not hum then
			G.destroyCar(rec)
			return nil
		end
		rec.seat:Sit(hum)
		local r = G.rand
		rec.ai = {
			kind = "traffic",
			mode = "cruise",
			from = start,
			to = nextKey,
			npc = npc,
			hum = hum,
			speeder = r:NextNumber() < 0.3,
			cruise = r:NextNumber(36, 46),
			plate = Data.randomPlate(r),
			name = Data.randomName(r),
			expired = r:NextNumber() < 0.18,
			warrant = r:NextNumber() < 0.12,
			behind = 0,
			stuckSince = nil,
			reverseUntil = 0,
		}
		rec.ai.after = G.aiChoose(rec.ai, nextKey, start, nil)
		rec.model:SetAttribute("AI", true)
		rec.model:SetAttribute("Traffic", true)
		rec.model:SetAttribute("Plate", rec.ai.plate)
		return rec
	end

	-- is another car close ahead in our lane? returns its forward speed (or nil)
	local function carAhead(rec, range: number): number?
		local cf = rec.chassis.CFrame
		for _, other in G.cars do
			if other ~= rec and other.model.Parent then
				local rel = cf:PointToObjectSpace(other.chassis.Position)
				if rel.Z < -4 and rel.Z > -range and math.abs(rel.X) < 6 then
					return other.chassis.AssemblyLinearVelocity:Dot(cf.LookVector)
				end
			end
		end
		return nil
	end

	-- the police car right behind this one with its lights on (and the officer driving it)
	local function copBehind(rec)
		local cf = rec.chassis.CFrame
		for _, other in G.cars do
			if other.spec.police and other.driver and other.model:GetAttribute("Lights") then
				local rel = cf:PointToObjectSpace(other.chassis.Position)
				if rel.Z > 6 and rel.Z < 70 and math.abs(rel.X) < 22 then
					return other
				end
			end
		end
		return nil
	end

	local function resume(rec)
		local ai = rec.ai
		ai.mode = "cruise"
		ai.stopCop = nil
		ai.checked = false
		rec.model:SetAttribute("Stopped", false)
		rec.model:SetAttribute("StopCop", 0)
		G.aiResync(ai, rec.chassis.Position, rec.chassis.CFrame.LookVector)
	end

	local function stepTraffic(rec, t: number, dt: number)
		local ai = rec.ai
		local pos = rec.chassis.Position
		local spec = rec.spec
		if rec.model:GetAttribute("Disabled") then
			rec.drive.VectorVelocity = Vector3.zero
			return
		end
		-- pulled over by the police?
		if ai.mode == "cruise" then
			local cop = copBehind(rec)
			ai.behind = if cop then ai.behind + dt else 0
			if cop and ai.behind > 1.5 then
				if ai.warrant and G.rand:NextNumber() < 0.5 then
					-- floor it: this one is running
					ai.kind = "getaway"
					ai.mode = "flee"
					rec.model:SetAttribute("Traffic", false)
					rec.model:SetAttribute("Fleeing", true)
					rec.model:SetAttribute("Stars", 3)
					rec.call = G.newCall("Vehicle fleeing a traffic stop", { model = rec.model }, 3)
					G.notify(cop.driver, "They're running! Pursue the vehicle!", "Radio")
					return
				end
				ai.mode = "pulling"
				ai.stopCop = cop.driver
				ai.pullFrom = pos
				G.notify(cop.driver, "The driver is pulling over. Walk up to their window and check them.", "Radio")
			end
		end
		local aim, want
		if ai.mode == "pulling" then
			local fwd = rec.chassis.CFrame.LookVector
			local right = Vector3.new(-fwd.Z, 0, fwd.X)
			aim = pos + fwd * 30 + right * 10
			want = if (pos - ai.pullFrom).Magnitude > 25 then 0 else 14
			if rec.chassis.AssemblyLinearVelocity.Magnitude < 2 and (pos - ai.pullFrom).Magnitude > 12 then
				ai.mode = "stopped"
				ai.stoppedAt = t
				rec.model:SetAttribute("Stopped", true)
				rec.model:SetAttribute("StopCop", ai.stopCop and ai.stopCop.UserId or 0)
			end
		elseif ai.mode == "stopped" then
			rec.drive.VectorVelocity = Vector3.zero
			rec.state.speed = 0
			local copHrp = ai.stopCop and G.hrpOf(ai.stopCop)
			if not copHrp or (copHrp.Position - pos).Magnitude > 150 or t - ai.stoppedAt > 150 then
				resume(rec)
			end
			return
		else
			local cap
			aim, cap = G.aiAim(ai, pos, nil)
			want = math.min(if ai.speeder then spec.maxSpeed * 0.95 else ai.cruise, cap)
		end
		-- keep a gap to the car ahead
		if t >= (ai.nextLook or 0) then
			ai.nextLook = t + 0.2
			ai.aheadSpeed = carAhead(rec, 26 + rec.state.speed * 0.4)
		end
		if ai.aheadSpeed then
			want = math.min(want, math.max(0, ai.aheadSpeed - 4))
		end
		-- stuck: back up
		local speedNow = rec.chassis.AssemblyLinearVelocity.Magnitude
		if speedNow < 2 and want > 10 then
			ai.stuckSince = ai.stuckSince or t
			if t - ai.stuckSince > 3 then
				ai.reverseUntil = t + 1.2
				ai.stuckSince = nil
				ai.stuckCount = (ai.stuckCount or 0) + 1
			end
		else
			ai.stuckSince = nil
		end
		local throttle, steer
		if t < ai.reverseUntil then
			throttle, steer = -1, 0.7
		else
			throttle, steer = CarPhysics.autopilot(rec.state, pos, aim, want)
			if want <= 0.5 then
				throttle = if rec.state.speed > 1 then -1 else 0
			end
		end
		local vel = CarPhysics.step(rec.state, spec, throttle, steer, dt, rec.chassis.AssemblyLinearVelocity)
		rec.drive.VectorVelocity = vel
		rec.upright.CFrame = CFrame.Angles(0, rec.state.yaw, 0)
	end
	G.aiSteppers.traffic = stepTraffic

	---------------------------------------------------------------- the stop
	local function nearStoppedCar(player, model): any
		local rec = G.cars[model]
		local P = G.players[player]
		local hrp = G.hrpOf(player)
		if not rec or not P or P.team ~= "Police" or not hrp or P.driving then
			return nil
		end
		if (hrp.Position - rec.chassis.Position).Magnitude > 16 then
			return nil
		end
		return rec
	end

	local function info(rec, t: number)
		local ai = rec.ai
		local clocked = if rec.speedingAt and t - rec.speedingAt < 90 then rec.clocked else nil
		return {
			plate = ai.plate,
			name = ai.name,
			car = rec.spec.name,
			clocked = clocked,
			limit = rec.clockedLimit,
			expired = ai.expired,
			warrant = ai.warrant,
		}
	end

	-- action: "check" | "ticket" | "warning" | "arrest" | "release"
	function G.trafficStop(player, model, action: string): boolean
		local t = os.clock()
		local rec = nearStoppedCar(player, model)
		if not rec then
			return false
		end
		-- a civilian player who was clocked speeding
		local driver = rec.driver
		if driver and G.players[driver] and G.players[driver].team == "Civilian" then
			if action ~= "ticket" then
				return false
			end
			if rec.chassis.AssemblyLinearVelocity.Magnitude > 6 then
				G.notify(player, "They have to be stopped first.", "Error")
				return false
			end
			if rec.speedingAt and t - rec.speedingAt < 90 then
				local fine = 100
				local d = Profile.data[driver]
				local paid = math.min(fine, d and d.cash or 0)
				Profile.give(driver, -paid, 0)
				G.notify(driver, ("Speeding ticket: %d mph in a %d zone. Fined %s."):format(rec.clocked or 0,
					rec.clockedLimit or Data.TOWN_LIMIT, Data.money(paid)), "Error")
				local pay = Data.PAY.ticket
				G.pay(player, "ticket", pay.cash, pay.xp, "Ticket written!")
				G.progress(player, "ticket", 1)
				rec.speedingAt = nil
				return true
			end
			Profile.give(player, -Data.PAY.badStop, 0)
			G.notify(player, ("No violation on record. Bad stop: -%s"):format(Data.money(Data.PAY.badStop)), "Error")
			return false
		end
		local ai = rec.ai
		if not ai or ai.kind ~= "traffic" or ai.mode ~= "stopped" then
			return false
		end
		if action == "check" then
			ai.checked = true
			G.stopInfo(player, info(rec, t))
			return true
		end
		if not ai.checked then
			return false
		end
		if action == "ticket" then
			local clocked = rec.speedingAt and t - rec.speedingAt < 90
			if clocked or ai.expired then
				local pay = Data.PAY.ticket
				G.pay(player, "ticket", pay.cash, pay.xp, if clocked then "Speeding ticket written!" else "Ticket: expired registration!")
				G.progress(player, "ticket", 1)
			else
				Profile.give(player, -Data.PAY.badStop, 0)
				G.notify(player, ("No violation. Bad ticket: -%s"):format(Data.money(Data.PAY.badStop)), "Error")
			end
			rec.speedingAt = nil
			resume(rec)
		elseif action == "warning" then
			local pay = Data.PAY.warning
			G.pay(player, "warning", pay.cash, pay.xp, "Verbal warning given.")
			resume(rec)
		elseif action == "arrest" then
			if not ai.warrant then
				Profile.give(player, -Data.PAY.badStop, 0)
				G.notify(player, ("No warrant! Wrongful arrest: -%s"):format(Data.money(Data.PAY.badStop)), "Error")
				resume(rec)
				return false
			end
			-- the driver steps out and is cuffed: book them at the station
			local copHrp = G.hrpOf(player)
			local side = if copHrp then copHrp.Position + copHrp.CFrame.LookVector * 3 - Vector3.new(0, 3, 0)
				else (rec.chassis.CFrame * CFrame.new(-rec.chassis.Size.X / 2 - 3, 0, 0)).Position
			if ai.npc and ai.npc.Parent then
				ai.npc:Destroy()
			end
			rec.ai = nil
			rec.model:SetAttribute("AI", false)
			rec.model:SetAttribute("Traffic", false)
			rec.model:SetAttribute("Stopped", false)
			rec.idleSince = t
			rec.abandoned = true
			local S = G.spawnFootSuspect(side, 2, nil)
			if S then
				S.call.kind = "Warrant arrest"
				G.setSuspectState(S, "stunned")
				S.stunUntil = t + 30
				G.arrest(player, S.model)
			end
		elseif action == "release" then
			resume(rec)
		end
		return true
	end

	---------------------------------------------------------------- clocking speeds; keeping traffic flowing
	table.insert(G.onSecond, function(t: number)
		local n = 0
		for _, rec in G.cars do
			if rec.model.Parent then
				local v = rec.chassis.AssemblyLinearVelocity
				local mph = math.floor(flat(v).Magnitude * Data.MPH)
				local limit = Data.speedLimit(rec.chassis.Position)
				if mph > limit + 8 then
					if not rec.speedingAt or t - rec.speedingAt > 90 or mph > (rec.clocked or 0) then
						rec.clocked = mph
					end
					rec.speedingAt = t
					rec.clockedLimit = limit
				end
				if rec.ai and rec.ai.kind == "traffic" then
					n += 1
					-- hopelessly stuck, or far from everyone for a long time: recycle
					if (rec.ai.stuckCount or 0) > 6 then
						if rec.ai.npc then
							rec.ai.npc:Destroy()
						end
						G.destroyCar(rec)
						n -= 1
					end
				end
				if rec.abandoned and t - (rec.idleSince or t) > 90 and not rec.driver then
					G.destroyCar(rec)
				end
			end
		end
		if n < Data.SUSPECTS.traffic and t >= (G.nextTraffic or 0) then
			G.nextTraffic = t + 3
			G.spawnTraffic()
		end
	end)
end
