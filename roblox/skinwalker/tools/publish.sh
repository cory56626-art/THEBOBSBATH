#!/usr/bin/env bash
# Publish build/place.rbxl to the live game through the Roblox Open Cloud Assets API.
# The API key is injected by the session's network proxy (x-api-key header); it is never stored here.
#   PUBLISHED=false ./tools/publish.sh   -> save a new version without publishing it
set -euo pipefail
PLACE_ID="${PLACE_ID:-11697807657}"
PUBLISHED="${PUBLISHED:-true}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:-$HERE/build/place.rbxl}"

resp=$(curl -sS -X PATCH "https://apis.roblox.com/assets/v1/assets/${PLACE_ID}" \
  --form-string "request={\"assetId\": ${PLACE_ID}, \"assetType\": \"Place\", \"published\": ${PUBLISHED}}" \
  --form "fileContent=@${FILE};type=${FILETYPE:-application/octet-stream}")
echo "upload: $resp"
op=$(printf '%s' "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("path",""))' 2>/dev/null || true)
[ -z "$op" ] && exit 1

for _ in $(seq 1 30); do
  sleep 2
  status=$(curl -sS "https://apis.roblox.com/assets/v1/${op}")
  if printf '%s' "$status" | grep -q '"done": *true'; then
    echo "result: $status"
    printf '%s' "$status" | grep -q '"error"' && exit 1
    exit 0
  fi
done
echo "still processing: $status"
