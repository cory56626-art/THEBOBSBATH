-- Tuning for the skinwalker's hunting brain. Players walk at 16 studs/s.
local Config = {
	DEBUG = false, -- show its brain state above its head (handy when testing)

	-- movement (studs per second)
	PROWL_SPEED = 10,
	STALK_SPEED = 7,
	CHASE_SPEED = 19.5, -- faster than walking (16), slower than sprinting (26): you have to spend stamina
	DESPERATE_SPEED = 23, -- starving: nearly as fast as your sprint

	-- senses
	SIGHT_RANGE = 170,
	SIGHT_FOV = 210, -- degrees, cats see wide
	HEARING_PER_SPEED = 2.6, -- you are heard within (your speed x this) studs; standing still is silent
	WATCHED_ANGLE = 26, -- degrees: if your camera points this close to it, it knows you are looking
	WATCH_RANGE = 170,
	FEEL_RANGE = 9, -- it always senses prey this close, even behind it
	FLASHLIGHT_SIGHT = 280, -- a lit flashlight can be seen from this far, from any angle within 70 studs

	-- attacks
	POUNCE_RANGE = 22,
	POUNCE_MIN = 7,
	POUNCE_SPEED = 52,
	POUNCE_UP = 18,
	ATTACK_RANGE = 8, -- measured from its hips; its head/claws reach this far
	ATTACK_DAMAGE = 28,
	ATTACK_COOLDOWN = 1.3,

	-- hunger (0 = it starves to death)
	HUNGER_START = 75,
	HUNGER_MAX = 100,
	DESPERATE_AT = 25, -- below this it gets faster and stops toying with prey
	HUNGER_DRAIN = { -- per second, by state
		Ambush = 0.009, -- ~3 hours of waiting on a full stomach
		Prowl = 0.03,
		Stalk = 0.05,
		Search = 0.05,
		Toy = 0.05,
		Attack = 0.05,
		Feed = 0,
		Chase = 0.75, -- ~100 s of chasing from a full stomach: run long enough and it dies
		Pounce = 0,
		Wiggle = 0.05,
		Dead = 0,
	},
	POUNCE_COST = 3,
	HIT_FOOD = 16,
	KILL_FOOD = 40,

	-- patience
	AMBUSH_MIN_HUNGER = 32, -- gives up an ambush when hunger falls to this
	MOUSEHOLE_WAIT = { 45, 240 }, -- seconds it waits where you vanished (scaled by hunger)
	SPAWN_SAFE_RADIUS = 35, -- never ambushes right on top of a spawn point

	-- memory
	PERSIST_MEMORY = true, -- remembers where players like to go, across servers (DataStore)
	ARENA_RADIUS = 200, -- where it wanders

	RESPAWN_TIME = 25, -- after starving (testing convenience)
}

return Config
