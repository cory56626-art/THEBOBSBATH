-- Probe: can the server build an R15 NPC from a HumanoidDescription, and which default animations does it carry?
local Players = game:GetService("Players")
local out = {}
local function log(...) local t = {} for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end table.insert(out, table.concat(t, " ")) end
local ok, model = pcall(function()
	return Players:CreateHumanoidModelFromDescription(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)
end)
log("create:", ok, typeof(model))
if ok then
	model.Parent = workspace
	local kids = {}
	for _, c in model:GetChildren() do table.insert(kids, c.ClassName .. ":" .. c.Name) end
	log("children:", table.concat(kids, ", "))
	local animate = model:FindFirstChild("Animate")
	if animate then
		for _, v in animate:GetDescendants() do
			if v:IsA("Animation") then log("anim", v.Parent.Name, v.Name, v.AnimationId) end
		end
	end
	local hum = model:FindFirstChildOfClass("Humanoid")
	local animator = hum and hum:FindFirstChildOfClass("Animator")
	log("animator:", animator ~= nil)
	for _, id in { "rbxassetid://507777826", "rbxassetid://507767714", "rbxassetid://507766388", "rbxassetid://913402848" } do
		local a = Instance.new("Animation")
		a.AnimationId = id
		local ok2, track = pcall(function() return (animator or hum):LoadAnimation(a) end)
		if ok2 then
			track:Play()
			local t0 = os.clock()
			while track.Length == 0 and os.clock() - t0 < 4 do task.wait(0.1) end
			log("load", id, "length", track.Length)
		else
			log("load", id, "ERROR", track)
		end
	end
end
return table.concat(out, "\n")
