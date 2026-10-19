# Local NVIDIA video encoding

User requests GPU acceleration for local Canvas FFmpeg video nodes. The host has RTX 5880 Ada and a real h264_nvenc smoke encode succeeds.

- Add explicit CPU/NVIDIA encoder selection; configure this host for NVIDIA without changing other environments' default.
- Apply shared H.264 settings to video reconstruction, slideshow, masking, layer composition and subtitle burning. Preserve dimensions/audio/format and existing concurrency.
- Leave CPU filters/decoding/audio unchanged; do not claim full GPU processing. Unsupported configured hardware fails explicitly without silent CPU retry.
- Verify CPU baseline and real isolated NVIDIA output before committing and activating the clean local candidate. No user batch/provider/publishing test calls.
