# Simple image quality and background controls

## Scope

The user requested both missing controls in one-click production. Quality uses low/medium/high; background uses auto/transparent/opaque. Keep medium quality and auto background for legacy settings. Do not commit, activate port 3001, deploy, or call paid providers.

## Implementation and acceptance

- [x] Add accessible quality/background selects beside dimension controls, with busy/save disabling.
- [x] Extend shared types, workspace normalization, settings audit details and frozen simple-run snapshots; verify save/reload/launch/resume preserves choices.
- [x] Forward background through all three simple-run image paths and existing provider generation/edit adapters; preserve omission for unrelated callers.
- [x] Reject invalid background values and transparent JPEG; explain provider/model support and GPT-only scope in the UI.
- [x] Expand deterministic settings, request body, multipart and mocked 1440px/390px browser coverage; run the complete offline baseline.
- [x] Record verification evidence; leave the local candidate unchanged pending commit/activation authorization.

## Risks

Live provider/model support for transparent backgrounds is pending confirmation. Offline request fixtures do not establish live acceptance. No silent background fallback or output post-processing is added.
