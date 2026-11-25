-- Plays named sounds out of the packed sound sheets (see SoundBank / tools/sounds.py).
--   Sfx.play("Creature", "Growl1", part, { volume = 1, pitch = 1, range = 80 })
--   Sfx.play("Player", "FlashClick")              -- no part: a 2D sound (UI / your own ears)
--   local s = Sfx.loop("World", "Ambience", nil, { volume = 0.4 })
local SoundService = game:GetService("SoundService")
local Debris = game:GetService("Debris")
local Bank = require(script.Parent:WaitForChild("SoundBank"))

local Sfx = {}

type Opts = { volume: number?, pitch: number?, range: number?, minRange: number? }

local function make(sheet: string, name: string, parent: Instance?, opts: Opts?): (Sound?, number)
	local s = Bank[sheet]
	local r = s and s.Regions[name]
	if not r then
		return nil, 0
	end
	local o = opts or {}
	local snd = Instance.new("Sound")
	snd.Name = name
	snd.SoundId = s.Id
	snd.PlaybackRegionsEnabled = true
	snd.PlaybackRegion = NumberRange.new(r[1], r[2])
	snd.Volume = o.volume or 0.8
	snd.PlaybackSpeed = o.pitch or 1
	snd.RollOffMode = Enum.RollOffMode.InverseTapered
	snd.RollOffMinDistance = o.minRange or 6
	snd.RollOffMaxDistance = o.range or 80
	snd.Parent = parent or SoundService
	return snd, (r[2] - r[1]) / (o.pitch or 1)
end

function Sfx.play(sheet: string, name: string, parent: Instance?, opts: Opts?): Sound?
	local snd, len = make(sheet, name, parent, opts)
	if snd then
		snd:Play()
		Debris:AddItem(snd, len + 0.3)
	end
	return snd
end

-- pick a random sound from a list of names, e.g. Sfx.any("Player", {"Walk1","Walk2"}, part)
function Sfx.any(sheet: string, names: { string }, parent: Instance?, opts: Opts?): Sound?
	return Sfx.play(sheet, names[math.random(1, #names)], parent, opts)
end

function Sfx.loop(sheet: string, name: string, parent: Instance?, opts: Opts?): Sound?
	local snd = make(sheet, name, parent, opts)
	if snd then
		snd.LoopRegion = snd.PlaybackRegion
		snd.Looped = true
		snd:Play()
	end
	return snd
end

function Sfx.ids(): { string }
	local list = {}
	for _, s in Bank do
		table.insert(list, s.Id)
	end
	return list
end

return Sfx
