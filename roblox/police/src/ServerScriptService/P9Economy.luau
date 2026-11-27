-- P9Economy: making (and losing) money in Northfield.
--   * Robberies: hold Rob at a store's door -> loot in your bag, wanted stars, alarm, 911 call (AI police respond).
--     Bank the loot at Joe's Scrap or by shaking off the police; arrested = loot gone. AI robbers hit stores too.
--   * Jailbreaks: pick your cell's lock (slow) or breach the jail's back wall from outside (frees everyone).
--   * Jobs: pizza delivery and taxi driving, each with a work car. Daily missions for both teams.
--   * Northfield Motors sells cars (spawn yours anywhere with MY CAR); Ironside Arms sells a pistol.
--   * Police departments: Patrol, Traffic, SWAT (rank-gated), each with a pay bonus.
return function(G)
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local HttpService = game:GetService("HttpService")
	local Data = require(ReplicatedStorage:WaitForChild("P9Data"))
	local Profile = require(script.Parent:WaitForChild("P9Profile"))

	local storeCooldown: { [string]: number } = {}
	local robStart: { [any]: { id: string, t: number } } = {}
	local holdStart: { [any]: { what: string, t: number } } = {}
	G.robberies = Data.ROBBERIES

	local function near(player, pos: Vector3, range: number): boolean
		local hrp = G.hrpOf(player)
		return hrp ~= nil and (Vector3.new(hrp.Position.X, 0, hrp.Position.Z) - Vector3.new(pos.X, 0, pos.Z)).Magnitude <= range
	end

	local function storeById(id: string)
		for _, r in Data.ROBBERIES do
			if r.id == id then
				return r
			end
		end
		return nil
	end

	---------------------------------------------------------------- missions
	local function today(): number
		return Data.dayNumber(os.time())
	end

	function G.syncMissions(player)
		local P = G.players[player]
		local d = Profile.data[player]
		if not P or not d then
			return
		end
		local day = today()
		if d.mday ~= day then
			d.mday = day
			d.mprog = {}
			d.mdone = {}
		end
		local list = {}
		for _, m in Data.missionsFor(P.team or "Civilian", day) do
			table.insert(list, { id = m.id, text = m.text:format(m.goal), goal = m.goal,
				progress = math.min(d.mprog[m.id] or 0, m.goal), done = d.mdone[m.id] == true, cash = m.cash })
		end
		player:SetAttribute("Missions", HttpService:JSONEncode(list))
	end

	G.progress = function(player, id: string, n: number)
		local P = G.players[player]
		local d = Profile.data[player]
		if not P or not d or not P.team then
			return
		end
		if d.mday ~= today() then
			G.syncMissions(player)
		end
		for _, m in Data.missionsFor(P.team, today()) do
			if m.id == id and not d.mdone[id] then
				d.mprog[id] = (d.mprog[id] or 0) + n
				if d.mprog[id] >= m.goal then
					d.mdone[id] = true
					Profile.give(player, m.cash, m.xp)
					G.notify(player, ("MISSION COMPLETE: %s  +%s"):format(m.text:format(m.goal), Data.money(m.cash)), "Promotion")
				end
				G.syncMissions(player)
			end
		end
	end

	---------------------------------------------------------------- departments
	G.payMult = function(player, kind: string): number
		local d = Profile.data[player]
		local dept = d and d.dept or "Patrol"
		if dept == "Patrol" and (kind == "arrest" or kind == "booking") then
			return 1.2
		elseif dept == "Traffic" and (kind == "ticket" or kind == "warning") then
			return 1.5
		elseif dept == "SWAT" and kind == "robbery" then
			return 1.5
		end
		return 1
	end

	function G.setDept(player, dept: string): boolean
		local P = G.players[player]
		local d = Profile.data[player]
		local info = Data.DEPTS[dept]
		if not P or not d or P.team ~= "Police" or not info then
			return false
		end
		local rank = Data.rankOf(d.xp)
		if rank < info.rank then
			G.notify(player, ("%s unlocks at %s."):format(info.name, Data.RANKS[info.rank].name), "Error")
			return false
		end
		d.dept = dept
		player:SetAttribute("Dept", dept)
		if P.equipped == "Rifle" and dept ~= "SWAT" then
			G.equip(player, "")
		end
		G.notify(player, ("You joined %s: %s"):format(info.name, info.desc), "Radio")
		return true
	end

	---------------------------------------------------------------- robberies
	local function addLoot(player, amount: number)
		local P = G.players[player]
		P.loot += amount
		player:SetAttribute("Loot", P.loot)
	end

	local function bankLoot(player, how: string)
		local P = G.players[player]
		if not P or P.loot <= 0 then
			return
		end
		local amount = P.loot
		P.loot = 0
		player:SetAttribute("Loot", 0)
		Profile.give(player, amount, 0)
		G.notify(player, ("%s %s!"):format(how, Data.money(amount)), "Cash")
		G.progress(player, "rob", 1)
	end

	-- a player robbery: "begin" when the hold starts, "finish" when it completes
	function G.rob(player, id: string, phase: string): boolean
		local P = G.players[player]
		local store = storeById(id)
		local t = os.clock()
		if not P or not store or P.team ~= "Civilian" or P.cell or P.driving then
			return false
		end
		if not near(player, store.pos, 14) then
			return false
		end
		if t < (storeCooldown[id] or 0) then
			G.notify(player, ("%s was robbed recently. Try again in %ds."):format(store.name,
				math.ceil((storeCooldown[id] or 0) - t)), "Error")
			return false
		end
		if phase == "begin" then
			robStart[player] = { id = id, t = t }
			return true
		end
		local started = robStart[player]
		robStart[player] = nil
		if not started or started.id ~= id or t - started.t < store.time * 0.8 then
			return false
		end
		storeCooldown[id] = t + store.cooldown
		local loot = G.rand:NextInteger(store.loot[1], store.loot[2])
		addLoot(player, loot)
		G.addWanted(player, store.stars, "Robbery at " .. store.name)
		G.notify(player, ("You grabbed %s. Lose the cops or stash it at JOE'S SCRAP!"):format(Data.money(loot)), "Cash")
		G.fx("alarm", store.pos + Vector3.new(0, 6, 0))
		local call = G.newCall("Robbery at " .. store.name, nil, store.stars)
		call.pos = store.pos
		call.aiRespond = true
		call.target = { model = player.Character }
		task.delay(90, function()
			G.closeCall(call)
		end)
		return true
	end

	-- AI robbers: an armed suspect holds up a store, then runs
	function G.spawnRobbery(): any
		local t = os.clock()
		local options = {}
		for _, r in Data.ROBBERIES do
			if t >= (storeCooldown[r.id] or 0) then
				local clear = true
				for player in G.players do
					if near(player, r.pos, 50) then
						clear = false
					end
				end
				if clear then
					table.insert(options, r)
				end
			end
		end
		if #options == 0 then
			return nil
		end
		local store = options[G.rand:NextInteger(1, #options)]
		storeCooldown[store.id] = t + store.cooldown
		local S = G.spawnFootSuspect(store.pos, 3, nil)
		if not S then
			return nil
		end
		S.kind = "robber"
		S.armed = true
		S.robEnd = t + 25
		S.home = store.pos
		S.model:SetAttribute("Armed", true)
		G.setSuspectState(S, "robbing")
		S.call.kind = "Armed robbery at " .. store.name
		S.call.stars = 3
		S.call.aiRespond = true
		S.call.pos = store.pos
		-- a pistol in the robber's hand
		local hand = S.model:FindFirstChild("RightHand") or S.model:FindFirstChild("Right Arm")
		if hand and hand:IsA("BasePart") then
			local gun = Instance.new("Part")
			gun.Name = "Gun"
			gun.Size = Vector3.new(0.25, 0.5, 1.1)
			gun.Color = Color3.fromRGB(30, 30, 34)
			gun.Material = Enum.Material.Metal
			gun.CanCollide = false
			gun.CanQuery = false
			gun.Massless = true
			gun.CFrame = hand.CFrame * CFrame.new(0, -0.4, -0.45)
			local w = Instance.new("WeldConstraint")
			w.Part0 = hand
			w.Part1 = gun
			w.Parent = gun
			gun.Parent = S.model
		end
		G.fx("alarm", store.pos + Vector3.new(0, 6, 0))
		for player, P in G.players do
			if P.team == "Police" then
				G.notify(player, ("DISPATCH: Armed robbery in progress at %s!"):format(store.name), "Radio")
			end
		end
		return S
	end

	---------------------------------------------------------------- jailbreaks
	local function freeFromJail(player, stars: number, why: string)
		local P = G.players[player]
		P.cell = nil
		P.jailUntil = 0
		player:SetAttribute("JailUntil", 0)
		local char = player.Character
		if char then
			char:PivotTo(CFrame.new(Data.JAIL_EXIT + Vector3.new(G.rand:NextNumber(-3, 3), 3, G.rand:NextNumber(-4, 4))))
		end
		G.addWanted(player, stars, why)
	end

	local function jailbreakCall()
		G.fx("alarm", Data.JAIL_BREACH + Vector3.new(0, 8, 0))
		local call = G.newCall("JAILBREAK at the county jail", nil, 3)
		call.pos = Data.JAIL_EXIT
		call.aiRespond = true
		task.delay(60, function()
			G.closeCall(call)
		end)
	end

	-- hold-to-act checks shared by the lock pick and the breach
	local function hold(player, what: string, phase: string, seconds: number): boolean
		local t = os.clock()
		if phase == "begin" then
			holdStart[player] = { what = what, t = t }
			return false
		end
		local h = holdStart[player]
		holdStart[player] = nil
		return h ~= nil and h.what == what and t - h.t >= seconds * 0.8
	end

	function G.lockpick(player, phase: string): boolean
		local P = G.players[player]
		if not P or not P.cell or P.jailUntil - os.clock() < 3 then
			return false
		end
		if not hold(player, "lockpick", phase, 12) then
			return false
		end
		freeFromJail(player, Data.WANTED.jailbreak, "JAILBREAK")
		jailbreakCall()
		return true
	end

	function G.breach(player, phase: string): boolean
		local P = G.players[player]
		if not P or P.team ~= "Civilian" or P.cell or not near(player, Data.JAIL_BREACH, 12) then
			return false
		end
		local anyone = false
		for _, other in G.players do
			if other.cell then
				anyone = true
			end
		end
		if not anyone then
			if phase == "finish" then
				G.notify(player, "Nobody is locked up right now.", "Error")
			end
			return false
		end
		if not hold(player, "breach", phase, 10) then
			return false
		end
		G.fx("breach", Data.JAIL_BREACH + Vector3.new(0, 4, 0))
		for other, OP in G.players do
			if OP.cell then
				freeFromJail(other, Data.WANTED.jailbreak, "Busted out of jail")
			end
		end
		G.addWanted(player, Data.WANTED.jailbreak, "You broke into the jail")
		jailbreakCall()
		return true
	end

	---------------------------------------------------------------- shops
	function G.buyGun(player): boolean
		local P = G.players[player]
		local d = Profile.data[player]
		local price = Data.GUNS.Pistol.price
		if not P or not d or P.team ~= "Civilian" or not near(player, Data.GUN_STORE, 16) then
			return false
		end
		if d.pistol then
			G.notify(player, "You already own a pistol. Equip it with GUN.", "Error")
			return false
		end
		if d.cash < price then
			G.notify(player, ("A pistol costs %s."):format(Data.money(price)), "Error")
			return false
		end
		Profile.give(player, -price, 0)
		d.pistol = true
		player:SetAttribute("HasPistol", true)
		G.notify(player, "You bought a pistol. Shooting people makes you wanted!", "Cash")
		return true
	end

	local function syncCars(player)
		local d = Profile.data[player]
		if d then
			player:SetAttribute("OwnedCars", table.concat(d.cars, ","))
		end
	end

	function G.buyCar(player, kind: string): boolean
		local P = G.players[player]
		local d = Profile.data[player]
		local spec = Data.CARS[kind]
		if not P or not d or not spec or not spec.price or P.team ~= "Civilian" then
			return false
		end
		if not near(player, Data.DEALERSHIP, 45) then
			G.notify(player, "Visit NORTHFIELD MOTORS to buy a car.", "Error")
			return false
		end
		if table.find(d.cars, kind) then
			G.notify(player, "You already own that one. Spawn it with MY CAR.", "Error")
			return false
		end
		if d.cash < spec.price then
			G.notify(player, ("The %s costs %s."):format(spec.name, Data.money(spec.price)), "Error")
			return false
		end
		Profile.give(player, -spec.price, 0)
		table.insert(d.cars, kind)
		syncCars(player)
		G.notify(player, ("You bought a %s! Tap MY CAR to drive it."):format(spec.name), "Cash")
		return true
	end

	function G.spawnOwned(player, kind: string): any
		local P = G.players[player]
		local d = Profile.data[player]
		local hrp = G.hrpOf(player)
		if not P or not d or not hrp or P.team ~= "Civilian" or P.cell or not table.find(d.cars, kind) then
			return nil
		end
		local t = os.clock()
		if t < (P.ownedAt or 0) then
			return nil
		end
		P.ownedAt = t + 8
		if P.ownedCar and P.ownedCar.model.Parent then
			if P.ownedCar.driver and P.ownedCar.driver ~= player then
				G.notify(player, "Someone is driving your car!", "Error")
				return nil
			end
			G.destroyCar(P.ownedCar)
		end
		local rec = G.spawnCar(kind, G.roadSpot(hrp.Position, 11), player)
		P.ownedCar = rec
		G.notify(player, ("Your %s is waiting on the road nearby."):format(Data.CARS[kind].name), "Door")
		return rec
	end

	---------------------------------------------------------------- jobs
	local houseDoors = {}
	for _, bx in { -270, -90, 90, 270 } do
		for k = 0, 2 do
			local cx = bx - 44 + k * 44
			table.insert(houseDoors, Vector3.new(cx - 4, 0, 240))
			table.insert(houseDoors, Vector3.new(cx - 4, 0, 300))
		end
	end
	for _, x in { -300, -240 } do
		table.insert(houseDoors, Vector3.new(x, 0, 80))
	end
	G.houseDoors = houseDoors

	local function setJob(player, job)
		local P = G.players[player]
		P.job = job
		player:SetAttribute("Job", if job then job.name else "")
		player:SetAttribute("JobTarget", if job and job.target then job.target else Vector3.zero)
		player:SetAttribute("JobText", if job then job.text or "" else "")
		player:SetAttribute("JobDeadline", if job and job.deadline then job.deadlineServer else 0)
	end

	local function nextPizza(player)
		local P = G.players[player]
		local job = P.job
		local door = houseDoors[G.rand:NextInteger(1, #houseDoors)]
		local spec = Data.JOBS.Pizza
		job.target = door
		job.deadline = os.clock() + spec.time
		job.deadlineServer = workspace:GetServerTimeNow() + spec.time
		job.text = ("Deliver the pizza to %d %s St"):format(G.rand:NextInteger(10, 99),
			({ "Elm", "Oak", "Maple", "Birch", "Cedar", "Pine" })[G.rand:NextInteger(1, 6)])
		setJob(player, job)
	end

	local function clearPassenger(job)
		if job and job.passenger and job.passenger.Parent then
			job.passenger:Destroy()
		end
		if job then
			job.passenger = nil
		end
	end

	local function nextFare(player)
		local P = G.players[player]
		local job = P.job
		clearPassenger(job)
		local hrp = G.hrpOf(player)
		local spot
		for _ = 1, 15 do
			local s = G.sidewalkSpot(0)
			if s and hrp and (s - hrp.Position).Magnitude > 120 and (s - hrp.Position).Magnitude < 500 then
				spot = s
				break
			end
		end
		spot = spot or G.sidewalkSpot(0) or Data.JOBS.Taxi.start
		local npc, hum = G.makeNpc(spot, "Passenger")
		if npc and hum then
			npc:SetAttribute("Fare", player.UserId)
			hum.WalkSpeed = 8
		end
		job.passenger = npc
		job.stage = "pickup"
		job.target = spot
		job.text = "Pick up your passenger"
		job.deadline = nil
		job.deadlineServer = nil
		setJob(player, job)
	end

	function G.startJob(player, name: string): boolean
		local P = G.players[player]
		local spec = Data.JOBS[name]
		if not P or not spec or P.team ~= "Civilian" or P.cell or P.wanted > 0 then
			if P and P.wanted > 0 then
				G.notify(player, "Nobody hires someone the police are chasing!", "Error")
			end
			return false
		end
		if not near(player, spec.start, 20) then
			return false
		end
		G.quitJob(player)
		local car = G.spawnCar(spec.car, G.roadSpot(spec.start, 11), player)
		if car then
			car.jobCar = true
			car.model:SetAttribute("JobCar", name)
		end
		P.job = { name = name, car = car, count = 0 }
		if name == "Pizza" then
			nextPizza(player)
			G.notify(player, "Pizza job started! Your delivery car is on the road. Walk the pizza to the door.", "Radio")
		else
			nextFare(player)
			G.notify(player, "Taxi shift started! Your cab is on the road. Pick up passengers marked on your map.", "Radio")
		end
		return true
	end

	function G.quitJob(player)
		local P = G.players[player]
		if not P or not P.job then
			return
		end
		clearPassenger(P.job)
		if P.job.car and P.job.car.model.Parent then
			G.destroyCar(P.job.car)
		end
		setJob(player, nil)
	end

	local function jobPay(player, amount: number, text: string, mission: string)
		amount = math.floor(amount)
		Profile.give(player, amount, 0)
		G.notify(player, ("%s  +%s"):format(text, Data.money(amount)), "Cash")
		G.progress(player, mission, 1)
		G.progress(player, "earn", amount)
	end

	local function stepJob(player, P, t: number)
		local job = P.job
		local hrp = G.hrpOf(player)
		if not hrp then
			return
		end
		if P.wanted > 0 or P.cell then
			G.notify(player, "You lost your job. Crime doesn't pay... usually.", "Error")
			G.quitJob(player)
			return
		end
		if job.name == "Pizza" then
			local hum = G.humOf(player)
			if job.target and not (hum and hum.SeatPart) and (Vector3.new(hrp.Position.X, 0, hrp.Position.Z) - job.target).Magnitude < 9 then
				local spec = Data.JOBS.Pizza
				local left = math.max(0, (job.deadline or t) - t)
				jobPay(player, spec.pay[1] + left * spec.pay[2], if left > 0 then "Pizza delivered!" else "Pizza delivered (late)",
					"pizza")
				G.fx("delivered", job.target + Vector3.new(0, 3, 0))
				nextPizza(player)
			end
		elseif job.name == "Taxi" then
			local car = job.car
			if not car or not car.model.Parent then
				G.quitJob(player)
				return
			end
			local slow = car.chassis.AssemblyLinearVelocity.Magnitude < 6
			local driving = P.driving == car.model
			if job.stage == "pickup" then
				local npc = job.passenger
				if not npc or not npc.Parent then
					nextFare(player)
					return
				end
				local nhrp = npc:FindFirstChild("HumanoidRootPart") :: BasePart?
				if driving and slow and nhrp and (car.chassis.Position - nhrp.Position).Magnitude < 18 then
					for _, s in car.model:GetChildren() do
						if s:IsA("Seat") and s.Name == "RearSeat" and not s.Occupant then
							npc:PivotTo(s.CFrame + Vector3.new(0, 2, 0))
							s:Sit(npc:FindFirstChildOfClass("Humanoid"))
							break
						end
					end
					local dest
					for _ = 1, 15 do
						local sp = G.sidewalkSpot(0)
						if sp and (sp - nhrp.Position).Magnitude > 250 then
							dest = sp
							break
						end
					end
					job.stage = "dropoff"
					job.from = nhrp.Position
					job.target = dest or Data.STATION
					job.text = "Drive your passenger to the marker"
					setJob(player, job)
					G.fx("chime", car.chassis.Position)
				end
			elseif job.stage == "dropoff" then
				if driving and slow and (Vector3.new(car.chassis.Position.X, 0, car.chassis.Position.Z) - job.target).Magnitude < 22 then
					local spec = Data.JOBS.Taxi
					local dist = (job.target - (job.from or job.target)).Magnitude
					jobPay(player, spec.pay[1] + dist * spec.pay[2], "Fare complete!", "taxi")
					G.fx("delivered", car.chassis.Position + Vector3.new(0, 4, 0))
					nextFare(player)
				end
			end
		end
	end

	---------------------------------------------------------------- hooks
	table.insert(G.onPlayerAdded, function(player)
		local d = Profile.data[player]
		player:SetAttribute("Dept", d and d.dept or "Patrol")
		player:SetAttribute("HasPistol", d and d.pistol or false)
		syncCars(player)
		setJob(player, nil)
	end)
	table.insert(G.onPlayerRemoving, function(player)
		G.quitJob(player)
		local P = G.players[player]
		if P and P.ownedCar and P.ownedCar.model.Parent then
			G.destroyCar(P.ownedCar)
		end
		robStart[player] = nil
		holdStart[player] = nil
	end)
	table.insert(G.onJailed, function(player)
		G.quitJob(player)
	end)
	table.insert(G.onEscaped, function(player)
		bankLoot(player, "You got away with")
		G.progress(player, "escape", 1)
	end)
	table.insert(G.onSecond, function(t: number)
		for player, P in G.players do
			-- stash the loot at the scrapyard
			if P.loot > 0 and near(player, Data.HIDEOUT, 60) then
				bankLoot(player, "Loot stashed at Joe's Scrap:")
			end
			if P.job then
				stepJob(player, P, t)
			end
			-- miles driven (patrol / drive missions)
			if P.driving then
				local rec = G.cars[P.driving]
				if rec then
					P.miles = (P.miles or 0) + rec.chassis.AssemblyLinearVelocity.Magnitude / 5747
					if P.miles >= 1 then
						P.miles -= 1
						G.progress(player, if P.team == "Police" then "patrol" else "drive", 1)
					end
				end
			end
		end
		-- an AI robbery every few minutes
		if t >= (G.nextRobbery or 0) then
			G.nextRobbery = t + G.rand:NextNumber(110, 200)
			if G.nextRobberyArmed then
				G.spawnRobbery()
			end
			G.nextRobberyArmed = true
		end
	end)
	table.insert(G.onInit, function()
		G.nextRobbery = os.clock() + 60
	end)

	-- a team change re-picks the day's missions
	local baseSetTeam = G.setTeam
	G.setTeam = function(player, team: string): boolean
		local ok = baseSetTeam(player, team)
		if ok then
			G.quitJob(player)
			G.syncMissions(player)
			local d = Profile.data[player]
			if team == "Police" and d then
				player:SetAttribute("Dept", d.dept)
			end
			G.equip(player, "")
		end
		return ok
	end
end
