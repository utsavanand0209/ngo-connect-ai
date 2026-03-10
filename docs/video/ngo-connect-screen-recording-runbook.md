# NGO Connect Screen Recording Runbook (Synced)

This workflow fixes narration/action mismatch by using scene-based audio timing instead of hardcoded sleep durations.

## 1. Start backend and frontend
Terminal 1:

```bash
cd backend
npm install
npm run dev
```

Terminal 2:

```bash
cd frontend
npm install
npm start
```

If needed, seed first:

```bash
cd backend
npm run seed
```

## 2. Generate synced scene voiceovers
From repo root:

```bash
python3 scripts/video/generate_scene_voiceovers.py
```

This creates:
- `video-assets/scenes/manifest.generated.json`
- `video-assets/scenes/*.m4a` (one audio per scene)
- `video-assets/ngo-connect-synced-captions.srt`

## 3. Record with synced scene assistant (recommended)
1. Start screen recording on macOS (`Shift + Command + 5`).
2. Run the guided assistant:

```bash
python3 scripts/video/run_synced_demo.py --base-url http://localhost:3000
```

The assistant:
- opens the correct route for each scene,
- plays the matching narration clip,
- waits for you before moving to the next scene.

This is the key fix for sync.

Backward-compatible command (now routed to synced engine):

```bash
bash scripts/video/play_voiceover_and_open_scenes.sh http://localhost:3000
```

### Demo credentials
- User: `rahul@example.com` / `password123`
- NGO: `akshayapatra@ngo.org` / `password123`
- Admin: `admin@ngoconnect.org` / `password123`

## 4. Build one master synced audio track
After generating scene voiceovers:

```bash
python3 scripts/video/build_master_audio.py
```

Output:
- `video-assets/ngo-connect-master-synced.m4a`

## 5. Export LinkedIn-ready final video
After your raw screen recording is saved (example: `~/Desktop/ngo-raw.mp4`):

```bash
bash scripts/video/export_linkedin_ready.sh ~/Desktop/ngo-raw.mp4
```

Output:
- `video-assets/ngo-connect-linkedin-final.mp4`

This export:
- replaces scratch audio with synced master narration,
- normalizes loudness for social playback,
- burns synced captions (if `video-assets/ngo-connect-synced-captions.srt` exists),
- writes web-faststart MP4 for LinkedIn uploads.

## 6. Optional fast autopilot mode
If you want zero prompts:

```bash
python3 scripts/video/run_synced_demo.py --auto --base-url http://localhost:3000
```

Use this only if you can keep up with automatic scene progression.

## Troubleshooting
- If browser does not open: pass app name explicitly.

```bash
python3 scripts/video/run_synced_demo.py --browser "Google Chrome"
```

- If scene audio is missing: regenerate.

```bash
python3 scripts/video/generate_scene_voiceovers.py
```

- If export says ffmpeg missing:

```bash
brew install ffmpeg
```
