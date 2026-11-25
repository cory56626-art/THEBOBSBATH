-- Reports this client's script errors/warnings and animation status to the server (see Diagnostics.server).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local LogService = game:GetService("LogService")
local UserInputService = game:GetService("UserInputService")
local Stats = game:GetService("Stats")

local remote = ReplicatedStorage:WaitForChild("ClientDiag") :: RemoteEvent
local sent = 0
local function send(msg: string)
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
	task.wait(8)
	while true do
		local status = "animator: not running"
		local f = _G.AnimatorStatus
		if type(f) == "function" then
			local ok, s = pcall(f)
			status = "animator: " .. tostring(s)
		end
		local fps = math.floor(1 / math.max(Stats.FrameTime, 1e-3))
		send(status .. (" fps=%d"):format(fps))
		task.wait(45)
	end
end)
