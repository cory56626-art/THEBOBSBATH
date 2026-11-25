-- StormBoss: boss fights (adds to StormGame). Every few minutes a boss wakes up in its arena:
--   * The Thunder King (Thunder Plains): lightning rain on everyone in the arena, a thunderclap shockwave you have
--     to JUMP over, and storm-spirit minions
--   * The Tornado Tyrant (Eye of the Storm): pulls everyone toward its funnel, hurls debris, spawns mini twisters
-- At half health they become ENRAGED (faster, more of everything). Players BLAST them (StormGame.blast); everyone who
-- fought gets loot, and the best fighter has double the chance at the boss's own Secret storm.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Data = require(ReplicatedStorage:WaitForChild("StormData"))

return function(G, PD, helpers)
	local hrpOf, now, newRoot, newRec = helpers.hrpOf, helpers.now, helpers.newRoot, helpers.newRec
	G.boss = nil
	G.nextBossAt = math.huge
	G.lastBoss = ""

	local function inArena(def, pos: Vector3): boolean
		local d = pos - def.center
		return Vector3.new(d.X, 0, d.Z).Magnitude < def.radius + 20 and d.Y < 60
	end

	-- everyone standing in (or right around) the boss's arena
	local function fighters(def)
		local list = {}
		for player in G.players do
			local hrp = hrpOf(player)
			if hrp and inArena(def, hrp.Position) then
				table.insert(list, { player = player, hrp = hrp })
			end
		end
		return list
	end
	G.bossFighters = fighters

	local function publish()
		local B = G.boss
		workspace:SetAttribute("Boss", if B then B.id else "")
		workspace:SetAttribute("BossHP", if B then B.hp else 0)
		workspace:SetAttribute("BossMaxHP", if B then B.maxHp else 0)
		workspace:SetAttribute("BossEnds", if B then B.endsAt else 0)
		workspace:SetAttribute("BossPhase", if B then B.phase else 0)
	end

	function G.startBoss(id: string?)
		if G.boss then
			return
		end
		local pick = id
		if not pick then
			pick = Data.BOSS_ORDER[1]
			for i, b in Data.BOSS_ORDER do
				if b == G.lastBoss then
					pick = Data.BOSS_ORDER[i % #Data.BOSS_ORDER + 1]
				end
			end
		end
		local def = Data.BOSSES[pick :: string]
		local count = 0
		for _ in G.players do
			count += 1
		end
		local maxHp = def.baseHp + def.hpPerPlayer * math.max(1, count)
		local height = if pick == "ThunderKing" then 26 else 7
		local mover = G.makeMover("Boss", 12, "Boss", def.center + Vector3.new(0, height, 0), { BossId = pick, PullUntil = 0,
			PullPower = 0 })
		G.boss = {
			id = pick,
			def = def,
			mover = mover,
			hp = maxHp,
			maxHp = maxHp,
			phase = 1,
			endsAt = now() + Data.BOSS_TIME,
			nextAttack = os.clock() + 4,
			attackIndex = 0,
			damage = {},
			minions = {},
			twisters = {},
			clap = nil,
			pullUntil = 0,
			touchAt = {},
			height = height,
		}
		G.lastBoss = pick :: string
		publish()
		G.fx("bossSpawn", def.center, pick)
		G.broadcast(def.name:upper() .. " has awoken in the " .. Data.STAGES[def.stage].name
			.. "! Jump into the red BOSS PORTAL by the road to fight it!", "Boss")
	end

	local function removeSweeper(sw)
		for j = #G.sweepers, 1, -1 do
			if G.sweepers[j] == sw then
				table.remove(G.sweepers, j)
			end
		end
	end

	local function clearAdds(B)
		for _, m in B.minions do
			if m.b.part.Parent then
				G.fx("vanish", m.b.part.Position)
				m.b.part:Destroy()
			end
		end
		B.minions = {}
		for _, sw in B.twisters do
			if sw.b.part.Parent then
				G.fx("vanish", sw.b.part.Position)
				sw.b.part:Destroy()
			end
			removeSweeper(sw)
		end
		B.twisters = {}
	end

	-- loot: cash plus a storm straight into your base (Epic or better; Secret = the boss's own storm)
	function G.bossLoot(player, bossId: string, rank: number, share: number)
		local d = PD.profiles[player]
		local P = G.players[player]
		local def = Data.BOSSES[bossId]
		if not d or not P or not def then
			return nil
		end
		local cash = math.floor(math.max(2500, G.incomeOf(player) * 90) * (0.5 + share))
		d.cash += cash
		local weights = table.clone(Data.BOSS_DROPS)
		if rank == 1 then
			weights[7] *= 2
		end
		local r = Data.pickRarity(weights, G.rand)
		local kind
		if r == 7 then
			kind = def.secret
		else
			local kinds = Data.kindsOfRarity(r)
			kind = kinds[G.rand:NextInteger(1, #kinds)]
		end
		local mut = G.rollMutation()
		local result = { kind = kind, mutation = mut, rarity = r, placed = false, cash = cash, boss = bossId, rank = rank }
		if G.freeSlots(P.plot) > 0 then
			local root = newRoot(kind, mut, CFrame.new(P.plot.floor.Position + Vector3.new(0, 6, 0)))
			local rec = newRec(root, kind, mut)
			G.putInPlot(rec, P.plot)
			result.placed = true
		else
			local extra = math.floor(Data.income(kind, mut) * 60 * G.multiplier(player))
			d.cash += extra
			result.cash += extra
		end
		PD.sync(player, G.incomeOf(player))
		G.tell(player, "Crate", result)
		if result.placed then
			G.discover(player, kind, mut)
		end
		if r == 7 then
			G.broadcast(G.nameOf(player) .. " got the SECRET storm: " .. Data.KINDS[kind].name .. "!", "Announce")
		end
		return result
	end

	function G.endBoss(won: boolean)
		local B = G.boss
		if not B then
			return
		end
		G.boss = nil
		local pos = B.mover.part.Position
		clearAdds(B)
		B.mover.part:Destroy()
		G.nextBossAt = now() + Data.BOSS_EVERY
		workspace:SetAttribute("NextBoss", G.nextBossAt)
		publish()
		if not won then
			G.fx("bossEscape", pos, B.id)
			G.broadcast(B.def.name .. " got away! It will be back...", "Error")
			return
		end
		G.fx("bossDefeated", pos, B.id)
		local list, total = {}, 0
		for player, dmg in B.damage do
			if G.players[player] and dmg >= Data.BLAST.damage * 3 then
				table.insert(list, { player = player, dmg = dmg })
				total += dmg
			end
		end
		table.sort(list, function(a, b)
			return a.dmg > b.dmg
		end)
		local top = list[1]
		G.broadcast(B.def.name .. " is DEFEATED!" .. (if top then (" Top fighter: " .. G.nameOf(top.player)) else ""), "Victory")
		for rank, e in list do
			G.bossLoot(e.player, B.id, rank, e.dmg / math.max(1, total))
		end
	end

	function G.damageBoss(player, amount: number)
		local B = G.boss
		if not B then
			return
		end
		B.hp = math.max(0, B.hp - amount)
		B.damage[player] = (B.damage[player] or 0) + amount
		if B.phase == 1 and B.hp <= B.maxHp * 0.5 and B.hp > 0 then
			B.phase = 2
			G.fx("bossPhase", B.mover.part.Position, B.id)
			G.broadcast(B.def.name .. " is ENRAGED!", "Boss")
		end
		workspace:SetAttribute("BossHP", B.hp)
		workspace:SetAttribute("BossPhase", B.phase)
		if B.hp <= 0 then
			G.endBoss(true)
		end
	end

	---------------------------------------------------------------- attacks
	local function lead(hrp: BasePart, secs: number): Vector3
		local v = hrp.AssemblyLinearVelocity
		return hrp.Position + Vector3.new(v.X, 0, v.Z) * secs
	end
	local function randomInArena(def): Vector3
		local a = G.rand:NextNumber(0, math.pi * 2)
		local r = G.rand:NextNumber(0, def.radius - 2)
		return def.center + Vector3.new(math.cos(a) * r, 0, math.sin(a) * r)
	end

	local ATTACKS = {}
	ATTACKS.ThunderKing = {
		-- lightning rains on every fighter (twice when enraged) and all over the arena
		rain = function(B, list)
			local per = if B.phase == 2 then 2 else 1
			for _, f in list do
				for k = 1, per do
					G.queueStrike(lead(f.hrp, 1) + Vector3.new(G.rand:NextNumber(-4, 4), 0, G.rand:NextNumber(-4, 4)),
						1.1 + (k - 1) * 0.6, 7)
				end
			end
			for _ = 1, (if B.phase == 2 then 7 else 4) do
				G.queueStrike(randomInArena(B.def), 1.2, 7)
			end
		end,
		-- a ring of thunder rolls out across the ground: jump over it!
		clap = function(B, _list, t)
			local center = G.groundAt(B.mover.part.Position)
			local delay = 0.9
			local speed = if B.phase == 2 then 46 else 36
			B.clap = { center = center, t0 = t + delay, speed = speed, maxR = B.def.radius + 24, hit = {} }
			G.fx("clap", center, speed, B.def.radius + 24, delay)
		end,
		-- storm-spirit minions hunt the fighters
		summon = function(B, _list, t)
			for _ = 1, (if B.phase == 2 then 3 else 2) do
				local pos = B.mover.part.Position + Vector3.new(G.rand:NextNumber(-8, 8), -10, G.rand:NextNumber(-8, 8))
				local b = G.makeMover("Minion", 3.4, "Chaser", pos, { Rarity = 4, Lurker = true, Target = 0 })
				G.fx("rise", pos, 4)
				table.insert(B.minions, { b = b, expires = t + 16 })
			end
		end,
	}
	ATTACKS.TornadoTyrant = {
		-- everyone gets dragged toward the funnel (clients apply the pull); touching it flings you
		pull = function(B, _list, t)
			local secs = if B.phase == 2 then 3.5 else 2.6
			B.pullUntil = t + secs
			B.mover.part:SetAttribute("PullUntil", now() + secs)
			B.mover.part:SetAttribute("PullPower", if B.phase == 2 then 26 else 18)
			G.fx("pull", B.mover.part.Position)
		end,
		-- rocks hurled where the fighters are running
		debris = function(B, list)
			local n = if B.phase == 2 then 2 else 1
			for _, f in list do
				for _ = 1, n do
					local to = G.groundAt(lead(f.hrp, 1.2) + Vector3.new(G.rand:NextNumber(-5, 5), 0, G.rand:NextNumber(-5, 5)))
					G.fx("throw", B.mover.part.Position + Vector3.new(0, 30, 0), to, 1.2)
					G.queueStrike(to, 1.2, 6, "rock")
				end
			end
		end,
		-- mini twisters chase the fighters
		twisters = function(B, _list, t)
			for _ = 1, (if B.phase == 2 then 3 else 2) do
				local sw = G.spawnSweeper(B.def.stage, true)
				sw.boss = true
				sw.expires = t + 13
				sw.b.part.CFrame = CFrame.new(B.mover.part.Position + Vector3.new(G.rand:NextNumber(-10, 10), -2,
					G.rand:NextNumber(-10, 10)))
				table.insert(B.twisters, sw)
			end
		end,
	}
	local ORDER = {
		ThunderKing = { "rain", "clap", "summon", "rain", "clap" },
		TornadoTyrant = { "pull", "debris", "twisters", "debris", "pull" },
	}

	local function nearest(list, pos: Vector3)
		local best, bestD = nil, math.huge
		for _, f in list do
			local d = (f.hrp.Position - pos).Magnitude
			if d < bestD then
				best, bestD = f, d
			end
		end
		return best
	end

	function G.stepBoss(t: number)
		local B = G.boss
		if not B then
			if now() >= G.nextBossAt then
				if G.event then
					G.nextBossAt = now() + 20 -- let the weather calm down first
					workspace:SetAttribute("NextBoss", G.nextBossAt)
					return
				end
				G.startBoss()
			end
			return
		end
		if now() >= B.endsAt then
			G.endBoss(false)
			return
		end
		local def = B.def
		local list = fighters(def)
		local body = B.mover
		local bpos = body.part.Position
		-- movement
		if B.id == "ThunderKing" then
			local a = t * (if B.phase == 2 then 0.35 else 0.22)
			local goal = def.center + Vector3.new(math.cos(a) * 18, B.height, math.sin(a) * 18)
			G.moveSpirit(body, goal, if B.phase == 2 then 18 else 13, nil, t, false)
			local f = nearest(list, bpos)
			if f then
				local flat = Vector3.new(f.hrp.Position.X - bpos.X, 0, f.hrp.Position.Z - bpos.Z)
				if flat.Magnitude > 0.1 then
					body.ao.CFrame = CFrame.lookAt(Vector3.zero, flat)
				end
			end
		else
			local f = nearest(list, bpos)
			local goal = if f then f.hrp.Position else def.center
			local off = Vector3.new(goal.X - def.center.X, 0, goal.Z - def.center.Z)
			if off.Magnitude > def.radius - 8 then
				goal = def.center + off.Unit * (def.radius - 8)
			end
			G.moveSpirit(body, Vector3.new(goal.X, B.height, goal.Z), if B.phase == 2 then 13 else 9, nil, t, false)
			for _, ff in list do
				local d = ff.hrp.Position - bpos
				local flat = Vector3.new(d.X, 0, d.Z)
				if flat.Magnitude < 10 and t - (B.touchAt[ff.player] or -100) > 1.5 then
					B.touchAt[ff.player] = t
					G.hit(ff.player, (if flat.Magnitude > 0.1 then flat.Unit else Vector3.zAxis) * 1.3 + Vector3.new(0, 1.6, 0),
						"flung")
				end
			end
		end
		-- attacks (only when someone is there to fight)
		if t >= B.nextAttack and #list > 0 then
			local order = ORDER[B.id]
			B.attackIndex = B.attackIndex % #order + 1
			local name = order[B.attackIndex]
			ATTACKS[B.id][name](B, list, t)
			G.fx("bossAttack", bpos, B.id, name)
			B.nextAttack = t + def.attackEvery * (if B.phase == 2 then 0.7 else 1)
		end
		-- the thunderclap ring: anyone on the ground where it passes gets hit (jumping clears it)
		local clap = B.clap
		if clap and t >= clap.t0 then
			local r = (t - clap.t0) * clap.speed
			if r > clap.maxR then
				B.clap = nil
			else
				for player in G.players do
					local hrp = hrpOf(player)
					if hrp and not clap.hit[player] then
						local d = hrp.Position - clap.center
						local flat = Vector3.new(d.X, 0, d.Z)
						if math.abs(flat.Magnitude - r) < 2.6 and d.Y < 5 then
							clap.hit[player] = true
							G.hit(player, (if flat.Magnitude > 0.1 then flat.Unit else Vector3.zAxis) + Vector3.new(0, 1, 0), "boss")
						end
					end
				end
			end
		end
		-- minions chase the nearest fighter
		for i = #B.minions, 1, -1 do
			local m = B.minions[i]
			if t > m.expires or not m.b.part.Parent then
				if m.b.part.Parent then
					G.fx("vanish", m.b.part.Position)
					m.b.part:Destroy()
				end
				table.remove(B.minions, i)
			else
				local f = nearest(list, m.b.part.Position)
				if f then
					m.b.part:SetAttribute("Target", f.player.UserId)
					local dist = G.moveSpirit(m.b, f.hrp.Position, Data.STAGES[def.stage].spiritSpeed + 4, nil, t, true)
					if dist < 3.6 then
						local away = f.hrp.Position - m.b.part.Position
						G.hit(f.player, Vector3.new(away.X, 0, away.Z).Unit + Vector3.new(0, 0.6, 0), "boss")
						G.fx("vanish", m.b.part.Position)
						m.b.part:Destroy()
						table.remove(B.minions, i)
					end
				else
					G.moveSpirit(m.b, bpos, 10, nil, t, false)
				end
			end
		end
		-- mini twisters chase fighters
		for i = #B.twisters, 1, -1 do
			local sw = B.twisters[i]
			if t > sw.expires or not sw.b.part.Parent then
				if sw.b.part.Parent then
					G.fx("vanish", sw.b.part.Position)
					sw.b.part:Destroy()
				end
				table.remove(B.twisters, i)
				removeSweeper(sw)
			else
				local f = nearest(list, sw.b.part.Position)
				G.stepSweeper(sw, t, if f then f.hrp.Position else def.center, 17)
			end
		end
	end
end
