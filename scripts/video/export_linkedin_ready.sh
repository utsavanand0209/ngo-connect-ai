#!/usr/bin/env bash
set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg not found. Install with: brew install ffmpeg"
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/video/export_linkedin_ready.sh <screen_recording.mp4> [output.mp4]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INPUT_VIDEO="$1"
OUTPUT_VIDEO="${2:-$ROOT_DIR/video-assets/ngo-connect-linkedin-final.mp4}"
MASTER_AUDIO="$ROOT_DIR/video-assets/ngo-connect-master-synced.m4a"
CAPTIONS="$ROOT_DIR/video-assets/ngo-connect-synced-captions.srt"

if [[ ! -f "$INPUT_VIDEO" ]]; then
  echo "Input recording not found: $INPUT_VIDEO"
  exit 1
fi

if [[ ! -f "$MASTER_AUDIO" ]]; then
  echo "Master audio not found: $MASTER_AUDIO"
  echo "Run: python3 scripts/video/build_master_audio.py"
  exit 1
fi

CAPTIONS_FILTER=""
if [[ -f "$CAPTIONS" ]] && ffmpeg -hide_banner -filters 2>/dev/null | grep -q " subtitles "; then
  ESCAPED_CAPTIONS="${CAPTIONS//\\/\\\\}"
  ESCAPED_CAPTIONS="${ESCAPED_CAPTIONS//:/\\:}"
  ESCAPED_CAPTIONS="${ESCAPED_CAPTIONS//\'/\\\'}"
  CAPTIONS_FILTER=",subtitles=filename='${ESCAPED_CAPTIONS}'"
elif [[ -f "$CAPTIONS" ]]; then
  echo "Note: ffmpeg subtitles filter is unavailable in this build. Exporting without burned captions."
fi

ffmpeg -y \
  -hide_banner -loglevel warning \
  -i "$INPUT_VIDEO" \
  -i "$MASTER_AUDIO" \
  -map 0:v:0 -map 1:a:0 \
  -vf "scale='if(gt(iw,1920),1920,iw)':-2:flags=lanczos,format=yuv420p${CAPTIONS_FILTER}" \
  -r 30 \
  -c:v libx264 -preset medium -crf 20 \
  -c:a aac -b:a 192k -af "loudnorm=I=-16:LRA=11:TP=-1.5" \
  -movflags +faststart \
  -shortest \
  "$OUTPUT_VIDEO"

echo "LinkedIn-ready video exported: $OUTPUT_VIDEO"
