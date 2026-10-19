# Design

Shared canvas/video-encoding.ts reads FFMPEG_VIDEO_ENCODER, accepting libx264 (default) and h264_nvenc. CPU callers retain their existing CRF/preset omission or values; NVIDIA uses preset p5/tune hq/VBR/CQ and zero average bitrate. Existing yuv420p/MP4/audio flags remain caller-owned. Advanced admin configuration exposes the explicit selection; only the local ignored environment file enables NVENC.

All H.264 Canvas call sites use this helper; no global rewrite of arbitrary FFmpeg args. Existing cached videos remain valid and reusable. GPU settings apply when a new encoding is needed. Tests stay CPU by default; an opt-in local test path requires actual NVENC and checks codec, duration, geometry and audio. No driver/dependency installation is needed.
