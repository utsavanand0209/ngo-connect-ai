#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
from pathlib import Path
from textwrap import fill


def run(cmd):
    subprocess.run(cmd, check=True)


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


def parse_duration_seconds(audio_path: Path) -> float:
    out = subprocess.check_output(["afinfo", str(audio_path)], text=True)
    match = re.search(r"estimated duration:\s*([0-9.]+)\s*sec", out)
    if not match:
        raise RuntimeError(f"Could not parse duration from afinfo for {audio_path}")
    return float(match.group(1))


def srt_ts(seconds: float) -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    hrs = total_ms // 3_600_000
    total_ms %= 3_600_000
    mins = total_ms // 60_000
    total_ms %= 60_000
    secs = total_ms // 1000
    ms = total_ms % 1000
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def safe_slug(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return slug or "scene"


def build_srt(scenes, srt_path: Path):
    lines = []
    for idx, scene in enumerate(scenes, start=1):
        start = scene["audio_start_sec"]
        end = scene["audio_end_sec"]
        text = fill(scene["narration"], width=72)
        lines.append(str(idx))
        lines.append(f"{srt_ts(start)} --> {srt_ts(end)}")
        lines.append(text)
        lines.append("")
    srt_path.parent.mkdir(parents=True, exist_ok=True)
    srt_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Generate scene-wise voiceovers and synced timeline metadata.")
    parser.add_argument(
        "--manifest",
        default="docs/video/scene_manifest.json",
        help="Path to source scene manifest JSON."
    )
    parser.add_argument(
        "--voice",
        default="Samantha",
        help="macOS 'say' voice name."
    )
    parser.add_argument(
        "--rate",
        type=int,
        default=165,
        help="Speech rate for 'say'."
    )
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parents[2]
    manifest_path = root_dir / args.manifest
    source = read_json(manifest_path)
    scenes = source.get("scenes", [])
    if not scenes:
        raise RuntimeError("No scenes found in manifest")

    out_dir = root_dir / "video-assets" / "scenes"
    out_dir.mkdir(parents=True, exist_ok=True)

    generated_scenes = []
    timeline_cursor = 0.0

    for idx, scene in enumerate(scenes, start=1):
        slug = safe_slug(scene.get("slug") or scene.get("title") or f"scene_{idx:02d}")
        stem = f"{idx:02d}_{slug}"
        txt_file = out_dir / f"{stem}.txt"
        aiff_file = out_dir / f"{stem}.aiff"
        m4a_file = out_dir / f"{stem}.m4a"

        narration = str(scene.get("narration", "")).strip()
        if not narration:
            raise RuntimeError(f"Scene {idx} has empty narration")

        txt_file.write_text(narration + "\n", encoding="utf-8")

        run(["say", "-v", args.voice, "-r", str(args.rate), "-f", str(txt_file), "-o", str(aiff_file)])
        run(["afconvert", str(aiff_file), "-f", "m4af", "-d", "aac", str(m4a_file)])

        duration = parse_duration_seconds(m4a_file)
        settle = float(scene.get("settle_seconds", 1.2))
        hold = float(scene.get("hold_after_seconds", 1.0))

        scene_start = timeline_cursor
        audio_start = scene_start + settle
        audio_end = audio_start + duration
        scene_end = audio_end + hold
        timeline_cursor = scene_end

        generated = dict(scene)
        generated["id"] = idx
        generated["audio_file"] = str(m4a_file.relative_to(root_dir))
        generated["duration_sec"] = round(duration, 3)
        generated["scene_start_sec"] = round(scene_start, 3)
        generated["audio_start_sec"] = round(audio_start, 3)
        generated["audio_end_sec"] = round(audio_end, 3)
        generated["scene_end_sec"] = round(scene_end, 3)
        generated_scenes.append(generated)

    generated_manifest = {
        "project": source.get("project", "NGO Connect"),
        "version": source.get("version", 1),
        "voice": args.voice,
        "rate": args.rate,
        "total_duration_sec": round(timeline_cursor, 3),
        "scenes": generated_scenes
    }

    generated_manifest_path = out_dir / "manifest.generated.json"
    write_json(generated_manifest_path, generated_manifest)

    srt_path = root_dir / "video-assets" / "ngo-connect-synced-captions.srt"
    build_srt(generated_scenes, srt_path)

    print("Generated scene audio + synced metadata:")
    print(f"- {generated_manifest_path}")
    print(f"- {srt_path}")
    print(f"Total timeline duration: {generated_manifest['total_duration_sec']} sec")


if __name__ == "__main__":
    main()
