-- Hospital atmosphere on each player's screen:
--   * failing fluorescent lights flicker (tagged "FlickerLight"), and every light near the skinwalker
--     stutters when it's hunting
--   * the building hums (ambience loop) and all sounds are preloaded
local CollectionService = game:GetService("CollectionService")
local ContentProvider = game:GetService("ContentProvider")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Sfx = require(ReplicatedStorage:WaitForChild("Sfx"))

task.spawn(function()
	pcall(function()
		local list = {}
		for _, id in Sfx.ids() do
			local s = Instance.new("Sound")
			s.SoundId = id
			table.insert(list, s)
		end
		ContentProvider:PreloadAsync(list)
	end)
end)
task.delay(1, function()
	Sfx.loop("World", "Ambience", nil, { volume = 0.35 })
end)

type Lamp = { part: BasePart, light: Light, base: number, flicker: boolean, offUntil: number }
local lamps: { Lamp } = {}
local function addLamp(p: Instance, flicker: boolean)
	if not p:IsA("BasePart") then
		return
	end
	local l = p:FindFirstChildWhichIsA("Light")
	if l then
		table.insert(lamps, { part = p, light = l, base = l.Brightness, flicker = flicker, offUntil = 0 })
	end
end
local flickering = {}
for _, p in CollectionService:GetTagged("FlickerLight") do
	flickering[p] = true
end
for _, p in workspace:GetDescendants() do
	if p:IsA("BasePart") and (p.Name == "Lamp" or p.Name == "SurgeryLamp") then
		addLamp(p, flickering[p] == true)
	end
end

local HUNTING = { Stalk = true, Chase = true, Wiggle = true, Pounce = true, Attack = true, Toy = true, Locker = true }
local acc = 0
RunService.Heartbeat:Connect(function(dt)
	acc += dt
	if acc < 0.05 then
		return
	end
	acc = 0
	local now = os.clock()
	local sw = workspace:FindFirstChild("Skinwalker")
	local swPos = sw and (sw :: Model).PrimaryPart and ((sw :: Model).PrimaryPart :: BasePart).Position
	local hunting = sw and HUNTING[sw:GetAttribute("State") or ""] == true
	for _, L in lamps do
		local near = swPos and (L.part.Position - swPos).Magnitude < (if hunting then 34 else 18)
		local rate = (if L.flicker then 0.06 else 0) + (if near then 0.35 else 0)
		if now > L.offUntil and math.random() < rate then
			L.offUntil = now + math.random() * (if near then 0.25 else 0.15) + 0.03
		end
		local off = now < L.offUntil
		L.light.Brightness = if off then 0 else L.base
		L.part.Material = if off then Enum.Material.SmoothPlastic else Enum.Material.Neon
	end
end)
