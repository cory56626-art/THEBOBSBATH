-- P9World: the people of Northfield and what can happen to them.
--   * Pedestrians walk the sidewalks around every block; they panic at gunfire and get knocked over by cars.
--   * Cars hit people: a moving car knocks a person down and hurts them (no blood, just a thud and dust).
--     Civilians who hit someone get stars ("hit and run"); a cop who hits an innocent person is fined.
--   * Guns: cops carry a pistol (SWAT: rifle too); civilians can buy one. Aim assist picks the person nearest your
--     aim with a clear line of fire. Cops can't hurt people who aren't wanted. No blood: sparks and a hit marker.
--     A wanted civilian downed by police is arrested. Armed AI robbers shoot back.
return function(G)
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local CollectionService = game:GetService("CollectionService")
	local Data = require(ReplicatedStorage:WaitForChild("P9Data"))
	local Profile = require(script.Parent:WaitForChild("P9Profile"))

	G.peds = {} :: { [Model]: any }
	G.peopleProviders = {} :: { (list: { any }) -> () }
	local hitCooldown: { [any]: number } = {}
	local blameCooldown: { [any]: { [string]: number } } = {}
	local losParams = RaycastParams.new()
	losParams.FilterType = Enum.RaycastFilterType.Exclude

	local BLOCKS = { -270, -90, 90, 270 }
	local RING = 73

	---------------------------------------------------------------- everyone who can be hit or shot
	-- entry: { kind = "player" | "suspect" | "ped" | "officer", ref, model, hum, hrp, cop: boolean, wanted: boolean }
	function G.people(): { any }
		local list = {}
		for player, P in G.players do
			local char = player.Character
			local hum = G.humOf(player)
			local hrp = G.hrpOf(player)
			if char and hum and hrp and hum.Health > 0 and not hum.SeatPart and not P.cell then
				table.insert(list, { kind = "player", ref = player, model = char, hum = hum, hrp = hrp,
					cop = P.team == "Police", wanted = P.team == "Civilian" and P.wanted > 0 })
			end
		end
		for model, S in G.suspects do
			if S.hrp and S.hum and not S.hum.SeatPart and S.state ~= "cuffed" then
				table.insert(list, { kind = "suspect", ref = S, model = model, hum = S.hum, hrp = S.hrp, cop = false,
					wanted = true })
			end
		end
		for model, W in G.peds do
			if W.hrp and W.hum then
				table.insert(list, { kind = "ped", ref = W, model = model, hum = W.hum, hrp = W.hrp, cop = false,
					wanted = false })
			end
		end
		for _, f in G.peopleProviders do
			f(list)
		end
		return list
	end

	-- knock a server-run person over for a while (fling them a little)
	function G.knockNpc(hum: Humanoid, hrp: BasePart, push: Vector3, seconds: number)
		hum.PlatformStand = true
		hrp.AssemblyLinearVelocity = push
		task.delay(seconds, function()
			if hum.Parent and hum:GetAttribute("Down") ~= true then
				hum.PlatformStand = false
				hum:ChangeState(Enum.HumanoidStateType.GettingUp)
			end
		end)
	end

	-- hurt someone. attacker: a player (or nil for the AI). how: "car" | "shot". Returns true if they went down.
	function G.damagePerson(e, amount: number, attacker, how: string, push: Vector3?): boolean
		local t = os.clock()
		local fling = push or Vector3.zero
		if e.kind == "player" then
			local P = G.players[e.ref]
			if how == "car" then
				G.knock(e.ref, fling, 2.5, fling.Magnitude)
			end
			local before = e.hum.Health
			e.hum:TakeDamage(amount)
			if before > 0 and e.hum.Health <= 0 then
				-- a wanted civilian downed by the police is arrested
				local byCop = attacker == nil or (G.players[attacker] and G.players[attacker].team == "Police")
				if P and P.team == "Civilian" and P.wanted > 0 and byCop then
					G.arrestPlayer(e.ref, attacker)
				end
				return true
			end
			return false
		elseif e.kind == "suspect" then
			local S = e.ref
			local hp = math.max(1, S.hum.Health - amount)
			S.hum.Health = hp
			local down = hp <= 1
			if S.state ~= "transport" then
				G.setSuspectState(S, "stunned")
				S.stunUntil = t + (if down then 1 else 4)
				S.down = down
				S.hum:SetAttribute("Down", down)
				S.hum:MoveTo(S.hrp.Position)
				G.knockNpc(S.hum, S.hrp, fling, if down then 999 else 4)
				if S.call then
					S.call.kind = if down then "Suspect down" else S.call.kind
				end
			end
			return down
		elseif e.kind == "ped" then
			local W = e.ref
			W.state = "knocked"
			W.until_ = t + 4
			G.knockNpc(W.hum, W.hrp, fling, 4)
			return false
		elseif e.kind == "officer" and G.hurtOfficer then
			return G.hurtOfficer(e.ref, amount, fling)
		end
		return false
	end

	-- a civilian committed a crime against someone (with a short cooldown so one crash isn't five crimes)
	local function blame(attacker, victim, what: string)
		if not attacker or not G.players[attacker] then
			return
		end
		local P = G.players[attacker]
		local t = os.clock()
		local cd = blameCooldown[attacker] or {}
		blameCooldown[attacker] = cd
		local key = if victim.cop then "cop" .. what else what
		if t < (cd[key] or 0) then
			return
		end
		cd[key] = t + 6
		if P.team == "Civilian" then
			if victim.cop then
				G.addWanted(attacker, Data.WANTED.assault, if what == "car" then "You hit an officer" else "Assaulting an officer")
			elseif what == "shot" then
				G.addWanted(attacker, Data.WANTED.assault, "Assault")
			else
				G.addWanted(attacker, Data.WANTED.reckless, "Hit and run")
			end
		elseif P.team == "Police" and not victim.wanted and what == "car" then
			Profile.give(attacker, -Data.PAY.reckless, 0)
			G.notify(attacker, ("Reckless driving! You were fined %s."):format(Data.money(Data.PAY.reckless)), "Error")
		end
	end

	---------------------------------------------------------------- cars hitting people
	local function runOvers(t: number)
		local people = nil
		for _, rec in G.cars do
			local ch = rec.chassis
			if not rec.model.Parent or not ch then
				continue
			end
			local vel = ch.AssemblyLinearVelocity
			local speed = Vector3.new(vel.X, 0, vel.Z).Magnitude
			if speed < 20 then
				continue
			end
			people = people or G.people()
			local half = ch.Size / 2
			for _, e in people do
				local rel = ch.CFrame:PointToObjectSpace(e.hrp.Position)
				if math.abs(rel.X) < half.X + 1.3 and math.abs(rel.Z) < half.Z + 1.6 and rel.Y > -4 and rel.Y < 6 then
					if t < (hitCooldown[e.model] or 0) then
						continue
					end
					hitCooldown[e.model] = t + 1.5
					local dmg = math.clamp((speed - 15) * 0.9, 8, 100)
					local dir = Vector3.new(vel.X, 0, vel.Z).Unit
					local push = dir * math.min(speed * 0.6, 60) + Vector3.new(0, 22, 0)
					G.damagePerson(e, dmg, rec.driver, "car", push)
					G.fx("hit", e.hrp.Position)
					blame(rec.driver, e, "car")
				end
			end
		end
	end

	G.runOvers = runOvers

	---------------------------------------------------------------- pedestrians
	local function ringPoint(bx: number, bz: number, i: number): Vector3
		local c = ({ { -1, -1 }, { 1, -1 }, { 1, 1 }, { -1, 1 } })[(i - 1) % 4 + 1]
		return Vector3.new(bx + c[1] * RING, 0, bz + c[2] * RING)
	end

	function G.spawnPed(): any
		local bx, bz = BLOCKS[G.rand:NextInteger(1, 4)], BLOCKS[G.rand:NextInteger(1, 4)]
		local corner = G.rand:NextInteger(1, 4)
		local a, b = ringPoint(bx, bz, corner), ringPoint(bx, bz, corner + 1)
		local pos = a:Lerp(b, G.rand:NextNumber(0.1, 0.9))
		local model, hum = G.makeNpc(pos, "Pedestrian")
		if not model or not hum then
			return nil
		end
		hum.WalkSpeed = G.rand:NextNumber(6, 9)
		local W = { model = model, hum = hum, hrp = model:FindFirstChild("HumanoidRootPart"), bx = bx, bz = bz,
			corner = corner + 1, dir = if G.rand:NextNumber() < 0.5 then 1 else -1, state = "walk", until_ = 0, nextMove = 0 }
		if W.dir < 0 then
			W.corner = corner
		end
		model:SetAttribute("Pedestrian", true)
		CollectionService:AddTag(model, "Pedestrian")
		G.peds[model] = W
		return W
	end

	-- people nearby run from gunfire for a few seconds
	function G.panic(at: Vector3, radius: number)
		local t = os.clock()
		for _, W in G.peds do
			if W.hrp and (W.hrp.Position - at).Magnitude < radius and W.state ~= "knocked" then
				W.state = "panic"
				W.until_ = t + 5
				W.from = at
				W.nextMove = 0
			end
		end
	end

	local function stepPeds(t: number)
		for model, W in G.peds do
			if not model.Parent or not W.hrp or W.hum.Health <= 0 then
				G.peds[model] = nil
				if model.Parent then
					model:Destroy()
				end
				continue
			end
			if W.state == "knocked" then
				if t >= W.until_ then
					W.state = "panic"
					W.until_ = t + 4
					W.from = W.hrp.Position - W.hrp.CFrame.LookVector * 5
				end
			elseif W.state == "panic" then
				if t >= W.until_ then
					W.state = "walk"
					W.hum.WalkSpeed = G.rand:NextNumber(6, 9)
					W.nextMove = 0
				elseif t >= W.nextMove then
					W.nextMove = t + 1
					local away = W.hrp.Position - (W.from or W.hrp.Position)
					away = Vector3.new(away.X, 0, away.Z)
					if away.Magnitude < 0.1 then
						away = Vector3.xAxis
					end
					W.hum.WalkSpeed = 17
					W.hum:MoveTo(W.hrp.Position + away.Unit * 25)
				end
			else
				local target = ringPoint(W.bx, W.bz, W.corner)
				local flat = Vector3.new(W.hrp.Position.X, 0, W.hrp.Position.Z)
				if (target - flat).Magnitude < 4 then
					W.corner += W.dir
					target = ringPoint(W.bx, W.bz, W.corner)
					W.nextMove = 0
				end
				if t >= W.nextMove then
					W.nextMove = t + 6
					W.hum:MoveTo(target)
				end
			end
		end
	end

	---------------------------------------------------------------- guns
	function G.ownsGun(player, gun: string): boolean
		local P = G.players[player]
		local d = Profile.data[player]
		if not P or not d or not Data.GUNS[gun] then
			return false
		end
		if P.team == "Police" then
			if gun == "Pistol" then
				return true
			end
			return gun == "Rifle" and d.dept == "SWAT"
		end
		return gun == "Pistol" and d.pistol == true
	end

	function G.equip(player, gun: string)
		local P = G.players[player]
		if not P then
			return
		end
		if gun ~= "" and not G.ownsGun(player, gun) then
			if gun == "Pistol" and P.team == "Civilian" then
				G.notify(player, ("Buy a pistol at IRONSIDE ARMS (%s)."):format(Data.money(Data.GUNS.Pistol.price)), "Error")
			end
			return
		end
		P.equipped = gun
		P.ammo = P.ammo or {}
		if gun ~= "" and P.ammo[gun] == nil then
			P.ammo[gun] = Data.GUNS[gun].mag
		end
		player:SetAttribute("Equipped", gun)
		player:SetAttribute("Ammo", if gun ~= "" then P.ammo[gun] else 0)
	end

	local function lineOfFire(from: Vector3, to: Vector3, ignore: { Instance }): boolean
		losParams.FilterDescendantsInstances = ignore
		local hit = workspace:Raycast(from, to - from, losParams)
		return hit == nil
	end
	G.lineOfFire = lineOfFire

	-- fire the equipped gun along `aim`; the server picks what it hits
	function G.fire(player, aim: Vector3): boolean
		local P = G.players[player]
		local hum = G.humOf(player)
		local hrp = G.hrpOf(player)
		local gun = P and P.equipped
		local spec = gun and Data.GUNS[gun]
		if not P or not spec or not hum or not hrp or hum.Health <= 0 or P.cell or hum.SeatPart then
			return false
		end
		if typeof(aim) ~= "Vector3" or aim.Magnitude < 0.01 or aim.Magnitude ~= aim.Magnitude then
			return false
		end
		local t = os.clock()
		if t < (P.reloadUntil or 0) or t - (P.lastShot or -100) < spec.rate * 0.8 then
			return false
		end
		if (P.ammo[gun] or 0) <= 0 then
			P.reloadUntil = t + spec.reload
			P.ammo[gun] = spec.mag
			player:SetAttribute("Ammo", -1)
			task.delay(spec.reload, function()
				if P.equipped == gun then
					player:SetAttribute("Ammo", P.ammo[gun])
				end
			end)
			return false
		end
		P.lastShot = t
		P.ammo[gun] -= 1
		player:SetAttribute("Ammo", P.ammo[gun])
		aim = aim.Unit
		local origin = hrp.Position + Vector3.new(0, 1.5, 0)
		local best, bestDot = nil, Data.AIM_CONE
		for _, e in G.people() do
			if e.model == player.Character then
				continue
			end
			-- officers don't fire on people who aren't wanted
			if P.team == "Police" and not e.wanted then
				continue
			end
			local to = e.hrp.Position - origin
			if to.Magnitude > spec.range then
				continue
			end
			local dot = to.Unit:Dot(aim)
			if dot > bestDot and lineOfFire(origin, e.hrp.Position, { player.Character, e.model, G.carsFolder }) then
				best, bestDot = e, dot
			end
		end
		G.panic(origin, 90)
		if best then
			local down = G.damagePerson(best, spec.damage, player, "shot", aim * 6)
			G.fx("shot", origin, best.hrp.Position, true, player.UserId)
			blame(player, best, "shot")
			if down and P.team == "Police" and best.kind == "suspect" and best.ref.kind == "robber" then
				G.notify(player, "Robber down! Cuff them.", "Radio")
			end
			return true
		end
		-- nobody in the line of fire: the bullet goes where you aimed (cars take a little damage)
		losParams.FilterDescendantsInstances = { player.Character }
		local hit = workspace:Raycast(origin, aim * spec.range, losParams)
		local stop = if hit then hit.Position else origin + aim * spec.range
		if hit then
			local m = hit.Instance:FindFirstAncestorOfClass("Model")
			while m and m.Parent ~= G.carsFolder and m.Parent ~= workspace do
				m = m.Parent:FindFirstAncestorOfClass("Model")
			end
			local rec = m and G.cars[m]
			if rec then
				G.damageCar(rec, 3)
			end
		end
		G.fx("shot", origin, stop, false, player.UserId)
		return true
	end

	-- armed AI robbers fire at the nearest officer they can see
	function G.robberShoot(S, t: number)
		if t < (S.nextShot or 0) then
			return
		end
		S.nextShot = t + G.rand:NextNumber(1.1, 1.6)
		local origin = S.hrp.Position + Vector3.new(0, 1.5, 0)
		local best, bestD = nil, 42
		for _, e in G.people() do
			if e.cop then
				local d = (e.hrp.Position - origin).Magnitude
				if d < bestD and lineOfFire(origin, e.hrp.Position, { S.model, e.model, G.carsFolder }) then
					best, bestD = e, d
				end
			end
		end
		if not best then
			return
		end
		local hit = G.rand:NextNumber() < 0.5
		G.panic(origin, 80)
		if hit then
			G.damagePerson(best, 9, nil, "shot", Vector3.zero)
			G.fx("shot", origin, best.hrp.Position, true, 0)
		else
			G.fx("shot", origin, best.hrp.Position + Vector3.new(G.rand:NextNumber(-3, 3), G.rand:NextNumber(0, 2), 0), false, 0)
		end
	end

	---------------------------------------------------------------- hooks
	table.insert(G.onStep, function(t: number)
		if t >= (G.nextRunOver or 0) then
			G.nextRunOver = t + 1 / 15
			runOvers(t)
		end
	end)
	table.insert(G.onSecond, function(t: number)
		stepPeds(t)
		local n = 0
		for _ in G.peds do
			n += 1
		end
		if n < Data.SUSPECTS.pedestrians then
			G.spawnPed()
		end
		for k, until_ in hitCooldown do
			if t > until_ + 5 then
				hitCooldown[k] = nil
			end
		end
	end)
	table.insert(G.onPlayerAdded, function(player)
		player:SetAttribute("Equipped", "")
		player:SetAttribute("Ammo", 0)
	end)
	table.insert(G.onPlayerRemoving, function(player)
		blameCooldown[player] = nil
	end)
end
