# Fix Canvas Subtitle UTF-8 Encoding

## Goal

Make the infinite Canvas video-subtitle node preserve recognized Chinese and other non-ASCII text on Windows.

## Background

- `scripts/canvas/faster_whisper_subtitles.py` writes recognizer JSON to `sys.stdout` with `ensure_ascii=False`.
- On the confirmed Windows runtime, redirected Python stdout uses GBK. A privacy-safe probe emitted `中文字幕测试` as GBK bytes while `src/lib/canvas/local-subtitle-timeline.ts` decoded child-process stdout as UTF-8, reproducing mojibake.
- Subtitle timelines are cached by protocol version. Existing v3 cache entries may already contain corrupted text and must not be reused after the transport fix.

## Requirements

- Define UTF-8 explicitly at the Python recognizer stdout boundary before writing JSON, independent of the Windows active code page.
- Keep Node child-process JSON decoding UTF-8 and cover the actual Python process boundary with a deterministic non-ASCII verification case.
- Upgrade the Canvas subtitle timeline protocol so v3 cached timelines and encoded-output identities are not reused.
- Preserve existing local Faster Whisper settings, timing normalization, sanitized failures, owner-scoped cache behavior, ASS rendering, and crawl/simple-run Ark transcription behavior.

## Acceptance Criteria

- [x] A deterministic Windows-capable recognizer probe round-trips Chinese JSON text through the Python-to-Node process boundary without replacement characters or mojibake.
- [x] The Canvas subtitle protocol is v4, and the cache-identity check proves v3 does not match v4.
- [x] Focused Canvas subtitle verification, TypeScript, lint, production build, and the complete offline Trellis baseline pass.
- [ ] The fix is committed before the clean port-3001 candidate is activated; `/api/version` matches the activated commit and `/canvas` is healthy.

## Out Of Scope

- Changing recognition accuracy, language detection, models, subtitle timing/style, historical generated MP4 files, or production deployment.
