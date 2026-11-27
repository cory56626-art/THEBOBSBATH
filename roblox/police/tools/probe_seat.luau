-- Where does a seated avatar end up in each car? (R6 and R15 dummies, SeatWeld offsets)
local Players = game:GetService("Players")
local SS = game:GetService("ServerStorage")
local out = {}
local function log(...) local t = {} for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end table.insert(out, table.concat(t, " ")) end
pcall(function() log("GameSettingsAvatar", tostring((game:GetService("StarterPlayer") :: any).GameSettingsAvatar)) end)
for _, kind in { "Cruiser", "Sedan", "Sports" } do
	for _, rig in { Enum.HumanoidRigType.R6, Enum.HumanoidRigType.R15 } do
		local car = SS.Cars[kind]:Clone()
		car:PivotTo(CFrame.new(0, 1.3, 0))
		car.Parent = workspace
		local npc = Players:CreateHumanoidModelFromDescription(Instance.new("HumanoidDescription"), rig)
		npc.Parent = workspace
		local hum = npc:FindFirstChildOfClass("Humanoid")
		local seat = car.DriveSeat
		npc:PivotTo(seat.CFrame + Vector3.new(0, 3, 0))
		seat:Sit(hum)
		task.wait(0.2)
		local w = seat:FindFirstChild("SeatWeld")
		local hrp = npc.HumanoidRootPart
		local hrpCF = if w then seat.CFrame * w.C0 * w.C1:Inverse() else hrp.CFrame
		-- head top and torso relative to HRP in the rig's rest pose
		local head = npc.Head
		local headTop = (hrpCF * hrp.CFrame:ToObjectSpace(head.CFrame)).Position.Y + head.Size.Y / 2
		local minX, maxX = math.huge, -math.huge
		for _, p in npc:GetDescendants() do
			if p:IsA("BasePart") and p.Name ~= "HumanoidRootPart" and (p.Name:find("Arm") or p.Name:find("Hand") or p.Name:find("Torso")) then
				local wp = hrpCF * hrp.CFrame:ToObjectSpace(p.CFrame)
				minX = math.min(minX, wp.Position.X - p.Size.X / 2)
				maxX = math.max(maxX, wp.Position.X + p.Size.X / 2)
			end
		end
		local roof = -math.huge
		for _, p in car:GetChildren() do
			if p:IsA("BasePart") and p.Name == "Cabin" then roof = p.Position.Y + p.Size.Y / 2 end
		end
		log(kind, rig.Name, "seatTop", math.floor((seat.Position.Y + seat.Size.Y / 2) * 100) / 100,
			"hrpY", math.floor(hrpCF.Position.Y * 100) / 100, "headTop", math.floor(headTop * 100) / 100,
			"roof", math.floor(roof * 100) / 100, "body x", math.floor(minX * 100) / 100, math.floor(maxX * 100) / 100,
			"carHalfW", car.Chassis.Size.X / 2, "hipHeight", hum.HipHeight, "C1", w and tostring(w.C1.Position) or "noweld",
			"occupant", tostring(seat.Occupant ~= nil))
		car:Destroy()
		npc:Destroy()
	end
end
return table.concat(out, "\n")
