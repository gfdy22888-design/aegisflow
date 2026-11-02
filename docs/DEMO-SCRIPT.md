# AegisFlow — final demo timeline

The final video is 130 seconds at 1920×1080, 30 fps, H.264/AAC. All traffic,
latency and offload are synthetic data from the running local engine. English
narration is generated with Microsoft Zira. Exact narration and caption timings
are in `docs/demo/narration.json` and the accompanying SRT/VTT files.

| Time | Screen / action | Point |
|---|---|---|
| 0:00–0:24 | Fresh baseline; no previous attack alerts | Responders need decisions, not just graphs |
| 0:24–0:44 | Launch HTTP Flood (L7) | Multi-signal classification detects the flood |
| 0:44–1:10 | Stop; arm automatic response at 0:46; relaunch at 0:47 | Automatic path rate limit, 30-rps attacker cap, origin offload and audit |
| 1:10–1:35 | Stop and clear; launch flash crowd at 1:13 | High diversity; automatic response armed; zero mitigations |
| 1:35–1:49 | AWS architecture / implementation status | Distinguish working local features and prototype cloud integration |
| 1:49–1:59 | Exact adapter source excerpts | Rate payload, LockToken and existing-rule preservation |
| 1:59–2:10 | Return to console | Try the browser demo, replay and code |

Recorded snapshots and visual evidence: `docs/demo/verification/`.
Values vary between runs because traffic generation includes random jitter.
No live AWS account or production measurements are represented.

## Recreate authoring outputs

The app itself has no dependencies. Video authoring separately needs Playwright
with Chromium, ffmpeg with libx264, and Windows System.Speech / Microsoft Zira.
Keep those tools outside the runtime application dependencies.

```powershell
$env:RECORD_TOOLS_DIR = 'path-to-tooling-directory-containing-node_modules'
node scripts/record-demo.js
./scripts/narrate.ps1
$env:FFMPEG_PATH = 'path-to-ffmpeg.exe'
node scripts/finish-video.js
node scripts/verify-media.js
node scripts/build-static.js
node scripts/verify-static.js
```

The recorder starts and stops its own local server on port 8188. It fails if the
expected attack, automatic mitigation or benign-restraint behavior is absent.
Original silent and obsolete recordings were preserved locally in the ignored
`.delivery-work/archive/` folder; only the final MP4 belongs in the submission.
