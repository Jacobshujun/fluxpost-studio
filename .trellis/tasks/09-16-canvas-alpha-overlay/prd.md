# Canvas Alpha Image Overlay

User approved implementation, Trellis tracking, verification, commits and local
port-3001 activation. Production deployment is excluded.

- Connect one static transparent PNG through a dedicated mask-image input.
- Add an image template region defaulting to full frame, full opacity and duration.
- Preserve transparent and semitransparent pixels, source dimensions, duration and audio.
- Reuse one template across input videos; reject missing/multiple/corrupt templates.
- Preserve legacy URL regions and workflow save/export/import behavior.
- Acceptance: real FFmpeg pixel checks, desktop/mobile browser checks and full baseline.
