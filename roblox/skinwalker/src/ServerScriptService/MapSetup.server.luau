-- Draws the hospital's signs at runtime (each "Sign" part carries its text and colour in values).
for _, p in workspace:GetDescendants() do
	if p:IsA("BasePart") and p.Name == "Sign" then
		local text = p:FindFirstChild("Text")
		local color = p:FindFirstChild("Color")
		local gui = Instance.new("SurfaceGui")
		gui.Face = Enum.NormalId.Front
		gui.CanvasSize = Vector2.new(360, 84)
		gui.LightInfluence = 0.7
		gui.Brightness = 1.4
		local label = Instance.new("TextLabel")
		label.Size = UDim2.fromScale(1, 1)
		label.BackgroundTransparency = 1
		label.Text = if text and text:IsA("StringValue") then text.Value else ""
		label.TextScaled = true
		label.Font = Enum.Font.SpecialElite
		label.TextColor3 = if color and color:IsA("Color3Value") then color.Value else Color3.new(0.9, 0.9, 0.85)
		label.Parent = gui
		gui.Parent = p
	end
end
