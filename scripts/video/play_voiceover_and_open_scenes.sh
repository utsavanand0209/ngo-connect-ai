#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_URL="${1:-http://localhost:3000}"
AUTO_MODE="${AUTO_MODE:-0}"

python3 "$ROOT_DIR/scripts/video/generate_scene_voiceovers.py"

if [[ "$AUTO_MODE" == "1" ]]; then
  python3 "$ROOT_DIR/scripts/video/run_synced_demo.py" --auto --base-url "$BASE_URL"
else
  python3 "$ROOT_DIR/scripts/video/run_synced_demo.py" --base-url "$BASE_URL"
fi
