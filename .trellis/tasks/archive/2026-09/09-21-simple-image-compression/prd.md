# Simple production image compression

Reuse Canvas image processing in one-click production.

- Controls: quality/percent/size, JPEG/PNG/WebP, resize, disable.
- Default JPEG quality 90/original; transparent defaults WebP.
- Settings freeze into runs; old runs without field skip processing.
- Source, viral, original save processed URLs; failure blocks delivery.

## Acceptance

- [x] Real encoders, settings persistence, frozen resume, three paths and failures pass offline.
- [x] Desktop/mobile controls, disabled state, save/reload and launch payload pass.
- [x] Full baseline, lint, TypeScript, build, HTTP and SQLite checks pass.
