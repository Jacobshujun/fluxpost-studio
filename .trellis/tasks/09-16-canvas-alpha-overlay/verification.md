# Verification

## Completed

- `node .trellis/verification/canvas_media_mask_check.mjs`: actual FFmpeg verifies
  alpha=0/128/255 at first/middle/last frames, opacity multiplication, position/size,
  time window, first audio tone, batch reuse, URL legacy mode, solid/blur/mosaic,
  itemOverrides, missing/multiple/corrupt input, cleanup and changed-byte cache keys.
- `node .trellis/verification/canvas_workflows_check.mjs`: input ports, missing-port
  readiness, incomplete draft persistence, save/export/import and duplicate-edge rejection.
- `BROWSER_BASE_URL=http://127.0.0.1:45680 python .trellis/verification/canvas_media_mask_browser_check.py`:
  mocked Chrome 1440x960/390x960 passes desktop pointer wiring, full-frame defaults,
  source switching, opacity/timing persistence, refresh, video playback and layout.
  Mobile uses preconnected edges because existing Canvas disables mobile connections.
  Screenshots under ignored test-artifacts/canvas-mask-{editor,result}-{width}.png.
- Final baseline: `TRELLIS_SMOKE_PORT=45681 powershell -NoProfile -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`:
  exit 0; all domain checks, lint (0 errors, 17 existing warnings), TypeScript,
  Next build, HTTP smoke and SQLite passed. Log: .tmp-mask-alpha-baseline-final.log.
- Reviewed changed UI, type normalization, readiness, executor, materialization,
  content-addressed template caching, cleanup and backward compatibility.

## Environment Notes

- Initial smoke port 45678 was already occupied; it was left untouched. Final
  baseline used free port 45681, browser used our worker-disabled server on 45680,
  which was stopped after testing.
- Adding verification context exceeded the 70 KB gate by 211 bytes. Condensed
  duplicated historical mask status entries and linked the dedicated contract;
  the unchanged budget gate then passed.
- No paid providers, TOS writes, Feishu writes, remote push or production deployment.

## Local Activation

Authorized by the accepted plan; run after verified commits from the clean primary
worktree using npm run local. Final runtime identity is recorded by the ignored
.fluxpost-local-candidate.json and GET /api/version.
