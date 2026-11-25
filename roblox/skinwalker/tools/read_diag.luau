-- Read the play-session diagnostics (run with tools/run_luau.py tools/read_diag.luau)
local store = game:GetService("DataStoreService"):GetDataStore("Diagnostics")
local out = {}
for back = 1, 0, -1 do
	local key = os.date("!%Y%m%d", os.time() - back * 86400)
	local ok, list = pcall(function()
		return store:GetAsync(key)
	end)
	if ok and type(list) == "table" then
		for _, e in list do
			table.insert(out, ("%s %s [%s] %s: %s"):format(key, os.date("!%H:%M:%S", e.t), e.s or "?", e.src, e.m))
		end
	end
end
if #out == 0 then
	return "no diagnostics yet"
end
local first = math.max(1, #out - 150)
return table.concat(out, "\n", first)
