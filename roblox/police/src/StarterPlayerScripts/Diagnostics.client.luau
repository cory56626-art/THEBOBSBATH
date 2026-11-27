-- Reports this client's script errors/warnings and a short status line to the server (see Diagnostics.server).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local LogService = game:GetService("LogService")
local UserInputService = game:GetService("UserInputService")
local Stats = game:GetService("Stats")

local remote = ReplicatedStorage:WaitForChild("ClientDiag") :: RemoteEvent
local sent = 0
local seen: { [string]: number } = {}
local function send(msg: string, always: boolean?)
	-- the same error repeated is reported twice, then counted silently
	local n = (seen[msg] or 0) + 1
	seen[msg] = n
	if not always and n > 2 then
		if n == 10 or n == 100 then
			remote:FireServer(("(x%d) %s"):format(n, msg))
		end
		return
	end
	sent += 1
	if sent <= 120 then
		remote:FireServer(msg)
	end
end

LogService.MessageOut:Connect(function(message, kind)
	if kind == Enum.MessageType.MessageError or kind == Enum.MessageType.MessageWarning then
		-- skip noise from Roblox's own core scripts
		if not string.find(message, "CoreGui") and not string.find(message, "CorePackages") then
			send((if kind == Enum.MessageType.MessageError then "ERROR " else "WARN ") .. message)
		end
	end
end)

send(("joined: touch=%s keyboard=%s"):format(tostring(UserInputService.TouchEnabled),
	tostring(UserInputService.KeyboardEnabled)))
task.spawn(function()
	task.wait(4)
	local player = game:GetService("Players").LocalPlayer
	while true do
		local char = player.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		local seat = hum and hum.SeatPart
		local fps = math.floor(1 / math.max(Stats.FrameTime, 1e-3))
		send(("status team=%s seat=%s wanted=%s job=%s fps=%d"):format(tostring(player:GetAttribute("Team")),
			seat and (seat.Parent and seat.Parent.Name or "?") .. "/" .. seat.Name or "none",
			tostring(player:GetAttribute("Wanted")), tostring(player:GetAttribute("Job")), fps), true)
		task.wait(60)
	end
end)
