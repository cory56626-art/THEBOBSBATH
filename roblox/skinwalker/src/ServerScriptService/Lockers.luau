-- Hiding spots (lockers and closets). Any model tagged "HideSpot" with parts Inside, Front and Door works.
-- Players hide/leave with a prompt; the skinwalker can rip a spot open (Lockers.forceOut).
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Sfx = require(ReplicatedStorage:WaitForChild("Sfx"))

local Lockers = {}
local occupant: { [Model]: Model } = {} -- hiding spot -> character
local inside: { [Model]: Model } = {} -- character -> hiding spot
local inited = false

local function doorSwing(spot: Model, angle: number, time: number)
	local door = spot:FindFirstChild("Door") :: BasePart?
	if not door then
		return
	end
	local closed = door:GetAttribute("ClosedCFrame") :: CFrame?
	if not closed then
		closed = door.CFrame
		door:SetAttribute("ClosedCFrame", closed)
	end
	local hinge = (closed :: CFrame) * CFrame.new(-door.Size.X / 2, 0, 0)
	-- the slats, top panel and handle ride along with the door
	local riders: { { part: BasePart, offset: CFrame } } = {}
	for _, d in door:GetChildren() do
		if d:IsA("BasePart") then
			local rest = d:GetAttribute("ClosedOffset") :: CFrame?
			if not rest then
				rest = (closed :: CFrame):ToObjectSpace(d.CFrame)
				d:SetAttribute("ClosedOffset", rest)
			end
			table.insert(riders, { part = d, offset = rest :: CFrame })
		end
	end
	local v = Instance.new("NumberValue")
	v.Changed:Connect(function(a)
		local cf = hinge * CFrame.Angles(0, math.rad(a), 0) * CFrame.new(door.Size.X / 2, 0, 0)
		door.CFrame = cf
		for _, r in riders do
			r.part.CFrame = cf * r.offset
		end
	end)
	local open = TweenService:Create(v, TweenInfo.new(time * 0.4, Enum.EasingStyle.Quad), { Value = angle })
	open:Play()
	open.Completed:Connect(function()
		local close = TweenService:Create(v, TweenInfo.new(time * 0.6, Enum.EasingStyle.Quad), { Value = 0 })
		close:Play()
		close.Completed:Connect(function()
			v:Destroy()
		end)
	end)
end

local function prompt(spot: Model): ProximityPrompt?
	return spot:FindFirstChild("HidePrompt", true) :: ProximityPrompt?
end

function Lockers.hide(character: Model, spot: Model): boolean
	if occupant[spot] or inside[character] then
		return false
	end
	local hrp = character:FindFirstChild("HumanoidRootPart") :: BasePart?
	local spotInside = spot:FindFirstChild("Inside") :: BasePart?
	if not hrp or not spotInside then
		return false
	end
	occupant[spot], inside[character] = character, spot
	doorSwing(spot, 75, 0.7)
	Sfx.play("Player", "LockerOpen", spot:FindFirstChild("Door"), { volume = 0.9, range = 70 })
	task.delay(0.25, function()
		if inside[character] == spot then
			hrp.Anchored = true
			character:PivotTo(spotInside.CFrame)
		end
	end)
	character:SetAttribute("Hidden", true)
	local ref = Instance.new("ObjectValue")
	ref.Name = "HidingSpot"
	ref.Value = spot
	ref.Parent = character
	local p = prompt(spot)
	if p then
		p.ActionText = "Leave"
	end
	return true
end

function Lockers.leave(character: Model, forced: boolean?)
	local spot = inside[character]
	if not spot then
		return
	end
	occupant[spot], inside[character] = nil, nil
	local hrp = character:FindFirstChild("HumanoidRootPart") :: BasePart?
	local front = spot:FindFirstChild("Front") :: BasePart?
	doorSwing(spot, if forced then 110 else 75, if forced then 0.5 else 0.7)
	Sfx.play("Player", if forced then "LockerClose" else "LockerOpen", spot:FindFirstChild("Door"),
		{ volume = if forced then 1.2 else 0.9, range = 90 })
	if hrp and front then
		character:PivotTo(front.CFrame)
		hrp.Anchored = false
	end
	character:SetAttribute("Hidden", false)
	local ref = character:FindFirstChild("HidingSpot")
	if ref then
		ref:Destroy()
	end
	local p = prompt(spot)
	if p then
		p.ActionText = "Hide"
	end
end

-- the skinwalker tears the door open and drags you out
function Lockers.forceOut(character: Model)
	Lockers.leave(character, true)
end

function Lockers.spotOf(character: Model): Model?
	return inside[character]
end

function Lockers.occupantOf(spot: Model): Model?
	return occupant[spot]
end

function Lockers.near(pos: Vector3, radius: number): { Model }
	local list = {}
	for _, spot in CollectionService:GetTagged("HideSpot") do
		if spot:IsA("Model") and spot:IsDescendantOf(workspace) then
			local front = spot:FindFirstChild("Front") :: BasePart?
			if front and (front.Position - pos).Magnitude <= radius then
				table.insert(list, spot)
			end
		end
	end
	table.sort(list, function(a, b)
		return ((a :: any).Front.Position - pos).Magnitude < ((b :: any).Front.Position - pos).Magnitude
	end)
	return list
end

function Lockers.init()
	if inited then
		return
	end
	inited = true
	local function bind(spot: Instance)
		if not spot:IsA("Model") or spot:FindFirstChild("HidePrompt", true) then
			return
		end
		local door = spot:FindFirstChild("Door") :: BasePart?
		if not door then
			return
		end
		local anchor = door
		for _, d in door:GetChildren() do
			if d:IsA("BasePart") and d.Name == "Slat" then
				anchor = d -- eye level: visible from inside the locker
				break
			end
		end
		local p = Instance.new("ProximityPrompt")
		p.Name = "HidePrompt"
		p.ActionText = "Hide"
		p.ObjectText = tostring(spot:GetAttribute("Kind") or "Locker")
		p.HoldDuration = 0.25
		p.MaxActivationDistance = 7
		p.RequiresLineOfSight = false
		p.Parent = anchor
		p.Triggered:Connect(function(player)
			local character = player.Character
			if not character then
				return
			end
			local hum = character:FindFirstChildOfClass("Humanoid")
			if not hum or hum.Health <= 0 then
				return
			end
			if inside[character] == spot then
				Lockers.leave(character)
			elseif not occupant[spot] and not inside[character] then
				Lockers.hide(character, spot)
			end
		end)
	end
	for _, spot in CollectionService:GetTagged("HideSpot") do
		bind(spot)
	end
	CollectionService:GetInstanceAddedSignal("HideSpot"):Connect(bind)
	-- clean up when a hidden player dies or leaves
	local function watch(player: Player)
		player.CharacterRemoving:Connect(function(character)
			local spot = inside[character]
			if spot then
				occupant[spot], inside[character] = nil, nil
				local p = prompt(spot)
				if p then
					p.ActionText = "Hide"
				end
			end
		end)
	end
	Players.PlayerAdded:Connect(watch)
	for _, p in Players:GetPlayers() do
		watch(p)
	end
end

return Lockers
