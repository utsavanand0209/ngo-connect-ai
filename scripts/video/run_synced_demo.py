#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def open_route(browser: str, url: str):
    script = f'''
      tell application "{browser}"
        activate
        if (count of windows) = 0 then
          make new window
        end if
        set URL of active tab of front window to "{url}"
      end tell
    '''
    subprocess.run(["osascript", "-e", script], check=True)


def play_audio(path: Path):
    subprocess.run(["afplay", str(path)], check=True)


def prompt(msg: str):
    try:
        return input(msg)
    except EOFError:
        return ""


def main():
    parser = argparse.ArgumentParser(description="Run scene-by-scene synced NGO Connect demo playback.")
    parser.add_argument("--base-url", default="http://localhost:3000", help="Frontend base URL")
    parser.add_argument("--browser", default="Google Chrome", help="macOS app name for browser")
    parser.add_argument(
        "--manifest",
        default="video-assets/scenes/manifest.generated.json",
        help="Generated scene manifest path"
    )
    parser.add_argument("--start-scene", type=int, default=1, help="1-based scene index to start from")
    parser.add_argument("--auto", action="store_true", help="Auto-advance without manual checkpoints")
    parser.add_argument("--silent", action="store_true", help="Do not play narration audio")
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parents[2]
    manifest_path = root_dir / args.manifest

    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}")
        print("Run: python3 scripts/video/generate_scene_voiceovers.py")
        sys.exit(1)

    data = read_json(manifest_path)
    scenes = data.get("scenes", [])
    if not scenes:
        print("No scenes found in generated manifest.")
        sys.exit(1)

    print(f"Project: {data.get('project', 'NGO Connect')}")
    print(f"Scenes: {len(scenes)}")
    print(f"Mode: {'AUTO' if args.auto else 'MANUAL'}")
    print(f"Audio: {'OFF' if args.silent else 'ON'}")
    print("")

    for scene in scenes:
        idx = int(scene.get("id", 0))
        if idx < args.start_scene:
            continue

        title = scene.get("title", f"Scene {idx}")
        route = scene.get("route", "/")
        url = f"{args.base_url.rstrip('/')}{route}"
        settle = float(scene.get("settle_seconds", 1.2))
        hold = float(scene.get("hold_after_seconds", 1.0))
        action = scene.get("action", "")
        narration = scene.get("narration", "")

        print("=" * 72)
        print(f"Scene {idx}: {title}")
        print(f"Route: {url}")
        print(f"Role: {scene.get('role', 'n/a')}")
        if action:
            print(f"Action: {action}")
        print(f"Narration: {narration}")
        print("=" * 72)

        if not args.auto:
            prompt("Press Enter to start this scene (or Ctrl+C to stop): ")

        try:
            open_route(args.browser, url)
        except subprocess.CalledProcessError:
            print("Failed to open browser route. Check browser name and URL.")
            sys.exit(1)

        time.sleep(settle)

        audio_path = root_dir / scene.get("audio_file", "")
        if args.silent:
            time.sleep(float(scene.get("duration_sec", 0)))
        else:
            if not audio_path.exists():
                print(f"Missing scene audio: {audio_path}")
                print("Run: python3 scripts/video/generate_scene_voiceovers.py")
                sys.exit(1)
            play_audio(audio_path)

        if args.auto:
            time.sleep(hold)
            continue

        while True:
            cmd = prompt("Enter=next | r=replay narration | q=quit: ").strip().lower()
            if cmd == "q":
                print("Stopped by user.")
                return
            if cmd == "r":
                if not args.silent:
                    play_audio(audio_path)
                continue
            break

    print("\nSynced demo flow complete.")


if __name__ == "__main__":
    main()
