#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INPUT_FILE="$ROOT_DIR/docs/video/ngo-connect-voiceover.txt"
OUT_DIR="$ROOT_DIR/video-assets"
AIFF_OUT="$OUT_DIR/ngo-connect-voiceover.aiff"
M4A_OUT="$OUT_DIR/ngo-connect-voiceover.m4a"
VOICE="${VOICE:-Samantha}"
RATE="${RATE:-175}"

if ! command -v say >/dev/null 2>&1; then
  echo "Error: 'say' is not available on this machine."
  exit 1
fi

mkdir -p "$OUT_DIR"

say -v "$VOICE" -r "$RATE" -f "$INPUT_FILE" -o "$AIFF_OUT"
afconvert "$AIFF_OUT" -f m4af -d aac "$M4A_OUT"

echo "Voiceover generated:"
echo "- $AIFF_OUT"
echo "- $M4A_OUT"
