# Verification — 2026-09-17

## Passed

- `node .trellis/verification/canvas_layer_compose_check.mjs`: real Sharp pixels,
  contain/cover/crop, negative-edge clipping, RGBA alpha, exact PNG size, actual-byte
  cache invalidation, missing/changed inputs and failed-source cleanup. Real FFmpeg
  checks two video layers, hold/loop/hide, audio waveform/silence, no-audio sources,
  custom/longest duration, static alpha overlays and exposed background pixels.
- Registry, simultaneous typed inputs, unfinished drafts, serialization,
  workflow export/import and clipboard copy preserve composition configuration.
- Full baseline via `TRELLIS_SMOKE_PORT=45680` and the documented `check.ps1`:
  all domain checks, lint (0 errors, 17 existing warnings), TypeScript, build,
  HTTP smoke including inspect-route authentication, and isolated SQLite passed.
- Latest production build: `BROWSER_BASE_URL=http://127.0.0.1:45679` and
  `python .trellis/verification/canvas_layer_compose_browser_check.py` passed at
  1440 and 390 px. Pointer movement, crop, proportional numeric resizing,
  undo/redo, duplicate/delete, lock, video controls/playback, apply/cancel,
  refresh persistence, focus/Escape and no horizontal overflow were checked.
- Screenshots inspected; local files remain under ignored `test-artifacts/`.

## Delivery and boundaries

Commit the verified implementation, then activate through `npm run local` and check
`/api/version` equals current full HEAD. User authorized local activation, not remote
publishing. Operator review remains pending in the feature state machine.

No paid provider, Feishu, TOS write, real user workflow or production data was used
by acceptance fixtures. The old occupied port 45678 was not treated as valid final
build evidence; final baseline used the vacant 45680 port and browser used 45679.
Existing tests' isolated module lists were extended for the new contract imports.
