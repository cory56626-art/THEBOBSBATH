-- Animates every player character on this client (so everyone sees everyone's animations) using CharacterPoser,
-- and plays footsteps exactly when each foot lands. Runs in RunService.PreSimulation, after the animation
-- compositor, which is where Roblox says procedural joint changes belong.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Poser = require(ReplicatedStorage:WaitForChild("CharacterPoser"))
local Sfx = require(ReplicatedStorage:WaitForChild("Sfx"))

local rigs: { [Model]: any } = {}
local errored: { [Model]: boolean } = {}

local function attach(char: Model)
	char:WaitForChild("Humanoid", 10)
	char:WaitForChild("HumanoidRootPart", 10)
	-- the default Animate script (and any tracks it started) would fight the procedural poses
	local animate = char:FindFirstChild("Animate")
	if animate and animate:IsA("LocalScript") then
		animate.Disabled = true
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	local animator = hum and hum:FindFirstChildOfClass("Animator")
	if animator then
		for _, track in animator:GetPlayingAnimationTracks() do
			track:Stop(0)
		end
	end
	local R = Poser.attach(char)
	if R then
		rigs[char] = R
		char.AncestryChanged:Connect(function(_, parent)
			if not parent then
				rigs[char] = nil
			end
		end)
	end
end

local function watch(p: Player)
	p.CharacterAdded:Connect(attach)
	if p.Character then
		task.spawn(attach, p.Character)
	end
end
Players.PlayerAdded:Connect(watch)
for _, p in Players:GetPlayers() do
	watch(p)
end

local STEPS = {
	crouch = { "Crouch1", "Crouch2" },
	walk = { "Walk1", "Walk2", "Walk3", "Walk4" },
	run = { "Run1", "Run2", "Run3", "Run4" },
}

RunService.PreSimulation:Connect(function(dt)
	dt = math.min(dt, 0.1)
	for char, R in rigs do
		if char.Parent then
			local ok, foot, gait = pcall(Poser.step, R, dt)
			if not ok then
				if not errored[char] then
					errored[char] = true
					warn("[CharacterAnimator] " .. tostring(foot))
				end
			elseif foot and gait then
				Sfx.any("Player", STEPS[gait], foot, {
					volume = if gait == "crouch" then 0.25 elseif gait == "run" then 0.9 else 0.55,
					pitch = 0.92 + math.random() * 0.16,
					range = if gait == "crouch" then 25 elseif gait == "run" then 95 else 60,
				})
			end
		end
	end
end)

-- status line for the diagnostics reporter
_G.AnimatorStatus = function(): string
	local me = Players.LocalPlayer.Character
	local R = me and rigs[me]
	if not R then
		return "no rig for my character (hasCharacter=" .. tostring(me ~= nil) .. ")"
	end
	return Poser.status(R)
end
