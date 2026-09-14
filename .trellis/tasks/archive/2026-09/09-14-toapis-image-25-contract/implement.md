# Implementation

1. Correct model-specific ToAPIs request construction and background/reference forwarding.
2. Remove global 4K filtering and automatic ratio substitution; correct shared pixel projection.
3. Extend existing request/dimension checks for both 2.5 models, references, background, count rejection, pixel limits, persistence and UI selection.
4. Run focused checks then `.trellis/verification/check.ps1`; inspect changed UI with mocked APIs where available.
5. Record evidence and status; keep port 3001 untouched until verified changes are committed and activation is authorized.
