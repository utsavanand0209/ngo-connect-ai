#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def run(cmd):
    subprocess.run(cmd, check=True)


def main():
    parser = argparse.ArgumentParser(description="Build one synced master voiceover track from scene timeline.")
    parser.add_argument(
        "--manifest",
        default="video-assets/scenes/manifest.generated.json",
        help="Generated manifest path"
    )
    parser.add_argument(
        "--output",
        default="video-assets/ngo-connect-master-synced.m4a",
        help="Output audio path"
    )
    args = parser.parse_args()

    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required. Install with: brew install ffmpeg")

    root_dir = Path(__file__).resolve().parents[2]
    manifest_path = root_dir / args.manifest
    output_path = root_dir / args.output

    data = read_json(manifest_path)
    scenes = data.get("scenes", [])
    if not scenes:
        raise RuntimeError("No scenes found in manifest")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="ngo_video_audio_") as tmp:
        tmp_path = Path(tmp)
        concat_list = tmp_path / "concat.txt"
        segments = []

        silence_idx = 0

        def add_silence(seconds: float):
            nonlocal silence_idx
            if seconds <= 0:
                return
            silence_idx += 1
            silence_file = tmp_path / f"silence_{silence_idx:03d}.m4a"
            run([
                "ffmpeg", "-y",
                "-loglevel", "error",
                "-f", "lavfi",
                "-t", f"{seconds}",
                "-i", "anullsrc=r=22050:cl=mono",
                "-c:a", "aac",
                "-b:a", "128k",
                str(silence_file)
            ])
            segments.append(silence_file)

        for scene in scenes:
            settle = float(scene.get("settle_seconds", 1.2))
            hold = float(scene.get("hold_after_seconds", 1.0))
            audio_file = root_dir / scene.get("audio_file", "")
            if not audio_file.exists():
                raise RuntimeError(f"Missing scene audio: {audio_file}")

            add_silence(settle)
            segments.append(audio_file)
            add_silence(hold)

        concat_lines = []
        for path in segments:
            escaped = str(path).replace("'", "'\\''")
            concat_lines.append(f"file '{escaped}'")
        concat_list.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")

        run([
            "ffmpeg", "-y",
            "-loglevel", "error",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_list),
            "-c:a", "aac",
            "-b:a", "160k",
            str(output_path)
        ])

    print(f"Master synced audio created: {output_path}")


if __name__ == "__main__":
    main()
