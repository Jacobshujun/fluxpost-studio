# Canvas local H.264 encoding

`canvas/video-encoding.ts` owns H.264 output args for slideshow, video reconstruction, video masks, layer composition and subtitle burning. `FFMPEG_VIDEO_ENCODER` accepts `libx264` (default/empty) or `h264_nvenc`. Admin runtime config persists this selection; the shared policy reads the current process environment on each encode. Existing cached outputs remain reusable.

CPU preserves each caller's original preset/CRF omission or values. NVIDIA uses p5, hq, VBR, CQ (caller's CRF number or 23), and zero average bitrate. CQ/CRF are different quality scales, not byte/quality equivalence. Caller-owned H.264 profile, yuv420p, dimensions, audio and MP4 flags remain intact. Decode/filters/audio remain CPU; NVENC accelerates output encoding only. Keep localVideo concurrency unchanged.

No automatic hardware probing, downloads, driver installation or silent CPU retry. Invalid selection throws; hardware/driver/dimension failure is an explicit FFmpeg error. Keep the first error lines so the initialization cause survives the trailing shutdown errors. On the tested RTX 5880 Ada, 100x100/120x80/144x144 H.264 are below hardware minimum dimensions; 160x120 and standard video output sizes pass. Choose CPU explicitly for unsupported tiny output dimensions.

Baseline `canvas_video_encoding_check.mjs` verifies real filtered CPU H.264 output, geometry, duration, AAC, encoder receipt and decode plus configuration validation. Opt-in local hardware checks (temporary fixtures only):

```powershell
node .trellis/verification/canvas_video_encoding_check.mjs --nvenc
node .trellis/verification/canvas_layer_compose_check.mjs --nvenc
$env:FFMPEG_VIDEO_ENCODER = "h264_nvenc"
node .trellis/verification/canvas_video_reconstruction_check.mjs
Remove-Item Env:FFMPEG_VIDEO_ENCODER
```

Default baseline never requires a GPU. The opt-in composition check confirms actual NVENC receipts/audio for layer composition/slideshow and explicit failure on hardware-incompatible small output. Existing mask/subtitle checks remain CPU regression coverage. No remote production GPU support is assumed or enabled.
