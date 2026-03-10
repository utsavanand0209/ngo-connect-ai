#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_URL="${1:-http://localhost:3000}"

python3 "$ROOT_DIR/scripts/video/generate_scene_voiceovers.py"
python3 "$ROOT_DIR/scripts/video/run_synced_demo.py" --silent --auto --base-url "$BASE_URL"
