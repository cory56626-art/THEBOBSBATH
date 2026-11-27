local out = {}
local p = Instance.new("Part")
p.Size = Vector3.new(4, 1, 4)
p.Position = Vector3.new(0, 300, 0)
p.Parent = workspace
local y0 = p.Position.Y
local hb = 0
local c = game:GetService("RunService").Heartbeat:Connect(function() hb += 1 end)
local st = 0
local c2 = game:GetService("RunService").Stepped:Connect(function() st += 1 end)
task.wait(2)
table.insert(out, ("y0=%.1f y_after_2s=%.1f heartbeats=%d stepped=%d vel=%s"):format(y0, p.Position.Y, hb, st, tostring(p.AssemblyLinearVelocity)))
-- a LinearVelocity-driven body
local b = Instance.new("Part")
b.Size = Vector3.new(4, 2, 8)
b.Position = Vector3.new(50, 300, 0)
local a = Instance.new("Attachment", b)
local lv = Instance.new("LinearVelocity")
lv.Attachment0 = a
lv.MaxForce = math.huge
lv.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
lv.VectorVelocity = Vector3.new(0, 0, 40)
lv.Parent = b
b.Parent = workspace
task.wait(1)
table.insert(out, ("driven body z after 1s = %.1f"):format(b.Position.Z))
return table.concat(out, "\n")
